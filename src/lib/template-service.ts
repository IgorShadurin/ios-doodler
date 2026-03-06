import type { Prisma } from "@prisma/client";
import { TextAlign } from "@prisma/client";

import { type LabelDraft, normalizeLabelDraft } from "@/lib/labels";
import { prisma } from "@/lib/prisma";

type CreateTemplateInput = {
  name: string;
  description: string | null;
  sourceImagePath: string;
  sourceWidth: number;
  sourceHeight: number;
};

export type TemplateWithRelations = Prisma.TemplateGetPayload<{
  include: {
    labels: true;
    translations: true;
  };
}>;

function toDbAlign(value: LabelDraft["align"]): TextAlign {
  if (value === "left") {
    return TextAlign.LEFT;
  }
  if (value === "right") {
    return TextAlign.RIGHT;
  }
  return TextAlign.CENTER;
}

function sanitizeTemplateName(value: string): string {
  const clean = value.trim();
  if (!clean) {
    throw new Error("Template name is required.");
  }
  return clean;
}

export async function createTemplate(input: CreateTemplateInput) {
  return prisma.template.create({
    data: {
      name: sanitizeTemplateName(input.name),
      description: input.description?.trim() || null,
      sourceImagePath: input.sourceImagePath,
      sourceWidth: input.sourceWidth,
      sourceHeight: input.sourceHeight,
    },
  });
}

export async function listTemplates(): Promise<TemplateWithRelations[]> {
  return prisma.template.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      labels: true,
      translations: true,
    },
  });
}

export async function listTemplatesWithRelations() {
  return prisma.template.findMany({
    orderBy: { updatedAt: "desc" },
    include: {
      labels: { orderBy: { key: "asc" } },
      translations: { orderBy: { languageCode: "asc" } },
    },
  });
}

export async function getTemplateWithRelations(templateId: string) {
  return prisma.template.findUnique({
    where: { id: templateId },
    include: {
      labels: { orderBy: { key: "asc" } },
      translations: { orderBy: { languageCode: "asc" } },
    },
  });
}

export async function getTemplatesWithRelationsByIds(templateIds: string[]) {
  const cleanIds = Array.from(new Set(templateIds.map((item) => item.trim()).filter((item) => item.length > 0)));
  if (cleanIds.length < 1) {
    return [];
  }

  return prisma.template.findMany({
    where: {
      id: {
        in: cleanIds,
      },
    },
    orderBy: { updatedAt: "desc" },
    include: {
      labels: { orderBy: { key: "asc" } },
      translations: { orderBy: { languageCode: "asc" } },
    },
  });
}

export async function replaceLabelsForTemplate(templateId: string, labels: LabelDraft[]) {
  const normalized = labels.map((item) => normalizeLabelDraft(item));

  await prisma.$transaction(async (tx) => {
    await tx.templateLabel.deleteMany({ where: { templateId } });

    if (normalized.length > 0) {
      await tx.templateLabel.createMany({
        data: normalized.map((label) => ({
          templateId,
          key: label.key.trim(),
          x: label.x,
          y: label.y,
          width: label.width,
          fontSize: label.fontSize,
          fontWeight: label.fontWeight,
          color: label.color,
          align: toDbAlign(label.align),
          maxLines: label.maxLines,
        })),
      });
    }
  });

  return getTemplateWithRelations(templateId);
}

export async function importTranslationsForTemplate(
  templateId: string,
  translationMap: Record<string, Record<string, string>>,
): Promise<number> {
  let count = 0;

  await prisma.$transaction(async (tx) => {
    for (const [languageCodeRaw, entries] of Object.entries(translationMap)) {
      const languageCode = languageCodeRaw.trim();
      if (!languageCode) {
        continue;
      }

      const cleanEntries: Record<string, string> = {};

      for (const [key, value] of Object.entries(entries)) {
        cleanEntries[key.trim()] = value.trim();
      }

      await tx.translationLocale.upsert({
        where: {
          templateId_languageCode: {
            templateId,
            languageCode,
          },
        },
        create: {
          templateId,
          languageCode,
          entriesJson: JSON.stringify(cleanEntries),
        },
        update: {
          entriesJson: JSON.stringify(cleanEntries),
        },
      });

      count += 1;
    }
  });

  return count;
}

export function fromDbAlign(value: TextAlign): LabelDraft["align"] {
  if (value === TextAlign.LEFT) {
    return "left";
  }
  if (value === TextAlign.RIGHT) {
    return "right";
  }
  return "center";
}
