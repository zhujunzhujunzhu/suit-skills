import { useEffect, useState } from 'react';
import {
  listMySkills,
  listSkillPackageUploads,
  type PackageUploadRecord,
} from '../api/client';
import { Badge, PageHeader, formatDateTime, skillFromApi, SkillRow, type Skill } from './shared';

export function MySkillsPage({ fallbackSkills, onOpenSkill }: { fallbackSkills: Skill[]; onOpenSkill: (skillId: string) => void }) {
  const [mine, setMine] = useState<Skill[]>(fallbackSkills.filter((skill) => skill.source === '用户上传'));
  const [uploads, setUploads] = useState<PackageUploadRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function loadMine() {
      setLoading(true);
      try {
        const [items, uploadRecords] = await Promise.all([
          listMySkills('current-user'),
          listSkillPackageUploads({ owner: 'current-user' }),
        ]);
        if (cancelled) return;
        setMine(items.map(skillFromApi));
        setUploads(uploadRecords);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadMine();

    return () => {
      cancelled = true;
    };
  }, []);

  const publishedSkillIds = new Set(mine.map((skill) => skill.id));
  const unpublishedUploads = uploads
    .filter((upload) => upload.status !== 'published' || !publishedSkillIds.has(upload.metadata.id))
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  const hasItems = mine.length > 0 || unpublishedUploads.length > 0;

  return (
    <div className="page">
      <PageHeader eyebrow="My packages" title="我的技能包" description="查看我上传或维护的技能包，以及发布状态、审核状态和 Git 提交记录。" />
      <section className="skill-list">
        {mine.map((skill) => <SkillRow key={skill.id} skill={skill} onOpen={() => onOpenSkill(skill.id)} />)}
        {unpublishedUploads.map((upload) => (
          <UploadRecordRow key={upload.id} upload={upload} />
        ))}
        {!hasItems ? (
          <div className="empty-state market-empty">
            <strong>{loading ? '正在读取我的技能包' : '还没有技能包记录'}</strong>
            <span>{loading ? '同步上传、审核和发布状态中。' : '上传或创建技能包后，会在这里显示审核和发布进度。'}</span>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function UploadRecordRow({ upload }: { upload: PackageUploadRecord }) {
  const skill = upload.metadata;

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
      <span className="skill-meta"><small>审核</small><strong>{uploadStatusLabel(upload.status)}</strong></span>
      <span className="skill-meta"><small>更新</small><strong>{formatDateTime(upload.updatedAt)}</strong></span>
      <span className="open-link">{upload.publishedCommit ? upload.publishedCommit.slice(0, 7) : '等待发布'}</span>
      {upload.publishError ? <span className="package-error">{upload.publishError}</span> : null}
    </article>
  );
}

function uploadStatusLabel(status: PackageUploadRecord['status']): string {
  const labels: Record<PackageUploadRecord['status'], string> = {
    parsed: '已解析',
    waiting_review: '待审核',
    rejected: '已驳回',
    publishing: '发布中',
    published: '已发布',
    publish_failed: '发布失败',
  };
  return labels[status];
}
