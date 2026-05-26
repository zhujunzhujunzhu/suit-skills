import { type DragEvent, type FormEvent, useEffect, useRef, useState } from 'react';
import { parseSkillPackage, publishSkillPackage, updateSkillPackageMetadata, uploadSkill, type AuthUser, type PackageUploadRecord, type SkillInput, type SkillItem, type SourceItem } from '../api/client';
import type { UploadFileEntry } from '../uploadPackaging';
import { Badge, PageHeader, skillFromApi, skillInputFromForm, type Skill } from './shared';
import { EmptyState } from './EmptyState';

type FileWithRelativePath = File & { webkitRelativePath?: string };
type FileSystemEntryLike = { name: string; isFile: boolean; isDirectory: boolean };
type FileSystemFileEntryLike = FileSystemEntryLike & { file: (success: (file: File) => void, error?: (error: DOMException) => void) => void };
type FileSystemDirectoryEntryLike = FileSystemEntryLike & { createReader: () => { readEntries: (success: (entries: FileSystemEntryLike[]) => void, error?: (error: DOMException) => void) => void } };
type DataTransferItemWithEntry = DataTransferItem & { webkitGetAsEntry?: () => FileSystemEntryLike | null };
const placeholderAuthorLabels = new Set(['Current user', 'current-user']);

function currentUserAuthor(currentUser: AuthUser | null): string {
  return currentUser?.name?.trim() || currentUser?.email?.trim() || currentUser?.id?.trim() || 'Current user';
}

function shouldUseCurrentAuthor(author?: string): boolean {
  const trimmed = author?.trim() ?? '';
  return !trimmed || placeholderAuthorLabels.has(trimmed);
}

function withCurrentAuthor(form: SkillInput, author: string): SkillInput {
  return shouldUseCurrentAuthor(form.author) ? { ...form, author } : form;
}

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
  canPublish: canPublishDirectly,
  currentUser,
  onOpenMine,
  onOpenSkill,
  onUploaded,
}: {
  sourceConfig: SourceItem[];
  canPublish: boolean;
  currentUser: AuthUser | null;
  onOpenMine: () => void;
  onOpenSkill: (skillId: string) => void;
  onUploaded: (skill: Skill) => void;
}) {
  const currentAuthor = currentUserAuthor(currentUser);
  const [upload, setUpload] = useState<PackageUploadRecord | null>(null);
  const [uploadedSkill, setUploadedSkill] = useState<Skill | null>(null);
  const [form, setForm] = useState<SkillInput>({ name: '', description: '', author: currentAuthor, source: 'default', category: '', version: '0.1.0', tags: [], gitUrl: '' });
  const [status, setStatus] = useState<'idle' | 'parsing' | 'submitting' | 'success' | 'error'>('idle');
  const [message, setMessage] = useState('');
  const [intent, setIntent] = useState<'save' | 'publish'>('save');
  const publishableSources = sourceConfig.filter((source) => source.enabled && source.publishEnabled);
  const publishableSourceNames = new Set(publishableSources.map((source) => source.name));
  const selectedSource = form.source && publishableSourceNames.has(form.source)
    ? form.source
    : publishableSources[0]?.name ?? '';
  const canEdit = status !== 'submitting' && status !== 'parsing';
  const canSave = Boolean(form.name.trim() && form.description.trim()) && canEdit;
  const canPublish = canPublishDirectly && Boolean(upload && form.name.trim() && form.description.trim() && selectedSource) && canEdit;

  useEffect(() => {
    setForm((current) => {
      if (!shouldUseCurrentAuthor(current.author) || current.author === currentAuthor) return current;
      return { ...current, author: currentAuthor };
    });
  }, [currentAuthor]);

  async function parseEntries(entries: UploadFileEntry[]) {
    setStatus('parsing');
    setMessage('');
    try {
      const { packageUploadEntries } = await import('../uploadPackaging');
      const file = await packageUploadEntries(entries);
      const parsed = await parseSkillPackage(file, 'current-user');
      const parsedForm = withCurrentAuthor(skillInputFromItem(parsed.metadata), currentAuthor);
      setUpload(parsed);
      setForm({
        ...parsedForm,
        source: parsedForm.source && publishableSourceNames.has(parsedForm.source)
          ? parsedForm.source
          : publishableSources[0]?.name ?? '',
      });
      setStatus('idle');
      setMessage(canPublishDirectly ? '技能包已解析，请确认或调整下方信息。可以直接保存，也可以立即发布到市场。' : '技能包已解析，请确认或调整下方信息。保存后可从我的技能包继续发布。');
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '技能包解析失败，请检查文件或文件夹格式。');
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form.name.trim() || !form.description.trim()) return;
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const action = submitter?.value === 'publish' ? 'publish' : 'save';
    const shouldPublish = action === 'publish';
    if (shouldPublish && !canPublish) {
      setStatus('error');
      setMessage(!upload ? '请先选择并解析技能包，再发布到市场。' : '请先配置可发布的来源，再发布到市场。');
      return;
    }
    setIntent(action);
    const source = shouldPublish ? selectedSource : selectedSource || form.source || 'default';
    const submitForm = withCurrentAuthor({ ...form, source }, currentAuthor);
    setStatus('submitting');
    setMessage('');
    try {
      if (upload) {
        const updated = await updateSkillPackageMetadata(upload.id, skillInputFromForm(submitForm));
        const result = shouldPublish ? await publishSkillPackage(updated.id) : updated;
        const nextSkill = skillFromApi(result.metadata);
        onUploaded(nextSkill);
        setUploadedSkill(nextSkill);
        setUpload(result);
      } else {
        const submitted = await uploadSkill(skillInputFromForm(submitForm));
        const nextSkill = skillFromApi(submitted);
        onUploaded(nextSkill);
        setUploadedSkill(nextSkill);
      }
      setStatus('success');
      setMessage(`✅ ${shouldPublish ? '已发布' : '已保存'} - 可在"我的技能包"查看详情`);
    } catch (error) {
      setStatus('error');
      setMessage(error instanceof Error ? error.message : '提交失败，请稍后重试。');
    }
  }

  return (
    <div className="page">
      <PageHeader
        eyebrow="Upload"
        title="上传技能"
        description="拖拽或选择技能文件夹 / zip 包，平台会从 SKILL.md 生成草稿。确认后可直接保存或发布。"
        actions={(
          <>
            <button className="ghost" form="upload-skill-form" type="submit" name="uploadAction" value="save" disabled={!canSave} onClick={() => setIntent('save')}>
              {status === 'submitting' && intent === 'save' ? '保存中...' : '保存'}
            </button>
            {canPublishDirectly ? (
              <button className="primary" form="upload-skill-form" type="submit" name="uploadAction" value="publish" disabled={!canPublish} onClick={() => setIntent('publish')}>
                {status === 'submitting' && intent === 'publish' ? '发布中...' : '发布'}
              </button>
            ) : null}
          </>
        )}
      />
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
          <div className="form-grid"><label><span>作者</span><input value={form.author ?? ''} placeholder={currentAuthor} onChange={(event) => setForm((current) => ({ ...current, author: event.target.value }))} /></label><label><span>来源</span><select disabled={!publishableSources.length} value={selectedSource} onChange={(event) => setForm((current) => ({ ...current, source: event.target.value }))}>{publishableSources.length ? publishableSources.map((source) => <option key={source.name} value={source.name}>{source.label || source.name}</option>) : <option value="">暂无可发布源</option>}</select></label></div>
          <label><span>标签</span><input value={form.tags?.join(', ') ?? ''} placeholder="React, UI, Dashboard" onChange={(event) => setForm((current) => ({ ...current, tags: event.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) }))} /></label>
        </form>
        <section className="check-card"><h2>上传校验</h2>{upload ? <><div className="check-row"><span>文件</span><strong>{upload.fileName}</strong></div><div className="check-row"><span>状态</span><Badge status={uploadStatusLabel(upload.status)} /></div>{upload.validation.map((item) => <div className="check-row" key={item.code}><span>{item.message}</span><Badge status={validationStatusLabel(item.severity)} /></div>)}</> : <EmptyState type="no-data" title="选择技能包" description="选择技能包后会显示 SKILL.md 解析结果、结构校验和提交状态。" ariaLabel="等待选择技能包" />}<div className="upload-note"><strong>发布流程</strong><p>{canPublishDirectly ? '保存会保留当前草稿；发布会直接同步到已配置的发布源并上架到市场。' : '保存会保留当前草稿；发布会在配置好发布源后同步到市场。'}</p></div></section>
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
  const [dragActive, setDragActive] = useState(false);
  const zipInputRef = useRef<HTMLInputElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);

  function setFolderInputRef(element: HTMLInputElement | null) {
    folderInputRef.current = element;
    if (element) {
      element.setAttribute('webkitdirectory', '');
      element.setAttribute('directory', '');
    }
  }

  function updateDragState(event: DragEvent<HTMLDivElement>, active: boolean) {
    event.preventDefault();
    setDragActive(active);
  }

  function handleZipSelection(files: FileList | null) {
    const entries = uploadEntriesFromFileList(files);
    if (entries.length) onSelect(entries);
  }

  return (
    <div
      className={`drop-zone ${dragActive ? 'is-dragging' : ''}`}
      role="region"
      aria-label="上传技能包"
      onDragEnter={(event) => updateDragState(event, true)}
      onDragOver={(event) => updateDragState(event, true)}
      onDragLeave={(event) => updateDragState(event, false)}
      onDrop={(event) => {
        event.preventDefault();
        setDragActive(false);
        void collectDroppedUploadFiles(event.dataTransfer).then(onSelect);
      }}
    >
      <div className="drop-zone-icon" aria-hidden="true">{parsing ? '...' : fileName ? 'OK' : '+'}</div>
      <strong>{parsing ? '正在解析技能包...' : fileName ?? '拖拽技能包到这里'}</strong>
      <span>{fileName ? '已生成可编辑草稿，可重新选择 zip 或文件夹覆盖。' : '选择包含 SKILL.md 的技能文件夹或 .zip 包，也可以直接拖拽上传。'}</span>
      <div className="upload-pickers">
        <button className="file-picker" type="button" disabled={parsing} onClick={() => zipInputRef.current?.click()}>选择 zip</button>
        <button className="file-picker secondary" type="button" disabled={parsing} onClick={() => folderInputRef.current?.click()}>选择文件夹</button>
      </div>
      <input ref={zipInputRef} className="visually-hidden-file" type="file" accept=".zip" onChange={(event) => { handleZipSelection(event.target.files); event.currentTarget.value = ''; }} />
      <input ref={setFolderInputRef} className="visually-hidden-file" type="file" multiple onChange={(event) => { handleZipSelection(event.target.files); event.currentTarget.value = ''; }} />
    </div>
  );
}

function skillInputFromItem(item: SkillItem): SkillInput {
  return { name: item.name, description: item.description, author: item.author, source: item.source, category: item.category, version: item.version, tags: item.tags, gitUrl: item.gitUrl };
}

function uploadStatusLabel(status: PackageUploadRecord['status']): string {
  const labels: Record<PackageUploadRecord['status'], string> = { parsed: '已保存', waiting_review: '待发布', rejected: '已驳回', publishing: '发布中', published: '已发布', publish_failed: '发布失败' };
  return labels[status];
}

function validationStatusLabel(severity: 'info' | 'warning' | 'error'): string {
  if (severity === 'error') return '需处理';
  if (severity === 'warning') return '待确认';
  return '通过';
}
