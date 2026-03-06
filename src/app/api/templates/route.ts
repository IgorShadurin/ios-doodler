import { NextResponse } from "next/server";

import { createTemplate, listTemplates, type TemplateWithRelations } from "@/lib/template-service";
import { toTemplateDto } from "@/lib/template-dto";
import { saveTemplateUpload } from "@/lib/storage";

export const runtime = "nodejs";

export async function GET() {
  const templates = await listTemplates();
  return NextResponse.json({
    items: templates.map((template: TemplateWithRelations) => toTemplateDto(template)),
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const name = formData.get("name");
  const description = formData.get("description");
  const image = formData.get("image");

  if (typeof name !== "string" || name.trim().length < 1) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!(image instanceof File)) {
    return NextResponse.json({ error: "image is required" }, { status: 400 });
  }

  try {
    const saved = await saveTemplateUpload(image);

    const template = await createTemplate({
      name,
      description: typeof description === "string" ? description : null,
      sourceImagePath: saved.publicPath,
      sourceWidth: saved.width,
      sourceHeight: saved.height,
    });

    const hydrated = {
      ...template,
      labels: [],
      translations: [],
    };

    return NextResponse.json(toTemplateDto(hydrated), { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create template.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
