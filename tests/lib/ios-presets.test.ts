import assert from "node:assert/strict";
import test from "node:test";

import { IOS_PRESETS, dedupePresetIds, getPresetById } from "@/lib/ios-presets";

test("ios presets expose common iphone/ipad dimensions", () => {
  assert.ok(IOS_PRESETS.length >= 8);
  assert.ok(IOS_PRESETS.some((preset) => preset.id === "iphone-6-5"));
  assert.ok(IOS_PRESETS.some((preset) => preset.id === "ipad-12-9"));
});

test("getPresetById resolves known preset and returns null for unknown", () => {
  const preset = getPresetById("iphone-6-5");
  assert.ok(preset);
  assert.equal(preset?.width, 1284);

  const legacyPreset = getPresetById("iphone-6-5-legacy");
  assert.ok(legacyPreset);
  assert.equal(legacyPreset?.width, 1242);
  assert.equal(legacyPreset?.height, 2688);

  assert.equal(getPresetById("missing"), null);
});

test("dedupePresetIds preserves order and ignores unknown ids", () => {
  const presets = dedupePresetIds(["iphone-6-5", "iphone-6-5", "bad", "ipad-12-9"]);
  assert.deepEqual(
    presets.map((item) => item.id),
    ["iphone-6-5", "ipad-12-9"],
  );
});
