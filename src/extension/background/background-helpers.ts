const DEFAULT_WS_PORT = 3100;

interface ContextPayload {
  context?: Record<string, unknown>;
  [key: string]: unknown;
}

interface LanhuContextState {
  currentProjectId: string | null;
  currentScreenId: string | null;
}

interface LanhuContextInput {
  projectId?: string;
  screenId?: string;
}

interface LanhuContextUpdate extends LanhuContextState {
  changed: boolean;
}

export function normalizeWsPort(value: unknown, fallback = DEFAULT_WS_PORT): number {
  const port = typeof value === 'number'
    ? value
    : parseInt(String(value ?? ''), 10);

  if (Number.isInteger(port) && port > 0 && port <= 65535) {
    return port;
  }

  return fallback;
}

export function mergeLanhuContext(current: LanhuContextState, incoming: LanhuContextInput): LanhuContextUpdate {
  const next: LanhuContextState = {
    currentProjectId: incoming.projectId || current.currentProjectId,
    currentScreenId: incoming.screenId || current.currentScreenId
  };

  return {
    ...next,
    changed: next.currentProjectId !== current.currentProjectId || next.currentScreenId !== current.currentScreenId
  };
}

export function pickDataResponse(requestType: string, current: unknown, candidate: unknown): unknown {
  if (!isCandidateResponse(candidate)) {
    return current;
  }
  if (!isCandidateResponse(current)) {
    return candidate;
  }

  if (Array.isArray(current) && Array.isArray(candidate)) {
    if (current.length === 0 && candidate.length > 0) {
      return candidate;
    }
    return current;
  }

  if (requestType === 'screen' && hasAxureSource(candidate) && !hasAxureSource(current)) {
    return candidate;
  }

  return current;
}

export function getPayloadContext(payload: ContextPayload): LanhuContextInput {
  const context = payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)
    ? payload.context
    : {};
  const data = payload.data && typeof payload.data === 'object' && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : {};

  const projectId = stringId(context.projectId ?? data.projectId);
  const screenId = stringId(context.screenId ?? data.screenId);

  return {
    ...(projectId ? { projectId } : {}),
    ...(screenId ? { screenId } : {})
  };
}

export function addCurrentContext<T extends ContextPayload>(
  payload: T,
  currentProjectId: string | null,
  currentScreenId: string | null
): T {
  const existingContext = payload.context && typeof payload.context === 'object' && !Array.isArray(payload.context)
    ? payload.context
    : {};
  const context: Record<string, unknown> = { ...existingContext };

  if (!context.projectId && currentProjectId) {
    context.projectId = currentProjectId;
  }
  if (!context.screenId && currentScreenId) {
    context.screenId = currentScreenId;
  }

  if (Object.keys(context).length === 0) {
    return { ...payload };
  }

  return {
    ...payload,
    context
  };
}

function stringId(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value : undefined;
}

function isCandidateResponse(value: unknown): boolean {
  return value !== undefined
    && value !== null
    && !(typeof value === 'object' && !Array.isArray(value) && 'error' in value);
}

function hasAxureSource(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value) && (value as Record<string, unknown>).source === 'axure-html');
}
