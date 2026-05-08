// WebSocket message protocol between Chrome extension and MCP Server

export type MessageType =
  | 'HANDSHAKE'           // Extension -> Server: initial connection
  | 'HANDSHAKE_ACK'       // Server -> Extension: acknowledge connection
  | 'PING'                // Heartbeat ping
  | 'PONG'                // Heartbeat response
  | 'DATA_UPDATE'         // Extension -> Server: push data updates
  | 'DATA_REQUEST'        // Server -> Extension: request data
  | 'DATA_RESPONSE'       // Extension -> Server: respond to data request
  | 'ERROR';              // Error message

export interface WSMessage<T = unknown> {
  id: string;           // Message ID (UUID-like)
  type: MessageType;
  payload: T;
  timestamp: number;
}

// Handshake
export interface HandshakePayload {
  extensionVersion: string;
  userId?: string;
  tabId?: number;
}

export interface HandshakeAckPayload {
  serverVersion: string;
  wsPort: number;
}

// Data types that can be pushed/requested
export type DataType = 'project' | 'screen' | 'layer' | 'asset' | 'prototype' | 'comment';

export type DataAction = 'create' | 'update' | 'delete' | 'cache' | 'full';

// Data update push (Extension -> Server)
export interface DataUpdatePayload {
  dataType: DataType;
  action: DataAction;
  data: unknown;
  context?: {
    projectId?: string;
    screenId?: string;
  };
}

// Data request (Server -> Extension)
export interface DataRequestPayload {
  requestType: string;
  params: Record<string, unknown>;
}

export interface DataResponsePayload {
  requestId: string;
  success: boolean;
  data?: unknown;
  error?: string;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// Helper to create messages
export function createMessage<T>(type: MessageType, payload: T, id?: string): WSMessage<T> {
  return {
    id: id || generateId(),
    type,
    payload,
    timestamp: Date.now()
  };
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}