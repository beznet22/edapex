# ActionBar

## Overview

`ActionBar` is the unified **action-required surface** for the Edapex chat UI. It sits directly above the `ChatComposer` and renders whenever the workflow needs the user to make a decision before it can continue — picking an option, granting a permission, disambiguating an intent, or resuming a suspended step.

A single component owns every interaction shape so the chat surface stays predictable: a header with a shield icon and a short `question`, a row of choice pills, and (by default) a free-text fallback pill so the user can always type their own answer instead of picking one.

The free-text fallback is **always available** unless a parent explicitly sets `allowFreeText={false}`. This is a hard product guarantee: the user is never forced into a pill choice they did not write themselves.

## Modes

The component is designed to render four distinct action shapes. Today only **single-select** is wired up end-to-end; the others are reserved in the API for upcoming flows.

| Mode | Triggers when… | User sees | User can do | Status |
|------|-----------------|-----------|-------------|--------|
| `permission` | An agent wants to invoke a privileged tool (file write, send message, calendar mutate, …) | Question phrased as a request, pills like `Allow` / `Deny` / `Allow once` | Pick a pill, or type conditions in free-text | Planned |
| `single-select` | The workflow has finished emitting options for an ambiguity, intent, or clarification question | One `question`, a row of 1–N option pills, plus the free-text pill | Pick one pill or type a custom answer | **Implemented** |
| `ambiguity` | The intent classifier is below its 90 % confidence threshold on the user's message | Same shape as single-select, but the question explicitly asks which intent to commit to | Pick the intended intent, or clarify in free-text | Planned |
| `workflow-resume` | A Mastra `runId` / `stepId` is suspended and waiting on resume data | Question describing the suspended step, pills being the enumerated resume payloads | Pick a payload to resume with, or supply a different one in free-text | Planned |

The runtime prop surface does not expose a `mode` discriminator today — the parent (`ChatMessages` / chat stream consumer) decides which question text and which `options` array to feed in. The four modes are a forward-looking contract.

## Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `question` | `string` | yes | Short prompt shown next to the shield icon. One sentence, no trailing punctuation required. |
| `options` | `OptionItem[]` | yes | The pills to render. Each item: `{ id: string; label: string; icon?: string }`. The `id` is what comes back in the `onSelect` payload. |
| `runId` | `string` | yes | The Mastra workflow `runId`. Echoed on the wrapping `data-run-id` attribute and forwarded into the resume payload. |
| `stepId` | `string` | yes | The suspended step id (e.g. `selectionGate`). Echoed on `data-step-id` and forwarded into the resume payload. |
| `allowFreeText` | `boolean` | no, defaults to `true` | Whether to render the `Type your own answer` secondary pill and the free-text form. Set `false` only when the workflow genuinely cannot accept arbitrary text (e.g. hard permission gates with binary allow/deny). |
| `onSelect` | `(payload) => void` | yes | Fired when the user resolves the bar — either by picking a pill or submitting free-text. See **Events** below. |

`OptionItem` is locally typed in the component and not exported. Treat the shape above as the public contract.

## Events

The component emits a single `onSelect` callback with this payload:

```ts
{
  selectedOptionId: string;        // the option.id, or a generated id for free-text
  freeTextAnswer?: string;         // present only when the user typed their own answer
}
```

When a pill is clicked, `selectedOptionId` is `option.id` and `freeTextAnswer` is omitted. When the free-text form is submitted, `selectedOptionId` is synthesized as `free_text_<timestamp>` and `freeTextAnswer` carries the trimmed input.

The parent is responsible for translating this into a Mastra `run.resume({ step: stepId, resumeData: { selectedOptionId, freeTextAnswer } })` call. The component itself never talks to the workflow directly.

## Theming

ActionBar is styled entirely with the Gold-on-Slate `oklch` tokens defined in `src/routes/layout.css`. The component references every color through a CSS custom property with a hard-coded `oklch` fallback so it never breaks when tokens are re-themed.

| Token | Used for |
|-------|----------|
| `--color-border` | Pill borders, form input border, cancel button border |
| `--color-card` | Bar background |
| `--color-background` | Pill background, input background |
| `--color-foreground` | Question text, pill label text, input text |
| `--color-primary` | Shield icon, hover pill border, focus ring, submit button background |
| `--color-primary-foreground` | Submit button label |
| `--color-accent` | Pill hover background |
| `--color-muted-foreground` | Form label text, cancel button icon |

Do not hard-code colors in callers. If a new surface in the bar needs a color, add a token to `layout.css` and reference it from here.

## Free-text fallback

By default `allowFreeText` is `true`, so the bar always renders a secondary italic pill labelled `Type your own answer`. Clicking it swaps the pill row for an inline form: a labelled `<input type="text">`, a `Send` button, and a cancel (`X`) button.

Submission rules:

- The submit button is disabled while the trimmed input is empty.
- On submit, the input is trimmed; an empty value is silently rejected (no callback fires).
- A successful submission fires `onSelect({ selectedOptionId: 'free_text_<timestamp>', freeTextAnswer: <trimmed text> })`.
- The cancel button restores the pill row and clears the input — it does not fire `onSelect`.

When `allowFreeText={false}` the secondary pill is omitted entirely and the free-text form is unreachable.

## Keyboard navigation

ActionBar is built on native form controls so it inherits standard keyboard behaviour:

- **Tab / Shift+Tab** moves focus through the pills in DOM order, then into the input (if the free-text form is open), then through `Send` and the cancel button.
- **Enter** on a focused pill triggers its `onclick` handler. **Enter** inside the free-text input submits the form via the native submit handler.
- **Escape** on the free-text input cancels: the form is hidden and the input is cleared. There is no global Escape handler on the bar itself; cancel only fires when the input has focus.
- All actionable elements show a 2 px `--color-primary` focus ring via `:focus-visible` for keyboard users.

## Workflow integration

ActionBar is the user-facing half of the Mastra **selection gate** pattern. The server-side half lives in `src/lib/server/mastra/workflows/chat.ts` as `selectionGateStep`.

The lifecycle:

1. **Suspend.** When the workflow reaches `selectionGateStep` with a `pendingSelection` set in `requestContext`, it emits a `data-selectOption` stream event containing `{ options, promptText, runId, stepId }`, then calls `suspend({...})`. The chat stream consumer reads that event and mounts `<ActionBar />` with the matching props.
2. **User action.** The user clicks a pill (or submits free-text). `onSelect` fires in the parent, which calls `run.resume({ step: 'selectionGate', resumeData: { selectedOptionId, freeTextAnswer? } })`.
3. **Resume.** `selectionGateStep` receives `resumeData`, resolves the chosen option's label, writes the selection back into `requestContext` under `pending.contextKey`, and returns its output schema. The workflow continues into `continuationAssistantStep`.

The step id is exported as `SELECTION_GATE_STEP_ID` from `chat.ts` — import it in the resume endpoint so the step string stays in sync with the workflow definition.

For other modes the wiring is the same: any step that calls `suspend({...})` with an options-shaped payload can be surfaced through ActionBar as long as the chat stream emits a matching `data-*` event and the resume route forwards `selectedOptionId` into the correct `step`.