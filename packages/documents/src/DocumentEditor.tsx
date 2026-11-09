import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import {
  Bold,
  ChevronRight,
  Code2,
  Heading1,
  Heading2,
  Italic,
  List,
  ListOrdered,
  Minus,
  Quote,
  Redo2,
  Strikethrough,
  Undo2,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { EditorContent, useEditor } from "@tiptap/react";
import { BubbleMenu } from "@tiptap/react/menus";
import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";

export interface DocumentEditorProps {
  readonly initialContent?: string;
  readonly initialTitle?: string;
  readonly onChange?: (html: string) => void;
  readonly onClose?: () => void;
}

interface ToolbarButtonProps {
  readonly active?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
  readonly children: ReactNode;
}

function ToolbarButton({
  active = false,
  label,
  onClick,
  disabled = false,
  children
}: ToolbarButtonProps) {
  return (
    <button
      aria-label={label}
      aria-pressed={active}
      className={
        active
          ? "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md bg-primary/15 text-primary sm:min-h-9 sm:min-w-9"
          : "flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-35 sm:min-h-9 sm:min-w-9"
      }
      disabled={disabled}
      onClick={onClick}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}

interface SlashCommand {
  readonly id: string;
  readonly label: string;
  readonly description: string;
  readonly icon: LucideIcon;
  readonly run: (editor: Editor) => void;
}

const SLASH_COMMANDS: readonly SlashCommand[] = [
  {
    id: "paragraph",
    label: "Text",
    description: "Plain paragraph",
    icon: Minus,
    run: (editor) => editor.chain().focus().setParagraph().run()
  },
  {
    id: "heading-1",
    label: "Heading 1",
    description: "Large section heading",
    icon: Heading1,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run()
  },
  {
    id: "heading-2",
    label: "Heading 2",
    description: "Medium section heading",
    icon: Heading2,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run()
  },
  {
    id: "bullet-list",
    label: "Bulleted list",
    description: "A simple list",
    icon: List,
    run: (editor) => editor.chain().focus().toggleBulletList().run()
  },
  {
    id: "ordered-list",
    label: "Numbered list",
    description: "A list with order",
    icon: ListOrdered,
    run: (editor) => editor.chain().focus().toggleOrderedList().run()
  },
  {
    id: "quote",
    label: "Quote",
    description: "Capture a quotation",
    icon: Quote,
    run: (editor) => editor.chain().focus().toggleBlockquote().run()
  },
  {
    id: "code",
    label: "Code block",
    description: "A monospaced block",
    icon: Code2,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run()
  },
  {
    id: "divider",
    label: "Divider",
    description: "Separate sections",
    icon: Minus,
    run: (editor) => editor.chain().focus().setHorizontalRule().run()
  }
];

interface SlashState {
  readonly query: string;
  readonly from: number;
  readonly to: number;
  readonly left: number;
  readonly top: number;
  readonly index: number;
}

const wordCount = (text: string): number =>
  text.trim().length === 0 ? 0 : text.trim().split(/\s+/).length;

function TopBar({
  onClose,
  words
}: {
  readonly onClose: (() => void) | undefined;
  readonly words: number;
}) {
  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-border bg-background/95 px-3 py-2">
      <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
        {onClose !== undefined ? (
          <button
            aria-label="Close document drawer"
            className="mr-1 flex size-11 items-center justify-center rounded-md hover:bg-muted hover:text-foreground sm:size-9"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        ) : null}
        <span className="hidden text-[10px] font-bold uppercase tracking-[0.14em] text-primary sm:inline">
          Workspace
        </span>
        <ChevronRight aria-hidden="true" className="hidden size-3 sm:inline" />
        <span className="truncate">Untitled document</span>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="rounded-full border border-border px-2 py-1 text-[10px] text-muted-foreground">
          Local draft
        </span>
        <span className="hidden text-[10px] text-muted-foreground sm:inline">
          {words} words
        </span>
      </div>
    </div>
  );
}

function FormattingBar({ editor }: { readonly editor: Editor }) {
  return (
    <div
      aria-label="Document formatting"
      className="flex shrink-0 flex-nowrap items-center gap-0.5 overflow-x-auto border-b border-border bg-card/40 px-2 py-1.5 [-ms-overflow-style:none] [scrollbar-width:none] sm:flex-wrap sm:overflow-visible [&::-webkit-scrollbar]:hidden"
      role="toolbar"
    >
      <ToolbarButton
        active={editor.isActive("heading", { level: 1 })}
        label="Heading 1"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      >
        <Heading1 aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        label="Heading 2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      >
        <Heading2 aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        active={editor.isActive("bold")}
        label="Bold"
        onClick={() => editor.chain().focus().toggleBold().run()}
      >
        <Bold aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("italic")}
        label="Italic"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      >
        <Italic aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("strike")}
        label="Strikethrough"
        onClick={() => editor.chain().focus().toggleStrike().run()}
      >
        <Strikethrough aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        label="Bulleted list"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      >
        <List aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("orderedList")}
        label="Numbered list"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("blockquote")}
        label="Quote"
        onClick={() => editor.chain().focus().toggleBlockquote().run()}
      >
        <Quote aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        active={editor.isActive("codeBlock")}
        label="Code block"
        onClick={() => editor.chain().focus().toggleCodeBlock().run()}
      >
        <Code2 aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <span className="mx-1 h-5 w-px bg-border" />
      <ToolbarButton
        disabled={!editor.can().undo()}
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
      >
        <Undo2 aria-hidden="true" className="size-4" />
      </ToolbarButton>
      <ToolbarButton
        disabled={!editor.can().redo()}
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
      >
        <Redo2 aria-hidden="true" className="size-4" />
      </ToolbarButton>
    </div>
  );
}

export function DocumentEditor({
  initialContent = "",
  initialTitle = "Untitled document",
  onChange,
  onClose
}: DocumentEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const [words, setWords] = useState(0);
  const [slash, setSlash] = useState<SlashState | null>(null);
  useEffect(() => {
    const field = titleRef.current;
    if (field === null) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight}px`;
  }, [title]);

  const filteredCommands = useMemo(() => {
    if (slash === null) return [];
    const query = slash.query.toLowerCase();
    return SLASH_COMMANDS.filter(
      (command) =>
        command.label.toLowerCase().includes(query) ||
        command.description.toLowerCase().includes(query)
    );
  }, [slash]);

  const refreshSlash = (instance: Editor): void => {
    const { $from } = instance.state.selection;
    const before = $from.parent.textBetween(0, $from.parentOffset, "\n", "\0");
    const match = /(?:^|\s)\/([a-zA-Z0-9]*)$/.exec(before);
    if (match === null) {
      setSlash(null);
      return;
    }
    const query = match[1] ?? "";
    const position = instance.state.selection.from;
    const coords = instance.view.coordsAtPos(position);
    setSlash((current) => ({
      query,
      from: position - (query.length + 1),
      to: position,
      left: Math.min(Math.max(coords.left, 12), Math.max(window.innerWidth - 252, 12)),
      top: Math.min(coords.bottom + 8, window.innerHeight - 260),
      index: current !== null && current.query === query ? current.index : 0
    }));
  };

  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing, or type / for commands…"
      })
    ],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => {
      setWords(wordCount(instance.getText()));
      onChange?.(instance.getHTML());
      refreshSlash(instance);
    },
    onSelectionUpdate: ({ editor: instance }) => {
      refreshSlash(instance);
    }
  });

  const runCommand = (command: SlashCommand): void => {
    if (editor === null || slash === null) return;
    editor.chain().focus().deleteRange({ from: slash.from, to: slash.to }).run();
    command.run(editor);
    setSlash(null);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (slash === null || filteredCommands.length === 0) return;
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      setSlash({
        ...slash,
        index: (slash.index + direction + filteredCommands.length) % filteredCommands.length
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      const command = filteredCommands[slash.index];
      if (command !== undefined) runCommand(command);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setSlash(null);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background text-foreground" onKeyDown={onKeyDown}>
      {editor !== null ? <TopBar onClose={onClose} words={words} /> : null}
      {editor !== null ? <FormattingBar editor={editor} /> : null}

      <div className="relative min-h-0 flex-1 overflow-y-auto bg-[radial-gradient(circle_at_top,rgba(217,180,91,0.06),transparent_44%)]">
        <div className="mx-auto w-full max-w-[760px] px-3 py-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:px-8 sm:py-10">
          <article className="rounded-2xl border border-border/80 bg-card/70 px-5 py-7 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.85)] sm:px-10 sm:py-10">
            <div className="mb-7 flex items-center justify-between gap-3 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
              <span>Private workspace draft</span>
              <span>EdApex</span>
            </div>
            <textarea
              aria-label="Document title"
              className="block w-full resize-none overflow-hidden bg-transparent text-2xl font-semibold leading-tight tracking-tight outline-none placeholder:text-muted-foreground/40 sm:text-3xl lg:text-4xl"
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Untitled"
              ref={titleRef}
              rows={1}
              value={title}
            />
            <div className="my-6 h-px bg-border/80" />
            <EditorContent
              className="min-h-[52vh] text-[16px] leading-8 text-foreground [&_.ProseMirror]:min-h-[52vh] [&_.ProseMirror]:outline-none [&_.ProseMirror_blockquote]:my-4 [&_.ProseMirror_blockquote]:border-l-2 [&_.ProseMirror_blockquote]:border-primary/50 [&_.ProseMirror_blockquote]:pl-4 [&_.ProseMirror_blockquote]:text-muted-foreground [&_.ProseMirror_code]:rounded [&_.ProseMirror_code]:bg-muted [&_.ProseMirror_code]:px-1.5 [&_.ProseMirror_code]:py-0.5 [&_.ProseMirror_code]:text-[0.875em] [&_.ProseMirror_code]:text-primary [&_.ProseMirror_codeBlock]:my-4 [&_.ProseMirror_codeBlock]:rounded-lg [&_.ProseMirror_codeBlock]:bg-muted/70 [&_.ProseMirror_codeBlock]:p-4 [&_.ProseMirror_codeBlock]:font-mono [&_.ProseMirror_h1]:mb-3 [&_.ProseMirror_h1]:mt-7 [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h1]:tracking-tight [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:mt-6 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_h2]:tracking-tight [&_.ProseMirror_hr]:my-7 [&_.ProseMirror_hr]:border-border [&_.ProseMirror_li]:my-1 [&_.ProseMirror_li]:ml-5 [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_p]:my-2 [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0 [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-muted-foreground/50 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_ul]:list-disc"
              editor={editor}
            />
          </article>
          <p className="mt-4 text-center text-[10px] text-muted-foreground">
            Local draft · not synced · type <span className="text-foreground">/</span> for commands
          </p>
        </div>

        {editor !== null ? (
          <BubbleMenu editor={editor} options={{ placement: "top", offset: 8 }}>
            <div className="flex items-center gap-0.5 rounded-lg border border-border bg-popover p-1 shadow-xl">
              <ToolbarButton
                active={editor.isActive("bold")}
                label="Bold"
                onClick={() => editor.chain().focus().toggleBold().run()}
              >
                <Bold aria-hidden="true" className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("italic")}
                label="Italic"
                onClick={() => editor.chain().focus().toggleItalic().run()}
              >
                <Italic aria-hidden="true" className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("strike")}
                label="Strikethrough"
                onClick={() => editor.chain().focus().toggleStrike().run()}
              >
                <Strikethrough aria-hidden="true" className="size-3.5" />
              </ToolbarButton>
              <ToolbarButton
                active={editor.isActive("code")}
                label="Inline code"
                onClick={() => editor.chain().focus().toggleCode().run()}
              >
                <Code2 aria-hidden="true" className="size-3.5" />
              </ToolbarButton>
            </div>
          </BubbleMenu>
        ) : null}

        {slash !== null && filteredCommands.length > 0 ? (
          <div
            className="fixed z-[60] w-[240px] overflow-hidden rounded-xl border border-border bg-popover p-1 shadow-2xl"
            style={{ left: slash.left, top: slash.top }}
          >
            <div className="px-2 py-1.5 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Insert block
            </div>
            {filteredCommands.map((command, index) => {
              const Icon = command.icon;
              return (
                <button
                  className={
                    index === slash.index
                      ? "flex w-full items-center gap-2 rounded-lg bg-primary/15 px-2 py-2 text-left text-primary"
                      : "flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-foreground hover:bg-muted"
                  }
                  key={command.id}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    runCommand(command);
                  }}
                  type="button"
                >
                  <span className="flex size-7 items-center justify-center rounded-md bg-muted/70">
                    <Icon aria-hidden="true" className="size-3.5" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-xs font-medium">{command.label}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">
                      {command.description}
                    </span>
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
