import { useEffect, useState, useCallback } from 'react';

export type PulseEventType = 
  | 'task_claimed' 
  | 'task_completed' 
  | 'heartbeat_tick' 
  | 'cost_event' 
  | 'session_start' 
  | 'session_end';

export interface AgentPulseEvent {
  eventType: PulseEventType;
  tenantId: string;
  agentId?: string;
  payload: Record<string, any>;
  timestamp: number;
}

export function usePulse(tenantId: string) {
  const [events, setEvents] = useState<AgentPulseEvent[]>([]);
  const [status, setStatus] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [lastTick, setLastTick] = useState<number>(Date.now());

  useEffect(() => {
    if (!tenantId) return;

    const streamUrl = `/api/v1/ai/pulse?tenantId=${tenantId}`;
    const eventSource = new EventSource(streamUrl);

    eventSource.onopen = () => {
      setStatus('connected');
    };

    eventSource.onerror = () => {
      setStatus('error');
      eventSource.close();
    };

    const handleEvent = (event: MessageEvent) => {
      try {
        const pulseEvent: AgentPulseEvent = JSON.parse(event.data);
        
        if (pulseEvent.eventType === 'heartbeat_tick') {
          setLastTick(pulseEvent.timestamp);
        }

        setEvents((prev) => [pulseEvent, ...prev].slice(0, 50)); // Keep last 50 events
      } catch (err) {
        console.error('Error parsing agent pulse event:', err);
      }
    };

    // Listen to all relevant event types
    eventSource.addEventListener('heartbeat_tick', handleEvent);
    eventSource.addEventListener('cost_event', handleEvent);
    eventSource.addEventListener('task_claimed', handleEvent);
    eventSource.addEventListener('task_completed', handleEvent);

    return () => {
      eventSource.close();
    };
  }, [tenantId]);

  const clearEvents = useCallback(() => {
    setEvents([]);
  }, []);

  return {
    events,
    status,
    lastTick,
    clearEvents,
  };
}
