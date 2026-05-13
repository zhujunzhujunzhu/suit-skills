import { type FormEvent, useState } from 'react';
import { parseSkillPackage, submitSkillPackageForReview, updateSkillPackageMetadata, uploadSkill, type PackageUploadRecord, type SkillInput, type SkillItem, type SourceItem } from '../api/client';
import type { UploadFileEntry } from '../uploadPackaging';
import { Badge, PageHeader, skillFromApi, skillInputFromForm, type Skill } from './shared';
import { EmptyState } from './EmptyState';

type DirectoryInputElement = HTMLInputElement & { webkitdirectory: boolean; directory: boolean };
type FileWithRelativePath = File & { webkitRelativePath?: string };
type FileSystemEntryLike = { name: string; isFile: boolean; isDirectory: boolean };
type FileSystemFileEntryLike = FileSystemEntryLike & { file: (success: (file: File) => void, error?: (error: DOMException) => void) => void };
type FileSystemDirectoryEntryLike = FileSystemEntryLike & { createReader: () => { readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void) => void } };
type DataTransferItemWithEntry = DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null };

async function fileFromEntry(entry: FileSystemFileEntryLike): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function readAllDirectoryEntries(entry: FileSystemDirectoryEntryLike): Promise<FileSystemEntryLike[]> {
  const reader = entry.createReader();
  const entries: FileSystemEntryLike[] = [];
  while (true) {
    const batch = await new Promise<FileSystemEntryLike[]>((resolve, reject) => reader.readEntries(resolve, reject));
    if (!batch.length) return entries;
    entries.push(...batch);
  }
}

async function collectEntryFiles(entry: FileSystemEntryLike, parentPath = ''): Promise<UploadFileEntry[]> {
  const path = parentPath ? `${parentPath}/${entry.name}` : entry.name;
  if (entry.isFile) {
    const file = await fileFromEntry(entry as FileSystemFileEntryLike);
    return [{ file, path }];
  }
  if (entry.isDirectory) {
    const children = await readAllDirectoryEntries(entry as FileSystemDirectoryEntryLike);
    const nested = await Promise.all(children.map((child) => collectEntryFiles(child, path)));
    return nested.flat();
  }
  return [];
}

async function collectDroppedUploadFiles(dataTransfer: DataTransfer): Promise<UploadFileEntry[]> {
  const entries: FileSystemEntryLike[] = Array.from(dataTransfer.items).map((item) => (item as DataTransferItemWithEntry).webkitGetAsEntry?.() as FileSystemEntryLike | null).filter((entry): entry is FileSystemEntryLike => Boolean(entry));
  if (entries.length) {
    const nested = await Promise.all(entries.map((entry) => collectEntryFiles(entry)));
    return nested.flat();
  }
  return Array.from(dataTransfer.files).map((file) => ({ file, path: file.name }));
}

function uploadEntriesFromFileList(files: FileList | null): UploadFileEntry[] {
  return Array.from(files ?? []).map((file) => ({ file, path: (file as FileWithRelativePath).webkitRelativePath || file.name }));
}

export function UploadPage({
  sourceConfig,
  onOpenMine,
  onOpenSkill,
  onUploaded,
}: {
  sourceConfig: SourceItem[];
  onOpenMine: () => void;
  onOpenSkill: (skillId: string) => void;
  onUploaded: (skill: Skill) => void;
}) {
  const [upload, setUpload] = useState<PackageUploadRecord | null>(null);
  const [uploadedSkill, setUploadedSkill] = useState<Skill | null>(null);
  const [form, setForm] = useState<SkillInput>({ name: '', description: '', author: '', source: 'default', category: '', version: '0.1.0', tags: [], gitUrl: '' });
  const [status, setStatus] = useState<'idle' | 'parsing' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [uploadStatus, setUploadStatus] = useState<'draft' | 'reviewing' | 'published'>('draft');
  const publishableSources = sourceConfig.filter((source) => source.enabled && source.publishEnabled);
  const publishableSourceNames = new Set(publishableSources.map((source) => source.name));
  const selectedSource = form.source && publishableSourceNames.has(form.source)
    ? form.source
    : publishableSources[0]?.name ?? '';
  const canSubmit = Boolean(form.name.trim() && form.description.trim() && selectedSource) && status !== 'submitting' && status !== 'parsing';

  async function parseEntries(entries: UploadFileEntry[]) {
    setStatus('parsing');
    setMessage('');
    try {
      const { packageUploadEntries } = await import('../uploadPackaging');
      const file = await packageUploadEntries(entries);
      const parsed = await parseSkillPackage(file, 'current-user');
      const parsedForm = skillInputFromItem(parsed.metadata);
      setUpload(parsed);
      setForm({
        ...parsedForm,
        source: parsedForm.source && publishableSourceNames.has(parsedForm.source)
          ? parsedForm.source
          : publishableSources[0]?.name ?? '',
      });
      setStatus('idle');
      setMessage('技能包已解析，请确认或调整下方信息后提交审核。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '技能包解析失败，请检查文件或文件夹格式。');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.description.trim() || !selectedSource) return;
    const submitForm = { ...form, source: selectedSource };
    setStatus('submitting');
    setMessage('');
    try {
      if (upload) {
        const updated = await updateSkillPackageMetadata(upload.id, skillInputFromForm(submitForm));
        const submitted = await submitSkillPackageForReview(updated.id);
        const nextSkill = skillFromApi(submitted.metadata);
        onUploaded(nextSkill);
        setUploadedSkill(nextSkill);
        setUpload(submitted);
      } else {
        const submitted = await uploadSkill(skillInputFromForm(submitForm));
        const nextSkill = skillFromApi(submitted);
        onUploaded(nextSkill);
        setUploadedSkill(nextSkill);
      }
      setStatus('success');
      setMessage(`✅ ${upload ? '审核中' : '已上传'} - 可在"我的技能包"查看详情`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '提交失败，请稍后重试。');
    }
  }

  return (
    <div className="page">
      <PageHeader eyebrow="Upload" title="上传技能" description="拖拽或选择技能文件夹 / zip 包，平台会从 SKILL.md 生成草稿。" actions={<button className="primary" form="upload-skill-form" type="submit" disabled={!canSubmit}>{status === 'submitting' ? '提交中...' : upload ? '提交审核' : '创建草稿'}</button>} />
      <section className="upload-layout">
        <form className="form-card" id="upload-skill-form" onSubmit={handleSubmit}>
          <h2>技能包文件</h2>
          <SkillPackagePicker
            fileName={upload?.fileName}
            parsing={status === 'parsing'}
            onSelect={(entries) => { void parseEntries(entries); }}
          />
          {message ? (
            status === 'error' ? (
              <EmptyState
                type="error"
                title="上传失败"
                description={message}
                ariaLabel="上传出错"
              />
            ) : status === 'success' ? (
              <EmptyState
                type="no-data"
                title="上传成功"
                description={message}
                action={uploadedSkill ? {
                  label: '打开技能详情',
                  onClick: () => onOpenSkill(uploadedSkill.id),
                } : undefined}
                ariaLabel="上传完成"
              />
            ) : (
              <div className="empty-state">
                {message}
              </div>
            )
          ) : null}
          <label><span>技能名称</span><input value={form.name} placeholder="frontend-design" onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} /></label>
          <label><span>技能描述</span><textarea value={form.description} placeholder="描述这个技能解决什么问题，适合什么场景。" onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} /></label>
          <div className="form-grid"><label><span>分类</span><input value={form.category} placeholder="frontend / backend / document" onChange={(event) => setForm((current) => ({ ...current, category: event.target.value }))} /></label><label><span>版本</span><input value={form.version} placeholder="1.0.0" onChange={(event) => setForm((current) => ({ ...current, version: event.target.value }))} /></label></div>
          <div className="form-grid"><label><span>作者</span><input value={form.author ?? ''} placeholder="Current user" onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))} /></label><label><span>来源</span><select disabled={!publishableSources.length} value={selectedSource} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}>{publishableSources.length ? publishableSources.map((source) => <option key={source.name} value={source.name}>{source.label || source.name}</option>) : <option value="">暂无可发布源</option>}</select></label></div>
          <label><span>标签</span><input value={form.tags?.join(', ') ?? ''} placeholder="React, UI, Dashboard" onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }))} /></label>
        </form>
        <section className="check-card"><h2>上传校验</h2>{upload ? <><div className="check-row"><span>文件</span><strong>{upload.fileName}</strong></div><div className="check-row"><span>状态</span><Badge status={uploadStatusLabel(upload.status)} /></div>{upload.validation.map((item) => <div className="check-row" key={item.code}><span>{item.message}</span><Badge status={validationStatusLabel(item.severity)} /></div>)}</> : <EmptyState type="no-data" title="选择技能包" description="选择技能包后会显示 SKILL.md 解析结果、结构校验和提交状态。" ariaLabel="等待选择技能包" />}<div className="upload-note"><strong>发布流程</strong><p>提交后记录会进入审核队列。管理员通过后，服务端会同步到市场。</p></div></section>
      </section>
    </div>
  );
}

function SkillPackagePicker({
  fileName,
  parsing,
  onSelect,
}: {
  fileName?: string;
  parsing: boolean;
  onSelect: (entries: UploadFileEntry[]) => void;
}) {
  return (
    <label
      className="drop-zone"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        void collectDroppedUploadFiles(event.dataTransfer).then(onSelect);
      }}
    >
      <strong>{parsing ? '正在解析技能包...' : fileName ?? '拖拽文件夹或 .zip 到这里'}</strong>
      <span>{fileName ? '已生成可编辑草稿，可重新选择文件覆盖。' : '支持选择技能文件夹、zip 包，也可以直接拖入包含 SKILL.md 的技能目录。'}</span>
      <div className="upload-pickers">
        <span className="file-picker">选择 zip<input type="file" accept=".zip" onChange={(event) => { onSelect(uploadEntriesFromFileList(event.target.files)); event.currentTarget.value = ''; }} /></span>
        <span className="file-picker">选择文件夹<input ref={(node) => { if (!node) return; const input = node as DirectoryInputElement; input.webkitdirectory = true; input.directory = true; }} type="file" multiple onChange={(event) => { onSelect(uploadEntriesFromFileList(event.target.files)); event.currentTarget.value = ''; }} /></span>
      </div>
    </label>
  );
}

function skillInputFromItem(item: SkillItem): SkillInput {
  return { name: item.name, description: item.description, author: item.author, source: item.source, category: item.category, version: item.version, tags: item.tags, gitUrl: item.gitUrl };
}

function uploadStatusLabel(status: PackageUploadRecord['status']): string {
  const labels: Record<PackageUploadRecord['status'], string> = { parsed: '已解析', waiting_review: '待审核', rejected: '已驳回', publishing: '发布中', published: '已发布', publish_failed: '发布失败' };
  return labels[status];
}

function validationStatusLabel(severity: 'info' | 'warning' | 'error'): string {
  if (severity === 'error') return '需处理';
  if (severity === 'warning') return '待确认';
  return '通过';
}
