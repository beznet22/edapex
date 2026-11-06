import type { ServiceContext } from "../context";
import { ArchiveIncompleteError, ArchiveVersionError } from "../errors";
import type { ArchiveDocument } from "../../../schema/archive";
import { readArchiveDocument } from "./archive-object";

interface ArchiveRowLike {
  readonly objectKey: string;
  readonly checksum: string;
}

/** Reads, verifies and decodes one archived document; failures become domain errors. */
export async function loadArchiveDocument(
  ctx: ServiceContext,
  row: ArchiveRowLike
): Promise<ArchiveDocument> {
  const loaded = await readArchiveDocument(ctx.ports.archiveStore, row);
  if (loaded.kind === "missing" || loaded.kind === "checksum") {
    throw new ArchiveIncompleteError("The archive object failed verification");
  }
  if (loaded.kind === "unsupported") throw new ArchiveVersionError(loaded.schemaVersion);
  if (loaded.kind === "invalid") {
    throw new ArchiveIncompleteError("The archive object could not be decoded");
  }
  return loaded.document;
}
