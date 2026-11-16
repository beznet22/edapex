import { describe, it, expect } from "vitest";
import {
  childKeyboard,
  decodeActionId,
  encodeActionId,
  termKeyboard,
  yearKeyboard,
} from "$lib/server/telegram/pdf/keyboards";

describe("encodeActionId / decodeActionId", () => {
  it("round-trips a child action id", () => {
    const id = encodeActionId("child", 42);
    expect(id).toBe("c:42");
    const decoded = decodeActionId(id);
    expect(decoded).toEqual({ kind: "child", args: ["42"] });
  });

  it("round-trips a term action id", () => {
    const id = encodeActionId("term", 99);
    expect(id).toBe("t:99");
    expect(decodeActionId(id)).toEqual({ kind: "term", args: ["99"] });
  });

  it("round-trips a year action id", () => {
    const id = encodeActionId("year", 7);
    expect(id).toBe("y:7");
    expect(decodeActionId(id)).toEqual({ kind: "year", args: ["7"] });
  });

  it("throws when action id exceeds 40 bytes", () => {
    expect(() => encodeActionId("child", "x".repeat(60))).toThrow(/too long/i);
  });

  it("decodes a cancel action id", () => {
    expect(decodeActionId("x:cancel")).toEqual({ kind: "child", args: ["cancel"] });
  });

  it("returns null for unknown opcodes", () => {
    expect(decodeActionId("z:1:2")).toBeNull();
  });
});

describe("childKeyboard", () => {
  it("returns a CardElement with type card", () => {
    const card = childKeyboard([{ studentId: 1, label: "Alice" }]);
    expect(card.type).toBe("card");
  });

  it("caps the button list at 8 entries", () => {
    const options = Array.from({ length: 12 }, (_, i) => ({
      studentId: i + 1,
      label: `Child ${i + 1}`,
    }));
    const card = childKeyboard(options);
    const actions = card.children[0];
    if (actions && "children" in actions && Array.isArray(actions.children)) {
      expect(actions.children).toHaveLength(8);
    } else {
      throw new Error("Expected Actions child with children array");
    }
  });
});

describe("termKeyboard", () => {
  it("returns a CardElement", () => {
    const card = termKeyboard([{ examTypeId: 1, label: "CA2" }]);
    expect(card.type).toBe("card");
  });
});

describe("yearKeyboard", () => {
  it("returns a CardElement", () => {
    const card = yearKeyboard([{ academicId: 1, label: "2024-2025" }]);
    expect(card.type).toBe("card");
  });
});
