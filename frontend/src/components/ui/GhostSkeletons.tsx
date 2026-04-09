import { Skeleton } from 'boneyard-js/react'

/**
 * GhostSkeletons
 * High-fidelity, kinetic loading states for the EdApex Command Center.
 * Uses boneyard-js wrapper pattern: wraps real content so the skeleton
 * snapshots the actual DOM layout — zero manual descriptors.
 */

/**
 * Dashboard-level skeleton wrap.
 * Wrap the full Command Center content; boneyard captures its layout
 * and displays bones while `loading` is true.
 */
export function DashboardSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <Skeleton name="command-center-dashboard" loading={true}>
      {children ?? <DashboardPlaceholder />}
    </Skeleton>
  )
}

/**
 * Pulse panel item skeleton wrap.
 * Wraps individual pulse event cards so boneyard snapshots their shape.
 */
export function PulseItemSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <Skeleton name="pulse-item" loading={true}>
      {children ?? <PulseItemPlaceholder />}
    </Skeleton>
  )
}

/**
 * Work Gallery card skeleton wrap.
 * Wraps individual artifact cards for masonry loading states.
 */
export function WorkCardSkeleton({ children }: { children?: React.ReactNode }) {
  return (
    <Skeleton name="work-gallery-card" loading={true}>
      {children ?? <WorkCardPlaceholder />}
    </Skeleton>
  )
}

// --- Placeholder layouts (provide DOM structure for bone capture) ---

function DashboardPlaceholder() {
  return (
    <div className="space-y-8">
      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-2xl border border-(--line) bg-(--bg-card) p-5 h-[120px]" />
        ))}
      </div>
      {/* Activity Bar */}
      <div className="rounded-2xl border border-(--line) bg-(--bg-card) p-4 h-[48px]" />
      {/* Masonry Grid */}
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
        {[140, 180, 120, 160, 130, 150].map((h, i) => (
          <div key={i} className="break-inside-avoid rounded-2xl border border-(--line) bg-(--bg-card) p-5" style={{ height: `${h}px` }} />
        ))}
      </div>
    </div>
  )
}

function PulseItemPlaceholder() {
  return (
    <div className="p-3 rounded-xl border border-(--line) h-[60px]" />
  )
}

function WorkCardPlaceholder() {
  return (
    <div className="rounded-2xl border border-(--line) bg-(--bg-card) p-5 h-[160px]" />
  )
}
