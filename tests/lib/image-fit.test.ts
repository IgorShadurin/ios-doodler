import { assertTestDatabaseGuard } from "../helpers/test-db";

assertTestDatabaseGuard();

import assert from "node:assert/strict";
import test from "node:test";

import {
  computeCropRect,
  getCropAnchorsForAspectMismatch,
  hasMatchingAspectRatio,
} from "@/features/ios-doodler/image-fit";

test("hasMatchingAspectRatio accepts equal ratio with different sizes", () => {
  assert.equal(hasMatchingAspectRatio(642, 1389, 1284, 2778), true);
  assert.equal(hasMatchingAspectRatio(1242, 2688, 1284, 2778), true);
});

test("hasMatchingAspectRatio rejects clearly different ratio", () => {
  assert.equal(hasMatchingAspectRatio(1200, 1200, 1284, 2778), false);
});

test("computeCropRect crops wide image horizontally with left/center/right anchors", () => {
  const left = computeCropRect(2000, 1000, 1000, 1000, "left");
  const center = computeCropRect(2000, 1000, 1000, 1000, "center");
  const right = computeCropRect(2000, 1000, 1000, 1000, "right");

  assert.deepEqual(left, { sx: 0, sy: 0, sw: 1000, sh: 1000 });
  assert.deepEqual(center, { sx: 500, sy: 0, sw: 1000, sh: 1000 });
  assert.deepEqual(right, { sx: 1000, sy: 0, sw: 1000, sh: 1000 });
});

test("computeCropRect crops tall image vertically with top/center/bottom anchors", () => {
  const top = computeCropRect(1000, 2000, 1000, 1000, "top");
  const center = computeCropRect(1000, 2000, 1000, 1000, "center");
  const bottom = computeCropRect(1000, 2000, 1000, 1000, "bottom");

  assert.deepEqual(top, { sx: 0, sy: 0, sw: 1000, sh: 1000 });
  assert.deepEqual(center, { sx: 0, sy: 500, sw: 1000, sh: 1000 });
  assert.deepEqual(bottom, { sx: 0, sy: 1000, sw: 1000, sh: 1000 });
});

test("getCropAnchorsForAspectMismatch exposes anchor options by mismatch direction", () => {
  assert.deepEqual(getCropAnchorsForAspectMismatch(2000, 1000, 1000, 1000), [
    "left",
    "center",
    "right",
  ]);
  assert.deepEqual(getCropAnchorsForAspectMismatch(1000, 2000, 1000, 1000), [
    "top",
    "center",
    "bottom",
  ]);
  assert.deepEqual(getCropAnchorsForAspectMismatch(1284, 2778, 642, 1389), [
    "center",
  ]);
});
