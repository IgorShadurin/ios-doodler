import { NextResponse } from "next/server";

import { buildScreenshotsRelativePath, createZipBuffer } from "@/lib/exporter";
import { generateArtifactsForTemplate } from "@/lib/generation-service";
import { getTemplateWithRelations } from "@/lib/template-service";

export const runtime = "nodejs";

type GeneratePayload = {
  presetIds?: string[];
  languageCodes?: string[];
  allLanguages?: boolean;
};

export async function POST(
  request: Request,
  context: { params: Promise<{ templateId: string }> },
) {
  const { templateId } = await context.params;
  const template = await getTemplateWithRelations(templateId);

  if (!template) {
    return NextResponse.json({ error: "Template not found." }, { status: 404 });
  }

  const payload = (await request.json()) as GeneratePayload;
  const presetIds = Array.isArray(payload.presetIds) ? payload.presetIds : [];

  if (presetIds.length < 1) {
    return NextResponse.json({ error: "Select at least one iOS size preset." }, { status: 400 });
  }

  const artifacts = await generateArtifactsForTemplate(template, {
    presetIds,
    allLanguages: payload.allLanguages === true,
    languageCodes: payload.languageCodes,
  });
  const files = artifacts.map((item) => ({
    name: buildScreenshotsRelativePath(item.languageCode, item.fileName),
    data: item.data,
  }));

  if (files.length < 1) {
    return NextResponse.json({ error: "No files were generated. Check presets and languages." }, { status: 400 });
  }

  const zip = await createZipBuffer(files);

  return new NextResponse(new Uint8Array(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${template.id}-screenshots.zip"`,
    },
  });
}
