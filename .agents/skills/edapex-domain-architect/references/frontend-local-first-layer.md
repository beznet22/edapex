# Frontend & Local-First Constraints

Guided by the `tanstack-integration-best-practices` and `react-db` skills, the `frontend/` layer handles the reactive presentation and local-first data lifecycle.

## 1. Technology Stack (Verified)

The EdApex frontend uses the following stack — all new code MUST use these exact dependencies:

| Technology | Version | Purpose |
|:---|:---|:---|
| **React** | 19.x | UI rendering |
| **TanStack Start** | latest | Meta-framework (SPA mode) |
| **TanStack Router** | latest | File-based type-safe routing |
| **TanStack Query** | 5.x | Server state & caching |
| **TanStack DB** | 0.6.x | Local-first reactive collections |
| **@tanstack/react-db** | 0.1.x | React bindings (`useLiveQuery`) |
| **Tailwind CSS** | **4.1.x** | Utility-first styling (v4 syntax) |
| **@tailwindcss/vite** | 4.1.x | Vite plugin (NOT PostCSS) |
| **@tailwindcss/typography** | 0.5.x | Prose content styling |
| **Shadcn UI** | — | Component library (`components/ui/`) |
| **Radix UI** | — | Headless primitives (via Shadcn) |
| **class-variance-authority** | — | Variant-based component styling |
| **clsx + tailwind-merge** | — | `cn()` utility for class merging |
| **Lucide React** | 0.545.x | Icon library (ONLY icon set) |
| **AI SDK** | 4.x + `@ai-sdk/react` | AI chat interfaces |
| **Vite** | 7.x | Build tool |
| **Zod** | 3.x | Client-side validation |

> [!CAUTION]
> **Tailwind CSS v4** uses a fundamentally different configuration system. There is NO `tailwind.config.ts`. Configuration is done via CSS `@theme` directives in `styles.css`. Do NOT generate v3-style config files.

## 2. Tailwind CSS v4 — EdApex Design System

The EdApex design system is defined via CSS custom properties in `frontend/src/styles.css`, NOT a Tailwind config file.

### Import Pattern
```css
@import "tailwindcss";
@plugin "@tailwindcss/typography";

@theme {
  --font-sans: "Manrope", ui-sans-serif, system-ui, sans-serif;
}
```

### Color Tokens (CSS Variables)
```css
:root {
  --sea-ink: #173a40;        /* Primary text */
  --sea-ink-soft: #416166;   /* Secondary text */
  --lagoon: #4fb8b2;         /* Accent / CTA */
  --lagoon-deep: #328f97;    /* Links / hover states */
  --palm: #2f6a4a;           /* Success / green accents */
  --sand: #e7f0e8;           /* Light surface */
  --foam: #f3faf5;           /* Lightest background */
  --surface: rgba(255,255,255,0.74);  /* Glassmorphism panels */
  --line: rgba(23,58,64,0.14);        /* Borders */
  --bg-base: #e7f3ec;                 /* Page background */
}
```

### Usage in Tailwind v4
```tsx
// ✅ Correct v4 syntax — use CSS variables with parentheses
<div className="bg-(--surface) border-(--line) text-(--sea-ink)">

// ❌ Wrong — v3 arbitrary value syntax (brackets)
<div className="bg-[var(--surface)]">
```

### Dark Mode
Dark mode is handled via `data-theme="dark"` attribute and `prefers-color-scheme: dark` media query — both defined in `styles.css`. All colors automatically swap via CSS variables.

## 3. Shadcn UI Component Pattern

Components live in `frontend/src/components/ui/` and follow the Shadcn standard:

```typescript
// Uses @radix-ui/react-slot for composition
import { Slot } from "@radix-ui/react-slot"
// Uses class-variance-authority for variants
import { cva, type VariantProps } from "class-variance-authority"
// Uses cn() utility from @/lib/utils
import { cn } from "@/lib/utils.js"
```

When adding new Shadcn components:
- Install via `npx shadcn@latest add <component>`
- Component lands in `frontend/src/components/ui/`
- Uses `cn()` for class merging (clsx + tailwind-merge)

## 4. TanStack Start & Router Integration

- **SPA Mode**: TanStack Start is configured as SPA with SSR-Query integration for optimal data loading.
- **Type-Safe Routing**: File-based routing in `frontend/src/routes/`. All navigation MUST use `<Link>` or `useNavigate()` with full type checking.
- **Route Configuration**: Router uses `defaultPreload: 'intent'` and `scrollRestoration: true`.
- **Query Integration**: Uses `@tanstack/react-router-ssr-query` for data loading coordination.

### Query Key Conventions
```typescript
// Structured query keys: [domain, entity, tenantId, ...params]
['finance', 'ledger', tenantId, { page: 1 }]
['academic', 'classes', tenantId, academicId]
['assessment', 'exams', tenantId, { examType: 'midterm' }]
```

## 5. Local-First & TanStack DB

- **Collection-First Logic**: UI components interact with `db.collection` via `useLiveQuery`. Never fetch data directly from the API in a component.
- **Sync Reconciliation**: Every domain feature MUST be registered in `synchronizeWithEdge()` in `frontend/src/lib/sync.ts`.

### Sync Registration Pattern
When adding a new domain collection:
1. Define the collection in `frontend/src/lib/db.ts` using `createCollection`.
2. Register the sync handler in `frontend/src/lib/sync.ts` with upsert logic.
3. Use `useLiveQuery` in components to bind to the collection reactively.

```typescript
// sync.ts — Register new domain sync handler
if (updates.ledgerEntries) {
  for (const entry of updates.ledgerEntries) {
    const existing = await db.ledgerEntries.get(entry.id);
    if (existing) {
      db.ledgerEntries.update(entry.id, (draft) => Object.assign(draft, entry));
    } else {
      db.ledgerEntries.insert(entry);
    }
  }
}
```

## 6. AI Interfaces

- Use **AI SDK** (`@ai-sdk/react`) for chat UI hooks: `useChat`, `useCompletion`, `useAssistant`.
- Chat components should follow the Stateless AI execution pattern from the service layer.
- All AI interactions must track token usage for billing via deferred events.

## 7. Design Constraints

- **Icons**: Use **Lucide React** (`lucide-react`) exclusively. No emoji icons. No mixing icon sets.
- **Typography**: Manrope (sans-serif) for body, Fraunces (serif) for display titles.
- **Glassmorphism**: Use the `.island-shell` and `.feature-card` CSS classes for glassmorphic panels.
- **Micro-animations**: Use the `.rise-in` animation class and CSS transitions (150-300ms).
- **Responsive First**: All layouts MUST be mobile-first. Use Tailwind breakpoints (`sm:`, `md:`, `lg:`).
- **PWA Support**: Support standalone and fullscreen modes via the Fullscreen API.
- **Dark Mode**: Always test both light and dark themes. Use CSS variables, never hardcode colors.
