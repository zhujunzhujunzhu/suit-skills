export function validateSkillName(name: string): boolean {
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(name);
}

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
