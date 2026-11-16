# TypeScript Type Safety Audit & Fix

## Scope
Audit and fix all `.ts` and `.svelte` files under: `src/lib/server/mastra/`

---

## Mission
Scan every TypeScript file in the scoped directory. For each file, identify and fix ALL type safety violations. Do not skip files. Do not leave partial fixes. Every file must compile with zero type errors when complete.

## Banned Types — Replace On Sight
| Banned | Replacement |
|--------|-------------|
| `any` | Concrete type, generic `<T>`, or `unknown` with an immediate type guard |
| `never` (as explicit annotation) | Let TS infer `never`; use exhaustive `switch` returns |
| `unknown` (without a type guard) | `unknown` + an inline type guard or assertion function |
| `object` | A specific interface or `Record<string, V>` |
| `Function` | `(...args: Params) => Return` with explicit params and return |
| `{}` | A named interface or `Record<string, unknown>` |
| `@ts-ignore` / `@ts-expect-error` | Fix the underlying type issue; if third-party, wrap in a typed adapter |

## Required Fixes
1. **Kill `as` casts**: Replace `as Type` with type guards (`is`), assertion functions (`asserts x is T`), or `satisfies`. The only allowed cast is `as const`.
2. **Add explicit return types** to every exported function, server action, and API handler.
3. **Use utility types**: Replace hand-rolled partial interfaces with `Omit<T, K>`, `Pick<T, K>`, `Partial<T>`, `Required<T>`, `Readonly<T>`.
4. **Infer from Zod schemas**: Replace duplicated interfaces with `z.infer<typeof schema>`.
5. **Constrain generics**: Change bare `<T>` to `<T extends Base>` wherever a bound exists.
6. **Narrow catch blocks**: Change `catch (e: any)` or `catch (e)` to `catch (e: unknown)` with immediate narrowing via `instanceof` or a type guard.
7. **Type event handlers**: Replace `(e: any) => void` with framework-specific event types (e.g., SvelteKit `RequestEvent`, `FormEventHandler<HTMLInputElement>`).
8. **Discriminated unions**: Replace interfaces with optional fields that represent mutually exclusive states with tagged unions (`{ kind: 'a'; ... } | { kind: 'b'; ... }`).
9. **Narrow index signatures**: Replace `Record<string, any>` with `Record<SpecificKey, V>` or at minimum `Record<string, unknown>`.
10. **Use `as const`** for fixed string unions, config objects, and enum-like values.

## Process
1. List all `.ts` and `.svelte` files in the scoped directory (recursive).
2. For each file:
   a. Read the file contents.
   b. Identify every violation from the rules above.
   c. Apply fixes directly — no TODOs, no placeholders, no "you should change this" comments.
   d. Preserve all existing non-type-related logic, comments about business tradeoffs, and formatting.
3. After fixing each file, run: `pnpm run svelte-check --workspace <path>` or `pnpm run lint <path>`.
4. Iterate until zero type errors remain.
5. Produce a summary table:

| File | Violations Found | Fixes Applied | Clean? |
|------|-----------------|---------------|--------|

## Constraints
- Do NOT change runtime behavior. Type fixes only.
- Do NOT add instructional comments like `// fixed type here`.
- Do NOT widen types to silence errors — narrow them.
- If a third-party library forces `any`, create a thin typed wrapper and document why in a single-line comment.
