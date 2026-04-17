import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

interface ZipEntry {
  name: string;
  data: Buffer;
  crc32: number;
}

let crcTable: Uint32Array | null = null;

function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  crcTable = table;
  return table;
}

function crc32(data: Buffer): number {
  const table = getCrcTable();
  let crc = 0xffffffff;
  for (const byte of data) {
    crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date = new Date()): { time: number; date: number } {
  const year = Math.max(date.getFullYear(), 1980);
  return {
    time:
      (date.getHours() << 11) |
      (date.getMinutes() << 5) |
      Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function normalizeZipPath(path: string): string {
  return path.split(sep).join('/');
}

function collectEntries(
  rootDir: string,
  currentDir: string,
  zipRootName: string,
  entries: ZipEntry[],
): void {
  const dirents = readdirSync(currentDir, { withFileTypes: true });
  for (const dirent of dirents.sort((a, b) => a.name.localeCompare(b.name))) {
    const fullPath = join(currentDir, dirent.name);
    const stat = lstatSync(fullPath);
    if (stat.isSymbolicLink()) {
      continue;
    }
    if (stat.isDirectory()) {
      collectEntries(rootDir, fullPath, zipRootName, entries);
      continue;
    }
    if (!stat.isFile()) continue;
    const rel = normalizeZipPath(relative(rootDir, fullPath));
    const data = readFileSync(fullPath);
    entries.push({
      name: `${zipRootName}/${rel}`,
      data,
      crc32: crc32(data),
    });
  }
}

function localFileHeader(entry: ZipEntry, time: number, date: number): Buffer {
  const name = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0x0800, 6);
  header.writeUInt16LE(0, 8);
  header.writeUInt16LE(time, 10);
  header.writeUInt16LE(date, 12);
  header.writeUInt32LE(entry.crc32, 14);
  header.writeUInt32LE(entry.data.length, 18);
  header.writeUInt32LE(entry.data.length, 22);
  header.writeUInt16LE(name.length, 26);
  header.writeUInt16LE(0, 28);
  return Buffer.concat([header, name]);
}

function centralDirectoryHeader(
  entry: ZipEntry,
  offset: number,
  time: number,
  date: number,
): Buffer {
  const name = Buffer.from(entry.name, 'utf8');
  const header = Buffer.alloc(46);
  header.writeUInt32LE(0x02014b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(20, 6);
  header.writeUInt16LE(0x0800, 8);
  header.writeUInt16LE(0, 10);
  header.writeUInt16LE(time, 12);
  header.writeUInt16LE(date, 14);
  header.writeUInt32LE(entry.crc32, 16);
  header.writeUInt32LE(entry.data.length, 20);
  header.writeUInt32LE(entry.data.length, 24);
  header.writeUInt16LE(name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(0, 38);
  header.writeUInt32LE(offset, 42);
  return Buffer.concat([header, name]);
}

function endOfCentralDirectory(
  entryCount: number,
  centralSize: number,
  centralOffset: number,
): Buffer {
  const header = Buffer.alloc(22);
  header.writeUInt32LE(0x06054b50, 0);
  header.writeUInt16LE(0, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(entryCount, 8);
  header.writeUInt16LE(entryCount, 10);
  header.writeUInt32LE(centralSize, 12);
  header.writeUInt32LE(centralOffset, 16);
  header.writeUInt16LE(0, 20);
  return header;
}

export function createZipFromDirectory(
  rootDir: string,
  zipRootName: string,
): Buffer {
  const entries: ZipEntry[] = [];
  collectEntries(rootDir, rootDir, zipRootName, entries);
  const { time, date } = dosDateTime();
  const chunks: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const local = localFileHeader(entry, time, date);
    chunks.push(local, entry.data);
    central.push(centralDirectoryHeader(entry, offset, time, date));
    offset += local.length + entry.data.length;
  }

  const centralOffset = offset;
  const centralBuffer = Buffer.concat(central);
  chunks.push(centralBuffer);
  chunks.push(
    endOfCentralDirectory(entries.length, centralBuffer.length, centralOffset),
  );
  return Buffer.concat(chunks);
}
