import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { success, warn, error } from './output.js';

describe('output', () => {
  const prevNoColor = process.env.NO_COLOR;
  const prevForce = process.env.FORCE_COLOR;

  beforeEach(() => {
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '1';
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (prevNoColor === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = prevNoColor;
    if (prevForce === undefined) delete process.env.FORCE_COLOR;
    else process.env.FORCE_COLOR = prevForce;
  });

  it('成功：含对勾与绿色 ANSI', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((m: unknown) => {
      lines.push(String(m));
    });
    success('ok');
    const t = lines[0] ?? '';
    expect(t).toContain('\u2714');
    expect(t).toContain('\x1b[32m');
  });

  it('警告：含三角叹号与黄色 ANSI', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((m: unknown) => {
      lines.push(String(m));
    });
    warn('careful');
    const t = lines[0] ?? '';
    expect(t).toContain('\u26A0');
    expect(t).toContain('\x1b[33m');
  });

  it('错误：含叉与红色 ANSI（stderr）', () => {
    const lines: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((m: unknown) => {
      lines.push(String(m));
    });
    error('bad');
    const t = lines[0] ?? '';
    expect(t).toContain('\u2716');
    expect(t).toContain('\x1b[31m');
  });
});
