import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import { STUDIO_LANGUAGES } from "@/features/ios-doodler/languages";
import {
  addLabelFromKey,
  createInitialSlots,
  listSlotLabelKeys,
  removeLabel,
  setLabelPosition,
  updateLabel,
} from "@/features/ios-doodler/model";

test("createInitialSlots starts with initial demo labels on first shot", () => {
  const slots = createInitialSlots(STUDIO_LANGUAGES);
  assert.equal(slots[0]?.labels.length, 2);
  assert.equal(slots[1]?.labels.length, 0);
});

test("listSlotLabelKeys returns text keys from imported language map", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);

  slot.textByLanguage = {
    "en-US": {
      headline: "Headline",
      subtitle: "Subtitle",
      cta: "Try now",
    },
    ru: {
      headline: "Заголовок",
      subtitle: "Подзаголовок",
      cta: "Попробовать",
    },
  };

  const keys = listSlotLabelKeys(slot, "en-US");
  assert.deepEqual(keys, ["headline", "subtitle", "cta"]);
});

test("addLabelFromKey allows multiple instances of same key and supports centered drop", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);

  slot.textByLanguage = {
    "en-US": {
      headline: "Feature One",
    },
  };

  const baseLabelCount = slot.labels.length;
  const once = addLabelFromKey(slot, "headline", { x: 0.5, y: 0.3, centered: true });
  const firstCreated = once.labels[baseLabelCount];
  assert.ok(firstCreated);
  const twice = addLabelFromKey(once, "headline", { x: 0.95, y: 0.9, centered: true });
  const secondCreated = twice.labels[baseLabelCount + 1];
  assert.ok(secondCreated);

  assert.equal(twice.labels.length, baseLabelCount + 2);
  assert.equal(firstCreated.key, "headline");
  assert.equal(secondCreated.key, "headline");
  assert.notEqual(firstCreated.id, secondCreated.id);

  assert.ok(Math.abs((firstCreated.x ?? 0) - 0.11) < 1e-6);
  assert.equal(firstCreated.y, 0.3);
  assert.ok(Math.abs((secondCreated.x ?? 0) - 0.22) < 1e-6);
  assert.equal(secondCreated.y, 0.76);
});

test("removeLabel removes only selected label instance", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);

  slot.textByLanguage = {
    "en-US": {
      headline: "Feature One",
    },
  };

  const baseLabelCount = slot.labels.length;
  const withTwo = addLabelFromKey(addLabelFromKey(slot, "headline"), "headline");
  const targetId = withTwo.labels[baseLabelCount]?.id;
  assert.ok(targetId);

  const next = removeLabel(withTwo, targetId);
  assert.equal(next.labels.length, baseLabelCount + 1);
  assert.ok(!next.labels.some((item) => item.id === targetId));
});

test("addLabelFromKey does not inherit edited style from previous label of the same key", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);

  slot.textByLanguage = {
    "en-US": {
      headline: "Feature One",
    },
  };

  const baseLabelCount = slot.labels.length;
  const withOne = addLabelFromKey(slot, "headline");
  const firstId = withOne.labels[baseLabelCount]?.id;
  assert.ok(firstId);

  const edited = updateLabel(withOne, firstId, {
    width: 0.5,
    fontSize: 0.02,
    rotation: 33,
  });
  const withTwo = addLabelFromKey(edited, "headline");
  const second = withTwo.labels[baseLabelCount + 1];
  assert.ok(second);

  assert.equal(second?.width, 0.78);
  assert.notEqual(second?.fontSize, 0.02);
  assert.equal(second?.rotation, 0);
});

test("updateLabel allows large width and font size values", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);
  slot.textByLanguage = { "en-US": { headline: "Feature One" } };

  const withLabel = addLabelFromKey(slot, "headline");
  const labelId = withLabel.labels[0]?.id;
  assert.ok(labelId);

  const next = updateLabel(withLabel, labelId, {
    width: 2.4,
    fontSize: 0.44,
  });
  const label = next.labels[0];
  assert.ok(label);
  assert.equal(label?.width, 2.4);
  assert.equal(label?.fontSize, 0.44);
});

test("updateLabel can resize box without changing font size", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);
  slot.textByLanguage = { "en-US": { headline: "Feature One" } };

  const withLabel = addLabelFromKey(slot, "headline");
  const labelId = withLabel.labels[0]?.id;
  const beforeFontSize = withLabel.labels[0]?.fontSize;
  assert.ok(labelId);
  assert.ok(beforeFontSize);

  const next = updateLabel(withLabel, labelId, {
    width: 1.6,
    height: 0.35,
  });

  assert.equal(next.labels[0]?.fontSize, beforeFontSize);
  assert.equal(next.labels[0]?.width, 1.6);
  assert.equal(next.labels[0]?.height, 0.35);
});

test("setLabelPosition supports moving oversized labels across X range", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);
  slot.textByLanguage = { "en-US": { headline: "Feature One" } };

  const withLabel = addLabelFromKey(slot, "headline");
  const labelId = withLabel.labels[0]?.id;
  assert.ok(labelId);

  const oversized = updateLabel(withLabel, labelId, { width: 2 });
  const movedLeft = setLabelPosition(oversized, labelId, -0.9, 0.2);
  const movedRight = setLabelPosition(movedLeft, labelId, 0.95, 0.2);

  assert.equal(movedLeft.labels[0]?.x, -0.9);
  assert.equal(movedRight.labels[0]?.x, 0.95);
});

test("setLabelPosition returns the same slot when the position does not change", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);
  slot.textByLanguage = { "en-US": { headline: "Feature One" } };

  const withLabel = addLabelFromKey(slot, "headline");
  const label = withLabel.labels[0];
  assert.ok(label);

  const same = setLabelPosition(withLabel, label.id, label.x, label.y);
  assert.equal(same, withLabel);
});

test("updateLabel returns the same slot when no effective style change is applied", () => {
  const [slot] = createInitialSlots(STUDIO_LANGUAGES);
  assert.ok(slot);
  slot.textByLanguage = { "en-US": { headline: "Feature One" } };

  const withLabel = addLabelFromKey(slot, "headline");
  const label = withLabel.labels[0];
  assert.ok(label);

  const same = updateLabel(withLabel, label.id, { color: label.color });
  assert.equal(same, withLabel);
});
