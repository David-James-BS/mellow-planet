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
  device_id: string | null
  drink_id: string | null
  modifier_ids: string[] | null
}

const CATEGORY_ORDER = ['Coffee', 'Tea', 'Others']
const GROUP_ORDER = ['milk', 'sugar', 'strength', 'temperature']
const USER_NAME_KEY = 'kopitiam_user_name'
const DEVICE_ID_KEY = 'kopitiam_device_id'
const CATEGORY_LABELS: Record<string, string> = {
  Coffee: 'Kopi',
  Tea: 'Teh',
}

function sessionLabel(iso: string) {
  return new Date(iso).toLocaleString('en-SG', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function orderedGroups(groups: string[]) {
  return [...groups].sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a)
    const bi = GROUP_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })
}

function categoryLabel(category: string) {
  return CATEGORY_LABELS[category] ?? category
}

function getStoredDeviceId() {
  const existing = localStorage.getItem(DEVICE_ID_KEY)
  if (existing) return existing

  const next = crypto.randomUUID()
  localStorage.setItem(DEVICE_ID_KEY, next)
  return next
}

export default function Home() {
  const [session, setSession] = useState<OrderSession | null>(null)
  const [drinks, setDrinks] = useState<DrinkMenuItem[]>([])
  const [modifiersByGroup, setModifiersByGroup] = useState<Record<string, Modifier[]>>({})
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)
  const [deviceId, setDeviceId] = useState('')
  const [personName, setPersonName] = useState('')
  const [nameReady, setNameReady] = useState(false)
  const [activeCategory, setActiveCategory] = useState('')
  const [selectedDrink, setSelectedDrink] = useState<DrinkMenuItem | null>(null)
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [checkingRound, setCheckingRound] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

  const categories = Array.from(new Set(drinks.map(d => d.category))).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a)
    const bi = CATEGORY_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const drinksInCategory = drinks.filter(d => d.category === activeCategory)

  const selectedModifierIdsByGroup = orderedGroups(selectedDrink?.available_modifiers ?? [])
    .reduce<Record<string, string | undefined>>((selected, group) => {
      const groupMods = modifiersByGroup[group] ?? []
      selected[group] = groupMods.find(mod => selectedModifierIds.includes(mod.id))?.id
      return selected
    }, {})

  const normalizedSelectedModifierIds = orderedGroups(selectedDrink?.available_modifiers ?? [])
    .flatMap(group => {
      const selectedId = selectedModifierIdsByGroup[group]
      return selectedId ? [selectedId] : []
    })

  const compiledDrink = [
    selectedDrink?.base_name,
    ...orderedGroups(selectedDrink?.available_modifiers ?? [])
      .flatMap(group =>
        (modifiersByGroup[group] ?? [])
          .filter(mod => selectedModifierIdsByGroup[group] === mod.id && mod.shortcode !== '')
          .map(mod => mod.shortcode)
      ),
  ]
    .filter(Boolean)
    .join(' ')

  const loadActiveSession = useCallback(async () => {
    const { data: activeSession, error: sessionError } = await supabase
      .from('order_sessions')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (sessionError) {
      toast.error(`Could not load active round: ${sessionError.message}`)
      setSession(null)
      setOrders([])
      return null
    }

    setSession(prev => {
      if (activeSession && prev?.id !== activeSession.id) {
        setSelectedDrink(null)
        setSelectedModifierIds([])
        setEditingOrderId(null)
      }
      return activeSession ?? null
    })

    if (!activeSession) {
      setOrders([])
      return null
    }

    const { data: orderData, error: ordersError } = await supabase
      .from('orders')
      .select('*')
      .eq('session_id', activeSession.id)
      .order('created_at', { ascending: true })

    if (ordersError) {
      toast.error(`Could not load orders: ${ordersError.message}`)
      setOrders([])
      return activeSession
    }

    setOrders((orderData ?? []) as Order[])
    return activeSession
  }, [])

  useEffect(() => {
    async function init() {
      setDeviceId(getStoredDeviceId())

      const savedName = localStorage.getItem(USER_NAME_KEY)
      if (savedName) {
        setPersonName(savedName)
        setNameReady(true)
      }

      await loadActiveSession()

      const { data: drinksData, error: drinksError } = await supabase
        .from('drinks_menu')
        .select('*')
        .order('category')
        .order('base_name')

      if (drinksError) {
        toast.error(`Could not load drinks: ${drinksError.message}`)
      }

      const dArr: DrinkMenuItem[] = (drinksData ?? []) as DrinkMenuItem[]
      setDrinks(dArr)

      const catSet = new Set(dArr.map(d => d.category))
      const firstCat = CATEGORY_ORDER.find(c => catSet.has(c)) ?? dArr[0]?.category ?? ''
      setActiveCategory(firstCat)

      const { data: modsData, error: modsError } = await supabase
        .from('modifiers')
        .select('*')
        .order('group_name')
        .order('sort_order')

      if (modsError) {
        toast.error(`Could not load modifiers: ${modsError.message}`)
      }

      const grouped: Record<string, Modifier[]> = {}
      for (const mod of ((modsData ?? []) as Modifier[])) {
        if (!grouped[mod.group_name]) grouped[mod.group_name] = []
        grouped[mod.group_name].push(mod)
      }
      setModifiersByGroup(grouped)

      setLoading(false)
    }

    init()
  }, [loadActiveSession])

  useEffect(() => {
    function handleFocus() {
      loadActiveSession()
    }

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') loadActiveSession()
    }

    window.addEventListener('focus', handleFocus)
    document.addEventListener('visibilitychange', handleVisibilityChange)

    return () => {
      window.removeEventListener('focus', handleFocus)
      document.removeEventListener('visibilitychange', handleVisibilityChange)
    }
  }, [loadActiveSession])

  useEffect(() => {
    if (session?.is_active) return

    const intervalId = window.setInterval(() => {
      loadActiveSession()
    }, 4000)

    return () => window.clearInterval(intervalId)
  }, [loadActiveSession, session?.is_active])

  useEffect(() => {
    const channel = supabase
      .channel('session-watcher')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'order_sessions' },
        async payload => {
          const newSession = payload.new as OrderSession
          if (!newSession.is_active) return
          await loadActiveSession()
          toast('New round started')
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadActiveSession])

  useEffect(() => {
    if (!session) return

    const channel = supabase
      .channel(`orders-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        payload => setOrders(prev => [...prev, payload.new as Order])
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        payload => {
          const deletedId = (payload.old as { id?: string }).id
          if (deletedId) setOrders(prev => prev.filter(order => order.id !== deletedId))
        }
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
        { event: 'UPDATE', schema: 'public', table: 'order_sessions', filter: `id=eq.${session.id}` },
        async payload => {
          if (!(payload.new as OrderSession).is_active) {
            setOrders([])
            setSession(null)
            setSelectedDrink(null)
            setSelectedModifierIds([])
            setEditingOrderId(null)
            toast('Round has been reset')
            await loadActiveSession()
          }
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadActiveSession, session])

  function defaultModifierIdsForDrink(drink: DrinkMenuItem) {
    return orderedGroups(drink.available_modifiers).flatMap(group => {
      const first = modifiersByGroup[group]?.[0]
      return first ? [first.id] : []
    })
  }

  function handleSelectDrink(drink: DrinkMenuItem) {
    setSelectedDrink(drink)
    setSelectedModifierIds(defaultModifierIdsForDrink(drink))
  }

  function handleSelectCategory(category: string) {
    setActiveCategory(category)
    setEditingOrderId(null)

    const firstDrink = drinks.find(drink => drink.category === category)
    if (firstDrink) {
      handleSelectDrink(firstDrink)
      return
    }

    setSelectedDrink(null)
    setSelectedModifierIds([])
  }

  function selectModifier(mod: Modifier) {
    setSelectedModifierIds(prev => {
      const groupIds = (modifiersByGroup[mod.group_name] ?? []).map(item => item.id)
      return [...prev.filter(id => !groupIds.includes(id)), mod.id]
    })
  }

  async function checkForNewRound() {
    setCheckingRound(true)
    const activeSession = await loadActiveSession()
    setCheckingRound(false)
    toast(activeSession ? 'Round is active' : 'No active round yet')
  }

  function saveName() {
    const trimmed = personName.trim()
    if (!trimmed) return
    localStorage.setItem(USER_NAME_KEY, trimmed)
    setPersonName(trimmed)
    setNameReady(true)
  }

  function changeName() {
    setNameReady(false)
    setEditingOrderId(null)
  }

  function resetBuilder() {
    setSelectedDrink(null)
    setSelectedModifierIds([])
    setEditingOrderId(null)
  }

  async function handleSubmitOrder() {
    if (!session || !personName.trim() || !selectedDrink || !deviceId) return

    const description = compiledDrink || selectedDrink.base_name
    setSubmitting(true)

    const payload = {
      person_name: personName.trim(),
      drink_description: description,
      session_id: session.id,
      device_id: deviceId,
      drink_id: selectedDrink.id,
      modifier_ids: normalizedSelectedModifierIds,
    }

    const { error } = editingOrderId
      ? await supabase.from('orders').update(payload).eq('id', editingOrderId).eq('device_id', deviceId)
      : await supabase.from('orders').insert(payload)

    setSubmitting(false)

    if (error) {
      toast.error(`Could not ${editingOrderId ? 'update' : 'add'} order: ${error.message}`)
      return
    }

    resetBuilder()
    toast.success(editingOrderId ? 'Order updated' : 'Order added')
  }

  async function handleDeleteOrder(order: Order) {
    if (!deviceId || order.device_id !== deviceId) return

    const { error } = await supabase
      .from('orders')
      .delete()
      .eq('id', order.id)
      .eq('device_id', deviceId)

    if (error) {
      toast.error(`Could not remove order: ${error.message}`)
      return
    }

    toast('Order removed')
  }

  function startEditOrder(order: Order) {
    if (!deviceId || order.device_id !== deviceId) return

    const drink = drinks.find(item => item.id === order.drink_id)
    if (!drink) {
      toast.error('This older order cannot be edited with the drink builder')
      return
    }

    setEditingOrderId(order.id)
    setSelectedDrink(drink)
    setSelectedModifierIds(Array.isArray(order.modifier_ids) ? order.modifier_ids : defaultModifierIdsForDrink(drink))
    setActiveCategory(drink.category)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const canSubmit =
    !submitting && nameReady && !!personName.trim() && !!deviceId && !!session?.is_active && !!selectedDrink

  return (
    <div className="min-h-screen bg-amber-50 pb-20">
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
            No Round
          </span>
        )}
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-amber-700 text-sm">
          Loading...
        </div>
      ) : (
        <main className="px-4 py-6 space-y-8 max-w-md mx-auto">
          {!nameReady && (
            <section className="bg-white border border-amber-100 rounded-xl px-4 py-5 space-y-3">
              <div>
                <h2 className="text-lg font-semibold text-amber-900">Who&apos;s ordering?</h2>
                <p className="text-sm text-amber-600 mt-1">
                  This phone will remember your name for the next kopi run.
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-amber-800 mb-1">Your name</label>
                <input
                  type="text"
                  value={personName}
                  onChange={event => setPersonName(event.target.value)}
                  onKeyDown={event => { if (event.key === 'Enter') saveName() }}
                  placeholder="e.g. David"
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>
              <button
                type="button"
                onClick={saveName}
                disabled={!personName.trim()}
                className="w-full bg-amber-700 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:bg-amber-800 transition-colors"
              >
                Continue
              </button>
            </section>
          )}

          <section className={`space-y-4 ${!session?.is_active || !nameReady ? 'opacity-40 pointer-events-none select-none' : ''}`}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold text-amber-900">
                {editingOrderId ? 'Edit Your Order' : 'Place Your Order'}
              </h2>
              {nameReady && (
                <button
                  type="button"
                  onClick={changeName}
                  className="text-xs font-semibold text-amber-700 border border-amber-200 rounded-lg px-3 py-1.5 bg-white"
                >
                  {personName}
                </button>
              )}
            </div>

            {session?.is_active && (
              <div className="bg-white border border-amber-100 rounded-lg px-4 py-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">
                  Current round started
                </p>
                <p className="text-sm font-bold text-amber-900 mt-0.5">
                  {sessionLabel(session.created_at)}
                </p>
              </div>
            )}

            <div className="space-y-4">
              <div className="flex gap-2">
                {categories.map(category => (
                  <button
                    key={category}
                    type="button"
                    onClick={() => handleSelectCategory(category)}
                    className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors ${
                      activeCategory === category
                        ? 'bg-amber-700 text-white'
                        : 'bg-white text-amber-700 border border-amber-200'
                    }`}
                  >
                    {categoryLabel(category)}
                  </button>
                ))}
              </div>

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

              {selectedDrink && selectedDrink.available_modifiers.length > 0 && (
                <div className="space-y-3">
                  {orderedGroups(selectedDrink.available_modifiers).map(groupName => {
                    const groupMods = modifiersByGroup[groupName] ?? []
                    return (
                      <div key={groupName}>
                        <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide mb-2">
                          Choose {groupName}
                        </p>
                        <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={groupName}>
                          {groupMods.map(mod => (
                            <button
                              key={mod.id}
                              type="button"
                              onClick={() => selectModifier(mod)}
                              role="radio"
                              aria-checked={selectedModifierIdsByGroup[groupName] === mod.id}
                              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                                selectedModifierIdsByGroup[groupName] === mod.id
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

              {compiledDrink && (
                <div className="bg-amber-100 border border-amber-300 text-amber-900 rounded-lg px-4 py-3">
                  <p className="text-xs font-semibold text-amber-700 mb-1">Preview</p>
                  <p className="text-base font-bold">{compiledDrink}</p>
                </div>
              )}
            </div>

            <div className="flex gap-2">
              {editingOrderId && (
                <button
                  type="button"
                  onClick={resetBuilder}
                  className="flex-1 border border-amber-300 text-amber-700 rounded-xl py-3 font-semibold text-sm bg-white"
                >
                  Cancel
                </button>
              )}
              <button
                type="button"
                onClick={handleSubmitOrder}
                disabled={!canSubmit}
                className="flex-1 bg-amber-700 text-white rounded-xl py-3 font-semibold text-sm disabled:opacity-50 disabled:cursor-not-allowed active:bg-amber-800 transition-colors"
              >
                {submitting ? 'Saving...' : editingOrderId ? 'Save Order' : 'Add to Order'}
              </button>
            </div>
          </section>

          {!session?.is_active && (
            <div className="text-center py-10 space-y-3">
              <div>
                <p className="font-semibold text-amber-900">Waiting for a round</p>
                <p className="text-sm text-amber-600 mt-1">
                  This page checks automatically. If someone just started one, tap below.
                </p>
              </div>
              <button
                type="button"
                onClick={checkForNewRound}
                disabled={checkingRound}
                className="inline-flex items-center justify-center rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
              >
                {checkingRound ? 'Checking...' : 'Check for new round'}
              </button>
            </div>
          )}

          <section>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-amber-900">Live Orders</h2>
              <span className="text-sm text-amber-700 font-medium">
                {orders.length} drink{orders.length !== 1 ? 's' : ''} ordered
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="text-sm text-amber-400 text-center py-8">
                No orders yet. Be the first to order.
              </p>
            ) : (
              <div className="space-y-2">
                {orders.map(order => {
                  const isMine = !!deviceId && order.device_id === deviceId
                  return (
                    <div
                      key={order.id}
                      className="bg-white border border-amber-100 rounded-lg px-4 py-3 flex items-start justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-amber-900 text-sm truncate">{order.person_name}</p>
                        <p className="text-sm text-amber-700 mt-0.5">{order.drink_description}</p>
                        <p className="text-xs text-amber-400 mt-1">
                          {new Date(order.created_at).toLocaleTimeString('en-SG', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      {isMine && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => startEditOrder(order)}
                            className="text-xs text-amber-700 border border-amber-200 rounded-lg px-2 py-1"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteOrder(order)}
                            className="text-red-400 text-xl leading-none hover:text-red-600 transition-colors"
                            aria-label="Delete order"
                          >
                            x
                          </button>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  )
}
