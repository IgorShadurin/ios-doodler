import JSZip from "jszip";

export type ZipFileInput = {
  name: string;
  data: Buffer;
};

export const SCREENSHOTS_DIR = "screenshots";

export function sanitizeSegment(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

export function buildOutputFilename(templateName: string, presetId: string, languageCode: string): string {
  const safeTemplate = sanitizeSegment(templateName) || "template";
  const safePreset = sanitizeSegment(presetId) || "preset";
  const safeLanguage = sanitizeSegment(languageCode) || "lang";
  return `${safeTemplate}_${safePreset}_${safeLanguage}.png`;
}

function sanitizePathSegment(value: string, fallback: string): string {
  const normalized = value
    .trim()
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/\s+/g, " ")
    .replace(/^\.+$/, "")
    .trim();

  return normalized.length > 0 ? normalized : fallback;
}

export function buildScreenshotsRelativePath(languageCode: string, fileName: string): string {
  const safeLanguage = sanitizePathSegment(languageCode, "en-US");
  const safeFileName = sanitizePathSegment(fileName, "screenshot.png");
  return `${SCREENSHOTS_DIR}/${safeLanguage}/${safeFileName}`;
}

export async function createZipBuffer(files: ZipFileInput[]): Promise<Buffer> {
  const zip = new JSZip();

  for (const file of files) {
    zip.file(file.name, file.data);
  }

  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: {
      level: 9,
    },
  });
}
