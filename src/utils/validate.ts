/**
 * 校验 skill 名称是否合法。
 * 规则：仅允许小写字母、数字、短横线，且不能以短横线开头或结尾。
 */
export function validateSkillName(name: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name);
}

/** 解析 skill 标识符，支持 name@version 格式 */
export function parseSkillIdentifier(
  identifier: string,
): { name: string; version?: string } {
  const atIndex = identifier.indexOf('@');
  if (atIndex === -1) {
    return { name: identifier };
  }
  return {
    name: identifier.slice(0, atIndex),
    version: identifier.slice(atIndex + 1),
  };
}
