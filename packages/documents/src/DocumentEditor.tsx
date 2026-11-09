import { EditorContent, useEditor } from "@tiptap/react";
import type { Editor } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";

export interface DocumentEditorProps {
  readonly initialContent?: string;
  readonly onChange?: (html: string) => void;
}

interface ToolbarButtonProps {
  readonly active?: boolean;
  readonly label: string;
  readonly onClick: () => void;
  readonly disabled?: boolean;
}

function ToolbarButton({ active = false, label, onClick, disabled = false }: ToolbarButtonProps) {
  return (
    <button
      aria-pressed={active}
      className={
        active
          ? "min-h-9 rounded-md bg-primary/20 px-2.5 text-xs font-semibold text-primary"
          : "min-h-9 rounded-md px-2.5 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function Toolbar({ editor }: { readonly editor: Editor }) {
  return (
    <div
      aria-label="Document formatting"
      className="flex flex-wrap gap-1 border-b border-border px-2 py-2"
      role="toolbar"
    >
      <ToolbarButton
        active={editor.isActive("bold")}
        label="B"
        onClick={() => editor.chain().focus().toggleBold().run()}
      />
      <ToolbarButton
        active={editor.isActive("italic")}
        label="I"
        onClick={() => editor.chain().focus().toggleItalic().run()}
      />
      <ToolbarButton
        active={editor.isActive("heading", { level: 1 })}
        label="H1"
        onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
      />
      <ToolbarButton
        active={editor.isActive("heading", { level: 2 })}
        label="H2"
        onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
      />
      <ToolbarButton
        active={editor.isActive("bulletList")}
        label="• List"
        onClick={() => editor.chain().focus().toggleBulletList().run()}
      />
      <ToolbarButton
        active={editor.isActive("orderedList")}
        label="1. List"
        onClick={() => editor.chain().focus().toggleOrderedList().run()}
      />
      <ToolbarButton
        disabled={!editor.can().undo()}
        label="Undo"
        onClick={() => editor.chain().focus().undo().run()}
      />
      <ToolbarButton
        disabled={!editor.can().redo()}
        label="Redo"
        onClick={() => editor.chain().focus().redo().run()}
      />
    </div>
  );
}

export function DocumentEditor({ initialContent = "", onChange }: DocumentEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start writing…"
      })
    ],
    content: initialContent,
    immediatelyRender: false,
    onUpdate: ({ editor: instance }) => {
      onChange?.(instance.getHTML());
    }
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {editor !== null ? <Toolbar editor={editor} /> : null}
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        <EditorContent
          className="min-h-[50vh] text-sm leading-7 [&_.ProseMirror]:min-h-[50vh] [&_.ProseMirror]:outline-none [&_.ProseMirror_h1]:mb-3 [&_.ProseMirror_h1]:mt-4 [&_.ProseMirror_h1]:text-2xl [&_.ProseMirror_h1]:font-semibold [&_.ProseMirror_h2]:mb-2 [&_.ProseMirror_h2]:mt-3 [&_.ProseMirror_h2]:text-xl [&_.ProseMirror_h2]:font-semibold [&_.ProseMirror_li]:ml-5 [&_.ProseMirror_li]:list-disc [&_.ProseMirror_ol]:list-decimal [&_.ProseMirror_p]:my-2"
          editor={editor}
        />
      </div>
    </div>
  );
}
