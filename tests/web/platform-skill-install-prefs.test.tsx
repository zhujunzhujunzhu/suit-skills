// @vitest-environment jsdom

import React, { act, useEffect } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { useLocalStorage } from '../../apps/platform-web/src/hooks/useLocalStorage';

const INSTALL_SCOPE_STORAGE_KEY = 'suit-skills-platform-install-scope';
const INSTALL_TARGETS_STORAGE_KEY = 'suit-skills-platform-install-targets';

type InstallScope = 'global' | 'local';
type HookState = {
  scope: InstallScope;
  targets: string[];
  setScope: (value: InstallScope) => void;
  setTargets: (value: string[]) => void;
};

function Probe({ onReady }: { onReady: (state: HookState) => void }) {
  const [scope, setScope] = useLocalStorage<InstallScope>(INSTALL_SCOPE_STORAGE_KEY, 'global');
  const [targets, setTargets] = useLocalStorage<string[]>(INSTALL_TARGETS_STORAGE_KEY, ['agents']);

  useEffect(() => {
    onReady({ scope, targets, setScope, setTargets });
  }, [onReady, scope, setScope, setTargets, targets]);

  return null;
}

describe('platform skill install preferences', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    localStorage.clear();
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = false;
    act(() => {
      root.unmount();
    });
    container.remove();
    localStorage.clear();
  });

  it('persists the chosen install scope and targets', async () => {
    let state!: HookState;

    await act(async () => {
      root.render(<Probe onReady={(next) => { state = next; }} />);
    });

    expect(state.scope).toBe('global');
    expect(state.targets).toEqual(['agents']);

    await act(async () => {
      state.setScope('local');
      state.setTargets(['codex', 'cursor']);
    });

    expect(localStorage.getItem(INSTALL_SCOPE_STORAGE_KEY)).toBe('"local"');
    expect(localStorage.getItem(INSTALL_TARGETS_STORAGE_KEY)).toBe('["codex","cursor"]');
  });

  it('rehydrates stored values on mount', async () => {
    localStorage.setItem(INSTALL_SCOPE_STORAGE_KEY, '"local"');
    localStorage.setItem(INSTALL_TARGETS_STORAGE_KEY, JSON.stringify(['codex', 'cursor']));

    let state!: HookState;

    await act(async () => {
      root.render(<Probe onReady={(next) => { state = next; }} />);
    });

    expect(state.scope).toBe('local');
    expect(state.targets).toEqual(['codex', 'cursor']);
    expect(localStorage.getItem(INSTALL_SCOPE_STORAGE_KEY)).toBe('"local"');
    expect(localStorage.getItem(INSTALL_TARGETS_STORAGE_KEY)).toBe('["codex","cursor"]');
  });
});
