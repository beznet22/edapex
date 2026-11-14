# `@edapex/genui`

The generative-UI surface: an OpenUI Lang catalog, a parser, a validator and a
React renderer. The model emits a typed surface; this package decides whether it
is acceptable and renders it.

| | |
|---|---|
| Package | `@edapex/genui` (library, never deployed) |
| Runtime deps | `@edapex/contracts`, `@openuidev/lang-core`, `@openuidev/react-lang`, `zod` |
| Peer dep | `react` 19 |
| Consumed by | `apps/web` |

## The security property

**Generated UI is data, never code.** The model can only name components that
exist in the catalog and pass props validated against their schema. Nothing in
this package evaluates a string as JavaScript, and there is no `eval`, no
`new Function`, and no dynamic `import` of model output.

A surface that fails validation is rejected whole rather than partially rendered.

## Modules

| Module | Responsibility |
|---|---|
| `catalog.tsx` | Component catalogue: names, Zod prop schemas, renderers |
| `renderer.tsx` | Walks a validated surface and renders it |
| `index.ts` | Public exports |

## Relationship to the other surfaces

| Concept | Package | Carried as |
|---|---|---|
| Markdown answer | chat renderer | text part |
| Generated UI | **this package** | `SurfacePart` |
| External agent transport | `@edapex/contracts/agui` | AG-UI events |

These are three different things and must not be conflated: AG-UI is how an
external agent talks to EdApex, OpenUI is what the model may compose *inside* a
message, and Markdown is plain text.

A2UI is explicitly **out of scope** for v1.

## Working on it

```bash
pnpm --dir packages/genui exec tsc --noEmit
pnpm --dir packages/genui exec vitest run
```

`catalog.test.ts` is the guard: a component added to the catalogue without a prop
schema, or a renderer whose props do not match its schema, fails there.
