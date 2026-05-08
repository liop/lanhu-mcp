// WebSocket message protocol (shared with MCP server)

export type MessageType =
  | 'HANDSHAKE'
  | 'HANDSHAKE_ACK'
  | 'PING'
  | 'PONG'
  | 'DATA_UPDATE'
  | 'DATA_REQUEST'
  | 'DATA_RESPONSE'
  | 'ERROR';

export interface WSMessage<T = unknown> {
  id: string;
  type: MessageType;
  payload: T;
  timestamp: number;
}

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