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

/** Print a success message with color when the terminal supports it. */
export function success(message: string): void {
  const line = `[OK] ${message}`;
  if (useColorFor(process.stdout)) {
    console.log(`${GREEN}${line}${RESET}`);
    return;
  }
  console.log(line);
}

/** Print a warning message with color when the terminal supports it. */
export function warn(message: string): void {
  const line = `[WARN] ${message}`;
  if (useColorFor(process.stderr)) {
    console.error(`${YELLOW}${line}${RESET}`);
    return;
  }
  console.error(line);
}

/** Print an error message with color when the terminal supports it. */
export function error(message: string): void {
  const line = `[ERROR] ${message}`;
  if (useColorFor(process.stderr)) {
    console.error(`${RED}${line}${RESET}`);
    return;
  }
  console.error(line);
}
