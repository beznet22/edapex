# Frontend & Local-First Constraints

Guided by the `tanstack-integration-best-practices` and `react-db` skills, the `frontend/` layer handles the reactive presentation and local-first data lifecycle.

## 1. TanStack Start & Query Integration
- **SSR-A ware Loading**: Use `createQueryClient` with hydration/dehydration support in TanStack Start routes.
- **Type-Safe Routing**: All links and navigation MUST use the TanStack Router `Link` or `navigate` with full type checking.
- **Loader Pattern**: Data fetching for pages MUST happen in route loaders using `queryClient.ensureQueryData`.

## 2. Local-First & UI Stack
- **Shadcn UI**: Strictly use `@/components/ui` primitives.
- **AI-Elements**: Use [AI Elements](https://www.npmjs.com/package/ai-elements) for all AI/Chat interfaces.
- **Collection-First Logic**: UI components interact with `db.collection` via `useLiveQuery`.
- **Sync Reconciliation**: Every domain feature must be registered in the `synchronizeWithEdge` function.

## 3. Design Guidelines (UI/UX Pro Max)
- **Consistency**: Use `primary` color for actions, `muted` for secondary info.
- **Micro-animations**: Subtle Framer Motion transitions for state changes.
- **No SSR**: TanStack Start must be configured in SPA mode for maximum portability.
