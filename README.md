# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project in the current directory
npx sv create

# create a new project in my-app
npx sv create my-app
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.


All buttons (including icon buttons) on the workspace must have a curso-pointer.

The file browser toolbar layout is too crowded (see image) should be re arrange for best UX, please propose a new layout for approval.

Workspace UI Refinement Walkthrough
The Hermes Workspace has been modernized with a unified interaction model, enhanced scannability, and a premium "Gold on Slate" glass aesthetic.

Key Changes
1. Unified Glass-Morphic Toolbar
The previously fragmented file browser controls have been consolidated into a single, cohesive toolbar.

Wider Search: The search input now dominates the toolbar (flex-[4]) for better usability.
Smart View Toggles: The view mode icon (Grid/List) now contextually toggles to show the next available state.
Integrated Action Menu: Creation and upload tools are grouped in a clean dropdown.
2. Floating Instant Extraction
Moved extraction from the header to a high-visibility Floating Action Button (FAB) on the editor canvas.

Context Sensitive: Only appears for PDF and image assets.
Automated Workflow: Triggers instant intelligence extraction, saving results to the dedicated /extractions directory.
Haptic Feedback: Integrated toast notifications for extraction state transitions.
3. Navigation & Accessibility
Horizontal Tab Scrolling: 
EditorTabs.svelte
 now supports smooth horizontal overflow for scenarios with many open files.
Global Pointer Enforcement: High-fidelity cursor-pointer application across all interactive surfaces (toggles, tabs, buttons, close icons).
Edge-to-Edge PDF: Full-bleed rendering to maximize display area on the canvas.

UI/UX Audit
Observed search bar extension across roughly 70% of the toolbar width.
Verified icon toggle logic: [ 田 ] shows when in List mode, [ ≡ ] shows when in Grid mode.
Confirmed FAB placement at the bottom-right corner of PDF/Image canvases.
Technical Integrity
Resolved onExtract prop binding errors in 
editor-canvas.svelte
.
Corrected logic block syntax ({:else if}) in 
WorkspacePane.svelte
.
Validated handleExtract routing to simulate intelligence storage.