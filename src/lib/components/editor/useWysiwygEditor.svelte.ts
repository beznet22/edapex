import type { Editor } from "@tiptap/core";
import type { Transaction } from "@tiptap/pm/state";
import { Chat } from "@ai-sdk/svelte";
import { DefaultChatTransport, type UIMessage } from "ai";
import { cacheOriginalText, cleanupStaleCacheEntries } from "./extensions/ai-stream-cache";
import { normalizeMarkdown } from "./markdown-normalize";

declare global {
    interface Window {
        __editorMentionCtx?: {
            designationId: number;
            selectedClassId: number | null;
            selectedSectionId: number | null;
            selectedClassName: string;
            selectedSectionName: string;
        };
    }
}

export interface WysiwygEditorControllerOptions {
    onUpdate?: (markdown: string) => void;
    designationId: number;
    selectedClassId: number | null;
    selectedSectionId: number | null;
    selectedClassName: string;
    selectedSectionName: string;
}

export class WysiwygEditorController {
    // Reactive AI streaming state — read by NodeView via the editor
    // and by the component template for the floating popover.
    isAiProcessing = $state(false);
    aiStreamNodePos = $state<number | null>(null);
    accumulatedContent = $state("");

    // Floating AI prompt popover state
    aiPromptOpen = $state(false);
    aiPromptPos = $state<{ top: number; left: number } | null>(null);
    pendingSelection = $state<{
        from: number;
        to: number;
        text: string;
        markdown: string;
    } | null>(null);

    // Editor instance mirror — some effects need a non-store reference
    editorInstance = $state<Editor | null>(null);

    private lastMessageId = $state("");
    private currentCtx = $state<{
        markdown: string;
        selectedText: string;
        toolName: string;
    } | null>(null);

    // Cache of the last content we passed to `editor.commands.setContent`
    // (post-normalize). Used by `syncExternalContent` to dedup against the
    // INPUT rather than the lossy tiptap-markdown round-trip output —
    // `editor.storage.markdown.getMarkdown()` re-serializes and adds a
    // trailing newline, so comparing the input to that output makes the
    // dedup fail on every run and the effect loops forever
    // (effect_update_depth_exceeded).
    private lastSetContent: string | null = null;

    // True while we're pushing external content into the editor via
    // `syncExternalContent`. `handleEditorUpdate` checks this and skips
    // `options.onUpdate?.(md)` so Tiptap's cascading onUpdate calls during
    // a single setContent don't propagate back to the parent (which would
    // write to $state and trip the effect_update_depth_exceeded guard).
    // User-driven edits (real typing) keep propagating normally because
    // the flag is only set during programmatic external syncs.
    private isExternalSync = false;

    private chatClient: Chat<UIMessage>;

    constructor(
        private readonly getEditor: () => Editor | null,
        private readonly getContainer: () => HTMLElement | undefined,
        private readonly options: WysiwygEditorControllerOptions,
    ) {
        this.chatClient = new Chat<UIMessage>({
            id: "editor-command",
            transport: new DefaultChatTransport({
                api: "/api/ai/editor/command",
                prepareSendMessagesRequest: ({ messages }) => ({
                    body: {
                        messages,
                        ctx: this.currentCtx,
                    },
                }),
            }),
            onError: (err) => {
                console.error("AI Improve Error:", err);
                const editor = this.getEditor();
                if (editor && this.aiStreamNodePos !== null) {
                    const nodeAtPos = editor.state.doc.nodeAt(this.aiStreamNodePos);
                    if (nodeAtPos?.type.name === "aiStreamBlock") {
                        const rawText = err?.message || "";
                        console.error("AI Improve Error (raw):", rawText);

                        let displayMsg: string;
                        const retryMatch = rawText.match(/try again in ([\d.]+)s/);
                        if (retryMatch) {
                            const seconds = Math.ceil(parseFloat(retryMatch[1]));
                            displayMsg = `⚠️ Rate limit reached. Auto-retrying in ${seconds}s…`;
                        } else if (rawText.startsWith("{")) {
                            try {
                                const parsed = JSON.parse(rawText);
                                displayMsg = parsed.error || "AI service error";
                            } catch {
                                displayMsg = "AI service encountered an error. Please try again.";
                            }
                        } else if (rawText.includes("does not support")) {
                            displayMsg = `⚠️ ${rawText.replace(/^ERROR:\s*/i, "")}`;
                        } else if (
                            [
                                "Cannot connect",
                                "ETIMEDOUT",
                                "ECONNREFUSED",
                                "ENOTFOUND",
                                "EAI_AGAIN",
                                "ECONNRESET",
                                "socket",
                                "fetch failed",
                                "network",
                                "unreachable",
                                "timeout",
                                "retries exhausted",
                            ].some((kw) => rawText.toLowerCase().includes(kw))
                        ) {
                            displayMsg = "⚠️ Connection timed out. Please check your internet connection and try again.";
                        } else {
                            displayMsg = "⚠️ AI service encountered an error. Please try again.";
                        }

                        const retryAfter = retryMatch
                            ? Math.ceil(parseFloat(retryMatch[1]))
                            : null;
                        const tr = editor.state.tr.setNodeMarkup(
                            this.aiStreamNodePos,
                            undefined,
                            {
                                ...nodeAtPos.attrs,
                                content: displayMsg || "An error occurred",
                                status: "error",
                                retryAfter,
                            },
                        );
                        tr.setMeta("aiStream", true);
                        editor.view.dispatch(tr);
                    }
                }
                this.isAiProcessing = false;
                this.aiStreamNodePos = null;
                this.accumulatedContent = "";
                this.lastMessageId = "";
            },
        });

        // Mirror the live editor instance into a non-store ref for effects.
        $effect(() => {
            const ed = this.getEditor();
            if (ed) {
                this.editorInstance = ed;
            }
        });

        // Mention context — read by extensions/mention-menu via window global.
        $effect(() => {
            window.__editorMentionCtx = {
                designationId: this.options.designationId,
                selectedClassId: this.options.selectedClassId,
                selectedSectionId: this.options.selectedSectionId,
                selectedClassName: this.options.selectedClassName,
                selectedSectionName: this.options.selectedSectionName,
            };
        });

        // Reactive streaming effect — renders into AiStreamNode NodeView
        $effect(() => {
            const editor = this.getEditor();
            if (!editor || !this.isAiProcessing) return;

            const messages = this.chatClient.messages;
            if (messages.length === 0) return;

            const lastMessage = messages[messages.length - 1];

            if (lastMessage?.role === "assistant") {
                if (lastMessage.id !== this.lastMessageId) {
                    this.lastMessageId = lastMessage.id;
                    this.accumulatedContent = "";
                }

                const anyMsg = lastMessage as UIMessage & {
                    content?: string;
                    parts?: Array<{ type: string; text?: string }>;
                };
                let fullContent = anyMsg.content || "";
                if (!fullContent && anyMsg.parts) {
                    fullContent =
                        anyMsg.parts.find((p) => p.type === "text")?.text || "";
                }

                if (
                    fullContent.length > this.accumulatedContent.length &&
                    this.aiStreamNodePos !== null
                ) {
                    this.accumulatedContent = fullContent;
                    const nodeAtPos = editor.state.doc.nodeAt(this.aiStreamNodePos);
                    if (nodeAtPos?.type.name === "aiStreamBlock") {
                        const tr = editor.state.tr.setNodeMarkup(
                            this.aiStreamNodePos,
                            undefined,
                            {
                                ...nodeAtPos.attrs,
                                content: this.accumulatedContent,
                                status: "streaming",
                            },
                        );
                        tr.setMeta("aiStream", true);
                        editor.view.dispatch(tr);
                    }
                }
            }

            if (
                this.chatClient.status === "ready" ||
                this.chatClient.status === "error"
            ) {
                if (
                    this.aiStreamNodePos !== null &&
                    this.accumulatedContent &&
                    editor
                ) {
                    const nodeAtPos = editor.state.doc.nodeAt(this.aiStreamNodePos);
                    if (nodeAtPos?.type.name === "aiStreamBlock") {
                        const tr = editor.state.tr.setNodeMarkup(
                            this.aiStreamNodePos,
                            undefined,
                            {
                                ...nodeAtPos.attrs,
                                content: this.accumulatedContent,
                                status: "finished",
                            },
                        );
                        editor.view.dispatch(tr);
                    }
                }
                this.aiStreamNodePos = null;
                this.accumulatedContent = "";
                this.isAiProcessing = false;
            }
        });

        // Wire container-scoped events for the AI prompt popover and stream resolve.
        $effect(() => {
            const container = this.getContainer();
            if (!container) return;
            container.addEventListener("ai-prompt-open", this.handleAiPromptOpen);
            container.addEventListener("ai-stream-resolve", this.handleStreamResolve);
            return () => {
                container.removeEventListener("ai-prompt-open", this.handleAiPromptOpen);
                container.removeEventListener(
                    "ai-stream-resolve",
                    this.handleStreamResolve,
                );
            };
        });
    }

    /** Tiptap onUpdate — skip getMarkdown during aiStreamBlock transactions
     *  and during programmatic external syncs (see `isExternalSync`). */
    handleEditorUpdate(transaction: Transaction, editor: Editor): void {
        if (this.isExternalSync) return;
        if (transaction.getMeta("aiStream")) return;
        const md =
            (editor.storage as { markdown?: { getMarkdown?: () => string } }).markdown
                ?.getMarkdown?.() ?? editor.getHTML();
        this.options.onUpdate?.(md);
    }

    /** Sync external content (e.g. file switch) into the editor, deduplicated.
     *  Two layers of protection against the
     *  `effect_update_depth_exceeded` loop:
     *    1. `lastSetContent` dedups against the input rather than the
     *       round-trip output (which is lossy due to tiptap-markdown
     *       re-serialization — trailing newline, table reformatting).
     *    2. `isExternalSync` flag suppresses `handleEditorUpdate` callbacks
     *       while the programmatic setContent runs, so Tiptap's cascading
     *       onUpdate chain during one setContent doesn't write back to the
     *       parent's $state (which is what trips the depth guard). */
    syncExternalContent(content: string): void {
        const editor = this.getEditor();
        if (!editor) return;
        const normalized = normalizeMarkdown(content);
        if (this.lastSetContent !== null && normalized === this.lastSetContent) return;
        this.lastSetContent = normalized;
        this.isExternalSync = true;
        try {
            editor.commands.setContent(content ?? "");
        } finally {
            this.isExternalSync = false;
        }
    }

    /** Generic AI command entry from GenerativeMenuSwitch (improve / shorten / etc.). */
    handleAiCommand(option: string, text: string): void {
        const editor = this.getEditor();
        if (!editor || this.isAiProcessing || this.aiPromptOpen) return;
        const { from, to } = editor.state.selection;
        if (from === to) return;
        const selectedText =
            text || editor.state.doc.textBetween(from, to, "\n");
        if (!selectedText.trim()) return;

        const prompts: Record<string, string> = {
            improve:
                "Improve the selected text to be clearer, more concise, and grammatically correct. Preserve the meaning and tone. Return only the improved text.",
            shorten:
                "Shorten the selected text while preserving its meaning. Return only the shortened text.",
            lengthen:
                "Expand the selected text with more detail and examples. Return only the expanded text.",
            summarize:
                "Summarize the selected text in a few sentences. Return only the summary.",
            simplify:
                "Simplify the selected text so a general audience can understand it. Return only the simplified text.",
            professional:
                "Rewrite the selected text in a professional tone. Return only the rewritten text.",
            casual:
                "Rewrite the selected text in a casual, conversational tone. Return only the rewritten text.",
            fixGrammar:
                "Fix grammar and spelling in the selected text. Return only the corrected text.",
        };

        const prompt =
            prompts[option] ??
            `Apply the following instruction to the selected text: ${option}. Return only the resulting text.`;

        this.runAiEdit(from, to, selectedText, prompt);
    }

    private runAiEdit(
        from: number,
        to: number,
        selectedText: string,
        prompt: string,
    ): void {
        const editor = this.getEditor();
        if (!editor || this.isAiProcessing) return;
        const streamId = crypto.randomUUID();
        cleanupStaleCacheEntries();
        cacheOriginalText(streamId, selectedText);

        const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
        const markdown = storage.markdown?.getMarkdown?.() ?? editor.getHTML();
        this.currentCtx = { markdown, selectedText, toolName: "edit" };

        editor
            .chain()
            .focus()
            .deleteRange({ from, to })
            .insertContentAt(from, {
                type: "aiStreamBlock",
                attrs: {
                    content: "",
                    status: "streaming",
                    toolName: "edit",
                    streamId,
                },
            })
            .run();

        let foundPos: number | null = null;
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === "aiStreamBlock" && foundPos === null) {
                foundPos = pos;
            }
            return foundPos === null;
        });
        this.aiStreamNodePos = foundPos;
        this.accumulatedContent = "";
        this.lastMessageId = "";
        this.isAiProcessing = true;
        this.chatClient.messages = [];
        this.chatClient.sendMessage({ text: prompt });
    }

    private handleAiPromptOpen = (e: Event): void => {
        const editor = this.getEditor();
        const container = this.getContainer();
        if (!editor || this.isAiProcessing || this.aiPromptOpen) return;
        const detail = (
            e as CustomEvent<{ mode?: "edit" | "generate" }>
        ).detail ?? { mode: "generate" };
        const mode = detail.mode ?? "generate";

        const { from, to } = editor.state.selection;
        const view = editor.view;
        const editorRect = view.dom.getBoundingClientRect();
        const containerRect = container?.getBoundingClientRect() ?? editorRect;
        if (!containerRect) return;

        const pos = from;
        const coords = view.coordsAtPos(pos);
        const popoverWidth = 320;
        const scrollTop = container?.scrollTop ?? 0;
        const scrollLeft = container?.scrollLeft ?? 0;

        const top = coords.bottom - containerRect.top + scrollTop + 8;
        const left = Math.max(
            8,
            Math.min(
                containerRect.width - popoverWidth - 8,
                coords.left - containerRect.left + scrollLeft - popoverWidth / 2,
            ),
        );

        const storage = editor.storage as { markdown?: { getMarkdown?: () => string } };
        const markdown = storage.markdown?.getMarkdown?.() ?? editor.getHTML();
        const selectedText =
            from !== to ? editor.state.doc.textBetween(from, to, "\n") : "";

        this.pendingSelection = { from, to, text: selectedText, markdown };
        this.currentCtx = {
            markdown,
            selectedText,
            toolName: mode === "generate" ? "generate" : "edit",
        };
        this.aiPromptPos = { top, left };
        this.aiPromptOpen = true;
    };

    dismissAiPrompt(): void {
        this.aiPromptOpen = false;
        this.aiPromptPos = null;
        this.pendingSelection = null;
        this.getEditor()?.commands.focus();
    }

    submitAiPrompt(prompt: string): void {
        const editor = this.getEditor();
        if (!editor || !this.pendingSelection) return;
        const { from, to, text: selectedText, markdown } = this.pendingSelection;
        const isEdit = this.currentCtx?.toolName === "edit";
        const streamId = crypto.randomUUID();
        cleanupStaleCacheEntries();

        if (isEdit) {
            cacheOriginalText(streamId, selectedText);
            editor
                .chain()
                .focus()
                .deleteRange({ from, to })
                .insertContentAt(from, {
                    type: "aiStreamBlock",
                    attrs: {
                        content: "",
                        status: "streaming",
                        toolName: "edit",
                        streamId,
                    },
                })
                .run();
        } else {
            editor
                .chain()
                .focus()
                .insertContentAt(from, {
                    type: "aiStreamBlock",
                    attrs: {
                        content: "",
                        status: "streaming",
                        toolName: "generate",
                        streamId,
                    },
                })
                .run();
        }

        let foundPos: number | null = null;
        editor.state.doc.descendants((node, pos) => {
            if (node.type.name === "aiStreamBlock" && foundPos === null) {
                foundPos = pos;
            }
            return foundPos === null;
        });
        this.aiStreamNodePos = foundPos;
        this.accumulatedContent = "";
        this.lastMessageId = "";
        this.isAiProcessing = true;
        this.chatClient.messages = [];
        this.chatClient.sendMessage({ text: prompt });

        this.aiPromptOpen = false;
        this.aiPromptPos = null;
        this.pendingSelection = null;
    }

    private handleStreamResolve = (): void => {
        this.isAiProcessing = false;
        this.aiStreamNodePos = null;
        this.accumulatedContent = "";
        this.lastMessageId = "";
        try {
            this.chatClient.messages = [];
        } catch {
            /* ignore */
        }
        try {
            (this.chatClient as unknown as { stop?: () => void }).stop?.();
        } catch {
            /* ignore */
        }
    };
}
