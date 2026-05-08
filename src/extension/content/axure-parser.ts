import type { LanhuLayer, LanhuLayerStyles, LanhuScreen } from '../../shared/types.js';

type LayerType = LanhuLayer['type'];

interface AxureParseContext {
  screenId?: string;
  projectId?: string;
  url?: string;
}

interface ElementWithStyle extends Element {
  style?: Partial<CSSStyleDeclaration> & Record<string, string | undefined>;
}

const AXURE_CHILD_ID_SUFFIXES = ['_div', '_text', '_img', '_input'];

export function isAxureDocument(documentLike: Pick<Document, 'querySelector'>): boolean {
  return Boolean(documentLike.querySelector('#base, .ax_default, [id^="u"][style*="position"]'));
}

export function extractAxureLayers(documentLike: Pick<Document, 'querySelectorAll'>, context: AxureParseContext = {}): Array<LanhuLayer & { source: 'axure-html' }> {
  const candidates = Array.from(documentLike.querySelectorAll('#base [id], .ax_default[id], [data-label]')) as ElementWithStyle[];
  const layers: Array<LanhuLayer & { source: 'axure-html' }> = [];
  const seen = new Set<string>();

  for (const element of candidates) {
    const id = getElementId(element);
    if (!id || seen.has(id) || isAxureChildNode(id)) {
      continue;
    }

    const bounds = getElementBounds(element);
    const textContent = normalizeText(element.textContent || '');
    const imageSource = getNestedImageSource(element);
    const name = getLayerName(element, textContent, imageSource, id);
    const type = getLayerType(element, textContent, imageSource);

    if (!shouldIncludeLayer(name, bounds, textContent, imageSource)) {
      continue;
    }

    seen.add(id);
    layers.push(removeUndefined({
      id,
      name,
      screenId: context.screenId || '',
      parentId: getParentLayerId(element),
      type,
      x: bounds.x,
      y: bounds.y,
      width: bounds.width,
      height: bounds.height,
      visible: isVisible(element),
      textContent: textContent || undefined,
      styles: getLayerStyles(element),
      source: 'axure-html' as const
    }));
  }

  return layers;
}

export function extractAxureScreen(documentLike: Pick<Document, 'title' | 'body' | 'querySelectorAll'>, context: AxureParseContext = {}): (LanhuScreen & { source: 'axure-html'; prototypeUrl?: string; layerCount: number }) | undefined {
  if (!context.screenId) {
    return undefined;
  }

  const layers = extractAxureLayers(documentLike, context);
  const width = Math.max(0, ...layers.map(layer => layer.x + layer.width), documentLike.body?.scrollWidth || 0);
  const height = Math.max(0, ...layers.map(layer => layer.y + layer.height), documentLike.body?.scrollHeight || 0);

  return {
    id: context.screenId,
    name: normalizeText(documentLike.title) || context.screenId,
    projectId: context.projectId || '',
    width,
    height,
    createdAt: '',
    updatedAt: '',
    prototypeUrl: context.url,
    layerCount: layers.length,
    source: 'axure-html'
  };
}

function getElementId(element: Element): string {
  return element.id || element.getAttribute('data-label') || '';
}

function isAxureChildNode(id: string): boolean {
  return AXURE_CHILD_ID_SUFFIXES.some(suffix => id.endsWith(suffix));
}

function getLayerName(element: Element, textContent: string, imageSource: string | undefined, fallback: string): string {
  return normalizeText(
    element.getAttribute('data-label')
      || element.getAttribute('aria-label')
      || element.getAttribute('title')
      || element.getAttribute('alt')
      || textContent
      || imageSource?.split('/').pop()
      || fallback
  );
}

function getLayerType(element: Element, textContent: string, imageSource: string | undefined): LayerType {
  const tagName = element.tagName.toLowerCase();
  const className = getClassName(element);

  if (className.includes('group')) return 'group';
  if (imageSource || tagName === 'img' || className.includes('image')) return 'image';
  if (isFormOrButton(tagName) || className.includes('button') || className.includes('hotspot')) return 'component';
  if (textContent || className.includes('paragraph') || className.includes('heading') || className.includes('label')) return 'text';
  if (className.includes('box') || className.includes('ellipse') || className.includes('shape')) return 'shape';

  return 'container';
}

function isFormOrButton(tagName: string): boolean {
  return ['button', 'input', 'select', 'textarea'].includes(tagName);
}

function getClassName(element: Element): string {
  const className = element.className;
  return typeof className === 'string' ? className.toLowerCase() : '';
}

function getElementBounds(element: ElementWithStyle): { x: number; y: number; width: number; height: number } {
  const rect = typeof element.getBoundingClientRect === 'function'
    ? element.getBoundingClientRect()
    : undefined;

  return {
    x: parsePixels(getStyleValue(element, 'left'), rect?.left || 0),
    y: parsePixels(getStyleValue(element, 'top'), rect?.top || 0),
    width: parsePixels(getStyleValue(element, 'width'), rect?.width || 0),
    height: parsePixels(getStyleValue(element, 'height'), rect?.height || 0)
  };
}

function getLayerStyles(element: ElementWithStyle): LanhuLayerStyles | undefined {
  const styles = removeUndefined<LanhuLayerStyles>({
    backgroundColor: emptyToUndefined(getStyleValue(element, 'backgroundColor')),
    borderColor: emptyToUndefined(getStyleValue(element, 'borderColor')),
    borderWidth: optionalPixels(getStyleValue(element, 'borderWidth')),
    borderRadius: optionalPixels(getStyleValue(element, 'borderRadius')),
    boxShadow: emptyToUndefined(getStyleValue(element, 'boxShadow')),
    fontSize: optionalPixels(getStyleValue(element, 'fontSize')),
    fontFamily: emptyToUndefined(getStyleValue(element, 'fontFamily')),
    fontWeight: optionalInteger(getStyleValue(element, 'fontWeight')),
    color: emptyToUndefined(getStyleValue(element, 'color')),
    opacity: optionalNumber(getStyleValue(element, 'opacity')),
    textAlign: normalizeTextAlign(getStyleValue(element, 'textAlign'))
  });

  return Object.keys(styles).length > 0 ? styles : undefined;
}

function getStyleValue(element: ElementWithStyle, key: keyof CSSStyleDeclaration): string {
  const inline = element.style?.[key];
  if (typeof inline === 'string' && inline) {
    return inline;
  }

  const view = element.ownerDocument?.defaultView;
  if (view) {
    return view.getComputedStyle(element).getPropertyValue(kebabCase(String(key)));
  }

  return '';
}

function getNestedImageSource(element: Element): string | undefined {
  const image = element.tagName.toLowerCase() === 'img'
    ? element
    : element.querySelector('img, image');
  return image?.getAttribute('src') || image?.getAttribute('href') || undefined;
}

function getParentLayerId(element: Element): string | undefined {
  let parent = element.parentElement;
  while (parent) {
    if (parent.id && !isAxureChildNode(parent.id) && (parent.id.startsWith('u') || getClassName(parent).includes('ax_default'))) {
      return parent.id;
    }
    parent = parent.parentElement;
  }
  return undefined;
}

function shouldIncludeLayer(
  name: string,
  bounds: { width: number; height: number },
  textContent: string,
  imageSource: string | undefined
): boolean {
  return Boolean(name && (textContent || imageSource || bounds.width > 0 || bounds.height > 0));
}

function isVisible(element: ElementWithStyle): boolean {
  return getStyleValue(element, 'display') !== 'none'
    && getStyleValue(element, 'visibility') !== 'hidden'
    && getStyleValue(element, 'opacity') !== '0';
}

function normalizeText(value: string | null | undefined): string {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function parsePixels(value: string | undefined, fallback = 0): number {
  if (!value) return fallback;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalPixels(value: string): number | undefined {
  return value ? parsePixels(value) : undefined;
}

function optionalInteger(value: string): number | undefined {
  if (!value || value === 'normal') return undefined;
  const parsed = parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalNumber(value: string): number | undefined {
  if (!value) return undefined;
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function normalizeTextAlign(value: string): LanhuLayerStyles['textAlign'] | undefined {
  return value === 'left' || value === 'center' || value === 'right' ? value : undefined;
}

function emptyToUndefined(value: string): string | undefined {
  return value || undefined;
}

function kebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`);
}

function removeUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined)) as T;
}
