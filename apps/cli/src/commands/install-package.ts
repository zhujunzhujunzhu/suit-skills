import AdmZip from 'adm-zip';
import {
  existsSync,
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import {
  basename,
  dirname,
  isAbsolute,
  join,
  normalize,
  resolve,
  sep,
} from 'node:path';
import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { toAbsoluteInstallRoot } from '../cli/paths.js';
import { resolveInstallTargetsOrPrompt } from '../cli/prompt-install-targets.js';
import {
  createSymlink,
  getEffectiveInstallTargets,
  installSkillWithConflict,
  readSkillMarkdownMetadata,
  resolveDisplayPathForToken,
  validateSkillName,
} from '@suit-skills/core';
import { success, warn } from '../utils/output.js';

const CENTRAL_STORE_AGENT = 'agents';

interface InstallPackageOptions {
  local?: boolean;
  global?: boolean;
  agent?: string;
  env?: string;
  strategy?: string;
}

interface PreparedPackage {
  cacheRoot: string;
  skillName: string;
}

export function registerInstallPackage(program: Command, ctx: CliContext): void {
  program
    .command('install-package')
    .description('Install a skill from a zip package URL or local zip file')
    .argument('<packageRef>', 'http(s) URL or local .zip file')
    .option('--local', 'install to current project instead of global')
    .option('-g, --global', 'install to global targets')
    .option('--agent <name>', 'only this agent (overrides installTargets)')
    .option(
      '--env <csv>',
      'comma-separated targets for this run only (skills,claude,...)',
    )
    .option(
      '--strategy <mode>',
      'on conflict: overwrite | skip | rename',
      'overwrite',
    )
    .action(async (packageRef: string, opts: InstallPackageOptions) => {
      if (opts.local && opts.global) {
        throw new Error('Use either --local or --global, not both');
      }

      const tempRoot = mkdtempSync(join(tmpdir(), 'suit-skills-package-'));
      try {
        const zipPath = await materializePackage(packageRef, tempRoot, ctx.cwd);
        const prepared = preparePackageCache(zipPath, tempRoot);
        await installPreparedPackage(ctx, prepared, opts);
      } finally {
        rmSync(tempRoot, { recursive: true, force: true });
      }
    });
}

async function materializePackage(
  packageRef: string,
  tempRoot: string,
  cwd: string,
): Promise<string> {
  const trimmed = packageRef.trim();
  if (!trimmed) {
    throw new Error('Package URL or file path is required');
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const response = await fetch(trimmed);
    if (!response.ok) {
      throw new Error(`Failed to download package: HTTP ${response.status}`);
    }
    const buffer = Buffer.from(await response.arrayBuffer());
    const fileName = safePackageFileName(
      contentDispositionFileName(response.headers.get('content-disposition')) ??
        basename(new URL(trimmed).pathname) ??
        'skill-package.zip',
    );
    const outputPath = join(tempRoot, fileName);
    writeFileSync(outputPath, buffer);
    return outputPath;
  }

  const filePath = isAbsolute(trimmed) ? trimmed : resolve(cwd, trimmed);
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    throw new Error(`Package file not found: ${filePath}`);
  }
  return filePath;
}

function preparePackageCache(zipPath: string, tempRoot: string): PreparedPackage {
  const extractedRoot = join(tempRoot, 'extracted');
  const cacheRoot = join(tempRoot, 'cache');
  mkdirSync(extractedRoot, { recursive: true });
  mkdirSync(cacheRoot, { recursive: true });
  extractZip(zipPath, extractedRoot);

  const skillDir = findPackagedSkillDir(extractedRoot);
  if (!skillDir) {
    throw new Error('Package must include a skill directory with SKILL.md or meta.json');
  }

  const metadata = readSkillMarkdownMetadata(skillDir);
  const skillName = metadata.meta.name;
  if (!validateSkillName(skillName)) {
    throw new Error('Invalid skill name in package');
  }
  if (metadata.meta.version === 'unknown' && metadata.metadataSource === 'unknown') {
    throw new Error('Package skill metadata is incomplete');
  }

  const cachedSkillDir = join(cacheRoot, skillName);
  copyExtractedSkill(skillDir, cachedSkillDir);
  return { cacheRoot, skillName };
}

function extractZip(zipPath: string, outputRoot: string): void {
  const zip = new AdmZip(zipPath);
  const root = resolve(outputRoot);
  for (const entry of zip.getEntries()) {
    const normalized = normalize(entry.entryName);
    const target = resolve(root, normalized);
    if (target !== root && !target.startsWith(`${root}${sep}`)) {
      throw new Error('Zip package contains an unsafe path');
    }
    if (entry.isDirectory) {
      mkdirSync(target, { recursive: true });
      continue;
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, entry.getData());
  }
}

function findPackagedSkillDir(root: string): string | null {
  if (hasSkillEntry(root)) {
    return root;
  }
  const queue: Array<{ dir: string; depth: number }> = [{ dir: root, depth: 0 }];
  while (queue.length) {
    const current = queue.shift()!;
    if (current.depth > 6) {
      continue;
    }
    for (const entry of readdirSafe(current.dir)) {
      const child = join(current.dir, entry);
      if (!statSync(child).isDirectory()) {
        continue;
      }
      if (hasSkillEntry(child)) {
        return child;
      }
      queue.push({ dir: child, depth: current.depth + 1 });
    }
  }
  return null;
}

function readdirSafe(dir: string): string[] {
  try {
    return readdirSync(dir).sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

function hasSkillEntry(dir: string): boolean {
  return existsSync(join(dir, 'SKILL.md')) || existsSync(join(dir, 'meta.json'));
}

function copyExtractedSkill(src: string, dest: string): void {
  mkdirSync(dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}

async function installPreparedPackage(
  ctx: CliContext,
  prepared: PreparedPackage,
  opts: InstallPackageOptions,
): Promise<void> {
  const config = ctx.loadConfig();
  const isGlobal = opts.local ? false : true;
  let tokens = getEffectiveInstallTargets(
    config,
    {
      agent: opts.agent,
      envCsv: opts.env,
    },
    ctx.cwd,
  );
  if (tokens.length === 0) {
    tokens = await resolveInstallTargetsOrPrompt(ctx, config, isGlobal);
  }

  const strategy = (opts.strategy ?? 'overwrite') as
    | 'overwrite'
    | 'skip'
    | 'rename';

  const centralDisplayTarget = resolveDisplayPathForToken(
    config,
    CENTRAL_STORE_AGENT,
    isGlobal,
  );
  const centralAbsTarget = toAbsoluteInstallRoot(
    centralDisplayTarget,
    ctx.cwd,
    ctx.userHome,
  );

  const centralResult = installSkillWithConflict(
    prepared.cacheRoot,
    centralAbsTarget,
    prepared.skillName,
    strategy,
  );
  if (centralResult.skipped) {
    warn(`[${CENTRAL_STORE_AGENT}] ${centralResult.message ?? 'Skipped'}`);
    return;
  }
  success(`[${CENTRAL_STORE_AGENT}] Installed to ${centralResult.path}`);

  const centralSkillPath = centralResult.path;
  if (!centralSkillPath) {
    return;
  }

  for (const token of tokens) {
    if (token === CENTRAL_STORE_AGENT) {
      continue;
    }
    const displayTarget = resolveDisplayPathForToken(config, token, isGlobal);
    const absTarget = toAbsoluteInstallRoot(displayTarget, ctx.cwd, ctx.userHome);
    const linkPath = join(absTarget, prepared.skillName);

    if (resolve(centralSkillPath) === resolve(linkPath)) {
      continue;
    }

    try {
      createSymlink(centralSkillPath, linkPath);
      success(`[${token}] Linked to ${linkPath}`);
    } catch (e) {
      warn(
        `[${token}] Failed to create symlink: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }
}

function contentDispositionFileName(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/filename\*=UTF-8''([^;]+)|filename="?([^";]+)"?/i);
  const raw = match?.[1] ?? match?.[2];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

function safePackageFileName(value: string): string {
  const clean = basename(value).replace(/[^a-z0-9._-]/gi, '_');
  return clean.toLowerCase().endsWith('.zip') ? clean : `${clean || 'package'}.zip`;
}
