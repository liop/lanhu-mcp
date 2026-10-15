declare global {
  interface Window {
    __lanhuMcpInterceptorInstalled?: boolean;
  }
}

const API_PATTERNS = [
  '/api/project',
  '/api/screen',
  '/api/page',
  '/api/design',
  '/api/layer',
  '/api/asset',
  '/api/prototype',
  '/api/comment',
  '/openapi/',
  '/api/color',
  '/api/font'
];

if (!window.__lanhuMcpInterceptorInstalled) {
  window.__lanhuMcpInterceptorInstalled = true;
  installFetchInterceptor();
  installXhrInterceptor();
}

function isApiUrl(url: string): boolean {
  return API_PATTERNS.some(pattern => url.includes(pattern));
}

function extractDataType(url: string): string {
  if (url.includes('/project') && !url.includes('/screen') && !url.includes('/page')) {
    if (url.includes('/list') || url.includes('/tree')) return 'projects';
    return 'project';
  }
  if (url.includes('/screen') || url.includes('/page')) {
    if (url.includes('/layer')) return 'layers';
    if (url.includes('/asset') || url.includes('/export')) return 'assets';
    if (url.includes('/comment')) return 'comments';
    if (url.includes('/link') || url.includes('/prototype') || url.includes('/flow')) return 'prototype_links';
    if (url.includes('/image') || url.includes('/thumbnail') || url.includes('/preview')) return 'screen_image';
    if (url.includes('/list') || url.includes('/all')) return 'screens';
    return 'screen';
  }
  if (url.includes('/color')) return 'colors';
  if (url.includes('/font')) return 'fonts';
  return 'unknown';
}

function postApiData(url: string, data: unknown): void {
  // Never forward credentials embedded in request URLs or responses.
  const safeUrl = sanitizeUrl(url);
  if (!safeUrl) return;
  const dataType = extractDataType(safeUrl);
  if (dataType === 'unknown') return;
  const safeData = redactSensitive(data, 0);

  window.postMessage({
    source: 'lanhu-mcp-interceptor',
    type: 'API_DATA',
    payload: {
      dataType,
      action: 'cache',
      data: safeData,
      url: safeUrl
    }
  }, window.location.origin);
}

function installFetchInterceptor(): void {
  const originalFetch = window.fetch;
  window.fetch = function interceptedFetch(...args: Parameters<typeof fetch>): ReturnType<typeof fetch> {
    const url = typeof args[0] === 'string'
      ? args[0]
      : args[0] instanceof Request
        ? args[0].url
        : String(args[0] || '');

    if (!isApiUrl(url)) {
      return originalFetch.apply(this, args);
    }

    return originalFetch.apply(this, args).then((response) => {
      try {
        response.clone().json()
          .then(data => postApiData(url, data))
          .catch(() => {});
      } catch {
        // Ignore non-JSON or non-cloneable responses.
      }
      return response;
    });
  };
}

function installXhrInterceptor(): void {
  const originalOpen = XMLHttpRequest.prototype.open;
  const originalSend = XMLHttpRequest.prototype.send;
  const urlByXhr = new WeakMap<XMLHttpRequest, string>();

  XMLHttpRequest.prototype.open = function interceptedOpen(
    method: string,
    url: string | URL,
    async = true,
    username?: string | null,
    password?: string | null
  ): void {
    urlByXhr.set(this, String(url));
    originalOpen.call(this, method, url, async, username, password);
  };

  XMLHttpRequest.prototype.send = function interceptedSend(body?: Document | XMLHttpRequestBodyInit | null): void {
    const url = urlByXhr.get(this) || '';
    if (isApiUrl(url)) {
      this.addEventListener('load', function onLoad() {
        try {
          if (this.status >= 200 && this.status < 300) {
            postApiData(url, JSON.parse(this.responseText));
          }
        } catch {
          // Ignore non-JSON API responses.
        }
      });
    }

    originalSend.call(this, body);
  };
}

export {};

function sanitizeUrl(value: string): string | undefined {
  try {
    const url = new URL(value, location.href);
    if (url.protocol !== 'https:' || !(url.hostname === 'lanhuapp.com' || url.hostname.endsWith('.lanhuapp.com') ||
      url.hostname === 'lanhu.com' || url.hostname.endsWith('.lanhu.com'))) return;
    return url.origin + url.pathname;
  } catch { return undefined; }
}

function redactSensitive(input: unknown, depth: number): unknown {
  if (depth > 16) return '[depth limit]';
  if (Array.isArray(input)) return input.slice(0, 2000).map(v => redactSensitive(v, depth + 1));
  if (input && typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input).slice(0, 2000)) {
      if (/token|secret|password|authorization|cookie|session|credential|access_key|refresh_key|api_key/i.test(key)) {
        result[key] = '[redacted]';
      } else result[key] = redactSensitive(value, depth + 1);
    }
    return result;
  }
  return input;
}
