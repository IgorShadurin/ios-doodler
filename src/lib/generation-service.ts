import { buildOutputFilename } from "@/lib/exporter";
import { buildGenerationPlan } from "@/lib/generation-plan";
import { renderImage } from "@/lib/image-generator";
import { getPresetById } from "@/lib/ios-presets";
import { type GeneratedArtifact } from "@/lib/output-writer";
import { resolvePublicAssetPath } from "@/lib/storage";
import { fromDbAlign, type TemplateWithRelations } from "@/lib/template-service";
import { parseEntriesJson } from "@/lib/translations";

export type HydratedTemplate = TemplateWithRelations;

function dedupe(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const clean = value.trim();
    if (!clean || seen.has(clean)) {
      continue;
    }

    seen.add(clean);
    result.push(clean);
  }

  return result;
}

export function resolveTemplateLanguages(
  template: HydratedTemplate,
  options: { allLanguages: boolean; languageCodes?: string[] },
): string[] {
  const available = dedupe(template.translations.map((item) => item.languageCode));

  if (options.allLanguages) {
    return available;
  }

  const selected = dedupe(options.languageCodes ?? []);
  return selected.filter((languageCode) => available.includes(languageCode));
}

export async function generateArtifactsForTemplate(
  template: HydratedTemplate,
  options: { presetIds: string[]; allLanguages: boolean; languageCodes?: string[] },
): Promise<GeneratedArtifact[]> {
  const presetIds = dedupe(options.presetIds);
  const requestedLanguages = resolveTemplateLanguages(template, options);

  const jobs = buildGenerationPlan(presetIds, requestedLanguages);
  if (jobs.length < 1) {
    return [];
  }

  const templatePath = resolvePublicAssetPath(template.sourceImagePath);
  const translationsByLang = new Map(
    template.translations.map((item) => [item.languageCode, parseEntriesJson(item.entriesJson)]),
  );

  const artifacts: GeneratedArtifact[] = [];

  for (const job of jobs) {
    const preset = getPresetById(job.presetId);
    if (!preset) {
      continue;
    }

    const image = await renderImage({
      templatePath,
      outputWidth: preset.width,
      outputHeight: preset.height,
      labels: template.labels.map((label) => ({
        key: label.key,
        x: label.x,
        y: label.y,
        width: label.width,
        fontSize: label.fontSize,
        fontWeight: label.fontWeight,
        color: label.color,
        align: fromDbAlign(label.align),
        maxLines: label.maxLines,
      })),
      translations: translationsByLang.get(job.languageCode) ?? {},
    });

    artifacts.push({
      languageCode: job.languageCode,
      templateName: template.name,
      fileName: buildOutputFilename(template.name, preset.id, job.languageCode),
      data: image,
    });
  }

  return artifacts;
}
