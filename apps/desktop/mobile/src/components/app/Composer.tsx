import { useState } from "react";
import { ArrowUp, Mic, Plus, Square } from "lucide-react";

import {
  Composer as ComposerSurface,
  ComposerSubmit,
  ComposerTextarea
} from "@edapex/ui/components/composer";
import { InputGroupAddon, InputGroupButton } from "@edapex/ui/components/input-group";

/**
 * The composer from Frame 1: one pill, a plus, the field, and a primary circle.
 *
 * Both trailing actions are always present. An earlier build swapped dictation for send
 * when the field had text; it gave the text more width but made the send button appear and
 * disappear, which reads as a bug rather than as a mode.
 *
 * The field grows with the text — one line at rest, five before it scrolls — because a
 * fixed-height field that scrolls horizontally hides what you just wrote. The growth is
 * `field-sizing: content`, not an animated height: transitioning a box height reflows the
 * transcript on every keystroke, and the expansion is already visible as it happens.
 *
 * The primary circle is the only control that changes identity — while a turn streams it is
 * a stop square, because two actions in one place is how a send button ends up firing twice.
 * The disclaimer is always visible: an agentic workspace that can write to a school record is
 * not the place for a hint that appears only on hover.
 */
export function Composer({
  busy = false,
  onAttach,
  onSend,
  onStop
}: {
  readonly busy?: boolean;
  readonly onAttach: () => void;
  readonly onSend: (value: string) => void;
  readonly onStop?: () => void;
}) {
  const [value, setValue] = useState("");

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed === "") return;
    onSend(trimmed);
    setValue("");
  };

  return (
    <div className="composer-dock flex flex-col gap-2 px-gutter">
      <ComposerSurface
        groupClassName="min-h-field rounded-dock border-border bg-card px-1.5 shadow-none"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
          <InputGroupAddon align="inline-start">
            <InputGroupButton
              aria-label="Add attachment"
              className="size-10 rounded-full text-muted-foreground"
              onClick={onAttach}
              size="icon-sm"
            >
              <Plus aria-hidden="true" className="size-5" />
            </InputGroupButton>
          </InputGroupAddon>

          <ComposerTextarea
            submitOnEnter={false}
            aria-label="Message Edapex"
            /* The keyboard's return key inserts a line break; send is the button. */
            className="max-h-40 min-h-field w-full min-w-0 resize-none py-3 text-start text-body"
            enterKeyHint="enter"
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ask Edapex"
            rows={1}
            value={value}
          />

          <InputGroupAddon align="inline-end" className="gap-1">
            <InputGroupButton
              aria-label="Dictate"
              className="size-10 rounded-full text-muted-foreground"
              size="icon-sm"
            >
              <Mic aria-hidden="true" className="size-5" />
            </InputGroupButton>
            <ComposerSubmit
              aria-label={busy ? "Stop" : "Send"}
              className="size-10 rounded-full text-primary-foreground"
              onStop={onStop}
              size="icon-sm"
              status={busy ? "streaming" : "idle"}
              variant="default"
            >
              {busy ? (
                <Square aria-hidden="true" className="size-3.5 fill-current" strokeWidth={0} />
              ) : (
                <ArrowUp aria-hidden="true" className="size-5" strokeWidth={2.75} />
              )}
            </ComposerSubmit>
          </InputGroupAddon>
      </ComposerSurface>
      <p className="px-2 text-center text-chrome text-muted-foreground">
        EDAPEX can make mistakes. Verify records.
      </p>
    </div>
  );
}
