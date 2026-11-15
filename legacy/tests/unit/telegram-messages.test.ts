import { describe, it, expect } from "vitest";
import { escape, help, notLinked, welcome, pdfError } from "$lib/server/telegram/pdf/messages";

describe("messages.escape", () => {
  it("passes through all characters unchanged", () => {
    const special = "\\`*_[]{}<>|";
    const escaped = escape(special);
    expect(escaped).toBe(special);
  });

  it("passes through plain text and email addresses untouched", () => {
    expect(escape("Hello world")).toBe("Hello world");
    expect(escape("office@acme.test")).toBe("office@acme.test");
    expect(escape("+234 (801) 234-5678")).toBe("+234 (801) 234-5678");
  });

  it("returns empty string for null/undefined/number", () => {
    expect(escape(null)).toBe("");
    expect(escape(undefined)).toBe("");
    expect(escape(42)).toBe("42");
  });
});

describe("messages.welcome", () => {
  it("for linked user, contains /result pointer", () => {
    const out = welcome(true);
    expect(out).toContain("/result");
    expect(out).toContain("/help");
  });

  it("for linked user with school name, includes it in greeting", () => {
    const out = welcome(true, "Acme Academy");
    expect(out).toContain("Acme Academy");
    expect(out).toContain("/result");
  });

  it("for unlinked user, contains /connect guidance", () => {
    const out = welcome(false);
    expect(out).toContain("/connect");
  });
});

describe("messages.notLinked", () => {
  it("mentions /connect", () => {
    expect(notLinked()).toContain("/connect");
  });
});

describe("messages.help", () => {
  it("lists the /result command syntax", () => {
    const out = help({ schoolName: null, schoolPhone: null, schoolEmail: null }, true);
    expect(out).toContain("/result");
    expect(out).toContain("child");
    expect(out).toContain("term");
  });

  it("includes school contact when available", () => {
    const out = help({
      schoolName: "Acme Academy",
      schoolPhone: "+1234567890",
      schoolEmail: "office@acme.test",
    }, true);
    expect(out).toContain("Acme Academy");
    expect(out).toContain("Parent Bot");
    expect(out).toContain("+1234567890");
    expect(out).toContain("office@acme.test");
    expect(out).toContain("📧");
  });

  it("omits contact block when all contact fields are null", () => {
    const out = help({ schoolName: null, schoolPhone: null, schoolEmail: null }, true);
    expect(out).not.toContain("Need help");
  });

  it("shows unlinked notice when isLinked is false", () => {
    const out = help({ schoolName: null, schoolPhone: null, schoolEmail: null }, false);
    expect(out).toContain("account isn't linked yet");
    expect(out).toContain("send /connect");
  });

  it("does not show unlinked notice when isLinked is true", () => {
    const out = help({ schoolName: null, schoolPhone: null, schoolEmail: null }, true);
    expect(out).not.toContain("account isn't linked yet");
  });

  it("does not list unimplemented commands", () => {
    const out = help({ schoolName: null, schoolPhone: null, schoolEmail: null }, true);
    expect(out).not.toContain("/attendance");
    expect(out).not.toContain("/timetable");
    expect(out).not.toContain("/fees");
    expect(out).not.toContain("/events");
  });
});

describe("messages.pdfError", () => {
  const contact = { schoolName: "Acme", schoolPhone: "111", schoolEmail: null };

  it("renders STUDENT_NOT_FOUND with the supplied query", () => {
    const out = pdfError("STUDENT_NOT_FOUND", { query: "Zoe" }, contact);
    expect(out).toContain("Zoe");
  });

  it("renders MARKSHEET_NOT_FOUND with child + term", () => {
    const out = pdfError("MARKSHEET_NOT_FOUND", {
      childName: "Alice",
      termHint: "CA2",
      yearHint: "2024-2025",
    }, contact);
    expect(out).toContain("Alice");
    expect(out).toContain("CA2");
  });

  it("renders PDF_RENDER_FAILED template", () => {
    const out = pdfError("PDF_RENDER_FAILED", {}, contact);
    expect(out.toLowerCase()).toContain("pdf");
  });

  it("appends the school contact block on errors", () => {
    const out = pdfError("PDF_RENDER_FAILED", {}, contact);
    expect(out).toContain("Acme");
    expect(out).toContain("111");
  });

  it("renders NO_STUDENT_SESSION with the child name", () => {
    const out = pdfError("NO_STUDENT_SESSION", { childName: "Bob" }, contact);
    expect(out).toContain("Bob");
  });
});
