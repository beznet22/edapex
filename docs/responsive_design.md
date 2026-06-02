# Responsive Design Guidelines

## 1. Core Philosophy: Mobile-First with Tailwind v4
Our approach is strictly **mobile-first**. Base utility classes must target the smallest screens, using Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, etc.) to progressively enhance the layout for larger viewports.

> [!IMPORTANT]
> Responsiveness is not a feature; it is the core foundation of the EdApex orchestration layer. The UI must feel premium and "spacious" regardless of pixel density.

* **Write base classes for mobile:** Single-column layouts (`flex-col`), stacked elements, and touch-optimized interactions.
* **Progressive Enhancement:** Use `md:`, `lg:`, etc., to introduce multi-column grids (`md:grid md:grid-cols-2`), hover states (`hover:`), and expanded navigation.
* **Dynamic Viewport Units:** Use `h-dvh`, `min-h-dvh`, and `max-h-dvh` for elements that must fill the visible viewport. These adjust dynamically as mobile browser chrome (address bars) expands and collapses.
  * `dvh` — Dynamic: changes as browser chrome shows/hides. Use for full-height containers.
  * `svh` — Small: viewport height when browser chrome is **fully expanded** (the smallest possible height). Use for guaranteed-visible layouts where content must never be hidden behind browser UI.
  * `lvh` — Large: viewport height when browser chrome is **fully hidden**. Use for hero sections that maximize space.
* **Never use `h-screen` or `vh`** — these are unreliable on mobile browsers.

## 2. Breakpoint & Orientation System
We use Tailwind's default breakpoint scale, combined with built-in orientation variants (`portrait:`, `landscape:`) where device posture drastically changes the available UI space.

| Prefix | Min-Width | Target Device / Context |
| :--- | :--- | :--- |
| *(base)* | `0px` | Small phones, standard mobile portrait |
| `sm:` | `640px` | Large phones, phablets |
| `md:` | `768px` | Small tablets (portrait) |
| `lg:` | `1024px` | **Threshold:** Tablets (landscape), small laptops |
| `xl:` | `1280px` | Standard desktops |
| `2xl:` | `1536px` | Large desktops, ultrawide monitors |

**Tablet Landscape Exception:** Tablets in landscape mode often have widths between `800px` and `1100px`. To prevent cramped layouts, we treat **Tablet Landscape** identically to Desktop (`lg:`) for structural layout components. We achieve this in Tailwind by combining the `md:` breakpoint with the `landscape:` variant (e.g., `md:landscape:flex-row`).

## 3. The Right Side Panel ➡️ Bottom Sheet Rule
A core tenet of our responsive architecture is how secondary content, detail views, filters, and contextual actions are handled. 

**The Rule:** Right-side panels on desktop and landscape tablets **must** transform into Bottom Sheets on phones and portrait tablets.

### Breakpoint & Orientation Behavior
* **Phones & Portrait Tablets:** Secondary content is hidden off-screen at the bottom and invoked as a **Bottom Sheet** (Drawer).
* **Landscape Tablets & Desktops (`lg:` OR `md:landscape:`):** Secondary content is pinned or sliding in from the right as a **Side Panel** (Sheet).

### Implementation: `ResponsiveSheet.svelte`
The canonical implementation lives in `src/lib/components/shared/responsive-sheet.svelte`. This component:
- Uses **`vaul-svelte` Drawer** on mobile (bottom sheet with drag handle, scroll trapping, backdrop)
- Uses **shadcn Sheet** on desktop (side panel sliding from the right)
- Automatically switches via the `IsMobile` hook at the 768px breakpoint
- Handles keyboard avoidance, focus management, and safe area insets

```svelte
<ResponsiveSheet
  bind:open={isOpen}
  title="Panel Title"
  description="Supporting text"
>
  <!-- Panel content -->
</ResponsiveSheet>
```

> [!IMPORTANT]
> **Do NOT build manual bottom sheet / side panel patterns** with raw Tailwind translate utilities. Always use `ResponsiveSheet` or extend it. The component handles drag gestures, scroll trapping, focus management, keyboard avoidance, and safe area padding automatically.

### Bottom Sheet UX (Handled by `vaul-svelte` Drawer)
1. **Drag Handle:** Automatically rendered by `ResponsiveSheet` (visual grabber at top of drawer).
2. **States:** Supports half-screen (default, `max-h-[85vh]`) and full-screen snapping.
3. **Dismissal:** Swipe down, tap backdrop, or close button — all handled by the Drawer component.
4. **Scroll Trapping:** Background scroll is locked. Focus is trapped within the sheet. Use `data-vaul-no-drag` on scrollable content areas.

## 4. Standard Component Adaptation Matrix

All standard UI components must adapt based on the breakpoints defined above. 

| Component | Mobile & Portrait Tablet (Base) | Landscape Tablet & Desktop (`lg:` / `md:landscape:`) |
| :--- | :--- | :--- |
| **Modals / Dialogs** | **Full-Screen Takeover.** `fixed inset-0 flex flex-col`. Slides up from bottom. Includes explicit "Back" or "Close" header. | **Centered Overlay.** `fixed inset-0 flex items-center justify-center`. Constrained width (`max-w-lg w-full`), centered with a dimmed backdrop. |
| **Forms & Inputs** | **Single Column.** `flex flex-col gap-4`. Full-width inputs (`w-full`). Stacked labels. | **Multi-Column.** `md:grid md:grid-cols-2 md:gap-6`. Labels can be inline. Constrain form width for readability (`max-w-2xl`). |
| **Navigation** | **Sidebar (Drawer overlay).** Primary destinations in a slide-out sidebar triggered by hamburger icon. No persistent bottom nav — maximizes vertical content space. | **Sidebar / Top Nav.** Persistent left sidebar (`w-64 flex-shrink-0`) or horizontal top navigation (`flex items-center justify-between`). |
| **Data Tables** | **Card Lists.** Hide table (`hidden`). Show stacked cards (`flex flex-col gap-4`) where headers become text labels (`text-sm text-muted-foreground`). | **Standard Table.** Hide cards (`hidden lg:block`). Show table (`lg:table w-full`). Sticky headers (`sticky top-0`). |
| **Tabs** | **Horizontal Scroll.** `flex overflow-x-auto snap-x snap-mandatory`. Hide scrollbars. If > 4 tabs, consider vertical Accordions (`flex flex-col`). | **Standard Horizontal Tabs.** `flex gap-4`. All tabs visible. If they overflow, use explicit left/right carousel arrow buttons. |
| **Tooltips / Help** | **Popovers / Expandables.** No hover state. Use info icons with `active:scale-95` that trigger shadcn `Popover` or inline `<details>` elements. | **Tooltips.** Triggered on `hover:` and `focus:`. Use shadcn `Tooltip` component which automatically handles positioning and accessibility. |
| **Buttons (Primary)**| **Full Width.** `w-full` or sticky to bottom (`sticky bottom-4 w-full`). Min-height 48px (`min-h-12`). | **Auto Width.** `w-auto`. Sized to content (`px-6 py-3`). Placed inline or right-aligned (`ml-auto`) in form footers. |
| **Date/Time Pickers**| **Drawer Picker.** Use shadcn date components rendered inside a `ResponsiveSheet` (Drawer on mobile). Touch-friendly calendar grid with `min-h-12` day cells. | **Popover Picker.** Shadcn date popover attached to the input field. Custom calendar dropdown with absolute positioning. |

## 5. Typography & Spacing

### Responsive Typography
Use Tailwind's responsive prefixes to scale typography smoothly. For modern text wrapping, utilize `text-balance` (for headings) and `text-pretty` (for body text).

**Step-based scaling (standard approach):**
```html
<h1 class="text-2xl font-bold text-balance md:text-3xl lg:text-4xl">
  Responsive Heading
</h1>
<p class="text-base text-pretty md:text-lg">
  Body text that scales up on larger screens and prevents orphans.
</p>
```

**Fluid scaling (no breakpoint jumps):**
Use `clamp()` for truly fluid typography that scales continuously with viewport width:
```html
<h1 class="text-[clamp(1.5rem,4vw,2.25rem)] font-bold text-balance">
  Fluid Heading
</h1>
<p class="text-[clamp(0.875rem,1.5vw+0.5rem,1.125rem)] text-pretty">
  Body text that smoothly scales without breakpoint jumps.
</p>
```

### Spacing Scale
Use Tailwind's consistent spacing scale (multiples of 4px). 
* **Mobile:** Tighter vertical rhythm. Edge-to-edge content with horizontal gutters (`px-4`).
* **Desktop:** Generous whitespace. Max-width containers (`max-w-screen-2xl mx-auto px-6 lg:px-8`), larger internal padding (`p-6` or `p-8`).

## 6. Touch & Interaction Guidelines

### Touch Targets
* **Minimum Size:** All interactive elements must have a minimum touch target of **48x48 CSS pixels**. In Tailwind, this is `min-h-12 min-w-12` (since 12 * 0.25rem = 3rem = 48px).
* **Spacing:** Ensure at least `gap-2` (8px) of clearance between adjacent touch targets to prevent fat-finger errors.
* **Visual vs Touch Size:** If an icon is visually small (`h-5 w-5`), wrap it in a button with the minimum touch target: `<button class="flex h-12 w-12 items-center justify-center">`.

### Hover vs. Active States
* **Mobile:** Do not rely on `hover:` for critical information, as touch devices do not support hover. Use `active:` for press feedback and `focus-visible:` for keyboard navigation.
* **Desktop:** Tailwind v4 automatically wraps `hover:` styles in `@media (hover: hover)`, meaning hover styles only apply when the primary input device supports hover (mouse/trackpad). This prevents "sticky hover" on touch devices. Use `hover:` freely for desktop enhancements.

```html
<button class="
  rounded-lg bg-primary px-4 py-2 text-primary-foreground 
  transition-transform duration-150
  active:scale-95 active:bg-primary/90
  hover:bg-primary/80 hover:shadow-lg 
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring
">
  Submit
</button>
```

## 7. Container Queries (Tailwind v4)

Tailwind v4 includes **native container queries** — the most significant responsive design feature beyond viewport breakpoints. Container queries allow components to adapt based on their **parent container's width** rather than the viewport.

### When to Use Container Queries
Use container queries for components that appear in **variable-width contexts** — e.g., the WorkspacePane inspector which can be resized via a drag handle, or cards inside a resizable grid.

### Implementation
1. **Mark the container:** Add `@container` (or `@container/{name}` for named containers) to a parent element.
2. **Apply responsive styles:** Use `@sm:`, `@md:`, `@lg:` etc. on child elements to respond to the container's width.

```html
<!-- Parent: defines the query context -->
<div class="@container">
  <!-- Child: adapts to parent width, not viewport -->
  <div class="flex flex-col @md:flex-row @md:gap-6">
    <div class="@md:w-1/2">Column 1</div>
    <div class="@md:w-1/2">Column 2</div>
  </div>
</div>
```

### Container Query Breakpoints
| Prefix | Min Container Width |
| :--- | :--- |
| `@xs:` | `20rem` (320px) |
| `@sm:` | `24rem` (384px) |
| `@md:` | `28rem` (448px) |
| `@lg:` | `32rem` (512px) |
| `@xl:` | `36rem` (576px) |

> [!TIP]
> **Performance:** Only add `@container` to elements that genuinely need it. Each container creates a new layout context. Do not apply it to every wrapper `div`.

## 8. Media & Assets

* **Responsive Images:** Use `w-full h-auto` to ensure images scale within their containers. 
* **Aspect Ratios:** Use Tailwind's `aspect-video`, `aspect-square`, or arbitrary ratios (`aspect-[4/3]`) to reserve space for images and videos before they load, preventing Cumulative Layout Shift (CLS). Combine with `object-cover`.
* **Art Direction:** For hero banners, use the `<picture>` element in your HTML/JSX, but apply Tailwind classes to the `<img>` tags: `<img class="w-full h-full object-cover" />`.

## 9. Accessibility & QA Checklist

Before finalizing any responsive UI work, verify the following:

**Layout & Orientation**
* [ ] **Tablet Landscape:** Secondary panels render as Side Panels (not Bottom Sheets) when a tablet is rotated to landscape (verify `md:landscape:` classes are applying).
* [ ] **Zoom:** The layout does not break or force horizontal scrolling when zoomed to 200% on desktop. Ensure no fixed widths (`w-[500px]`) are used without `max-w-full`.
* [ ] **Orientation Reflow:** The app functions correctly and reflows properly when rotating a device.

**Component Specifics**
* [ ] **Bottom Sheet Focus:** Screen readers correctly announce the Bottom Sheet as a `dialog` (`role="dialog" aria-modal="true"`), and focus is trapped inside it.
* [ ] **Safe Areas:** Bottom sheets, sticky buttons, and fixed-position elements do not overlap the iOS home indicator or Android gesture bar (verify `pb-[env(safe-area-inset-bottom)]` or `safe-area-bottom` utility).
* [ ] **Modal Takeover:** Mobile modals successfully trap focus and hide background content from screen readers (`aria-hidden="true"` on the main app wrapper).
* [ ] **Data Tables:** Mobile card-list views retain all critical data from the desktop table view without requiring horizontal scrolling.

**Interaction**
* [ ] **Keyboard Nav:** All desktop side-panel triggers, bottom-sheet triggers, and custom dropdowns are fully accessible via `Tab`, `Enter`/`Space`, and `Escape` keys.
* [ ] **Touch Targets:** Verified via browser dev tools that all clickable elements meet the `min-h-12 min-w-12` (48x48px) minimum on mobile viewports.