# Responsive Design Guidelines

## 1. Core Philosophy: Mobile-First with Tailwind
Our approach is strictly **mobile-first**. Base utility classes must target the smallest screens, using Tailwind's responsive prefixes (`sm:`, `md:`, `lg:`, etc.) to progressively enhance the layout for larger viewports.

> [!IMPORTANT]
> Responsiveness is not a feature; it is the core foundation of the EdApex orchestration layer. The UI must feel premium and "spacious" regardless of pixel density.

* **Write base classes for mobile:** Single-column layouts (`flex-col`), stacked elements, and touch-optimized interactions.
* **Progressive Enhancement:** Use `md:`, `lg:`, etc., to introduce multi-column grids (`md:grid md:grid-cols-2`), hover states (`hover:`), and expanded navigation.
* **Viewport Units:** Use Tailwind's `h-dvh`, `min-h-dvh`, and `max-h-dvh` utilities (available in v3.4+) instead of `h-screen` to account for mobile browser UI (address bars) expanding and collapsing.

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
* **Phones & Portrait Tablets:** Secondary content is hidden off-screen at the bottom and invoked as a **Bottom Sheet**.
* **Landscape Tablets & Desktops (`lg:` OR `md:landscape:`):** Secondary content is pinned or sliding in from the right as a **Side Panel**.

#### Tailwind Implementation Pattern
Use arbitrary values for safe areas and data attributes for open/close state management to keep classes purely utility-based.

```html
<div class="
  /* Base: Bottom Sheet (Mobile & Portrait Tablet) */
  fixed bottom-0 left-0 right-0 z-50
  max-h-[90dvh] translate-y-full transition-transform duration-300
  pb-[env(safe-area-inset-bottom)]
  
  /* Open State for Bottom Sheet */
  data-[state=open]:translate-y-0

  /* Desktop & Tablet Landscape: Side Panel Overrides */
  lg:fixed lg:top-0 lg:right-0 lg:bottom-auto lg:left-auto
  lg:w-[380px] lg:h-dvh lg:max-h-none lg:translate-y-0 lg:translate-x-full
  lg:pb-0
  
  /* Open State for Side Panel */
  lg:data-[state=open]:translate-x-0

  /* Tablet Landscape Overrides (matches lg:) */
  md:landscape:fixed md:landscape:top-0 md:landscape:right-0 
  md:landscape:w-[380px] md:landscape:h-dvh md:landscape:translate-x-full
  md:landscape:data-[state=open]:translate-x-0
">
  <!-- Panel Content -->
</div>
```

#### Bottom Sheet UX Specifications (Small Screens)
1. **Drag Handle:** Always include a visual grabber indicator (e.g., `<div class="mx-auto mt-2 h-1 w-10 rounded-full bg-gray-300" />`).
2. **States:** Support *Half-Screen* (default, `max-h-[60dvh]`) and *Full-Screen* (snaps to `max-h-[95dvh]`).
3. **Dismissal:** Swipe down, tap backdrop (`fixed inset-0 bg-black/50`), or use an explicit "Close" button (`absolute top-4 right-4`).
4. **Scroll Trapping:** Background scroll must be locked (`overflow-hidden` on the `<body>`), and focus trapped within the sheet.

## 4. Standard Component Adaptation Matrix

All standard UI components must adapt based on the breakpoints defined above. 

| Component | Mobile & Portrait Tablet (Base) | Landscape Tablet & Desktop (`lg:` / `md:landscape:`) |
| :--- | :--- | :--- |
| **Modals / Dialogs** | **Full-Screen Takeover.** `fixed inset-0 flex flex-col`. Slides up from bottom. Includes explicit "Back" or "Close" header. | **Centered Overlay.** `fixed inset-0 flex items-center justify-center`. Constrained width (`max-w-lg w-full`), centered with a dimmed backdrop. |
| **Forms & Inputs** | **Single Column.** `flex flex-col gap-4`. Full-width inputs (`w-full`). Stacked labels. | **Multi-Column.** `md:grid md:grid-cols-2 md:gap-6`. Labels can be inline. Constrain form width for readability (`max-w-2xl`). |
| **Navigation** | **Bottom Bar / Hamburger.** Primary destinations in a Bottom Nav (`fixed bottom-0 w-full`). Secondary items in a slide-out drawer. | **Sidebar / Top Nav.** Persistent left sidebar (`w-64 flex-shrink-0`) or horizontal top navigation (`flex items-center justify-between`). |
| **Data Tables** | **Card Lists.** Hide table (`hidden`). Show stacked cards (`flex flex-col gap-4`) where headers become text labels (`text-sm text-gray-500`). | **Standard Table.** Hide cards (`hidden lg:block`). Show table (`lg:table w-full`). Sticky headers (`sticky top-0`). |
| **Tabs** | **Horizontal Scroll.** `flex overflow-x-auto snap-x snap-mandatory`. Hide scrollbars. If > 4 tabs, consider vertical Accordions (`flex flex-col`). | **Standard Horizontal Tabs.** `flex gap-4`. All tabs visible. If they overflow, use explicit left/right carousel arrow buttons. |
| **Tooltips / Help** | **Bottom Sheets / Expandables.** No hover state. Use info icons (`active:scale-95`) that trigger a Bottom Sheet or inline `<details>` elements. | **Tooltips / Popovers.** Triggered on `hover:` and `focus:`. Use `group` and `group-hover:opacity-100` for custom tooltips, or a headless UI library. |
| **Buttons (Primary)**| **Full Width.** `w-full` or sticky to bottom (`sticky bottom-4 w-full`). Min-height 48px (`min-h-12`). | **Auto Width.** `w-auto`. Sized to content (`px-6 py-3`). Placed inline or right-aligned (`ml-auto`) in form footers. |
| **Date/Time Pickers**| **Native OS Pickers.** Use native `<input type="date">` to trigger the OS-level bottom wheel/calendar. Style with `appearance-none`. | **Custom Popovers.** Custom calendar dropdowns attached to the input field. Use absolute positioning (`absolute top-full mt-2`). |

## 5. Typography & Spacing

### Responsive Typography
Use Tailwind's responsive prefixes to scale typography smoothly. For modern text wrapping, utilize Tailwind's `text-balance` (for headings) and `text-pretty` (for body text) utilities.

```html
<h1 class="text-2xl font-bold text-balance md:text-3xl lg:text-4xl">
  Responsive Heading
</h1>
<p class="text-base text-pretty md:text-lg">
  Body text that scales up on larger screens and prevents orphans.
</p>
```
*Note: If true fluid typography is required without breakpoints, use arbitrary values: `text-[clamp(2rem,5vw+1rem,3.5rem)]`.*

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
* **Mobile:** Do not rely on `hover:` for critical information, as touch devices emulate hover poorly. Use `active:` for press feedback and `focus-visible:` for keyboard navigation.
* **Desktop:** Tailwind's `hover:` variant automatically uses `@media (hover: hover)` under the hood in v3, meaning hover styles won't stick on touch devices. Use it freely for desktop enhancements.

```html
<button class="
  rounded-lg bg-blue-600 px-4 py-2 text-white 
  transition-transform duration-150
  active:scale-95 active:bg-blue-700
  hover:bg-blue-500 hover:shadow-lg 
  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400
">
  Submit
</button>
```

## 7. Media & Assets

* **Responsive Images:** Use `w-full h-auto` to ensure images scale within their containers. 
* **Aspect Ratios:** Use Tailwind's `aspect-video`, `aspect-square`, or arbitrary ratios (`aspect-[4/3]`) to reserve space for images and videos before they load, preventing Cumulative Layout Shift (CLS). Combine with `object-cover`.
* **Art Direction:** For hero banners, use the `<picture>` element in your HTML/JSX, but apply Tailwind classes to the `<img>` tags: `<img class="w-full h-full object-cover" />`.

## 8. Accessibility & QA Checklist

Before finalizing any responsive UI work, verify the following:

**Layout & Orientation**
* [ ] **Tablet Landscape:** Secondary panels render as Side Panels (not Bottom Sheets) when a tablet is rotated to landscape (verify `md:landscape:` classes are applying).
* [ ] **Zoom:** The layout does not break or force horizontal scrolling when zoomed to 200% on desktop. Ensure no fixed widths (`w-[500px]`) are used without `max-w-full`.
* [ ] **Orientation Reflow:** The app functions correctly and reflows properly when rotating a device.

**Component Specifics**
* [ ] **Bottom Sheet Focus:** Screen readers correctly announce the Bottom Sheet as a `dialog` (`role="dialog" aria-modal="true"`), and focus is trapped inside it.
* [ ] **Safe Areas:** Bottom sheets, bottom navigation, and sticky full-width buttons do not overlap the iOS home indicator or Android gesture bar (verify `pb-[env(safe-area-inset-bottom)]`).
* [ ] **Modal Takeover:** Mobile modals successfully trap focus and hide background content from screen readers (`aria-hidden="true"` on the main app wrapper).
* [ ] **Data Tables:** Mobile card-list views retain all critical data from the desktop table view without requiring horizontal scrolling.

**Interaction**
* [ ] **Keyboard Nav:** All desktop side-panel triggers, bottom-sheet triggers, and custom dropdowns are fully accessible via `Tab`, `Enter`/`Space`, and `Escape` keys.
* [ ] **Touch Targets:** Verified via browser dev tools that all clickable elements meet the `min-h-12 min-w-12` (48x48px) minimum on mobile viewports.