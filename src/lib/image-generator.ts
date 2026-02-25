import sharp from "sharp";

import { SCREENSHOT_OPAQUE_BACKGROUND_HEX } from "@/lib/defaults";
import { type LabelAlign, type LabelDraft } from "@/lib/labels";
import { wrapTextToLines } from "@/lib/text-layout";

export type RenderLabel = Pick<LabelDraft, "key" | "x" | "y" | "width" | "fontSize" | "fontWeight" | "color" | "align" | "maxLines">;

export type RenderImageInput = {
  templatePath: string;
  outputWidth: number;
  outputHeight: number;
  labels: RenderLabel[];
  translations: Record<string, string>;
};

function escapeXml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function toAnchor(align: LabelAlign): "start" | "middle" | "end" {
  if (align === "left") {
    return "start";
  }
  if (align === "right") {
    return "end";
  }
  return "middle";
}

function buildTextBlock(label: RenderLabel, text: string, outputWidth: number, outputHeight: number): string {
  const labelX = label.x * outputWidth;
  const labelY = label.y * outputHeight;
  const labelWidth = Math.max(1, label.width * outputWidth);
  const fontSizePx = Math.max(8, label.fontSize * outputHeight);
  const lineHeight = fontSizePx * 1.2;
  const anchor = toAnchor(label.align);

  const lines = wrapTextToLines({
    text,
    maxWidthPx: labelWidth,
    fontSizePx,
    maxLines: label.maxLines,
  });

  const anchorX = label.align === "left"
    ? labelX
    : label.align === "right"
      ? labelX + labelWidth
      : labelX + labelWidth / 2;

  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? fontSizePx : lineHeight;
      return `<tspan x="${anchorX}" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return `<text text-anchor="${anchor}" fill="${label.color}" font-size="${fontSizePx}" font-weight="${label.fontWeight}" font-family="'Space Grotesk', 'Arial', sans-serif" x="${anchorX}" y="${labelY}">${tspans}</text>`;
}

export function buildLabelsSvg(
  labels: RenderLabel[],
  translations: Record<string, string>,
  width: number,
  height: number,
): string {
  const blocks = labels
    .map((label) => {
      const text = translations[label.key] ?? `[${label.key}]`;
      return buildTextBlock(label, text, width, height);
    })
    .join("\n");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${blocks}</svg>`;
}

export async function renderImage(input: RenderImageInput): Promise<Buffer> {
  const svg = buildLabelsSvg(input.labels, input.translations, input.outputWidth, input.outputHeight);

  return sharp(input.templatePath)
    .resize(input.outputWidth, input.outputHeight, {
      fit: "cover",
      position: "center",
    })
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .flatten({ background: SCREENSHOT_OPAQUE_BACKGROUND_HEX })
    .removeAlpha()
    .png()
    .toBuffer();
}
