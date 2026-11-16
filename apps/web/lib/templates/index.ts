/**
 * Template dispatch.
 *
 * The `templateVersion` on the render payload is the contract: the server says which
 * template a document was archived under, so an old archive keeps rendering with the
 * template it was created with rather than being reinterpreted by today's code.
 */

import type {
  MarksheetPayload,
  RenderPayload,
  TemplateVersion,
  TranscriptPayload
} from "@edapex/contracts";

import { renderMarksheet } from "./marksheet";
import { renderTranscript } from "./transcript";

export type { TemplateVersion };

export interface RenderedDocument {
  readonly html: string;
  readonly filename: string;
  readonly templateVersion: TemplateVersion;
}

function renderMarksheetPayload(payload: MarksheetPayload): RenderedDocument {
  return {
    html: renderMarksheet(payload.document),
    filename: payload.filename,
    templateVersion: payload.templateVersion
  };
}

function renderTranscriptPayload(payload: TranscriptPayload): RenderedDocument {
  return {
    html: renderTranscript(payload.document),
    filename: payload.filename,
    templateVersion: payload.templateVersion
  };
}

/**
 * Renders a payload to HTML.
 *
 * `templateVersion` is checked, not assumed. A payload claiming a template this bundle
 * does not have is version skew between the API and the app, and rendering it through a
 * neighbouring template produces a plausible-looking but wrong report card — the worst
 * possible failure for a document a parent keeps.
 */
export function renderTemplate(payload: RenderPayload): RenderedDocument {
  switch (payload.templateVersion) {
    case "marksheet@1":
      return renderMarksheetPayload(payload);
    case "transcript@1":
      return renderTranscriptPayload(payload);
    case "transcript-history@1":
      // Deliberately unimplemented rather than silently falling back to a transcript:
      // the history document has a different shape, and the transcript template would
      // drop every term while still looking valid. Lands with the retrieval UI.
      throw new Error("The transcript-history template is not implemented yet.");
    default: {
      const exhaustive: never = payload;
      throw new Error(`Unknown template version: ${String(exhaustive)}`);
    }
  }
}
