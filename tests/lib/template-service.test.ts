import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { prisma } from "@/lib/prisma";
import {
  createTemplate,
  getTemplateWithRelations,
  importTranslationsForTemplate,
  replaceLabelsForTemplate,
} from "@/lib/template-service";

test.beforeEach(async () => {
  await prisma.translationLocale.deleteMany();
  await prisma.templateLabel.deleteMany();
  await prisma.template.deleteMany();
});

test("template-service stores template and replaces labels", async () => {
  const template = await createTemplate({
    name: "Hero Shot",
    description: "Main screenshot",
    sourceImagePath: "/uploads/templates/demo.png",
    sourceWidth: 1179,
    sourceHeight: 2556,
  });

  await replaceLabelsForTemplate(template.id, [
    {
      key: "title",
      x: 0.2,
      y: 0.1,
      width: 0.6,
      fontSize: 0.06,
      fontWeight: 700,
      color: "#ffffff",
      align: "center",
      maxLines: 2,
    },
    {
      key: "subtitle",
      x: 0.2,
      y: 0.2,
      width: 0.6,
      fontSize: 0.03,
      fontWeight: 500,
      color: "#ffeeaa",
      align: "left",
      maxLines: 3,
    },
  ]);

  const hydrated = await getTemplateWithRelations(template.id);
  assert.equal(hydrated?.labels.length, 2);
  assert.equal(hydrated?.labels[0]?.key, "subtitle");
  assert.equal(hydrated?.labels[1]?.key, "title");
});

test("template-service imports translations as upsert per language", async () => {
  const template = await createTemplate({
    name: "Translations",
    description: null,
    sourceImagePath: "/uploads/templates/demo2.png",
    sourceWidth: 1284,
    sourceHeight: 2778,
  });

  const first = await importTranslationsForTemplate(template.id, {
    en: { title: "Hello" },
    fr: { title: "Bonjour" },
  });

  assert.equal(first, 2);

  const second = await importTranslationsForTemplate(template.id, {
    en: { title: "Hello Updated" },
  });

  assert.equal(second, 1);

  const hydrated = await getTemplateWithRelations(template.id);
  assert.equal(hydrated?.translations.length, 2);

  const english = hydrated?.translations.find((item) => item.languageCode === "en");
  assert.ok(english);
  assert.equal(english?.entriesJson, JSON.stringify({ title: "Hello Updated" }));
});
