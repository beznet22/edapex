import { describe, expect, it } from "vitest";
import {
  assessIdentity,
  nameSimilarity,
  normaliseNameTokens,
  tokenSimilarity,
} from "$lib/server/people/scan/scan-identity";

const db = { dbName: "AMIRA KANYITOR", dbAdmissionNo: 521 };

const assess = (paperName: string, paperAdmissionNo: number | null = 521) =>
  assessIdentity({ paperName, paperAdmissionNo, ...db });

describe("normaliseNameTokens", () => {
  it("drops punctuation, case and single letters", () => {
    expect(normaliseNameTokens("  Okafor, Adaobi O. ")).toEqual(["OKAFOR", "ADAOBI"]);
  });

  it("folds confusable digits so OCR slips do not break a match", () => {
    expect(normaliseNameTokens("AM1RA")).toEqual(["AMIRA"]);
    expect(normaliseNameTokens("0KONKWO")).toEqual(["OKONKWO"]);
    expect(normaliseNameTokens("5HINDARA")).toEqual(["SHINDARA"]);
  });

  it("strips diacritics", () => {
    expect(normaliseNameTokens("JOSÉ")).toEqual(["JOSE"]);
  });
});

describe("tokenSimilarity", () => {
  it("scores identical tokens as 1", () => {
    expect(tokenSimilarity("AMIRA", "AMIRA")).toBe(1);
  });

  it("scores unrelated tokens near 0", () => {
    expect(tokenSimilarity("ADAKOLE", "KANYITOR")).toBeLessThan(0.35);
  });

  it("scores a one-character slip high", () => {
    expect(tokenSimilarity("KANYTTO", "KANYITOR")).toBeGreaterThan(0.7);
  });

  it("is symmetric", () => {
    expect(tokenSimilarity("AMIRA", "AMRA")).toBeCloseTo(tokenSimilarity("AMRA", "AMIRA"), 10);
  });
});

describe("nameSimilarity — coverage of the paper's tokens", () => {
  it("is 1 when the paper writes only part of the DB name", () => {
    expect(nameSimilarity("AMIRA", "AMIRA KANYITOR")).toBe(1);
  });

  it("is 1 when the DB carries an extra middle name", () => {
    expect(nameSimilarity("AMIRA KANYITOR", "AMIRA GRACE KANYITOR")).toBe(1);
  });

  it("is 1 when word order is swapped", () => {
    expect(nameSimilarity("KANYITOR AMIRA", "AMIRA KANYITOR")).toBe(1);
  });

  it("is 0 for a different student", () => {
    expect(nameSimilarity("ADAKOLE BRIGHT", "AMIRA KANYITOR")).toBe(0);
  });

  it("is low for a shared surname only", () => {
    const score = nameSimilarity("KANYITOR ADAKOLE", "AMIRA KANYITOR");
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(0.6);
  });

  it("is 0 when either side is unreadable", () => {
    expect(nameSimilarity("", "AMIRA KANYITOR")).toBe(0);
    expect(nameSimilarity("AMIRA", "")).toBe(0);
  });
});

describe("assessIdentity", () => {
  it("accepts an exact name", () => {
    expect(assess("AMIRA KANYITOR").level).toBe("match");
  });

  it("accepts a two-token paper name with a typo", () => {
    expect(assess("AMIRA KANYTIOR").level).toBe("match");
  });

  it("caps a single-token paper at uncertain — surnames are shared by siblings", () => {
    const first = assess("AMIRA");
    expect(first.level).toBe("uncertain");
    expect(first.warning).toMatch(/Only one name/);

    const surname = assess("KANYITOR", 999);
    expect(surname.level).toBe("uncertain");
    expect(surname.admissionNoDiffers).toBe(true);
  });

  it("accepts a handwriting typo", () => {
    expect(assess("AMIRA KANYTTO").level).toBe("match");
  });

  it("accepts an OCR digit-for-letter slip", () => {
    expect(assess("AM1RA KANYITOR", null).level).toBe("match");
  });

  it("does NOT warn when only the admission number is wrong — teachers mistype it", () => {
    const result = assess("AMIRA KANYITOR", 999);
    expect(result.level).toBe("match");
    expect(result.warning).toBeNull();
    expect(result.admissionNoDiffers).toBe(true);
  });

  it("does NOT warn when the admission number is blank", () => {
    expect(assess("AMIRA KANYITOR", null).warning).toBeNull();
  });

  it("flags a different student", () => {
    const result = assess("ADAKOLE BRIGHT", 921);
    expect(result.level).toBe("mismatch");
    expect(result.warning).toMatch(/different student/i);
    expect(result.warning).toMatch(/ADAKOLE BRIGHT/);
  });

  it("treats a sibling sharing only a surname as a different student", () => {
    // A sibling is a different child, so the strong wording is correct: half the paper's tokens
    // matching is not enough to file this book under the wrong name.
    const result = assess("KANYITOR ADAKOLE", 921);
    expect(result.level).toBe("mismatch");
    expect(result.warning).toMatch(/different student/i);
  });

  it("is uncertain when most of the name matches but one token does not", () => {
    const result = assessIdentity({
      paperName: "AMIRA KANYITOR OKAFOR",
      paperAdmissionNo: null,
      dbName: "AMIRA KANYITOR",
      dbAdmissionNo: 521,
    });
    expect(result.level).toBe("uncertain");
  });

  it("flags an unreadable name rather than silently passing", () => {
    const result = assess("", 521);
    expect(result.level).toBe("uncertain");
    expect(result.warning).toMatch(/could not be read/i);
  });

  it("reports the similarity so the grid can show it", () => {
    expect(assess("AMIRA KANYITOR").similarity).toBe(1);
    expect(assess("ADAKOLE").similarity).toBe(0);
  });
});
