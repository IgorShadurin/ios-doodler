"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  FolderOpen,
  Images,
  Loader2,
  Maximize2,
  RefreshCw,
  Search,
} from "lucide-react";
import { toast } from "sonner";

import { STUDIO_LANGUAGES } from "@/features/app-doodler/languages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

const EXPECTED_SCREENSHOT_SIZES = new Set(["1284x2778", "2778x1284"]);
const MAX_DIRECTORY_DEPTH = 3;

type LocaleMeta = {
  code: string;
  name: string;
  flag: string;
};

type PreviewImageSource = {
  id: string;
  fileName: string;
  relativePath: string;
  fileHandle: any;
};

type LocalePreviewGroup = {
  localeCode: string;
  localeName: string;
  localeFlag: string;
  images: PreviewImageSource[];
};

type LoadedPreviewImage = PreviewImageSource & {
  objectUrl: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

type DirectoryPickerWindow = Window & {
  showDirectoryPicker?: (options?: {
    mode?: "read" | "readwrite";
    startIn?: "desktop" | "documents" | "downloads" | "music" | "pictures" | "videos";
    id?: string;
  }) => Promise<any>;
};

const localeMetaByCode = new Map<string, LocaleMeta>(
  STUDIO_LANGUAGES.map((language) => [
    language.code,
    {
      code: language.code,
      name: language.name,
      flag: language.flag,
    },
  ]),
);

const localeSortOrder = new Map<string, number>(
  STUDIO_LANGUAGES.map((language, index) => [language.code, index]),
);

function isSupportedImageFile(fileName: string): boolean {
  return /\.(png|jpe?g|webp)$/i.test(fileName);
}

function sortImageSources(a: PreviewImageSource, b: PreviewImageSource): number {
  return a.fileName.localeCompare(b.fileName, undefined, {
    numeric: true,
    sensitivity: "base",
  });
}

function resolveLocaleMeta(localeCode: string): LocaleMeta {
  return localeMetaByCode.get(localeCode) ?? {
    code: localeCode,
    name: localeCode,
    flag: "🏳️",
  };
}

function formatBytes(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function isExpectedScreenshotSize(width: number | null, height: number | null): boolean {
  if (!width || !height) return false;
  return EXPECTED_SCREENSHOT_SIZES.has(`${width}x${height}`);
}

async function readImageSize(file: File): Promise<{ width: number; height: number } | null> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      const result = {
        width: bitmap.width,
        height: bitmap.height,
      };
      bitmap.close();
      return result;
    } catch {
      return null;
    }
  }

  return new Promise((resolve) => {
    const previewUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onload = () => {
      resolve({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      URL.revokeObjectURL(previewUrl);
    };
    image.onerror = () => {
      resolve(null);
      URL.revokeObjectURL(previewUrl);
    };
    image.src = previewUrl;
  });
}

async function collectImageSources(
  directoryHandle: any,
  currentPath = "",
  depth = 0,
): Promise<PreviewImageSource[]> {
  if (!directoryHandle || directoryHandle.kind !== "directory") return [];
  if (depth > MAX_DIRECTORY_DEPTH) return [];

  const entries: PreviewImageSource[] = [];
  for await (const [entryName, entryHandle] of directoryHandle.entries() as AsyncIterable<[string, any]>) {
    if (entryHandle?.kind === "file") {
      if (!isSupportedImageFile(entryName)) continue;
      const relativePath = currentPath ? `${currentPath}/${entryName}` : entryName;
      entries.push({
        id: relativePath,
        fileName: entryName,
        relativePath,
        fileHandle: entryHandle,
      });
      continue;
    }

    if (entryHandle?.kind === "directory") {
      const nestedPath = currentPath ? `${currentPath}/${entryName}` : entryName;
      const nestedSources = await collectImageSources(entryHandle, nestedPath, depth + 1);
      entries.push(...nestedSources);
    }
  }

  return entries.sort(sortImageSources);
}

async function readLocaleGroupsFromDirectory(rootDirectoryHandle: any): Promise<LocalePreviewGroup[]> {
  const localeGroups: LocalePreviewGroup[] = [];

  for await (const [entryName, entryHandle] of rootDirectoryHandle.entries() as AsyncIterable<[string, any]>) {
    if (!entryHandle || entryHandle.kind !== "directory") continue;
    const localeCode = entryName.trim();
    if (!localeCode) continue;

    const images = await collectImageSources(entryHandle);
    if (images.length === 0) continue;

    const localeMeta = resolveLocaleMeta(localeCode);
    localeGroups.push({
      localeCode,
      localeName: localeMeta.name,
      localeFlag: localeMeta.flag,
      images,
    });
  }

  if (localeGroups.length === 0) {
    const fallbackImages = await collectImageSources(rootDirectoryHandle);
    if (fallbackImages.length > 0) {
      localeGroups.push({
        localeCode: "root",
        localeName: "Root Folder",
        localeFlag: "📁",
        images: fallbackImages,
      });
    }
  }

  return localeGroups.sort((left, right) => {
    const leftOrder = localeSortOrder.get(left.localeCode) ?? Number.POSITIVE_INFINITY;
    const rightOrder = localeSortOrder.get(right.localeCode) ?? Number.POSITIVE_INFINITY;
    if (leftOrder !== rightOrder) return leftOrder - rightOrder;
    return left.localeName.localeCompare(right.localeName, "en", { sensitivity: "base" });
  });
}

function revokeImageObjectUrls(images: LoadedPreviewImage[]) {
  for (const image of images) {
    if (!image.objectUrl) continue;
    URL.revokeObjectURL(image.objectUrl);
  }
}

export function PreviewImagesRoute() {
  const [directoryName, setDirectoryName] = useState<string | null>(null);
  const [localeGroups, setLocaleGroups] = useState<LocalePreviewGroup[]>([]);
  const [selectedLocaleCode, setSelectedLocaleCode] = useState<string | null>(null);
  const [previewImages, setPreviewImages] = useState<LoadedPreviewImage[]>([]);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [localeFilter, setLocaleFilter] = useState("");
  const [isReadingDirectory, setIsReadingDirectory] = useState(false);
  const [isLoadingLocaleImages, setIsLoadingLocaleImages] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const directoryHandleRef = useRef<any>(null);

  const filteredGroups = useMemo(() => {
    const query = localeFilter.trim().toLowerCase();
    if (!query) return localeGroups;
    return localeGroups.filter((group) => (
      group.localeCode.toLowerCase().includes(query)
      || group.localeName.toLowerCase().includes(query)
    ));
  }, [localeFilter, localeGroups]);

  const activeGroup = useMemo(() => {
    if (filteredGroups.length === 0) return null;
    const bySelection = selectedLocaleCode
      ? filteredGroups.find((group) => group.localeCode === selectedLocaleCode) ?? null
      : null;
    return bySelection ?? filteredGroups[0];
  }, [filteredGroups, selectedLocaleCode]);

  const totalImageCount = useMemo(
    () => localeGroups.reduce((sum, group) => sum + group.images.length, 0),
    [localeGroups],
  );

  const selectedImage = useMemo(
    () => previewImages.find((image) => image.id === selectedImageId) ?? null,
    [previewImages, selectedImageId],
  );

  const loadDirectory = useCallback(async (directoryHandle: any) => {
    setIsReadingDirectory(true);
    setErrorMessage(null);

    try {
      const nextGroups = await readLocaleGroupsFromDirectory(directoryHandle);
      setLocaleGroups(nextGroups);
      setSelectedLocaleCode((current) => {
        if (!current) return nextGroups[0]?.localeCode ?? null;
        return nextGroups.some((group) => group.localeCode === current)
          ? current
          : nextGroups[0]?.localeCode ?? null;
      });
      setDirectoryName(directoryHandle?.name ?? "Selected folder");

      if (nextGroups.length === 0) {
        toast.warning("No image files found in the selected folder.");
      } else {
        const loadedImageCount = nextGroups.reduce((sum, group) => sum + group.images.length, 0);
        toast.success(
          `Loaded ${nextGroups.length} language group${nextGroups.length === 1 ? "" : "s"} with ${loadedImageCount} image${loadedImageCount === 1 ? "" : "s"}.`,
        );
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read selected directory.";
      setErrorMessage(message);
      toast.error(message);
    } finally {
      setIsReadingDirectory(false);
    }
  }, []);

  const handlePickDirectory = useCallback(async () => {
    const pickerWindow = window as DirectoryPickerWindow;
    if (!pickerWindow.showDirectoryPicker) {
      toast.error("This browser does not support folder access. Use Chrome-based browser.");
      return;
    }

    try {
      const pickedHandle = await pickerWindow.showDirectoryPicker({
        mode: "read",
        startIn: "downloads",
        id: "app-doodler-preview-images",
      });
      directoryHandleRef.current = pickedHandle;
      await loadDirectory(pickedHandle);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        toast.message("Folder selection cancelled.");
        return;
      }
      const message = error instanceof Error ? error.message : "Failed to open folder picker.";
      toast.error(message);
    }
  }, [loadDirectory]);

  const handleReload = useCallback(async () => {
    const currentDirectoryHandle = directoryHandleRef.current;
    if (!currentDirectoryHandle) {
      toast.message("Choose a folder first.");
      return;
    }
    await loadDirectory(currentDirectoryHandle);
  }, [loadDirectory]);

  useEffect(() => {
    let isCancelled = false;

    async function loadActiveGroupImages() {
      setSelectedImageId(null);
      if (!activeGroup) {
        setPreviewImages([]);
        return;
      }

      setIsLoadingLocaleImages(true);
      setErrorMessage(null);

      try {
        const nextPreviewImages = await Promise.all(activeGroup.images.map(async (imageSource) => {
          const file = await imageSource.fileHandle.getFile();
          const dimensions = await readImageSize(file);
          return {
            ...imageSource,
            objectUrl: URL.createObjectURL(file),
            sizeBytes: file.size,
            width: dimensions?.width ?? null,
            height: dimensions?.height ?? null,
          } satisfies LoadedPreviewImage;
        }));

        if (isCancelled) {
          revokeImageObjectUrls(nextPreviewImages);
          return;
        }

        setPreviewImages(nextPreviewImages);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load preview images.";
        if (!isCancelled) {
          setPreviewImages([]);
          setErrorMessage(message);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingLocaleImages(false);
        }
      }
    }

    void loadActiveGroupImages();
    return () => {
      isCancelled = true;
    };
  }, [activeGroup]);

  useEffect(() => {
    return () => {
      revokeImageObjectUrls(previewImages);
    };
  }, [previewImages]);

  return (
    <div className="relative min-h-screen overflow-x-hidden px-4 py-4 sm:px-6 sm:py-6">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(14,116,144,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(14,116,144,0.05)_1px,transparent_1px)] bg-[size:24px_24px]" />
      <div className="pointer-events-none absolute -top-24 left-1/4 h-80 w-80 rounded-full bg-cyan-200/35 blur-3xl" />
      <div className="pointer-events-none absolute bottom-0 right-0 h-[24rem] w-[24rem] rounded-full bg-sky-200/35 blur-3xl" />

      <div className="relative z-10 mx-auto max-w-[1700px] space-y-5">
        <header className="rounded-2xl border border-sky-200/80 bg-white/88 p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="flex items-center gap-3 text-3xl font-semibold tracking-tight text-slate-900">
                <Images className="h-7 w-7 text-sky-700" />
                Preview Generated Images
              </h1>
              <p className="mt-2 text-sm text-slate-600">
                Select an exported folder and review screenshots grouped by language before upload.
              </p>
            </div>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/">
                <ArrowLeft className="h-4 w-4" />
                Back to Doodler
              </Link>
            </Button>
          </div>
        </header>

        <Card className="border-slate-200/80 bg-white/90 shadow-sm">
          <CardContent className="space-y-3 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                type="button"
                className="gap-2"
                onClick={() => { void handlePickDirectory(); }}
                disabled={isReadingDirectory}
              >
                {isReadingDirectory ? <Loader2 className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
                Choose Folder
              </Button>
              <Button
                type="button"
                variant="outline"
                className="gap-2"
                onClick={() => { void handleReload(); }}
                disabled={!directoryHandleRef.current || isReadingDirectory}
              >
                <RefreshCw className={cn("h-4 w-4", isReadingDirectory && "animate-spin")} />
                Reload
              </Button>
              <Badge variant="secondary" className="rounded-md px-2 py-1 text-xs">
                Folder: {directoryName ?? "not selected"}
              </Badge>
              <Badge variant="outline" className="rounded-md px-2 py-1 text-xs">
                Languages: {localeGroups.length}
              </Badge>
              <Badge variant="outline" className="rounded-md px-2 py-1 text-xs">
                Images: {totalImageCount}
              </Badge>
            </div>

            {errorMessage ? (
              <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <div className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
          <Card className="border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Language Groups</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={localeFilter}
                  onChange={(event) => setLocaleFilter(event.target.value)}
                  placeholder="Filter by code or language"
                  className="pl-9"
                />
              </div>

              <ScrollArea className="h-[56vh] pr-2">
                {filteredGroups.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-6 text-center text-sm text-slate-500">
                    No matching language groups.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredGroups.map((group) => {
                      const isActive = activeGroup?.localeCode === group.localeCode;
                      return (
                        <button
                          key={group.localeCode}
                          type="button"
                          onClick={() => setSelectedLocaleCode(group.localeCode)}
                          className={cn(
                            "w-full rounded-xl border px-3 py-2 text-left transition",
                            isActive
                              ? "border-sky-300 bg-sky-50 shadow-sm"
                              : "border-slate-200 bg-white hover:border-sky-200 hover:bg-sky-50/40",
                          )}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-800">
                                {group.localeFlag} {group.localeName}
                              </p>
                              <p className="mt-0.5 text-xs text-slate-500">{group.localeCode}</p>
                            </div>
                            <Badge variant={isActive ? "default" : "outline"} className="rounded-md">
                              {group.images.length}
                            </Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>
            </CardContent>
          </Card>

          <Card className="border-slate-200/80 bg-white/90 shadow-sm">
            <CardHeader className="pb-3">
              <CardTitle className="text-base">
                {activeGroup
                  ? `${activeGroup.localeFlag} ${activeGroup.localeName} (${activeGroup.localeCode})`
                  : "Preview"}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!activeGroup ? (
                <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-16 text-center">
                  <p className="text-sm text-slate-500">
                    Choose a folder and select a language to preview screenshots.
                  </p>
                </div>
              ) : isLoadingLocaleImages ? (
                <div className="flex min-h-[42vh] items-center justify-center rounded-xl border border-slate-200 bg-slate-50">
                  <div className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Loading previews...
                  </div>
                </div>
              ) : (
                <ScrollArea className="h-[68vh] pr-2">
                  <div className="grid gap-3 sm:grid-cols-2 2xl:grid-cols-3">
                    {previewImages.map((image) => {
                      const dimensionLabel = image.width && image.height
                        ? `${image.width}×${image.height}`
                        : "Unknown size";
                      const expected = isExpectedScreenshotSize(image.width, image.height);

                      return (
                        <button
                          key={image.id}
                          type="button"
                          className="group rounded-xl border border-slate-200 bg-white p-2 text-left transition hover:border-sky-300 hover:shadow-sm"
                          onClick={() => setSelectedImageId(image.id)}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <p className="min-w-0 truncate text-xs font-medium text-slate-700" title={image.relativePath}>
                              {image.relativePath}
                            </p>
                            <Maximize2 className="h-4 w-4 shrink-0 text-slate-400 transition group-hover:text-sky-600" />
                          </div>

                          <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-100">
                            <div className="aspect-[1284/2778] w-full">
                              <img
                                src={image.objectUrl}
                                alt={image.fileName}
                                loading="lazy"
                                className="h-full w-full object-contain"
                              />
                            </div>
                          </div>

                          <div className="mt-2 flex flex-wrap items-center gap-1.5">
                            <Badge variant="outline" className="rounded-md">{dimensionLabel}</Badge>
                            <Badge variant={expected ? "secondary" : "destructive"} className="rounded-md">
                              {expected ? "Expected size" : "Size mismatch"}
                            </Badge>
                            <Badge variant="outline" className="rounded-md">{formatBytes(image.sizeBytes)}</Badge>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </ScrollArea>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={Boolean(selectedImage)} onOpenChange={(open) => { if (!open) setSelectedImageId(null); }}>
        <DialogContent className="max-h-[95vh] max-w-[95vw] gap-3 p-4 sm:max-w-[1200px]">
          <DialogHeader>
            <DialogTitle className="truncate text-base">
              {selectedImage?.relativePath ?? "Preview image"}
            </DialogTitle>
            <DialogDescription>
              {selectedImage
                ? `${selectedImage.width ?? "?"}×${selectedImage.height ?? "?"} • ${formatBytes(selectedImage.sizeBytes)}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          {selectedImage ? (
            <div className="max-h-[78vh] overflow-auto rounded-lg border border-slate-200 bg-slate-100 p-2">
              <img
                src={selectedImage.objectUrl}
                alt={selectedImage.fileName}
                className="mx-auto h-auto max-h-[74vh] w-auto"
              />
            </div>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
