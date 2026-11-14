import { z } from "zod/v4";
import { createLibrary, defineComponent } from "@openuidev/react-lang";

const TextContent = defineComponent({
  name: "TextContent",
  description: "A short paragraph of readable text.",
  props: z.object({
    text: z.string().min(1).max(2_000)
  }),
  component: ({ props }) => (
    <p className="whitespace-pre-wrap text-sm leading-6 text-foreground">{props.text}</p>
  )
});

const Badge = defineComponent({
  name: "Badge",
  description: "A compact status label.",
  props: z.object({
    label: z.string().min(1).max(80),
    tone: z.enum(["neutral", "primary", "success", "warning", "danger"]).optional()
  }),
  component: ({ props }) => {
    const tone = props.tone ?? "neutral";
    const classes =
      tone === "primary"
        ? "border-primary/40 bg-primary/10 text-primary"
        : tone === "success"
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-300"
          : tone === "warning"
            ? "border-amber-500/30 bg-amber-500/10 text-amber-300"
            : tone === "danger"
              ? "border-destructive/40 bg-destructive/10 text-destructive"
              : "border-border bg-muted/50 text-muted-foreground";
    return (
      <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${classes}`}>
        {props.label}
      </span>
    );
  }
});

const Metric = defineComponent({
  name: "Metric",
  description: "A labelled number or short value.",
  props: z.object({
    label: z.string().min(1).max(80),
    value: z.string().min(1).max(80),
    note: z.string().max(200).optional()
  }),
  component: ({ props }) => (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{props.label}</div>
      <div className="mt-1 text-xl font-semibold tracking-tight">{props.value}</div>
      {props.note !== undefined ? (
        <div className="mt-1 text-xs text-muted-foreground">{props.note}</div>
      ) : null}
    </div>
  )
});

const Callout = defineComponent({
  name: "Callout",
  description: "A short highlighted note or warning.",
  props: z.object({
    title: z.string().min(1).max(120),
    text: z.string().min(1).max(1_000),
    tone: z.enum(["neutral", "warning", "danger"]).optional()
  }),
  component: ({ props }) => {
    const tone = props.tone ?? "neutral";
    const classes =
      tone === "danger"
        ? "border-destructive/30 bg-destructive/10"
        : tone === "warning"
          ? "border-amber-500/30 bg-amber-500/10"
          : "border-border bg-card";
    return (
      <section className={`rounded-lg border p-3 ${classes}`}>
        <h3 className="text-sm font-semibold">{props.title}</h3>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{props.text}</p>
      </section>
    );
  }
});

const Table = defineComponent({
  name: "Table",
  description: "A small read-only table. Maximum 20 rows.",
  props: z.object({
    columns: z.array(z.string().min(1).max(80)).min(1).max(8),
    rows: z.array(z.array(z.string().max(200))).max(20)
  }),
  component: ({ props }) => (
    <div className="overflow-hidden rounded-lg border border-border">
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left text-xs">
          <thead className="bg-muted/50 text-muted-foreground">
            <tr>
              {props.columns.map((column) => (
                <th className="px-3 py-2 font-medium" key={column} scope="col">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {props.rows.map((row, rowIndex) => (
              <tr key={`row-${rowIndex}`}>
                {row.map((cell, cellIndex) => (
                  <td className="px-3 py-2 text-foreground" key={`cell-${rowIndex}-${cellIndex}`}>
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
});

const StackChild = z.union([TextContent.ref, Badge.ref, Metric.ref, Callout.ref, Table.ref]);

const Stack = defineComponent({
  name: "Stack",
  description: "Vertical container. Children stack top to bottom with spacing.",
  props: z.object({
    children: z.array(StackChild).min(1).max(40)
  }),
  component: ({ props, renderNode }) => (
    <div className="flex flex-col gap-3">{renderNode(props.children)}</div>
  )
});

export const edapexLibrary = createLibrary({
  root: "Stack",
  components: [Stack, TextContent, Badge, Metric, Callout, Table],
  id: "edapex-v1"
});
