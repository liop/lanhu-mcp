// Popup script - handles UI and state display

interface State {
  isConnected: boolean;
  captureEnabled: boolean;
  currentProjectId: string | null;
  currentScreenId: string | null;
  wsPort: number;
}

let state: State = {
  isConnected: false,
  captureEnabled: false,
  currentProjectId: null,
  currentScreenId: null,
  wsPort: 3100
};

// Initialize popup
init();

async function init(): Promise<void> {
  // Get current state from background
  await refreshState();

  // Setup message listener for state updates
  chrome.runtime.onMessage.addListener((message) => {
    if (message.type === 'STATE_UPDATE') {
      state = {
        isConnected: message.isConnected,
      captureEnabled: message.captureEnabled,
        currentProjectId: message.currentProjectId,
        currentScreenId: message.currentScreenId,
        wsPort: message.wsPort || state.wsPort
      };
      updateUI();
    }
  });

  // Setup button handlers
  setupButtons();
}

async function refreshState(): Promise<void> {
  try {
    const response = await chrome.runtime.sendMessage({ type: 'GET_STATE' });
    state = response as State;
    updateUI();
  } catch (err) {
    console.error('Failed to get state:', err);
    showDisconnected();
  }
}

function updateUI(): void {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const statusDot = statusIndicator?.querySelector('.status-dot');
  const wsPortEl = document.getElementById('wsPort');
  const currentProjectEl = document.getElementById('currentProject');
  const currentScreenEl = document.getElementById('currentScreen');

  const captureCheckbox = document.getElementById('captureEnabled') as HTMLInputElement | null;
  if (captureCheckbox) captureCheckbox.checked = state.captureEnabled;
  // Update status
  if (state.isConnected) {
    statusDot?.classList.remove('disconnected');
    statusDot?.classList.add('connected');
    if (statusText) statusText.textContent = '已连接';
  } else {
    statusDot?.classList.remove('connected');
    statusDot?.classList.add('disconnected');
    if (statusText) statusText.textContent = '未连接';
  }

  // Update info
  if (wsPortEl) wsPortEl.textContent = state.wsPort.toString();
  if (currentProjectEl) currentProjectEl.textContent = state.currentProjectId || '-';
  if (currentScreenEl) currentScreenEl.textContent = state.currentScreenId || '-';
}

function showDisconnected(): void {
  const statusIndicator = document.getElementById('statusIndicator');
  const statusText = document.getElementById('statusText');
  const statusDot = statusIndicator?.querySelector('.status-dot');

  statusDot?.classList.remove('connected');
  statusDot?.classList.add('disconnected');
  if (statusText) statusText.textContent = '连接失败';
}

function setupButtons(): void {
  document.getElementById('captureEnabled')?.addEventListener('change', async (event) => {
    await chrome.runtime.sendMessage({ type: 'SET_CAPTURE_ENABLED', enabled: (event.target as HTMLInputElement).checked });
    await refreshState();
  });
  const reconnectBtn = document.getElementById('reconnectBtn');
  const refreshBtn = document.getElementById('refreshBtn');
  const settingsBtn = document.getElementById('settingsBtn');

  reconnectBtn?.addEventListener('click', async () => {
    reconnectBtn.disabled = true;
    reconnectBtn.textContent = '连接中...';

    try {
      await chrome.runtime.sendMessage({ type: 'RECONNECT' });
      setTimeout(async () => {
        await refreshState();
        reconnectBtn.disabled = false;
        reconnectBtn.textContent = '重新连接';
      }, 2000);
    } catch (err) {
      reconnectBtn.disabled = false;
      reconnectBtn.textContent = '重新连接';
      showDisconnected();
    }
  });

  refreshBtn?.addEventListener('click', async () => {
    // Request data refresh from content script
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.tabs.sendMessage(tab.id, { type: 'REFRESH_DATA' });
      }
    } catch (err) {
      console.error('Failed to refresh:', err);
    }
  });

  settingsBtn?.addEventListener('click', async () => {
    const value = prompt('WebSocket 端口', state.wsPort.toString());
    if (value === null) {
      return;
    }

    const wsPort = parseInt(value, 10);
    if (!Number.isInteger(wsPort) || wsPort <= 0 || wsPort > 65535) {
      alert('请输入 1-65535 之间的端口号');
      return;
    }

    try {
      await chrome.runtime.sendMessage({ type: 'SET_WS_PORT', wsPort });
      await refreshState();
    } catch (err) {
      console.error('Failed to update port:', err);
    }
  });
}
