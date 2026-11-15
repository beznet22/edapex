import { describe, expect, it } from "vitest";

import type {
  MarksheetDocument,
  TranscriptDocument
} from "@edapex/contracts";
import { marksheetSchema } from "../src/lib/schema/marksheet";
import { transcriptSchema } from "../src/lib/schema/transcript";

/**
 * The render contract must keep matching the server schema.
 *
 * `packages/contracts/src/documents.ts` is what the PDF templates read. The authoritative
 * shape is the zod schema here, and nothing else would connect the two: a field rename in
 * the schema would compile fine and render a blank cell in a report card a parent keeps.
 *
 * These assertions are type-level, so they fail at `tsc` rather than at runtime.
 */
/**
 * Asserts `TActual` satisfies `TContract`.
 *
 * Direction matters: the schema must provide everything the template reads. Written the
 * other way round this passes while a renamed field quietly renders a blank cell.
 */
type Satisfies<TActual extends TContract, TContract> = TActual;

describe("render contract conformance", () => {
  it("marksheet satisfies the render contract", () => {
    type Schema = ReturnType<typeof marksheetSchema.parse>;
    type Check = Satisfies<Schema, MarksheetDocument>;
    // Referenced so the compiler keeps the assertion rather than eliding it.
    expect<Check>({} as Check).toBeDefined();
  });

  it("transcript satisfies the render contract", () => {
    type Schema = ReturnType<typeof transcriptSchema.parse>;
    type Check = Satisfies<Schema, TranscriptDocument>;
    expect<Check>({} as Check).toBeDefined();
  });
});
