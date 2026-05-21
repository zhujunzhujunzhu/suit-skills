export type UploadFileEntry = {
  file: File;
  path: string;
};

function commonRootName(entries: UploadFileEntry[]): string {
  const firstSegment = entries[0]?.path.split('/').filter(Boolean)[0];
  if (!firstSegment) return 'skill-package';
  return entries.every((entry) => entry.path.split('/').filter(Boolean)[0] === firstSegment)
    ? firstSegment
    : 'skill-package';
}

function safeZipPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((part) => part.trim())
    .filter((part) => part && part !== '.' && part !== '..')
    .join('/');
}

const crcTable = new Uint32Array(256);
for (let i = 0; i < crcTable.length; i += 1) {
  let c = i;
  for (let k = 0; k < 8; k += 1) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = crcTable[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosTime(date: Date): number {
  return (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
}

function dosDate(date: Date): number {
  return ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concatBytes(parts: Uint8Array[]): Uint8Array {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

async function createZipFromUploadEntries(entries: UploadFileEntry[], fileName: string): Promise<File> {
  const encoder = new TextEncoder();
  const now = new Date();
  const time = dosTime(now);
  const date = dosDate(now);
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    const path = safeZipPath(entry.path);
    if (!path) continue;
    const name = encoder.encode(path);
    const data = new Uint8Array(await entry.file.arrayBuffer());
    const crc = crc32(data);
    const localHeader = concatBytes([
      u32(0x04034b50),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      name,
    ]);
    const centralHeader = concatBytes([
      u32(0x02014b50),
      u16(20),
      u16(20),
      u16(0x0800),
      u16(0),
      u16(time),
      u16(date),
      u32(crc),
      u32(data.length),
      u32(data.length),
      u16(name.length),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(0),
      u32(offset),
      name,
    ]);
    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
  }

  const centralOffset = offset;
  const centralDirectory = concatBytes(centralParts);
  const endRecord = concatBytes([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(centralParts.length),
    u16(centralParts.length),
    u32(centralDirectory.length),
    u32(centralOffset),
    u16(0),
  ]);
  const body = concatBytes([...localParts, centralDirectory, endRecord]);
  const zipBuffer = new ArrayBuffer(body.byteLength);
  new Uint8Array(zipBuffer).set(body);
  return new File([zipBuffer], fileName, { type: 'application/zip' });
}

export async function packageUploadEntries(entries: UploadFileEntry[]): Promise<File> {
  if (!entries.length) {
    throw new Error('请选择技能包文件或文件夹。');
  }
  const hasDirectoryPath = entries.some((entry) => safeZipPath(entry.path).includes('/'));
  if (entries.length === 1 && !hasDirectoryPath) {
    if (!/\.zip$/i.test(entries[0]!.file.name)) {
      throw new Error('请上传 .zip 文件，或选择包含 SKILL.md 的技能文件夹。');
    }
    return entries[0]!.file;
  }
  const rootName = commonRootName(entries);
  return createZipFromUploadEntries(entries, `${rootName}.zip`);
}
