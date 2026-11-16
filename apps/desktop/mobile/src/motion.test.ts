import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * The motion sheet's contract.
 *
 * `packages/tokens` is CSS-only by rule — a `.ts` there is a design-system bug — so the
 * consumer asserts the contract instead of the package testing itself. These are the
 * invariants that make the scheme decision real rather than aspirational.
 */
const css = readFileSync(
  fileURLToPath(new URL("../../../../packages/tokens/motion.css", import.meta.url)),
  "utf8"
);

const curve = (name: string): readonly number[] => {
  const match = new RegExp(`--motion-ease-${name}: linear\\(([^)]+)\\)`).exec(css);
  expect(match, `no linear() curve for ${name}`).not.toBeNull();
  return (match?.[1] ?? "")
    .split(",")
    .map((stop) => Number(stop.trim()))
    .filter((value) => Number.isFinite(value));
};

describe("motion tokens", () => {
  it("defines all seven springs, spatial and effects", () => {
    for (const name of [
      "spatial-fast",
      "spatial-default",
      "spatial-slow",
      "spatial-play",
      "effects-fast",
      "effects-default",
      "effects-slow"
    ]) {
      expect(css).toContain(`--motion-ease-${name}:`);
      expect(css).toContain(`--motion-duration-${name}:`);
    }
  });

  it("keeps standard spatial springs from overshooting", () => {
    for (const name of ["spatial-fast", "spatial-default", "spatial-slow"]) {
      const peak = Math.max(...curve(name));
      expect(peak, `${name} overshoots`).toBeLessThanOrEqual(1.01);
    }
  });

  it("reserves exactly one expressive spring, and it does overshoot", () => {
    // The scheme decision: Send and the shutter are the only places with visible life.
    expect(Math.max(...curve("spatial-play"))).toBeGreaterThan(1.05);
  });

  it("never lets an effects spring overshoot", () => {
    for (const name of ["effects-fast", "effects-default", "effects-slow"]) {
      expect(Math.max(...curve(name))).toBeLessThanOrEqual(1.01);
    }
  });

  it("snaps spatial motion under reduced motion and keeps effects at the fast curve", () => {
    const reduced = /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(reduced).toContain("--motion-duration-spatial-fast: 1ms");
    expect(reduced).toContain("--motion-duration-spatial-slow: 1ms");
    expect(reduced).toContain(
      "--motion-duration-effects-slow: var(--motion-duration-effects-fast)"
    );
    // 1ms rather than 0: a 0ms transition never fires `transitionend`.
    expect(reduced).not.toContain(": 0ms");
  });

  it("degrades to a cubic-bezier where linear() is unavailable", () => {
    expect(css).toContain("@supports (animation-timing-function: linear(0, 1))");
    expect(css).toContain("@supports not (animation-timing-function: linear(0, 1))");
    const fallback = /@supports not \(animation-timing-function: linear\(0, 1\)\) \{[\s\S]*?\n\}/.exec(css)?.[0] ?? "";
    expect(fallback).toContain("--motion-ease-spatial-default: var(--duet-ease)");
  });
});
