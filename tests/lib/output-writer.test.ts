import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildLanguageGroupedOutputPath, writeArtifactsGroupedByLanguage } from "@/lib/output-writer";

test("buildLanguageGroupedOutputPath follows screenshots layout", () => {
  const output = buildLanguageGroupedOutputPath("/tmp/out", "pt-BR", "main-hero_iphone-6-5_pt-br.png");
  assert.equal(output, path.join("/tmp/out", "screenshots", "pt-BR", "main-hero_iphone-6-5_pt-br.png"));
});

test("writeArtifactsGroupedByLanguage writes image buffers to grouped folders", async () => {
  const baseDir = fs.mkdtempSync(path.join(os.tmpdir(), "open-ios-doodler-writer-"));

  try {
    const result = await writeArtifactsGroupedByLanguage(baseDir, [
      {
        languageCode: "en",
        templateName: "Feature One",
        fileName: "feature-one_iphone-6-5_en.png",
        data: Buffer.from("A"),
      },
      {
        languageCode: "de",
        templateName: "Feature One",
        fileName: "feature-one_iphone-6-5_de.png",
        data: Buffer.from("B"),
      },
    ]);

    assert.equal(result.length, 2);

    const firstPath = path.join(baseDir, "screenshots", "en", "feature-one_iphone-6-5_en.png");
    const secondPath = path.join(baseDir, "screenshots", "de", "feature-one_iphone-6-5_de.png");

    assert.equal(fs.existsSync(firstPath), true);
    assert.equal(fs.existsSync(secondPath), true);
  } finally {
    fs.rmSync(baseDir, { recursive: true, force: true });
  }
});
