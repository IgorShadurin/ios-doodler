"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Download,
  FolderOutput,
  Languages,
  Loader2,
  Plus,
  Save,
  Sparkles,
  Upload,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import type { TemplateDto, TemplateLabelDto } from "@/lib/contracts";
import { DEFAULT_SCREENSHOT_PRESET_ID } from "@/lib/defaults";
import { IOS_PRESETS } from "@/lib/ios-presets";
import { applyDragDelta, normalizeLabelDraft } from "@/lib/labels";

const SAMPLE_TRANSLATION_JSON = JSON.stringify(
  {
    en: {
      title: "Your key message",
      subtitle: "Fast, polished, localized",
    },
    es: {
      title: "Tu mensaje principal",
      subtitle: "Rapido, elegante y localizado",
    },
  },
  null,
  2,
);

type Notice = {
  kind: "success" | "error";
  text: string;
};

type DragState = {
  labelId: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type TemplateListResponse = {
  items: TemplateDto[];
};

type TemplateWithUpdateResponse = {
  updatedCount: number;
  template: TemplateDto | null;
};

function nextLabelKey(existing: TemplateLabelDto[]): string {
  const existingKeys = new Set(existing.map((item) => item.key));
  let index = existing.length + 1;
  while (existingKeys.has(`label_${index}`)) {
    index += 1;
  }
  return `label_${index}`;
}

function isTemplateListResponse(payload: unknown): payload is TemplateListResponse {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return Array.isArray((payload as { items?: unknown }).items);
}

function isTemplateDto(payload: unknown): payload is TemplateDto {
  if (!payload || typeof payload !== "object") {
    return false;
  }
  return typeof (payload as { id?: unknown }).id === "string";
}

export function DoodlerStudio() {
  const previewRef = useRef<HTMLDivElement | null>(null);

  const [templates, setTemplates] = useState<TemplateDto[]>([]);
  const [activeTemplate, setActiveTemplate] = useState<TemplateDto | null>(null);
  const [draftLabels, setDraftLabels] = useState<TemplateLabelDto[]>([]);
  const [selectedLabelId, setSelectedLabelId] = useState<string | null>(null);
  const [selectedPreviewLanguage, setSelectedPreviewLanguage] = useState<string>("");
  const [selectedPresetIds, setSelectedPresetIds] = useState<string[]>([DEFAULT_SCREENSHOT_PRESET_ID]);
  const [selectedTemplateIds, setSelectedTemplateIds] = useState<string[]>([]);
  const [selectedLanguageCodes, setSelectedLanguageCodes] = useState<string[]>([]);
  const [allLanguages, setAllLanguages] = useState<boolean>(true);
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [createLoading, setCreateLoading] = useState(false);
  const [labelsLoading, setLabelsLoading] = useState(false);
  const [translationsLoading, setTranslationsLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [saveToDirLoading, setSaveToDirLoading] = useState(false);

  const [templateName, setTemplateName] = useState("");
  const [templateDescription, setTemplateDescription] = useState("");
  const [templateImageFile, setTemplateImageFile] = useState<File | null>(null);
  const [translationsJson, setTranslationsJson] = useState(SAMPLE_TRANSLATION_JSON);
  const [outputDir, setOutputDir] = useState("generated-output");
  const [notice, setNotice] = useState<Notice | null>(null);

  const selectedLabel = useMemo(
    () => draftLabels.find((item) => item.id === selectedLabelId) ?? null,
    [draftLabels, selectedLabelId],
  );

  const previewEntries = useMemo(() => {
    if (!activeTemplate || !selectedPreviewLanguage) {
      return {};
    }

    return activeTemplate.translations.find((item) => item.languageCode === selectedPreviewLanguage)?.entries ?? {};
  }, [activeTemplate, selectedPreviewLanguage]);

  const updateTemplatesList = useCallback((nextTemplate: TemplateDto) => {
    setTemplates((prev) => {
      const exists = prev.some((item) => item.id === nextTemplate.id);
      if (!exists) {
        return [nextTemplate, ...prev];
      }

      return prev.map((item) => (item.id === nextTemplate.id ? nextTemplate : item));
    });

    setSelectedTemplateIds((prev) => (prev.includes(nextTemplate.id) ? prev : [...prev, nextTemplate.id]));
  }, []);

  const loadTemplate = useCallback(async (templateId: string) => {
    const response = await fetch(`/api/templates/${templateId}`, { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load template details.");
    }

    const payload = (await response.json()) as unknown;
    if (!isTemplateDto(payload)) {
      throw new Error("Invalid template payload.");
    }

    setActiveTemplate(payload);
    setDraftLabels(payload.labels);
    setSelectedLabelId(payload.labels[0]?.id ?? null);

    const firstLanguage = payload.translations[0]?.languageCode ?? "";
    setSelectedPreviewLanguage(firstLanguage);
    setSelectedLanguageCodes(payload.translations.map((item) => item.languageCode));
  }, []);

  const loadTemplates = useCallback(async () => {
    const response = await fetch("/api/templates", { cache: "no-store" });
    if (!response.ok) {
      throw new Error("Failed to load templates.");
    }

    const payload = (await response.json()) as unknown;
    if (!isTemplateListResponse(payload)) {
      throw new Error("Invalid templates payload.");
    }

    setTemplates(payload.items);
    setSelectedTemplateIds((prev) => {
      if (prev.length > 0) {
        return prev.filter((id) => payload.items.some((item) => item.id === id));
      }
      return payload.items.map((item) => item.id);
    });
    if (!activeTemplate && payload.items.length > 0) {
      await loadTemplate(payload.items[0]!.id);
    }
  }, [activeTemplate, loadTemplate]);

  useEffect(() => {
    loadTemplates().catch((error) => {
      const message = error instanceof Error ? error.message : "Unable to load templates.";
      setNotice({ kind: "error", text: message });
    });
  }, [loadTemplates]);

  useEffect(() => {
    const node = previewRef.current;
    if (!node) {
      return;
    }

    const observer = new ResizeObserver(() => {
      setPreviewSize({
        width: Math.max(1, node.clientWidth),
        height: Math.max(1, node.clientHeight),
      });
    });

    observer.observe(node);
    setPreviewSize({
      width: Math.max(1, node.clientWidth),
      height: Math.max(1, node.clientHeight),
    });

    return () => observer.disconnect();
  }, [activeTemplate]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      const next = applyDragDelta(
        { x: dragState.originX, y: dragState.originY },
        {
          deltaX: event.clientX - dragState.startX,
          deltaY: event.clientY - dragState.startY,
          canvasWidth: previewSize.width,
          canvasHeight: previewSize.height,
        },
      );

      setDraftLabels((prev) =>
        prev.map((item) => {
          if (item.id !== dragState.labelId) {
            return item;
          }

          return {
            ...item,
            x: next.x,
            y: next.y,
          };
        }),
      );
    };

    const stopDrag = () => setDragState(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDrag);
    };
  }, [dragState, previewSize.height, previewSize.width]);

  const handleCreateTemplate = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!templateImageFile) {
      setNotice({ kind: "error", text: "Select an image first." });
      return;
    }

    setCreateLoading(true);
    setNotice(null);

    try {
      const formData = new FormData();
      formData.set("name", templateName);
      formData.set("description", templateDescription);
      formData.set("image", templateImageFile);

      const response = await fetch("/api/templates", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const failed = (await response.json()) as { error?: string };
        throw new Error(failed.error ?? "Unable to create template.");
      }

      const payload = (await response.json()) as unknown;
      if (!isTemplateDto(payload)) {
        throw new Error("Invalid create template response.");
      }

      setTemplateName("");
      setTemplateDescription("");
      setTemplateImageFile(null);
      updateTemplatesList(payload);
      await loadTemplate(payload.id);
      setNotice({ kind: "success", text: "Template uploaded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to create template.";
      setNotice({ kind: "error", text: message });
    } finally {
      setCreateLoading(false);
    }
  };

  const addLabel = () => {
    if (!activeTemplate) {
      return;
    }

    const created = normalizeLabelDraft({
      key: nextLabelKey(draftLabels),
      x: 0.1,
      y: 0.15,
      width: 0.8,
      fontSize: 0.05,
      fontWeight: 700,
      color: "#ffffff",
      align: "center",
      maxLines: 2,
    });

    const next: TemplateLabelDto = {
      ...created,
      id: `local-${crypto.randomUUID()}`,
    };

    setDraftLabels((prev) => [...prev, next]);
    setSelectedLabelId(next.id);
  };

  const updateSelectedLabel = (partial: Partial<TemplateLabelDto>) => {
    if (!selectedLabelId) {
      return;
    }

    setDraftLabels((prev) =>
      prev.map((item) => {
        if (item.id !== selectedLabelId) {
          return item;
        }

        return {
          ...item,
          ...partial,
        };
      }),
    );
  };

  const saveLabels = async () => {
    if (!activeTemplate) {
      return;
    }

    setLabelsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/templates/${activeTemplate.id}/labels`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ labels: draftLabels }),
      });

      if (!response.ok) {
        const failed = (await response.json()) as { error?: string };
        throw new Error(failed.error ?? "Unable to save labels.");
      }

      const payload = (await response.json()) as unknown;
      if (!isTemplateDto(payload)) {
        throw new Error("Invalid labels response.");
      }

      setActiveTemplate(payload);
      setDraftLabels(payload.labels);
      setSelectedLabelId(payload.labels[0]?.id ?? null);
      updateTemplatesList(payload);
      setNotice({ kind: "success", text: "Labels saved." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save labels.";
      setNotice({ kind: "error", text: message });
    } finally {
      setLabelsLoading(false);
    }
  };

  const importTranslations = async () => {
    if (!activeTemplate) {
      return;
    }

    setTranslationsLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/templates/${activeTemplate.id}/translations`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ json: translationsJson }),
      });

      if (!response.ok) {
        const failed = (await response.json()) as { error?: string };
        throw new Error(failed.error ?? "Unable to import translations.");
      }

      const payload = (await response.json()) as unknown;
      if (!payload || typeof payload !== "object") {
        throw new Error("Invalid translations response.");
      }

      const typed = payload as TemplateWithUpdateResponse;
      if (!typed.template) {
        throw new Error("Template update response is empty.");
      }

      setActiveTemplate(typed.template);
      setSelectedPreviewLanguage(typed.template.translations[0]?.languageCode ?? "");
      setSelectedLanguageCodes(typed.template.translations.map((item) => item.languageCode));
      updateTemplatesList(typed.template);
      setNotice({ kind: "success", text: `Imported ${typed.updatedCount} language entries.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to import translations.";
      setNotice({ kind: "error", text: message });
    } finally {
      setTranslationsLoading(false);
    }
  };

  const togglePreset = (presetId: string, checked: boolean) => {
    setSelectedPresetIds((prev) => {
      if (checked) {
        return prev.includes(presetId) ? prev : [...prev, presetId];
      }
      return prev.filter((item) => item !== presetId);
    });
  };

  const toggleLanguage = (languageCode: string, checked: boolean) => {
    setSelectedLanguageCodes((prev) => {
      if (checked) {
        return prev.includes(languageCode) ? prev : [...prev, languageCode];
      }
      return prev.filter((item) => item !== languageCode);
    });
  };

  const toggleTemplate = (templateId: string, checked: boolean) => {
    setSelectedTemplateIds((prev) => {
      if (checked) {
        return prev.includes(templateId) ? prev : [...prev, templateId];
      }
      return prev.filter((item) => item !== templateId);
    });
  };

  const generateScreenshots = async () => {
    if (!activeTemplate) {
      return;
    }

    setGenerateLoading(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/templates/${activeTemplate.id}/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          presetIds: selectedPresetIds,
          allLanguages,
          languageCodes: selectedLanguageCodes,
        }),
      });

      if (!response.ok) {
        const failed = (await response.json()) as { error?: string };
        throw new Error(failed.error ?? "Generation failed.");
      }

      const blob = await response.blob();
      const href = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = href;
      anchor.download = `${activeTemplate.name.replace(/\s+/g, "-").toLowerCase()}-screenshots.zip`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(href);

      setNotice({ kind: "success", text: "ZIP generated and downloaded." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Generation failed.";
      setNotice({ kind: "error", text: message });
    } finally {
      setGenerateLoading(false);
    }
  };

  const generateToDirectory = async () => {
    if (selectedTemplateIds.length < 1) {
      setNotice({ kind: "error", text: "Select at least one template." });
      return;
    }

    setSaveToDirLoading(true);
    setNotice(null);

    try {
      const response = await fetch("/api/generate/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          templateIds: selectedTemplateIds,
          allTemplates: selectedTemplateIds.length === templates.length && templates.length > 0,
          presetIds: selectedPresetIds,
          allLanguages,
          languageCodes: selectedLanguageCodes,
          outputDir,
        }),
      });

      if (!response.ok) {
        const failed = (await response.json()) as { error?: string };
        throw new Error(failed.error ?? "Directory generation failed.");
      }

      const payload = (await response.json()) as {
        outputDir: string;
        writtenCount: number;
      };

      setNotice({
        kind: "success",
        text: `Saved ${payload.writtenCount} images to ${payload.outputDir} grouped by language.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Directory generation failed.";
      setNotice({ kind: "error", text: message });
    } finally {
      setSaveToDirLoading(false);
    }
  };

  return (
    <div className="voiceink-soft-bg min-h-screen text-slate-900">
      <div className="mx-auto w-full max-w-[1520px] px-4 py-6 md:px-8 md:py-10">
        <header className="mb-6 flex flex-col gap-3 rounded-2xl border border-sky-200/80 bg-white/80 shadow-sm p-5 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-sky-700">Open iOS Doodler</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-900">Localized App Store Screenshot Studio</h1>
            <p className="mt-2 max-w-3xl text-sm text-slate-600">
              Upload one or many templates, place labels once per template, preview any language, and generate grouped outputs for all selected templates.
            </p>
          </div>
        </header>

        {notice && (
          <Alert className={notice.kind === "error" ? "mb-6 border-red-300 bg-red-50 text-red-700" : "mb-6 border-emerald-300 bg-emerald-50 text-emerald-700"}>
            <Sparkles className="h-4 w-4" />
            <AlertTitle>{notice.kind === "error" ? "Action failed" : "Action complete"}</AlertTitle>
            <AlertDescription>{notice.text}</AlertDescription>
          </Alert>
        )}

        <div className="grid gap-6 lg:grid-cols-[360px_1fr]">
          <div className="space-y-6">
            <Card className="border-slate-200 bg-white/90 text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Upload Template</CardTitle>
                <CardDescription className="text-slate-600">PNG/JPG screenshot foundation used for all generated variants.</CardDescription>
              </CardHeader>
              <CardContent>
                <form className="space-y-4" onSubmit={handleCreateTemplate}>
                  <div className="space-y-2">
                    <Label htmlFor="templateName">Template name</Label>
                    <Input
                      id="templateName"
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      placeholder="Main Feature Slide"
                      required
                      className="border-slate-300 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="templateDescription">Description</Label>
                    <Input
                      id="templateDescription"
                      value={templateDescription}
                      onChange={(event) => setTemplateDescription(event.target.value)}
                      placeholder="Optional"
                      className="border-slate-300 bg-white"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="templateImage">Template image</Label>
                    <Input
                      id="templateImage"
                      type="file"
                      accept="image/*"
                      onChange={(event) => setTemplateImageFile(event.target.files?.[0] ?? null)}
                      className="border-slate-300 bg-white"
                      required
                    />
                  </div>
                  <Button type="submit" className="w-full" disabled={createLoading}>
                    {createLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                    Upload
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card className="border-slate-200 bg-white/90 text-slate-900 shadow-sm">
              <CardHeader>
                <CardTitle className="text-lg">Templates</CardTitle>
                <CardDescription className="text-slate-600">Pick a template to edit labels and generate outputs.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {templates.length < 1 ? (
                  <p className="text-sm text-slate-500">No templates uploaded yet.</p>
                ) : (
                  <>
                    <label className="mb-2 flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
                      <Checkbox
                        checked={templates.length > 0 && selectedTemplateIds.length === templates.length}
                        onCheckedChange={(checked) => {
                          setSelectedTemplateIds(checked === true ? templates.map((item) => item.id) : []);
                        }}
                      />
                      <span>Select all templates for batch output</span>
                    </label>
                    {templates.map((template) => (
                      <div
                        key={template.id}
                        className={`w-full rounded-lg border px-3 py-3 transition ${
                          activeTemplate?.id === template.id
                            ? "border-sky-400 bg-sky-50"
                            : "border-slate-200 bg-white hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-start gap-2">
                          <Checkbox
                            checked={selectedTemplateIds.includes(template.id)}
                            onCheckedChange={(checked) => toggleTemplate(template.id, checked === true)}
                          />
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => {
                              loadTemplate(template.id).catch((error) => {
                                const message = error instanceof Error ? error.message : "Unable to open template.";
                                setNotice({ kind: "error", text: message });
                              });
                            }}
                          >
                            <p className="truncate text-sm font-medium text-slate-900">{template.name}</p>
                            <p className="mt-1 text-xs text-slate-500">
                              {template.sourceWidth}x{template.sourceHeight} - {template.translations.length} langs - {template.labels.length} labels
                            </p>
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            {!activeTemplate ? (
              <Card className="border-slate-200 bg-white/90 text-slate-900 shadow-sm">
                <CardHeader>
                  <CardTitle>Start by uploading your first template</CardTitle>
                  <CardDescription className="text-slate-600">After upload, you can place labels, import language JSON, and generate screenshot packs.</CardDescription>
                </CardHeader>
              </Card>
            ) : (
              <>
                <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
                  <Card className="border-slate-200 bg-white/90 text-slate-900 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center justify-between gap-3 text-lg">
                        <span>Screenshot Editor</span>
                        <div className="flex items-center gap-2">
                          <Button variant="secondary" size="sm" onClick={addLabel}>
                            <Plus className="mr-2 h-4 w-4" />
                            Add Label
                          </Button>
                          <Button size="sm" onClick={saveLabels} disabled={labelsLoading}>
                            {labelsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            Save Labels
                          </Button>
                        </div>
                      </CardTitle>
                      <CardDescription className="text-slate-600">Drag labels directly on the screenshot to position text areas.</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="mb-3 flex items-center justify-between gap-4">
                        <p className="rounded-md border border-slate-200 bg-white hover:bg-slate-50 px-2 py-1 text-xs text-slate-600">
                          {activeTemplate.sourceWidth}x{activeTemplate.sourceHeight}
                        </p>
                        <Select value={selectedPreviewLanguage || undefined} onValueChange={setSelectedPreviewLanguage}>
                          <SelectTrigger className="w-56 border-slate-300 bg-white">
                            <SelectValue placeholder="Preview language" />
                          </SelectTrigger>
                          <SelectContent>
                            {activeTemplate.translations.length < 1 ? (
                              <SelectItem value="__none" disabled>No languages imported</SelectItem>
                            ) : (
                              activeTemplate.translations.map((item) => (
                                <SelectItem key={item.id} value={item.languageCode}>{item.languageCode}</SelectItem>
                              ))
                            )}
                          </SelectContent>
                        </Select>
                      </div>

                      <div
                        ref={previewRef}
                        className="relative mx-auto w-full max-w-[420px] overflow-hidden rounded-2xl border border-slate-300 bg-white shadow-xl"
                        style={{ aspectRatio: `${activeTemplate.sourceWidth} / ${activeTemplate.sourceHeight}` }}
                      >
                        <Image
                          src={activeTemplate.sourceImagePath}
                          alt={activeTemplate.name}
                          fill
                          className="object-cover"
                          sizes="420px"
                        />
                        <div className="absolute inset-0">
                          {draftLabels.map((label) => {
                            const fontSizePx = Math.max(10, label.fontSize * previewSize.height);
                            return (
                              <div
                                key={label.id}
                                role="button"
                                tabIndex={0}
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  setSelectedLabelId(label.id);
                                  setDragState({
                                    labelId: label.id,
                                    startX: event.clientX,
                                    startY: event.clientY,
                                    originX: label.x,
                                    originY: label.y,
                                  });
                                }}
                                onKeyDown={(event) => {
                                  if (event.key === "Enter") {
                                    setSelectedLabelId(label.id);
                                  }
                                }}
                                className={`absolute cursor-move rounded-md border border-dashed px-2 py-1 shadow-none ${
                                  selectedLabelId === label.id
                                    ? "border-sky-500 bg-transparent ring-2 ring-sky-200/80"
                                    : "border-sky-300/80 bg-transparent"
                                }`}
                                style={{
                                  left: `${label.x * 100}%`,
                                  top: `${label.y * 100}%`,
                                  width: `${label.width * 100}%`,
                                  color: label.color,
                                  fontWeight: label.fontWeight,
                                  fontSize: `${fontSizePx}px`,
                                  lineHeight: 1.15,
                                  textAlign: label.align,
                                }}
                              >
                                {previewEntries[label.key] ?? `[${label.key}]`}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 bg-white/90 text-slate-900 shadow-sm">
                    <CardHeader>
                      <CardTitle className="text-lg">Label Controls</CardTitle>
                      <CardDescription className="text-slate-600">Fine tune key, size, weight, color, and alignment.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {draftLabels.length < 1 ? (
                        <p className="text-sm text-slate-500">No labels yet. Add one to begin.</p>
                      ) : (
                        <>
                          <div className="space-y-2">
                            <Label>Select label</Label>
                            <Select value={selectedLabelId ?? undefined} onValueChange={setSelectedLabelId}>
                              <SelectTrigger className="border-slate-300 bg-white">
                                <SelectValue placeholder="Choose label" />
                              </SelectTrigger>
                              <SelectContent>
                                {draftLabels.map((label) => (
                                  <SelectItem key={label.id} value={label.id}>{label.key}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>

                          {selectedLabel && (
                            <>
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label>Key</Label>
                                  <Input
                                    value={selectedLabel.key}
                                    onChange={(event) => updateSelectedLabel({ key: event.target.value })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Color</Label>
                                  <Input
                                    value={selectedLabel.color}
                                    onChange={(event) => updateSelectedLabel({ color: event.target.value })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label>X</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    value={selectedLabel.x}
                                    onChange={(event) => updateSelectedLabel({ x: Number(event.target.value) })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Y</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0"
                                    max="1"
                                    value={selectedLabel.y}
                                    onChange={(event) => updateSelectedLabel({ y: Number(event.target.value) })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label>Width</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    min="0.05"
                                    max="1"
                                    value={selectedLabel.width}
                                    onChange={(event) => updateSelectedLabel({ width: Number(event.target.value) })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Font size</Label>
                                  <Input
                                    type="number"
                                    step="0.005"
                                    min="0.01"
                                    max="0.2"
                                    value={selectedLabel.fontSize}
                                    onChange={(event) => updateSelectedLabel({ fontSize: Number(event.target.value) })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-2">
                                  <Label>Weight</Label>
                                  <Input
                                    type="number"
                                    step="100"
                                    min="300"
                                    max="900"
                                    value={selectedLabel.fontWeight}
                                    onChange={(event) => updateSelectedLabel({ fontWeight: Number(event.target.value) })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label>Max lines</Label>
                                  <Input
                                    type="number"
                                    step="1"
                                    min="1"
                                    max="6"
                                    value={selectedLabel.maxLines}
                                    onChange={(event) => updateSelectedLabel({ maxLines: Number(event.target.value) })}
                                    className="border-slate-300 bg-white"
                                  />
                                </div>
                              </div>

                              <div className="space-y-2">
                                <Label>Align</Label>
                                <Select
                                  value={selectedLabel.align}
                                  onValueChange={(value) => updateSelectedLabel({ align: value as TemplateLabelDto["align"] })}
                                >
                                  <SelectTrigger className="border-slate-300 bg-white">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="left">left</SelectItem>
                                    <SelectItem value="center">center</SelectItem>
                                    <SelectItem value="right">right</SelectItem>
                                  </SelectContent>
                                </Select>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <div className="grid gap-6 xl:grid-cols-2">
                  <Card className="border-slate-200 bg-white/90 text-slate-900 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Languages className="h-4 w-4" />
                        Translation JSON
                      </CardTitle>
                      <CardDescription className="text-slate-600">Format: {`{"en":{"title":"..."},"fr":{"title":"..."}}`}</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <Textarea
                        value={translationsJson}
                        onChange={(event) => setTranslationsJson(event.target.value)}
                        className="min-h-[260px] border-slate-300 bg-white font-mono text-xs"
                      />
                      <Button onClick={importTranslations} disabled={translationsLoading}>
                        {translationsLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                        Import / Update Languages
                      </Button>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200 bg-white/90 text-slate-900 shadow-sm">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <Download className="h-4 w-4" />
                        Generate Screenshots
                      </CardTitle>
                      <CardDescription className="text-slate-600">Choose templates, sizes, and languages. Save outputs grouped by language folder.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="space-y-2">
                        <Label>Selected templates for batch generation</Label>
                        <div className="rounded border border-slate-200 bg-slate-50 p-2 text-xs text-slate-600">
                          {selectedTemplateIds.length} of {templates.length} templates selected
                        </div>
                      </div>

                      <div>
                        <Label className="mb-2 block">iOS size presets</Label>
                        <div className="grid gap-2 md:grid-cols-2">
                          {IOS_PRESETS.map((preset) => (
                            <label key={preset.id} className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                              <Checkbox
                                checked={selectedPresetIds.includes(preset.id)}
                                onCheckedChange={(checked) => togglePreset(preset.id, checked === true)}
                              />
                              <span>{preset.label}</span>
                            </label>
                          ))}
                        </div>
                      </div>

                      <Separator className="bg-slate-200" />

                      <div className="space-y-2">
                        <label className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-sm">
                          <Checkbox checked={allLanguages} onCheckedChange={(checked) => setAllLanguages(checked === true)} />
                          <span>Generate all imported languages</span>
                        </label>
                        {!allLanguages && (
                          <div className="grid gap-2 md:grid-cols-2">
                            {activeTemplate.translations.map((item) => (
                              <label key={item.id} className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 bg-slate-50 p-2 text-xs">
                                <Checkbox
                                  checked={selectedLanguageCodes.includes(item.languageCode)}
                                  onCheckedChange={(checked) => toggleLanguage(item.languageCode, checked === true)}
                                />
                                <span>{item.languageCode}</span>
                              </label>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="outputDir">Target output directory (server/local path)</Label>
                        <Input
                          id="outputDir"
                          value={outputDir}
                          onChange={(event) => setOutputDir(event.target.value)}
                          placeholder="/Users/test/output-screenshots"
                          className="border-slate-300 bg-white font-mono text-xs"
                        />
                      </div>

                      <Button onClick={generateToDirectory} disabled={saveToDirLoading} className="w-full">
                        {saveToDirLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FolderOutput className="mr-2 h-4 w-4" />}
                        Generate And Save Grouped By Language
                      </Button>

                      <Button onClick={generateScreenshots} disabled={generateLoading} className="w-full" variant="secondary">
                        {generateLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
                        Generate ZIP For Active Template
                      </Button>
                    </CardContent>
                  </Card>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
