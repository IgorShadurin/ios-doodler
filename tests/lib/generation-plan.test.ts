import assert from "node:assert/strict";
import test from "node:test";

import { buildGenerationPlan } from "@/lib/generation-plan";

test("buildGenerationPlan creates language x preset combinations", () => {
  const plan = buildGenerationPlan(["iphone-6-5", "ipad-12-9"], ["en", "fr"]);

  assert.equal(plan.length, 4);
  assert.deepEqual(plan[0], { presetId: "iphone-6-5", languageCode: "en" });
  assert.deepEqual(plan[3], { presetId: "ipad-12-9", languageCode: "fr" });
});

test("buildGenerationPlan returns empty when any side is empty", () => {
  assert.equal(buildGenerationPlan([], ["en"]).length, 0);
  assert.equal(buildGenerationPlan(["iphone-6-5"], []).length, 0);
});
