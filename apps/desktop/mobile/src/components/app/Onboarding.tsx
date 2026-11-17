import { useEffect, useRef } from "react";

import { Button } from "@edapex/ui/components/button";
import { cn } from "@edapex/ui/lib/utils";

import { Screen } from "@/components/shell/Screen";
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
 * does it cost me.
 *
 * It is a swipe, not a Next button: the pages sit side by side in one horizontally
 * snapping scroller, so the transition is the person's own finger moving the content —
 * which is also why there is no animation to tune. `page` stays the source of truth so
 * system back walks the pages; the live scroll reports where the person actually went.
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
  onFinish,
  onPageChange,
  onSkip,
  page
}: {
  readonly onFinish: () => void;
  readonly onPageChange: (page: number) => void;
  readonly onSkip: () => void;
  readonly page: number;
}) {
  const pager = useRef<HTMLDivElement | null>(null);
  const last = page >= ONBOARDING_PAGES - 1;

  // The machine decides `page`; the scroller follows it — but only across a real jump.
  // A swipe that is still settling is never more than half a page away, so this threshold
  // is what stops the effect fighting the finger (three quick swipes used to leave the
  // pager parked between two pages).
  useEffect(() => {
    const element = pager.current;
    if (element === null || element.clientWidth === 0) return;
    const target = page * element.clientWidth;
    if (Math.abs(element.scrollLeft - target) > element.clientWidth / 2) {
      element.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [page]);

  /*
   * Which page is showing is answered by what is actually visible, not by a scroll offset.
   *
   * Two earlier attempts read `scrollLeft`: on `scroll` it fired mid-drag, and on `scrollend`
   * it missed the event whenever the listener was re-registered between swipes. An observer
   * reports the slide that owns the viewport, which is true during a drag, after a fling and
   * after a programmatic jump — and it is the mechanism this project uses for visibility.
   */
  const pageRef = useRef(page);
  pageRef.current = page;
  const pageChangeRef = useRef(onPageChange);
  pageChangeRef.current = onPageChange;

  useEffect(() => {
    const root = pager.current;
    if (root === null) return;
    const slides = Array.from(root.querySelectorAll("[data-slide]"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.intersectionRatio < 0.6) continue;
          const index = Number((entry.target as HTMLElement).dataset.slide);
          if (Number.isInteger(index) && index !== pageRef.current) {
            pageChangeRef.current(index);
          }
        }
      },
      { root, threshold: [0.6] }
    );
    for (const slide of slides) observer.observe(slide);
    return () => observer.disconnect();
  }, []);

  return (
    <Screen>
      {/* Onboarding is a Screen like every other surface: safe-area padding is written once,
          there, and a first run that put its only button under the gesture bar proved it. */}
      <div className="flex flex-1 flex-col px-6 pt-6">
        <div className="flex min-h-11 items-center justify-end">
          {page >= SKIPPABLE_FROM && !last ? (
            <Button onClick={onSkip} size="sm" variant="ghost">
              Skip
            </Button>
          ) : null}
        </div>

        <div
          className="scrollbar-auto flex min-h-0 flex-1 snap-x snap-mandatory overflow-x-auto"
          ref={pager}
        >
          {SLIDES.map((slide, index) => (
            <section
              aria-label={`Step ${index + 1} of ${ONBOARDING_PAGES}`}
              className="flex w-full shrink-0 snap-center flex-col justify-center gap-4 pr-2"
              data-slide={index}
              key={slide.title}
            >
              <p className="text-label uppercase tracking-wide text-muted-foreground">
                Step {index + 1} of {ONBOARDING_PAGES}
              </p>
              <h1 className="text-title text-balance">{slide.title}</h1>
              <p className="text-body text-pretty text-muted-foreground">{slide.body}</p>
            </section>
          ))}
        </div>

        <div aria-hidden className="flex items-center justify-center gap-2 py-6">
          {SLIDES.map((slide, index) => (
            <span
              className={cn(
                "h-1.5 w-1.5 rounded-full",
                index === page ? "bg-foreground" : "bg-muted"
              )}
              key={slide.title}
            />
          ))}
        </div>

        <div className="screen-bottom pb-4">
          {last ? (
            <Button className="w-full" onClick={onFinish}>
              Get started
            </Button>
          ) : (
            <p className="text-center text-label text-muted-foreground">Swipe to continue</p>
          )}
        </div>
      </div>
    </Screen>
  );
}
