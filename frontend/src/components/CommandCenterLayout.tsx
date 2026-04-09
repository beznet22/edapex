import { usePulse, type AgentPulseEvent } from '../hooks/usePulse.js'
import { Zap, DollarSign, Activity, Terminal } from 'lucide-react'

export function Sidebar() {
  return (
    <aside className="w-64 h-screen border-r border-(--line) bg-(--bg-card) flex flex-col p-4 shadow-sm z-10">
      <div className="flex items-center gap-3 mb-10 px-2 mt-2">
        <div className="w-8 h-8 rounded-lg bg-linear-to-br from-(--kinetic-blue) to-(--kinetic-deep) flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Zap className="w-5 h-5 text-white" />
        </div>
        <div className="text-xl font-bold tracking-tight display-title">EdApex</div>
      </div>
      
      <nav className="flex-1 space-y-1.5 px-1">
        <label className="text-[10px] font-bold uppercase tracking-widest text-(--sea-ink-soft) px-3 mb-2 block">Control Plane</label>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl bg-(--kinetic-blue)/10 text-(--kinetic-blue) transition-all">
          <Activity className="w-4 h-4" />
          Command Center
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl text-(--sea-ink-soft) hover:bg-(--kinetic-blue)/5 hover:text-(--kinetic-blue) transition-all">
          <Terminal className="w-4 h-4" />
          Academic 18
        </button>
        <button className="w-full flex items-center gap-3 px-3 py-2.5 text-sm font-medium rounded-xl text-(--sea-ink-soft) hover:bg-(--kinetic-blue)/5 hover:text-(--kinetic-blue) transition-all">
          <DollarSign className="w-4 h-4" />
          Financial Ledger
        </button>
      </nav>
      
      <div className="mt-auto p-4 rounded-2xl bg-(--kinetic-blue)/5 border border-(--kinetic-blue)/10">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold">BZ</div>
          <div>
            <div className="text-xs font-bold">Beznet</div>
            <div className="text-[10px] text-(--sea-ink-soft)">Proprietor Mode</div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export function PulsePanel() {
  const { events, status, lastTick } = usePulse('demo-tenant')

  return (
    <aside className="w-[320px] h-screen border-l border-(--line) bg-(--bg-card)/80 backdrop-blur-xl flex flex-col shadow-2xl z-10">
      <div className="p-6 border-b border-(--line)">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-sm font-bold tracking-tight uppercase text-(--sea-ink)">Agent Pulse</h2>
          <div className={`w-2 h-2 rounded-full ${status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' : 'bg-red-500'}`} />
        </div>
        <p className="text-[10px] text-(--sea-ink-soft) font-medium">REAL-TIME COGNITIVE TELEMETRY</p>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
        <div className="space-y-3">
          {events.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 opacity-30">
              <Activity className="w-8 h-8 mb-4 animate-pulse" />
              <p className="text-xs font-medium">Awaiting Neural Uplink...</p>
            </div>
          ) : (
            events.map((event: AgentPulseEvent, idx: number) => (
              <div 
                key={`${event.timestamp}-${idx}`}
                className={`p-3 rounded-xl border animate-in slide-in-from-right-4 fade-in duration-500 flex flex-col gap-2 ${
                  event.eventType === 'cost_event' 
                    ? 'bg-amber-500/5 border-amber-500/10' 
                    : 'bg-blue-500/5 border-blue-500/10'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {event.eventType === 'cost_event' ? (
                      <div className="w-5 h-5 rounded bg-amber-500/20 flex items-center justify-center">
                        <DollarSign className="w-3 h-3 text-amber-600" />
                      </div>
                    ) : (
                      <div className="w-5 h-5 rounded bg-blue-500/20 flex items-center justify-center">
                        <Activity className="w-3 h-3 text-blue-600" />
                      </div>
                    )}
                    <span className="text-[10px] font-bold uppercase tracking-wider">
                      {event.eventType.replace('_', ' ')}
                    </span>
                  </div>
                  <span className="text-[9px] font-medium opacity-50">
                    {new Date(event.timestamp).toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                </div>
                
                <div className="text-xs font-medium leading-relaxed">
                  {event.eventType === 'cost_event' ? (
                    <div className="flex flex-col gap-1">
                      <div className="flex justify-between items-center">
                        <span className="text-(--sea-ink-soft)">{event.payload.description || 'API Consumption'}</span>
                        <span className="font-bold text-amber-700">-${(Number(event.payload.amountCents || 0) / 100).toFixed(2)}</span>
                      </div>
                      <div className="h-1 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className="h-full bg-amber-500 w-[60%]" />
                      </div>
                    </div>
                  ) : (
                    <span className="text-(--sea-ink-soft)">
                      {JSON.stringify(event.payload)}
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
      
      <div className="p-4 border-t border-(--line) bg-(--bg-base)/50">
        <div className="flex items-center justify-between text-[10px] mb-2 font-bold text-(--sea-ink-soft)">
          <span>ENGINE UPTIME</span>
          <span>{Math.floor((Date.now() - lastTick) / 1000)}S LAG</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex -space-x-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className={`w-6 h-6 rounded-full border-2 border-white dark:border-slate-900 bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-[8px] font-bold`}>
                A{i}
              </div>
            ))}
          </div>
          <div className="text-[10px] font-bold text-green-500 uppercase tracking-widest flex items-center gap-1.5">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500"></span>
            </span>
            Neural Mesh Active
          </div>
        </div>
      </div>
    </aside>
  )
}
