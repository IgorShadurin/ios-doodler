import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";
import sharp from "sharp";

import { POST as createTemplateRoute } from "@/app/api/templates/route";
import { PUT as saveLabelsRoute } from "@/app/api/templates/[templateId]/labels/route";
import { PUT as importTranslationsRoute } from "@/app/api/templates/[templateId]/translations/route";
import { POST as generateRoute } from "@/app/api/templates/[templateId]/generate/route";
import { prisma } from "@/lib/prisma";

async function resetDb() {
  await prisma.translationLocale.deleteMany();
  await prisma.templateLabel.deleteMany();
  await prisma.template.deleteMany();
}

test.beforeEach(async () => {
  await resetDb();
});

test("template API supports create, label save, translation import, and generation", async () => {
  const imageBuffer = await sharp({
    create: {
      width: 900,
      height: 1600,
      channels: 4,
      background: { r: 35, g: 45, b: 60, alpha: 1 },
    },
  })
    .png()
    .toBuffer();
  const imageBytes = Uint8Array.from(imageBuffer);

  const form = new FormData();
  form.set("name", "Route Test Template");
  form.set("description", "route test");
  form.set("image", new File([imageBytes], "template.png", { type: "image/png" }));

  const createResponse = await createTemplateRoute(
    new Request("http://localhost/api/templates", {
      method: "POST",
      body: form,
    }),
  );

  assert.equal(createResponse.status, 201);
  const created = (await createResponse.json()) as { id: string };
  assert.ok(created.id);

  const saveLabelsResponse = await saveLabelsRoute(
    new Request(`http://localhost/api/templates/${created.id}/labels`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        labels: [
          {
            key: "title",
            x: 0.1,
            y: 0.1,
            width: 0.8,
            fontSize: 0.06,
            fontWeight: 700,
            color: "#ffffff",
            align: "center",
            maxLines: 2,
          },
        ],
      }),
    }),
    { params: Promise.resolve({ templateId: created.id }) },
  );

  assert.equal(saveLabelsResponse.status, 200);
  const withLabels = (await saveLabelsResponse.json()) as { labels: Array<{ key: string }> };
  assert.equal(withLabels.labels.length, 1);
  assert.equal(withLabels.labels[0]?.key, "title");

  const importResponse = await importTranslationsRoute(
    new Request(`http://localhost/api/templates/${created.id}/translations`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        json: JSON.stringify({
          en: { title: "Welcome" },
          de: { title: "Willkommen" },
        }),
      }),
    }),
    { params: Promise.resolve({ templateId: created.id }) },
  );

  assert.equal(importResponse.status, 200);
  const importData = (await importResponse.json()) as { updatedCount: number };
  assert.equal(importData.updatedCount, 2);

  const generateResponse = await generateRoute(
    new Request(`http://localhost/api/templates/${created.id}/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        presetIds: ["iphone-6-5"],
        languageCodes: ["en"],
      }),
    }),
    { params: Promise.resolve({ templateId: created.id }) },
  );

  assert.equal(generateResponse.status, 200);
  assert.equal(generateResponse.headers.get("content-type"), "application/zip");

  const bytes = new Uint8Array(await generateResponse.arrayBuffer());
  assert.ok(bytes.byteLength > 1000);

  const zip = await JSZip.loadAsync(bytes);
  const names = Object.keys(zip.files)
    .filter((name) => !zip.files[name]?.dir)
    .sort();

  assert.ok(names.length > 0);
  assert.equal(names[0]?.startsWith("screenshots/en/"), true);
});
