import { describe, expect, it } from "vitest";

import { validateSource } from "../../scripts/service-rule-engine.mjs";

const messages = (file: string, source: string): readonly string[] =>
  validateSource(file, source).map((violation) => violation.message);

describe("service boundary rules", () => {
  it("rejects node:crypto, fs and the markdown linter", () => {
    expect(messages("assessment/x.service.ts", 'import crypto from "node:crypto";\n')).toContain(
      'imports banned module "node:crypto"'
    );
    expect(messages("assessment/x.service.ts", 'import fs from "fs";\n')).toContain(
      'imports banned module "fs"'
    );
    expect(
      messages(
        "assessment/x.service.ts",
        'import { parse } from "$lib/utils/marksheet-ast-parser";\n'
      )
    ).toContain(
      'imports banned module "$lib/utils/marksheet-ast-parser"'
    );
  });

  it("rejects service-to-service and repository imports outside the context", () => {
    expect(
      messages(
        "assessment/entry.service.ts",
        'import { GeneralService } from "../settings/general.service";\n'
      )
    ).toContain('imports another service class: "../settings/general.service"');

    expect(
      messages(
        "assessment/entry.service.ts",
        'import { findReportSettings } from "../../repository/school";\n'
      )
    ).toContain('imports the repository layer: "../../repository/school"');

    expect(
      messages(
        "adapters/x.adapter.ts",
        'import { findReportSettings } from "../../repository/school";\n'
      )
    ).toContain('imports the repository layer: "../../repository/school"');
  });

  it("rejects module state, any, casts, direct db access and oversized files", () => {
    expect(messages("assessment/x.service.ts", "export const cache = new Map();\n")).toContain(
      "declares a module-scope Map/Set"
    );
    expect(messages("assessment/x.service.ts", "export const x: any = 1;\n")).toContain(
      "uses `any`"
    );
    expect(messages("assessment/x.service.ts", "export const x = value as Foo;\n")).toContain(
      "uses an `as` type cast"
    );
    expect(messages("assessment/x.service.ts", "export const x = ctx.db.select();\n")).toContain(
      "uses the repository db handle directly"
    );
    expect(
      messages("assessment/long.service.ts", "export const x = 1;\n".repeat(401))
    ).toContain("file has 402 lines, cap is 400");
  });

  it("rejects runtime imports outside the domain folder", () => {
    expect(messages("domain/marks.ts", 'import { z } from "zod";\n')).toContain(
      'domain imports a non-relative runtime module: "zod"'
    );
    expect(
      messages("domain/marks.ts", 'import { x } from "../context/service-context";\n')
    ).toContain(
      'domain imports runtime code from outside its folder: "../context/service-context"'
    );
  });

  it("accepts a clean domain function", () => {
    expect(messages("domain/marks.ts", "export const add = (a: number, b: number): number => a + b;\n")).toEqual([]);
  });
});
