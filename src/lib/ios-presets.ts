import {
  DEFAULT_SCREENSHOT_HEIGHT,
  DEFAULT_SCREENSHOT_WIDTH,
} from "@/lib/defaults";

export type IOSPreset = {
  id: string;
  label: string;
  width: number;
  height: number;
  category: "iphone" | "ipad";
};

export const IOS_PRESETS: IOSPreset[] = [
  { id: "iphone-6-9", label: "iPhone 6.9\" (1320×2868)", width: 1320, height: 2868, category: "iphone" },
  {
    id: "iphone-6-5",
    label: `iPhone 6.5" (${DEFAULT_SCREENSHOT_WIDTH}×${DEFAULT_SCREENSHOT_HEIGHT})`,
    width: DEFAULT_SCREENSHOT_WIDTH,
    height: DEFAULT_SCREENSHOT_HEIGHT,
    category: "iphone",
  },
  { id: "iphone-6-5-legacy", label: "iPhone 6.5\" Legacy (1242×2688)", width: 1242, height: 2688, category: "iphone" },
  { id: "iphone-6-3", label: "iPhone 6.3\" (1206×2622)", width: 1206, height: 2622, category: "iphone" },
  { id: "iphone-6-1", label: "iPhone 6.1\" (1179×2556)", width: 1179, height: 2556, category: "iphone" },
  { id: "iphone-5-5", label: "iPhone 5.5\" (1242×2208)", width: 1242, height: 2208, category: "iphone" },
  { id: "ipad-13", label: "iPad 13\" (2064×2752)", width: 2064, height: 2752, category: "ipad" },
  { id: "ipad-12-9", label: "iPad 12.9\" (2048×2732)", width: 2048, height: 2732, category: "ipad" },
  { id: "ipad-11", label: "iPad 11\" (1668×2388)", width: 1668, height: 2388, category: "ipad" },
];

const PRESET_BY_ID = new Map(IOS_PRESETS.map((preset) => [preset.id, preset]));

export function getPresetById(id: string): IOSPreset | null {
  return PRESET_BY_ID.get(id) ?? null;
}

export function dedupePresetIds(ids: string[]): IOSPreset[] {
  const seen = new Set<string>();
  const result: IOSPreset[] = [];

  for (const id of ids) {
    if (seen.has(id)) {
      continue;
    }
    seen.add(id);

    const preset = getPresetById(id);
    if (preset) {
      result.push(preset);
    }
  }

  return result;
}
