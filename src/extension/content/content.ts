// Content Script entry - injects API interceptor, handles DOM extraction, communicates with background

import { extractLanhuPageNames, findRecordById, getUrlObserverTarget, toRecordArray } from './content-helpers.js';
import { extractAxureLayers, extractAxureScreen, isAxureDocument } from './axure-parser.js';
import { extractLanhuContextFromUrl } from '../shared/url-context.js';

// === Inject API Interceptor as Page Script ===

chrome.runtime.sendMessage({ type: 'INJECT_INTERCEPTOR' }, (response) => {
  if (chrome.runtime.lastError || response?.error) {
    console.warn('[Lanhu MCP] Failed to inject API interceptor:', chrome.runtime.lastError?.message || response?.error);
    return;
  }
  console.log('[Lanhu MCP] API interceptor injected');
});

// === Data Extraction ===

let currentProjectId: string | null = null;
let currentScreenId: string | null = null;

console.log('[Lanhu MCP] Content script loaded');

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'DATA_REQUEST') {
    handleDataRequest(message.requestType, message.params)
      .then(data => sendResponse(data))
      .catch(err => sendResponse({ error: (err as Error).message }));
    return true;
  }

  if (message.type === 'REFRESH_DATA') {
    refreshVisibleData()
      .then(summary => sendResponse(summary))
      .catch(err => sendResponse({ error: (err as Error).message }));
    return true;
  }
});

async function handleDataRequest(requestType: string, params: Record<string, unknown>): Promise<unknown> {
  console.log('[Lanhu MCP] Request:', requestType, params);

  switch (requestType) {
    case 'projects': return getProjects();
    case 'project': return getProject(params.projectId as string);
    case 'screens': return getScreens(params.projectId as string, params.folderId as string);
    case 'screen': return getScreenDetail(params.screenId as string);
    case 'screen_image': return getScreenImage(params.screenId as string, params.scale as number);
    case 'layers': return getLayers(params.screenId as string);
    case 'layer': return getLayerDetail(params.screenId as string, params.layerId as string);
    case 'colors': return getColors(params.screenId as string);
    case 'fonts': return getFonts(params.screenId as string);
    case 'assets': return getAssets(params.screenId as string);
    case 'asset': return getAsset(params.screenId as string, params.assetId as string, params.format as string);
    case 'prototype_links': return getPrototypeLinks(params.screenId as string);
    case 'comments': return getComments(params.screenId as string);
    case 'project_tree': return getProjectTree(params.projectId as string);
    case 'layer_styles': return getLayerStyles(params.screenId as string, params.layerId as string);
    case 'prototype_flow': return getPrototypeFlow(params.projectId as string);
    default: return { error: `Unknown request type: ${requestType}` };
  }
}

async function refreshVisibleData(): Promise<{ success: true; refreshed: string[]; context: Record<string, unknown> }> {
  updateContextFromUrl();
  const context = getCurrentContext();
  const refreshed: string[] = [];

  if (isAxureRuntime()) {
    refreshAxureFrameData(context, refreshed);
  }

  sendDataUpdate('context', { ...context, url: null }, context, 'update');
  refreshed.push('context');

  if (currentProjectId) {
    sendDataUpdate('projects', getProjects(), context);
    sendDataUpdate('project', getProject(currentProjectId), context);
    sendDataUpdate('screens', getScreens(currentProjectId), context);
    sendDataUpdate('project_tree', getProjectTree(currentProjectId), context);
    sendDataUpdate('prototype_flow', getPrototypeFlow(currentProjectId), context);
    refreshed.push('projects', 'project', 'screens', 'project_tree', 'prototype_flow');
  }

  if (currentScreenId) {
    sendDataUpdate('screen', getScreenDetail(currentScreenId), context);
    sendDataUpdate('screen_image', getScreenImage(currentScreenId), context);
    sendDataUpdate('comments', getComments(currentScreenId), context);
    sendDataUpdate('prototype_links', getPrototypeLinks(currentScreenId), context);
    refreshed.push('screen', 'screen_image', 'comments', 'prototype_links');
  }

  return { success: true, refreshed, context };
}

function sendDataUpdate(dataType: string, data: unknown, context: Record<string, unknown>, action = 'cache'): void {
  chrome.runtime.sendMessage({
    type: 'DATA_UPDATE',
    payload: {
      dataType,
      action,
      data,
      context
    }
  });
}

function getCurrentContext(): Record<string, unknown> {
  const context: Record<string, unknown> = {};
  if (currentProjectId) context.projectId = currentProjectId;
  if (currentScreenId) context.screenId = currentScreenId;
  return context;
}

function refreshAxureFrameData(context: Record<string, unknown>, refreshed: string[]): void {
  const layers = getAxureLayers(String(context.screenId || currentScreenId || ''));
  if (layers.length > 0) {
    sendDataUpdate('layers', layers, context);
    refreshed.push('layers');
  }

  const screen = extractAxureScreen(document, {
    projectId: currentProjectId || String(context.projectId || ''),
    screenId: currentScreenId || String(context.screenId || ''),
    url: window.location.href
  });
  if (screen) {
    sendDataUpdate('screen', screen, context);
    refreshed.push('screen');
  }
}

// === Projects ===

function getProjects(): unknown {
  const cached = getApiCache('projects');
  if (cached) {
    return toRecordArray(cached).map(normalizeProject).filter(p => p.id);
  }

  const projects: Array<{ id: string; name: string }> = [];
  const selectors = [
    '[class*="project-item"]', '[class*="ProjectItem"]',
    '[class*="project-card"]', '[class*="project-list-item"]'
  ];
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      elements.forEach(el => {
        const id = el.getAttribute('data-id') || el.getAttribute('data-project-id');
        const nameEl = el.querySelector('[class*="name"], [class*="title"], h2, h3, h4');
        if (id) projects.push({ id, name: nameEl?.textContent?.trim() || id });
      });
      break;
    }
  }

  // Include current project from URL
  updateContextFromUrl();
  if (currentProjectId && !projects.find(p => p.id === currentProjectId)) {
    const nameEl = document.querySelector('[class*="project-name"], [class*="ProjectName"], h1[class*="title"]');
    projects.push({
      id: currentProjectId,
      name: nameEl?.textContent?.trim() || `Project ${currentProjectId}`
    });
  }

  return projects;
}

function getProject(projectId: string): unknown {
  const cached = getApiCache('project');
  if (cached) {
    const found = findRecordById(cached, projectId);
    if (found) return found;
  }

  if (currentProjectId === projectId || (!currentProjectId && updateContextFromUrl() === projectId)) {
    const nameEl = document.querySelector('[class*="project-name"], [class*="ProjectName"]');
    return {
      id: projectId,
      name: nameEl?.textContent?.trim() || `Project ${projectId}`
    };
  }

  return { id: projectId, name: `Project ${projectId}`, note: 'Project not currently visible in browser' };
}

function normalizeProject(p: Record<string, unknown>): { id: string; name: string } {
  return {
    id: String(p.id || p.projectId || ''),
    name: String(p.name || p.projectName || 'Unknown')
  };
}

// === Screens ===

function getScreens(projectId: string, folderId?: string): unknown {
  const cached = getApiCache('screens');
  if (cached) {
    let screens = toRecordArray(cached).map(screen => normalizeScreen(screen, projectId));
    if (folderId) screens = screens.filter(s => s.folderId === folderId);
    return screens;
  }

  updateContextFromUrl();
  const screens: Array<{ id: string; name: string; projectId: string; width: number; height: number; folderId?: string; source?: string }> = [];
  const selectors = [
    '[class*="screen-item"]', '[class*="ScreenItem"]',
    '[class*="page-item"]', '[class*="PageItem"]',
    '[class*="screen-card"]'
  ];
  for (const selector of selectors) {
    const elements = document.querySelectorAll(selector);
    if (elements.length > 0) {
      elements.forEach(el => {
        const id = el.getAttribute('data-id') || el.getAttribute('data-screen-id');
        const nameEl = el.querySelector('[class*="name"], [class*="title"], h3, h4');
        if (id) {
          screens.push({
            id,
            name: nameEl?.textContent?.trim() || id,
            projectId,
            width: parseInt(el.getAttribute('data-width') || '0'),
            height: parseInt(el.getAttribute('data-height') || '0')
          });
        }
      });
      break;
    }
  }

  if (screens.length === 0 && currentProjectId === projectId) {
    const currentScreenName = getCurrentScreenName();
    const pageNames = getVisiblePageNames();
    for (const name of pageNames) {
      const isCurrent = currentScreenName === name || (currentScreenId && pageNames.length === 1);
      screens.push({
        id: isCurrent && currentScreenId ? currentScreenId : stableDomId('page', name),
        name,
        projectId,
        width: 0,
        height: 0,
        source: isCurrent ? 'current-url' : 'dom'
      });
    }
    if (currentScreenId && !screens.some(screen => screen.id === currentScreenId)) {
      screens.push({
        id: currentScreenId,
        name: currentScreenName || currentScreenId,
        projectId,
        width: 0,
        height: 0,
        source: 'current-url'
      });
    }
  }

  return screens;
}

function getScreenDetail(screenId: string): unknown {
  if (isAxureRuntime()) {
    const screen = extractAxureScreen(document, {
      projectId: currentProjectId || '',
      screenId,
      url: window.location.href
    });
    if (screen) return screen;
  }

  const cached = getApiCache('screen');
  if (cached) {
    const found = findRecordById(cached, screenId);
    if (found) return found;
  }

  const screensCached = getApiCache('screens');
  if (screensCached) {
    const found = findRecordById(screensCached, screenId);
    if (found) return found;
  }

  const el = document.querySelector(`[data-id="${screenId}"], [data-screen-id="${screenId}"]`);
  if (el) {
    const nameEl = el.querySelector('[class*="name"], [class*="title"], h1, h2');
    return {
      id: screenId,
      name: nameEl?.textContent?.trim() || screenId,
      width: parseInt(el.getAttribute('data-width') || '0'),
      height: parseInt(el.getAttribute('data-height') || '0'),
      coverUrl: el.querySelector('img')?.src
    };
  }

  updateContextFromUrl();
  if (currentScreenId === screenId) {
    return {
      id: screenId,
      name: getCurrentScreenName() || screenId,
      projectId: currentProjectId || '',
      width: 0,
      height: 0,
      prototypeUrl: getPrototypeFrameUrl() || undefined,
      source: 'current-url'
    };
  }

  return { id: screenId, name: screenId, note: 'Screen not currently visible in browser' };
}

function getScreenImage(screenId: string, scale = 1): { imageUrl: string; scale: number } {
  const selectors = [
    '[class*="canvas"] img', '[class*="Canvas"] img',
    '[class*="preview"] img', `[data-id="${screenId}"] img`
  ];
  for (const selector of selectors) {
    const img = document.querySelector(selector);
    if (img?.src) return { imageUrl: img.src, scale };
  }
  const prototypeUrl = getPrototypeFrameUrl();
  if (prototypeUrl) return { imageUrl: prototypeUrl, scale };
  return { imageUrl: '', scale };
}

function normalizeScreen(s: Record<string, unknown>, projectId?: string): { id: string; name: string; projectId?: string; width: number; height: number; folderId?: string } {
  return {
    id: String(s.id || s.screenId || s.pageId || ''),
    name: String(s.name || s.screenName || s.pageName || s.title || 'Unknown'),
    projectId: (s.projectId || projectId) as string | undefined,
    width: parseInt(String(s.width || 0)),
    height: parseInt(String(s.height || 0)),
    folderId: s.folderId as string | undefined
  };
}

function getCurrentScreenName(): string | undefined {
  const frame = document.querySelector('iframe[src*="axure-file"], iframe[src*="lanhuapp.com"]') as HTMLIFrameElement | null;
  const frameTitle = frame?.getAttribute('title') || frame?.title;
  if (frameTitle?.trim()) {
    return frameTitle.trim();
  }

  const selected = document.querySelector('[aria-selected="true"], [class*="active"], [class*="selected"], [class*="current"]');
  const selectedText = selected ? getElementText(selected) : '';
  const pageNames = getVisiblePageNames();
  if (selectedText) {
    const selectedName = pageNames.find(name => selectedText.includes(name));
    if (selectedName) return selectedName;
  }

  return pageNames.length === 1 ? pageNames[0] : undefined;
}

function getPrototypeFrameUrl(): string | undefined {
  const frame = document.querySelector('iframe[src*="axure-file"], iframe[src*="lanhuapp.com"]') as HTMLIFrameElement | null;
  return frame?.src || undefined;
}

function getVisiblePageNames(): string[] {
  return extractLanhuPageNames(getPageTreeText());
}

function getPageTreeText(): string {
  const candidates = Array.from(document.querySelectorAll(
    'aside, nav, [class*="sidebar"], [class*="sider"], [class*="page"], [class*="Page"], [class*="tree"], [class*="Tree"], [class*="doc"], [class*="Doc"]'
  ));
  let best = '';

  for (const candidate of candidates) {
    const text = getElementText(candidate);
    if (!text.includes('页面') || text.length < 10) {
      continue;
    }
    if (!best || text.length < best.length) {
      best = text;
    }
  }

  return best || getElementText(document.body);
}

function getElementText(element: Element | null): string {
  if (!element) return '';
  const htmlElement = element as HTMLElement;
  return (htmlElement.innerText || htmlElement.textContent || '').trim();
}

function stableDomId(prefix: string, value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) - hash + value.charCodeAt(i)) | 0;
  }
  return `${prefix}-${Math.abs(hash).toString(36)}`;
}

// === Layers ===

function getLayers(screenId: string): unknown {
  const cached = getApiCache('layers');
  if (cached) {
    return toRecordArray(cached).map(normalizeLayer);
  }

  const axureLayers = getAxureLayers(screenId);
  if (axureLayers.length > 0) {
    return axureLayers;
  }

  const layers: Array<{ id: string; name: string; type: string; x: number; y: number; width: number; height: number }> = [];
  const layerPanel = document.querySelector(
    '[class*="layer-tree"], [class*="LayerTree"], [class*="layer-panel"], [class*="layers-panel"]'
  );
  if (!layerPanel) return layers;

  const items = layerPanel.querySelectorAll('[class*="layer-item"], [class*="LayerItem"], [class*="tree-node"], [class*="layer-row"]');
  items.forEach((el: Element) => {
    const id = el.getAttribute('data-id') || el.getAttribute('data-layer-id');
    if (!id) return;
    const nameEl = el.querySelector('[class*="name"], [class*="title"], [class*="label"]');
    layers.push({
      id,
      name: nameEl?.textContent?.trim() || id,
      type: el.getAttribute('data-type') || guessLayerType(el),
      x: parseInt(el.getAttribute('data-x') || '0'),
      y: parseInt(el.getAttribute('data-y') || '0'),
      width: parseInt(el.getAttribute('data-width') || '0'),
      height: parseInt(el.getAttribute('data-height') || '0')
    });
  });

  return layers;
}

function getAxureLayers(screenId: string): unknown[] {
  if (!isAxureRuntime()) {
    return [];
  }

  return extractAxureLayers(document, {
    projectId: currentProjectId || undefined,
    screenId,
    url: window.location.href
  });
}

function getLayerDetail(screenId: string, layerId: string): unknown {
  const cached = getApiCache('layers');
  if (cached) {
    const found = findRecordById(cached, layerId);
    if (found) return found;
  }

  const el = document.querySelector(`[data-id="${layerId}"], [data-layer-id="${layerId}"]`);
  if (!el) return { id: layerId, note: 'Layer not found in DOM' };

  const nameEl = el.querySelector('[class*="name"], [class*="title"], [class*="label"]');
  return {
    id: layerId,
    name: nameEl?.textContent?.trim() || layerId,
    type: el.getAttribute('data-type') || guessLayerType(el),
    x: parseInt(el.getAttribute('data-x') || '0'),
    y: parseInt(el.getAttribute('data-y') || '0'),
    width: parseInt(el.getAttribute('data-width') || '0'),
    height: parseInt(el.getAttribute('data-height') || '0')
  };
}

function normalizeLayer(l: Record<string, unknown>): { id: string; name: string; type: string; x: number; y: number; width: number; height: number } {
  return {
    id: String(l.id || ''),
    name: String(l.name || l.layerName || 'Unknown'),
    type: String(l.type || l.layerType || 'shape'),
    x: parseInt(String(l.x || l.left || 0)),
    y: parseInt(String(l.y || l.top || 0)),
    width: parseInt(String(l.width || 0)),
    height: parseInt(String(l.height || 0))
  };
}

function guessLayerType(el: Element): string {
  const cls = el.className.toLowerCase();
  if (cls.includes('text')) return 'text';
  if (cls.includes('image') || cls.includes('img')) return 'image';
  if (cls.includes('group')) return 'group';
  if (cls.includes('container')) return 'container';
  return 'shape';
}

// === Colors & Fonts ===

function getColors(screenId: string): Array<{ hex: string; name?: string }> {
  const cached = getApiCache('colors');
  if (cached) {
    return toRecordArray(cached).map(c => ({
      hex: normalizeColor(String(c.hex || c.color || '')),
      name: c.name as string | undefined
    }));
  }

  const colors: Array<{ hex: string; name?: string }> = [];
  const panel = document.querySelector('[class*="color-panel"], [class*="colors"], [class*="Colors"]');
  if (panel) {
    const items = panel.querySelectorAll('[class*="color-item"], [class*="ColorItem"]');
    items.forEach(el => {
      const hex = el.getAttribute('data-color') || el.textContent?.trim();
      if (hex && /^#?[0-9a-fA-F]{3,8}$/.test(hex)) {
        colors.push({ hex: normalizeColor(hex), name: el.getAttribute('data-name') || undefined });
      }
    });
  }
  return colors;
}

function getFonts(screenId: string): Array<{ family: string; size?: number; weight?: number }> {
  const cached = getApiCache('fonts');
  if (cached) {
    return toRecordArray(cached).map(f => ({
      family: String(f.family || f.fontFamily || ''),
      size: parseInt(String(f.size || 0)),
      weight: parseInt(String(f.weight || 0))
    }));
  }

  const fonts: Array<{ family: string; size?: number; weight?: number }> = [];
  const panel = document.querySelector('[class*="font-panel"], [class*="fonts"], [class*="text-styles"]');
  if (panel) {
    const items = panel.querySelectorAll('[class*="font-item"], [class*="FontItem"]');
    items.forEach(el => {
      const family = el.getAttribute('data-family') || el.querySelector('[class*="family"]')?.textContent?.trim();
      if (family) {
        fonts.push({
          family,
          size: parseInt(el.getAttribute('data-size') || '0'),
          weight: parseInt(el.getAttribute('data-weight') || '0')
        });
      }
    });
  }
  return fonts;
}

function normalizeColor(color: string): string {
  if (color.startsWith('#')) return color;
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const r = parseInt(match[1]).toString(16).padStart(2, '0');
    const g = parseInt(match[2]).toString(16).padStart(2, '0');
    const b = parseInt(match[3]).toString(16).padStart(2, '0');
    return `#${r}${g}${b}`;
  }
  return color;
}

// === Assets ===

function getAssets(screenId: string): unknown {
  const cached = getApiCache('assets');
  if (cached) {
    return toRecordArray(cached).map(normalizeAsset);
  }

  const assets: Array<{ id: string; name: string; format: string; width: number; height: number }> = [];
  const panel = document.querySelector('[class*="asset-panel"], [class*="export"], [class*="Export"], [class*="assets"]');
  if (panel) {
    const items = panel.querySelectorAll('[class*="asset-item"], [class*="export-item"]');
    items.forEach(el => {
      const id = el.getAttribute('data-id') || generateTempId();
      assets.push({
        id,
        name: el.querySelector('[class*="name"]')?.textContent?.trim() || id,
        format: el.getAttribute('data-format') || 'png',
        width: parseInt(el.getAttribute('data-width') || '0'),
        height: parseInt(el.getAttribute('data-height') || '0')
      });
    });
  }
  return assets;
}

function getAsset(screenId: string, assetId: string, format: string): { base64: string | null; error?: string } {
  const el = document.querySelector(`[data-id="${assetId}"], [data-asset-id="${assetId}"]`);
  if (!el) return { base64: null, error: 'Asset not found' };
  const img = el.querySelector('img');
  if (img) return { base64: img.src };
  return { base64: null, error: 'No image found' };
}

function normalizeAsset(a: Record<string, unknown>): { id: string; name: string; format: string; width: number; height: number } {
  return {
    id: String(a.id || ''),
    name: String(a.name || a.assetName || 'Unknown'),
    format: String(a.format || 'png'),
    width: parseInt(String(a.width || 0)),
    height: parseInt(String(a.height || 0))
  };
}

// === Prototype Links ===

function getPrototypeLinks(screenId: string): unknown {
  const cached = getApiCache('prototype_links');
  if (cached) {
    return toRecordArray(cached).map(normalizePrototypeLink);
  }

  const links: Array<{ sourceLayerId?: string; targetScreenId: string; hotspot?: { x: number; y: number; width: number; height: number } }> = [];
  const hotspots = document.querySelectorAll('[class*="hotspot"], [class*="Hotspot"], [class*="interaction"], [class*="link-area"]');
  hotspots.forEach(el => {
    const target = el.getAttribute('data-target') || el.getAttribute('data-target-screen') || el.getAttribute('data-destination-id');
    if (target) {
      links.push({
        sourceLayerId: el.getAttribute('data-layer-id') || undefined,
        targetScreenId: target,
        hotspot: {
          x: parseInt(el.getAttribute('data-x') || '0'),
          y: parseInt(el.getAttribute('data-y') || '0'),
          width: parseInt(el.getAttribute('data-width') || '0'),
          height: parseInt(el.getAttribute('data-height') || '0')
        }
      });
    }
  });
  return links;
}

function normalizePrototypeLink(l: Record<string, unknown>): { sourceLayerId?: string; targetScreenId: string } {
  return {
    sourceLayerId: l.sourceLayerId as string | undefined,
    targetScreenId: String(l.targetScreenId || l.targetId || '')
  };
}

// === Comments ===

function getComments(screenId: string): unknown {
  const cached = getApiCache('comments');
  if (cached) {
    return toRecordArray(cached).map(normalizeComment).filter(comment => comment.content);
  }

  const comments: Array<{ id: string; userId: string; content: string; position?: { x: number; y: number } }> = [];
  const els = document.querySelectorAll('[class*="comment"], [class*="Comment"], [class*="note-item"]');
  els.forEach(el => {
    const id = el.getAttribute('data-id') || generateTempId();
    const contentEl = el.querySelector('[class*="content"], [class*="text"]');
    comments.push({
      id,
      userId: el.getAttribute('data-user-id') || 'unknown',
      content: contentEl?.textContent?.trim() || '',
      position: {
        x: parseInt(el.getAttribute('data-x') || '0'),
        y: parseInt(el.getAttribute('data-y') || '0')
      }
    });
  });
  return comments.filter(comment => comment.content);
}

function normalizeComment(c: Record<string, unknown>): { id: string; content: string } {
  return {
    id: String(c.id || ''),
    content: String(c.content || c.text || '')
  };
}

// === Project Tree ===

function getProjectTree(projectId: string): unknown {
  const cached = getApiCache('project_tree');
  if (cached) return cached;

  // Try to extract folder/screen tree from DOM
  const tree: Array<{ id: string; name: string; type: string; children?: unknown[] }> = [];
  const folderPanel = document.querySelector('[class*="folder-tree"], [class*="FolderTree"], [class*="tree-panel"], [class*="sidebar"]');
  if (folderPanel) {
    const folders = folderPanel.querySelectorAll('[class*="folder-item"], [class*="FolderItem"]');
    const folderMap = new Map<string, { id: string; name: string; type: string; children: unknown[] }>();

    // Build folder tree
    folders.forEach(el => {
      const id = el.getAttribute('data-id') || el.getAttribute('data-folder-id');
      const nameEl = el.querySelector('[class*="name"], [class*="title"]');
      const parentEl = el.parentElement?.closest('[class*="folder-item"]');
      const parentId = parentEl?.getAttribute('data-id') || parentEl?.getAttribute('data-folder-id');
      const name = nameEl?.textContent?.trim() || id || 'Unknown';

      if (id) {
        const node = { id, name, type: 'folder', children: [] };
        folderMap.set(id, node);
        if (parentId && folderMap.has(parentId)) {
          folderMap.get(parentId)!.children.push(node);
        } else if (!parentId) {
          tree.push(node);
        }
      }
    });

    // Find screens inside folders
    const screenItems = folderPanel.querySelectorAll('[class*="screen-item"], [class*="ScreenItem"]');
    screenItems.forEach(el => {
      const id = el.getAttribute('data-id') || el.getAttribute('data-screen-id');
      const nameEl = el.querySelector('[class*="name"], [class*="title"]');
      const parentFolder = el.closest('[class*="folder-item"]');
      const parentId = parentFolder?.getAttribute('data-id') || parentFolder?.getAttribute('data-folder-id');

      if (id) {
        const node = { id, name: nameEl?.textContent?.trim() || id, type: 'screen' };
        if (parentId && folderMap.has(parentId)) {
          folderMap.get(parentId)!.children.push(node);
        } else {
          tree.push(node);
        }
      }
    });
  }

  if (tree.length === 0 && currentProjectId === projectId) {
    const currentScreenName = getCurrentScreenName();
    const pageNames = getVisiblePageNames();
    for (const name of pageNames) {
      const isCurrent = currentScreenName === name || (currentScreenId && pageNames.length === 1);
      tree.push({
        id: isCurrent && currentScreenId ? currentScreenId : stableDomId('page', name),
        name,
        type: 'screen'
      });
    }
    if (currentScreenId && !tree.some(node => node.id === currentScreenId)) {
      tree.push({
        id: currentScreenId,
        name: currentScreenName || currentScreenId,
        type: 'screen'
      });
    }
  }

  return { projectId, tree };
}

// === Layer Styles ===

function getLayerStyles(screenId: string, layerId: string): unknown {
  const cached = getApiCache('layer_styles');
  if (cached) {
    const found = findRecordById(cached, layerId);
    if (found) return found;
  }

  // Try to find style info in detail panel
  const detailPanel = document.querySelector('[class*="detail-panel"], [class*="LayerDetail"], [class*="properties-panel"]');
  if (!detailPanel) return { layerId, note: 'No style panel visible in DOM' };

  const styles: Record<string, unknown> = {};

  // Extract common style properties from the panel
  const bgEl = detailPanel.querySelector('[class*="bg-color"], [class*="background"], [class*="fill"] input, [class*="color-value"]');
  if (bgEl) styles.backgroundColor = bgEl.textContent?.trim() || bgEl.getAttribute('value');

  const borderEl = detailPanel.querySelector('[class*="border-color"], [class*="border"] input');
  if (borderEl) styles.borderColor = borderEl.textContent?.trim() || borderEl.getAttribute('value');

  const widthEl = detailPanel.querySelector('[class*="border-width"] input');
  if (widthEl) styles.borderWidth = parseInt(widthEl.getAttribute('value') || '0');

  const radiusEl = detailPanel.querySelector('[class*="border-radius"] input');
  if (radiusEl) styles.borderRadius = parseInt(radiusEl.getAttribute('value') || '0');

  const fontSizeEl = detailPanel.querySelector('[class*="font-size"] input');
  if (fontSizeEl) styles.fontSize = parseInt(fontSizeEl.getAttribute('value') || '0');

  const fontFamilyEl = detailPanel.querySelector('[class*="font-family"], [class*="text-font"]');
  if (fontFamilyEl) styles.fontFamily = fontFamilyEl.textContent?.trim();

  const fontWeightEl = detailPanel.querySelector('[class*="font-weight"], [class*="text-weight"]');
  if (fontWeightEl) styles.fontWeight = parseInt(fontWeightEl.textContent?.trim() || '0');

  const textColorEl = detailPanel.querySelector('[class*="text-color"], [class*="font-color"] input');
  if (textColorEl) styles.color = textColorEl.textContent?.trim() || textColorEl.getAttribute('value');

  const opacityEl = detailPanel.querySelector('[class*="opacity"] input');
  if (opacityEl) styles.opacity = parseInt(opacityEl.getAttribute('value') || '100');

  // Try to find shadow info
  const shadowEl = detailPanel.querySelector('[class*="shadow"], [class*="drop-shadow"]');
  if (shadowEl) styles.boxShadow = shadowEl.textContent?.trim();

  return { layerId, styles };
}

// === Prototype Flow ===

function getPrototypeFlow(projectId: string): unknown {
  const cached = getApiCache('prototype_flow');
  if (cached) return cached;

  const cachedLinks = getApiCache('prototype_links');
  if (cachedLinks) {
    const links = toRecordArray(cachedLinks);
    return { projectId, links };
  }

  // Try to extract from DOM
  const flowLinks: Array<{ sourceScreenId: string; targetScreenId: string; trigger?: string }> = [];
  const hotspotEls = document.querySelectorAll('[class*="hotspot"], [class*="Hotspot"], [class*="interaction"]');
  hotspotEls.forEach(el => {
    const sourceScreen = el.getAttribute('data-source-screen') || currentScreenId;
    const targetScreen = el.getAttribute('data-target') || el.getAttribute('data-target-screen') || el.getAttribute('data-destination-id');
    if (sourceScreen && targetScreen) {
      flowLinks.push({
        sourceScreenId: sourceScreen,
        targetScreenId: targetScreen,
        trigger: el.getAttribute('data-trigger') || 'click'
      });
    }
  });

  return { projectId, flowLinks };
}

// === API Data Cache ===

interface ApiCacheEntry {
  dataType: string;
  data: unknown;
  timestamp: number;
}

const apiDataCache = new Map<string, ApiCacheEntry>();

function getApiCache(dataType: string): unknown | null {
  const entry = apiDataCache.get(dataType);
  if (entry && Date.now() - entry.timestamp < 300000) { // 5 min TTL
    return entry.data;
  }
  return null;
}

// Listen for API data from interceptor
window.addEventListener('message', (event) => {
  if (event.data && event.data.source === 'lanhu-mcp-interceptor' && event.data.type === 'API_DATA') {
    const payload = event.data.payload;
    apiDataCache.set(payload.dataType, {
      dataType: payload.dataType,
      data: payload.data,
      timestamp: Date.now()
    });
    console.log('[Lanhu MCP] Cached API data:', payload.dataType);

    // Forward to background
    chrome.runtime.sendMessage({
      type: 'API_DATA',
      payload
    });
  }
});

// === Context Tracking ===

function updateContextFromUrl(): string | null {
  const context = extractLanhuContextFromUrl(window.location.href);
  if (context.projectId) currentProjectId = context.projectId;
  if (context.screenId) currentScreenId = context.screenId;

  return currentProjectId;
}

let lastUrl = window.location.href;

const urlObserver = new MutationObserver(() => {
  if (window.location.href !== lastUrl) {
    lastUrl = window.location.href;
    const prevProject = currentProjectId;
    updateContextFromUrl();
    if (currentProjectId !== prevProject) {
      console.log('[Lanhu MCP] Context changed, project:', currentProjectId, 'screen:', currentScreenId);
    }
  }
});

function startUrlObserver(): void {
  const target = getUrlObserverTarget(document);
  if (!target) {
    document.addEventListener('DOMContentLoaded', startUrlObserver, { once: true });
    return;
  }
  urlObserver.observe(target, { childList: true, subtree: true });
}

startUrlObserver();

updateContextFromUrl();
startAxureFrameObserver();
console.log('[Lanhu MCP] Content script initialized');

function generateTempId(): string {
  return `temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function isAxureRuntime(): boolean {
  return window.location.hostname === 'axure-file.lanhuapp.com' || isAxureDocument(document);
}

function startAxureFrameObserver(): void {
  if (!isAxureRuntime()) {
    return;
  }

  const schedulePush = debounce(() => {
    updateContextFromUrl();
    const context = getCurrentContext();
    const refreshed: string[] = [];
    refreshAxureFrameData(context, refreshed);
  }, 500);

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', schedulePush, { once: true });
  } else {
    schedulePush();
  }

  setTimeout(schedulePush, 1500);
  const target = getUrlObserverTarget(document);
  if (target) {
    new MutationObserver(schedulePush).observe(target, { childList: true, subtree: true, attributes: true });
  }
}

function debounce(callback: () => void, delay: number): () => void {
  let timeout: number | undefined;
  return () => {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
    timeout = window.setTimeout(callback, delay);
  };
}
