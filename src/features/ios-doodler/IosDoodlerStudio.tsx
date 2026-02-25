"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Image from 'next/image';
import {
  Monitor,
  Languages,
  Plus,
  Upload,
  Download,
  EllipsisVertical,
  PencilRuler,
  ImagePlus,
  Smartphone,
  Search,
  Trash2,
  RotateCcw,
  Github,
  Crop,
  FileJson,
  GripVertical,
  Type,
  AlignLeft,
  AlignCenter,
  AlignRight,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Star,
  ChevronDown,
} from 'lucide-react';
import {
  addLabelFromKey,
  applyUploadedAsset,
  createEmptySlot,
  createInitialSlots,
  listSlotLabelKeys,
  removeLabel,
  removeSlotAndNormalizeOrder,
  resolveAssetForLanguage,
  resolveLabelText,
  setLabelPosition,
  toAbsoluteLabelBox,
  updateLabel,
  updateLabelText,
  type LabelAlign,
  type LabelVerticalAlign,
  type TemplateAsset,
  type TemplateSlot,
} from '@/features/ios-doodler/model';
import { clearIosDoodlerState, loadIosDoodlerState, saveIosDoodlerState, type IosDoodlerPersistedState } from '@/features/ios-doodler/browser-db';
import { DEFAULT_STUDIO_LANGUAGE, STUDIO_LANGUAGES } from '@/features/ios-doodler/languages';
import {
  computeCropRect,
  getCropAnchorsForAspectMismatch,
  hasMatchingAspectRatio,
  type CropAnchor,
} from '@/features/ios-doodler/image-fit';
import {
  applyTranslationsImport,
  parseTranslationsImportJson,
  type ParsedTranslationsImport,
} from '@/features/ios-doodler/translations-import';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

type LabelDragState = {
  slotId: string;
  labelId: string;
  mode: 'move' | 'resize' | 'rotate';
  resizeEdge?: ResizeEdge;
  pointerId: number;
  pointerCaptureTarget: HTMLElement | null;
  startClientX: number;
  startClientY: number;
  startLabelX: number;
  startLabelY: number;
  startLabelWidth: number;
  startLabelHeight: number;
  startLabelRotation: number;
  startPointerAngle?: number;
  rotateCenterX?: number;
  rotateCenterY?: number;
  frameWidth: number;
  frameHeight: number;
};

type PendingLabelDragUpdate = {
  slotId: string;
  labelId: string;
  mode: 'move' | 'resize' | 'rotate';
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
};

type ResizeEdge =
  | 'left'
  | 'right'
  | 'top'
  | 'bottom'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

type LabelNumericField = 'x' | 'y' | 'width' | 'height' | 'fontSize' | 'fontWeight' | 'maxLines';
type LabelNumericDraft = Record<LabelNumericField, string>;

type PendingImageUpload = {
  slotId: string;
  sourceAsset: TemplateAsset;
  targetWidth: number;
  targetHeight: number;
  anchorOptions: CropAnchor[];
  selectedAnchor: CropAnchor;
};

const LEGACY_STORAGE_KEY = 'ios-doodler-studio-v3';
const ALL_LANGUAGE_CODES = STUDIO_LANGUAGES.map((language) => language.code);
const LANGUAGE_ORDER_INDEX = new Map(ALL_LANGUAGE_CODES.map((code, index) => [code, index]));
const SOURCE_CODE_URL = 'https://github.com/IgorShadurin/ios-doodler';
const DEFAULT_SLOT_WIDTH = 1290;
const DEFAULT_SLOT_HEIGHT = 2796;
const LABEL_KEY_DRAG_MIME = 'text/x-ios-doodler-label-key';
const MIN_FONT_SIZE_PX = 6;
const DEFAULT_FONT_FAMILIES = [
  'Arial',
  'Helvetica',
  'Helvetica Neue',
  'Times New Roman',
  'Georgia',
  'Verdana',
  'Tahoma',
  'Trebuchet MS',
  'Gill Sans',
  'Futura',
  'Avenir',
  'Didot',
  'American Typewriter',
  'Courier New',
  'Menlo',
  'Monaco',
  'Optima',
  'Palatino',
  'Baskerville',
  'Impact',
  'Comic Sans MS',
  'system-ui',
  'sans-serif',
  'serif',
  'monospace',
];

function toPngFileName(fileName: string): string {
  const dotIndex = fileName.lastIndexOf('.');
  if (dotIndex <= 0) {
    return `${fileName}.png`;
  }
  return `${fileName.slice(0, dotIndex)}.png`;
}

function formatCropAnchorLabel(anchor: CropAnchor): string {
  switch (anchor) {
    case 'left':
      return 'Left';
    case 'right':
      return 'Right';
    case 'top':
      return 'Top';
    case 'bottom':
      return 'Bottom';
    default:
      return 'Center';
  }
}

function orderLanguageCodes(codes: string[]): string[] {
  return Array.from(new Set(codes)).sort(
    (first, second) =>
      (LANGUAGE_ORDER_INDEX.get(first) ?? Number.MAX_SAFE_INTEGER) -
      (LANGUAGE_ORDER_INDEX.get(second) ?? Number.MAX_SAFE_INTEGER),
  );
}

function clamp01(value: number): number {
  return Math.min(Math.max(value, 0), 1);
}

function toCanvasFontFamily(fontFamily: string): string {
  const normalized = fontFamily.trim();
  if (!normalized) return 'Arial, sans-serif';
  if (normalized.includes(',') || normalized.includes('"') || normalized.includes("'")) {
    return normalized;
  }
  return /[\s-]/.test(normalized) ? `"${normalized}"` : normalized;
}

function useElementSize<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    if (!ref.current) return;
    const node = ref.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setSize({ width, height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return [ref, size] as const;
}

function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}

function formatSize(asset: TemplateAsset | null): string {
  if (!asset) return 'empty shot';
  return `${asset.width}x${asset.height}`;
}

function ensureTemplateAssetFromFile(file: File): Promise<TemplateAsset> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('failed to read file'));
    reader.onload = () => {
      const src = String(reader.result || '');
      const image = new window.Image();
      image.onerror = () => reject(new Error('failed to decode image'));
      image.onload = () => {
        resolve({
          id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          src,
          width: image.naturalWidth,
          height: image.naturalHeight,
          mimeType: file.type || 'image/png',
          fileName: file.name,
        });
      };
      image.src = src;
    };
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('failed to load image'));
    img.src = src;
  });
}

async function fitAssetToTarget(
  sourceAsset: TemplateAsset,
  targetWidth: number,
  targetHeight: number,
  anchor: CropAnchor,
): Promise<TemplateAsset> {
  const image = await loadImage(sourceAsset.src);
  const canvas = document.createElement('canvas');
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('failed to create canvas context');
  }

  const cropRect = computeCropRect(
    sourceAsset.width,
    sourceAsset.height,
    targetWidth,
    targetHeight,
    anchor,
  );

  context.drawImage(
    image,
    cropRect.sx,
    cropRect.sy,
    cropRect.sw,
    cropRect.sh,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  return {
    id: `asset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    src: canvas.toDataURL('image/png'),
    width: targetWidth,
    height: targetHeight,
    mimeType: 'image/png',
    fileName: toPngFileName(sourceAsset.fileName),
  };
}

function wrapCanvasLines(
  context: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (!text.trim()) return [''];
  const lines: string[] = [];
  const paragraphs = text.split(/\n/g);

  for (const paragraph of paragraphs) {
    const sourceTokens = paragraph.trim().includes(' ')
      ? paragraph.trim().split(/\s+/)
      : Array.from(paragraph.trim());

    if (sourceTokens.length === 0) {
      lines.push('');
      if (lines.length >= maxLines) break;
      continue;
    }

    let current = sourceTokens[0] ?? '';
    for (let index = 1; index < sourceTokens.length; index += 1) {
      const token = sourceTokens[index];
      const candidate = paragraph.trim().includes(' ') ? `${current} ${token}` : `${current}${token}`;
      if (context.measureText(candidate).width <= maxWidth) {
        current = candidate;
        continue;
      }
      lines.push(current);
      if (lines.length >= maxLines) break;
      current = token;
    }

    if (lines.length >= maxLines) break;
    lines.push(current);
    if (lines.length >= maxLines) break;
  }

  if (lines.length <= maxLines) return lines;
  return lines.slice(0, maxLines);
}

async function renderSlotBlob(slot: TemplateSlot, languageCode: string): Promise<Blob | null> {
  const asset = resolveAssetForLanguage(slot, languageCode);
  if (!asset) return null;

  const image = await loadImage(asset.src);
  const canvas = document.createElement('canvas');
  canvas.width = asset.width;
  canvas.height = asset.height;

  const context = canvas.getContext('2d');
  if (!context) return null;

  context.drawImage(image, 0, 0, asset.width, asset.height);

  for (const label of slot.labels) {
    const box = toAbsoluteLabelBox(label, asset);
    const text = resolveLabelText(slot, languageCode, label.key);
    context.fillStyle = label.color;
    context.font = `${label.fontWeight} ${box.fontSize}px ${toCanvasFontFamily(label.fontFamily)}`;
    context.textAlign = label.align;
    context.textBaseline = 'top';

    const lineHeight = box.fontSize * 1.15;
    const lines = wrapCanvasLines(context, text, box.width, label.maxLines).slice(0, label.maxLines);
    const anchorX = box.left + box.width / 2;
    const anchorY = box.top + box.height / 2;
    const textOffsetX = label.align === 'left' ? -box.width / 2 : label.align === 'center' ? 0 : box.width / 2;
    const blockHeight = lines.length * lineHeight;
    const verticalAlign = label.verticalAlign ?? 'center';
    const textOffsetY = verticalAlign === 'bottom'
      ? box.height / 2 - blockHeight
      : verticalAlign === 'center'
        ? -blockHeight / 2
        : -box.height / 2;
    context.save();
    context.translate(anchorX, anchorY);
    context.rotate((box.rotation * Math.PI) / 180);
    context.beginPath();
    context.rect(-box.width / 2, -box.height / 2, box.width, box.height);
    context.clip();

    lines.forEach((line, lineIndex) => {
      context.fillText(line, textOffsetX, textOffsetY + lineIndex * lineHeight, box.width);
    });

    context.restore();
  }

  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), 'image/png');
  });
}

function LabelOverlay({
  slot,
  languageCode,
  showGuides,
  selectedLabelId,
  onLabelPointerDown,
  onDeleteLabel,
  onDropLabelKey,
  onEmptyUpload,
  fitMode = 'width',
}: {
  slot: TemplateSlot;
  languageCode: string;
  showGuides: boolean;
  selectedLabelId?: string | null;
  onLabelPointerDown?: (
    labelId: string,
    mode: 'move' | 'resize' | 'rotate',
    event: React.PointerEvent<HTMLElement>,
    frame: {
      width: number;
      height: number;
      left: number;
      top: number;
      rotateCenterX?: number;
      rotateCenterY?: number;
      resizeEdge?: ResizeEdge;
    },
  ) => void;
  onDeleteLabel?: (labelId: string) => void;
  onDropLabelKey?: (labelKey: string, position: { x: number; y: number }) => void;
  onEmptyUpload?: () => void;
  fitMode?: 'width' | 'contain';
}) {
  const asset = resolveAssetForLanguage(slot, languageCode);
  const [viewportRef, viewportSize] = useElementSize<HTMLDivElement>();
  const frameElementRef = useRef<HTMLDivElement | null>(null);
  const [loadedImageSrc, setLoadedImageSrc] = useState<string | null>(null);
  const [isKeyDragOver, setIsKeyDragOver] = useState(false);
  const placeholderAspectRatio = '1290 / 2796';
  const canDropLabelKeys = Boolean(showGuides && onDropLabelKey);

  const handleLabelKeyDrop = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    if (!canDropLabelKeys || !onDropLabelKey) return;
    const droppedKey = event.dataTransfer.getData(LABEL_KEY_DRAG_MIME).trim();
    if (!droppedKey) return;
    const frameRect = frameElementRef.current?.getBoundingClientRect();
    if (!frameRect || frameRect.width <= 0 || frameRect.height <= 0) return;
    const normalizedX = clamp01((event.clientX - frameRect.left) / frameRect.width);
    const normalizedY = clamp01((event.clientY - frameRect.top) / frameRect.height);
    onDropLabelKey(droppedKey, { x: normalizedX, y: normalizedY });
  }, [canDropLabelKeys, onDropLabelKey]);

  if (!asset) {
    return (
      <div
        className={cn(
          'relative border border-dashed border-slate-300 bg-white/80 text-sm text-slate-500',
          fitMode === 'contain' ? 'h-full w-auto max-w-full' : 'w-full',
        )}
        style={{ aspectRatio: placeholderAspectRatio }}
      >
        <button
          type="button"
          onClick={onEmptyUpload}
          className="group absolute inset-0 flex h-full w-full flex-col items-center justify-center gap-3 text-slate-500 transition hover:bg-sky-50/60 hover:text-sky-700"
        >
          <ImagePlus className="h-11 w-11" />
          <span className="text-sm font-medium">Upload image</span>
        </button>
      </div>
    );
  }

  const containScale = fitMode === 'contain' && viewportSize.width > 0 && viewportSize.height > 0
    ? Math.min(viewportSize.width / asset.width, viewportSize.height / asset.height)
    : null;
  const containFrameWidth = containScale ? asset.width * containScale : null;
  const containFrameHeight = containScale ? asset.height * containScale : null;
  const isFrameMeasured = fitMode === 'contain'
    ? Boolean(containFrameWidth && containFrameHeight)
    : viewportSize.width > 0;
  const isReadyToRender = isFrameMeasured && loadedImageSrc === asset.src;
  const scale = fitMode === 'contain'
    ? (containFrameWidth ? containFrameWidth / asset.width : 1)
    : (viewportSize.width > 0 ? viewportSize.width / asset.width : 1);

  return (
    <div
      ref={viewportRef}
      className={cn(
        'relative',
        fitMode === 'contain' ? 'h-full w-full' : 'w-full',
      )}
      style={fitMode === 'width' ? { aspectRatio: `${asset.width} / ${asset.height}` } : undefined}
    >
      <div
        ref={frameElementRef}
        className={cn(
          'relative overflow-hidden border border-slate-200 bg-white',
          fitMode === 'contain' ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2' : 'h-full w-full',
          canDropLabelKeys && isKeyDragOver && 'ring-2 ring-sky-300',
        )}
        style={fitMode === 'contain'
          ? {
            width: containFrameWidth ?? undefined,
            height: containFrameHeight ?? undefined,
            aspectRatio: `${asset.width} / ${asset.height}`,
          }
          : undefined}
        onDragOver={(event) => {
          if (!canDropLabelKeys) return;
          event.preventDefault();
          if (!isKeyDragOver) setIsKeyDragOver(true);
        }}
        onDragLeave={() => {
          if (isKeyDragOver) setIsKeyDragOver(false);
        }}
        onDrop={(event) => {
          if (!canDropLabelKeys) return;
          event.preventDefault();
          setIsKeyDragOver(false);
          handleLabelKeyDrop(event);
        }}
      >
        <Image
          src={asset.src}
          alt={`Template ${slot.order}`}
          fill
          unoptimized
          className={cn(
            'object-cover transition-opacity duration-150',
            isReadyToRender ? 'opacity-100' : 'opacity-0',
          )}
          onLoad={() => setLoadedImageSrc(asset.src)}
          sizes="(min-width: 1280px) 420px, (min-width: 1024px) 360px, 90vw"
        />

        {!isReadyToRender ? (
          <div className="absolute inset-0 animate-pulse bg-slate-100/70" />
        ) : null}

        {isReadyToRender ? (
          <div className="pointer-events-none absolute inset-0">
            <div
              className="absolute left-0 top-0 origin-top-left"
              style={{
                width: asset.width,
                height: asset.height,
                transform: `scale(${scale})`,
                transformOrigin: 'top left',
              }}
            >
                {slot.labels.map((label) => {
                const box = toAbsoluteLabelBox(label, asset);
                const text = resolveLabelText(slot, languageCode, label.key);
                const isSelected = selectedLabelId === label.id;
                const verticalAlign = label.verticalAlign ?? 'center';
                const horizontalAlignValue = label.align ?? 'center';
                const horizontalAlign = horizontalAlignValue === 'left'
                  ? 'start'
                  : horizontalAlignValue === 'center'
                    ? 'center'
                    : 'end';
                const verticalJustify = verticalAlign === 'top'
                  ? 'start'
                  : verticalAlign === 'center'
                    ? 'center'
                    : 'end';
                const handleScale = Math.min(Math.max(scale > 0 ? 1 / scale : 1, 1), 6);
            const resizeHandles: Array<{ edge: ResizeEdge; className: string; ariaLabel: string }> = [
              { edge: 'left', className: 'absolute -left-2 top-2 bottom-2 w-4 cursor-ew-resize', ariaLabel: 'Resize left edge' },
              { edge: 'right', className: 'absolute -right-2 top-2 bottom-2 w-4 cursor-ew-resize', ariaLabel: 'Resize right edge' },
              { edge: 'top', className: 'absolute -top-2 left-2 right-2 h-4 cursor-ns-resize', ariaLabel: 'Resize top edge' },
              { edge: 'bottom', className: 'absolute -bottom-2 left-2 right-2 h-4 cursor-ns-resize', ariaLabel: 'Resize bottom edge' },
              { edge: 'top-left', className: 'absolute -left-2 -top-2 h-4 w-4 cursor-nwse-resize', ariaLabel: 'Resize top left corner' },
              { edge: 'top-right', className: 'absolute -right-2 -top-2 h-4 w-4 cursor-nesw-resize', ariaLabel: 'Resize top right corner' },
              { edge: 'bottom-left', className: 'absolute -left-2 -bottom-2 h-4 w-4 cursor-nesw-resize', ariaLabel: 'Resize bottom left corner' },
              { edge: 'bottom-right', className: 'absolute -right-2 -bottom-2 h-4 w-4 cursor-nwse-resize', ariaLabel: 'Resize bottom right corner' },
            ];
            return (
              <div
                key={label.id}
                data-label-overlay="true"
                className={cn(
                  'absolute select-none whitespace-pre-wrap leading-[1.14] text-balance',
                  showGuides && 'pointer-events-auto rounded-xl border-2 border-dotted border-sky-700/95 bg-sky-50/12',
                  showGuides && isSelected && 'border-sky-900 shadow-[0_0_0_2px_rgba(2,6,23,0.28),_0_0_0_3px_rgba(15,23,42,0.14)]',
                )}
                onPointerDown={(event) => {
                  if (!showGuides || !onLabelPointerDown) return;
                  const frameRect = frameElementRef.current?.getBoundingClientRect();
                  onLabelPointerDown(label.id, 'move', event, {
                    width: frameRect?.width ?? containFrameWidth ?? viewportSize.width,
                    height: frameRect?.height ?? containFrameHeight ?? viewportSize.height,
                    left: frameRect?.left ?? 0,
                    top: frameRect?.top ?? 0,
                  });
                }}
                style={{
                  left: box.left,
                  top: box.top,
                  width: box.width,
                  height: box.height,
                  fontSize: box.fontSize,
                  fontFamily: label.fontFamily,
                  fontWeight: label.fontWeight,
                  color: label.color,
                      textAlign: horizontalAlignValue,
                  overflow: showGuides && isSelected ? 'visible' : 'hidden',
                  background: 'transparent',
                  transform: `rotate(${box.rotation}deg)`,
                  transformOrigin: '50% 50%',
                  cursor: showGuides
                    ? (isSelected ? 'grab' : 'move')
                    : undefined,
                  touchAction: 'none',
                }}
                >
                  <span
                    className="block w-full whitespace-pre-wrap leading-[1.14]"
                    style={{
                      display: 'grid',
                      width: '100%',
                      height: '100%',
                      justifyItems: horizontalAlign,
                      alignContent: verticalJustify,
                      overflow: 'visible',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                    }}
                  >
                  {text}
                </span>
                {showGuides && isSelected && onLabelPointerDown ? (
                  <>
                    {resizeHandles.map((handle) => (
                      <button
                        key={handle.edge}
                        type="button"
                        aria-label={handle.ariaLabel}
                        className={cn('z-20 rounded-none border-none bg-transparent p-0', handle.className)}
                        style={{
                          transform: `scale(${handleScale})`,
                          transformOrigin: 'center',
                          touchAction: 'none',
                        }}
                        onPointerDown={(event) => {
                          event.stopPropagation();
                          const frameRect = frameElementRef.current?.getBoundingClientRect();
                          onLabelPointerDown(label.id, 'resize', event, {
                            width: frameRect?.width ?? containFrameWidth ?? viewportSize.width,
                            height: frameRect?.height ?? containFrameHeight ?? viewportSize.height,
                            left: frameRect?.left ?? 0,
                            top: frameRect?.top ?? 0,
                            resizeEdge: handle.edge,
                          });
                        }}
                      />
                    ))}
                  </>
                ) : null}
              </div>
            );
              })}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function normalizeLoadedSlots(value: unknown): TemplateSlot[] | null {
  if (!Array.isArray(value)) return null;
  const parsed = value
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => {
      const item = entry as TemplateSlot;
      const parsedLabels = Array.isArray(item.labels)
        ? item.labels.map((label) => ({
          ...label,
          height:
            typeof (label as { height?: unknown }).height === 'number' && Number.isFinite((label as { height: number }).height)
              ? Math.max((label as { height: number }).height, 0.01)
              : Math.max(
                ((typeof (label as { fontSize?: unknown }).fontSize === 'number'
                  ? (label as { fontSize: number }).fontSize
                  : 0.04) * Math.max(
                    typeof (label as { maxLines?: unknown }).maxLines === 'number'
                      ? (label as { maxLines: number }).maxLines
                      : 2,
                    1,
                  ) * 1.15),
                0.01,
              ),
          fontFamily:
            typeof (label as { fontFamily?: unknown }).fontFamily === 'string'
              ? ((label as { fontFamily: string }).fontFamily.trim() || 'Arial')
              : 'Arial',
          rotation: typeof (label as { rotation?: unknown }).rotation === 'number'
            ? (label as { rotation: number }).rotation
            : 0,
        }))
        : [];
      const isLegacyDefaultLabelSet =
        parsedLabels.length === 2
        && parsedLabels.every((label) => label.id === label.key)
        && parsedLabels.every((label) => label.key === 'headline' || label.key === 'subtitle');
      return {
        ...item,
        languageOverrides: item.languageOverrides ?? {},
        labels: isLegacyDefaultLabelSet ? [] : parsedLabels,
        textByLanguage: item.textByLanguage ?? {},
      };
    });
  return parsed.length > 0 ? parsed : null;
}

function sanitizePersistedState(value: unknown): IosDoodlerPersistedState | null {
  if (!value || typeof value !== 'object') return null;
  const parsed = value as {
    slots?: unknown;
    enabledLanguages?: unknown;
    activeLanguageCode?: unknown;
    favoriteFonts?: unknown;
  };

  const loadedSlots = normalizeLoadedSlots(parsed.slots);
  if (!loadedSlots) return null;

  const loadedLanguages = Array.isArray(parsed.enabledLanguages)
    ? parsed.enabledLanguages.filter((code: unknown) => typeof code === 'string' && ALL_LANGUAGE_CODES.includes(code))
    : null;
  const enabledLanguages = loadedLanguages && loadedLanguages.length > 0
    ? orderLanguageCodes(loadedLanguages)
    : [...ALL_LANGUAGE_CODES];

  const activeLanguageCode = typeof parsed.activeLanguageCode === 'string' && enabledLanguages.includes(parsed.activeLanguageCode)
    ? parsed.activeLanguageCode
    : DEFAULT_STUDIO_LANGUAGE;
  const favoriteFonts = Array.isArray(parsed.favoriteFonts)
    ? Array.from(
      new Set(
        parsed.favoriteFonts
          .filter((font): font is string => typeof font === 'string')
          .map((font) => font.trim())
          .filter((font) => font.length > 0),
      ),
    )
    : [];

  return {
    slots: loadedSlots,
    enabledLanguages,
    activeLanguageCode,
    favoriteFonts,
  };
}

export function IosDoodlerStudio() {
  const [slots, setSlots] = useState<TemplateSlot[]>(() => createInitialSlots(STUDIO_LANGUAGES));
  const [enabledLanguages, setEnabledLanguages] = useState<string[]>(() => [...ALL_LANGUAGE_CODES]);
  const [activeLanguageCode, setActiveLanguageCode] = useState<string>(DEFAULT_STUDIO_LANGUAGE);
  const [availableFontFamilies, setAvailableFontFamilies] = useState<string[]>(() => [...DEFAULT_FONT_FAMILIES]);
  const [favoriteFonts, setFavoriteFonts] = useState<string[]>([]);
  const [fontFilterQuery, setFontFilterQuery] = useState('');
  const [editingSlotId, setEditingSlotId] = useState<string | null>(null);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [languageFilterQuery, setLanguageFilterQuery] = useState('');
  const [persistenceReady, setPersistenceReady] = useState(false);
  const [isBatchExporting, setIsBatchExporting] = useState(false);
  const [pendingImageUpload, setPendingImageUpload] = useState<PendingImageUpload | null>(null);
  const [isApplyingPendingImageUpload, setIsApplyingPendingImageUpload] = useState(false);
  const [isImportJsonModalOpen, setIsImportJsonModalOpen] = useState(false);
  const [isFontPickerOpen, setIsFontPickerOpen] = useState(false);
  const [importJsonFileName, setImportJsonFileName] = useState<string | null>(null);
  const [importJsonError, setImportJsonError] = useState<string | null>(null);
  const [parsedImportJson, setParsedImportJson] = useState<ParsedTranslationsImport | null>(null);
  const [labelNumericDrafts, setLabelNumericDrafts] = useState<Record<string, LabelNumericDraft>>({});
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});
  const editorFileInputRef = useRef<HTMLInputElement | null>(null);
  const importJsonInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<LabelDragState | null>(null);
  const dragFrameRequestRef = useRef<number | null>(null);
  const pendingDragUpdateRef = useRef<PendingLabelDragUpdate | null>(null);
  const hasShownPersistenceWarningRef = useRef(false);

  const isLoadingPersistedState = !persistenceReady;

  const enabledLanguageSet = useMemo(() => new Set(enabledLanguages), [enabledLanguages]);
  const filteredStudioLanguages = useMemo(() => {
    const query = languageFilterQuery.trim().toLowerCase();
    if (!query) return STUDIO_LANGUAGES;
    return STUDIO_LANGUAGES.filter((language) =>
      language.name.toLowerCase().includes(query) || language.code.toLowerCase().includes(query)
    );
  }, [languageFilterQuery]);
  const allLanguagesEnabled = enabledLanguages.length === ALL_LANGUAGE_CODES.length;
  const orderedEnabledLanguages = useMemo(() => orderLanguageCodes(enabledLanguages), [enabledLanguages]);
  const emptyShotOrders = useMemo(
    () => slots.filter((slot) => !slot.baseAsset).map((slot) => slot.order),
    [slots],
  );
  const editingSlot = useMemo(
    () => (editingSlotId ? slots.find((slot) => slot.id === editingSlotId) ?? null : null),
    [editingSlotId, slots],
  );
  const selectedLabel = useMemo(
    () => editingSlot?.labels.find((label) => label.id === selectedLabelId) ?? editingSlot?.labels[0] ?? null,
    [editingSlot, selectedLabelId],
  );
  const editingAsset = useMemo(
    () => (editingSlot ? resolveAssetForLanguage(editingSlot, activeLanguageCode) : null),
    [activeLanguageCode, editingSlot],
  );
  const availableLabelKeys = useMemo(
    () => (editingSlot ? listSlotLabelKeys(editingSlot, activeLanguageCode) : []),
    [activeLanguageCode, editingSlot],
  );
  const editorLabelOptions = useMemo(() => {
    if (!editingSlot) return [];
    const keyCounts = new Map<string, number>();
    return editingSlot.labels.map((label) => {
      const nextCount = (keyCounts.get(label.key) ?? 0) + 1;
      keyCounts.set(label.key, nextCount);
      return {
        id: label.id,
        title: `${label.key} #${nextCount}`,
      };
    });
  }, [editingSlot]);
  const selectedLabelNumericDrafts = useMemo(() => {
    if (!selectedLabel || !editingAsset) return null;
    return {
      x: String(Math.round(selectedLabel.x * editingAsset.width)),
      y: String(Math.round(selectedLabel.y * editingAsset.height)),
      width: String(Math.round(selectedLabel.width * editingAsset.width)),
      height: String(Math.round(selectedLabel.height * editingAsset.height)),
      fontSize: String(Math.round(selectedLabel.fontSize * editingAsset.width)),
      fontWeight: String(selectedLabel.fontWeight),
      maxLines: String(selectedLabel.maxLines),
    };
  }, [editingAsset, selectedLabel]);
  const selectedLabelNumericDraft = selectedLabel ? (labelNumericDrafts[selectedLabel.id] ?? selectedLabelNumericDrafts) : null;
  useEffect(() => {
    if (!selectedLabel || !selectedLabelNumericDrafts) return;
    setLabelNumericDrafts((previous) => ({
      ...previous,
      [selectedLabel.id]: selectedLabelNumericDrafts,
    }));
  }, [selectedLabel, selectedLabelNumericDrafts]);
  const orderedFontFamilies = useMemo(() => {
    const favoriteSet = new Set(favoriteFonts);
    const combined = Array.from(
      new Set(
        [...availableFontFamilies, ...favoriteFonts, selectedLabel?.fontFamily ?? 'Arial']
          .map((font) => font.trim())
          .filter((font) => font.length > 0),
      ),
    );
    const query = fontFilterQuery.trim().toLowerCase();
    const filtered = query
      ? combined.filter((font) => font.toLowerCase().includes(query))
      : combined;
    return filtered.sort((a, b) => {
      const aFav = favoriteSet.has(a);
      const bFav = favoriteSet.has(b);
      if (aFav !== bFav) return aFav ? -1 : 1;
      return a.localeCompare(b);
    });
  }, [availableFontFamilies, favoriteFonts, fontFilterQuery, selectedLabel?.fontFamily]);

  useEffect(() => {
    let cancelled = false;
    if (typeof window === 'undefined') return;
    const queryLocalFonts = (window as Window & {
      queryLocalFonts?: () => Promise<Array<{ family?: string }>>;
    }).queryLocalFonts;
    if (typeof queryLocalFonts !== 'function') return;

    const loadFonts = async () => {
      try {
        const localFonts = await queryLocalFonts();
        if (cancelled) return;
        const merged = Array.from(
          new Set(
            [...DEFAULT_FONT_FAMILIES, ...localFonts.map((item) => item.family ?? '').map((family) => family.trim())]
              .filter((family) => family.length > 0),
          ),
        ).sort((a, b) => a.localeCompare(b));
        setAvailableFontFamilies(merged);
      } catch {
        // Ignore permission/API errors and keep default families.
      }
    };

    void loadFonts();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let isCancelled = false;
    if (typeof window === 'undefined') return;

    const bootstrap = async () => {
      try {
        const persisted = sanitizePersistedState(await loadIosDoodlerState());
        if (persisted) {
          if (!isCancelled) {
            setSlots(persisted.slots);
            setEnabledLanguages(persisted.enabledLanguages);
            setActiveLanguageCode(persisted.activeLanguageCode);
            setFavoriteFonts(persisted.favoriteFonts);
          }
          return;
        }

        const legacyRaw = window.localStorage.getItem(LEGACY_STORAGE_KEY);
        if (!legacyRaw) return;

        const legacyParsed = JSON.parse(legacyRaw);
        const legacyState = sanitizePersistedState(legacyParsed);
        if (!legacyState) return;

        if (!isCancelled) {
          setSlots(legacyState.slots);
          setEnabledLanguages(legacyState.enabledLanguages);
          setActiveLanguageCode(legacyState.activeLanguageCode);
          setFavoriteFonts(legacyState.favoriteFonts);
        }
        await saveIosDoodlerState(legacyState);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown database error';
        console.warn('Failed to load iOS Doodler browser DB state:', message);
      } finally {
        if (!isCancelled) setPersistenceReady(true);
      }
    };

    void bootstrap();
    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!persistenceReady || typeof window === 'undefined') return;
    const payload: IosDoodlerPersistedState = {
      slots,
      enabledLanguages,
      activeLanguageCode,
      favoriteFonts,
    };

    const persist = async () => {
      try {
        await saveIosDoodlerState(payload);
        window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'unknown database error';
        console.warn('Failed to persist iOS Doodler state to browser DB:', message);
        if (!hasShownPersistenceWarningRef.current) {
          toast.error('Failed to save browser database state.');
          hasShownPersistenceWarningRef.current = true;
        }
      }
    };

    void persist();
  }, [activeLanguageCode, enabledLanguages, favoriteFonts, slots, persistenceReady]);

  useEffect(() => {
    if (!editingSlot) return;
    if (!selectedLabelId || !editingSlot.labels.some((label) => label.id === selectedLabelId)) {
      setSelectedLabelId(editingSlot.labels[0]?.id ?? null);
    }
  }, [editingSlot, selectedLabelId]);

  const mutateSlot = useCallback((slotId: string, recipe: (slot: TemplateSlot) => TemplateSlot) => {
    setSlots((previous) => previous.map((slot) => (slot.id === slotId ? recipe(slot) : slot)));
  }, []);

  const handleToggleLanguage = useCallback((languageCode: string, checked: boolean) => {
    setEnabledLanguages((previous) => {
      if (checked) {
        if (previous.includes(languageCode)) return previous;
        return orderLanguageCodes([...previous, languageCode]);
      }
      const next = previous.filter((code) => code !== languageCode);
      if (activeLanguageCode === languageCode) {
        setActiveLanguageCode(next[0] ?? DEFAULT_STUDIO_LANGUAGE);
      }
      return next;
    });
  }, [activeLanguageCode]);

  const handleToggleAllLanguages = useCallback((checked: boolean) => {
    if (checked) {
      setEnabledLanguages([...ALL_LANGUAGE_CODES]);
      if (!ALL_LANGUAGE_CODES.includes(activeLanguageCode)) {
        setActiveLanguageCode(DEFAULT_STUDIO_LANGUAGE);
      }
      return;
    }
    setEnabledLanguages([]);
    setActiveLanguageCode(DEFAULT_STUDIO_LANGUAGE);
  }, [activeLanguageCode]);

  const handleSwitchLanguage = useCallback((languageCode: string) => {
    setActiveLanguageCode(languageCode);
    setEnabledLanguages((previous) => (previous.includes(languageCode) ? previous : orderLanguageCodes([...previous, languageCode])));
  }, []);

  const handleSlotUpload = useCallback(async (slotId: string, file: File | null) => {
    if (!file) return;

    try {
      const sourceAsset = await ensureTemplateAssetFromFile(file);
      const slot = slots.find((item) => item.id === slotId);
      if (!slot) {
        toast.error('The selected shot no longer exists.');
        return;
      }

      const targetAsset = slot.baseAsset ?? resolveAssetForLanguage(slot, activeLanguageCode);
      const targetWidth = targetAsset?.width ?? DEFAULT_SLOT_WIDTH;
      const targetHeight = targetAsset?.height ?? DEFAULT_SLOT_HEIGHT;

      if (hasMatchingAspectRatio(sourceAsset.width, sourceAsset.height, targetWidth, targetHeight)) {
        const normalizedAsset = await fitAssetToTarget(sourceAsset, targetWidth, targetHeight, 'center');
        mutateSlot(slotId, (current) => applyUploadedAsset(current, activeLanguageCode, normalizedAsset));
        toast.success(`Updated shot ${slotId} for ${activeLanguageCode.toUpperCase()}`);
        return;
      }

      const anchorOptions = getCropAnchorsForAspectMismatch(
        sourceAsset.width,
        sourceAsset.height,
        targetWidth,
        targetHeight,
      );
      setPendingImageUpload({
        slotId,
        sourceAsset,
        targetWidth,
        targetHeight,
        anchorOptions,
        selectedAnchor: anchorOptions.includes('center') ? 'center' : (anchorOptions[0] ?? 'center'),
      });
    } catch {
      toast.error('Failed to read the selected image file.');
    }
  }, [activeLanguageCode, mutateSlot, slots]);

  const handleApplyPendingImageUpload = useCallback(async () => {
    if (!pendingImageUpload) return;

    try {
      setIsApplyingPendingImageUpload(true);
      const normalizedAsset = await fitAssetToTarget(
        pendingImageUpload.sourceAsset,
        pendingImageUpload.targetWidth,
        pendingImageUpload.targetHeight,
        pendingImageUpload.selectedAnchor,
      );
      mutateSlot(
        pendingImageUpload.slotId,
        (slot) => applyUploadedAsset(slot, activeLanguageCode, normalizedAsset),
      );
      setPendingImageUpload(null);
      toast.success(`Updated shot ${pendingImageUpload.slotId} for ${activeLanguageCode.toUpperCase()}`);
    } catch {
      toast.error('Failed to process uploaded image.');
    } finally {
      setIsApplyingPendingImageUpload(false);
    }
  }, [activeLanguageCode, mutateSlot, pendingImageUpload]);

  const handleOpenImportJsonModal = useCallback(() => {
    setImportJsonError(null);
    setParsedImportJson(null);
    setImportJsonFileName(null);
    setIsImportJsonModalOpen(true);
  }, []);

  const handleImportJsonFilePick = useCallback(() => {
    importJsonInputRef.current?.click();
  }, []);

  const handleImportJsonFileChange = useCallback(async (file: File | null) => {
    if (!file) return;

    try {
      const text = await file.text();
      const parsed = parseTranslationsImportJson(text);
      if (!parsed.ok) {
        setImportJsonFileName(file.name);
        setParsedImportJson(null);
        setImportJsonError(parsed.error);
        return;
      }

      setImportJsonFileName(file.name);
      setImportJsonError(null);
      setParsedImportJson(parsed.value);
    } catch {
      setImportJsonFileName(file.name);
      setParsedImportJson(null);
      setImportJsonError('Failed to read the JSON file. Please try another file.');
    }
  }, []);

  const handleApplyImportJson = useCallback(() => {
    if (!parsedImportJson) return;

    const applied = applyTranslationsImport(slots, parsedImportJson);
    setSlots(applied.slots);

    const importedLanguageCodes = orderLanguageCodes(
      Object.keys(parsedImportJson.translations).filter((code) => ALL_LANGUAGE_CODES.includes(code)),
    );
    if (importedLanguageCodes.length > 0) {
      setEnabledLanguages(importedLanguageCodes);
      setActiveLanguageCode((previous) => (
        importedLanguageCodes.includes(previous) ? previous : importedLanguageCodes[0] ?? DEFAULT_STUDIO_LANGUAGE
      ));
    } else {
      toast.message('Imported text keys, but no supported App Store language codes were detected for preview chips.');
    }

    toast.success(
      `Imported ${parsedImportJson.languageCount} languages with ${parsedImportJson.keysPerLanguage} keys each.`,
    );

    setIsImportJsonModalOpen(false);
  }, [parsedImportJson, slots]);

  const handleDownloadSlot = useCallback(async (slot: TemplateSlot) => {
    const blob = await renderSlotBlob(slot, activeLanguageCode);
    if (!blob) {
      toast.error('Upload an image first before downloading.');
      return;
    }

    triggerBlobDownload(blob, `${slot.order}-shot-${activeLanguageCode}.png`);
  }, [activeLanguageCode]);

  const handleDownloadAll = useCallback(async () => {
    if (enabledLanguages.length === 0) {
      toast.error('Enable at least one language before exporting.');
      return;
    }

    setIsBatchExporting(true);
    try {
      const batch: Array<{
        languageCode: string;
        files: Array<{ fileName: string; blob: Blob }>;
      }> = [];

      for (const languageCode of enabledLanguages) {
        const files: Array<{ fileName: string; blob: Blob }> = [];
        for (const slot of slots) {
          const blob = await renderSlotBlob(slot, languageCode);
          if (!blob) continue;
          files.push({
            fileName: `${slot.order}-shot.png`,
            blob,
          });
        }

        if (files.length > 0) {
          batch.push({ languageCode, files });
        }
      }

      if (batch.length === 0) {
        toast.error('Nothing to export. Upload at least one template image.');
        return;
      }

      const pickerWindow = window as Window & {
        showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandle>;
      };
      if (pickerWindow.showDirectoryPicker) {
        const rootHandle = await pickerWindow.showDirectoryPicker({ mode: 'readwrite' });
        let writtenCount = 0;
        for (const languageGroup of batch) {
          const languageDir = await rootHandle.getDirectoryHandle(languageGroup.languageCode, { create: true });
          for (const file of languageGroup.files) {
            const fileHandle = await languageDir.getFileHandle(file.fileName, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(file.blob);
            await writable.close();
            writtenCount += 1;
          }
        }
        toast.success(`Exported ${writtenCount} screenshots grouped by language.`);
        return;
      }

      let total = 0;
      let delayMs = 0;
      for (const languageGroup of batch) {
        for (const file of languageGroup.files) {
          const downloadName = `${languageGroup.languageCode}-${file.fileName}`;
          window.setTimeout(() => triggerBlobDownload(file.blob, downloadName), delayMs);
          delayMs += 120;
          total += 1;
        }
      }
      toast.success(`Exported ${total} screenshots. Directory grouping is available in Chromium browsers.`);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        toast.message('Export cancelled.');
      } else {
        const message = error instanceof Error ? error.message : 'unknown export error';
        console.warn('Failed to export all screenshots:', message);
        toast.error('Failed to export screenshots.');
      }
    } finally {
      setIsBatchExporting(false);
    }
  }, [enabledLanguages, slots]);

  const handleAddSlot = useCallback(() => {
    if (emptyShotOrders.length > 0) {
      const label = emptyShotOrders.length > 1 ? "shots" : "shot";
      toast.error(`Upload images for empty ${label}: ${emptyShotOrders.join(", ")}`);
      return;
    }

    setSlots((previous) => {
      const nextSlot = createEmptySlot(previous.length + 1);
      if (previous.length > 0) {
        const referenceText = previous[0]?.textByLanguage ?? {};
        const cloned: Record<string, Record<string, string>> = {};
        for (const [languageCode, values] of Object.entries(referenceText)) {
          cloned[languageCode] = { ...values };
        }
        nextSlot.textByLanguage = cloned;
      }
      return [...previous, nextSlot];
    });
  }, [emptyShotOrders]);

  const handleRemoveSlot = useCallback((slotId: string) => {
    if (slots.length <= 1) {
      toast.error('At least one shot is required.');
      return;
    }

    setSlots((previous) => removeSlotAndNormalizeOrder(previous, slotId));
    if (editingSlotId === slotId) {
      setEditingSlotId(null);
      setSelectedLabelId(null);
    }
    toast.success('Shot removed.');
  }, [editingSlotId, slots.length]);

  const handleResetSlots = useCallback(async () => {
    const confirmed = window.confirm('Reset all shots to defaults and remove stored browser DB images?');
    if (!confirmed) return;

    try {
      await clearIosDoodlerState();
      window.localStorage.removeItem(LEGACY_STORAGE_KEY);
      setSlots(createInitialSlots(STUDIO_LANGUAGES));
      setEnabledLanguages([...ALL_LANGUAGE_CODES]);
      setActiveLanguageCode(DEFAULT_STUDIO_LANGUAGE);
      setFavoriteFonts([]);
      setFontFilterQuery('');
      setEditingSlotId(null);
      setSelectedLabelId(null);
      setLanguageFilterQuery('');
      toast.success('Shots reset to default.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown database error';
      console.warn('Failed to reset iOS Doodler browser DB state:', message);
      toast.error('Failed to reset shots.');
    }
  }, []);

  const handleOpenEditor = useCallback((slotId: string) => {
    setEditingSlotId(slotId);
  }, []);

  const handleEditorLabelPointerDown = useCallback((
    labelId: string,
    mode: 'move' | 'resize' | 'rotate',
    event: React.PointerEvent<HTMLElement>,
    frame: {
      width: number;
      height: number;
      left: number;
      top: number;
      rotateCenterX?: number;
      rotateCenterY?: number;
      resizeEdge?: ResizeEdge;
    },
  ) => {
    if (!editingSlot || frame.width <= 0 || frame.height <= 0) return;
    const baseLabel = editingSlot.labels.find((label) => label.id === labelId);
    if (!baseLabel) return;

    event.preventDefault();
    event.stopPropagation();
    const captureTarget = event.currentTarget as HTMLElement | null;
    if (captureTarget && typeof captureTarget.setPointerCapture === 'function') {
      captureTarget.setPointerCapture(event.pointerId);
    }
    setSelectedLabelId(labelId);
    const estimatedLabelHeight = Math.max(baseLabel.maxLines, 1) * baseLabel.fontSize;
    const rotateCenterX = frame.rotateCenterX ?? (frame.left + (baseLabel.x + baseLabel.width / 2) * frame.width);
    const rotateCenterY = frame.rotateCenterY ?? (frame.top + (baseLabel.y + estimatedLabelHeight / 2) * frame.height);
    const startPointerAngle = Math.atan2(event.clientY - rotateCenterY, event.clientX - rotateCenterX) * (180 / Math.PI);
    dragFrameRequestRef.current = null;
    pendingDragUpdateRef.current = null;

    dragRef.current = {
      slotId: editingSlot.id,
      labelId,
      mode,
      resizeEdge: frame.resizeEdge,
      pointerId: event.pointerId,
      pointerCaptureTarget: captureTarget,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLabelX: baseLabel.x,
      startLabelY: baseLabel.y,
      startLabelWidth: baseLabel.width,
      startLabelHeight: baseLabel.height,
      startLabelRotation: baseLabel.rotation,
      startPointerAngle,
      rotateCenterX,
      rotateCenterY,
      frameWidth: frame.width,
      frameHeight: frame.height,
    };
  }, [editingSlot]);

  useEffect(() => {
    const applyPendingDragUpdate = () => {
      const update = pendingDragUpdateRef.current;
      pendingDragUpdateRef.current = null;
      if (!update) return;

      if (update.mode === 'move' && update.x !== undefined && update.y !== undefined) {
        mutateSlot(update.slotId, (slot) => setLabelPosition(slot, update.labelId, update.x as number, update.y as number));
        return;
      }

      if (
        update.mode === 'resize'
        && update.x !== undefined
        && update.y !== undefined
        && update.width !== undefined
        && update.height !== undefined
      ) {
        mutateSlot(update.slotId, (slot) => updateLabel(slot, update.labelId, {
          x: update.x as number,
          y: update.y as number,
          width: update.width,
          height: update.height,
        }));
        return;
      }

      if (update.mode === 'rotate' && update.rotation !== undefined) {
        mutateSlot(update.slotId, (slot) => updateLabel(slot, update.labelId, {
          rotation: update.rotation,
        }));
      }
    };

    const flushPendingDragUpdate = () => {
      if (dragFrameRequestRef.current !== null) {
        cancelAnimationFrame(dragFrameRequestRef.current);
        dragFrameRequestRef.current = null;
      }
      applyPendingDragUpdate();
    };

    const onPointerMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      let x: number | undefined;
      let y: number | undefined;
      let width: number | undefined;
      let height: number | undefined;
      let rotation: number | undefined;

      if (drag.mode === 'move') {
        const deltaX = (event.clientX - drag.startClientX) / drag.frameWidth;
        const deltaY = (event.clientY - drag.startClientY) / drag.frameHeight;
        x = drag.startLabelX + deltaX;
        y = drag.startLabelY + deltaY;
      } else if (drag.mode === 'resize') {
        const pointerDeltaX = event.clientX - drag.startClientX;
        const pointerDeltaY = event.clientY - drag.startClientY;
        const radians = (drag.startLabelRotation * Math.PI) / 180;
        const localDeltaX = (pointerDeltaX * Math.cos(radians) + pointerDeltaY * Math.sin(radians)) / drag.frameWidth;
        const localDeltaY = (-pointerDeltaX * Math.sin(radians) + pointerDeltaY * Math.cos(radians)) / drag.frameHeight;
        const edge = drag.resizeEdge ?? 'right';

        const startRight = drag.startLabelX + drag.startLabelWidth;
        const startBottom = drag.startLabelY + drag.startLabelHeight;
        let nextX = drag.startLabelX;
        let nextY = drag.startLabelY;
        let nextWidth = drag.startLabelWidth;
        let nextHeight = drag.startLabelHeight;

        if (edge === 'right' || edge === 'top-right' || edge === 'bottom-right') {
          nextWidth = drag.startLabelWidth + localDeltaX;
        }
        if (edge === 'left' || edge === 'top-left' || edge === 'bottom-left') {
          nextX = drag.startLabelX + localDeltaX;
          nextWidth = startRight - nextX;
        }
        if (edge === 'bottom' || edge === 'bottom-left' || edge === 'bottom-right') {
          nextHeight = drag.startLabelHeight + localDeltaY;
        }
        if (edge === 'top' || edge === 'top-left' || edge === 'top-right') {
          nextY = drag.startLabelY + localDeltaY;
          nextHeight = startBottom - nextY;
        }

        nextWidth = Math.max(nextWidth, 0.01);
        nextHeight = Math.max(nextHeight, 0.005);
        x = nextX;
        y = nextY;
        width = nextWidth;
        height = nextHeight;
      } else if (drag.mode === 'rotate') {
        const rotateCenterX = drag.rotateCenterX ?? 0;
        const rotateCenterY = drag.rotateCenterY ?? 0;
        const currentAngle = Math.atan2(event.clientY - rotateCenterY, event.clientX - rotateCenterX) * (180 / Math.PI);
        const angleDelta = currentAngle - (drag.startPointerAngle ?? 0);
        const rawRotation = drag.startLabelRotation + angleDelta;
        rotation = event.shiftKey ? Math.round(rawRotation / 15) * 15 : rawRotation;
      }

      pendingDragUpdateRef.current = {
        slotId: drag.slotId,
        labelId: drag.labelId,
        mode: drag.mode,
        x,
        y,
        width,
        height,
        rotation,
      };

      if (dragFrameRequestRef.current === null) {
        dragFrameRequestRef.current = requestAnimationFrame(() => {
          dragFrameRequestRef.current = null;
          applyPendingDragUpdate();
        });
      }
    };

    const onPointerUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (drag?.pointerCaptureTarget && drag.pointerCaptureTarget.hasPointerCapture?.(event.pointerId)) {
        drag.pointerCaptureTarget.releasePointerCapture(event.pointerId);
      }
      flushPendingDragUpdate();
      dragRef.current = null;
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
      flushPendingDragUpdate();
    };
  }, [mutateSlot]);

  const setLabelNumericDraft = useCallback((field: LabelNumericField, value: string) => {
    if (!selectedLabel) return;
    setLabelNumericDrafts((previous) => ({
      ...previous,
      [selectedLabel.id]: {
        ...(previous[selectedLabel.id] ?? {
          x: '',
          y: '',
          width: '',
          height: '',
          fontSize: '',
          fontWeight: '',
          maxLines: '',
        }),
        [field]: value,
      },
    }));
  }, [selectedLabel]);

  const handleEditorNumericInputCommit = useCallback((field: LabelNumericField, value: string) => {
    if (!editingSlot || !selectedLabel || !editingAsset) return;
    const parsed = Number(value);
    const hasValidNumeric = Number.isFinite(parsed);
    if (!hasValidNumeric) {
      setLabelNumericDraft(field, selectedLabelNumericDrafts?.[field] ?? '');
      return;
    }

    let normalized = parsed;
    let displayValue = parsed;
    const changes: Partial<Record<LabelNumericField, number>> = {};
    if (field === 'x') {
      normalized = Math.max(0, parsed);
      changes.x = normalized / editingAsset.width;
      displayValue = normalized;
    } else if (field === 'y') {
      normalized = Math.max(0, parsed);
      changes.y = normalized / editingAsset.height;
      displayValue = normalized;
    } else if (field === 'width') {
      normalized = Math.max(0, parsed);
      changes.width = normalized / editingAsset.width;
      displayValue = normalized;
    } else if (field === 'height') {
      normalized = Math.max(0, parsed);
      changes.height = normalized / editingAsset.height;
      displayValue = normalized;
    } else if (field === 'fontSize') {
      normalized = Math.max(MIN_FONT_SIZE_PX, parsed);
      changes.fontSize = normalized / editingAsset.width;
      displayValue = normalized;
    } else if (field === 'fontWeight') {
      normalized = Math.max(0, parsed);
      changes.fontWeight = normalized;
      displayValue = normalized;
    } else if (field === 'maxLines') {
      normalized = Math.max(1, parsed);
      normalized = Math.round(normalized);
      changes.maxLines = normalized;
      displayValue = normalized;
    }

    mutateSlot(editingSlot.id, (slot) => updateLabel(slot, selectedLabel.id, changes));
    setLabelNumericDraft(field, String(Math.round(displayValue)));
  }, [editingAsset, editingSlot, mutateSlot, selectedLabel, selectedLabelNumericDrafts, setLabelNumericDraft]);

  const handleEditorPixelChange = useCallback((field: LabelNumericField, value: string) => {
    setLabelNumericDraft(field, value);
  }, [setLabelNumericDraft]);

  const commitSelectedLabelNumericInput = useCallback((field: LabelNumericField) => {
    const draft = selectedLabelNumericDraft ?? null;
    const fallback = (() => {
      if (!selectedLabel) return '';
      if (field === 'x') return String(Math.round(selectedLabel.x * (editingAsset?.width ?? 0)));
      if (field === 'y') return String(Math.round(selectedLabel.y * (editingAsset?.height ?? 0)));
      if (field === 'width') return String(Math.round(selectedLabel.width * (editingAsset?.width ?? 0)));
      if (field === 'height') return String(Math.round(selectedLabel.height * (editingAsset?.height ?? 0)));
      if (field === 'fontSize') return String(Math.round(selectedLabel.fontSize * (editingAsset?.width ?? 0)));
      if (field === 'fontWeight') return String(selectedLabel.fontWeight);
      return String(selectedLabel.maxLines);
    })();
    const nextValue = draft?.[field] ?? (selectedLabelNumericDrafts?.[field] ?? fallback);
    handleEditorNumericInputCommit(field, nextValue);
  }, [editingAsset?.width, editingAsset?.height, handleEditorNumericInputCommit, selectedLabel, selectedLabelNumericDraft, selectedLabelNumericDrafts]);

  const commitSelectedLabelNumericInputs = useCallback(() => {
    commitSelectedLabelNumericInput('x');
    commitSelectedLabelNumericInput('y');
    commitSelectedLabelNumericInput('width');
    commitSelectedLabelNumericInput('height');
    commitSelectedLabelNumericInput('fontSize');
    commitSelectedLabelNumericInput('fontWeight');
    commitSelectedLabelNumericInput('maxLines');
  }, [commitSelectedLabelNumericInput]);

  const handleEditorRotationChange = useCallback((value: string) => {
    if (!editingSlot || !selectedLabel) return;
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return;
    const clamped = Math.max(-180, Math.min(180, parsed));
    mutateSlot(editingSlot.id, (slot) => updateLabel(slot, selectedLabel.id, { rotation: clamped }));
  }, [editingSlot, mutateSlot, selectedLabel]);

  const rotationValue = selectedLabel ? Math.max(-180, Math.min(180, Math.round(selectedLabel.rotation))) : 0;

  const handleEditorAlignChange = useCallback((value: LabelAlign) => {
    if (!editingSlot || !selectedLabel) return;
    mutateSlot(editingSlot.id, (slot) => updateLabel(slot, selectedLabel.id, { align: value }));
  }, [editingSlot, mutateSlot, selectedLabel]);

  const handleEditorVerticalAlignChange = useCallback((value: LabelVerticalAlign) => {
    if (!editingSlot || !selectedLabel) return;
    mutateSlot(editingSlot.id, (slot) => updateLabel(slot, selectedLabel.id, { verticalAlign: value }));
  }, [editingSlot, mutateSlot, selectedLabel]);

  const handleEditorFontFamilyChange = useCallback((value: string) => {
    if (!editingSlot || !selectedLabel) return;
    const fontFamily = value.trim();
    if (!fontFamily) return;
    mutateSlot(editingSlot.id, (slot) => updateLabel(slot, selectedLabel.id, { fontFamily }));
    setIsFontPickerOpen(false);
    setFontFilterQuery('');
  }, [editingSlot, mutateSlot, selectedLabel]);

  const handleToggleFavoriteFont = useCallback((fontFamily: string) => {
    const normalized = fontFamily.trim();
    if (!normalized) return;
    setFavoriteFonts((previous) => (
      previous.includes(normalized)
        ? previous.filter((font) => font !== normalized)
        : [...previous, normalized]
    ));
  }, []);

  const handleEditorColorChange = useCallback((value: string) => {
    if (!editingSlot || !selectedLabel) return;
    mutateSlot(editingSlot.id, (slot) => updateLabel(slot, selectedLabel.id, { color: value }));
  }, [editingSlot, mutateSlot, selectedLabel]);

  const handleEditorTextChange = useCallback((value: string) => {
    if (!editingSlot || !selectedLabel) return;
    mutateSlot(editingSlot.id, (slot) => updateLabelText(slot, activeLanguageCode, selectedLabel.key, value));
  }, [activeLanguageCode, editingSlot, mutateSlot, selectedLabel]);

  const handleEditorAddLabelFromKey = useCallback((labelKey: string, position?: { x: number; y: number }) => {
    if (!editingSlot) return;
    mutateSlot(editingSlot.id, (slot) => {
      const next = addLabelFromKey(slot, labelKey, {
        x: position?.x,
        y: position?.y,
        centered: Boolean(position),
      });
      setSelectedLabelId(next.labels[next.labels.length - 1]?.id ?? null);
      return next;
    });
  }, [editingSlot, mutateSlot]);

  const handleEditorRemoveLabel = useCallback((labelId?: string) => {
    if (!editingSlot) return;
    const targetLabel = labelId
      ? editingSlot.labels.find((label) => label.id === labelId) ?? null
      : selectedLabel;
    if (!targetLabel) return;

    const confirmed = window.confirm(`Remove label "${targetLabel.key}" from this shot?`);
    if (!confirmed) return;

    mutateSlot(editingSlot.id, (slot) => {
      const next = removeLabel(slot, targetLabel.id);
      setSelectedLabelId((previous) => {
        if (previous && next.labels.some((label) => label.id === previous)) {
          return previous;
        }
        return next.labels[next.labels.length - 1]?.id ?? null;
      });
      return next;
    });
  }, [editingSlot, mutateSlot, selectedLabel]);

  const handleEditorImagePick = useCallback(() => {
    editorFileInputRef.current?.click();
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(14,116,144,0.06)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.06)_1px,transparent_1px)] bg-[size:28px_28px]" />
      <div className="pointer-events-none absolute -top-28 left-1/5 h-96 w-96 rounded-full bg-cyan-200/45 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[30rem] w-[30rem] rounded-full bg-rose-200/35 blur-3xl" />

      <div className="relative z-10 md:hidden">
        <Card className="border-amber-300/90 bg-white/90">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-xl text-amber-700">
              <Monitor className="h-5 w-5" />
              Bigger Screen Required
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-slate-600">
            <p>iOS Doodler supports iPad and desktop only.</p>
            <p>Use a larger display to edit labels and generate localized screenshots.</p>
            <p className="text-sm">Minimum recommended width: 768px.</p>
          </CardContent>
        </Card>
      </div>

      <div className="relative z-10 hidden space-y-5 md:block">
        <header className="rounded-2xl border border-sky-200/80 bg-white/85 p-5 shadow-sm">
          <h1 className="flex items-center gap-3 text-4xl font-semibold tracking-tight text-slate-900">
            <Smartphone className="h-8 w-8 text-sky-700" />
            iOS Doodler
          </h1>
        </header>

        <section className="space-y-3 rounded-2xl border border-slate-200/80 bg-white/88 p-4 shadow-sm">
          <div className="flex items-center justify-end gap-2">
            <Button variant="outline" onClick={handleResetSlots} className="gap-2">
              <RotateCcw className="h-4 w-4" />
              Reset All
            </Button>
            <Button
              variant="outline"
              onClick={handleDownloadAll}
              className="gap-2"
              disabled={isBatchExporting || isLoadingPersistedState}
            >
              <Download className="h-4 w-4" />
              {isBatchExporting ? 'Downloading...' : 'Download All'}
            </Button>
            <Button onClick={handleAddSlot} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Shot
            </Button>
          </div>

          <div className="grid grid-cols-[260px_minmax(0,1fr)] items-start gap-4">
            <aside className="space-y-2 rounded-xl border border-slate-200 bg-white/80 p-3">
              <Button
                variant="outline"
                className="w-full gap-2 border-sky-200 bg-sky-50/60 text-slate-800"
                onClick={handleOpenImportJsonModal}
                disabled={isLoadingPersistedState}
              >
                <FileJson className="h-4 w-4" />
                Import JSON
              </Button>

              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="w-full gap-2 border-sky-200 bg-sky-50/60 text-slate-800"
                    disabled={isLoadingPersistedState}
                  >
                    <Languages className="h-4 w-4" />
                    Manage Languages
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="start" className="w-[308px] space-y-1.5 p-1.5">
                  <div className="flex items-center gap-2 px-0.5 text-sm font-medium text-slate-700">
                    <Languages className="h-4 w-4" />
                    Select enabled languages
                  </div>
                  <div className="flex items-center justify-between rounded-md border border-slate-200 px-2 py-1.5">
                    <span className="text-sm text-slate-700">Check/Uncheck all</span>
                    <Switch
                      checked={allLanguagesEnabled}
                      onCheckedChange={handleToggleAllLanguages}
                      aria-label="Check or uncheck all languages"
                    />
                  </div>
                  <div className="px-0.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                      <Input
                        value={languageFilterQuery}
                        onChange={(event) => setLanguageFilterQuery(event.target.value)}
                        placeholder="Filter by title or code"
                        className="h-8 pl-8"
                      />
                    </div>
                  </div>
                  <div className="max-h-[360px] space-y-1 overflow-y-auto">
                    {filteredStudioLanguages.map((language) => {
                      const checked = enabledLanguageSet.has(language.code);
                      return (
                        <div key={language.code} className="flex items-center gap-2 rounded-lg border border-slate-200 px-1.5 py-1.5">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => handleToggleLanguage(language.code, Boolean(value))}
                            aria-label={`Use ${language.name}`}
                          />
                          <span className="text-lg">{language.flag}</span>
                          <span className="truncate text-sm text-slate-800">{language.name}</span>
                          <span className="ml-auto shrink-0 text-xs text-slate-500">{language.code}</span>
                        </div>
                      );
                    })}
                    {filteredStudioLanguages.length === 0 ? (
                      <div className="rounded-lg border border-dashed border-slate-200 px-2 py-3 text-sm text-slate-500">
                        No languages matched this filter.
                      </div>
                    ) : null}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="max-h-[540px] space-y-2 overflow-y-auto pr-1">
                {isLoadingPersistedState ? (
                  Array.from({ length: 12 }).map((_, index) => (
                    <div
                      key={`language-chip-placeholder-${index}`}
                      className="h-9 w-full animate-pulse rounded-md border border-slate-200 bg-slate-100/80"
                    />
                  ))
                ) : (
                  orderedEnabledLanguages.map((code) => {
                    const language = STUDIO_LANGUAGES.find((item) => item.code === code);
                    if (!language) return null;
                    return (
                      <Button
                        key={language.code}
                        size="sm"
                        variant={activeLanguageCode === language.code ? 'default' : 'outline'}
                        className="h-9 w-full justify-start whitespace-nowrap"
                        onClick={() => handleSwitchLanguage(language.code)}
                      >
                        {language.flag} {language.name}
                      </Button>
                    );
                  })
                )}
              </div>
            </aside>

            <div className="overflow-x-auto pb-2">
              <div className="flex min-w-max gap-4">
                {slots.map((slot) => {
                  const asset = resolveAssetForLanguage(slot, activeLanguageCode);
                  return (
                    <div key={slot.id} className="relative w-[290px] flex-none space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Shot {slot.order}</p>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <EllipsisVertical className="h-4 w-4" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="end" className="w-56 space-y-2 p-2">
                          <Button
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={() => fileInputs.current[slot.id]?.click()}
                          >
                            <Upload className="h-4 w-4" />
                            Replace image
                          </Button>
                          <Button
                            variant="outline"
                            className="w-full justify-start gap-2"
                            onClick={() => handleDownloadSlot(slot)}
                          >
                            <Download className="h-4 w-4" />
                            Download
                          </Button>
                          <Button
                            variant="destructive"
                            className="w-full justify-start gap-2"
                            onClick={() => handleRemoveSlot(slot.id)}
                            disabled={slots.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove shot
                          </Button>
                        </PopoverContent>
                      </Popover>
                      <input
                        ref={(element) => {
                          fileInputs.current[slot.id] = element;
                        }}
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/jpg"
                        className="hidden"
                        onChange={async (event) => {
                          const input = event.currentTarget;
                          const file = input.files?.[0] ?? null;
                          input.value = '';
                          await handleSlotUpload(slot.id, file);
                        }}
                      />
                    </div>

                    {asset ? (
                      <div
                        role="button"
                        tabIndex={0}
                        className="block w-full text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-400"
                        onClick={() => handleOpenEditor(slot.id)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleOpenEditor(slot.id);
                          }
                        }}
                      >
                        <div className="w-full">
                          <LabelOverlay
                            slot={slot}
                            languageCode={activeLanguageCode}
                            showGuides={false}
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="block w-full">
                        <div className="w-full">
                          <LabelOverlay
                            slot={slot}
                            languageCode={activeLanguageCode}
                            showGuides={false}
                            onEmptyUpload={() => fileInputs.current[slot.id]?.click()}
                          />
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>{formatSize(asset)}</span>
                      <span className="truncate pl-2">{asset?.fileName ?? 'no image uploaded'}</span>
                    </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </section>
      </div>

      <footer className="relative z-10 mt-5 border-t border-slate-200/70 pt-4 text-center">
        <a
          href={SOURCE_CODE_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="inline-flex items-center gap-2 text-sm font-medium text-slate-600 transition hover:text-sky-700"
        >
          <Github className="h-4 w-4" />
          Source code on GitHub
        </a>
      </footer>

      <Dialog
        open={isImportJsonModalOpen}
        onOpenChange={(open) => {
          setIsImportJsonModalOpen(open);
          if (!open) {
            setImportJsonError(null);
            setParsedImportJson(null);
            setImportJsonFileName(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <FileJson className="h-5 w-5 text-sky-700" />
              Import Text JSON
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm text-slate-700">
            <p className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
              Upload a JSON file in direct language-map format (language codes at root, label keys inside each language).
            </p>

            <input
              ref={importJsonInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (event) => {
                const input = event.currentTarget;
                const file = input.files?.[0] ?? null;
                input.value = '';
                await handleImportJsonFileChange(file);
              }}
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" className="gap-2" onClick={handleImportJsonFilePick}>
                <Upload className="h-4 w-4" />
                Upload JSON
              </Button>
              <span className="text-xs text-slate-500">{importJsonFileName ?? 'No file selected'}</span>
            </div>

            <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
              <a
                href="/docs/json-import"
                className="text-sm font-medium text-sky-700 underline underline-offset-4 hover:text-sky-800"
                target="_blank"
                rel="noreferrer noopener"
              >
                Open JSON format documentation
              </a>
            </div>

            {importJsonError ? (
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                Invalid JSON: {importJsonError}
              </div>
            ) : null}

            {parsedImportJson ? (
              <div className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Valid JSON. Languages: {parsedImportJson.languageCount}, keys per language: {parsedImportJson.keysPerLanguage}.
              </div>
            ) : null}

            <div className="flex items-center justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsImportJsonModalOpen(false)}>
                Cancel
              </Button>
              <Button type="button" onClick={handleApplyImportJson} disabled={!parsedImportJson}>
                Apply JSON
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(pendingImageUpload)}
        onOpenChange={(open) => {
          if (!open && !isApplyingPendingImageUpload) {
            setPendingImageUpload(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-lg">
              <Crop className="h-5 w-5 text-sky-700" />
              Choose Crop Position
            </DialogTitle>
          </DialogHeader>

          {pendingImageUpload ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-600">
                Uploaded image ratio does not match the target shot size.
                Pick where to crop before saving.
              </p>
              <div className="grid grid-cols-2 gap-2 text-xs text-slate-600">
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <span className="font-medium text-slate-800">Source</span>
                  <div>{pendingImageUpload.sourceAsset.width}x{pendingImageUpload.sourceAsset.height}</div>
                </div>
                <div className="rounded-md border border-slate-200 bg-slate-50 p-2">
                  <span className="font-medium text-slate-800">Target</span>
                  <div>{pendingImageUpload.targetWidth}x{pendingImageUpload.targetHeight}</div>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {pendingImageUpload.anchorOptions.map((anchor) => (
                  <Button
                    key={anchor}
                    type="button"
                    variant={pendingImageUpload.selectedAnchor === anchor ? 'default' : 'outline'}
                    onClick={() => {
                      setPendingImageUpload((previous) => (
                        previous
                          ? { ...previous, selectedAnchor: anchor }
                          : previous
                      ));
                    }}
                  >
                    {formatCropAnchorLabel(anchor)}
                  </Button>
                ))}
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setPendingImageUpload(null)}
                  disabled={isApplyingPendingImageUpload}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleApplyPendingImageUpload}
                  disabled={isApplyingPendingImageUpload}
                >
                  {isApplyingPendingImageUpload ? 'Applying...' : 'Apply Crop'}
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={Boolean(editingSlot)}
        onOpenChange={(open) => {
          if (!open) {
            commitSelectedLabelNumericInputs();
            setEditingSlotId(null);
            setSelectedLabelId(null);
          }
        }}
      >
        <DialogContent className="top-1/2 flex h-[min(96vh,980px)] w-[min(98vw,1360px)] max-w-none -translate-y-1/2 flex-col overflow-hidden p-0 sm:max-w-none">
          <DialogHeader className="border-b border-slate-200 px-6 py-4">
            <DialogTitle className="flex items-center gap-2 text-xl">
              <PencilRuler className="h-5 w-5 text-sky-700" />
              Screenshot Editor
            </DialogTitle>
          </DialogHeader>

          {editingSlot ? (
            <div className="grid min-h-0 flex-1 grid-cols-1 gap-0 xl:grid-cols-[256px_minmax(0,1fr)_336px]">
              <div className="h-full overflow-auto border-b border-slate-200 p-4 md:p-6 xl:border-b-0 xl:border-r">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <Type className="h-4 w-4" />
                  Text Keys
                </div>
                <p className="mb-3 text-xs text-slate-500">
                  Drag a key to the screenshot to add a label. You can add the same key multiple times.
                </p>
                {availableLabelKeys.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50/70 px-3 py-4 text-sm text-slate-500">
                    Import JSON first to load label keys.
                  </div>
                ) : (
                  <TooltipProvider delayDuration={120}>
                    <div className="space-y-2">
                    {availableLabelKeys.map((labelKey) => (
                      <Tooltip key={labelKey}>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            draggable
                            title={`${labelKey}\n${resolveLabelText(editingSlot, activeLanguageCode, labelKey)}`}
                            onDragStart={(event) => {
                              event.dataTransfer.setData(LABEL_KEY_DRAG_MIME, labelKey);
                              event.dataTransfer.effectAllowed = 'copy';
                            }}
                            onClick={() => handleEditorAddLabelFromKey(labelKey)}
                            className="flex w-full items-start gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-left transition hover:border-sky-300 hover:bg-sky-50/40"
                          >
                            <GripVertical className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-medium text-slate-800">{labelKey}</span>
                              <span className="block truncate text-xs text-slate-500">
                                {resolveLabelText(editingSlot, activeLanguageCode, labelKey)}
                              </span>
                            </span>
                          </button>
                        </TooltipTrigger>
                        <TooltipContent side="right" sideOffset={10} className="max-w-[340px] whitespace-pre-wrap break-words text-left">
                          <p className="font-semibold">{labelKey}</p>
                          <p>{resolveLabelText(editingSlot, activeLanguageCode, labelKey)}</p>
                        </TooltipContent>
                      </Tooltip>
                    ))}
                    </div>
                  </TooltipProvider>
                )}
              </div>

              <div className="flex min-h-0 flex-col border-b border-slate-200 p-4 md:p-6 xl:border-b-0 xl:border-r">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm text-slate-600">Editing shot {editingSlot.order} for {activeLanguageCode.toUpperCase()}</div>
                  <Button variant="outline" className="gap-2" onClick={handleEditorImagePick}>
                    <Upload className="h-4 w-4" />
                    Upload Image
                  </Button>
                  <input
                    ref={editorFileInputRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/jpg"
                    className="hidden"
                    onChange={async (event) => {
                      const input = event.currentTarget;
                      const file = input.files?.[0] ?? null;
                      input.value = '';
                      if (!editingSlot) {
                        return;
                      }
                      await handleSlotUpload(editingSlot.id, file);
                    }}
                  />
                </div>
                <div className="min-h-0 flex-1 overflow-hidden">
                  <div className="flex h-full w-full items-center justify-center overflow-auto border border-slate-200 bg-slate-50/40 p-2 sm:p-3">
                    <LabelOverlay
                      slot={editingSlot}
                      languageCode={activeLanguageCode}
                      showGuides
                      selectedLabelId={selectedLabel?.id ?? null}
                      fitMode="contain"
                      onLabelPointerDown={handleEditorLabelPointerDown}
                      onDeleteLabel={handleEditorRemoveLabel}
                      onDropLabelKey={handleEditorAddLabelFromKey}
                      onEmptyUpload={handleEditorImagePick}
                    />
                  </div>
                </div>
              </div>

              <div className="h-full overflow-auto p-4 md:p-6">
                <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                  <PencilRuler className="h-4 w-4" />
                  Label Controls
                </div>

                {!selectedLabel ? (
                  <p className="text-sm text-slate-500">Drop any text key onto the screenshot to start editing.</p>
                ) : (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Select label</Label>
                      <div className="flex items-center gap-2">
                        <Select value={selectedLabel.id} onValueChange={setSelectedLabelId}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {editorLabelOptions.map((option) => (
                              <SelectItem key={option.id} value={option.id}>{option.title}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0 text-rose-600 hover:text-rose-700"
                          onClick={() => handleEditorRemoveLabel()}
                          aria-label="Remove selected label"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Text ({activeLanguageCode.toUpperCase()})</Label>
                      <Input
                        value={resolveLabelText(editingSlot, activeLanguageCode, selectedLabel.key)}
                        onChange={(event) => handleEditorTextChange(event.target.value)}
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label>X (px)</Label>
                        <Input
                          value={
                            editingAsset && selectedLabelNumericDraft
                              ? selectedLabelNumericDraft.x
                              : String(Math.round(selectedLabel.x * (editingAsset?.width ?? 0)))
                          }
                          onChange={(event) => handleEditorPixelChange('x', event.target.value)}
                          onBlur={() => commitSelectedLabelNumericInput('x')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSelectedLabelNumericInput('x');
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <p className="text-xs text-slate-500">{(selectedLabel.x * 100).toFixed(1)}%</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Y (px)</Label>
                        <Input
                          value={
                            editingAsset && selectedLabelNumericDraft
                              ? selectedLabelNumericDraft.y
                              : String(Math.round(selectedLabel.y * (editingAsset?.height ?? 0)))
                          }
                          onChange={(event) => handleEditorPixelChange('y', event.target.value)}
                          onBlur={() => commitSelectedLabelNumericInput('y')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSelectedLabelNumericInput('y');
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <p className="text-xs text-slate-500">{(selectedLabel.y * 100).toFixed(1)}%</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Width (px)</Label>
                        <Input
                          value={
                            editingAsset && selectedLabelNumericDraft
                              ? selectedLabelNumericDraft.width
                              : String(Math.round(selectedLabel.width * (editingAsset?.width ?? 0)))
                          }
                          onChange={(event) => handleEditorPixelChange('width', event.target.value)}
                          onBlur={() => commitSelectedLabelNumericInput('width')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSelectedLabelNumericInput('width');
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <p className="text-xs text-slate-500">{(selectedLabel.width * 100).toFixed(1)}%</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Height (px)</Label>
                        <Input
                          value={
                            editingAsset && selectedLabelNumericDraft
                              ? selectedLabelNumericDraft.height
                              : String(Math.round(selectedLabel.height * (editingAsset?.height ?? 0)))
                          }
                          onChange={(event) => handleEditorPixelChange('height', event.target.value)}
                          onBlur={() => commitSelectedLabelNumericInput('height')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSelectedLabelNumericInput('height');
                              event.currentTarget.blur();
                            }
                          }}
                        />
                        <p className="text-xs text-slate-500">{(selectedLabel.height * 100).toFixed(1)}%</p>
                      </div>
                      <div className="space-y-2">
                        <Label>Font size (px)</Label>
                        <Input
                          value={
                            editingAsset && selectedLabelNumericDraft
                              ? selectedLabelNumericDraft.fontSize
                              : String(Math.round(selectedLabel.fontSize * (editingAsset?.width ?? 0)))
                          }
                          onChange={(event) => handleEditorPixelChange('fontSize', event.target.value)}
                          onBlur={() => commitSelectedLabelNumericInput('fontSize')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSelectedLabelNumericInput('fontSize');
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Weight</Label>
                        <Input
                          value={selectedLabelNumericDraft?.fontWeight ?? String(selectedLabel.fontWeight)}
                          onChange={(event) => handleEditorPixelChange('fontWeight', event.target.value)}
                          onBlur={() => commitSelectedLabelNumericInput('fontWeight')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSelectedLabelNumericInput('fontWeight');
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Max lines</Label>
                        <Input
                          value={selectedLabelNumericDraft?.maxLines ?? String(selectedLabel.maxLines)}
                          onChange={(event) => handleEditorPixelChange('maxLines', event.target.value)}
                          onBlur={() => commitSelectedLabelNumericInput('maxLines')}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              commitSelectedLabelNumericInput('maxLines');
                              event.currentTarget.blur();
                            }
                          }}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label>Rotation (deg)</Label>
                        <input
                          type="range"
                          min={-180}
                          max={180}
                          step={1}
                          value={rotationValue}
                          onInput={(event) => handleEditorRotationChange(event.currentTarget.value)}
                          onChange={(event) => handleEditorRotationChange(event.currentTarget.value)}
                          className="h-2 w-full cursor-grab appearance-none rounded-full bg-slate-200 accent-sky-600"
                        />
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">-180</span>
                          <Input
                            type="number"
                            min={-180}
                            max={180}
                            step={1}
                            value={String(rotationValue)}
                            onChange={(event) => handleEditorRotationChange(event.target.value)}
                            className="h-8 w-24 text-center font-mono"
                          />
                          <span className="text-xs text-slate-500">180</span>
                        </div>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Label>Font family</Label>
                        <span className="text-xs text-slate-500">{orderedFontFamilies.length}</span>
                      </div>
                      <Popover
                        open={isFontPickerOpen}
                        onOpenChange={(open) => {
                          setIsFontPickerOpen(open);
                          if (open) {
                            setFontFilterQuery('');
                          }
                        }}
                      >
                        <PopoverTrigger asChild>
                          <Button
                            type="button"
                            variant="outline"
                            className="w-full justify-between font-normal"
                          >
                            <span className="flex min-w-0 items-center gap-2 text-sm">
                              <span style={{ fontFamily: selectedLabel.fontFamily }} className="truncate">
                                {selectedLabel.fontFamily}
                              </span>
                              <span className="text-xs text-slate-500">Aa</span>
                            </span>
                            <ChevronDown className="h-4 w-4 text-slate-500" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent align="start" className="w-[320px] space-y-2 p-2">
                          <div className="relative">
                            <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <Input
                              value={fontFilterQuery}
                              onChange={(event) => setFontFilterQuery(event.target.value)}
                              placeholder="Search fonts"
                              className="h-8 pl-8"
                              autoFocus
                            />
                          </div>
                          <div className="max-h-52 space-y-1 overflow-y-auto rounded-md border border-slate-200 bg-white p-1.5">
                            {orderedFontFamilies.length === 0 ? (
                              <p className="px-2 py-2 text-sm text-slate-500">No fonts matched this filter.</p>
                            ) : (
                              orderedFontFamilies.map((fontFamily) => {
                                const isSelectedFont = selectedLabel.fontFamily === fontFamily;
                                const isFavorite = favoriteFonts.includes(fontFamily);
                                return (
                                  <div key={fontFamily} className="flex items-center gap-1">
                                    <Button
                                      type="button"
                                      variant={isSelectedFont ? 'default' : 'outline'}
                                      className="min-w-0 flex-1 justify-between text-left"
                                      onClick={() => handleEditorFontFamilyChange(fontFamily)}
                                      style={{ fontFamily }}
                                    >
                                      <span className="truncate">{fontFamily}</span>
                                      <span className="ml-2 shrink-0 text-xs opacity-70">Aa</span>
                                    </Button>
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 shrink-0"
                                      onClick={() => handleToggleFavoriteFont(fontFamily)}
                                      aria-label={isFavorite ? `Remove ${fontFamily} from favorites` : `Add ${fontFamily} to favorites`}
                                    >
                                      <Star className={cn('h-4 w-4', isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400')} />
                                    </Button>
                                  </div>
                                );
                              })
                            )}
                          </div>
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div className="space-y-2">
                      <Label>Color</Label>
                      <Input type="color" value={selectedLabel.color} onChange={(event) => handleEditorColorChange(event.target.value)} />
                    </div>

                    <div className="space-y-2">
                      <Label>Alignment</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedLabel.align === 'left' ? 'default' : 'outline'}
                          className="gap-1"
                          onClick={() => handleEditorAlignChange('left')}
                        >
                          <AlignLeft className="h-4 w-4" />
                          Left
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedLabel.align === 'center' ? 'default' : 'outline'}
                          className="gap-1"
                          onClick={() => handleEditorAlignChange('center')}
                        >
                          <AlignCenter className="h-4 w-4" />
                          Center
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={selectedLabel.align === 'right' ? 'default' : 'outline'}
                          className="gap-1"
                          onClick={() => handleEditorAlignChange('right')}
                        >
                          <AlignRight className="h-4 w-4" />
                          Right
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label>Vertical Alignment</Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant={(selectedLabel.verticalAlign ?? 'center') === 'top' ? 'default' : 'outline'}
                          className="gap-1"
                          onClick={() => handleEditorVerticalAlignChange('top')}
                        >
                          <AlignStartVertical className="h-4 w-4" />
                          Top
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={(selectedLabel.verticalAlign ?? 'center') === 'center' ? 'default' : 'outline'}
                          className="gap-1"
                          onClick={() => handleEditorVerticalAlignChange('center')}
                        >
                          <AlignCenterVertical className="h-4 w-4" />
                          Center
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant={(selectedLabel.verticalAlign ?? 'center') === 'bottom' ? 'default' : 'outline'}
                          className="gap-1"
                          onClick={() => handleEditorVerticalAlignChange('bottom')}
                        >
                          <AlignEndVertical className="h-4 w-4" />
                          Bottom
                        </Button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
