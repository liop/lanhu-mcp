export interface LanhuUrlContext {
  projectId?: string;
  screenId?: string;
}

const RESERVED_PATH_VALUES = new Set([
  'all',
  'cache',
  'comment',
  'comments',
  'flow',
  'list',
  'permission',
  'product',
  'tree'
]);

export function extractLanhuContextFromUrl(url: string): LanhuUrlContext {
  try {
    const urlObj = new URL(url);
    const params = mergeSearchParams(urlObj);
    const context: LanhuUrlContext = {};

    const pathParts = `${urlObj.pathname}/${urlObj.hash.split('?')[0]}`
      .split(/[/?#&=]/)
      .filter(Boolean);

    const projectId = getFirstParam(params, ['pid', 'projectId', 'project_id', 'project'])
      || extractAxureProjectId(urlObj)
      || findPathId(pathParts, ['project']);
    const screenId = getFirstParam(params, ['pageId', 'screenId', 'screen_id']) || findPathId(pathParts, ['screen', 'page']);

    if (projectId) {
      context.projectId = projectId;
    }
    if (screenId) {
      context.screenId = screenId;
    }

    return context;
  } catch {
    return {};
  }
}

function extractAxureProjectId(urlObj: URL): string | undefined {
  if (urlObj.hostname !== 'axure-file.lanhuapp.com') {
    return undefined;
  }

  return urlObj.pathname.match(/\/([0-9a-f-]{36})_md5__/i)?.[1];
}

function mergeSearchParams(urlObj: URL): URLSearchParams {
  const params = new URLSearchParams(urlObj.search);
  const hashQueryIndex = urlObj.hash.indexOf('?');

  if (hashQueryIndex >= 0) {
    const hashParams = new URLSearchParams(urlObj.hash.slice(hashQueryIndex + 1));
    hashParams.forEach((value, key) => {
      if (!params.has(key)) {
        params.set(key, value);
      }
    });
  }

  return params;
}

function getFirstParam(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key);
    if (value) {
      return value;
    }
  }
  return undefined;
}

function findPathId(pathParts: string[], markers: string[]): string | undefined {
  for (let i = 0; i < pathParts.length - 1; i++) {
    if (!markers.includes(pathParts[i])) {
      continue;
    }

    const value = pathParts[i + 1];
    if (value.length >= 8 && !RESERVED_PATH_VALUES.has(value)) {
      return value;
    }
  }
  return undefined;
}
