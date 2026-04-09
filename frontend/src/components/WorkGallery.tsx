import { useState } from 'react'
import { FileText, Image, Code, BarChart3, Clock, CheckCircle2, AlertTriangle, type LucideIcon } from 'lucide-react'

// --- Domain Types ---

type ArtifactStatus = 'complete' | 'in_progress' | 'needs_review'
type ArtifactCategory = 'document' | 'report' | 'code' | 'media'

interface WorkArtifact {
  id: string
  title: string
  description: string
  category: ArtifactCategory
  status: ArtifactStatus
  agentId: string
  updatedAt: string
  size: string
}

// --- Icon & Color Maps ---

const CATEGORY_ICON: Record<ArtifactCategory, LucideIcon> = {
  document: FileText,
  report: BarChart3,
  code: Code,
  media: Image,
}

const CATEGORY_COLOR: Record<ArtifactCategory, string> = {
  document: 'bg-blue-500/10 text-blue-600',
  report: 'bg-emerald-500/10 text-emerald-600',
  code: 'bg-violet-500/10 text-violet-600',
  media: 'bg-amber-500/10 text-amber-600',
}

const STATUS_BADGE: Record<ArtifactStatus, { label: string; className: string; Icon: LucideIcon }> = {
  complete: { label: 'Complete', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20', Icon: CheckCircle2 },
  in_progress: { label: 'In Progress', className: 'bg-blue-500/10 text-blue-600 border-blue-500/20', Icon: Clock },
  needs_review: { label: 'Needs Review', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20', Icon: AlertTriangle },
}

// --- Seed Data (replaced by real API calls in production) ---

const SEED_ARTIFACTS: WorkArtifact[] = [
  {
    id: '1',
    title: 'Q2 Academic Calendar',
    description: 'Auto-generated term dates, exam windows, and holiday breaks for all 6 campuses.',
    category: 'document',
    status: 'complete',
    agentId: 'academic-supervisor',
    updatedAt: '2 min ago',
    size: '24 KB',
  },
  {
    id: '2',
    title: 'Staff Payroll Batch',
    description: 'April payroll computation including tax deductions and pension contributions.',
    category: 'report',
    status: 'in_progress',
    agentId: 'finance-agent',
    updatedAt: '8 min ago',
    size: '156 KB',
  },
  {
    id: '3',
    title: 'CBT Exam Module',
    description: 'Computer-based testing engine with anti-cheat proctoring and offline sync.',
    category: 'code',
    status: 'needs_review',
    agentId: 'exam-supervisor',
    updatedAt: '23 min ago',
    size: '2.1 MB',
  },
  {
    id: '4',
    title: 'Campus Photo Gallery',
    description: 'Compressed and optimized media assets for the 2026 prospectus.',
    category: 'media',
    status: 'complete',
    agentId: 'content-agent',
    updatedAt: '1 hour ago',
    size: '8.4 MB',
  },
  {
    id: '5',
    title: 'Attendance Analytics',
    description: 'Weekly attendance trends across all departments with anomaly detection.',
    category: 'report',
    status: 'complete',
    agentId: 'analytics-agent',
    updatedAt: '3 hours ago',
    size: '42 KB',
  },
  {
    id: '6',
    title: 'Parent Communication Draft',
    description: 'Bilingual newsletter template for end-of-term parent-teacher conference.',
    category: 'document',
    status: 'in_progress',
    agentId: 'comms-supervisor',
    updatedAt: '5 hours ago',
    size: '18 KB',
  },
]

// --- Filter Tabs ---

type FilterTab = 'all' | ArtifactCategory

// --- Component ---

export function WorkGallery() {
  const [activeFilter, setActiveFilter] = useState<FilterTab>('all')

  const filtered = activeFilter === 'all'
    ? SEED_ARTIFACTS
    : SEED_ARTIFACTS.filter((a) => a.category === activeFilter)

  const filters: { key: FilterTab; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'document', label: 'Documents' },
    { key: 'report', label: 'Reports' },
    { key: 'code', label: 'Code' },
    { key: 'media', label: 'Media' },
  ]

  return (
    <section>
      {/* Filter Bar */}
      <div className="flex items-center gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setActiveFilter(f.key)}
            className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition-all duration-200 border ${
              activeFilter === f.key
                ? 'bg-(--kinetic-blue) text-white border-transparent shadow-lg shadow-blue-500/20'
                : 'bg-(--bg-card) text-(--sea-ink-soft) border-(--line) hover:border-(--kinetic-blue)/30 hover:text-(--kinetic-blue)'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-[10px] font-bold text-(--sea-ink-soft) uppercase tracking-widest">
          {filtered.length} artifact{filtered.length !== 1 ? 's' : ''}
        </span>
      </div>

      {/* Masonry Grid */}
      <div className="columns-1 sm:columns-2 lg:columns-3 gap-4 space-y-4">
        {filtered.map((artifact, index) => {
          const CategoryIcon = CATEGORY_ICON[artifact.category]
          const categoryColor = CATEGORY_COLOR[artifact.category]
          const statusBadge = STATUS_BADGE[artifact.status]
          const StatusIcon = statusBadge.Icon

          return (
            <article
              key={artifact.id}
              className="break-inside-avoid rounded-2xl border border-(--line) bg-(--bg-card) p-5 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/5 hover:border-(--kinetic-blue)/20 hover:-translate-y-0.5 group cursor-pointer"
              style={{ animationDelay: `${index * 80}ms` }}
            >
              {/* Header */}
              <div className="flex items-start justify-between mb-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${categoryColor}`}>
                  <CategoryIcon className="w-4 h-4" />
                </div>
                <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusBadge.className}`}>
                  <StatusIcon className="w-3 h-3" />
                  {statusBadge.label}
                </div>
              </div>

              {/* Content */}
              <h3 className="text-sm font-bold text-(--sea-ink) mb-1.5 group-hover:text-(--kinetic-blue) transition-colors">
                {artifact.title}
              </h3>
              <p className="text-xs text-(--sea-ink-soft) leading-relaxed mb-4 line-clamp-2">
                {artifact.description}
              </p>

              {/* Footer */}
              <div className="flex items-center justify-between pt-3 border-t border-(--line)">
                <div className="flex items-center gap-2">
                  <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[7px] font-bold">
                    {artifact.agentId.slice(0, 2).toUpperCase()}
                  </div>
                  <span className="text-[10px] text-(--sea-ink-soft) font-medium">{artifact.agentId}</span>
                </div>
                <div className="flex items-center gap-3 text-[10px] text-(--sea-ink-soft)">
                  <span>{artifact.size}</span>
                  <span>{artifact.updatedAt}</span>
                </div>
              </div>
            </article>
          )
        })}
      </div>
    </section>
  )
}
