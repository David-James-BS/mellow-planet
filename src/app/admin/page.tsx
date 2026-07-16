'use client'

import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'

type OrderSession = {
  id: string
  is_active: boolean
  created_at: string
  closed_at: string | null
}

type Order = {
  id: string
  person_name: string
  drink_description: string
  session_id: string
  created_at: string
}

type RoundsTab = 'session' | 'history'

export default function RoundsPage() {
  const [activeTab, setActiveTab] = useState<RoundsTab>('session')
  const [session, setSession] = useState<OrderSession | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [resetting, setResetting] = useState(false)
  const [pastSessions, setPastSessions] = useState<OrderSession[]>([])
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [expandedOrders, setExpandedOrders] = useState<Order[]>([])
  const [loadingExpanded, setLoadingExpanded] = useState(false)

  const loadRounds = useCallback(async () => {
    const { data: activeSession, error: sessionError } = await supabase
      .from('order_sessions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      toast.error(`Could not load current round: ${sessionError.message}`)
      return
    }

    setSession(activeSession ?? null)

    if (activeSession) {
      const { data: activeOrders, error: ordersError } = await supabase
        .from('orders')
        .select('*')
        .eq('session_id', activeSession.id)
        .order('created_at', { ascending: true })

      if (ordersError) {
        toast.error(`Could not load orders: ${ordersError.message}`)
        setOrders([])
      } else {
        setOrders(activeOrders ?? [])
      }
    } else {
      setOrders([])
    }

    const { data: history, error: historyError } = await supabase
      .from('order_sessions')
      .select('*')
      .eq('is_active', false)
      .order('closed_at', { ascending: false })

    if (historyError) {
      toast.error(`Could not load history: ${historyError.message}`)
    } else {
      setPastSessions(history ?? [])
    }
  }, [])

  useEffect(() => {
    loadRounds()
  }, [loadRounds])

  useEffect(() => {
    const channel = supabase
      .channel('rounds-manager')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'order_sessions' }, () => {
        loadRounds()
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'order_sessions' }, () => {
        loadRounds()
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadRounds])

  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel(`round-orders-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        payload => setOrders(prev => [...prev, payload.new as Order])
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        payload => {
          const updated = payload.new as Order
          setOrders(prev => prev.map(order => (order.id === updated.id ? updated : order)))
        }
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        payload => {
          const id = (payload.old as { id?: string }).id
          if (id) setOrders(prev => prev.filter(order => order.id !== id))
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [session])

  async function performSessionReset() {
    setResetting(true)
    const closedAt = new Date().toISOString()

    try {
      const { error: closeError } = await supabase
        .from('order_sessions')
        .update({ is_active: false, closed_at: closedAt })
        .eq('is_active', true)

      if (closeError) {
        toast.error(`Could not close current round: ${closeError.message}`)
        return
      }

      const { data: newSession, error: insertError } = await supabase
        .from('order_sessions')
        .insert({ is_active: true })
        .select()
        .single()

      if (insertError || !newSession) {
        await loadRounds()
        toast.error(`Could not start new round: ${insertError?.message ?? 'No round returned'}`)
        return
      }

      setSession(newSession)
      setOrders([])
      await loadRounds()
      toast.success(session ? 'Round closed and restarted' : 'Round started')
    } finally {
      setResetting(false)
    }
  }

  async function handleExpandSession(round: OrderSession) {
    if (expandedSessionId === round.id) {
      setExpandedSessionId(null)
      setExpandedOrders([])
      return
    }

    setExpandedSessionId(round.id)
    setLoadingExpanded(true)

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('session_id', round.id)
      .order('created_at', { ascending: true })

    if (error) {
      toast.error(`Could not load round orders: ${error.message}`)
      setExpandedOrders([])
    } else {
      setExpandedOrders(data ?? [])
    }

    setLoadingExpanded(false)
  }

  function formatDateTime(iso: string) {
    return new Date(iso).toLocaleString('en-SG', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  function formatTime(iso: string) {
    return new Date(iso).toLocaleTimeString('en-SG', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const tabs: { key: RoundsTab; label: string }[] = [
    { key: 'session', label: 'Current' },
    { key: 'history', label: 'History' },
  ]

  return (
    <div className="min-h-screen bg-stone-100 pb-20">
      <header className="bg-stone-800 text-white px-4 py-4">
        <h1 className="text-lg font-bold leading-tight">Rounds</h1>
        <p className="text-xs text-stone-400">Start, reset, and review David&apos;s Kopitiam runs</p>
      </header>

      <div className="flex bg-white border-b border-stone-200 sticky top-0 z-10">
        {tabs.map(tab => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`flex-1 py-3 px-1 text-xs font-semibold transition-colors ${
              activeTab === tab.key
                ? 'text-amber-700 border-b-2 border-amber-700'
                : 'text-stone-500'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <main className="px-4 py-6 max-w-lg mx-auto">
        {activeTab === 'session' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-stone-800">
                  {session ? formatDateTime(session.created_at) : 'No Active Round'}
                </h2>
                <p className="text-xs text-stone-500 mt-0.5">
                  {orders.length} drink{orders.length !== 1 ? 's' : ''} in this round
                </p>
              </div>
              <span className={`text-xs font-semibold rounded-full px-3 py-1 ${
                session ? 'bg-green-100 text-green-700' : 'bg-stone-200 text-stone-600'
              }`}>
                {session ? 'Active' : 'Closed'}
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-6">No orders in this round</p>
            ) : (
              <div className="space-y-2">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="bg-white border border-stone-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-800 text-sm truncate">{order.person_name}</p>
                      <p className="text-sm text-stone-600 mt-0.5">{order.drink_description}</p>
                    </div>
                    <p className="text-xs text-stone-400 shrink-0 mt-0.5">{formatTime(order.created_at)}</p>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={performSessionReset}
              disabled={resetting}
              className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              {resetting ? 'Starting...' : session ? 'Close & Start New Round' : 'Start New Round'}
            </button>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-stone-800">Past Rounds</h2>

            {pastSessions.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-6">No past rounds yet</p>
            ) : (
              <div className="space-y-2">
                {pastSessions.map(round => (
                  <div key={round.id} className="bg-white border border-stone-200 rounded-lg overflow-hidden">
                    <button
                      type="button"
                      onClick={() => handleExpandSession(round)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-stone-800">
                          Started {formatDateTime(round.created_at)}
                        </p>
                        {round.closed_at && (
                          <p className="text-xs text-stone-400 mt-0.5">
                            Closed {formatDateTime(round.closed_at)}
                          </p>
                        )}
                      </div>
                      <span className="text-stone-400 text-xs ml-3">
                        {expandedSessionId === round.id ? '▲' : '▼'}
                      </span>
                    </button>

                    {expandedSessionId === round.id && (
                      <div className="border-t border-stone-100 px-4 py-3">
                        {loadingExpanded ? (
                          <p className="text-sm text-stone-400 py-2">Loading...</p>
                        ) : expandedOrders.length === 0 ? (
                          <p className="text-sm text-stone-400 py-2">No orders in this round</p>
                        ) : (
                          <div className="space-y-2.5">
                            {expandedOrders.map(order => (
                              <div key={order.id} className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-stone-700 truncate">{order.person_name}</p>
                                  <p className="text-xs text-stone-500 mt-0.5">{order.drink_description}</p>
                                </div>
                                <p className="text-xs text-stone-400 shrink-0">{formatTime(order.created_at)}</p>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  )
}
