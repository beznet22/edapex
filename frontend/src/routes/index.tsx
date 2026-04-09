import { createFileRoute } from '@tanstack/react-router'
import { Suspense, lazy } from 'react'
import { Brain, Zap, Users, DollarSign, TrendingUp, Activity } from 'lucide-react'
import { DashboardSkeleton } from '../components/ui/GhostSkeletons.js'
import { PrincipalSearchBar } from '../components/layout/PrincipalSearchBar.js'

const WorkGallery = lazy(() =>
  import('../components/WorkGallery.js').then((m) => ({ default: m.WorkGallery }))
)

export const Route = createFileRoute('/')({ component: CommandCenter })

// --- KPI Cards ---

interface KpiCardProps {
  title: string
  value: string
  change: string
  changeType: 'up' | 'down' | 'neutral'
  icon: React.ReactNode
  accentColor: string
}

function KpiCard({ title, value, change, changeType, icon, accentColor }: KpiCardProps) {
  const changeColor =
    changeType === 'up'
      ? 'text-emerald-500'
      : changeType === 'down'
        ? 'text-red-500'
        : 'text-(--sea-ink-soft)'

  return (
    <div className="rounded-2xl border border-(--line) bg-(--bg-card) p-5 transition-all duration-300 hover:shadow-lg hover:shadow-blue-500/5 hover:border-(--kinetic-blue)/20 group">
      <div className="flex items-center justify-between mb-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${accentColor}`}>
          {icon}
        </div>
        <div className={`flex items-center gap-1 text-xs font-bold ${changeColor}`}>
          <TrendingUp className={`w-3 h-3 ${changeType === 'down' ? 'rotate-180' : ''}`} />
          {change}
        </div>
      </div>
      <p className="text-2xl font-bold tracking-tight text-(--sea-ink) mb-1">{value}</p>
      <p className="text-[11px] font-medium text-(--sea-ink-soft) uppercase tracking-wider">{title}</p>
    </div>
  )
}

// --- Main Page ---

function CommandCenter() {
  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-(--sea-ink) mb-1">Command Center</h1>
          <p className="text-sm text-(--sea-ink-soft)">Real-time orchestration and cognitive observability</p>
        </div>
        <div className="w-[400px]">
          <PrincipalSearchBar />
        </div>
      </div>

      {/* KPI Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <KpiCard
          title="Active Agents"
          value="7"
          change="+2 today"
          changeType="up"
          icon={<Brain className="w-5 h-5 text-blue-600" />}
          accentColor="bg-blue-500/10"
        />
        <KpiCard
          title="Tasks Completed"
          value="142"
          change="+23 this week"
          changeType="up"
          icon={<Zap className="w-5 h-5 text-emerald-600" />}
          accentColor="bg-emerald-500/10"
        />
        <KpiCard
          title="Students Enrolled"
          value="3,847"
          change="+156 this term"
          changeType="up"
          icon={<Users className="w-5 h-5 text-violet-600" />}
          accentColor="bg-violet-500/10"
        />
        <KpiCard
          title="AI Spend (MTD)"
          value="$12.47"
          change="$0.83 today"
          changeType="neutral"
          icon={<DollarSign className="w-5 h-5 text-amber-600" />}
          accentColor="bg-amber-500/10"
        />
      </div>

      {/* Activity Bar */}
      <div className="flex items-center gap-3 mb-6 p-4 rounded-2xl border border-(--line) bg-(--bg-card)">
        <Activity className="w-4 h-4 text-(--kinetic-blue)" />
        <span className="text-xs font-bold uppercase tracking-wider text-(--sea-ink-soft)">Work Products</span>
        <div className="flex-1" />
        <span className="text-[10px] font-bold text-(--sea-ink-soft)">Last synced: just now</span>
      </div>

      {/* Work Gallery with Suspense */}
      <Suspense fallback={<DashboardSkeleton />}>
        <WorkGallery />
      </Suspense>
    </>
  )
}
