<script lang="ts">
  import { onDestroy, onMount } from "svelte";
  import ArrowUpIcon from "@lucide/svelte/icons/arrow-up";
  import BookOpenIcon from "@lucide/svelte/icons/book-open";
  import CameraIcon from "@lucide/svelte/icons/camera";
  import AlertCircleIcon from "@lucide/svelte/icons/alert-circle";
  import ChevronRightIcon from "@lucide/svelte/icons/chevron-right";
  import ChevronDownIcon from "@lucide/svelte/icons/chevron-down";
  import ChevronsUpDownIcon from "@lucide/svelte/icons/chevrons-up-down";
  import FileTextIcon from "@lucide/svelte/icons/file-text";
  import BookTextIcon from "@lucide/svelte/icons/book-text";
  import FileImageIcon from "@lucide/svelte/icons/file-image";
  import FileQuestionIcon from "@lucide/svelte/icons/file-question";
  import FolderIcon from "@lucide/svelte/icons/folder";
  import GlobeIcon from "@lucide/svelte/icons/globe";
  import GraduationCapIcon from "@lucide/svelte/icons/graduation-cap";
  import ImageIcon from "@lucide/svelte/icons/image";
  import LanguagesIcon from "@lucide/svelte/icons/languages";
  import LibraryIcon from "@lucide/svelte/icons/library";
  import LoaderCircleIcon from "@lucide/svelte/icons/loader-circle";
  import MicIcon from "@lucide/svelte/icons/mic";
  import MoreHorizontalIcon from "@lucide/svelte/icons/more-horizontal";
  import PaletteIcon from "@lucide/svelte/icons/palette";
  import PlusIcon from "@lucide/svelte/icons/plus";
  import ScanLineIcon from "@lucide/svelte/icons/scan-line";
  import ShieldAlertIcon from "@lucide/svelte/icons/shield-alert";
  import SquareIcon from "@lucide/svelte/icons/square";
  import TelescopeIcon from "@lucide/svelte/icons/telescope";
  import XIcon from "@lucide/svelte/icons/x";
  import XCircleIcon from "@lucide/svelte/icons/x-circle";
  import { generateId } from "ai";
  import { toast } from "svelte-sonner";

  import type { MentionPayload } from "$lib/context/chat-context.svelte";
  import { useChat, chatUsage } from "$lib/context/chat-context.svelte";
  import { useFileActions, type FileReference } from "$lib/context/file-context.svelte";
  import { useImageCompression } from "$lib/context/image.context.svelte";
  import { UserContext } from "$lib/context/user-context.svelte";
  import { SelectedModel, ResolvedModelHolder } from "$lib/context/sync.svelte";
  import { BUILTIN_PROVIDERS, getModelById } from "$lib/provider/catalog";
  import { compressIfImage as rawCompressIfImage, filenameForMime } from "$lib/compression.utils";
  import type { ModelId } from "$lib/provider/types";
  import type { ModelInfo, Variant } from "$lib/provider/spec";
  import type { AuthUser } from "$lib/types/auth-types";
  import { DESIGNATIONS } from "$lib/types/sms-types";
  import { cn } from "$lib/utils/shadcn";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import * as Popover from "$lib/components/ui/popover";
  import { Separator } from "$lib/components/ui/separator";
  import { Switch } from "$lib/components/ui/switch";
  import * as Tooltip from "$lib/components/ui/tooltip";
  import ContextWarningBanner from "./ContextWarningBanner.svelte";
  import RateLimitBanner from "./RateLimitBanner.svelte";
  import CommandDropdown from "./chat/CommandDropdown.svelte";
  import { type MentionSearchResult } from "./chat/MentionDropdown.svelte";
  import { PromptInput, PromptInputActions, PromptInputTextarea } from "./prompt-kit/prompt-input";

  /**
   * Mention popover state surfaced to the parent so it can render the
   * dropdown OUTSIDE the composer — positioned `absolute bottom-full` of the
   * whole `chat.svelte` wrapper (ActionBar + Composer) so the dropdown
   * auto-shifts up when the ActionBar mounts and isn't clipped by any future
   * `overflow-hidden` re-introduction.
   */
  export interface MentionPopoverState {
    show: boolean;
    query: string;
    designationId: number;
    onSelect: (entity: MentionSearchResult) => void;
    onDismiss: () => void;
    refresh: ((q: string, v: boolean) => void) | null;
  }

  let {
    user,
    readonly,
    isInitial = true,
    mentionProps = $bindable<MentionPopoverState>({
      show: false,
      query: "",
      designationId: 1,
      onSelect: () => {},
      onDismiss: () => {},
      refresh: null,
    }),
  }: {
    user?: AuthUser;
    readonly: boolean;
    isInitial?: boolean;
    mentionProps?: MentionPopoverState;
  } = $props();

  let input = $state("");
  let textareaRef = $state<HTMLTextAreaElement | null>(null);
  let photoFileInput = $state<HTMLInputElement | null>(null);
  let documentFileInput = $state<HTMLInputElement | null>(null);
  // Single local $state mirror of all file references shown as chips
  // in the composer tray. Fed from three sources:
  //   1. file.references (FilesContext — ?refs= from SharedChatView, @file mentions)
  //   2. handleDocumentUpload / handlePhotoUpload (upload success)
  //   3. @file mention handler
  // Local $state guarantees Svelte 5 template reactivity on mutations.
  // We still call file.addReference() / file.removeReference() to keep
  // FilesContext in sync for the SharedChatView → ChatContext bridge.
  type LocalRef = FileReference & {
    status: "uploading" | "ready" | "error" | "skipped";
    error?: string;
  };
  let references = $state<LocalRef[]>([]);
  let dismissedKeys = $state(new Set<string>());

  // Sync refs from FilesContext (SharedChatView ?refs=, @file mentions) into
  // local $state so the template renders them with full reactivity.
  $effect(() => {
    const refs = file.references;
    for (const ref of refs) {
      if (!dismissedKeys.has(ref.key) && !references.find((p) => p.key === ref.key)) {
        references = [...references, { ...ref, status: "ready" as const }];
      }
    }
  });

  let showCommands = $state(false);
  let showMentions = $state(false);
  let mentionQuery = $state("");
  let commandQuery = $state("");
  let blockedWorkflowMessage = $state<string | null>(null);
  let selectedMentions = $state<MentionPayload[]>([]);

  // Mirror detection state into the bindable so the parent can render the
  // dropdown above the wrapper. selectMention is referenced via closure
  // against the local handlers defined further below.
  $effect(() => {
    mentionProps.show = showMentions;
    mentionProps.query = mentionQuery;
    mentionProps.designationId = DESIGNATIONS.indexOf(
      userContext.user?.designation ?? "it",
    );
    mentionProps.onSelect = (entity) => selectMention(entity as never);
    mentionProps.onDismiss = () => (showMentions = false);
  });

  let webSearchEnabled = $state(false);
  // TODO: pass webSearchEnabled to chat request body when web search tool is integrated
  let mainMenuOpen = $state(false);
  let recentMenuOpen = $state(false);
  let moreMenuOpen = $state(false);
  let recentCloseTimer: ReturnType<typeof setTimeout> | null = null;
  let moreCloseTimer: ReturnType<typeof setTimeout> | null = null;

  const chat = useChat();
  const file = useFileActions();
  const imageContext = useImageCompression();
  const userContext = UserContext.fromContext();
  const selectedChatModel = SelectedModel.fromContext();
  const resolvedModelHolder = ResolvedModelHolder.fromContext();

  const compressIfImage = (f: File) =>
    rawCompressIfImage(f, (file, opts) => imageContext.compress(file, opts));

  // Current model: try the SSR-resolved model first, then fall back to the
  // catalog lookup. The SSR-resolved model handles custom-provider discovered
  // models whose ids aren't in BUILTIN_MODELS.
  const currentModel = $derived.by(() => {
    const raw = selectedChatModel.value;
    if (!raw) return resolvedModelHolder.value;
    const modelId = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
    const resolved = resolvedModelHolder.value;
    if (resolved && (resolved.id === modelId || raw.startsWith(`${resolved.id}@`))) {
      return resolved;
    }
    return getModelById(modelId as ModelId) ?? null;
  });

  const currentVariantId = $derived.by<string | null>(() => {
    const raw = selectedChatModel.value;
    if (!raw || !raw.includes("@")) return null;
    return raw.slice(raw.indexOf("@") + 1);
  });

  let variantPopoverOpen = $state(false);
  const currentVariantLabel = $derived.by(() => {
    if (!currentModel) return null;
    const variants = currentModel.variants ?? [];
    if (variants.length === 0) return null;
    const found = variants.find((v) => v.id === currentVariantId);
    if (found) return found.label;
    // No variant in the cookie yet (legacy cookie, or first paint after a
    // bare model select). Fall back to the first variant's label so the
    // trigger still renders a sensible hint before the user picks one.
    return variants[0]?.label ?? null;
  });

  // Map the selected variant to AI SDK `providerOptions`. The AI SDK reads
  // `providerOptions[providerName]` where `providerName` is the value passed
  // as `name` to the AI SDK factory — in the gateway that's `providerId`
  // (e.g., 'opencode', 'deepseek'). Reasoning effort / thinking type are
  // defined as `variant.options` in the catalog and intended to be passed
  // this way; encoding them in the model-id `@variant` suffix is purely a
  // client-side tracking label that the upstream API never sees.
  const currentProviderOptions = $derived.by(() => {
    if (!currentModel || !currentVariantId) return {};
    const variant = (currentModel.variants ?? []).find((v) => v.id === currentVariantId);
    if (!variant || !variant.options || Object.keys(variant.options).length === 0) return {};
    return { [currentModel.providerId]: variant.options };
  });

  // Token-usage context indicator. Cumulative across the conversation.
  const totalUsed = $derived.by(() => {
    const u = chatUsage.value;
    return (u.inputTokens ?? 0) + (u.outputTokens ?? 0) + (u.reasoningTokens ?? 0);
  });
  const maxContext = $derived(currentModel?.limit.context ?? 128_000);
  const usagePercent = $derived(maxContext > 0 ? totalUsed / maxContext : 0);

  function selectVariant(variantId: string | null): void {
    if (!currentModel) return;
    selectedChatModel.value = variantId
      ? `${currentModel.id}@${variantId}`
      : currentModel.id;
    variantPopoverOpen = false;
  }

  // Input is locked while the chat workflow is streaming. Document
  // extraction is now driven client-side via the prepareDocumentStream
  // tool call rather than legacy server-streamed parts.
  const inputDisabled = $derived(chat.loading);

  const extractingCount = $derived(chat.loading ? 1 : 0);


  // The composer always keeps `rounded-4xl` on all four corners. When the
  // ActionBar mounts above it (approval pending), the shared parent's
  // `rounded-4xl overflow-hidden` clips the top corners. A `border-t`
  // marks the seam when an approval is pending.
  const composerClass = $derived(
    cn(
      "composer-box relative w-full max-w-[780px] flex flex-col hermes-glass rounded-4xl shadow-[0_0_50px_-12px_rgba(0,0,0,0.5)] transition-all duration-500 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/30 p-0 border-border/10 bg-[#09090b]/40 backdrop-blur-3xl ring-offset-background",
    ),
  );
  /**
   * Extract the slash command type from input text.
   * Returns the command name (e.g., generate "extract", "validate", "publish") or null.
   */
  function extractSlashCommand(text: string): string | null {
    const match = text.trim().match(/^\/(\w+)/);
    return match ? match[1] : null;
  }

  /**
   * Normalize a bare `/transcript` command to `/transcript report` so that
   * clients always send an explicit subcommand. Matches `/transcript`
   * optionally followed by any number of `@<category> <name>` mention tokens,
   * with no subcommand. Case-insensitive.
   */
  function normalizeTranscriptCommand(text: string): string {
    const trimmed = text.trim();
    if (/^\/transcript(?:\s+@(?:class|year|exam|term|file)?\s*\S+)*\s*$/i.test(trimmed)) {
      return trimmed.replace(/^\/transcript/i, "/transcript report");
    }
    return text;
  }

  function onSubmit() {
    if (chat.loading) {
      chat.client.stop();
      return;
    }

    if (input.trim() && chat.status === "ready") {
      blockedWorkflowMessage = null;
      // Pass selected mentions to the chat context for inclusion in request body
      chat.pendingMentions = [...selectedMentions];
      // The chat API promotes `pendingMentions` into the
      // `resolvedMentions` slot of the per-request `requestContext`,
      // which `buildAssistantInstructions` renders as the
      // `RESOLVED @MENTIONS` block in the system prompt.
      // Build fileReferences from the single local $state references array.
      // This covers all sources: uploads, ?refs=, @file mentions — the sync
      // $effect and upload handlers both write to it.
      chat.fileReferences = references
        .filter((r) => r.status === "ready")
        .map((r) => ({
          key: r.key,
          name: r.name,
          type: r.type,
          fileId: r.fileId,
          contentHash: r.contentHash,
        }));

      // Default a bare `/transcript` to `/transcript report` (design decision B1).
      input = normalizeTranscriptCommand(input);

      chat.client.sendMessage({
        text: input,
        ...(Object.keys(currentProviderOptions).length > 0
          ? { providerOptions: currentProviderOptions }
          : {})
      });
      input = "";
      selectedMentions = [];
      // Clear file references after submission (both the local mirror
      // that drives the pill row and the file-context's payload source).
      references = [];
      if (file.references?.length) {
        file.references = [];
      }
      chat.scrollToBottom();
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      if (showCommands || showMentions) return; // Let dropdown handle it
      e.preventDefault();
      onSubmit();
    }
  }

  function handleInputDetection() {
    if (!textareaRef) return;

    // Detection for Slash Commands and Mentions
    const cursor = textareaRef.selectionStart || 0;
    const beforeCursor = input.substring(0, cursor);

    const commandMatch = beforeCursor.match(/\/(\w*)$/);
    if (commandMatch) {
      showCommands = true;
      commandQuery = commandMatch[1];
      showMentions = false;
    } else {
      showCommands = false;
      // Detect @category prefix (class, year, exam, term, file) or bare @ (students)
      const mentionMatch = beforeCursor.match(/@(class|year|exam|term|file)?\s*(\w*)$/);
      if (mentionMatch) {
        showMentions = true;
        const prefix = mentionMatch[1] || "";
        const query = mentionMatch[2] || "";
        // Bare `@` defaults to the students category so MentionDropdown can
        // resolve it without an explicit prefix.
        mentionQuery = prefix ? `${prefix} ${query}` : `student ${query}`;
      } else {
        showMentions = false;
      }
    }
  }

  function selectCommand(command: string) {
    const cursor = textareaRef?.selectionStart || 0;
    const beforeCursor = input.substring(0, cursor);
    const afterCursor = input.substring(cursor);
    const newBefore = beforeCursor.replace(/\/(\w*)$/, `/${command} `);
    input = newBefore + afterCursor;
    showCommands = false;
    textareaRef?.focus();
  }

  function selectMention(mention: any) {
    // File mentions: add to both FilesContext (for submit bridge) and local
    // references (for reactive template render).
    if (mention.category === "file") {
      showMentions = false;
      file.addReference({
        key: String(mention.id),
        name: mention.name,
        type: "file",
        mimeType: mention.mimeType,
      });
      if (!references.find((r) => r.key === String(mention.id))) {
        references = [...references, {
          key: String(mention.id), name: mention.name, type: "file",
          mimeType: mention.mimeType, status: "ready" as const,
        }];
      }
      // Strip the `@file <query>` text from the input so the stale
      // trigger doesn't re-open the MentionPopup on the next focus.
      const cursor = textareaRef?.selectionStart || 0;
      const beforeCursor = input.substring(0, cursor);
      const afterCursor = input.substring(cursor);
      const newBefore = beforeCursor.replace(/@(?:file)?\s*\w*$/, "");
      input = newBefore + afterCursor;
      textareaRef?.focus();
      return;
    }
    const cursor = textareaRef?.selectionStart || 0;
    const beforeCursor = input.substring(0, cursor);
    const afterCursor = input.substring(cursor);
    // Strip category prefix from displayed name (e.g. "class LOWERBASIC 1 - B" → "LOWERBASIC 1 - B")
    const cleanedName = mention.name.replace(/^(?:class|year|exam|term|file)\s+/, "");
    const displayName = cleanedName.length > 40 ? cleanedName.slice(0, 40) : cleanedName;
    const newBefore = beforeCursor.replace(/@(?:class|year|exam|term|file)?\s*\w*$/, `@${displayName} `);
    input = newBefore + afterCursor;
    showMentions = false;
    // Track the structured mention for submission
    selectedMentions = [
      ...selectedMentions,
      {
        category: mention.category,
        id: mention.id,
        name: mention.name,
        parentContext: mention.parentContext,
      },
    ];
    textareaRef?.focus();
  }

  /**
   * Derives the icon + badge for a file pill from the workspace path.
   * Shared by both filestore refs (?refs=) and @file mentions.
   * Mirrors the `fileCategoryIcon`
   * helper in `MentionDropdown.svelte` so the chip and the dropdown row
   * stay in sync. Falls back to a generic file icon for unknown kinds.
   */
  function chipMeta(key: string): {
    Icon: typeof FileTextIcon;
    badge: string;
  } {
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    const looksLikeImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp", "tiff"].includes(ext);
    let badge = "FILE";
    let Icon: typeof FileTextIcon = FileTextIcon;
    if (key.includes("/marksheets/")) {
      badge = "MARKSHEET";
      Icon = BookTextIcon;
    } else if (key.includes("/transcripts/")) {
      badge = "TRANSCRIPT";
      Icon = BookTextIcon;
    } else if (key.includes("/notes/")) {
      badge = "NOTE";
      Icon = BookTextIcon;
    } else if (ext === "pdf") {
      badge = "PDF";
      Icon = FileTextIcon;
    } else if (ext === "md" || ext === "markdown") {
      badge = "MD";
      Icon = BookTextIcon;
    } else if (looksLikeImage) {
      badge = "IMG";
      Icon = FileImageIcon;
    } else if (ext) {
      badge = ext.toUpperCase().slice(0, 4);
      Icon = FileQuestionIcon;
    }
    return { Icon, badge };
  }

  function closeAllMenus(): void {
    mainMenuOpen = false;
    recentMenuOpen = false;
    moreMenuOpen = false;
  }

  function stubCreateImage(): void {
    toast.info("Image generation coming soon");
    closeAllMenus();
  }

  function stubDeepResearch(): void {
    toast.info("Deep research coming soon");
    closeAllMenus();
  }

  function stubProjects(): void {
    toast.info("Projects coming soon");
    closeAllMenus();
  }

  function stubMoreTool(label: string): void {
    toast.info(`${label} coming soon`);
    closeAllMenus();
  }

  function triggerPhotoUpload(): void {
    photoFileInput?.click();
    closeAllMenus();
  }

  async function handlePhotoUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;

    const originals = Array.from(input.files);
    const prepared = await Promise.all(originals.map(compressIfImage));

    for (let i = 0; i < originals.length; i++) {
      const f = originals[i];
      const compressed = prepared[i];
      try {
        const formData = new FormData();
        formData.append("file", compressed);
        formData.append("filename", filenameForMime(f.name, compressed.type));
        formData.append("kind", "photo");

        const res = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          toast.error(`Failed to upload ${f.name}`);
          continue;
        }
        const json = await res.json();
        if (json.kind !== "photo") {
          toast.error(`Unexpected response for ${f.name}`);
          continue;
        }

        const photoRef = {
          kind: "photo" as const,
          contentHash: json.contentHash,
          url: json.url,
          mimeType: json.mimeType,
          size: json.size,
          name: f.name,
        };
        if (!dismissedKeys.has(json.contentHash)) {
          file.addReference({
            key: json.contentHash,
            name: f.name,
            type: "file" as const,
            mimeType: json.mimeType,
          });
          // Mirror to local $state so the template re-renders.
          if (!references.find((r) => r.key === json.contentHash)) {
            references = [
              ...references,
              { key: json.contentHash, name: f.name, type: "file", mimeType: json.mimeType, status: "ready" as const }
            ];
          }
        }
      } catch (err) {
        toast.error(`Failed to upload ${f.name}`);
      }
    }

    input.value = "";
  }

  function triggerDocumentUpload(): void {
    documentFileInput?.click();
    closeAllMenus();
  }

  async function handleDocumentUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;

    // Pull classId/sectionId from the active selected class so the
    // server can scope the upload to the right tenant workspace. The
    // server returns 422 TENANT_SCOPE_REQUIRED if no class is active.
    const selectedClass = file.selectedClass;
    const classId = selectedClass?.classId ?? null;
    const sectionId = selectedClass?.sectionId ?? null;

    const originals = Array.from(input.files);
    const prepared = await Promise.all(originals.map(compressIfImage));

    for (let i = 0; i < originals.length; i++) {
      const f = originals[i];
      const compressed = prepared[i];
      // Optimistic pill: add with status='uploading' immediately so the
      // indicator shows up before the fetch resolves.
      const tempKey = `pending-${f.name}-${Date.now()}-${Math.random()}`;
      if (!references.find((r) => r.key === tempKey)) {
        references = [
          ...references,
          { key: tempKey, name: f.name, type: "file", status: "uploading" as const }
        ];
      }
      try {
        const formData = new FormData();
        formData.append("file", compressed);
        formData.append("filename", filenameForMime(f.name, compressed.type));
        formData.append("kind", "document");
        if (classId !== null) formData.append("classId", String(classId));
        if (sectionId !== null) formData.append("sectionId", String(sectionId));

        const res = await fetch("/api/uploads", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          references = references.map((r) =>
            r.key === tempKey ? { ...r, status: "error" as const, error: `HTTP ${res.status}` } : r
          );
          toast.error(`Failed to upload ${f.name}`);
          continue;
        }
        const json = await res.json();
        if (json.kind !== "document") {
          references = references.map((r) =>
            r.key === tempKey ? { ...r, status: "error" as const, error: "Unexpected response kind" } : r
          );
          toast.error(`Unexpected response for ${f.name}`);
          continue;
        }

        // If this upload was dismissed, don't re-add the reference
        if (dismissedKeys.has(tempKey)) continue;

        file.addReference({
          key: json.contentHash,
          name: f.name,
          type: "file" as const,
          fileId: json.fileId,
          contentHash: json.contentHash,
        });

        // Replace the optimistic pill with the real one keyed by contentHash,
        // carrying the OCR status from the server.
        const finalStatus: LocalRef["status"] =
          json.ocrStatus === "ready" ? "ready"
          : json.ocrStatus === "error" ? "error"
          : json.ocrStatus === "skipped" ? "skipped"
          : "ready";
        references = references
          .filter((r) => r.key !== tempKey)
          .concat({
            key: json.contentHash,
            name: f.name,
            type: "file",
            fileId: json.fileId,
            contentHash: json.contentHash,
            status: finalStatus,
            error: json.ocrError ?? undefined
          });
        dismissedKeys = new Set([...dismissedKeys, json.contentHash]);
        toast.success(
          finalStatus === "ready"
            ? `Uploaded ${f.name} — OCR complete.`
            : finalStatus === "error"
            ? `Uploaded ${f.name} — OCR failed: ${json.ocrError ?? "unknown"}.`
            : `Uploaded ${f.name}.`
        );
      } catch (err) {
        references = references.map((r) =>
          r.key === tempKey ? { ...r, status: "error" as const, error: err instanceof Error ? err.message : String(err) } : r
        );
        toast.error(`Failed to upload ${f.name}`);
      }
    }

    input.value = "";
  }

  function openRecentSubmenu(): void {
    if (recentCloseTimer !== null) {
      clearTimeout(recentCloseTimer);
      recentCloseTimer = null;
    }
    recentMenuOpen = true;
  }

  function scheduleCloseRecentSubmenu(): void {
    if (recentCloseTimer !== null) clearTimeout(recentCloseTimer);
    recentCloseTimer = setTimeout(() => {
      recentMenuOpen = false;
      recentCloseTimer = null;
    }, 120);
  }

  function cancelCloseRecentSubmenu(): void {
    if (recentCloseTimer !== null) {
      clearTimeout(recentCloseTimer);
      recentCloseTimer = null;
    }
  }

  function openMoreSubmenu(): void {
    if (moreCloseTimer !== null) {
      clearTimeout(moreCloseTimer);
      moreCloseTimer = null;
    }
    moreMenuOpen = true;
  }

  function scheduleCloseMoreSubmenu(): void {
    if (moreCloseTimer !== null) clearTimeout(moreCloseTimer);
    moreCloseTimer = setTimeout(() => {
      moreMenuOpen = false;
      moreCloseTimer = null;
    }, 120);
  }

  function cancelCloseMoreSubmenu(): void {
    if (moreCloseTimer !== null) {
      clearTimeout(moreCloseTimer);
      moreCloseTimer = null;
    }
  }

  function handleRequestValidation(e: Event): void {
    const detail = (e as CustomEvent<{ artifactId: string }>).detail;
    if (!detail?.artifactId) return;
    // The actual validation is triggered by the agent via requireApproval.
    // This event is a hint to scroll to or focus the approval ActionBar.
    window.dispatchEvent(
      new CustomEvent('chat:focusApproval', { detail: { artifactId: detail.artifactId } })
    );
  }

  $effect(() => {
    if (mainMenuOpen) return;
    recentMenuOpen = false;
    moreMenuOpen = false;
  });

  $effect(() => {
    return () => {
      if (recentCloseTimer !== null) clearTimeout(recentCloseTimer);
      if (moreCloseTimer !== null) clearTimeout(moreCloseTimer);
    };
  });

  // Drive MentionDropdown's suggestion refresh imperatively (avoids the
  // $state.raw self-loop that previously broke the @ dropdown). The parent
  // (chat.svelte) owns the actual `<MentionDropdown>` instance and its
  // `bind:this` ref; we forward the refresh via the bindable contract so
  // the parent can call it once the dropdown is mounted.
  $effect(() => {
    const q = mentionQuery;
    const v = showMentions;
    if (v && mentionProps.refresh) {
      mentionProps.refresh(q, v);
    }
  });

  onMount(() => {
    window.addEventListener("chat:requestValidation", handleRequestValidation);
  });
  onDestroy(() => {
    if (typeof window !== "undefined") {
      window.removeEventListener("chat:requestValidation", handleRequestValidation);
    }
  });
</script>

{#if currentModel && usagePercent > 0.7}
  <ContextWarningBanner
    usedPercent={usagePercent}
    usedTokens={totalUsed}
    maxTokens={maxContext}
    modelName={currentModel.name}
  />
{/if}

<RateLimitBanner />

<PromptInput
  class="composer-box relative w-full max-w-[780px] flex flex-col rounded-4xl transition-all duration-500 focus-within:ring-1 focus-within:ring-primary/40 focus-within:border-primary/30 p-0 border-border/10 bg-foreground/5"
  value={input}
  onValueChange={(val) => {
    input = val;
    handleInputDetection();
  }}
  {onSubmit}
>
  <!-- Attachment Tray (Top Layer) -->
  {#if references.length > 0 || chat.studentData}
    <div class="flex flex-wrap gap-2 px-4 pt-4 pb-2 transition-all duration-500 ease-out">
      {#if chat.studentData}
        <div
          class="flex items-center gap-1.5 px-2 py-1 rounded-md bg-primary/10 border border-primary/20 text-xs font-medium text-primary"
        >
          <GraduationCapIcon class="size-3.5" />
          <span class="max-w-[120px] truncate">{chat.studentData.name}</span>
          <button
            onclick={() => (chat.studentData = undefined)}
            class="hover:text-foreground/80 transition-colors min-h-12 min-w-12 sm:min-h-8 sm:min-w-8 flex items-center justify-center"
            aria-label="Remove student"
          >
            <XIcon class="size-3" />
          </button>
        </div>
      {/if}

      {#each references as ref (ref.key)}
        {@const meta = chipMeta(ref.key)}
        <div
          class="group flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] font-bold tracking-wide text-foreground/70 group shadow-sm"
          data-status={ref.status}
          title={ref.error ?? ref.name}
        >
          {#if ref.status === "uploading"}
            <span class="size-3 rounded-full border-2 border-primary/40 border-t-primary animate-spin" aria-label="uploading"></span>
          {:else if ref.status === "error"}
            <AlertCircleIcon class="size-3.5 text-destructive" />
          {:else}
            <meta.Icon class="size-3.5 opacity-80" />
          {/if}
          <span class="max-w-[150px] truncate uppercase tracking-tighter">{ref.name}</span>
          <span class="shrink-0 px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-primary/15 text-primary/80">
            {meta.badge}
          </span>
          <button
            onclick={() => {
              dismissedKeys = new Set([...dismissedKeys, ref.key]);
              references = references.filter((r) => r.key !== ref.key);
              file.removeReference(ref.key);
            }}
            class="opacity-40 group-hover:opacity-100 hover:text-destructive transition-all ml-1 min-h-12 min-w-12 sm:min-h-8 sm:min-w-8 flex items-center justify-center"
            aria-label={`Remove ${ref.name}`}
          >
            <XIcon class="size-3" />
          </button>
        </div>
      {/each}

      {#if imageContext.isCompressing}
        <div
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900/60 border border-white/5 text-[11px] font-bold tracking-wide text-foreground/70 shadow-sm"
          data-status="compressing"
          aria-label="compressing image"
        >
          <span class="size-3 rounded-full border-2 border-primary/40 border-t-primary animate-spin"></span>
          <span class="uppercase tracking-tighter">Compressing…</span>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Input Layer -->
  <div
    class="relative bg-transparent! flex flex-col min-h-[48px] w-full"
    onclick={() => textareaRef?.focus()}
    role="presentation"
  >
    <!-- Blocked Workflow Message -->
    {#if blockedWorkflowMessage}
      <div
        class="mx-4 mt-2 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] font-medium text-amber-300 animate-in fade-in slide-in-from-bottom-1 duration-200"
      >
        {blockedWorkflowMessage}
      </div>
    {/if}

    <PromptInputTextarea
      bind:ref={textareaRef}
      onkeydown={handleKeydown}
      placeholder="Ask anything, / for commands @ for context..."
      readonly={inputDisabled}
      class="resize-none border-none bg-secondary/40! focus-visible:ring-0 text-base leading-relaxed scrollbar-slick min-h-[48px] w-full px-4 py-3 placeholder:text-muted-foreground/30 transition-all duration-300"
    />
  </div>

  <!-- Command Dropdown -->
  {#if showCommands}
    <div class="absolute bottom-full left-0 right-0 mb-3 z-50 flex justify-center px-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div class="w-full max-w-[780px] flex justify-start">
        <CommandDropdown
          query={commandQuery}
          onSelect={selectCommand}
          onDismiss={() => (showCommands = false)}
        />
      </div>
    </div>
  {/if}

  <!-- Actions Tray (Footer Layer) -->
  <PromptInputActions
    class="flex items-center justify-between px-2 sm:px-3 rounded-b-4xl bg-secondary/40! border-none"
  >
    <!-- Left Group: [Attach+Voice | Vertical Line | Context Chips] -->
    <div class="flex items-center sm:gap-1.5">
      <div class="flex items-center">
        <Popover.Root bind:open={mainMenuOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="min-h-12 min-w-12 rounded-full hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors"
                aria-label="Add"
              >
                <PlusIcon class="size-4" />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content
            align="start"
            side="top"
            sideOffset={8}
            class="w-64 border-border/20 shadow-2xl rounded-xl"
          >
            <Button
              variant="ghost"
              onclick={triggerPhotoUpload}
              class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
            >
              <CameraIcon class="size-3.5 opacity-70 shrink-0" />
              <div class="flex flex-col items-start min-w-0">
                <span class="truncate">Upload Photo</span>
                <span class="text-[10px] text-muted-foreground/60">Upload a photo</span>
              </div>
            </Button>

            <Button
              variant="ghost"
              onclick={triggerDocumentUpload}
              class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
            >
              <ScanLineIcon class="size-3.5 opacity-70 shrink-0" />
              <div class="flex flex-col items-start min-w-0">
                <span class="truncate">Upload Documents</span>
                <span class="text-[10px] text-muted-foreground/60">Extract text from PDFs & Images</span>
              </div>
            </Button>

            <!-- TODO: Implement Recents feature -->
            <!-- <Separator class="my-1" /> -->
            <!-- <Popover.Root bind:open={recentMenuOpen}>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    onmouseenter={openRecentSubmenu}
                    onmouseleave={scheduleCloseRecentSubmenu}
                    class="w-full justify-between gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
                  >
                    <span class="flex items-center gap-2.5 min-w-0">
                      <FileTextIcon class="size-3.5 opacity-70 shrink-0" />
                      <span class="truncate">Recent files</span>
                    </span>
                    <ChevronRightIcon class="size-3 opacity-50 shrink-0" />
                  </Button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content
                side="right"
                align="start"
                sideOffset={6}
                class="w-56 p-1 hermes-glass border-border/20 shadow-2xl rounded-xl"
                onmouseenter={cancelCloseRecentSubmenu}
                onmouseleave={scheduleCloseRecentSubmenu}
              >
                <Button
                  variant="ghost"
                  class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
                >
                  <LibraryIcon class="size-3.5 opacity-70 shrink-0" />
                  <span class="truncate">Add from library</span>
                </Button>
                <Separator class="my-1" />
                <div
                  class="px-2 py-1 text-[9px] font-black uppercase tracking-widest text-muted-foreground/50"
                >
                  Recents
                </div>
                <div class="px-2 py-2 text-[11px] text-muted-foreground/50 italic">
                  (no recent files)
                </div>
              </Popover.Content>
            </Popover.Root>

            <Button
              variant="ghost"
              onclick={stubCreateImage}
              class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
            >
              <ImageIcon class="size-3.5 opacity-70 shrink-0" />
              <span class="truncate">Create image</span>
            </Button>

            <div
              class="flex items-center justify-between gap-2.5 px-3 py-2 min-h-9 rounded-md hover:bg-white/5"
            >
              <div class="flex items-center gap-2.5 min-w-0">
                <GlobeIcon class="size-3.5 opacity-70 shrink-0" />
                <span class="text-[11px] font-bold tracking-tight text-foreground/80 truncate"
                  >Web search</span
                >
              </div>
              <Switch bind:checked={webSearchEnabled} />
            </div> -->

            <!-- <Popover.Root bind:open={moreMenuOpen}>
              <Popover.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    variant="ghost"
                    onmouseenter={openMoreSubmenu}
                    onmouseleave={scheduleCloseMoreSubmenu}
                    class="w-full justify-between gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
                  >
                    <span class="flex items-center gap-2.5 min-w-0">
                      <MoreHorizontalIcon class="size-3.5 opacity-70 shrink-0" />
                      <span class="truncate">More</span>
                    </span>
                    <ChevronRightIcon class="size-3 opacity-50 shrink-0" />
                  </Button>
                {/snippet}
              </Popover.Trigger>
              <Popover.Content
                side="right"
                align="start"
                sideOffset={6}
                class="w-56 p-1 hermes-glass border-border/20 shadow-2xl rounded-xl"
                onmouseenter={cancelCloseMoreSubmenu}
                onmouseleave={scheduleCloseMoreSubmenu}
              >
                <Button
                  variant="ghost"
                  onclick={() => stubMoreTool("Dictation")}
                  class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
                >
                  <MicIcon class="size-3.5 opacity-70 shrink-0" />
                  <span class="truncate">Dictation</span>
                </Button>
                <Button
                  variant="ghost"
                  onclick={() => stubMoreTool("Translate")}
                  class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
                >
                  <LanguagesIcon class="size-3.5 opacity-70 shrink-0" />
                  <span class="truncate">Translate</span>
                </Button>
                <Button
                  variant="ghost"
                  onclick={() => stubMoreTool("Study / Learn")}
                  class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
                >
                  <BookOpenIcon class="size-3.5 opacity-70 shrink-0" />
                  <span class="truncate">Study / Learn</span>
                </Button>
                <Button
                  variant="ghost"
                  onclick={() => stubMoreTool("Canvas")}
                  class="w-full justify-start gap-2.5 px-3 py-2 min-h-9 rounded-md text-[11px] font-bold tracking-tight text-foreground/80 hover:text-primary hover:bg-white/5"
                >
                  <PaletteIcon class="size-3.5 opacity-70 shrink-0" />
                  <span class="truncate">Canvas</span>
                </Button>
              </Popover.Content>
            </Popover.Root> -->
          </Popover.Content>
        </Popover.Root>

        <Tooltip.Root>
          <Tooltip.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                size="icon"
                class="hidden sm:flex h-10 w-10 sm:min-h-12 sm:min-w-12 rounded-full hover:bg-white/5 text-muted-foreground hover:text-primary transition-colors"
                aria-label="Voice input"
              >
                <MicIcon class="size-4" />
              </Button>
            {/snippet}
          </Tooltip.Trigger>
          <Tooltip.Content>Voice Input</Tooltip.Content>
        </Tooltip.Root>

        <div class="hidden sm:block mx-1 sm:mx-2 h-4 w-px bg-white/10 shrink-0"></div>
      </div>
    </div>

    <div class="flex items-center gap-1">
      {#if currentModel && (currentModel.variants?.length ?? 0) > 0}
        <Popover.Root bind:open={variantPopoverOpen}>
          <Popover.Trigger>
            {#snippet child({ props })}
              <Button
                {...props}
                variant="ghost"
                class="text-[10px] rounded-4xl sm:text-xs font-bold tracking-widest text-muted-foreground transition-colors gap-1.5 min-h-12 min-w-12 sm:min-h-8 hover:text-primary"
                aria-label="Thinking Mode"
              >
                <span class="truncate max-w-[120px]">{currentVariantLabel}</span>
                <ChevronDownIcon
                  class="size-3.5 transition-transform duration-200 {variantPopoverOpen ? 'rotate-180' : ''}"
                />
              </Button>
            {/snippet}
          </Popover.Trigger>
          <Popover.Content
            class="w-72 p-1 rounded-xl border-sidebar-border/40 shadow-2xl"
            side="top"
            align="end"
            sideOffset={6}
          >
            <div class="px-2 py-1.5 text-[9px] font-black uppercase tracking-widest text-muted-foreground/60">
              {currentModel.name} — Thinking Mode
            </div>
            {#each (currentModel.variants ?? []) as variant (variant.id)}
              <button
                onclick={() => selectVariant(variant.id)}
                class="w-full flex items-start gap-2 px-2 py-2 rounded-lg hover:bg-muted/40 transition-colors text-left {currentVariantId === variant.id ? 'bg-primary/10 text-primary' : ''}"
              >
                <div class="flex flex-col min-w-0 flex-1">
                  <span class="text-xs font-bold truncate">{variant.label}</span>
                  {#if variant.description}
                    <span class="text-[10px] text-muted-foreground/60 leading-tight">{variant.description}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </Popover.Content>
        </Popover.Root>
      {/if}

      <Button
        variant="default"
        size="icon"
        class={cn(
          "min-h-8 min-w-8 rounded-full transition-all duration-300 relative group overflow-hidden shadow-2xl",
          chat.loading
            ? "bg-destructive hover:bg-destructive/90"
            : inputDisabled
              ? "bg-primary/70 hover:bg-primary/70 text-primary-foreground"
              : "bg-primary hover:bg-primary/90 text-primary-foreground",
          (!input.trim() || inputDisabled) && !chat.loading && "opacity-50 grayscale cursor-not-allowed",
        )}
        onclick={onSubmit}
        disabled={inputDisabled || (!input.trim() && !chat.loading)}
      >
        <!-- Dynamic Core Glow (Warming effect) -->
        <div
          class="absolute inset-0 bg-white/20 blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
        ></div>
        <div
          class="absolute inset-0 bg-primary-foreground/10 blur-xl opacity-0 group-hover:opacity-50 transition-opacity duration-500"
        ></div>

        {#if chat.loading}
          <SquareIcon class="size-4 fill-current" />
        {:else if inputDisabled}
          <LoaderCircleIcon class="size-4 animate-spin" />
        {:else}
          <ArrowUpIcon
            class="size-4 stroke-3 transform group-active:translate-y-[-2px] transition-transform"
          />
        {/if}
      </Button>
    </div>
  </PromptInputActions>

  <!-- Hidden native file inputs.
       Paperclip path (file.onchange) was removed — uploads now go
       exclusively through the Upload Photo and Upload Document menu
       buttons in the + menu, which trigger handlePhotoUpload and
       handleDocumentUpload respectively. -->
  <input
    type="file"
    multiple
    accept="image/*"
    class="hidden"
    bind:this={photoFileInput}
    onchange={handlePhotoUpload}
  />
  <input
    type="file"
    multiple
    accept="application/pdf,image/*"
    class="hidden"
    bind:this={documentFileInput}
    onchange={handleDocumentUpload}
  />
</PromptInput>

<style>
  :global(.composer-box .scrollbar-slick) {
    scrollbar-width: thin;
    scrollbar-color: color-mix(in oklch, var(--muted-foreground), transparent 85%) transparent;
  }
  :global(.composer-box .scrollbar-slick::-webkit-scrollbar) {
    width: 4px;
  }
  :global(.composer-box .scrollbar-slick::-webkit-scrollbar-thumb) {
    background: color-mix(in oklch, var(--muted-foreground), transparent 85%);
    border-radius: 99px;
  }
</style>
