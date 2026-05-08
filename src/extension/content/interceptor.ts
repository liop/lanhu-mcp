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
  const dataType = extractDataType(url);
  if (dataType === 'unknown') return;

  window.postMessage({
    source: 'lanhu-mcp-interceptor',
    type: 'API_DATA',
    payload: {
      dataType,
      action: 'cache',
      data,
      url
    }
  }, '*');
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
