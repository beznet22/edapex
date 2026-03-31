import { queryClient } from './query-client.js'
import { db } from './db.js'

/**
 * Reconciles local collection state with the Edge API.
 */
export async function synchronizeWithEdge(tenantId: string) {
  const lastSyncToken = localStorage.getItem(`sync_last_token_${tenantId}`) || undefined
  
  console.log(`[Sync] Starting synchronization for tenant: ${tenantId}, Last Token: ${lastSyncToken}`)

  try {
    const response = await fetch('/api/v1/sync/reconcile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: parseInt(tenantId),
        userId: 1, // Dynamic in real app
        changes: [], // TODO: Collect dirty items from TanStack DB
        lastSyncToken
      })
    })

    if (!response.ok) throw new Error('Sync reconciliation failed')
    
    const { updates, lastSyncToken: newToken } = await response.json()

    // Apply updates to local DB
    if (updates.exams) {
      for (const exam of updates.exams) {
        const existing = await db.exams.get(exam.id)
        if (existing) {
          db.exams.update(exam.id, (draft) => {
            Object.assign(draft, exam)
          })
        } else {
          db.exams.insert(exam)
        }
      }
    }

    if (newToken) {
      localStorage.setItem(`sync_last_token_${tenantId}`, newToken)
    }
    
    console.log(`[Sync] Completed successfully for tenant: ${tenantId}`)
    
    // Refetch any active TanStack Queries
    await queryClient.invalidateQueries()
    
  } catch (error) {
    console.error(`[Sync] Failed for tenant: ${tenantId}`, error)
    throw error
  }
}

export function useSync(tenantId: string) {
  return {
    sync: () => synchronizeWithEdge(tenantId),
    isSyncing: false,
    lastSyncedAt: localStorage.getItem(`sync_last_token_${tenantId}`),
  }
}
