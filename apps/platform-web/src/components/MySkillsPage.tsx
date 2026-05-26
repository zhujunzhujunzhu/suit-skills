import { useEffect, useState } from 'react';
import {
  deleteSkill,
  deleteSkillPackageUpload,
  listMySkills,
  listSkillPackageUploads,
  publishSkillPackage,
  type PackageUploadRecord,
} from '../api/client';
import { Badge, ConfirmDialog, PageHeader, formatDateTime, skillFromApi, type Skill } from './shared';
import { EmptyState } from './EmptyState';

export function MySkillsPage({ canManageUploads = true, onOpenSkill, onPublished }: { canManageUploads?: boolean; onOpenSkill: (skillId: string) => void; onPublished?: () => void | Promise<void> }) {
  const [mine, setMine] = useState<Skill[]>([]);
  const [uploads, setUploads] = useState<PackageUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyUploadId, setBusyUploadId] = useState<string | null>(null);
  const [busySkillId, setBusySkillId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ kind: 'upload'; item: PackageUploadRecord } | { kind: 'skill'; item: Skill } | null>(null);
  const [error, setError] = useState<string>('');

  async function loadMine() {
    setLoading(true);
    try {
      const [items, uploadRecords] = await Promise.all([
        listMySkills('current-user'),
        listSkillPackageUploads({ owner: 'current-user' }),
      ]);
      setMine(items.map(skillFromApi));
      setUploads(uploadRecords);
      setError('');
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : '读取我的技能包失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function loadInitialMine() {
      setLoading(true);
      try {
        const [items, uploadRecords] = await Promise.all([
          listMySkills('current-user'),
          listSkillPackageUploads({ owner: 'current-user' }),
        ]);
        if (cancelled) return;
        setMine(items.map(skillFromApi));
        setUploads(uploadRecords);
        setError('');
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : '读取我的技能包失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadInitialMine();

    return () => {
      cancelled = true;
    };
  }, []);

  async function publishUpload(upload: PackageUploadRecord) {
    setBusyUploadId(upload.id);
    setError('');
    try {
      const published = await publishSkillPackage(upload.id);
      setUploads((current) => current.map((item) => item.id === upload.id ? published : item));
      if (published.status === 'published') {
        await loadMine();
        await onPublished?.();
      } else if (published.publishError) {
        setError(`发布失败：${published.publishError}`);
      }
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : '发布失败');
    } finally {
      setBusyUploadId(null);
    }
  }

  async function deleteUpload(upload: PackageUploadRecord) {
    setBusyUploadId(upload.id);
    setError('');
    try {
      const deleted = await deleteSkillPackageUpload(upload.id);
      if (!deleted) {
        setError('删除失败：上传记录不存在或已被删除');
        return;
      }
      setUploads((current) => current.filter((item) => item.id !== upload.id));
      setDeleteTarget(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败');
    } finally {
      setBusyUploadId(null);
    }
  }

  async function deletePublishedSkill(skill: Skill) {
    setBusySkillId(skill.id);
    setError('');
    try {
      const deleted = await deleteSkill(skill.id);
      if (!deleted) {
        setError('删除失败：技能不存在或已被删除');
        return;
      }
      setMine((current) => current.filter((item) => item.id !== skill.id));
      setUploads((current) => current.filter((item) => item.metadata.id !== skill.id));
      setDeleteTarget(null);
      await onPublished?.();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : '删除失败');
    } finally {
      setBusySkillId(null);
    }
  }

  const publishedSkillIds = new Set(mine.map((skill) => skill.id));
  const unpublishedUploads = uploads
    .filter((upload) => upload.status !== 'published' || !publishedSkillIds.has(upload.metadata.id))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const hasItems = mine.length > 0 || unpublishedUploads.length > 0;
  const deleteName = deleteTarget?.kind === 'skill' ? deleteTarget.item.name : deleteTarget?.item.metadata.name;
  const deleting = deleteTarget?.kind === 'skill'
    ? busySkillId === deleteTarget.item.id
    : deleteTarget?.kind === 'upload'
      ? busyUploadId === deleteTarget.item.id
      : false;

  return (
    <div className="page">
      <PageHeader eyebrow="My packages" title="我的技能包" description="查看我上传或维护的技能包，以及保存、发布和 Git 提交记录。" />
      <section className="skill-list">
        {mine.map((skill) => (
          <PublishedSkillRow
            key={skill.id}
            skill={skill}
            busy={busySkillId === skill.id}
            onOpen={() => onOpenSkill(skill.id)}
            onDelete={() => setDeleteTarget({ kind: 'skill', item: skill })}
          />
        ))}
        {unpublishedUploads.map((upload) => (
          <UploadRecordRow
            key={upload.id}
            upload={upload}
            busy={busyUploadId === upload.id}
            canManage={canManageUploads}
            onPublish={() => void publishUpload(upload)}
            onDelete={() => setDeleteTarget({ kind: 'upload', item: upload })}
          />
        ))}
        {error ? <div className="empty-state danger-text">{error}</div> : null}
        {!hasItems ? (
          <EmptyState
            type={loading ? 'loading' : 'no-data'}
            title={loading ? '正在读取我的技能包' : '还没有技能包记录'}
            description={loading ? '同步上传和发布状态中。' : '上传或创建技能包后，会在这里显示保存和发布进度。'}
            ariaLabel={loading ? '加载中' : '没有技能包'}
          />
        ) : null}
      </section>
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        eyebrow="Delete"
        title={deleteName ? `删除 ${deleteName}` : '删除记录'}
        description={deleteTarget?.kind === 'skill' ? '该技能会从技能市场和我的技能包中移除，相关用户将无法继续从市场打开它。' : '这条上传记录会被移除，之后需要重新上传技能包才能继续保存或发布。'}
        detail="此操作会立即生效，请确认当前选择无误。"
        confirmLabel="确认删除"
        tone="danger"
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => {
          if (deleteTarget?.kind === 'skill') {
            void deletePublishedSkill(deleteTarget.item);
          } else if (deleteTarget?.kind === 'upload') {
            void deleteUpload(deleteTarget.item);
          }
        }}
      />
    </div>
  );
}

function PublishedSkillRow({
  skill,
  busy,
  onOpen,
  onDelete,
}: {
  skill: Skill;
  busy: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="skill-row mine-skill-row">
      <button className="mine-skill-open" type="button" aria-label={`查看技能详情: ${skill.name}`} onClick={onOpen}>
        <span className="skill-icon">{skill.name.slice(0, 2).toUpperCase()}</span>
        <span className="skill-main">
          <span className="skill-title" role="heading" aria-level={3}><strong>{skill.name}</strong><Badge status={skill.status} /></span>
          <span className="skill-desc">{skill.description}</span>
          <span className="tag-row">{skill.tags.map((tag) => <em key={tag}>{tag}</em>)}</span>
        </span>
        <span className="skill-meta"><small>作者</small><strong>{skill.author}</strong></span>
        <span className="skill-meta"><small>来源</small><strong>{skill.source}</strong></span>
        <span className="skill-meta"><small>更新</small><strong>{skill.updatedAt}</strong></span>
      </button>
      <span className="upload-actions mine-skill-actions">
        <button className="danger compact" type="button" disabled={busy} onClick={onDelete}>
          {busy ? '删除中...' : '删除'}
        </button>
      </span>
    </article>
  );
}

function UploadRecordRow({
  upload,
  busy,
  canManage,
  onPublish,
  onDelete,
}: {
  upload: PackageUploadRecord;
  busy: boolean;
  canManage: boolean;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const skill = upload.metadata;
  const canPublish = upload.status !== 'publishing';

  return (
    <article className="package-upload-row">
      <span className="skill-icon">{skill.name.slice(0, 2).toUpperCase()}</span>
      <span className="skill-main">
        <span className="skill-title">
          <strong>{skill.name}</strong>
          <Badge status={upload.status === 'published' ? '已发布' : '未发布'} />
          <Badge status={uploadStatusLabel(upload.status)} />
        </span>
        <span className="skill-desc">{skill.description || upload.fileName}</span>
        <span className="tag-row">
          {(skill.tags.length ? skill.tags : ['上传记录']).map((tag) => <em key={tag}>{tag}</em>)}
        </span>
      </span>
      <span className="skill-meta"><small>文件</small><strong>{upload.fileName}</strong></span>
      <span className="skill-meta"><small>状态</small><strong>{uploadStatusLabel(upload.status)}</strong></span>
      <span className="skill-meta"><small>更新</small><strong>{formatDateTime(upload.updatedAt)}</strong></span>
      {canManage ? (
        <span className="upload-actions">
          <button className="primary compact" type="button" disabled={busy || !canPublish} onClick={onPublish}>
            {busy && canPublish ? '发布中...' : upload.status === 'publish_failed' ? '重新发布' : '发布'}
          </button>
          <button className="danger compact" type="button" disabled={busy} onClick={onDelete}>删除</button>
        </span>
      ) : <span className="skill-meta"><small>发布</small><strong>等待发布</strong></span>}
      {upload.publishError ? <span className="package-error">{upload.publishError}</span> : null}
    </article>
  );
}

function uploadStatusLabel(status: PackageUploadRecord['status']): string {
  const labels: Record<PackageUploadRecord['status'], string> = {
    parsed: '已保存',
    waiting_review: '待发布',
    rejected: '已驳回',
    publishing: '发布中',
    published: '已发布',
    publish_failed: '发布失败',
  };
  return labels[status];
}
