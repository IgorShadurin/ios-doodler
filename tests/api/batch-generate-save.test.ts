import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import sharp from "sharp";

import { POST as createTemplateRoute } from "@/app/api/templates/route";
import { PUT as saveLabelsRoute } from "@/app/api/templates/[templateId]/labels/route";
import { PUT as importTranslationsRoute } from "@/app/api/templates/[templateId]/translations/route";
import { POST as saveBatchRoute } from "@/app/api/generate/save/route";
import { prisma } from "@/lib/prisma";

async function resetDb() {
  await prisma.translationLocale.deleteMany();
  await prisma.templateLabel.deleteMany();
  await prisma.template.deleteMany();
}

async function createTemplate(name: string): Promise<string> {
  const imageBuffer = await sharp({
    create: {
      width: 900,
      height: 1600,
      channels: 4,
      background: { r: 25, g: 55, b: 95, alpha: 1 },
    },
  })
    .png()
    .toBuffer();

  const form = new FormData();
  form.set("name", name);
  form.set("description", "batch test");
  form.set("image", new File([imageBuffer], `${name}.png`, { type: "image/png" }));

  const createResponse = await createTemplateRoute(
    new Request("http://localhost/api/templates", {
      method: "POST",
      body: form,
    }),
  );

  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()) as { id: string };
  return created.id;
}

async function setTemplateContent(templateId: string, titlePrefix: string) {
  const saveLabelsResponse = await saveLabelsRoute(
    new Request(`http://localhost/api/templates/${templateId}/labels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labels: [
          {
            key: "title",
            x: 0.1,
            y: 0.1,
            width: 0.8,
            fontSize: 0.05,
            fontWeight: 700,
            color: "#ffffff",
            align: "center",
            maxLines: 2,
          },
        ],
      }),
    }),
    { params: Promise.resolve({ templateId }) },
  );
  assert.equal(saveLabelsResponse.status, 200);

  const importResponse = await importTranslationsRoute(
    new Request(`http://localhost/api/templates/${templateId}/translations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: JSON.stringify({
          en: { title: `${titlePrefix} EN` },
          de: { title: `${titlePrefix} DE` },
        }),
      }),
    }),
    { params: Promise.resolve({ templateId }) },
  );
  assert.equal(importResponse.status, 200);
}

test.beforeEach(async () => {
  await resetDb();
});

test("batch generate save route writes grouped files for multiple templates", async () => {
  const templateOne = await createTemplate("Batch One");
  const templateTwo = await createTemplate("Batch Two");

  await setTemplateContent(templateOne, "One");
  await setTemplateContent(templateTwo, "Two");

  const outputDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-ios-doodler-batch-"));

  try {
    const response = await saveBatchRoute(
      new Request("http://localhost/api/generate/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateIds: [templateOne, templateTwo],
          presetIds: ["iphone-6-5"],
          allLanguages: true,
          outputDir,
        }),
      }),
    );

    assert.equal(response.status, 200);

    const payload = (await response.json()) as {
      writtenCount: number;
      outputDir: string;
      languageCodes: string[];
    };

    assert.equal(payload.writtenCount, 4);
    assert.equal(payload.outputDir, outputDir);
    assert.deepEqual(payload.languageCodes, ["de", "en"]);

    const enDir = path.join(outputDir, "screenshots", "en");
    const deDir = path.join(outputDir, "screenshots", "de");
    assert.equal(fs.existsSync(enDir), true);
    assert.equal(fs.existsSync(deDir), true);

    const enFiles = fs.readdirSync(enDir, { recursive: true }).filter((item) => String(item).endsWith(".png"));
    const deFiles = fs.readdirSync(deDir, { recursive: true }).filter((item) => String(item).endsWith(".png"));

    assert.equal(enFiles.length, 2);
    assert.equal(deFiles.length, 2);
  } finally {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
});
