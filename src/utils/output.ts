const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const RESET = '\x1b[0m';

function useColorFor(stream: NodeJS.WriteStream): boolean {
  if (process.env.NO_COLOR != null && process.env.NO_COLOR !== '') {
    return false;
  }
  if (process.env.FORCE_COLOR === '1' || process.env.FORCE_COLOR === 'true') {
    return true;
  }
  return stream.isTTY === true;
}

/** 成功消息：前缀 U+2714，TTY 下绿色 */
export function success(message: string): void {
  const line = `\u2714 ${message}`;
  if (useColorFor(process.stdout)) {
    console.log(`${GREEN}${line}${RESET}`);
    return;
  }
  console.log(line);
}

/** 警告消息：前缀 U+26A0，TTY 下黄色 */
export function warn(message: string): void {
  const line = `\u26A0 ${message}`;
  if (useColorFor(process.stdout)) {
    console.log(`${YELLOW}${line}${RESET}`);
    return;
  }
  console.log(line);
}

/** 错误消息：前缀 U+2716，TTY 下红色，写入 stderr */
export function error(message: string): void {
  const line = `\u2716 ${message}`;
  if (useColorFor(process.stderr)) {
    console.error(`${RED}${line}${RESET}`);
    return;
  }
  console.error(line);
}
