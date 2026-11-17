import { describe, expect, it } from "vitest";

import { END_THRESHOLD_PX, isAtEnd, shouldFollow } from "./transcript";

const view = (scrollTop: number, scrollHeight = 1000, clientHeight = 400) => ({
  scrollTop,
  scrollHeight,
  clientHeight
});

describe("transcript anchoring", () => {
  it("counts the exact end and anything within the threshold as the end", () => {
    expect(isAtEnd(view(600))).toBe(true);
    expect(isAtEnd(view(600 - END_THRESHOLD_PX))).toBe(true);
    expect(isAtEnd(view(600 - END_THRESHOLD_PX - 1))).toBe(false);
  });

  it("follows only when the person is already at the end", () => {
    expect(shouldFollow(9, 10, true)).toBe(true);
  });

  it("never yanks a reader who scrolled up", () => {
    expect(shouldFollow(9, 10, false)).toBe(false);
  });

  it("does not scroll when nothing was appended", () => {
    expect(shouldFollow(10, 10, true)).toBe(false);
  });
});
