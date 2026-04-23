import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const tauriGetSkillsList = vi.fn();
const tauriGetSkillDetail = vi.fn();
const tauriGetInstalledSkills = vi.fn();
const tauriGetDesktopBootstrap = vi.fn();
const tauriGetConfigValue = vi.fn();
const tauriSetConfigValue = vi.fn();
const tauriInstallSkill = vi.fn();

vi.mock('../../web/src/api/tauri.ts', () => ({
  tauriGetConfigValue,
  tauriGetDesktopBootstrap,
  tauriGetInstalledSkills,
  tauriGetSkillDetail,
  tauriGetSkillsList,
  tauriInstallSkill,
  tauriSetConfigValue,
}));

function setWindow(isTauri: boolean): void {
  const win = {
    location: { origin: 'http://localhost:1420' },
  } as Record<string, unknown>;
  if (isTauri) {
    win.__TAURI__ = true;
  }
  vi.stubGlobal('window', win);
}

describe('web api client performance guards', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reuses the Tauri installed cache across skill list and detail requests', async () => {
    setWindow(true);
    const { fetchSkillDetail, fetchSkills } = await import('../../web/src/api/client.ts');
    tauriGetSkillsList.mockResolvedValue({
      items: [{ name: 'alpha', sourceName: 'default', tags: [] }],
    });
    tauriGetSkillDetail.mockResolvedValue({
      name: 'alpha',
      sourceName: 'default',
      markdown: '# alpha',
      tags: [],
    });
    tauriGetInstalledSkills.mockResolvedValue({
      items: [{ name: 'alpha', target: 'claude', scope: 'global', path: '/tmp/alpha' }],
    });

    const skills = await fetchSkills({ source: 'all' });
    const detail = await fetchSkillDetail('alpha', 'all');

    expect(skills.items[0]).toMatchObject({
      name: 'alpha',
      installed: true,
      installedTargets: ['claude'],
    });
    expect(detail).toMatchObject({
      name: 'alpha',
      installed: true,
      installedTargets: ['claude'],
    });
    expect(tauriGetInstalledSkills).toHaveBeenCalledTimes(1);
  });

  it('invalidates the Tauri installed cache after a mutation', async () => {
    setWindow(true);
    const { fetchSkillDetail, fetchSkills, installSkill } = await import('../../web/src/api/client.ts');
    tauriGetSkillsList.mockResolvedValue({
      items: [{ name: 'alpha', sourceName: 'default', tags: [] }],
    });
    tauriGetSkillDetail.mockResolvedValue({
      name: 'alpha',
      sourceName: 'default',
      markdown: '# alpha',
      tags: [],
    });
    tauriGetInstalledSkills
      .mockResolvedValueOnce({
        items: [{ name: 'alpha', target: 'claude', scope: 'global', path: '/tmp/alpha' }],
      })
      .mockResolvedValueOnce({
        items: [{ name: 'alpha', target: 'codex', scope: 'global', path: '/tmp/alpha' }],
      });
    tauriInstallSkill.mockResolvedValue(undefined);

    await fetchSkills({ source: 'all' });
    await installSkill({
      identifier: 'alpha',
      targets: ['codex'],
      global: true,
    });
    const detail = await fetchSkillDetail('alpha', 'all');

    expect(detail.installedTargets).toEqual(['codex']);
    expect(tauriGetInstalledSkills).toHaveBeenCalledTimes(2);
  });

  it('preserves AbortError instead of wrapping it as a network failure', async () => {
    setWindow(false);
    const { fetchSkills } = await import('../../web/src/api/client.ts');
    const abortError = new Error('The operation was aborted.');
    abortError.name = 'AbortError';
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(abortError));

    await expect(
      fetchSkills(
        { source: 'all' },
        { signal: new AbortController().signal },
      ),
    ).rejects.toMatchObject({ name: 'AbortError' });
  });

  it('hydrates desktop bootstrap data in one Tauri request', async () => {
    setWindow(true);
    const { fetchDesktopBootstrap } = await import('../../web/src/api/client.ts');
    tauriGetDesktopBootstrap.mockResolvedValue({
      sources: {
        defaultSource: 'default',
        sources: [
          {
            name: 'default',
            url: 'https://example.com/default.git',
            enabled: true,
          },
        ],
      },
      settings: {
        sourceRefreshIntervalMinutes: 9,
        minimizeToTray: true,
        themeMode: 'custom',
        themeColor: '#abc',
      },
      installTargets: {
        library: {
          id: 'agents',
          label: 'Agents',
          globalDir: '~/.agents/skills',
          projectDir: './.agents/skills',
          globalPath: '/global/.agents/skills',
          projectPath: '/project/.agents/skills',
          globalExists: true,
          projectExists: false,
        },
        targets: [
          {
            id: 'agents',
            label: 'Agents',
            globalExists: true,
            projectExists: false,
          },
        ],
      },
      translationConfig: {
        provider: 'cli',
        cliCommand: 'translate-cli',
        cliArgs: ['--brief'],
      },
      aiEditConfig: {
        provider: 'openai',
        apiBaseUrl: 'https://api.example.test/v1',
        model: 'gpt-5',
      },
    });

    const bootstrap = await fetchDesktopBootstrap();

    expect(bootstrap).toMatchObject({
      sources: {
        defaultSource: 'default',
        sources: [
          {
            name: 'default',
            builtin: false,
            effectiveUrl: 'https://example.com/default.git',
          },
        ],
      },
      settings: {
        sourceRefreshIntervalMinutes: 9,
        minimizeToTray: true,
        themeMode: 'custom',
        themeColor: '#aabbcc',
      },
      translationConfig: {
        provider: 'cli',
        cliCommand: 'translate-cli',
        cliArgs: ['--brief'],
      },
      aiEditConfig: {
        provider: 'openai',
        apiBaseUrl: 'https://api.example.test/v1',
        model: 'gpt-5',
      },
    });
    expect(tauriGetDesktopBootstrap).toHaveBeenCalledTimes(1);
  });
});
