// WebSocket Server for Chrome extension communication

import { WebSocketServer as WSServer, WebSocket } from 'ws';
import { debug, info, warn, error } from '../utils/logger.js';
import {
  WSMessage,
  MessageType,
  HandshakePayload,
  HandshakeAckPayload,
  DataUpdatePayload,
  DataRequestPayload,
  DataResponsePayload,
  createMessage
} from '../shared/ws-protocol.js';
import type { ServerConfig } from '../shared/types.js';

interface ConnectedClient {
  ws: WebSocket;
  userId?: string;
  tabId?: number;
  extensionVersion?: string;
  lastPing: number;
}

type DataHandler = (dataType: string, data: unknown, context?: Record<string, unknown>) => void;
type RequestHandler = (requestType: string, params: Record<string, unknown>) => Promise<unknown>;

export class WebSocketServer {
  private wss?: WSServer;
  private clients: Map<string, ConnectedClient> = new Map();
  private dataHandlers: DataHandler[] = [];
  private requestHandlers: Map<string, RequestHandler> = new Map();
  private pendingRequests: Map<string, { resolve: (value: unknown) => void; reject: (err: Error) => void; timeout: NodeJS.Timeout }> = new Map();
  private heartbeatInterval?: NodeJS.Timeout;
  private retryTimer?: NodeJS.Timeout;
  private listening = false;
  private isClosing = false;
  private config: ServerConfig;

  constructor(config: ServerConfig) {
    this.config = config;
    this.bindServer();
    this.startHeartbeat();
  }

  private bindServer(): void {
    if (this.isClosing) {
      return;
    }

    const wss = new WSServer({ port: this.config.wsPort });
    this.wss = wss;
    this.listening = false;
    this.setupServer(wss);
  }

  private setupServer(wss: WSServer): void {
    wss.on('listening', () => {
      if (this.wss !== wss) {
        return;
      }
      this.listening = true;
      info(`WebSocket server started on port ${this.config.wsPort}`);
    });

    wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      const client: ConnectedClient = {
        ws,
        lastPing: Date.now()
      };
      this.clients.set(clientId, client);
      info(`Client connected: ${clientId}`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString()) as WSMessage;
          this.handleMessage(clientId, client, message);
        } catch (err) {
          error(`Failed to parse message from ${clientId}:`, err);
        }
      });

      ws.on('close', () => {
        info(`Client disconnected: ${clientId}`);
        this.clients.delete(clientId);
      });

      ws.on('error', (err) => {
        error(`WebSocket error for ${clientId}:`, err);
        this.clients.delete(clientId);
      });
    });

    wss.on('error', (err) => {
      this.listening = false;

      if (this.wss === wss && isAddressInUseError(err)) {
        warn(`WebSocket server could not bind port ${this.config.wsPort}: address already in use`);
        this.wss = undefined;
        this.scheduleBindRetry();
        return;
      }

      error('WebSocket server error:', err);
    });
  }

  private scheduleBindRetry(): void {
    if (this.isClosing || this.retryTimer) {
      return;
    }

    warn(`WebSocket port ${this.config.wsPort} is in use; retrying in 1s`);
    this.retryTimer = setTimeout(() => {
      this.retryTimer = undefined;
      this.bindServer();
    }, 1000);
  }

  private handleMessage(clientId: string, client: ConnectedClient, message: WSMessage): void {
    debug(`Received ${message.type} from ${clientId}`);

    switch (message.type) {
      case 'HANDSHAKE':
        this.handleHandshake(clientId, client, message.payload as HandshakePayload);
        break;

      case 'PING':
        client.lastPing = Date.now();
        this.send(client, createMessage('PONG', { timestamp: Date.now() }));
        break;

      case 'PONG':
        client.lastPing = Date.now();
        break;

      case 'DATA_UPDATE':
        this.handleDataUpdate(message.payload as DataUpdatePayload);
        break;

      case 'DATA_RESPONSE':
        this.handleDataResponse(message.payload as DataResponsePayload);
        break;

      default:
        warn(`Unknown message type: ${message.type}`);
    }
  }

  private handleHandshake(clientId: string, client: ConnectedClient, payload: HandshakePayload): void {
    client.extensionVersion = payload.extensionVersion;
    client.userId = payload.userId;
    client.tabId = payload.tabId;

    const ack: HandshakeAckPayload = {
      serverVersion: '1.0.0',
      wsPort: this.config.wsPort
    };
    this.send(client, createMessage('HANDSHAKE_ACK', ack));
    info(`Handshake completed with ${clientId}, extension version: ${payload.extensionVersion}`);
  }

  private handleDataUpdate(payload: DataUpdatePayload): void {
    debug(`Data update: ${payload.dataType} action=${payload.action}`);
    for (const handler of this.dataHandlers) {
      handler(payload.dataType, payload.data, payload.context);
    }
  }

  private handleDataResponse(payload: DataResponsePayload): void {
    const pending = this.pendingRequests.get(payload.requestId);
    if (!pending) {
      warn(`Received response for unknown request: ${payload.requestId}`);
      return;
    }

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(payload.requestId);

    if (payload.success) {
      pending.resolve(payload.data);
    } else {
      pending.reject(new Error(payload.error || 'Request failed'));
    }
  }

  private send(client: ConnectedClient, message: WSMessage): void {
    if (client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(JSON.stringify(message));
    }
  }

  private generateClientId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [clientId, client] of this.clients) {
        if (now - client.lastPing > 30000) {
          warn(`Client ${clientId} timed out, closing connection`);
          client.ws.terminate();
          this.clients.delete(clientId);
        } else if (client.ws.readyState === WebSocket.OPEN) {
          this.send(client, createMessage('PING', { timestamp: now }));
        }
      }
    }, 10000);
  }

  // Register handler for data updates from extension
  onDataUpdate(handler: DataHandler): void {
    this.dataHandlers.push(handler);
  }

  // Register handler for specific request types
  onRequest(requestType: string, handler: RequestHandler): void {
    this.requestHandlers.set(requestType, handler);
  }

  // Request data from extension
  async requestData(requestType: string, params: Record<string, unknown>, timeoutMs = 10000): Promise<unknown> {
    const client = this.getFirstConnectedClient();
    if (!client) {
      throw new Error('No connected extension client');
    }

    const requestId = this.generateClientId();
    const request: DataRequestPayload = {
      requestType,
      params
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request ${requestType} timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      this.send(client, createMessage('DATA_REQUEST', request, requestId));
    });
  }

  private getFirstConnectedClient(): ConnectedClient | undefined {
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN && client.userId) {
        return client;
      }
    }
    // Return any connected client even without userId (might be connecting)
    for (const client of this.clients.values()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        return client;
      }
    }
    return undefined;
  }

  // Check if there's a connected client
  hasConnectedClient(): boolean {
    return this.clients.size > 0;
  }

  // Get connection status
  getStatus(): {
    connected: number;
    listening: boolean;
    wsPort: number;
    clients: Array<{ userId?: string; extensionVersion?: string }>;
  } {
    return {
      connected: this.clients.size,
      listening: this.listening,
      wsPort: this.config.wsPort,
      clients: Array.from(this.clients.values()).map(c => ({
        userId: c.userId,
        extensionVersion: c.extensionVersion
      }))
    };
  }

  // Cleanup
  close(): void {
    this.isClosing = true;
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = undefined;
    }
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    for (const client of this.clients.values()) {
      client.ws.close();
    }
    this.wss?.close();
    this.listening = false;
    info('WebSocket server closed');
  }
}

function isAddressInUseError(err: Error): boolean {
  return (err as NodeJS.ErrnoException).code === 'EADDRINUSE';
}
