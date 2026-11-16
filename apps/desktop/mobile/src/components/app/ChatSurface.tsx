import { BrandMark } from "@/components/brand/BrandMark";
import { QUICK_ACTIONS, type SurfaceId } from "@/lib/nav";
import { ICONS } from "@/lib/icons";
import { cn } from "@edapex/ui/lib/utils";

import { AttachPanel } from "@/components/app/AttachPanel";
import { Composer } from "@/components/app/Composer";
import { Screen } from "@/components/shell/Screen";
import { TopBar, type ComposeMode } from "@/components/app/TopBar";

/**
 * Frame 1's body: an empty conversation, two suggestions, and the composer.
 *
 * The empty state is deliberately quiet — one mark, one sentence — because the first thing
 * a person does here is type, and a wall of onboarding cards is in the way of that. The
 * suggestions sit against the composer rather than in the middle of the screen, where a
 * thumb can reach them.
 */
export function ChatSurface({
  approvals,
  busy,
  attachOpen,
  keyboardOpen,
  mode,
  onAttach,
  onAttachSelect,
  onModeChange,
  onOpenDrawer,
  onQuickAction,
  onSelect,
  onSend
}: {
  readonly approvals: number;
  readonly attachOpen: boolean;
  readonly busy: boolean;
  readonly keyboardOpen: boolean;
  readonly mode: ComposeMode;
  readonly onAttach: () => void;
  readonly onAttachSelect: (id: "camera" | "photos" | "files" | "scan" | "plugins" | "deep") => void;
  readonly onModeChange: (mode: ComposeMode) => void;
  readonly onOpenDrawer: () => void;
  readonly onQuickAction: (id: "scan" | "agent") => void;
  readonly onSelect: (id: SurfaceId | "new") => void;
  readonly onSend: (value: string) => void;
}) {
  return (
    <Screen>
      <TopBar
        approvals={approvals}
        mode={mode}
        onModeChange={onModeChange}
        onOpenDrawer={onOpenDrawer}
        onSelect={onSelect}
      />

      <div className="relative flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-auto mx-auto flex min-h-0 w-full max-w-2xl flex-1 flex-col overflow-y-auto px-gutter pb-2">
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-6 text-center">
            <BrandMark className="h-14 w-auto text-foreground" />
            <p className="text-title font-semibold tracking-tight">What are we working on?</p>
            <p className="max-w-64 text-label text-muted-foreground">
              Ask about a class, a record or a document. EDAPEX reads what you give it and
              shows its working.
            </p>
          </div>

          <div className={keyboardOpen ? "hidden" : "flex flex-col"}>
            {QUICK_ACTIONS.map((action) => {
              const Icon = ICONS[action.icon];
              return (
                <button
                  className={cn(
                    "flex min-h-comfortable items-center gap-3 rounded-lg px-1 text-left outline-none",
                    "motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                  )}
                  key={action.id}
                  onClick={() => onQuickAction(action.id)}
                  type="button"
                >
                  <Icon aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate text-body">{action.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <AttachPanel onSelect={onAttachSelect} open={attachOpen} />
        <div className="mx-auto w-full max-w-2xl">
          <Composer busy={busy} onAttach={onAttach} onSend={onSend} />
        </div>
      </div>
    </Screen>
  );
}
