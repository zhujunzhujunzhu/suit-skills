import { describe, expect, it } from 'vitest';
import AdmZip from 'adm-zip';
import { packageUploadEntries, type UploadFileEntry } from '../../apps/platform-web/src/uploadPackaging.js';

function textFile(name: string, content: string): UploadFileEntry {
  return {
    file: new File([content], name, { type: 'text/plain' }),
    path: name,
  };
}

describe('packageUploadEntries', () => {
  it('returns a single zip file unchanged', async () => {
    const zipFile = new File([new Uint8Array([1, 2, 3])], 'helper.zip', { type: 'application/zip' });

    const result = await packageUploadEntries([{ file: zipFile, path: zipFile.name }]);

    expect(result).toBe(zipFile);
  });

  it('wraps folder entries into a zip archive', async () => {
    const result = await packageUploadEntries([
      textFile('folder/SKILL.md', '# helper'),
      textFile('folder/notes.txt', 'hello'),
    ]);

    expect(result.name).toBe('folder.zip');
    expect(result.type).toBe('application/zip');

    const zip = new AdmZip(Buffer.from(await result.arrayBuffer()));
    expect(zip.getEntry('folder/SKILL.md')).toBeTruthy();
    expect(zip.readAsText('folder/SKILL.md')).toBe('# helper');
    expect(zip.getEntry('folder/notes.txt')).toBeTruthy();
    expect(zip.readAsText('folder/notes.txt')).toBe('hello');
  });
});
