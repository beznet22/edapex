import { useState } from "react";

import { Button } from "@edapex/ui/components/button";
import { Textarea } from "@edapex/ui/components/textarea";

const STARTERS = [
  "Audit this term's marksheets and flag anything that does not add up",
  "Draft report comments for Year 9 Physics from these scores",
  "Build a revision plan from the scheme of work for next week"
] as const;

/**
 * "New agent", opened from the menu or the drawer.
 *
 * One field, because the schedule, the tools and the approver are all choices the editor
 * after this asks for. It is a sheet rather than a page so the conversation you were in is
 * still underneath — starting an agent is something you do *from* a conversation.
 */
export function MakeSheet({ onDraft }: { readonly onDraft: (brief: string) => void }) {
  const [brief, setBrief] = useState("");

  return (
    <div className="flex flex-col gap-4 px-gutter pb-6">
      <p className="text-label text-muted-foreground">
        Describe the job in your own words. It runs on a schedule, asks before it changes a
        record, and keeps working when the app is closed.
      </p>

      <Textarea
        aria-label="What should this agent do?"
        className="min-h-28 rounded-xl bg-card text-body"
        onChange={(event) => setBrief(event.target.value)}
        placeholder="e.g. Every Friday, check that attendance totals match the register and tell me what changed."
        value={brief}
      />

      <div className="flex flex-col gap-2">
        <p className="text-label text-muted-foreground">Start from</p>
        {STARTERS.map((starter) => (
          <button
            className="min-h-comfortable rounded-xl border border-border px-3 py-2 text-left text-label outline-none motion-effects-fast hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
            key={starter}
            onClick={() => setBrief(starter)}
            type="button"
          >
            {starter}
          </button>
        ))}
      </div>

      <Button
        className="min-h-comfortable rounded-dock text-body"
        disabled={brief.trim() === ""}
        onClick={() => onDraft(brief.trim())}
        size="lg"
      >
        Continue
      </Button>
      <p className="text-center text-chrome text-muted-foreground">
        You will choose the schedule, the tools and who approves its changes next.
      </p>
    </div>
  );
}
