import { useState } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@edapex/ui/components/button";
import { Textarea } from "@edapex/ui/components/textarea";

import { Screen } from "@/components/shell/Screen";
import { TopBar, type ComposeMode } from "@/components/app/TopBar";
import type { SurfaceId } from "@/lib/nav";

const STARTERS = [
  "Audit this term's marksheets and flag anything that does not add up",
  "Draft report comments for Year 9 Physics from these scores",
  "Build a revision plan from the scheme of work for next week"
] as const;

/**
 * "Make": the second half of Frame 1's segmented control.
 *
 * Make starts an agent rather than a conversation. The difference that matters is
 * durability — an agent gets a job, a schedule and an approval rule, and it can run while
 * the app is closed — so the surface asks for the one thing that cannot be inferred: what
 * the agent is for. Schedule, tools and approvers are chosen in the editor that follows.
 *
 * One field, not two. The composer belongs to a conversation; a brief with a composer under
 * it would give the screen two places to type.
 */
export function MakeSurface({
  approvals,
  onDraft,
  onModeChange,
  onOpenDrawer,
  onSelect
}: {
  readonly approvals: number;
  readonly onDraft: (brief: string) => void;
  readonly onModeChange: (mode: ComposeMode) => void;
  readonly onOpenDrawer: () => void;
  readonly onSelect: (id: SurfaceId | "new") => void;
}) {
  const [brief, setBrief] = useState("");

  return (
    <Screen>
      <TopBar
        approvals={approvals}
        mode="make"
        onModeChange={onModeChange}
        onOpenDrawer={onOpenDrawer}
        onSelect={onSelect}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <div className="scrollbar-auto flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-gutter pb-4">
          <div className="flex flex-col gap-1 pt-4">
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-primary">
              <Sparkles aria-hidden="true" className="size-5" />
            </span>
            <h1 className="pt-2 text-title font-semibold tracking-tight">New agent</h1>
            <p className="text-label text-muted-foreground">
              Describe the job in your own words. It runs on a schedule, asks before it changes
              a record, and keeps working when the app is closed.
            </p>
          </div>

          <Textarea
            aria-label="What should this agent do?"
            className="min-h-32 rounded-xl bg-card text-body"
            onChange={(event) => setBrief(event.target.value)}
            placeholder="e.g. Every Friday, check that attendance totals match the register and tell me what changed."
            value={brief}
          />

          <div className="flex flex-col gap-2">
            <p className="text-label text-muted-foreground">Start from</p>
            {STARTERS.map((starter) => (
              <button
                className="min-h-comfortable rounded-xl border border-border bg-card px-3 py-2 text-left text-label outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
                key={starter}
                onClick={() => setBrief(starter)}
                type="button"
              >
                {starter}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2 px-gutter pb-2">
          <Button
            className="min-h-comfortable rounded-dock text-body"
            disabled={brief.trim() === ""}
            onClick={() => onDraft(brief.trim())}
            size="lg"
          >
            Continue
          </Button>
          <p className="px-2 text-center text-chrome text-muted-foreground">
            You will choose the schedule, the tools and who approves its changes next.
          </p>
        </div>
      </div>
    </Screen>
  );
}
