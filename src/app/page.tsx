'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'

type OrderSession = {
  id: string
  is_active: boolean
  created_at: string
  closed_at: string | null
}

type DrinkMenuItem = {
  id: string
  category: string
  base_name: string
  available_modifiers: string[]
  created_at: string
}

type Modifier = {
  id: string
  group_name: string
  label: string
  shortcode: string
  sort_order: number
}

type Order = {
  id: string
  person_name: string
  drink_description: string
  session_id: string
  created_at: string
}

const CATEGORY_ORDER = ['Coffee', 'Tea', 'Others']
const GROUP_ORDER = ['milk', 'sugar', 'strength', 'temperature']

function sessionLabel(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  })
}

export default function Home() {
  const [session, setSession] = useState<OrderSession | null>(null)
  const [drinks, setDrinks] = useState<DrinkMenuItem[]>([])
  const [modifiersByGroup, setModifiersByGroup] = useState<Record<string, Modifier[]>>({})
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [personName, setPersonName] = useState('')
  const [activeCategory, setActiveCategory] = useState('')
  const [selectedDrink, setSelectedDrink] = useState<DrinkMenuItem | null>(null)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [resetModalOpen, setResetModalOpen] = useState(false)
  const [resetName, setResetName] = useState('')

  // Derived: categories sorted Coffee → Tea → Others
  const categories = Array.from(new Set(drinks.map(d => d.category))).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a)
    const bi = CATEGORY_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const drinksInCategory = drinks.filter(d => d.category === activeCategory)

  // Compiled drink name: base + selected modifier shortcodes in group order
  const compiledDrink = [
    selectedDrink?.base_name,
    ...[...GROUP_ORDER, ...Object.keys(modifiersByGroup).filter(g => !GROUP_ORDER.includes(g))]
      .flatMap(group =>
        (modifiersByGroup[group] ?? [])
          .filter(m => selectedModifierIds.includes(m.id) && m.shortcode !== '')
          .map(m => m.shortcode)
      ),
  ]
    .filter(Boolean)
    .join(' ')

  // Initial data load
  useEffect(() => {
    async function init() {
      const { data: sess } = await supabase
        .from('order_sessions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      setSession(sess ?? null)

      const { data: drinksData } = await supabase
        .from('drinks_menu')
        .select('*')
        .order('category')
        .order('base_name')
      const dArr: DrinkMenuItem[] = drinksData ?? []
      setDrinks(dArr)

      const catSet = new Set(dArr.map(d => d.category))
      const firstCat = CATEGORY_ORDER.find(c => catSet.has(c)) ?? dArr[0]?.category ?? ''
      setActiveCategory(firstCat)

      const { data: modsData } = await supabase
        .from('modifiers')
        .select('*')
        .order('group_name')
        .order('sort_order')
      if (modsData) {
        const grouped: Record<string, Modifier[]> = {}
        for (const m of modsData) {
          if (!grouped[m.group_name]) grouped[m.group_name] = []
          grouped[m.group_name].push(m)
        }
        setModifiersByGroup(grouped)
      }

      if (sess) {
        const { data: ordData } = await supabase
          .from('orders')
          .select('*')
          .eq('session_id', sess.id)
          .order('created_at', { ascending: true })
        setOrders(ordData ?? [])
      }

      setLoading(false)
    }
    init()
  }, [])

  // Realtime: watch for new sessions started by admin (runs once, no session dependency)
  useEffect(() => {
    const channel = supabase
      .channel('session-watcher')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_sessions' },
        payload => {
          const newSess = payload.new as OrderSession
          if (!newSess.is_active) return
          setSession(prev => (prev?.id === newSess.id ? prev : newSess))
          setOrders([])
          toast('New session started!')
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // Realtime: orders + session reset broadcast
  useEffect(() => {
    if (!session) return
    const channel = supabase
      .channel(`orders-${session.id}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `session_id=eq.${session.id}`,
        },
        payload => {
          setOrders(prev => [...prev, payload.new as Order])
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders',
          filter: `session_id=eq.${session.id}`,
        },
        payload => {
          const deletedId = (payload.old as { id?: string }).id
          if (deletedId) setOrders(prev => prev.filter(o => o.id !== deletedId))
        }
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'order_sessions',
          filter: `id=eq.${session.id}`,
        },
        payload => {
          if (!(payload.new as OrderSession).is_active) {
            setOrders([])
            setSession(null)
            toast('Session has been reset by admin')
          }
        }
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [session])

  function handleSelectDrink(drink: DrinkMenuItem) {
    setSelectedDrink(drink)
    // Pre-select the first option ("Normal") in each available modifier group
    const defaults = drink.available_modifiers.flatMap(g => {
      const first = modifiersByGroup[g]?.[0]
      return first ? [first.id] : []
    })
    setSelectedModifierIds(defaults)
  }

  function toggleModifier(id: string) {
    setSelectedModifierIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    )
  }

  async function handleAddOrder() {
    if (!session || !personName.trim() || !selectedDrink) return
    const desc = compiledDrink || selectedDrink.base_name
    setSubmitting(true)
    await supabase.from('orders').insert({
      person_name: personName.trim(),
      drink_description: desc,
      session_id: session.id,
    })
    setSelectedDrink(null)
    setSelectedModifierIds([])
    setSubmitting(false)
    toast.success('Order added!')
  }

  async function handleDeleteOrder(id: string) {
    await supabase.from('orders').delete().eq('id', id)
    toast('Order removed')
    // state updated via Realtime DELETE event
  }

  async function handleSendResetRequest() {
    if (!resetName.trim()) return
    await supabase.from('reset_requests').insert({
      requested_by: resetName.trim(),
      status: 'pending',
    })
    setResetModalOpen(false)
    setResetName('')
    toast('Reset request sent to admin')
  }

  const canAddOrder =
    !submitting && !!personName.trim() && !!session?.is_active && !!selectedDrink

  return (
    <div className="min-h-screen bg-amber-50 pb-20">
      {/* Header */}
      <header className="bg-amber-900 text-amber-50 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">David&apos;s Kopitiam</h1>
        {session?.is_active ? (
          <div className="text-right">
            <span className="bg-green-500 text-white text-xs font-semibold px-3 py-1 rounded-full">
              Active
            </span>
            <p className="text-xs text-amber-200 mt-1">{sessionLabel(session.created_at)}</p>
          </div>
        ) : (
          <span className="bg-gray-400 text-white text-xs font-semibold px-3 py-1 rounded-full">
            No Session
          </span>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-amber-700 text-sm">
          Loading…
        </div>
      ) : (
        <main className="px-4 py-6 space-y-8 max-w-md mx-auto">
          {/* ── Section 1: Place Your Order ── */}
          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-amber-900">Place Your Order</h2>

            {/* Name input */}
            <div>
              <label className="block text-sm font-medium text-amber-800 mb-1">Your name</label>
              <input
                type="text"
                value={personName}
                onChange={e => setPersonName(e.target.value)}
                placeholder="Enter your name"
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
              />
            </div>

            {/* Drink builder */}
            <div className="space-y-4">
              {/* Category tabs */}
              <div className="flex gap-2">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => {
                      setActiveCategory(cat)
                      setSelectedDrink(null)
                      setSelectedModifierIds([])
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      activeCategory === cat
                        ? 'bg-amber-700 text-white'
                        : 'bg-white text-amber-700 border border-amber-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Drink cards: 2-column grid */}
              <div className="grid grid-cols-2 gap-2">
                {drinksInCategory.map(drink => (
                  <button
                    key={drink.id}
                    type="button"
                    onClick={() => handleSelectDrink(drink)}
                    className={`min-h-[64px] rounded-xl border-2 p-3 text-sm font-medium text-left transition-colors ${
                      selectedDrink?.id === drink.id
                        ? 'border-amber-600 bg-amber-50 text-amber-900'
                        : 'bg-white border-amber-100 text-amber-800'
                    }`}
                  >
                    {drink.base_name}
                  </button>
                ))}
              </div>

              {/* Modifier groups — multi-select toggle pills */}
              {selectedDrink && selectedDrink.available_modifiers.length > 0 && (
                <div className="space-y-3">
                  {selectedDrink.available_modifiers.map(groupName => {
                    const groupMods = modifiersByGroup[groupName] ?? []
                    return (
                      <div key={groupName}>
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                          {groupName}
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {groupMods.map(mod => (
                            <button
                              key={mod.id}
                              type="button"
                              onClick={() => toggleModifier(mod.id)}
                              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                selectedModifierIds.includes(mod.id)
                                  ? 'bg-amber-600 text-white border-amber-600'
                                  : 'bg-white text-amber-800 border-amber-200'
                              }`}
                            >
                              {mod.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* Live preview */}
              {compiledDrink && (
                <div className="bg-amber-100 border border-amber-300 text-amber-900 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Preview</p>
                  <p className="text-base font-bold">{compiledDrink}</p>
                </div>
              )}
            </div>

            {/* No session warning */}
            {!session?.is_active && (
              <p className="text-sm text-center text-amber-700 bg-amber-100 border border-amber-200 rounded-lg px-4 py-3">
                No active session. Ask the admin to start one at{' '}
                <a href="/admin" className="font-semibold underline">
                  /admin
                </a>
                .
              </p>
            )}

            {/* Add to Order */}
            <button
              type="button"
              onClick={handleAddOrder}
              disabled={!canAddOrder}
              className="w-full bg-amber-700 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:bg-amber-800 transition-colors"
            >
              {submitting ? 'Adding…' : 'Add to Order'}
            </button>
          </section>

          {/* ── Section 2: Live Orders ── */}
          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-amber-900">Live Orders</h2>
              <span className="text-sm text-amber-700 font-medium">
                {orders.length} drink{orders.length !== 1 ? 's' : ''} ordered
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="text-sm text-amber-400 text-center py-8">
                No orders yet — be the first to order!
              </p>
            ) : (
              <div className="space-y-2">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="bg-white border border-amber-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-amber-900 text-sm truncate">
                        {order.person_name}
                      </p>
                      <p className="text-sm text-amber-700 mt-0.5">{order.drink_description}</p>
                      <p className="text-xs text-amber-400 mt-1">
                        {new Date(order.created_at).toLocaleTimeString('en-SG', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    {personName.trim() && order.person_name === personName.trim() && (
                      <button
                        type="button"
                        onClick={() => handleDeleteOrder(order.id)}
                        className="text-red-400 text-xl leading-none shrink-0 hover:text-red-600 transition-colors mt-0.5"
                        aria-label="Delete order"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* ── Request Reset ── */}
          <div className="flex justify-center pb-4">
            <button
              type="button"
              onClick={() => setResetModalOpen(true)}
              className="border-2 border-amber-900 text-amber-900 rounded-xl px-6 py-3 text-sm font-semibold hover:bg-amber-100 transition-colors"
            >
              Request Reset
            </button>
          </div>
        </main>
      )}

      {/* Reset Modal */}
      {resetModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
            <h3 className="text-base font-bold text-amber-900">Request Session Reset</h3>
            <div>
              <label className="block text-sm font-medium text-amber-800 mb-1">Your name</label>
              <input
                type="text"
                value={resetName}
                onChange={e => setResetName(e.target.value)}
                placeholder="Enter your name"
                className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
              />
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  setResetModalOpen(false)
                  setResetName('')
                }}
                className="flex-1 border border-amber-300 text-amber-700 rounded-xl py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSendResetRequest}
                disabled={!resetName.trim()}
                className="flex-1 bg-amber-700 text-white rounded-xl py-2 text-sm font-medium disabled:opacity-50"
              >
                Send Request
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
