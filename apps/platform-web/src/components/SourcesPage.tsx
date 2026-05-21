import { type FormEvent, useState } from 'react';
import { addSource, listSources, removeSource, restoreBuiltinSources, updateSource, type SourceItem } from '../api/client';
import { Badge, PageHeader } from './shared';
import { EmptyState } from './EmptyState';

export function SourcesPage({
  sources,
  onSourcesChange,
}: {
  sources: SourceItem[];
  onSourcesChange: (sources: SourceItem[]) => void;
}) {
  const [form, setForm] = useState({
    name: '',
    label: '',
    description: '',
    url: '',
    branch: 'main',
    skillsDirectory: 'skills/',
    publishEnabled: true,
  });
  const [status, setStatus] = useState<'idle' | 'saving' | 'error'>('idle');
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null);
  const enabledCount = sources.filter((source) => source.enabled).length;

  async function refreshSources() {
    setStatus('saving');
    try {
      const result = await listSources();
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function restoreSources() {
    setStatus('saving');
    try {
      const result = await restoreBuiltinSources();
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function submitSource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim()) return;
    setStatus('saving');
    try {
      const result = await addSource({
        name: form.name.trim(),
        label: form.label.trim() || form.name.trim(),
        description: form.description.trim() || 'Custom platform skill source.',
        url: form.url.trim(),
        branch: form.branch.trim() || 'main',
        skillsDirectory: form.skillsDirectory.trim() || 'skills/',
        publishEnabled: form.publishEnabled && Boolean(form.url.trim()),
      });
      onSourcesChange(result.sources);
      setForm({
        name: '',
        label: '',
        description: '',
        url: '',
        branch: 'main',
        skillsDirectory: 'skills/',
        publishEnabled: true,
      });
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function toggleSource(source: SourceItem) {
    setStatus('saving');
    try {
      const result = await updateSource(source.name, { enabled: !source.enabled });
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function deleteSource(source: SourceItem) {
    setStatus('saving');
    try {
      const result = await removeSource(source.name);
      onSourcesChange(result.sources);
      setConfirmDeleteSource(null);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function togglePublish(source: SourceItem) {
    setStatus('saving');
    try {
      const result = await updateSource(source.name, { publishEnabled: !source.publishEnabled });
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  async function toggleMirror(source: SourceItem) {
    if (!source.domesticMirror) return;
    setStatus('saving');
    try {
      const result = await updateSource(source.name, {
        domesticMirror: {
          url: source.domesticMirror.url,
          enabled: !source.domesticMirror.enabled,
        },
      });
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }

  return (
    <div className="page source-page">
      <PageHeader
        eyebrow="Sources"
        title="源管理"
        description="维护市场来源、Git 地址和发布目标。"
        actions={<><button type="button" disabled={status === 'saving'} onClick={restoreSources}>恢复内置源</button><button className="primary" type="button" disabled={status === 'saving'} onClick={refreshSources}>刷新源</button></>}
      />
      <section className="source-layout">
        <form className="form-card source-form" onSubmit={submitSource}>
          <h2>添加 Git 源</h2>
          <label><span>源标识</span><input value={form.name} placeholder="team-private" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>显示名称</span><input value={form.label} placeholder="团队私有源" onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} /></label>
          <label><span>Git 地址</span><input value={form.url} placeholder="git@git.company.com:ai/team-skills.git" onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} /></label>
          <div className="form-grid"><label><span>分支</span><input value={form.branch} placeholder="main" onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))} /></label><label><span>技能目录</span><input value={form.skillsDirectory} placeholder="skills/" onChange={(event) => setForm((current) => ({ ...current, skillsDirectory: event.target.value }))} /></label></div>
          <label className="check-field"><input type="checkbox" checked={form.publishEnabled} onChange={(event) => setForm((current) => ({ ...current, publishEnabled: event.target.checked }))} /><span>作为审核通过后的发布目标</span></label>
          <label><span>描述</span><textarea value={form.description} placeholder="说明这个源适合哪些技能包。" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <button className="primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? '保存中...' : '添加源'}</button>
          {status === 'error' ? <EmptyState type="error" title="保存失败" description="源配置保存失败，请检查名称是否重复或后端是否可用。" ariaLabel="源配置错误" /> : null}
        </form>
        <section className="source-list-panel">
          {sources.map((source) => {
            const isLastEnabled = source.enabled && enabledCount <= 1;
            const cannotDelete = source.default || isLastEnabled;
            const confirming = confirmDeleteSource === source.name;
            return (
              <article className="source-row" key={source.name}>
                <div>
                  <strong>{source.label}</strong>
                  <p>{source.description}</p>
                  <code>{source.name}</code>
                  {source.url ? <small>{source.url} · {source.branch || 'main'} · {source.skillsDirectory || 'skills/'}</small> : null}
                  {source.effectiveUrl && source.effectiveUrl !== source.url ? <small>当前使用：{source.effectiveUrl}</small> : null}
                </div>
                <div className="source-actions">
                  <Badge status={source.default ? '默认源' : source.builtin ? '内置源' : '自定义源'} />
                  <Badge status={source.enabled ? '启用' : '停用'} />
                  {source.domesticMirror ? <Badge status={source.domesticMirror.enabled ? '镜像开启' : '镜像关闭'} /> : null}
                  {source.publishEnabled ? <Badge status="发布目标" /> : null}
                  <button type="button" disabled={status === 'saving' || !source.url} onClick={() => togglePublish(source)}>{source.publishEnabled ? '取消发布' : '设为发布'}</button>
                  <button type="button" disabled={status === 'saving' || isLastEnabled} onClick={() => toggleSource(source)}>{source.enabled ? '停用' : '启用'}</button>
                  {source.domesticMirror ? <button type="button" disabled={status === 'saving'} onClick={() => toggleMirror(source)}>{source.domesticMirror.enabled ? '关闭镜像' : '启用镜像'}</button> : null}
                  <button className="danger" type="button" disabled={status === 'saving' || cannotDelete} onClick={() => setConfirmDeleteSource(confirming ? null : source.name)}>删除</button>
                </div>
                {confirming ? (
                  <div className="confirm-strip source-confirm-strip">
                    <span>确认删除 {source.label}（{source.name}）？</span>
                    <button className="danger" type="button" disabled={status === 'saving'} onClick={() => deleteSource(source)}>删除</button>
                    <button type="button" disabled={status === 'saving'} onClick={() => setConfirmDeleteSource(null)}>取消</button>
                  </div>
                ) : null}
              </article>
            );
          })}
        </section>
      </section>
    </div>
  );
}
