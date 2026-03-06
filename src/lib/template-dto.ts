import type { TemplateDto } from "@/lib/contracts";
import { fromDbAlign, type TemplateWithRelations } from "@/lib/template-service";
import { parseEntriesJson } from "@/lib/translations";

type HydratedTemplate = TemplateWithRelations;

export function toTemplateDto(template: HydratedTemplate): TemplateDto {
  return {
    id: template.id,
    name: template.name,
    description: template.description,
    sourceImagePath: template.sourceImagePath,
    sourceWidth: template.sourceWidth,
    sourceHeight: template.sourceHeight,
    labels: template.labels.map((label) => ({
      id: label.id,
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
    translations: template.translations.map((translation) => ({
      id: translation.id,
      languageCode: translation.languageCode,
      entries: parseEntriesJson(translation.entriesJson),
    })),
    updatedAt: template.updatedAt.toISOString(),
  };
}
