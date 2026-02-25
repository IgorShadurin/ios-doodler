import fs from "node:fs/promises";
import path from "node:path";

import { buildScreenshotsRelativePath } from "@/lib/exporter";

export type GeneratedArtifact = {
  languageCode: string;
  templateName: string;
  fileName: string;
  data: Buffer;
};

export function resolveOutputDirectoryPath(outputDir: string): string {
  const clean = outputDir.trim();
  if (!clean) {
    throw new Error("outputDir is required.");
  }

  return path.isAbsolute(clean) ? clean : path.resolve(process.cwd(), clean);
}

export function buildLanguageGroupedOutputPath(
  outputDir: string,
  languageCode: string,
  fileName: string,
): string {
  const relativePath = buildScreenshotsRelativePath(languageCode, fileName);
  return path.join(outputDir, ...relativePath.split("/"));
}

export async function writeArtifactsGroupedByLanguage(
  outputDir: string,
  artifacts: GeneratedArtifact[],
): Promise<string[]> {
  const writtenPaths: string[] = [];

  for (const artifact of artifacts) {
    const filePath = buildLanguageGroupedOutputPath(
      outputDir,
      artifact.languageCode,
      artifact.fileName,
    );

    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, artifact.data);
    writtenPaths.push(filePath);
  }

  return writtenPaths;
}
