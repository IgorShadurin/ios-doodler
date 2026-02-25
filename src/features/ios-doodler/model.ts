import { DEFAULT_STUDIO_LANGUAGE, type StudioLanguage } from '@/features/ios-doodler/languages';

export type LabelAlign = 'left' | 'center' | 'right';
export type LabelVerticalAlign = 'top' | 'center' | 'bottom';

export type TemplateAsset = {
  id: string;
  src: string;
  width: number;
  height: number;
  mimeType: string;
  fileName: string;
};

export type TemplateLabel = {
  id: string;
  key: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: number;
  rotation: number;
  color: string;
  maxLines: number;
  align: LabelAlign;
  verticalAlign: LabelVerticalAlign;
};

export type TemplateSlot = {
  id: string;
  order: number;
  baseAsset: TemplateAsset | null;
  languageOverrides: Record<string, TemplateAsset>;
  labels: TemplateLabel[];
  textByLanguage: Record<string, Record<string, string>>;
};

const DUMMY_TEMPLATE_WIDTH = 1290;
const DUMMY_TEMPLATE_HEIGHT = 2796;
const DEFAULT_LABEL_WIDTH = 0.78;
const DEFAULT_LABEL_Y = 0.16;
const DEFAULT_FONT_SIZE_PX = 100;
const DEFAULT_FONT_SIZE = DEFAULT_FONT_SIZE_PX / DUMMY_TEMPLATE_WIDTH;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampLabelX(x: number, width: number): number {
  const safeWidth = Number.isFinite(width) ? Math.max(width, 0.0001) : 0.0001;
  const minX = safeWidth > 1 ? 1 - safeWidth : 0;
  const maxX = safeWidth > 1 ? 1 : 1 - safeWidth;
  return clamp(x, minX, maxX);
}

function clampLabelY(y: number, height: number): number {
  const safeHeight = Number.isFinite(height) ? Math.max(height, 0.0001) : 0.0001;
  const minY = safeHeight > 1 ? 1 - safeHeight : 0;
  const maxY = safeHeight > 1 ? 1 : 1 - safeHeight;
  return clamp(y, minY, maxY);
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function createEmptySlot(order: number): TemplateSlot {
  return {
    id: `slot-${order}`,
    order,
    baseAsset: null,
    languageOverrides: {},
    labels: [],
    textByLanguage: {},
  };
}

function getInitialLabelStyle(labelKey: string): Pick<
  TemplateLabel,
  | 'width'
  | 'height'
  | 'fontSize'
  | 'fontFamily'
  | 'fontWeight'
  | 'rotation'
  | 'color'
  | 'maxLines'
  | 'align'
  | 'verticalAlign'
> {
  if (labelKey === 'subtitle') {
    return {
      width: 0.78,
      height: 0.2,
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: 'Arial',
      fontWeight: 500,
      rotation: 0,
      color: '#34455f',
      maxLines: 3,
      align: 'center',
      verticalAlign: 'center',
    };
  }

  if (labelKey === 'headline') {
    return {
      width: 0.78,
      height: 0.24,
      fontSize: DEFAULT_FONT_SIZE,
      fontFamily: 'Arial',
      fontWeight: 700,
      rotation: 0,
      color: '#0f1b3d',
      maxLines: 2,
      align: 'center',
      verticalAlign: 'center',
    };
  }

  return {
    width: DEFAULT_LABEL_WIDTH,
    height: 0.18,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: 'Arial',
    fontWeight: 600,
    rotation: 0,
    color: '#233045',
    maxLines: 2,
      align: 'center',
      verticalAlign: 'center',
  };
}

export function createDummyTemplateAsset(): TemplateAsset {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${DUMMY_TEMPLATE_WIDTH}" height="${DUMMY_TEMPLATE_HEIGHT}" viewBox="0 0 ${DUMMY_TEMPLATE_WIDTH} ${DUMMY_TEMPLATE_HEIGHT}" fill="none"><defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E8F3FF"/><stop offset="1" stop-color="#F9EEF9"/></linearGradient></defs><rect width="${DUMMY_TEMPLATE_WIDTH}" height="${DUMMY_TEMPLATE_HEIGHT}" fill="url(#bg)"/><circle cx="210" cy="530" r="260" fill="#D5E7FF"/><circle cx="1040" cy="730" r="220" fill="#FDDDE7"/></svg>`;
  return {
    id: 'dummy-template',
    src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`,
    width: DUMMY_TEMPLATE_WIDTH,
    height: DUMMY_TEMPLATE_HEIGHT,
    mimeType: 'image/svg+xml',
    fileName: 'dummy-template.svg',
  };
}

function getDummyLine(labelKey: string, language: StudioLanguage): string {
  switch (labelKey) {
    case 'headline':
      return `Feature One in ${language.name}`;
    case 'subtitle':
      return `Synthetic preview copy for locale ${language.code}`;
    default:
      return `${labelKey} (${language.code})`;
  }
}

export function createDummyTextByLanguage(
  labelKeys: string[],
  languages: StudioLanguage[],
): Record<string, Record<string, string>> {
  const next: Record<string, Record<string, string>> = {};
  for (const language of languages) {
    const lineMap: Record<string, string> = {};
    for (const labelKey of labelKeys) {
      lineMap[labelKey] = getDummyLine(labelKey, language);
    }
    next[language.code] = lineMap;
  }
  return next;
}

export function createInitialSlots(languages: StudioLanguage[]): TemplateSlot[] {
  const first = createEmptySlot(1);
  const defaultLabelKeys = ['headline', 'subtitle'];
  first.baseAsset = createDummyTemplateAsset();
  first.textByLanguage = createDummyTextByLanguage(defaultLabelKeys, languages);
  for (const labelKey of defaultLabelKeys) {
    const nextFirst = addLabelFromKey(first, labelKey, {
      x: labelKey === 'headline' ? 0.11 : 0.11,
      y: labelKey === 'headline' ? 0.16 : 0.58,
      centered: false,
    });
    first.labels = nextFirst.labels;
    first.textByLanguage = nextFirst.textByLanguage;
  }

  const second = createEmptySlot(2);
  second.textByLanguage = createDummyTextByLanguage([], languages);

  return [first, second];
}

export function resolveAssetForLanguage(slot: TemplateSlot, languageCode: string): TemplateAsset | null {
  return slot.languageOverrides[languageCode] ?? slot.baseAsset;
}

export function applyUploadedAsset(
  slot: TemplateSlot,
  languageCode: string,
  asset: TemplateAsset,
): TemplateSlot {
  if (!slot.baseAsset) {
    return {
      ...slot,
      baseAsset: asset,
    };
  }

  return {
    ...slot,
    languageOverrides: {
      ...slot.languageOverrides,
      [languageCode]: asset,
    },
  };
}

export function resolveLabelText(slot: TemplateSlot, languageCode: string, labelKey: string): string {
  const localized = slot.textByLanguage[languageCode]?.[labelKey];
  if (localized && localized.trim()) return localized;

  const english = slot.textByLanguage[DEFAULT_STUDIO_LANGUAGE]?.[labelKey];
  if (english && english.trim()) return english;

  return `${labelKey} (${languageCode})`;
}

export function updateLabelText(
  slot: TemplateSlot,
  languageCode: string,
  labelKey: string,
  text: string,
): TemplateSlot {
  return {
    ...slot,
    textByLanguage: {
      ...slot.textByLanguage,
      [languageCode]: {
        ...(slot.textByLanguage[languageCode] ?? {}),
        [labelKey]: text,
      },
    },
  };
}

export function moveLabel(slot: TemplateSlot, labelId: string, deltaX: number, deltaY: number): TemplateSlot {
  return {
    ...slot,
    labels: slot.labels.map((label) => {
      if (label.id !== labelId) return label;
      const nextX = clampLabelX(label.x + deltaX, label.width);
      const nextY = clampLabelY(label.y + deltaY, label.height);
      return { ...label, x: nextX, y: nextY };
    }),
  };
}

export function setLabelPosition(slot: TemplateSlot, labelId: string, x: number, y: number): TemplateSlot {
  let changed = false;
  const nextLabels = slot.labels.map((label) => {
    if (label.id !== labelId) return label;
    const nextX = clampLabelX(x, label.width);
    const nextY = clampLabelY(y, label.height);
    if (nextX === label.x && nextY === label.y) {
      return label;
    }
    changed = true;
    return {
      ...label,
      x: nextX,
      y: nextY,
    };
  });

  if (!changed) return slot;
  return {
    ...slot,
    labels: nextLabels,
  };
}

export function updateLabel(
  slot: TemplateSlot,
  labelId: string,
  changes: Partial<Omit<TemplateLabel, 'id' | 'key'>>,
): TemplateSlot {
  let changed = false;
  const nextLabels = slot.labels.map((label) => {
    if (label.id !== labelId) return label;
    const merged: TemplateLabel = {
      ...label,
      ...changes,
    };
    merged.fontFamily = merged.fontFamily?.trim() || 'Arial';
    merged.width = Math.max(merged.width, 0.01);
    merged.height = Math.max(merged.height, 0.01);
    merged.fontSize = Math.max(merged.fontSize, 0.005);
    merged.maxLines = Math.round(clamp(merged.maxLines, 1, 8));
    merged.fontWeight = Math.round(clamp(merged.fontWeight, 100, 900));
    merged.rotation = clamp(merged.rotation, -180, 180);
    merged.x = clampLabelX(merged.x, merged.width);
    merged.y = clampLabelY(merged.y, merged.height);

    const didChange = (
      merged.x !== label.x
      || merged.y !== label.y
      || merged.width !== label.width
      || merged.height !== label.height
      || merged.fontSize !== label.fontSize
      || merged.fontFamily !== label.fontFamily
      || merged.fontWeight !== label.fontWeight
      || merged.rotation !== label.rotation
      || merged.color !== label.color
      || merged.maxLines !== label.maxLines
      || merged.align !== label.align
      || merged.verticalAlign !== label.verticalAlign
    );

    if (!didChange) {
      return label;
    }

    changed = true;
    return merged;
  });

  if (!changed) return slot;
  return {
    ...slot,
    labels: nextLabels,
  };
}

export function addLabel(slot: TemplateSlot, languages: StudioLanguage[]): TemplateSlot {
  const nextIndex = slot.labels.length + 1;
  const newLabel: TemplateLabel = {
    id: createId('label'),
    key: `label_${nextIndex}`,
    x: 0.1,
    y: clamp(0.65 + (nextIndex % 2) * 0.08, 0, 0.9),
    width: 0.76,
    height: 0.16,
    fontSize: DEFAULT_FONT_SIZE,
    fontFamily: 'Arial',
    fontWeight: 600,
    rotation: 0,
    color: '#233045',
    maxLines: 2,
    align: 'center',
    verticalAlign: 'center',
  };

  const nextText = { ...slot.textByLanguage };
  for (const language of languages) {
    nextText[language.code] = {
      ...(nextText[language.code] ?? {}),
      [newLabel.key]: `${newLabel.key} (${language.code})`,
    };
  }

  return {
    ...slot,
    labels: [...slot.labels, newLabel],
    textByLanguage: nextText,
  };
}

export function removeSlotAndNormalizeOrder(slots: TemplateSlot[], slotId: string): TemplateSlot[] {
  const next = slots.filter((slot) => slot.id !== slotId);
  return next.map((slot, index) => ({
    ...slot,
    order: index + 1,
  }));
}

export function removeLabel(slot: TemplateSlot, labelId: string): TemplateSlot {
  return {
    ...slot,
    labels: slot.labels.filter((label) => label.id !== labelId),
  };
}

export function listSlotLabelKeys(slot: TemplateSlot, preferredLanguageCode?: string): string[] {
  const ordered: string[] = [];
  const seen = new Set<string>();

  const pushKey = (rawKey: string) => {
    const key = rawKey.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    ordered.push(key);
  };

  const pushLanguageKeys = (languageCode: string | undefined) => {
    if (!languageCode) return;
    const keyMap = slot.textByLanguage[languageCode];
    if (!keyMap) return;
    for (const key of Object.keys(keyMap)) {
      pushKey(key);
    }
  };

  pushLanguageKeys(preferredLanguageCode);
  pushLanguageKeys(DEFAULT_STUDIO_LANGUAGE);
  for (const languageCode of Object.keys(slot.textByLanguage).sort()) {
    pushLanguageKeys(languageCode);
  }

  // Fallback for legacy data where labels exist but text map is empty.
  for (const label of slot.labels) {
    pushKey(label.key);
  }

  return ordered;
}

export function addLabelFromKey(
  slot: TemplateSlot,
  labelKey: string,
  options?: {
    x?: number;
    y?: number;
    centered?: boolean;
  },
): TemplateSlot {
  const key = labelKey.trim();
  if (!key) {
    return slot;
  }

  const initialStyle = getInitialLabelStyle(key);
  const width = initialStyle.width;

  const offsetIndex = slot.labels.length;
  const fallbackX = 0.11 + (offsetIndex % 3) * 0.03;
  const fallbackY = DEFAULT_LABEL_Y + (offsetIndex % 5) * 0.06;
  const requestedX = options?.x ?? fallbackX;
  const requestedY = options?.y ?? fallbackY;
  const nextX = options?.centered
    ? clampLabelX(requestedX - width / 2, width)
    : clampLabelX(requestedX, width);
  const nextY = clampLabelY(requestedY, initialStyle.height);

  const nextLabel: TemplateLabel = {
    id: createId('label'),
    key,
    x: nextX,
    y: nextY,
    ...initialStyle,
  };

  const nextTextByLanguage: Record<string, Record<string, string>> = {};
  for (const [languageCode, map] of Object.entries(slot.textByLanguage)) {
    nextTextByLanguage[languageCode] = {
      ...map,
      [key]: map[key] ?? `${key} (${languageCode})`,
    };
  }

  return {
    ...slot,
    labels: [...slot.labels, nextLabel],
    textByLanguage: Object.keys(nextTextByLanguage).length > 0 ? nextTextByLanguage : slot.textByLanguage,
  };
}

export function toAbsoluteLabelBox(label: TemplateLabel, size: { width: number; height: number }) {
  return {
    left: label.x * size.width,
    top: label.y * size.height,
    width: label.width * size.width,
    height: label.height * size.height,
    fontSize: label.fontSize * size.width,
    rotation: label.rotation,
  };
}
