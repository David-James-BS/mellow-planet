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
  table_id: string | null
}

type OrderTable = {
  id: string
  session_id: string
  name: string
  created_by_device_id: string
  created_by_name: string
  created_at: string
}

type TableMembership = {
  id: string
  session_id: string
  table_id: string
  device_id: string
  person_name: string
  created_at: string
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
  const [tables, setTables] = useState<OrderTable[]>([])
  const [memberships, setMemberships] = useState<TableMembership[]>([])
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null)
  const [renamingTableId, setRenamingTableId] = useState<string | null>(null)
  const [tableNameDraft, setTableNameDraft] = useState('')
  const [tableActionPending, setTableActionPending] = useState(false)
  const [confirmDeleteTableId, setConfirmDeleteTableId] = useState<string | null>(null)
  const [selectedUnassignedOrderIds, setSelectedUnassignedOrderIds] = useState<string[]>([])
  const [lastOrder, setLastOrder] = useState<Order | null>(null)
  const [loading, setLoading] = useState(true)
  const [deviceId, setDeviceId] = useState('')
  const [personName, setPersonName] = useState('')
  const [nameReady, setNameReady] = useState(false)
  const [activeCategory, setActiveCategory] = useState('')
  const [selectedDrink, setSelectedDrink] = useState<DrinkMenuItem | null>(null)
  const [customOrderMode, setCustomOrderMode] = useState(false)
  const [customOrderText, setCustomOrderText] = useState('')
  const [selectedModifierIds, setSelectedModifierIds] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [checkingRound, setCheckingRound] = useState(false)
  const [editingOrderId, setEditingOrderId] = useState<string | null>(null)

  const categories = CATEGORY_ORDER.filter(category => {
    if (category === 'Others') {
      return true
    }
    return drinks.some(drink => drink.category === category)
  })

  const drinksInCategory = drinks.filter(drink =>
    activeCategory === 'Others'
      ? !['Coffee', 'Tea'].includes(drink.category)
      : drink.category === activeCategory
  )
  const showDrinkCards = !['Coffee', 'Tea'].includes(activeCategory)
  const selectedTable = tables.find(table => table.id === selectedTableId) ?? null
  const myMembership = memberships.find(membership => membership.device_id === deviceId) ?? null
  const isMemberOfSelectedTable = !!selectedTable && myMembership?.table_id === selectedTable.id
  const movableOrders = selectedTable ? orders.filter(order => order.table_id !== selectedTable.id) : []
  const orderTableId = myMembership?.table_id === selectedTableId ? selectedTableId : null

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

  const loadTableData = useCallback(async (sessionId: string) => {
    const [{ data: tableData, error: tablesError }, { data: membershipData, error: membershipsError }] = await Promise.all([
      supabase.from('order_tables').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
      supabase.from('table_memberships').select('*').eq('session_id', sessionId).order('created_at', { ascending: true }),
    ])

    if (tablesError || membershipsError) {
      toast.error(`Could not load tables: ${(tablesError ?? membershipsError)?.message}`)
      return
    }

    setTables((tableData ?? []) as OrderTable[])
    setMemberships((membershipData ?? []) as TableMembership[])
  }, [])

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
      setTables([])
      setMemberships([])
      return null
    }

    setSession(prev => {
      if (activeSession && prev?.id !== activeSession.id) {
        setSelectedDrink(null)
        setCustomOrderMode(false)
        setCustomOrderText('')
        setSelectedModifierIds([])
        setEditingOrderId(null)
        setSelectedTableId(null)
        setSelectedUnassignedOrderIds([])
      }
      return activeSession ?? null
    })

    if (!activeSession) {
      setOrders([])
      setTables([])
      setMemberships([])
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
    await loadTableData(activeSession.id)
    return activeSession
  }, [loadTableData])

  const loadLastOrder = useCallback(async (currentDeviceId: string) => {
    if (!currentDeviceId) {
      setLastOrder(null)
      return null
    }

    const { data, error } = await supabase
      .from('orders')
      .select('*')
      .eq('device_id', currentDeviceId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (error) {
      toast.error(`Could not load your last order: ${error.message}`)
      setLastOrder(null)
      return null
    }

    setLastOrder((data as Order | null) ?? null)
    return (data as Order | null) ?? null
  }, [])

  useEffect(() => {
    async function init() {
      const storedDeviceId = getStoredDeviceId()
      setDeviceId(storedDeviceId)

      const savedName = localStorage.getItem(USER_NAME_KEY)
      if (savedName) {
        setPersonName(savedName)
        setNameReady(true)
      }

      await loadLastOrder(storedDeviceId)
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

      const catSet = new Set(
        dArr.map(drink => ['Coffee', 'Tea'].includes(drink.category) ? drink.category : 'Others')
      )
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
  }, [loadActiveSession, loadLastOrder])

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
        { event: '*', schema: 'public', table: 'order_sessions' },
        async () => {
          await loadActiveSession()
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
            setTables([])
            setMemberships([])
            setSession(null)
            setSelectedDrink(null)
            setCustomOrderMode(false)
            setCustomOrderText('')
            setSelectedModifierIds([])
            setEditingOrderId(null)
            toast('Round has been reset')
            await loadActiveSession()
          }
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'order_tables', filter: `session_id=eq.${session.id}` },
        () => { loadTableData(session.id) }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'table_memberships', filter: `session_id=eq.${session.id}` },
        () => { loadTableData(session.id) }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [loadActiveSession, loadTableData, session])

  function defaultModifierIdsForDrink(drink: DrinkMenuItem) {
    return orderedGroups(drink.available_modifiers).flatMap(group => {
      const first = modifiersByGroup[group]?.[0]
      return first ? [first.id] : []
    })
  }

  function handleSelectDrink(drink: DrinkMenuItem) {
    setCustomOrderMode(false)
    setCustomOrderText('')
    setSelectedDrink(drink)
    setSelectedModifierIds(defaultModifierIdsForDrink(drink))
  }

  function handleSelectCustomOrder() {
    setSelectedDrink(null)
    setSelectedModifierIds([])
    setCustomOrderMode(true)
    setEditingOrderId(null)
  }

  function handleSelectCategory(category: string) {
    setActiveCategory(category)
    setEditingOrderId(null)

    if (category === 'Others') {
      handleSelectCustomOrder()
      return
    }

    const firstDrink = drinks.find(drink =>
      drink.category === category
    )
    if (firstDrink) {
      handleSelectDrink(firstDrink)
      return
    }

    setSelectedDrink(null)
    setCustomOrderMode(false)
    setCustomOrderText('')
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
    setCustomOrderMode(false)
    setCustomOrderText('')
    setSelectedModifierIds([])
    setEditingOrderId(null)
  }

  async function startTable() {
    if (!session || !deviceId || !personName.trim()) return

    setTableActionPending(true)
    const name = `${personName.trim()}'s table`
    const { data: table, error: tableError } = await supabase
      .from('order_tables')
      .insert({
        session_id: session.id,
        name,
        created_by_device_id: deviceId,
        created_by_name: personName.trim(),
      })
      .select()
      .single()

    if (tableError || !table) {
      setTableActionPending(false)
      toast.error(`Could not start table: ${tableError?.message ?? 'No table returned'}`)
      return
    }

    if (myMembership) {
      const { error } = await supabase
        .from('table_memberships')
        .delete()
        .eq('session_id', session.id)
        .eq('device_id', deviceId)
      if (error) {
        setTableActionPending(false)
        toast.error(`Table started, but could not leave your old table: ${error.message}`)
        return
      }
    }

    const { error: membershipError } = await supabase
      .from('table_memberships')
      .insert({ session_id: session.id, table_id: table.id, device_id: deviceId, person_name: personName.trim() })

    setTableActionPending(false)
    if (membershipError) {
      toast.error(`Table started, but could not join it: ${membershipError.message}`)
      await loadTableData(session.id)
      return
    }

    setSelectedTableId(table.id)
    await loadTableData(session.id)
    toast.success(`${name} started`)
  }

  async function joinTable(table: OrderTable) {
    if (!session || !deviceId || !personName.trim()) return

    setTableActionPending(true)
    const { error: leaveError } = await supabase
      .from('table_memberships')
      .delete()
      .eq('session_id', session.id)
      .eq('device_id', deviceId)

    if (leaveError) {
      setTableActionPending(false)
      toast.error(`Could not change table: ${leaveError.message}`)
      return
    }

    const { error: joinError } = await supabase
      .from('table_memberships')
      .insert({ session_id: session.id, table_id: table.id, device_id: deviceId, person_name: personName.trim() })

    if (joinError) {
      setTableActionPending(false)
      toast.error(`Could not join table: ${joinError.message}`)
      return
    }

    const { error: moveError } = await supabase
      .from('orders')
      .update({ table_id: table.id })
      .eq('session_id', session.id)
      .eq('device_id', deviceId)
      .is('table_id', null)

    setTableActionPending(false)
    if (moveError) {
      toast.error(`Joined table, but could not move your unassigned orders: ${moveError.message}`)
    } else {
      toast.success(`Joined ${table.name}`)
    }
    setSelectedTableId(table.id)
    await loadActiveSession()
  }

  async function leaveTable() {
    if (!session || !deviceId || !myMembership) return
    setTableActionPending(true)
    const { error } = await supabase
      .from('table_memberships')
      .delete()
      .eq('id', myMembership.id)
    setTableActionPending(false)
    if (error) {
      toast.error(`Could not leave table: ${error.message}`)
      return
    }
    toast('You left the table. Your existing orders stay where they are.')
    await loadTableData(session.id)
  }

  async function renameTable() {
    if (!selectedTable || !isMemberOfSelectedTable || !tableNameDraft.trim()) return
    setTableActionPending(true)
    const { error } = await supabase
      .from('order_tables')
      .update({ name: tableNameDraft.trim() })
      .eq('id', selectedTable.id)
    setTableActionPending(false)
    if (error) {
      toast.error(`Could not rename table: ${error.message}`)
      return
    }
    setRenamingTableId(null)
    toast.success('Table renamed')
  }

  async function addOrderOwnersToSelectedTable(orderIds: string[]) {
    if (!session || !selectedTable || !isMemberOfSelectedTable) return true

    const owners = Array.from(new Map(
      orders
        .filter(order => orderIds.includes(order.id) && order.device_id)
        .map(order => [order.device_id as string, order.person_name])
    ))

    for (const [ownerDeviceId, ownerName] of owners) {
      const { error: leaveError } = await supabase
        .from('table_memberships')
        .delete()
        .eq('session_id', session.id)
        .eq('device_id', ownerDeviceId)

      if (leaveError) {
        toast.error(`Could not move ${ownerName} into this table: ${leaveError.message}`)
        return false
      }

      const { error: joinError } = await supabase
        .from('table_memberships')
        .insert({ session_id: session.id, table_id: selectedTable.id, device_id: ownerDeviceId, person_name: ownerName })

      if (joinError) {
        toast.error(`Could not add ${ownerName} to this table: ${joinError.message}`)
        return false
      }
    }

    return true
  }

  async function moveOrdersToSelectedTable(orderIds: string[]) {
    if (!selectedTable || !isMemberOfSelectedTable || orderIds.length === 0) return
    setTableActionPending(true)
    const ownersAdded = await addOrderOwnersToSelectedTable(orderIds)
    if (!ownersAdded) {
      setTableActionPending(false)
      return
    }
    const { error } = await supabase
      .from('orders')
      .update({ table_id: selectedTable.id })
      .in('id', orderIds)
    setTableActionPending(false)
    if (error) {
      toast.error(`Could not move orders: ${error.message}`)
      return
    }
    setSelectedUnassignedOrderIds([])
    toast.success(`${orderIds.length} order${orderIds.length === 1 ? '' : 's'} moved and people added to the table`)
    await loadActiveSession()
  }

  async function deleteTable(table: OrderTable) {
    setTableActionPending(true)
    const { error } = await supabase.from('order_tables').delete().eq('id', table.id)
    setTableActionPending(false)
    if (error) {
      toast.error(`Could not delete table: ${error.message}`)
      return
    }
    setConfirmDeleteTableId(null)
    if (selectedTableId === table.id) setSelectedTableId(null)
    toast('Table deleted. Its orders are now unassigned.')
    await loadActiveSession()
  }

  async function handleSubmitOrder() {
    const customDescription = customOrderText.trim()
    if (
      !session ||
      !personName.trim() ||
      !deviceId ||
      (!selectedDrink && (!customOrderMode || !customDescription))
    ) return

    const description = customOrderMode
      ? customDescription
      : compiledDrink || selectedDrink?.base_name || ''
    setSubmitting(true)

    const payload = {
      person_name: personName.trim(),
      drink_description: description,
      session_id: session.id,
      device_id: deviceId,
      drink_id: customOrderMode ? null : selectedDrink?.id ?? null,
      modifier_ids: customOrderMode ? [] : normalizedSelectedModifierIds,
      table_id: orderTableId,
    }

    const { error } = editingOrderId
      ? await supabase.from('orders').update(payload).eq('id', editingOrderId).eq('device_id', deviceId)
      : await supabase.from('orders').insert(payload)

    setSubmitting(false)

    if (error) {
      toast.error(`Could not ${editingOrderId ? 'update' : 'add'} order: ${error.message}`)
      return
    }

    setLastOrder({
      id: editingOrderId ?? '',
      person_name: payload.person_name,
      drink_description: payload.drink_description,
      session_id: payload.session_id,
      created_at: new Date().toISOString(),
      device_id: payload.device_id,
      drink_id: payload.drink_id,
      modifier_ids: payload.modifier_ids,
      table_id: payload.table_id,
    })
    resetBuilder()
    toast.success(editingOrderId ? 'Order updated' : 'Order added')
  }

  async function handleReorderLastDrink() {
    if (!session || !personName.trim() || !deviceId || !lastOrder?.drink_description) return

    setSubmitting(true)
    const payload = {
      person_name: personName.trim(),
      drink_description: lastOrder.drink_description,
      session_id: session.id,
      device_id: deviceId,
      drink_id: lastOrder.drink_id,
      modifier_ids: Array.isArray(lastOrder.modifier_ids) ? lastOrder.modifier_ids : [],
      table_id: orderTableId,
    }

    const { data, error } = await supabase
      .from('orders')
      .insert(payload)
      .select()
      .single()

    setSubmitting(false)

    if (error) {
      toast.error(`Could not reorder: ${error.message}`)
      return
    }

    setLastOrder((data as Order | null) ?? {
      id: '',
      person_name: payload.person_name,
      drink_description: payload.drink_description,
      session_id: payload.session_id,
      created_at: new Date().toISOString(),
      device_id: payload.device_id,
      drink_id: payload.drink_id,
      modifier_ids: payload.modifier_ids,
      table_id: payload.table_id,
    })
    toast.success('Order added')
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
      setEditingOrderId(order.id)
      setActiveCategory('Others')
      setSelectedDrink(null)
      setSelectedModifierIds([])
      setCustomOrderMode(true)
      setCustomOrderText(order.drink_description)
      window.scrollTo({ top: 0, behavior: 'smooth' })
      return
    }

    setEditingOrderId(order.id)
    setCustomOrderMode(false)
    setCustomOrderText('')
    setSelectedDrink(drink)
    setSelectedModifierIds(Array.isArray(order.modifier_ids) ? order.modifier_ids : defaultModifierIdsForDrink(drink))
    setActiveCategory(['Coffee', 'Tea'].includes(drink.category) ? drink.category : 'Others')
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const canSubmit =
    !submitting &&
    nameReady &&
    !!personName.trim() &&
    !!deviceId &&
    !!session?.is_active &&
    (!!selectedDrink || (customOrderMode && !!customOrderText.trim()))

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

            {session?.is_active && nameReady && (
              <section className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-bold text-amber-900">Tables</h3>
                    <p className="text-xs text-amber-600 mt-0.5">Optional. Orders can stay unassigned.</p>
                  </div>
                  <button
                    type="button"
                    onClick={startTable}
                    disabled={tableActionPending}
                    className="rounded-lg bg-amber-700 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                  >
                    Start my table
                  </button>
                </div>

                {tables.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-amber-200 bg-white px-3 py-3 text-sm text-amber-600">
                    No tables yet. Start one or place an unassigned order.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {tables.map(table => {
                      const memberCount = memberships.filter(membership => membership.table_id === table.id).length
                      const tableOrderCount = orders.filter(order => order.table_id === table.id).length
                      const isSelected = selectedTableId === table.id
                      const isMine = myMembership?.table_id === table.id
                      return (
                        <div
                          key={table.id}
                          className={`rounded-lg border px-3 py-3 ${isSelected ? 'border-amber-500 bg-amber-100' : 'border-amber-100 bg-white'}`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <button type="button" onClick={() => setSelectedTableId(table.id)} className="min-w-0 flex-1 text-left">
                              <p className="truncate text-sm font-bold text-amber-950">{table.name}</p>
                              <p className="mt-0.5 text-xs text-amber-700">
                                {memberCount} member{memberCount === 1 ? '' : 's'} · {tableOrderCount} order{tableOrderCount === 1 ? '' : 's'}
                              </p>
                            </button>
                            {isMine ? (
                              <button
                                type="button"
                                onClick={leaveTable}
                                disabled={tableActionPending}
                                className="shrink-0 rounded-lg border border-amber-300 px-2.5 py-1.5 text-xs font-semibold text-amber-700 disabled:opacity-50"
                              >
                                Leave
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => joinTable(table)}
                                disabled={tableActionPending}
                                className="shrink-0 rounded-lg bg-amber-700 px-2.5 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
                              >
                                Join
                              </button>
                            )}
                          </div>

                          {isSelected && isMine && (
                            <div className="mt-3 space-y-3 border-t border-amber-200 pt-3">
                              {renamingTableId === table.id ? (
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={tableNameDraft}
                                    onChange={event => setTableNameDraft(event.target.value)}
                                    maxLength={60}
                                    className="min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-2.5 py-2 text-sm text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
                                  />
                                  <button type="button" onClick={renameTable} disabled={!tableNameDraft.trim() || tableActionPending} className="rounded-lg bg-amber-700 px-3 text-xs font-semibold text-white disabled:opacity-50">Save</button>
                                  <button type="button" onClick={() => setRenamingTableId(null)} className="rounded-lg border border-amber-300 px-2 text-xs text-amber-700">Cancel</button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => { setRenamingTableId(table.id); setTableNameDraft(table.name) }}
                                  className="text-xs font-semibold text-amber-700"
                                >
                                  Rename table
                                </button>
                              )}

                              {movableOrders.length > 0 && (
                                <div className="space-y-2">
                                  <div className="flex items-center justify-between gap-2">
                                    <p className="text-xs font-semibold uppercase text-amber-700">Add people or move orders</p>
                                  </div>
                                  {Object.values(movableOrders.reduce<Record<string, { name: string; orderIds: string[] }>>((people, order) => {
                                    const key = order.device_id ?? `legacy:${order.person_name}`
                                    if (!people[key]) people[key] = { name: order.person_name, orderIds: [] }
                                    people[key].orderIds.push(order.id)
                                    return people
                                  }, {})).map(person => (
                                    <div key={`${person.name}-${person.orderIds[0]}`} className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-2">
                                      <span className="min-w-0 truncate text-xs text-amber-900"><strong>{person.name}</strong> · {person.orderIds.length} order{person.orderIds.length === 1 ? '' : 's'}</span>
                                      <button
                                        type="button"
                                        onClick={() => moveOrdersToSelectedTable(person.orderIds)}
                                        disabled={tableActionPending}
                                        className="shrink-0 text-xs font-semibold text-amber-700 disabled:opacity-50"
                                      >
                                        Add & move all
                                      </button>
                                    </div>
                                  ))}
                                  {movableOrders.map(order => (
                                    <label key={order.id} className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-2 text-xs text-amber-900">
                                      <input
                                        type="checkbox"
                                        checked={selectedUnassignedOrderIds.includes(order.id)}
                                        onChange={() => setSelectedUnassignedOrderIds(prev => prev.includes(order.id) ? prev.filter(id => id !== order.id) : [...prev, order.id])}
                                      />
                                      <span className="min-w-0 flex-1 truncate"><strong>{order.person_name}</strong> · {order.drink_description}</span>
                                    </label>
                                  ))}
                                  {selectedUnassignedOrderIds.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => moveOrdersToSelectedTable(selectedUnassignedOrderIds)}
                                      disabled={tableActionPending}
                                      className="w-full rounded-lg border border-amber-300 bg-white py-2 text-xs font-semibold text-amber-800 disabled:opacity-50"
                                    >
                                      Move selected ({selectedUnassignedOrderIds.length})
                                    </button>
                                  )}
                                </div>
                              )}

                              {confirmDeleteTableId === table.id ? (
                                <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-2.5 py-2">
                                  <p className="text-xs text-red-700">Delete this table? Its {tableOrderCount} order{tableOrderCount === 1 ? '' : 's'} will become unassigned.</p>
                                  <div className="flex gap-2 shrink-0">
                                    <button type="button" onClick={() => setConfirmDeleteTableId(null)} className="text-xs text-amber-700">Cancel</button>
                                    <button type="button" onClick={() => deleteTable(table)} disabled={tableActionPending} className="text-xs font-semibold text-red-700 disabled:opacity-50">Delete</button>
                                  </div>
                                </div>
                              ) : (
                                <button type="button" onClick={() => setConfirmDeleteTableId(table.id)} className="text-xs text-red-600">Delete table</button>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </section>
            )}

            {session?.is_active && nameReady && lastOrder?.drink_description && (
              <div className="bg-amber-100 border border-amber-300 rounded-lg px-4 py-3 space-y-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-amber-700">
                    Your usual
                  </p>
                  <p className="text-sm font-bold text-amber-950 mt-0.5">
                    {lastOrder.drink_description}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleReorderLastDrink}
                  disabled={submitting}
                  className="w-full rounded-xl bg-amber-700 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
                >
                  {submitting ? 'Adding...' : `Order ${lastOrder.drink_description} again`}
                </button>
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

              {showDrinkCards && (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={handleSelectCustomOrder}
                    className={`w-full rounded-lg border-2 px-4 py-3 text-left transition-colors ${
                      customOrderMode
                        ? 'border-amber-600 bg-amber-100 text-amber-950'
                        : 'border-amber-300 bg-white text-amber-800'
                    }`}
                  >
                    <span className="block text-sm font-bold">Custom order</span>
                    <span className="block text-xs mt-0.5 text-amber-700">Type any drink you want</span>
                  </button>

                  {customOrderMode && (
                    <div>
                      <label htmlFor="custom-order" className="block text-xs font-semibold uppercase text-amber-700 mb-2">
                        Your drink
                      </label>
                      <textarea
                        id="custom-order"
                        value={customOrderText}
                        onChange={event => setCustomOrderText(event.target.value)}
                        rows={2}
                        maxLength={160}
                        placeholder="e.g. Coke Zero, less ice"
                        className="w-full resize-none rounded-lg border border-amber-300 bg-white px-3 py-2.5 text-base text-amber-950 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    {drinksInCategory.map(drink => (
                      <button
                        key={drink.id}
                        type="button"
                        onClick={() => handleSelectDrink(drink)}
                        className={`min-h-[64px] rounded-lg border-2 p-3 text-sm font-medium text-left transition-colors ${
                          selectedDrink?.id === drink.id
                            ? 'border-amber-600 bg-amber-50 text-amber-900'
                            : 'bg-white border-amber-100 text-amber-800'
                        }`}
                      >
                        {drink.base_name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

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
                {[...tables.map(table => ({
                  id: table.id,
                  name: table.name,
                  orders: orders.filter(order => order.table_id === table.id),
                })), {
                  id: 'unassigned',
                  name: 'No table yet',
                  orders: orders.filter(order => !order.table_id),
                }]
                  .filter(group => group.orders.length > 0)
                  .map(group => (
                    <div key={group.id} className="space-y-2">
                      <div className="flex items-center justify-between px-1">
                        <h3 className="text-xs font-bold uppercase tracking-wide text-amber-700">{group.name}</h3>
                        <span className="text-xs text-amber-500">{group.orders.length}</span>
                      </div>
                      {group.orders.map(order => {
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
                  ))}
              </div>
            )}
          </section>
        </main>
      )}
    </div>
  )
}
