import { useState } from "react";
import { ArrowUp, Mic, Plus, Square } from "lucide-react";

import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput
} from "@edapex/ui/components/input-group";

/**
 * The composer from Frame 1: one pill, a plus, the field, and a primary circle.
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
      <form
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <InputGroup className="min-h-comfortable rounded-dock border-border bg-card px-1.5 shadow-none">
          <InputGroupAddon align="inline-start">
            <InputGroupButton
              aria-label="Add attachment"
              className="size-touch rounded-full text-muted-foreground"
              onClick={onAttach}
              size="icon-sm"
            >
              <Plus aria-hidden="true" className="size-5" />
            </InputGroupButton>
          </InputGroupAddon>

          <InputGroupInput
            aria-label="Message EDAPEX"
            className="h-auto py-0 text-body"
            onChange={(event) => setValue(event.target.value)}
            placeholder="Ask EDAPEX"
            value={value}
          />

          <InputGroupAddon align="inline-end" className="gap-1">
            <InputGroupButton
              aria-label="Dictate"
              className="size-touch rounded-full text-muted-foreground"
              size="icon-sm"
            >
              <Mic aria-hidden="true" className="size-5" />
            </InputGroupButton>
            <InputGroupButton
              aria-label={busy ? "Stop" : "Send"}
              className="size-touch rounded-full"
              onClick={busy ? onStop : undefined}
              size="icon-sm"
              type={busy ? "button" : "submit"}
              variant="default"
            >
              {busy ? (
                <Square aria-hidden="true" className="size-4 fill-current" />
              ) : (
                <ArrowUp aria-hidden="true" className="size-5" />
              )}
            </InputGroupButton>
          </InputGroupAddon>
        </InputGroup>
      </form>
      <p className="px-2 text-center text-chrome text-muted-foreground">
        EDAPEX can make mistakes. Verify records.
      </p>
    </div>
  );
}
