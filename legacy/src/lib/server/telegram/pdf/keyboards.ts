/**
 * Inline-keyboard builders for the parent bot pickers.
 *
 * Telegram constraints (verified against @chat-adapter/telegram@4.31.0):
 *   - 8 buttons per row, 100 rows per inline_keyboard
 *   - 64 bytes total for callback_data (including the "chat:" prefix the
 *     adapter prepends), so our own actionId + value must stay under
 *     ~40 bytes after JSON encoding.
 *
 * Each builder returns a `Card({ children: [Actions([...])] })` so the
 * `PostableCard` shape matches the adapter's expected `CardElement` root.
 */
import { Actions, Button, Card, type CardElement } from "chat";

const MAX_BUTTONS = 8;

export type PickerKind = "child" | "term" | "year";

const KIND_OPCODE: Record<PickerKind, string> = {
  child: "c",
  term: "t",
  year: "y",
};

export function encodeActionId(kind: PickerKind, ...args: Array<string | number>): string {
  const op = KIND_OPCODE[kind];
  const parts = [op, ...args.map((a) => String(a))];
  const id = parts.join(":");
  if (Buffer.byteLength(id, "utf8") > 40) {
    throw new Error(`ActionId too long (${id.length} bytes): ${id}`);
  }
  return id;
}

export function decodeActionId(id: string): { kind: PickerKind; args: string[] } | null {
  if (id === "x:cancel") return { kind: "child", args: ["cancel"] };
  const [op, ...args] = id.split(":");
  if (op === "c") return { kind: "child", args };
  if (op === "t") return { kind: "term", args };
  if (op === "y") return { kind: "year", args };
  return null;
}

export interface ChildOption {
  studentId: number;
  label: string;
}

export function childKeyboard(options: ChildOption[]): CardElement {
  const buttons = options.slice(0, MAX_BUTTONS).map((opt) =>
    Button({
      id: encodeActionId("child", opt.studentId),
      label: opt.label,
    }),
  );
  return Card({ children: [Actions(buttons)] });
}

export interface TermOption {
  examTypeId: number;
  label: string;
}

export function termKeyboard(options: TermOption[]): CardElement {
  const buttons = options.slice(0, MAX_BUTTONS).map((opt) =>
    Button({
      id: encodeActionId("term", opt.examTypeId),
      label: opt.label,
    }),
  );
  return Card({ children: [Actions(buttons)] });
}

export interface YearOption {
  academicId: number;
  label: string;
}

export function yearKeyboard(options: YearOption[]): CardElement {
  const buttons = options.slice(0, MAX_BUTTONS).map((opt) =>
    Button({
      id: encodeActionId("year", opt.academicId),
      label: opt.label,
    }),
  );
  return Card({ children: [Actions(buttons)] });
}

export function cancelKeyboard(): CardElement {
  return Card({
    children: [
      Actions([
        Button({ id: "x:cancel", label: "Cancel" }),
      ]),
    ],
  });
}
