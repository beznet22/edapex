# PWA Document Scanner & Marks Digitization — Project Overview (v3)

## 1. Feature Summary
An in-browser PWA document scanning and marks digitization module integrated directly into your existing **SvelteKit Class Roster**. Teachers launch a student-locked full-screen camera from any student row (or via batch scan), which automatically detects A4 **Learner Assessment Log Book** borders (`jscanify` + lazy-loaded `opencv.js`), plays a crisp shutter click + haptic pulse after an animated countdown, flattens skewed photos in the browser, and dispatches compressed images to a synchronous SvelteKit endpoint (`POST /api/marks/extract`) in the background. Teachers immediately move on to the next student without waiting on spinners while rows update live from **`Extracting...`** to **`Draft`**, ready for verification in a slide-over drawer and one-click parent PDF publishing.

---

## 2. Camera View Enhancements (Upgrading the Base Camera UI)
The base full-screen camera interface provides a clean, distraction-free foundation—featuring a top-left `×` close button, top-right flash toggle, bottom-left gallery import icon, and large centered circular shutter button. To transform this base view into a production document scanner for A4 log books, apply the following layer upgrades:

> **Base Reference Screen:** [`base-reference-camera-view.png`](base-reference-camera-view.png)

### A. Top Utility Bar & Status Scrim
* **Top Gradient Scrim (`linear-gradient(to bottom, rgba(0,0,0,0.45), transparent)`):** Ensures the status bar (`9:41`, battery, signal) and white icons remain legible even when pointed at bright white paper.
* **Expanded Top-Right Controls:** Keep the existing **Flash/Torch icon** and add:
  * **`Auto | Manual` Pill Toggle:** Lets teachers switch between hands-free auto-capture and manual shutter tap.
  * **Sound / Mute Toggle (Optional):** Controls the Web Audio shutter click.
* **Student Context Pill (Below Top Bar):** A centered, semi-transparent dark pill (`rgba(15, 23, 42, 0.78)`, crisp white text) showing the active student's **Full Name**, **Admission No.**, and **Class** (`Adaobi Okafor • ADM-1042`) flanked by **`‹ Prev` / `Next ›`** arrows so teachers can skip absent students effortlessly.

### B. Center Viewfinder Overlays
* **A4 Portrait Guide & Live Edge Polygon (`jscanify`):** Draw subtle corner brackets (`1:1.414` A4 portrait aspect ratio) that dynamically snap and morph into a high-contrast electric blue (`#2563EB`) or emerald (`#10B981`) 4-point polygon outlining the detected log book edges, paired with a light dark dim (`rgba(0,0,0,0.35)`) outside the detected sheet.
* **Contextual Guidance Chip:** A small floating status pill above the bottom dock (`"Align log book inside frame"` -> `"Hold steady..."` -> `"Capturing..."`).

### C. Bottom Capture Dock & Feedback
* **High-Contrast Translucent Backing:** Give the bottom-left **Gallery button** and center **Shutter button** a subtle dark scrim (`rgba(0,0,0,0.35)`) so their white borders never wash out against white paper.
* **Animated Auto-Capture Countdown Ring:** When `Auto` mode detects a steady 4-corner lock, animate a `1.2s` circular SVG progress ring directly around the shutter button before triggering capture, paired with a **Web Audio shutter click** and **`navigator.vibrate(40)`** haptic pulse.
* **Auto-Advance + 3-Second `"Undo / Retake"` Toast:** Immediately after capture, auto-capture pauses for `1.5s` while the top student pill switches to the next ungraded student, and a compact pill appears above the shutter (`"✓ Sent Adaobi Okafor • [Undo]"`), allowing instant recovery if the wrong page was snapped.

---

## 3. End-to-End Non-Blocking Workflow

```text
[Existing Class Roster] 
   │  Teacher clicks "Upload Mark" on a student row (or "Batch Scan" at top)
   │  (opencv.js preloaded silently in background & cached via Service Worker)
   ▼
[Enhanced Full-Screen Smart Scanner] 
   │  Student-locked pill • Live border polygon • Animated countdown ring + shutter sound
   ▼
[Instant Auto-Clip, Straighten & Safety Save (~0.2s)] 
   │  jscanify warps paper to flat A4 (1600×2260px) • JPEG compressed (~350KB)
   │  Saved briefly to IndexedDB before dispatch (protects against offline/tab close)
   ▼
[Fire-and-Forget Dispatch & Auto-Advance] 
   ├─► Scanner UX: Pauses auto-capture 1.5s, advances banner to next student,
   │               and shows 3s "Undo / Retake" toast — ZERO blocking spinner
   └─► Background: POST /api/marks/extract persists image by deterministic key,
                   calls Mistral OCR synchronously, and saves JSON as 'Draft' in DB
   ▼
[Live Roster Pill Updates] 
   │  Row transitions live: [Queued (Offline)] ──► [Extracting... ↻] ──► [Draft]
   │  (Synced across phone & desktop via DB + deterministic image key)
   ▼
[Editable Marks Drawer (Right Slide-Over / Full-Screen on Mobile)] 
   │  Teacher clicks "Review & Save" on any Draft row (on phone or laptop)
   │  Live total/grade computation • Low-confidence cell highlights • "Adjust Crop" fallback
   ▼
[Commit & Publish] 
   ├─► "Save" ──► Status: Uploaded ──► "View Mark" (Edit) / "View Result" (PDF Sheet)
   └─► "Publish" (Per Student or Bulk Class) ──► Status: Published ──► Sent to Parents
```

---

## 4. Strict State-Gating & Action Visibility Matrix

### A. Row-Level Action Visibility
Actions that are invalid for the current workflow stage are strictly hidden or disabled to prevent invalid state transitions:

| Student Status | Visible Primary Button | Overflow Menu (`⋮`) Items | Explicitly Hidden / Disabled |
| :--- | :--- | :--- | :--- |
| **`Not Uploaded`** | `Upload Mark` | *(No overflow menu)* | `Review`, `View Mark`, `View Result`, `Publish`, `Re-scan` |
| **`Queued (Offline)`** | `Queued` *(Disabled pill)* | `Re-scan` | `Review`, `View Mark`, `View Result`, `Publish` *(disabled until synced & extracted)* |
| **`Extracting...`** | `Extracting...` *(Disabled + spinner)* | *(No overflow menu)* | All actions locked while Mistral request is in flight |
| **`Draft`** | `Review & Save` | `Re-scan` | `View Result` & `Publish` *(hidden until teacher verifies & commits marks)* |
| **`Uploaded`** | `View Mark` | `View Result`, `Publish`, `Re-scan` | `Upload Mark` *(replaced by `Re-scan` in menu)* |
| **`Published`** | `View Result` | `View Mark` *(Read-Only)*, `Edit & Re-publish` | `Publish`, `Upload Mark`, `Re-scan` *(locked unless unlocked via `Edit & Re-publish`)* |
| **`Error`** | `Retry` | `Re-scan`, `View Error` | `View Mark`, `View Result`, `Publish` |

### B. Top Roster Toolbar & Inside-Drawer Gating
* **`Publish All Uploaded (X/Y)` Button:** Hidden or `disabled` when `X === 0` (zero students in `Uploaded` state). Becomes active once at least one student is verified and committed.
* **`Batch Scan Ungraded` Button:** Hidden or `disabled` once all students on the roster have progressed past `Not Uploaded`.
* **Offline Sync Banner:** Visible only when local IndexedDB scans are pending (`"4 scans queued offline • Will sync automatically when online"`).
* **Inside Editable Marks Drawer:**
  * **`Save & Compute`:** Disabled until required score fields pass validation (no out-of-range digits such as `CA > 40`).
  * **`Save & Publish` (Shortcut):** Enabled only when validation passes with zero flagged errors.
  * **Post-Publish Lock:** `Published` rows open read-only by default, requiring explicit confirmation on **`Edit & Re-publish`** to unlock inputs.

---

## 5. Drawers, Persistence & Multi-Device Sync
* **Editable Marks Drawer (`Review & Save` / `View Mark`):** Full-screen slide-in drawer on mobile (`inputMode="numeric"` for score fields); wide right-hand slide-over drawer on desktop with sticky **Back Arrow** and **Save & Compute** button. Includes a fallback **`Adjust Crop`** button that fetches the persisted server image only if manual corner adjustment is needed.
* **Zoomable PDF Result Viewer (`View Result`):** Centered modal on desktop; `92vh` **Bottom Sheet** on mobile with dedicated header close button so vertical PDF panning never accidentally dismisses the sheet, complete with pinch-to-zoom, **`Download PDF`**, and **`Publish`** actions.
* **Deterministic Server Image Key:** Stored using `{academicYear}_{examId}_{studentId}_{admissionNo}` so re-scans overwrite cleanly without duplicates.
* **Post-Publish Retention:** Persisted scan images (~350KB each) are retained through the end of the academic term/session as an audit trail to resolve parent score disputes and power post-publish corrections.
* **Cross-Device Handoff:** Once synced to the server, teachers can batch-scan on a phone in the classroom and finish verifying `Draft` tables and bulk-publishing from a school laptop.
