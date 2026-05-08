#!/usr/bin/env node
// Main entry point - starts MCP Server and WebSocket Server

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { info, error } from './utils/logger.js';
import { getConfig } from './utils/config.js';
import { WebSocketServer } from './server/websocket-server.js';
import { DataStore } from './server/data-store.js';
import { createMcpServer } from './server/mcp-server.js';
import { cacheLanhuData } from './server/cache-lanhu-data.js';

async function main(): Promise<void> {
  const config = getConfig();
  info('Starting Lanhu MCP Server...');
  info(`WebSocket port: ${config.wsPort}`);

  // Create data store
  const dataStore = new DataStore();

  // Create WebSocket server for extension communication
  const wsServer = new WebSocketServer(config);

  // Handle data updates from extension
  wsServer.onDataUpdate((dataType: string, data: unknown, context?: Record<string, unknown>) => {
    info(`Received data update: ${dataType}`);
    cacheLanhuData(dataStore, dataType, data, context || {});
  });

  // Create MCP server with tools and resources
  const mcpServer = createMcpServer(dataStore, wsServer);

  // Connect with stdio transport for CLI tools (Claude Code, Codex, etc.)
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);

  info('MCP Server connected via stdio - ready for AI clients');
  info('Waiting for Chrome extension connection...');

  // Handle graceful shutdown
  process.on('SIGINT', () => {
    info('Received SIGINT, shutting down...');
    wsServer.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    info('Received SIGTERM, shutting down...');
    wsServer.close();
    process.exit(0);
  });
}

main().catch((err) => {
  error('Fatal error:', err);
  process.exit(1);
});
