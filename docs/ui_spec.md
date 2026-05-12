# EdApex UI/UX Specification: Hermes Redesign

## 1. Overview
The EdApex AI interface is transitioning to a **4-Panel Architecture** inspired by Hermes, optimized for high-velocity orchestration. The goal is to provide a non-claustrophobic, premium experience that scales from mobile devices to large desktop monitors.

## 2. 4-Panel Architecture

The UI is built using strict Tailwind CSS Flexbox/Grid layouts for horizontal stability. Panels 2 and 4 utilize native UI Sidebars and responsive `<Sheet>` components on smaller screens to ensure a fluid experience without the overhead of heavy pane-resizing libraries.

### Panel 1 & 2: Unified Sidebar (Far Left Rail + Contextual Pane)
- **Role**: Combines high-level routing (Rail) and contextual workspace management (Sidebar) into a single, high-performance `shadcn-svelte` component.
- **Implementation**: A single `app-sidebar.svelte` using `collapsible="icon"`. 
  - **The Rail (Panel 1)**: Visualized when the sidebar is collapsed; houses the **Brand Mark**, **Primary Apps** (Dashboard, Workspace, Inbox), and **Activity Badges**.
  - **The Contextual Sidebar (Panel 2)**: Visualized when the sidebar is expanded; houses the **Workspace Navigation Header**, **Quick Actions (+ New)**, **Context Filter Chips**, and **Thread List**.
- **Layout Anatomy**:
  - **Header (Top Anchor)**: 
    - **Brand Mark**: EdApex logo + "Enterprise" label.
    - **App Rail**: `LayoutDashboard`, `Folder`, `Inbox` icons with activity dots.
  - **Content (The Workspace Pane)**:
    - **Workspace Switcher**: Dropdown trigger for Mastra sub-modules (Orchestrator, Timeline, etc.).
    - **Quick Actions**: `+ New Orchestration Session` (⌘K).
    - **Discovery Chips**: Role-gated filter badges.
    - **Memory Feed**: `SidebarHistory` grouped temporal thread list.
  - **Footer (Identity & Utilities)**:
    - **Settings Trigger**: `NavSecondary` sticky bottom.
    - **User Identity**: `NavUser` with avatar, designation, and workspace lock badges.

### User Avatar Dropdown Menu (Nav / Footer Trigger)
- Built with `shadcn-svelte` `<DropdownMenu>` and triggered from the footer or Profile nav icon.
- **User Identifier Header**: 
  - Circular Avatar (e.g., initials "BO").
  - Full Name (e.g., "Brown Onojeta").
  - **Designation Badge**: Visual indicator of user role (e.g., "IT", "Coordinator", "Class Teacher"). Replaces the "Free" tier reference.
  - **Active Workspace Badge** (Hard Enforcement Gate): Displays the current `Class:Section` locking the agent. This is **not cosmetic** — it reflects the active `event.locals.tenantContext.workspaceLock`. Every command execution cross-references resolved `@mention` entities against this lock; mismatches trigger a hard-reject with a re-confirmation prompt before any DB write proceeds. If the user has no active workspace assignment, the badge renders a distinct **"Unassigned ⚠"** warning state and all slash commands are disabled until an administrator assigns a workspace.
- **Menu Items** (Separated by `<DropdownMenuSeparator>`):
  - `Sparkle` icon: Subscription/Upgrade proxy (e.g., "Try Plus free").
  - `Moon` icon: Personalization.
  - `User` icon: Profile.
  - `Gear` icon: Settings.
  - *Separator*
  - `LifeBuoy` icon: Help.
  - `LogOut` icon: Log out.

### Panel 3: Workspace Stage (The "Arena" / Center Pane)
- **Role**: Main interactive surface. Takes up the flexible remaining space (`flex-1`).
- **Top Header**: Sticky glassmorphic header displaying the active thread title and a trailing `<Button variant="outline">` (e.g., "Files") to toggle the Inspector.
- **Chat Body**:
  - Infinite `<ScrollArea>`.
  - Utilizes `ai-elements` for rendering strict agent/user `<Message>` blocks.
  - Messages display circular avatars, precise timestamps, and rich Markdown tracking.
- **Slash Command UI Bindings**:
  - **Disambiguation (`/search`, `/find`)**: If the Gateway Agent yields a `NEEDS_CLARIFICATION` state (from `slash_command_specs.md`), the UI renders an interactive candidate list directly in the chat stream.
  - **Conversational Enrollment (`/register`)**: The UI intercepts missing schema dependencies and renders structured `Form` wizards matching the core schema chunks: **Student Details** (Name, Gender, Category), **Guardian Details** (Relation, Contact mapping), and **Class/Section** constraints.
  - **Grade Modification (`/grade`, `/validate`)**: Returns custom interactive data grids mirroring the `upsert` payload schema, allowing teachers to modify arrays before the atomic DB commit.
  - **Intent Validation Card (Gate)**: If the Gateway Supervisor reports confidence **< 90%** for a mutation intent, the UI renders a specialized confirmation card with primary buttons (e.g., "Confirm Action: [Intent Name]" and "Cancel"). This prevents the agent from guessing destructive actions.
- **ChatComposer (Footer)**: Fixed bottom composer island (See Section 3).

### Panel 4: Inspector / File Workspace (Right Pane)
- **Role**: Artifact preview, File generation outputs, and knowledge base. Rendered as a collapsible right-side Flex sidebar or an absolute-positioned `<Sheet>` depending on viewport.
- **Header**: "WORKSPACE [MAIN]" tracking text, along with standard utilitarian action icons: Back (`<`), Forward (`>`), New File (`+`), New Folder, Refresh, Close (`X`).
- **Body**: 
  - A comprehensive accordion or tree-view of the workspace filesystem (e.g., `.git`, `agent-messages`, `archive`, `docs`, `kb`, `screenshots`).
  - Tree items feature file-type icons and right-aligned size metadata labels (e.g., `4.2k`, `8.8k`).
- **Mastra Workflow Context integration**:
  - **Extraction Staging** (`/extract`): The Inspector mounts a live preview of the **Mastra Workflow State** for the current suspended extraction run. The OCR mapped JSON is read from the workflow snapshot — never from the school DB — ensuring complete agent/school-layer isolation.
  - **Publish Artifacts** (`/publish`): Finalized PDF report cards from PrinceXML are mounted here for viewing before dispatch.
  - **Run History / Observability**: A dedicated trace view for current and past **Mastra Workflow Runs**. Displays step-by-step success/failure markers, allowing staff to troubleshoot batch jobs (e.g., "Student X failed due to blurry image OCR") directly from the `mastra_runs` libSQL history.

---

## 3. The New ChatComposer

The `ChatComposer` is a unified bottom-anchored input island, utilizing `prompt-kit`'s base and `ai-elements` styling to mirror the Hermes aesthetic precision.

### 3.1 Component Anatomy
- **Input Area (Top Half)**:
  - An expanding `<Textarea>` (or `ContentEditable` for rich mentions) holding the prompt placeholder (e.g., "Message Hermes Agent...").
  - Deep integration with `TenantContext`: any `@mentions` (Students, Exams) heavily bind the backend query to specific `studentId`/`examTypeId` as strictly required in `mastra_migration_specs.md`.
  - High-contrast text on the deep Slate floating background.
- **Action Tool Tray (Bottom Half)**:
  - Features a dense row of configuration and media controls across the bottom edge of the input island:
    - **Left Actions**: Attachment `<Button variant="ghost" size="icon">` (paperclip) and Voice Interface toggle (mic).
    - **Context Selectors** (Center-Left): Multiple distinct `<Select>` or `<DropdownMenu>` triggers with chevron indicators:
      1. Profile Selector (e.g., User avatar + "default").
      2. Workspace/Folder Selector (e.g., folder icon + "Home").
      3. Intelligence Model Selector (e.g., AI logo + "Claude Sonnet 4.6"). Enforces the rigid "Strongest provider decides, Fastest executes" hierarchy established in the migration specs.
    - **Right Actions**: Standard Stop Generation circle trigger, paired with a prominent Send `<Button>` (Up Arrow) adorned with the active palette color.

### 3.2 Terminal Dock (Feature Flag)
- A collapsible terminal interface that slides up from the base of the `ChatComposer`.
- Displays real-time Mastra workflow traces and system-level runtime logs natively within the Composer bounds.

---

## 4. Design Language & Tokens (EdApex "Gold on Slate")

- **Framework**: Svelte 5 + Tailwind CSS + OKLCH Color Model.
- **Components**: Modified `shadcn-svelte` core for premium orchestration (Glassmorphism & High-Velocity spacing).
- **Aesthetics**:
  - **The "Gold on Slate" Language**:
    - **Backgrounds**: Deep, rich Slate/Charcoal (`oklch(0.14 0.02 260)`) to ensure maximum focus on content.
    - **Primary Accents**: EdApex Amber/Gold (`oklch(0.65 0.15 40)`) for active states, CTA buttons, and AI-driven interactive elements.
    - **Foregrounds**: High-contrast, soft whites/grays (`oklch(0.92 0.01 260)`) for readability.
  - **Premium Polish**:
    - **Glassmorphism**: Subtle backdrops (`backdrop-blur-md`) with 20% opacity overlays for floating panels and context menus.
    - **Micro-animations**: Transition-springs for panel resizing; "pulse" states for active workflows; fluid chip injection markers.
    - **Typography**: Precision Geist Sans/Mono hierarchy for high-density information.

## 5. First-Class Responsiveness Mastery

Responsiveness is not a feature; it is the core foundation of the EdApex orchestration layer. The UI must feel premium and "spacious" regardless of pixel density.

### 5.1 Device Strategy
- **Ultra-Wide (> 1440px)**: 
  - Full 4-panel "Command Center" visibility.
  - Enhanced horizontal guttering to prevent visual fatigue.
  - Interactive 4-panel layout. Sidebars have fixed ergonomic constraints while the primary Workspace Stage remains fluid.
- **Tablet (768px - 1023px)**: 
  - **Rail (Panel 1)**: Collapses into a floating "Command Hub" sidebar.
  - **Inspector (Panel 4)**: Becomes an overlay `Sheet` triggered by workflow events, ensuring the "Arena" (Panel 3) remains the primary focus.
- **Mobile (< 768px)**: 
  - **Premium Navigation**: Adaptive Bottom Navigation Bar with haptic-aware triggers.
  - **Entity Discovery**: Sidebar and Inspector accessed via fluid "Swipe-from-Edge" gestures or "Hamburger" drill-downs.
  - **Keyboard Mastery**: `ChatComposer` context chips become a scrollable horizontal tray above the OS keyboard to maximize screen real-estate.

### 5.2 PWA & Adaptive Performance
- **PWA Excellence**: ServiceWorker-backed "Instant Load" for recent conversations; notification sync across devices.
- **Adaptive Depth**: Reduce transparency/blur effects on low-power mobile devices while maintaining the "Gold on Slate" color integrity.
- **Safe Area Mastery**: Full adherence to `env(safe-area-inset-*)` for PWA "Standalone" mode, ensuring content never clips under notches or home bars.

## 6. Implementation Checklist

- [ ] **Structural Scaffolding (Hermes Base)**
  - [ ] Implement strict Flexbox/Grid structures defining the horizontal 4-Panel bounds.
  - [ ] Apply "Gold on Slate" token foundation, ensuring deep `oklch` backgrounds and high-velocity UI states.

- [ ] **Panel 1: Global App Switcher**
  - [ ] Implement `collapsible="icon"` `<Sidebar>` rail navigation structure.
  - [ ] Place `Dashboard`, `Workspace`, and `Inbox` links in the Top Anchor wrapper.
  - [ ] Implement the absolute-positioned "Activity Badges" logic for background tasks notifications on rail icons.
  - [ ] Abstract the User Identity/Avatar `<DropdownMenu>` to the Bottom Anchor, removing legacy user components.

- [ ] **Panel 2: Contextual Sidebar**
  - [ ] Implement the Global App Name `<DropdownMenu>` Workspace Navigation Header.
  - [ ] Wire the `+ New Orchestration Session` `<Button>` to generate threads securely bounded to the implicit `TenantContext`.
  - [ ] Implement the role-gated **Context Filter Chips** (rendering ONLY for Coordinator/IT roles).
  - [ ] Hydrate Thread Lists with specific Gateway intent summaries instead of flat IDs.

- [ ] **Panel 3: The Workspace Arena & Slash Command Bindings**
  - [ ] Hook `ai-elements` `<Message>` arrays into Panel 3.
  - [ ] Implementation of the `NEEDS_CLARIFICATION` Disambiguation Card component for `/search`.
  - [ ] Implementation of Iterative Chat Form components for `/register` ingestion.
  - [ ] Design and hook interactive `ai-elements` data grids for validating `/grade` payload arrays prior to ORM `upsert`.

- [ ] **Panel 4: The Inspector Workspace & Mastra Bindings**
  - [ ] Implement the responsive collapsible rail & mobile `<Sheet>` overlay behavior for the Inspector.
  - [ ] Render dual-path OCR tracking buffers natively representing Mistral Native extraction yields (`/extract`).
  - [ ] Host generated PrinceXML PDF previews bound to the `PublishResultsWorkflow` statuses (`/publish`).

- [ ] **Settings Modal > Provider Tab**
  - [ ] Manage `provider_config` stored in **libSQL (`mastra.db`)**.
  - [ ] **API Key Entry**: Secure inputs with masking for Cerebras, Groq, NVIDIA, Mistral.
  - [ ] **Intelligent Priority (Drag-and-Drop)**: Sortable List to define the failover hierarchy.
  - [ ] **Model Mapping**: Table to map task types (OCR, Chat) to model IDs.
- [ ] **ChatComposer & Telemetry**
  - [ ] Enforce `@mention` contextual linking directly mapping into `TenantContext` isolation checks.
  - [ ] Connect Model Selector to the dynamic `libSQL` hierarchy resolved by the Gateway.
  - [ ] Integrate Mastra `OTel` stream rendering natively inside the collapsible `TerminalDock` footer array.


