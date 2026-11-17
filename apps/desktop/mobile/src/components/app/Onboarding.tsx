import { Button } from "@edapex/ui/components/button";
import { cn } from "@edapex/ui/lib/utils";

import { ONBOARDING_PAGES, SKIPPABLE_FROM } from "@/lib/boot";

interface Slide {
  readonly title: string;
  readonly body: string;
}

/**
 * Four pages, and no fifth.
 *
 * Each one answers a question a teacher asks before trusting the app: what does
 * it do while I am away, will it act without me, where is my school, and what
 * does it cost me. A carousel that cannot be skipped on the first page is a
 * gate; from the second it is an introduction.
 */
const SLIDES: readonly Slide[] = [
  {
    title: "Work that finishes",
    body: "Close the app, take a call, lock the phone. A run keeps its place and picks up where it stopped, even after a restart."
  },
  {
    title: "It asks before it acts",
    body: "Anything that touches a record or sends a message waits for your yes. Every request is in one list, and a request can reach you while you are somewhere else."
  },
  {
    title: "Your school, in your pocket",
    body: "Marks, attendance and the roster are a tap from the conversation. Publishing results to parents needs an admin's approval, and you can see when it was given."
  },
  {
    title: "Nothing runs in secret",
    body: "A background run says so in the notification shade, and an approval waits for the person who asked for it. You can stop either at any time."
  }
];

export function Onboarding({
  onBack,
  onFinish,
  onNext,
  onSkip,
  page
}: {
  readonly onBack: () => void;
  readonly onFinish: () => void;
  readonly onNext: () => void;
  readonly onSkip: () => void;
  readonly page: number;
}) {
  const last = page >= ONBOARDING_PAGES - 1;
  const slide = SLIDES[page] ?? SLIDES[0]!;

  return (
    <div className="flex min-h-dvh flex-col bg-background px-6 pt-6 text-foreground">
      {/* The safe area is the shell's job; onboarding sits inside the same frame. */}
      <div className="flex min-h-11 items-center justify-end">
        {page >= SKIPPABLE_FROM && !last ? (
          <Button onClick={onSkip} size="sm" variant="ghost">
            Skip
          </Button>
        ) : null}
      </div>

      <div className="flex flex-1 flex-col justify-center gap-4">
        <p className="text-label uppercase tracking-wide text-muted-foreground">
          Step {page + 1} of {ONBOARDING_PAGES}
        </p>
        <h1 className="text-title text-balance">{slide.title}</h1>
        <p className="text-body text-pretty text-muted-foreground">{slide.body}</p>
      </div>

      <div aria-hidden className="flex items-center gap-2 py-6">
        {SLIDES.map((_, index) => (
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              index === page ? "bg-foreground" : "bg-muted"
            )}
            key={index}
          />
        ))}
      </div>

      <div className="flex gap-3 pb-8">
        {page > 0 ? (
          <Button className="flex-1" onClick={onBack} variant="outline">
            Back
          </Button>
        ) : null}
        <Button className="flex-1" onClick={last ? onFinish : onNext}>
          {last ? "Get started" : "Next"}
        </Button>
      </div>
    </div>
  );
}
