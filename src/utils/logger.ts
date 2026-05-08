// Logger utility - uses console.error to avoid interfering with MCP stdio

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

let currentLevel: LogLevel = 'info';

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function debug(message: string, ...args: unknown[]): void {
  if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.debug) {
    console.error(`[DEBUG] ${message}`, ...args);
  }
}

export function info(message: string, ...args: unknown[]): void {
  if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.info) {
    console.error(`[INFO] ${message}`, ...args);
  }
}

export function warn(message: string, ...args: unknown[]): void {
  if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.warn) {
    console.error(`[WARN] ${message}`, ...args);
  }
}

export function error(message: string, ...args: unknown[]): void {
  if (LOG_LEVELS[currentLevel] <= LOG_LEVELS.error) {
    console.error(`[ERROR] ${message}`, ...args);
  }
}