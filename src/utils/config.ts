// Server configuration

import type { ServerConfig } from '../shared/types.js';
import { setLogLevel } from './logger.js';

const DEFAULT_WS_PORT = 3100;
const DEFAULT_HTTP_PORT = 3200;

export function getConfig(): ServerConfig {
  const parsedPort = Number(process.env.LANHU_WS_PORT || DEFAULT_WS_PORT);
  const wsPort = Number.isInteger(parsedPort) && parsedPort > 0 && parsedPort < 65536 ? parsedPort : DEFAULT_WS_PORT;
  const httpPort = parseInt(process.env.LANHU_HTTP_PORT || '', 10) || DEFAULT_HTTP_PORT;
  const logLevel = (process.env.LANHU_LOG_LEVEL as ServerConfig['logLevel']) || 'info';

  setLogLevel(logLevel);

  return {
    wsPort,
    httpPort,
    logLevel
  };
}