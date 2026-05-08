// Background Service Worker - manages WebSocket connection and network interception

import { createMessage, WSMessage } from '../shared/ws-protocol.js';
import { addCurrentContext, getPayloadContext, mergeLanhuContext, normalizeWsPort, pickDataResponse } from './background-helpers.js';
import { extractLanhuContextFromUrl } from '../shared/url-context.js';

const EXTENSION_VERSION = '1.0.1';
const DEFAULT_WS_PORT = 3100;
const MAX_RECONNECT_ATTEMPTS = 10;
const RECONNECT_DELAY = 2000;

// WebSocket connection state
let ws: WebSocket | null = null;
let isConnected = false;
let reconnectAttempts = 0;
let wsPort = DEFAULT_WS_PORT;

// Current context
let currentProjectId: string | null = null;
let currentScreenId: string | null = null;

// Initialize
void init();

async function init(): Promise<void> {
  setupWebRequestInterceptor();
  setupMessageListener();

  wsPort = await loadWsPort();
  connectWebSocket();

  // Heartbeat
  setInterval(() => {
    if (ws && isConnected) {
      ws.send(JSON.stringify(createMessage('PING', { timestamp: Date.now() })));
    }
  }, 10000);
}

function loadWsPort(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get({ wsPort: DEFAULT_WS_PORT }, (result) => {
      resolve(normalizeWsPort(result.wsPort));
    });
  });
}

// === WebSocket Connection ===

function connectWebSocket(): void {
  const previous = ws;
  if (previous) {
    previous.onopen = null;
    previous.onmessage = null;
    previous.onclose = null;
    previous.onerror = null;
    previous.close();
  }

  try {
    const socket = new WebSocket(`ws://localhost:${wsPort}`);
    ws = socket;

    socket.onopen = () => {
      if (ws !== socket) return;
      console.log('[Lanhu MCP] WebSocket connected');
      isConnected = true;
      reconnectAttempts = 0;

      // Send handshake
      const handshake = createMessage('HANDSHAKE', {
        extensionVersion: EXTENSION_VERSION
      });
      socket.send(JSON.stringify(handshake));
    };

    socket.onmessage = (event: MessageEvent) => {
      if (ws !== socket) return;
      try {
        const message = JSON.parse(event.data) as WSMessage;
        handleMessage(message);
      } catch (err) {
        console.error('[Lanhu MCP] Failed to parse message:', err);
      }
    };

    socket.onclose = () => {
      if (ws !== socket) return;
      console.log('[Lanhu MCP] WebSocket disconnected');
      isConnected = false;
      ws = null;
      broadcastState();

      // Attempt reconnect
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts++;
        console.log(`[Lanhu MCP] Reconnecting in ${RECONNECT_DELAY * reconnectAttempts}ms (attempt ${reconnectAttempts})`);
        setTimeout(connectWebSocket, RECONNECT_DELAY * reconnectAttempts);
      }
    };

    socket.onerror = (err: Event) => {
      if (ws !== socket) return;
      console.error('[Lanhu MCP] WebSocket error:', err);
    };
  } catch (err) {
    console.error('[Lanhu MCP] Failed to create WebSocket:', err);
  }
}

function handleMessage(message: WSMessage): void {
  switch (message.type) {
    case 'HANDSHAKE_ACK':
      console.log('[Lanhu MCP] Handshake acknowledged by server');
      broadcastState();
      pushContextUpdate();
      break;

    case 'PING':
      if (ws) {
        ws.send(JSON.stringify(createMessage('PONG', { timestamp: Date.now() })));
      }
      break;

    case 'DATA_REQUEST':
      handleDataRequest(message);
      break;

    case 'PONG':
      break;

    default:
      console.log('[Lanhu MCP] Unknown message type:', message.type);
  }
}

// === Data Request from Server ===

function handleDataRequest(message: WSMessage): void {
  const request = message.payload as { requestType: string; params: Record<string, unknown> };
  console.log('[Lanhu MCP] Server data request:', request.requestType, request.params);

  // Find active tab on lanhuapp.com
  chrome.tabs.query({ url: ['*://*.lanhuapp.com/*', '*://*.lanhu.com/*', '*://axure-file.lanhuapp.com/*'] }, (tabs) => {
    if (tabs.length === 0) {
      sendErrorResponse(message.id, 'No Lanhu tab found');
      return;
    }

    // Try each tab
    const tryTab = (index: number) => {
      if (index >= tabs.length) {
        sendErrorResponse(message.id, 'No tab responded');
        return;
      }

      const tab = tabs[index];
      if (!tab?.id) {
        tryTab(index + 1);
        return;
      }

      requestDataFromTabFrames(tab.id, request)
        .then((response) => {
          if (response && typeof response === 'object' && !Array.isArray(response) && 'error' in response) {
            sendErrorResponse(message.id, String((response as Record<string, unknown>).error));
            return;
          }
        const responseMsg = createMessage('DATA_RESPONSE', {
          requestId: message.id,
          success: true,
          data: response
        });
        if (ws) {
          ws.send(JSON.stringify(responseMsg));
        }
        })
        .catch(() => tryTab(index + 1));
    };

    tryTab(0);
  });
}

async function requestDataFromTabFrames(tabId: number, request: { requestType: string; params: Record<string, unknown> }): Promise<unknown> {
  const frames = await getTabFrames(tabId);
  let bestResponse: unknown;

  for (const frameId of frames) {
    try {
      const response = await sendDataRequestToFrame(tabId, frameId, request);
      bestResponse = pickDataResponse(request.requestType, bestResponse, response);
    } catch {
      // Ignore frames where the content script is not available.
    }
  }

  if (bestResponse !== undefined) {
    return bestResponse;
  }

  throw new Error('No frame responded');
}

function getTabFrames(tabId: number): Promise<number[]> {
  return new Promise((resolve) => {
    chrome.webNavigation.getAllFrames({ tabId }, (frames) => {
      if (chrome.runtime.lastError || !frames?.length) {
        resolve([0]);
        return;
      }

      resolve([
        ...frames
          .filter(frame => frame.url.includes('axure-file.lanhuapp.com'))
          .map(frame => frame.frameId),
        ...frames
          .filter(frame => !frame.url.includes('axure-file.lanhuapp.com'))
          .map(frame => frame.frameId)
      ]);
    });
  });
}

function sendDataRequestToFrame(
  tabId: number,
  frameId: number,
  request: { requestType: string; params: Record<string, unknown> }
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    chrome.tabs.sendMessage(tabId, {
      type: 'DATA_REQUEST',
      requestType: request.requestType,
      params: request.params
    }, { frameId }, (response) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function sendErrorResponse(requestId: string, errorMsg: string): void {
  if (!ws) return;
  const responseMsg = createMessage('DATA_RESPONSE', {
    requestId,
    success: false,
    error: errorMsg
  });
  ws.send(JSON.stringify(responseMsg));
}

// === Network Interception ===

function setupWebRequestInterceptor(): void {
  // We need to use declarativeNetRequest or webRequest to capture API responses
  // Since we want to read response bodies, we'll inject a script to intercept fetch/XHR

  // Method 1: Inject content script that hooks fetch/XMLHttpRequest
  // This happens in content.ts

  // Method 2: Parse URLs to track project/screen context
  chrome.webRequest.onCompleted.addListener(
    (details) => {
      parseUrlForContext(details.url);
    },
    { urls: ['*://*.lanhuapp.com/*', '*://*.lanhu.com/*', '*://axure-file.lanhuapp.com/*'] }
  );

  // Also listen to beforeRequest to catch API endpoints early
  chrome.webRequest.onBeforeRequest.addListener(
    (details) => {
      parseUrlForContext(details.url);
    },
    { urls: ['*://*.lanhuapp.com/*', '*://*.lanhu.com/*', '*://axure-file.lanhuapp.com/*'] }
  );
}

function parseUrlForContext(url: string): void {
  const context = extractLanhuContextFromUrl(url);
  const update = mergeLanhuContext({ currentProjectId, currentScreenId }, context);
  applyContextUpdate(update);

  // Push context update if we have a connection
  if (update.changed && isConnected && (currentProjectId || currentScreenId)) {
    pushContextUpdate();
  }
}

// === Message Listener (from content scripts and popup) ===

function setupMessageListener(): void {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    switch (message.type) {
      case 'GET_STATE':
        sendResponse({
          isConnected,
          currentProjectId,
          currentScreenId,
          wsPort
        });
        return true;

      case 'DATA_UPDATE':
        // Forward data update from content script to server
        updateContextFromPayload(message.payload);
        if (ws && isConnected) {
          const updateMsg = createMessage('DATA_UPDATE', addCurrentContext(message.payload, currentProjectId, currentScreenId));
          ws.send(JSON.stringify(updateMsg));
        }
        sendResponse({ success: true });
        return true;

      case 'API_DATA':
        // Intercepted API data from content script's hook
        if (message.payload?.dataType) {
          if (sender.tab?.url) {
            parseUrlForContext(sender.tab.url);
          }
          updateContextFromPayload(message.payload);
          console.log('[Lanhu MCP] Received API data:', message.payload.dataType);
          if (ws && isConnected) {
            const updateMsg = createMessage('DATA_UPDATE', addCurrentContext(message.payload, currentProjectId, currentScreenId));
            ws.send(JSON.stringify(updateMsg));
          }
        }
        sendResponse({ success: true });
        return true;

      case 'INJECT_INTERCEPTOR':
        if (!sender.tab?.id) {
          sendResponse({ success: false, error: 'No sender tab available' });
          return true;
        }
        injectApiInterceptor(sender.tab.id, sender.frameId)
          .then(() => sendResponse({ success: true }))
          .catch((err) => sendResponse({ success: false, error: (err as Error).message }));
        return true;

      case 'RECONNECT':
        reconnectAttempts = 0;
        connectWebSocket();
        sendResponse({ success: true });
        return true;

      case 'SET_WS_PORT': {
        const nextPort = normalizeWsPort(message.wsPort);
        chrome.storage.local.set({ wsPort: nextPort }, () => {
          wsPort = nextPort;
          reconnectAttempts = 0;
          connectWebSocket();
          sendResponse({ success: true, wsPort });
        });
        return true;
      }

      case 'GET_CURRENT_CONTEXT':
        sendResponse({
          projectId: currentProjectId,
          screenId: currentScreenId
        });
        return true;
    }
  });
}

async function injectApiInterceptor(tabId: number, frameId?: number): Promise<void> {
  const target: chrome.scripting.InjectionTarget = typeof frameId === 'number'
    ? { tabId, frameIds: [frameId] }
    : { tabId };

  await chrome.scripting.executeScript({
    target,
    files: ['interceptor.js'],
    world: 'MAIN'
  });
}

function updateContextFromPayload(payload: { context?: Record<string, unknown>; [key: string]: unknown }): void {
  applyContextUpdate(mergeLanhuContext({ currentProjectId, currentScreenId }, getPayloadContext(payload)));
}

function applyContextUpdate(update: { currentProjectId: string | null; currentScreenId: string | null; changed: boolean }): void {
  currentProjectId = update.currentProjectId;
  currentScreenId = update.currentScreenId;
  if (update.changed) {
    broadcastState();
  }
}

function pushContextUpdate(): void {
  if (!ws || !isConnected) return;
  if (!currentProjectId && !currentScreenId) return;

  const updateMsg = createMessage('DATA_UPDATE', {
    dataType: 'context',
    action: 'update',
    data: {
      projectId: currentProjectId,
      screenId: currentScreenId,
      url: null // Don't send full URL for privacy
    }
  });
  ws.send(JSON.stringify(updateMsg));
}

function broadcastState(): void {
  chrome.runtime.sendMessage({
    type: 'STATE_UPDATE',
    isConnected,
    currentProjectId,
    currentScreenId,
    wsPort
  }).catch(() => {}); // Ignore errors if no listeners
}
