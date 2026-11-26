/**
 * Shared presentation constants for the `/people` dialogs and forms.
 *
 * The dialog shell is deliberately mobile-first: `overflow-x-hidden` keeps the
 * modal to a single vertical scroll axis, and the top padding clears the
 * built-in close button so it never sits on top of the title.
 */
export const DIALOG_CONTENT =
  "max-h-dvh w-full overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-popover p-4 pt-12 text-popover-foreground sm:max-w-lg sm:p-6 sm:pt-12";

export const DIALOG_CONTENT_WIDE =
  "max-h-dvh w-full overflow-x-hidden overflow-y-auto rounded-xl border border-border bg-popover p-4 pt-12 text-popover-foreground sm:max-w-2xl sm:p-6 sm:pt-12";

/** Labels are secondary; values are primary. Keeps the two readable apart. */
export const FIELD_LABEL = "text-sm font-normal text-muted-foreground";

/** Inputs keep the foreground text colour so values out-rank their labels. */
export const FIELD_INPUT = "min-h-11 bg-background text-foreground sm:min-h-9";
