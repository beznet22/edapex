# EDAPEX ROBOT ANIMATION SYSTEM
## Complete Engineering & Implementation Specification

**Project:** Edapex  
**Component:** Edapex Robot  
**Category:** Reusable, state-driven animated SVG character  
**Technology:** SVG + React + TypeScript + GSAP + Lightweight Finite State Machine  
**Implementation Standard:** Production-ready, modular, extensible, accessible and performant.

---

# 1. PROJECT OBJECTIVE

Build a sophisticated, reusable, code-driven animation system for the Edapex robot logo.

The robot represents Edapex's AI assistant, which works alongside teachers to perform educational and administrative tasks.

Transform the existing static PNG logo into an animated character capable of communicating its current operational state through subtle, intelligent and purposeful movements.

This is NOT a request to create a collection of GIFs, videos or independent animation demonstrations.

Build a unified animation engine with:

- A single authoritative SVG representation of the robot.
- Independently controllable SVG components.
- A reusable React component.
- GSAP-powered animation timelines.
- A lightweight finite state machine.
- Activity-specific animation variations.
- A clean event-driven API.
- Extensibility for future personalities and behaviours.

The final result should feel like a professional AI colleague rather than a cartoon mascot.

# 2. INITIAL REPOSITORY INVESTIGATION

Before implementation:

1. Inspect the existing project structure.
2. Identify the frontend framework, React version, TypeScript configuration and build system.
3. Identify existing styling conventions and component architecture.
4. Check whether GSAP is already installed.
5. Locate and inspect the approved Edapex robot PNG.
6. Inspect the image dimensions, transparency, background and colour distribution.
7. Identify the application's existing AI workflow or agent event integration points.
8. Identify existing asset-management conventions.

Do not introduce unnecessary dependencies or modify unrelated application architecture.

Preserve an untouched copy of the original PNG.

The existing approved logo is the authoritative visual reference.

Do not begin implementing animations until the SVG representation has been established and visually verified.

# 3. SVG ASSET PREPARATION AND VECTORIZATION

The original Edapex robot artwork is currently available as a PNG.

Convert it into a genuine, editable SVG suitable for direct GSAP manipulation.

## 3.1 Recommended CLI Tools

Use available command-line tools wherever practical.

Recommended tools:

| Tool | Responsibility |
|---|---|
| ImageMagick | Image inspection and preprocessing |
| Potrace | Bitmap-to-vector conversion |
| Inkscape CLI | SVG inspection, rendering and editing |
| SVGO | SVG optimisation |

On Ubuntu, install the required tools if they are not already available:

```bash
sudo apt update

sudo apt install -y \
  imagemagick \
  potrace \
  inkscape \
  npm
```

Install SVGO:

```bash
npm install -g svgo
```

Check installed versions before proceeding.

## 3.2 Image Inspection and Preprocessing

First inspect the original PNG.

Determine:

- Image dimensions.
- Background colour.
- Transparency.
- Whether the artwork contains antialiasing.
- Whether the image contains only black and white or additional shades.

Use ImageMagick to prepare a bitmap suitable for tracing.

Example:

```bash
magick robot.png \
  -background white \
  -alpha remove \
  -alpha off \
  -colorspace Gray \
  -threshold 50% \
  robot.pbm
```

Adjust the threshold based on the actual image.

Do not blindly apply thresholding if it destroys important edge details.

## 3.3 Initial Vectorization

Use Potrace to generate an initial SVG:

```bash
potrace robot.pbm \
  --svg \
  --turdsize 2 \
  --alphamax 1.0 \
  --opttolerance 0.2 \
  -o robot-initial.svg
```

Treat the generated SVG as an initial tracing, not the final production asset.

Automatic tracing will not understand the semantic meaning of the robot's individual components.

The agent must inspect and refine the resulting paths.

## 3.4 SVG Reconstruction and Refinement

Reconstruct or refine individual geometric elements where automatic tracing produces irregular paths.

Prioritise:

- Symmetry.
- Clean curves.
- Minimal path nodes.
- Consistent corner radii.
- Accurate negative spaces.
- Smooth circular geometry.
- Original proportions.
- Faithful silhouette preservation.

Use native SVG primitives such as:

- `<path>`
- `<circle>`
- `<rect>`
- `<ellipse>`
- `<g>`

Where they produce cleaner and more maintainable geometry.

Do not unnecessarily convert simple geometric shapes into complex paths.

Do not embed the original PNG inside an SVG wrapper.

The final asset must contain actual vector geometry.

## 3.5 Layered SVG Architecture

The robot must be organised into independently identifiable elements.

Suggested logical hierarchy:

```text
EdapexRobot
│
├── Antenna
│   ├── AntennaStem
│   └── AntennaOrb
│
├── Head
│   ├── LeftHeadSection
│   └── RightHeadSection
│
├── Eyes
│   ├── LeftEye
│   └── RightEye
│
├── Ears
│   ├── LeftEar
│   └── RightEar
│
├── BookDetails
│   ├── LeftBookEdge
│   └── RightBookEdge
│
└── OptionalAnimationElements
    ├── SignalRipple
    ├── CompletionIndicator
    └── ErrorIndicator
```

This is a logical animation hierarchy, not an instruction to invent new geometry.

Use SVG groups (`<g>`) and stable IDs.

Suggested IDs:

```text
robot-root
robot-antenna
robot-antenna-orb
robot-left-eye
robot-right-eye
robot-left-pupil
robot-right-pupil
robot-left-ear
robot-right-ear
robot-left-book-edge
robot-right-book-edge
```

Adapt these IDs to the actual artwork.

Do not assume the existing eyes contain separate pupils.

Inspect the geometry and introduce the minimum additional elements required for animation without changing the original appearance.

## 3.6 SVG Optimisation and Validation

After reconstruction:

```bash
svgo robot.svg -o robot.optimized.svg
```

Configure SVGO to preserve:

- Element IDs.
- Required groups.
- Animation-related attributes.
- Important transforms.
- SVG structure required by GSAP.

Do not allow optimisation to remove identifiers used by the animation controller.

Validate the resulting SVG by rendering it at multiple resolutions.

Example:

```bash
inkscape robot.svg \
  --export-filename=robot-preview.png \
  --export-width=1024
```

Compare the preview against the original PNG.

The final SVG must preserve the original robot's recognizable silhouette.

## 3.7 Asset Deliverables

Provide:

```text
assets/edapex-robot/
│
├── original/
│   └── robot-original.png
│
├── source/
│   ├── robot.svg
│   └── robot-preview.png
│
└── production/
    └── robot.optimized.svg
```

Also provide brief documentation describing the SVG element hierarchy and animation-related IDs.

# 4. VISUAL IDENTITY REQUIREMENTS

The original Edapex robot logo is the authoritative visual identity.

Its recognizable features include:

- Geometric robot head.
- Two circular eyes.
- Side ear components.
- Upper antenna with circular element.
- Lower integrated open-book silhouette.
- Minimalist black-and-white construction.

Preserve:

- Original silhouette.
- Relative proportions.
- Symmetry.
- Geometry.
- Corner radii.
- Negative spaces.
- Eye positioning.
- Antenna positioning.
- Book-shaped lower contours.

Do not redesign the robot.

Do not add a permanent mouth.

Do not introduce unnecessary decorative elements.

Do not change the robot's identity between animation states.

The personality must emerge from animation, not redesign.

## SVG Technical Requirements

- Use `viewBox` for responsive scaling.
- Preserve the original aspect ratio.
- Avoid unnecessary SVG filters.
- Avoid raster assets inside the SVG.
- Use `transform-origin` and `transform-box` carefully.
- Keep animation elements separate from static geometry.
- Ensure consistent rendering across modern browsers.
- Support transparent backgrounds.
- Support configurable dimensions.
- Allow optional theme-aware styling without changing the default brand appearance.

# 5. TECHNOLOGY ARCHITECTURE

Use the following stack:

**Rendering:** SVG.

**Component layer:** React + TypeScript.

**Animation layer:** GSAP.

**State management:** Lightweight custom finite state machine.

Do not introduce XState or another heavyweight state management dependency unless the existing application already uses it and there is a compelling integration reason.

Separate responsibilities:

1. SVG rendering.
2. Animation timelines.
3. State transitions.
4. Activity-specific behaviour.
5. Application event integration.

The state machine decides WHAT the robot should be doing.

GSAP decides HOW the robot visually performs that behaviour.

React provides the component interface and lifecycle integration.

# 6. ANIMATION STATE MACHINE

Implement the following primary states:

```typescript
type RobotState =
  | "idle"
  | "receiving"
  | "working"
  | "completed"
  | "error";
```

Define working activities separately:

```typescript
type RobotActivity =
  | "reading"
  | "searching"
  | "analyzing"
  | "writing"
  | "executing"
  | "verifying";
```

Activities are contextual properties of the `working` state, not independent primary states.

## 6.1 IDLE — Attentive Personality

Purpose: Represent an available AI assistant waiting for instructions.

Personality: Calm, intelligent, approachable and attentive.

Animation:

- Eyes face forward.
- Occasional natural blinking.
- Both eyes blink synchronously.
- Antenna remains stationary.
- Head remains stationary.
- Book structure remains stationary.
- Ears remain stationary.

Blinking:

- Randomized interval of approximately 4–7 seconds.
- Natural closing and reopening.
- Short blink duration.
- Slight timing variation.

The idle animation loops indefinitely.

The robot must not look asleep or inactive.

It should look attentive and available.

## 6.2 RECEIVING — Alert Personality

Purpose: Communicate that the robot has received a new instruction.

Personality: Alert, responsive and attentive.

Animation sequence:

1. Antenna orb performs a subtle activation pulse.
2. Eyes briefly widen or otherwise express attention using existing geometry.
3. A subtle signal ripple may emanate from the antenna.
4. Eyes settle into a focused forward-facing position.
5. Animation completes.

Requirements:

- Restrained and professional.
- One-shot animation.
- Approximately 1–2 seconds.
- Must not loop indefinitely.

After completion, transition automatically into `working`, unless another event interrupts or cancels the task.

## 6.3 WORKING — Focused Personality

Purpose: Communicate that the AI agent is actively performing work.

Personality: Focused, intelligent and purposeful.

This is the most important animation state.

Base animation:

- Subtle eye movements.
- Occasional horizontal scanning.
- Occasional upward or downward adjustments where supported by the geometry.
- Occasional antenna pulses.
- Subtle activity along the inner book edges.
- No exaggerated movement.

The animation must loop continuously while the agent remains in the working state.

### Activity-specific variations

**READING**

- Eyes scan predominantly from left to right.
- Brief pauses between scanning movements.
- Occasional downward eye adjustment.
- Subtle book-edge activity.

**SEARCHING**

- Eyes perform occasional directional scanning.
- Movements suggest looking through information.
- Antenna occasionally pulses.

**ANALYZING**

- Eyes remain relatively focused.
- Longer pauses.
- Occasional subtle eye adjustments.
- Slower antenna activity.

**WRITING**

- Eyes occasionally look downward.
- Subtle book-edge activity.
- Movement suggests producing information rather than searching.

**EXECUTING**

- Eyes remain focused.
- Occasional antenna activation.
- Subtle coordinated activity.
- Communicate that the assistant is carrying out an operation.

**VERIFYING**

- Eyes perform brief focused scanning.
- Short pauses between movements.
- Subtle confirmation-oriented antenna behaviour.

Activity changes must not cause the robot to return to idle.

Changing from reading to writing should transition smoothly without restarting the entire animation unnecessarily.

When the actual agent activity is unknown, use a generic working animation rather than inventing an activity.

## 6.4 COMPLETED — Satisfied Personality

Purpose: Communicate successful task completion.

Personality: Satisfied, confident and friendly.

Animation sequence:

1. Antenna performs one short celebratory pulse.
2. Eyes briefly express satisfaction through subtle movement.
3. An optional small success indicator appears.
4. Robot returns to its normal attentive appearance.

Avoid excessive celebration.

Do not introduce large checkmarks or distracting effects.

Requirements:

- One-shot animation.
- Approximately 1–2 seconds.
- Automatically transition to idle after completion.

## 6.5 ERROR — Concerned Personality

Purpose: Communicate that an operation encountered a problem.

Personality: Concerned but composed.

Animation:

- Subtle antenna warning indication.
- Brief eye movement indicating an unsuccessful operation.
- Optional restrained error indicator.
- No aggressive shaking.
- No cartoon-like distress.

Use a configurable error visual treatment.

If status colours are supported, error indicators may use a restrained red accent while preserving the robot's black-and-white identity.

The error state must remain distinguishable until acknowledged, dismissed or recovered from.

Do not automatically hide important error information when the animation finishes.

# 7. STATE MACHINE EVENTS

Define a typed event interface:

```typescript
type RobotEvent =
  | {
      type: "TASK_RECEIVED";
      taskId?: string;
    }
  | {
      type: "RECEIVING_COMPLETE";
    }
  | {
      type: "ACTIVITY_CHANGED";
      activity: RobotActivity;
    }
  | {
      type: "TASK_COMPLETED";
      taskId?: string;
    }
  | {
      type: "TASK_FAILED";
      error?: string;
    }
  | {
      type: "ERROR_ACKNOWLEDGED";
    }
  | {
      type: "TASK_CANCELLED";
    }
  | {
      type: "RESET";
    };
```

Provide a central `send(event)` interface.

Example:

```typescript
robot.send({
  type: "TASK_RECEIVED",
  taskId: "task-001"
});

robot.send({
  type: "ACTIVITY_CHANGED",
  activity: "reading"
});

robot.send({
  type: "ACTIVITY_CHANGED",
  activity: "writing"
});

robot.send({
  type: "TASK_COMPLETED",
  taskId: "task-001"
});
```

## 7.1 State Transition Rules

Expected lifecycle:

```text
IDLE
  |
  | TASK_RECEIVED
  v
RECEIVING
  |
  | RECEIVING_COMPLETE
  v
WORKING
  |
  | ACTIVITY_CHANGED
  v
WORKING (new activity)
  |
  | TASK_COMPLETED
  v
COMPLETED
  |
  | COMPLETION_ANIMATION_FINISHED
  v
IDLE
```

Failure lifecycle:

```text
WORKING
  |
  | TASK_FAILED
  v
ERROR
  |
  | ERROR_ACKNOWLEDGED
  v
IDLE
```

Cancellation:

```text
RECEIVING / WORKING
  |
  | TASK_CANCELLED
  v
IDLE
```

The state machine must validate transitions.

Invalid or irrelevant events must not produce inconsistent states.

Examples:

- Activity changes must not start working animations when idle.
- Stale completion events must not terminate newer tasks.
- Events from old tasks must not override the active task.
- Repeated activity updates must not unnecessarily restart timelines.

Use task identifiers where available to prevent stale event handling.

# 8. GSAP ANIMATION ENGINE

Implement GSAP timelines independently of the state machine.

Suggested controller interface:

```typescript
interface RobotAnimationController {
  playIdle(): void;
  playReceiving(): void;
  playWorking(activity: RobotActivity): void;
  playCompleted(): void;
  playError(): void;

  transitionTo(state: RobotState): void;

  destroy(): void;
}
```

Adapt as appropriate.

## 8.1 Animation Requirements

- Use GSAP timelines for coordinated movements.
- Use reusable animation primitives.
- Avoid unnecessary animation duplication.
- Avoid manipulating React state on every animation frame.
- Animate SVG elements directly.
- Keep transforms subtle.
- Use appropriate easing.
- Prevent overlapping uncontrolled timelines.

Use `gsap.context()` or the appropriate GSAP React integration for lifecycle-safe cleanup.

All timelines, delayed calls and event listeners must be cleaned up when the component unmounts.

## 8.2 Animation Interruption

The controller must support interruption.

Examples:

- If a task fails during reading, stop reading and transition to error.
- If a task completes during searching, stop searching and play completion.
- If a new activity arrives during working, transition smoothly.

Avoid abruptly resetting all SVG elements.

Before starting a new animation:

1. Kill or complete incompatible timelines.
2. Preserve the current visual state where appropriate.
3. Establish the correct animation baseline.
4. Start the new timeline.
5. Prevent conflicting transforms on the same SVG elements.

Use explicit timeline ownership and cleanup.

## 8.3 Performance

- Prefer transform and opacity animations.
- Avoid expensive SVG filters.
- Avoid continuous layout calculations.
- Avoid unnecessary DOM queries.
- Cache SVG element references.
- Use GSAP directly rather than React rendering loops.
- Keep idle animations lightweight.

# 9. REACT COMPONENT API

Build a reusable component.

Suggested interface:

```typescript
interface EdapexRobotProps {
  state?: RobotState;

  activity?: RobotActivity;

  size?: number | string;

  className?: string;

  autoplay?: boolean;

  reducedMotion?: boolean;

  onStateChange?: (
    state: RobotState
  ) => void;

  onAnimationComplete?: (
    state: RobotState
  ) => void;
}
```

Support controlled and internally managed operation.

### Controlled mode

```tsx
<EdapexRobot
  state="working"
  activity="reading"
  size={160}
/>
```

### Event-driven mode

```typescript
const robot = useEdapexRobot();

robot.send({
  type: "TASK_RECEIVED"
});
```

The final API should be ergonomic and consistent with the existing application architecture.

Do not force parent components to rerender for every animation movement.

Expose a clean imperative controller or hook where appropriate.

# 10. ACCESSIBILITY AND USER EXPERIENCE

Implement:

- `prefers-reduced-motion` support.
- Static robot representation when reduced motion is enabled.
- No aggressive visual effects.
- No animation that interferes with reading or interaction.
- No reliance on colour alone to communicate status.

Provide an optional accessible status label.

Examples:

- AI assistant is ready.
- AI assistant received a task.
- AI assistant is reading.
- AI assistant is writing.
- AI assistant completed the task.
- AI assistant encountered an error.

Status text must be controlled by the application, not embedded in the SVG.

# 11. VISUAL DESIGN CONSTRAINTS

Non-negotiable:

1. Preserve the original Edapex robot silhouette.
2. No redesign between states.
3. No permanent mouth.
4. No unnecessary facial features.
5. No excessive head movement.
6. No exaggerated bouncing.
7. No cartoon-style celebration.
8. No unnecessary gradients.
9. No continuous antenna pulsing in idle.
10. No camera movement or 3D effects.

The robot should feel like a premium technology product.

# 12. SUGGESTED PROJECT STRUCTURE

Adapt this structure to the existing repository rather than forcing a new folder convention.

```text
edapex-robot/
│
├── assets/
│   ├── original/
│   │   └── robot-original.png
│   ├── source/
│   │   ├── robot.svg
│   │   └── robot-preview.png
│   └── production/
│       └── robot.optimized.svg
│
├── components/
│   ├── EdapexRobot.tsx
│   └── RobotStatus.tsx
│
├── graphics/
│   └── robot.svg
│
├── engine/
│   ├── state-machine.ts
│   ├── animation-controller.ts
│   ├── transitions.ts
│   ├── event-types.ts
│   └── animation-registry.ts
│
├── animations/
│   ├── idle.ts
│   ├── receiving.ts
│   ├── working.ts
│   ├── completed.ts
│   └── error.ts
│
├── hooks/
│   └── useEdapexRobot.ts
│
├── types/
│   └── index.ts
│
├── utils/
│   └── timing.ts
│
└── index.ts
```

Avoid duplicating the authoritative SVG unnecessarily. The actual asset should have one source of truth.

# 13. TESTING REQUIREMENTS

Implement automated tests for the state machine and animation integration.

## State machine tests

Verify:

- Initial state is idle.
- Task reception triggers receiving.
- Receiving completion triggers working.
- Activity changes update the working activity.
- Task completion triggers completed.
- Completion animation returns to idle.
- Failure triggers error.
- Error acknowledgement returns to idle.
- Cancellation returns to idle.
- Invalid events are safely ignored.
- Stale task events are rejected.

## Animation engine tests

Verify:

- Correct timeline plays for each state.
- Activity variations work.
- Previous timelines are cleaned up.
- Interrupted animations do not leave elements in incorrect positions.
- Unmounting cleans up GSAP resources.
- Reduced-motion mode does not run unnecessary animations.

## React integration tests

Verify:

- Component renders at different sizes.
- Controlled state updates work.
- Event-driven mode works.
- No unnecessary rerenders during animation.
- Multiple robot instances coexist independently.

# 14. IMPLEMENTATION PHASES

Implement progressively.

## Phase 1: Asset Preparation and SVG Foundation

- Inspect the existing PNG.
- Preserve the original image.
- Preprocess using ImageMagick where necessary.
- Vectorize using Potrace or Inkscape.
- Reconstruct and refine paths.
- Create layered SVG.
- Assign stable animation IDs.
- Validate rendering at multiple sizes.

Deliverables:

- Editable SVG.
- Optimised production SVG.
- Preview PNG.
- SVG hierarchy documentation.

## Phase 2: Animation Foundation

- Install or reuse GSAP.
- Implement animation controller.
- Implement blinking.
- Implement eye movement.
- Implement antenna movement.
- Implement reusable timeline primitives.

Deliverable: Independently controllable animated robot.

## Phase 3: State Machine

- Implement typed states.
- Implement typed events.
- Implement transition validation.
- Implement lifecycle management.
- Implement interruption handling.
- Implement stale event protection.

Deliverable: Functional state-driven animation engine.

## Phase 4: Personality Implementation

Implement:

1. Idle.
2. Receiving.
3. Working.
4. Completed.
5. Error.

Then implement the six working activity variations.

Deliverable: Complete Edapex robot personality system.

## Phase 5: React Integration

- Implement reusable component.
- Implement hook/controller.
- Implement controlled and event-driven modes.
- Implement accessibility support.

Deliverable: Application-ready React module.

## Phase 6: Testing and Documentation

- Test state transitions.
- Test animation cleanup.
- Test responsive behaviour.
- Test reduced motion.
- Document component API.
- Document event API.
- Provide usage examples.

Deliverable: Production-ready implementation.

# 15. DEFINITION OF DONE

The implementation is complete only when:

1. The original Edapex PNG is preserved.
2. A genuine editable SVG has been created.
3. The SVG faithfully represents the original logo.
4. All important robot components can be animated independently.
5. All five primary states work.
6. All six working activities have distinct animation behaviours.
7. State transitions are event-driven.
8. GSAP timelines are properly managed and cleaned up.
9. Animation interruption is handled correctly.
10. Multiple robot instances work independently.
11. The component supports different sizes.
12. Reduced-motion accessibility is implemented.
13. Automated tests cover the state machine.
14. Documentation explains how to integrate the component with an AI agent.

The implementation must contain real, functional code.

Do not substitute static mockups, screenshots, GIFs or hardcoded demonstrations for the actual animation engine.

# 16. FINAL ENGINEERING DIRECTION

Think of this as a small animation subsystem within Edapex, not simply a decorative logo component.

The SVG is the character.

GSAP is its movement engine.

The finite state machine is its behavioural brain.

React is its application interface.

AI agent events are the signals that determine what it does.

Keep these responsibilities separate.

Prioritise:

- Visual fidelity.
- Predictable state transitions.
- Performance.
- Maintainability.
- Accessibility.
- Extensibility.

Do not overengineer the initial implementation, but establish an architecture that accommodates additional robot personalities, activities and interaction patterns in the future.

## EXECUTION INSTRUCTIONS

Start by inspecting the repository and locating the existing approved PNG logo.

Proceed through the implementation phases in order.

Do not silently skip phases or replace missing requirements with assumptions.

Do not redesign the logo.

Do not implement animations against an unverified SVG.

At the end of each phase:

1. Report what was implemented.
2. Identify files created or modified.
3. Run relevant validation and tests.
4. Report outstanding issues.
5. Proceed to the next phase when the current phase is satisfactory.

The final result should be a production-ready Edapex Robot Animation System that can be controlled directly by real AI agent workflow events.