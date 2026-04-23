import type { Command } from 'commander';
import type { CliContext } from '../cli/context.js';
import { getAiEditConfig, getTranslationConfig } from '../lib/config.js';
import {
  getWebSettings,
  listWebInstalledSkills,
  listWebInstallTargets,
  listWebSkillsSnapshot,
  listWebSources,
} from '../lib/web/api.js';

export function registerDesktopBootstrap(
  program: Command,
  ctx: CliContext,
): void {
  program
    .command('desktop-bootstrap')
    .description('Read desktop app bootstrap data in a single payload')
    .option('--json', 'output as JSON')
    .action((opts: { json?: boolean }) => {
      const config = ctx.loadConfig();
      const payload = {
        sources: listWebSources(ctx),
        settings: getWebSettings(ctx),
        installTargets: listWebInstallTargets(ctx),
        skills: listWebSkillsSnapshot(ctx, { source: 'all' }),
        installed: listWebInstalledSkills(ctx, { scope: 'all' }),
        translationConfig: getTranslationConfig(config),
        aiEditConfig: getAiEditConfig(config),
      };

      if (opts.json) {
        console.log(JSON.stringify(payload, null, 2));
        return;
      }

      console.log(
        [
          `sources:${payload.sources.sources.length}`,
          `targets:${payload.installTargets.targets.length}`,
          `translation:${payload.translationConfig.provider}`,
          `ai-edit:${payload.aiEditConfig.provider}`,
        ].join('\t'),
      );
    });
}
