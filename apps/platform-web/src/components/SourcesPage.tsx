import { type FormEvent, useMemo, useState } from 'react';
import { addSource, listSources, removeSource, restoreBuiltinSources, updateSource, type SourceItem } from '../api/client';
import { Badge, PageHeader } from './shared';

function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

function replaceAllText(value: string, from: string, to: string): string {
  return value.split(from).join(to);
}

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
  const [errorMessage, setErrorMessage] = useState('');
  const [replaceRule, setReplaceRule] = useState({
    from: 'https://github.com/',
    to: 'git@github.com:',
  });
  const [replaceResult, setReplaceResult] = useState('');
  const [confirmDeleteSource, setConfirmDeleteSource] = useState<string | null>(null);
  const enabledCount = sources.filter((source) => source.enabled).length;
  const replacementPreview = useMemo(() => {
    const from = replaceRule.from.trim();
    const to = replaceRule.to.trim();
    if (!from) return [];

    return sources.flatMap((source) => {
      const nextUrl = source.url?.includes(from)
        ? replaceAllText(source.url, from, to)
        : source.url;
      const nextMirrorUrl = source.domesticMirror?.url.includes(from)
        ? replaceAllText(source.domesticMirror.url, from, to)
        : source.domesticMirror?.url;

      if (nextUrl === source.url && nextMirrorUrl === source.domesticMirror?.url) {
        return [];
      }

      return [{
        source,
        nextUrl,
        nextMirrorUrl,
        changedUpstream: nextUrl !== source.url,
        changedMirror: nextMirrorUrl !== source.domesticMirror?.url,
      }];
    });
  }, [replaceRule.from, replaceRule.to, sources]);

  function showError(error: unknown, fallback: string) {
    setErrorMessage(errorText(error, fallback));
    setStatus('error');
  }

  function clearError() {
    setErrorMessage('');
    setStatus('idle');
  }

  async function refreshSources() {
    setStatus('saving');
    try {
      const result = await listSources();
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch (error) {
      showError(error, '源列表刷新失败，请检查平台 API 是否可用。');
    }
  }

  async function restoreSources() {
    setStatus('saving');
    try {
      const result = await restoreBuiltinSources();
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch (error) {
      showError(error, '内置源恢复失败，请检查平台 API 是否可用。');
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
      setReplaceResult('');
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
    } catch (error) {
      showError(error, '源配置保存失败，请检查名称是否重复或后端是否可用。');
    }
  }

  async function toggleSource(source: SourceItem) {
    setStatus('saving');
    try {
      const result = await updateSource(source.name, { enabled: !source.enabled });
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch (error) {
      showError(error, '源启停保存失败，请稍后重试。');
    }
  }

  async function deleteSource(source: SourceItem) {
    setStatus('saving');
    try {
      const result = await removeSource(source.name);
      onSourcesChange(result.sources);
      setConfirmDeleteSource(null);
      setStatus('idle');
    } catch (error) {
      showError(error, '源删除失败，请稍后重试。');
    }
  }

  async function togglePublish(source: SourceItem) {
    setStatus('saving');
    try {
      const result = await updateSource(source.name, { publishEnabled: !source.publishEnabled });
      onSourcesChange(result.sources);
      setStatus('idle');
    } catch (error) {
      showError(error, '发布目标保存失败，请稍后重试。');
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
    } catch (error) {
      showError(error, '镜像状态保存失败，请稍后重试。');
    }
  }

  async function applySourceUrlReplacement() {
    const from = replaceRule.from.trim();
    if (!from || replacementPreview.length === 0) return;

    setStatus('saving');
    try {
      let nextSources = sources;
      for (const item of replacementPreview) {
        const result = await updateSource(item.source.name, {
          url: item.nextUrl,
          domesticMirror: item.source.domesticMirror
            ? {
                url: item.nextMirrorUrl ?? item.source.domesticMirror.url,
                enabled: item.source.domesticMirror.enabled,
              }
            : undefined,
        });
        nextSources = result.sources;
      }
      onSourcesChange(nextSources);
      setReplaceResult(`已替换 ${replacementPreview.length} 个源的远程仓库地址。`);
      setStatus('idle');
    } catch (error) {
      showError(error, '批量替换远程仓库地址失败，请检查源配置或平台 API。');
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
        <div className="source-tools">
          <form className="form-card source-form" onSubmit={submitSource}>
            <h2>添加 Git 源</h2>
            <label><span>源标识</span><input value={form.name} placeholder="team-private" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
            <label><span>显示名称</span><input value={form.label} placeholder="团队私有源" onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} /></label>
            <label><span>Git 地址</span><input value={form.url} placeholder="git@git.company.com:ai/team-skills.git" onChange={(event) => setForm((current) => ({ ...current, url: event.target.value }))} /></label>
            <div className="form-grid"><label><span>分支</span><input value={form.branch} placeholder="main" onChange={(event) => setForm((current) => ({ ...current, branch: event.target.value }))} /></label><label><span>技能目录</span><input value={form.skillsDirectory} placeholder="skills/" onChange={(event) => setForm((current) => ({ ...current, skillsDirectory: event.target.value }))} /></label></div>
            <label className="check-field"><input type="checkbox" checked={form.publishEnabled} onChange={(event) => setForm((current) => ({ ...current, publishEnabled: event.target.checked }))} /><span>作为直接发布目标</span></label>
            <label><span>描述</span><textarea value={form.description} placeholder="说明这个源适合哪些技能包。" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
            <button className="primary" type="submit" disabled={status === 'saving'}>{status === 'saving' ? '保存中...' : '添加源'}</button>
          </form>
          <section className="form-card source-replace-tool" aria-label="批量替换远程仓库地址">
            <h2>批量替换仓库地址</h2>
            <div className="source-replace-grid">
              <label><span>查找</span><input value={replaceRule.from} placeholder="https://github.com/" onChange={(event) => { setReplaceRule((current) => ({ ...current, from: event.target.value })); setReplaceResult(''); }} /></label>
              <label><span>替换为</span><input value={replaceRule.to} placeholder="git@github.com:" onChange={(event) => { setReplaceRule((current) => ({ ...current, to: event.target.value })); setReplaceResult(''); }} /></label>
            </div>
            <div className="source-replace-summary">
              <strong>{replacementPreview.length} 个源会被更新</strong>
              <span>会同时处理上游地址和已有国内镜像地址。</span>
            </div>
            {replacementPreview.length > 0 ? (
              <div className="source-replace-preview">
                {replacementPreview.slice(0, 4).map((item) => (
                  <div className="source-replace-item" key={item.source.name}>
                    <strong>{item.source.label}</strong>
                    {item.changedUpstream && item.source.url ? <code>{item.source.url} → {item.nextUrl}</code> : null}
                    {item.changedMirror && item.source.domesticMirror ? <code>{item.source.domesticMirror.url} → {item.nextMirrorUrl}</code> : null}
                  </div>
                ))}
                {replacementPreview.length > 4 ? <small>另有 {replacementPreview.length - 4} 个源会一起替换</small> : null}
              </div>
            ) : null}
            {replaceResult ? <p className="form-feedback ok">{replaceResult}</p> : null}
            <button className="primary" type="button" disabled={status === 'saving' || !replaceRule.from.trim() || replacementPreview.length === 0} onClick={applySourceUrlReplacement}>
              {status === 'saving' ? '替换中...' : '执行替换'}
            </button>
          </section>
        </div>
        <section className="source-list-panel">
          {sources.map((source) => {
            const isLastEnabled = source.enabled && enabledCount <= 1;
            const cannotDelete = isLastEnabled;
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
                  <Badge status={source.builtin ? '内置源' : '自定义源'} />
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
      {status === 'error' && errorMessage ? (
        <div className="confirm-dialog-layer" role="alertdialog" aria-modal="true" aria-labelledby="source-error-title">
          <button className="confirm-dialog-scrim" type="button" aria-label="关闭保存失败提示" onClick={clearError} />
          <section className="confirm-dialog danger source-error-dialog">
            <div className="confirm-dialog-mark">!</div>
            <div className="confirm-dialog-copy">
              <p className="eyebrow">Source save failed</p>
              <h2 id="source-error-title">保存失败</h2>
              <p>{errorMessage}</p>
              <small>请修正后重试；配置未确认保存前不会刷新当前源列表。</small>
            </div>
            <div className="confirm-dialog-actions">
              <button className="primary" type="button" onClick={clearError}>知道了</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
