import type { TFunction } from 'i18next';

/** 与 API 返回的 message 完全一致，用于 state 比较，勿改为翻译文案 */
export const RAW_API = {
  SKILL_NOT_FOUND: 'Skill not found',
} as const;

const EXACT_KEY: Record<string, string> = {
  'Skill not found': 'apiErrors.skillNotFound',
  'Skill not installed': 'apiErrors.skillNotInstalled',
  'Source not found': 'apiErrors.sourceNotFound',
  'API route not found': 'apiErrors.apiRouteNotFound',
  'Install target is required': 'apiErrors.installTargetRequired',
  'Invalid skill name': 'apiErrors.invalidSkillName',
  'Skill name is required': 'apiErrors.skillNameRequired',
  'Source name is required': 'apiErrors.sourceNameRequired',
  'Source name may only contain letters, numbers, dot, underscore, and dash':
    'apiErrors.sourceNameInvalid',
  'Source URL is required': 'apiErrors.sourceUrlRequired',
  'Source already exists': 'apiErrors.sourceAlreadyExists',
  'Cannot remove default source': 'apiErrors.cannotRemoveDefaultSource',
  'Cannot remove the last enabled source': 'apiErrors.cannotRemoveLastSource',
  'Cannot disable the last enabled source': 'apiErrors.cannotDisableLastSource',
  'Resolved skill path is outside the install target': 'apiErrors.pathNotAllowed',
  'Source target already has this skill': 'apiErrors.sourceTargetHasSkill',
  'Target already has this skill': 'apiErrors.targetHasSkill',
  'Request body too large': 'apiErrors.payloadTooLarge',
  'Copying a file to the clipboard is currently supported on Windows only':
    'apiErrors.clipboardWindowsOnly',
  'Install target id must be 2–48 chars (letters, digits, hyphen)':
    'apiErrors.installTargetIdLength',
  'Install target id must start with a letter': 'apiErrors.installTargetIdLetter',
  'globalDir and projectDir must start with ~/ or ./ and must not contain ..':
    'apiErrors.installTargetPath',
  'Cannot remove built-in install target': 'apiErrors.cannotRemoveBuiltinTarget',
};

export function translateApiError(t: TFunction, message: string): string {
  const key = EXACT_KEY[message];
  if (key) return t(key);

  if (message.startsWith('Invalid scope: ')) {
    return t('apiErrors.invalidScope', {
      scope: message.slice('Invalid scope: '.length),
    });
  }
  if (message.startsWith('Unknown install target: ')) {
    return t('apiErrors.unknownInstallTarget', {
      target: message.slice('Unknown install target: '.length),
    });
  }
  if (message.startsWith('Invalid JSON body: ')) {
    return t('apiErrors.invalidJson', {
      detail: message.slice('Invalid JSON body: '.length),
    });
  }
  if (message.startsWith('Invalid install strategy: ')) {
    return t('apiErrors.invalidInstallStrategy', {
      strategy: message.slice('Invalid install strategy: '.length),
    });
  }
  if (message.startsWith('Failed to create symlink: ')) {
    return t('apiErrors.symlinkFailed', {
      detail: message.slice('Failed to create symlink: '.length),
    });
  }
  if (message.startsWith('Linked to ')) {
    return t('apiErrors.linkedTo', { path: message.slice('Linked to '.length) });
  }
  if (message.startsWith('Reserved install target id: ')) {
    return t('apiErrors.installTargetReserved', {
      id: message.slice('Reserved install target id: '.length).trim(),
    });
  }
  if (message.startsWith('Install target already exists: ')) {
    return t('apiErrors.installTargetExists', {
      id: message.slice('Install target already exists: '.length).trim(),
    });
  }
  if (message.startsWith('Cannot remove built-in install target: ')) {
    return t('apiErrors.cannotRemoveBuiltinTarget');
  }

  return message;
}
