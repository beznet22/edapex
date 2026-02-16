Implementation Plan - Mobile-First Responsiveness
Make the filestore page and file view modal fully mobile-responsive, modern, and elegant.

Proposed Changes
Proposed Changes
[API & Logic Refinement]
[MODIFY] 
chat.remote.ts
Update getResources to support loading ALL resources if no class/section is provided.
Iteratively list all tokens in UPLOADS_DIR and all class folders in storage/extracted.
[MODIFY] 
file-context.svelte.ts
Update loadResources to allow calling getResources without params if selectedClass is missing.
[Filestore Modal Refinement]
[MODIFY] 
file-view-modal.svelte
Restore legacy extractedData.scores fallback for marks rendering in the Results tab.
Re-add "Raw JSON" tab for desktop view (hidden on mobile).
Restore side-by-side layout (Viewer/Data) for desktop view.
Reduce desktop sidebar width from lg:w-72 to lg:w-60.
Reduce thumbnail padding and spacing.
[Filestore Context Refinement]
[MODIFY] 
filestore.svelte.ts
Ensure loadResources correctly triggers the "all files" mode in fileCtx.
Filestore Page
[MODIFY] 
+page.svelte
Update the main container to px-4 py-6 on mobile, increasing to px-6 py-8 on desktop.
Responsive Header:
Stack title and actions on small screens.
Compact search input on mobile.
File Cards:
Reduce card aspect ratio (e.g., from 3/4 to something more compact) to fit more items on screen.
Maintain existing font sizes as they are already optimal.
Update grid: grid-cols-2 on mobile, grid-cols-3 or more on larger screens with smaller gap.
File View Modal
[MODIFY] 
file-view-modal.svelte
Layout Restructuring:
Tabbed Interface: On mobile, use a persistent bottom/top tab bar to switch between the "Viewer" and "Results" pane.
JSON Visibility: Hide the "Raw JSON" tab on mobile devices to declutter the UI.
Assessment Selection: Implement a Drawer (Sheet) for switching between assessments on mobile. This provides a spacious, touch-friendly grid of thumbnails that feels more native than a dropdown.
Viewer Interaction:
Gestures: Implement native pointer event handlers for:
Pinch-to-Zoom: Multi-touch scaling.
Drag-to-Pan: Moving the image when zoomed in.
Toolbar: Simplify into a floating overlay that hides during interaction.
Reduced Card Sizes:
Shrink thumbnails in the selection drawer and the main filestore grid by adjusting aspect ratios.
Optimize padding for a compact, elegant look while keeping font sizes consistent.
Proposed Changes
[Backend] API Refinement
[MODIFY] 
chat.remote.ts
Restrict getResources to only lookup files in storage/extracted.
Remove logic that reads from UPLOADS_DIR (temporary storage).
Simplify token discovery to focus on folders within storage/extracted.
[UI] Mobile UX Refinements
[MODIFY] 
file-view-modal.svelte
Replace ScrollArea and its wrapper with a native div using overflow-y-auto in the Data Panes container.
Apply touch-pan-y and overscroll-contain (or ourscroll-auto based on intent) to ensure smooth touch scrolling.
Ensure the container correctly uses flex-1 and min-h-0 on mobile.
Remove ScrollArea if it's no longer used in this file to reduce overhead.
Verification Plan
Automated Tests
N/A
Manual Verification
Open Filestore page and verify only extracted files are shown (e.g., Zoe's file).
Click on a file and verify the modal opens without "non-bindable" error.
Scroll down the Filestore page and verify the header and folder pills stay at the top.
Verify that closing the modal updates the parent state correctly.
Use Browser DevTools to toggle mobile views (375px, 414px, 768px).
Verify that the modal panes switch correctly via tabs on mobile.
Check if all buttons are easily clickable on touch.
Verify that file cards look elegant at a smaller size.