export function findRecordById(cached: unknown, id: string): Record<string, unknown> | undefined {
  const records = toRecordArray(cached);

  return records.find((record) => {
    return ['id', 'projectId', 'screenId', 'layerId'].some(key => String((record as Record<string, unknown>)[key]) === id);
  });
}

export function toRecordArray(cached: unknown): Record<string, unknown>[] {
  const records = Array.isArray(cached)
    ? cached
    : cached && typeof cached === 'object'
      ? [cached]
      : [];

  return records.filter((record): record is Record<string, unknown> => Boolean(record) && typeof record === 'object' && !Array.isArray(record));
}

export function getUrlObserverTarget<T>(documentLike: { body: T | null; documentElement: T | null }): T | null {
  return documentLike.body ?? documentLike.documentElement ?? null;
}

const IGNORED_PAGE_TEXT = new Set([
  '页面',
  '搜索',
  '产品',
  '设计',
  '文档',
  '分享',
  '全部',
  '未分组',
  '新建分组',
  '本地上传',
  'Sketch 插件下载',
  'Photoshop 插件下载',
  'Adobe XD 插件下载',
  'Figma 插件下载',
  'MasterGo 去使用'
]);

const IGNORED_PAGE_TEXT_PATTERNS = [
  /^Shift\s*\+\s*N$/,
  /^\d+$/,
  /^\d+%$/,
  /\.(rp|sketch|psd|fig|figma|xd)$/i,
  /选择文件/,
  /该页文档还没有评论/,
  /打开过分享页/,
  /网络已连接成功/,
  /上传设计图/,
  /团队共享/,
  /支持格式/,
  /自动标注/
];

export function extractLanhuPageNames(text: string): string[] {
  const names: string[] = [];
  const seen = new Set<string>();

  for (const rawLine of text.split(/\r?\n/)) {
    const name = rawLine.replace(/\s+/g, ' ').trim();
    if (!name || seen.has(name) || IGNORED_PAGE_TEXT.has(name)) {
      continue;
    }
    if (name.length > 80 || IGNORED_PAGE_TEXT_PATTERNS.some(pattern => pattern.test(name))) {
      continue;
    }

    seen.add(name);
    names.push(name);
  }

  return names;
}
