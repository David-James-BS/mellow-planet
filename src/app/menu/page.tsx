'use client'

import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { supabase } from '@/lib/supabase/client'

type DrinkMenuItem = {
  id: string
  category: string
  base_name: string
  available_modifiers: string[]
}

type Modifier = {
  id: string
  group_name: string
  label: string
  shortcode: string
  sort_order: number
}

const CATEGORY_ORDER = ['Coffee', 'Tea', 'Others']
const GROUP_ORDER = ['milk', 'sugar', 'strength', 'temperature']

const BLANK_DRINK_FORM = { base_name: '', category: '', customCategory: '', available_modifiers: [] as string[] }

export default function MenuPage() {
  const [drinks, setDrinks] = useState<DrinkMenuItem[]>([])
  const [modifiers, setModifiers] = useState<Modifier[]>([])
  const [loading, setLoading] = useState(true)

  // Drinks UI
  const [activeCategory, setActiveCategory] = useState('')
  const [editingDrinkId, setEditingDrinkId] = useState<string | null>(null)
  const [editDrink, setEditDrink] = useState({ ...BLANK_DRINK_FORM })
  const [confirmDeleteDrinkId, setConfirmDeleteDrinkId] = useState<string | null>(null)
  const [showAddDrink, setShowAddDrink] = useState(false)
  const [addDrink, setAddDrink] = useState({ ...BLANK_DRINK_FORM })

  // Modifiers UI
  const [editingModId, setEditingModId] = useState<string | null>(null)
  const [editMod, setEditMod] = useState({ label: '', shortcode: '' })
  const [confirmDeleteModId, setConfirmDeleteModId] = useState<string | null>(null)
  const [addModForms, setAddModForms] = useState<Record<string, { label: string; shortcode: string; open: boolean }>>({})
  const [showNewGroup, setShowNewGroup] = useState(false)
  const [newGroup, setNewGroup] = useState({ group_name: '', label: '', shortcode: '' })

  // General

  // ── Derived ──────────────────────────────────────────────────────────────

  const categories = Array.from(new Set(drinks.map(d => d.category))).sort((a, b) => {
    const ai = CATEGORY_ORDER.indexOf(a)
    const bi = CATEGORY_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const drinksInCategory = drinks.filter(d => d.category === activeCategory)

  const allGroups = Array.from(new Set(modifiers.map(m => m.group_name))).sort((a, b) => {
    const ai = GROUP_ORDER.indexOf(a)
    const bi = GROUP_ORDER.indexOf(b)
    return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi)
  })

  const modsByGroup: Record<string, Modifier[]> = {}
  for (const m of modifiers) {
    if (!modsByGroup[m.group_name]) modsByGroup[m.group_name] = []
    modsByGroup[m.group_name].push(m)
  }
  for (const g of Object.keys(modsByGroup)) {
    modsByGroup[g].sort((a, b) => a.sort_order - b.sort_order)
  }

  // ── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const { data: drinksData } = await supabase
        .from('drinks_menu')
        .select('*')
        .order('category')
        .order('base_name')
      const dArr: DrinkMenuItem[] = drinksData ?? []
      setDrinks(dArr)

      const firstCat = CATEGORY_ORDER.find(c => dArr.some(d => d.category === c)) ?? dArr[0]?.category ?? ''
      setActiveCategory(firstCat)

      const { data: modsData } = await supabase
        .from('modifiers')
        .select('*')
        .order('group_name')
        .order('sort_order')
      setModifiers(modsData ?? [])

      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    const channel = supabase
      .channel('menu-editor')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'drinks_menu' }, p => {
        setDrinks(prev => prev.some(d => d.id === (p.new as DrinkMenuItem).id) ? prev : [...prev, p.new as DrinkMenuItem])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'drinks_menu' }, p => {
        setDrinks(prev => prev.map(d => d.id === (p.new as DrinkMenuItem).id ? p.new as DrinkMenuItem : d))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'drinks_menu' }, p => {
        setDrinks(prev => prev.filter(d => d.id !== (p.old as { id?: string }).id))
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'modifiers' }, p => {
        setModifiers(prev => prev.some(m => m.id === (p.new as Modifier).id) ? prev : [...prev, p.new as Modifier])
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'modifiers' }, p => {
        setModifiers(prev => prev.map(m => m.id === (p.new as Modifier).id ? p.new as Modifier : m))
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'modifiers' }, p => {
        setModifiers(prev => prev.filter(m => m.id !== (p.old as { id?: string }).id))
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [])

  // ── Helpers ───────────────────────────────────────────────────────────────

  function toggleModGroup(group: string, form: typeof editDrink, setForm: (f: typeof editDrink) => void) {
    const has = form.available_modifiers.includes(group)
    setForm({
      ...form,
      available_modifiers: has
        ? form.available_modifiers.filter(g => g !== group)
        : [...form.available_modifiers, group],
    })
  }

  // ── Drink handlers ────────────────────────────────────────────────────────

  function startEditDrink(drink: DrinkMenuItem) {
    setEditingDrinkId(drink.id)
    setEditDrink({ base_name: drink.base_name, category: drink.category, customCategory: '', available_modifiers: [...drink.available_modifiers] })
    setConfirmDeleteDrinkId(null)
  }

  async function saveEditDrink() {
    if (!editingDrinkId || !editDrink.base_name.trim()) return
    const category = editDrink.category === '__new__' ? editDrink.customCategory.trim() : editDrink.category
    if (!category) return
    const updated: Partial<DrinkMenuItem> = {
      base_name: editDrink.base_name.trim(),
      category,
      available_modifiers: editDrink.available_modifiers,
    }
    await supabase.from('drinks_menu').update(updated).eq('id', editingDrinkId)
    setDrinks(prev => prev.map(d => d.id === editingDrinkId ? { ...d, ...updated } as DrinkMenuItem : d))
    setEditingDrinkId(null)
    toast.success('Drink updated')
  }

  async function deleteDrink(id: string) {
    await supabase.from('drinks_menu').delete().eq('id', id)
    setDrinks(prev => prev.filter(d => d.id !== id))
    setConfirmDeleteDrinkId(null)
    toast('Drink deleted')
  }

  async function addNewDrink() {
    if (!addDrink.base_name.trim()) return
    const category = addDrink.category === '__new__' ? addDrink.customCategory.trim() : addDrink.category
    if (!category) return
    const { data } = await supabase
      .from('drinks_menu')
      .insert({ base_name: addDrink.base_name.trim(), category, available_modifiers: addDrink.available_modifiers })
      .select()
      .single()
    if (data) setDrinks(prev => [...prev, data as DrinkMenuItem])
    setAddDrink({ ...BLANK_DRINK_FORM })
    setShowAddDrink(false)
    if (category !== activeCategory) setActiveCategory(category)
    toast.success('Drink added')
  }

  // ── Modifier handlers ─────────────────────────────────────────────────────

  async function moveModifier(mod: Modifier, direction: 'up' | 'down') {
    const group = modsByGroup[mod.group_name]
    const idx = group.findIndex(m => m.id === mod.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= group.length) return
    const other = group[swapIdx]
    const newSortA = other.sort_order
    const newSortB = mod.sort_order
    await Promise.all([
      supabase.from('modifiers').update({ sort_order: newSortA }).eq('id', mod.id),
      supabase.from('modifiers').update({ sort_order: newSortB }).eq('id', other.id),
    ])
    setModifiers(prev => prev.map(m => {
      if (m.id === mod.id) return { ...m, sort_order: newSortA }
      if (m.id === other.id) return { ...m, sort_order: newSortB }
      return m
    }))
  }

  function startEditMod(mod: Modifier) {
    setEditingModId(mod.id)
    setEditMod({ label: mod.label, shortcode: mod.shortcode })
    setConfirmDeleteModId(null)
  }

  async function saveEditMod() {
    if (!editingModId || !editMod.label.trim()) return
    await supabase.from('modifiers').update({ label: editMod.label.trim(), shortcode: editMod.shortcode.trim() }).eq('id', editingModId)
    setModifiers(prev => prev.map(m => m.id === editingModId ? { ...m, label: editMod.label.trim(), shortcode: editMod.shortcode.trim() } : m))
    setEditingModId(null)
    toast.success('Modifier updated')
  }

  async function deleteMod(id: string) {
    await supabase.from('modifiers').delete().eq('id', id)
    setModifiers(prev => prev.filter(m => m.id !== id))
    setConfirmDeleteModId(null)
    toast('Modifier deleted')
  }

  async function addModToGroup(group_name: string) {
    const form = addModForms[group_name]
    if (!form?.label.trim()) return
    const maxSort = Math.max(0, ...(modsByGroup[group_name] ?? []).map(m => m.sort_order))
    const { data } = await supabase
      .from('modifiers')
      .insert({ group_name, label: form.label.trim(), shortcode: form.shortcode.trim(), sort_order: maxSort + 1 })
      .select()
      .single()
    if (data) setModifiers(prev => [...prev, data as Modifier])
    setAddModForms(prev => ({ ...prev, [group_name]: { label: '', shortcode: '', open: false } }))
    toast.success('Modifier added')
  }

  async function addNewGroup() {
    if (!newGroup.group_name.trim() || !newGroup.label.trim()) return
    const { data } = await supabase
      .from('modifiers')
      .insert({ group_name: newGroup.group_name.trim().toLowerCase(), label: newGroup.label.trim(), shortcode: newGroup.shortcode.trim(), sort_order: 1 })
      .select()
      .single()
    if (data) setModifiers(prev => [...prev, data as Modifier])
    setNewGroup({ group_name: '', label: '', shortcode: '' })
    setShowNewGroup(false)
    toast.success('Modifier group created')
  }

  // ── Reusable sub-components ───────────────────────────────────────────────

  function CategorySelect({ value, custom, onChangeValue, onChangeCustom }: {
    value: string
    custom: string
    onChangeValue: (v: string) => void
    onChangeCustom: (v: string) => void
  }) {
    return (
      <div className="flex gap-2 flex-1">
        <select
          value={value}
          onChange={e => onChangeValue(e.target.value)}
          className="flex-1 border border-amber-300 rounded-lg px-2 py-1.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
        >
          <option value="">Select category…</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
          <option value="__new__">+ New category…</option>
        </select>
        {value === '__new__' && (
          <input
            type="text"
            value={custom}
            onChange={e => onChangeCustom(e.target.value)}
            placeholder="Category name"
            className="flex-1 border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
          />
        )}
      </div>
    )
  }

  function ModGroupCheckboxes({ selected, onChange }: { selected: string[]; onChange: (group: string) => void }) {
    return (
      <div className="flex flex-wrap gap-2 mt-2">
        {allGroups.map(g => (
          <button
            key={g}
            type="button"
            onClick={() => onChange(g)}
            className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
              selected.includes(g)
                ? 'bg-amber-600 text-white border-amber-600'
                : 'bg-white text-amber-700 border-amber-300'
            }`}
          >
            {g}
          </button>
        ))}
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="min-h-screen bg-amber-50">
      {/* Header */}
      <header className="bg-amber-900 text-amber-50 px-4 py-4 flex items-center justify-between">
        <h1 className="text-xl font-bold tracking-tight">Customize Menu</h1>
        <a
          href="/"
          className="text-amber-300 text-sm hover:text-amber-100 transition-colors"
        >
          ← Back to Orders
        </a>
      </header>

      {loading ? (
        <div className="flex items-center justify-center py-20 text-amber-700 text-sm">
          Loading…
        </div>
      ) : (
        <main className="px-4 py-6 space-y-10 max-w-2xl mx-auto pb-20">

          {/* ── Section 1: Drinks Menu ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-amber-900">Drinks Menu</h2>
              <p className="text-xs text-amber-600 mt-0.5">Changes appear on the ordering page immediately.</p>
            </div>

            {/* Category tabs */}
            {categories.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {categories.map(cat => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setActiveCategory(cat)}
                    className={`py-1.5 px-4 rounded-lg text-sm font-medium transition-colors ${
                      activeCategory === cat
                        ? 'bg-amber-700 text-white'
                        : 'bg-white text-amber-700 border border-amber-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Drink list */}
            <div className="space-y-2">
              {drinksInCategory.map(drink => (
                <div key={drink.id}>
                  {editingDrinkId === drink.id ? (
                    /* Edit form */
                    <div className="bg-amber-50 border-2 border-amber-400 rounded-xl p-4 space-y-3">
                      <input
                        type="text"
                        value={editDrink.base_name}
                        onChange={e => setEditDrink(f => ({ ...f, base_name: e.target.value }))}
                        placeholder="Drink name"
                        className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500 bg-white"
                      />
                      <CategorySelect
                        value={editDrink.category}
                        custom={editDrink.customCategory}
                        onChangeValue={v => setEditDrink(f => ({ ...f, category: v }))}
                        onChangeCustom={v => setEditDrink(f => ({ ...f, customCategory: v }))}
                      />
                      <div>
                        <p className="text-xs font-medium text-amber-700 mb-1">Modifier groups</p>
                        <ModGroupCheckboxes
                          selected={editDrink.available_modifiers}
                          onChange={g => toggleModGroup(g, editDrink, f => setEditDrink(f))}
                        />
                      </div>
                      <div className="flex gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingDrinkId(null)}
                          className="flex-1 border border-amber-300 text-amber-700 rounded-lg py-2 text-sm font-medium"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={saveEditDrink}
                          disabled={!editDrink.base_name.trim()}
                          className="flex-1 bg-amber-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  ) : (
                    /* Display row */
                    <div className="bg-white border border-amber-100 rounded-xl px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-amber-900 text-sm">{drink.base_name}</p>
                        <p className="text-xs text-amber-500 mt-0.5">
                          {drink.available_modifiers.length > 0 ? drink.available_modifiers.join(', ') : 'no modifiers'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => startEditDrink(drink)}
                          className="text-xs text-amber-700 border border-amber-300 rounded-lg px-3 py-1.5 hover:bg-amber-50 transition-colors"
                        >
                          Edit
                        </button>
                        {confirmDeleteDrinkId === drink.id ? (
                          <div className="flex items-center gap-1.5">
                            <span className="text-xs text-red-600 font-medium">Sure?</span>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteDrinkId(null)}
                              className="text-xs text-amber-700 border border-amber-300 rounded-lg px-2 py-1 hover:bg-amber-50"
                            >
                              No
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteDrink(drink.id)}
                              className="text-xs bg-red-600 text-white rounded-lg px-2 py-1 hover:bg-red-700"
                            >
                              Delete
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteDrinkId(drink.id)}
                            className="text-xs text-red-500 border border-red-200 rounded-lg px-3 py-1.5 hover:bg-red-50 transition-colors"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {drinksInCategory.length === 0 && activeCategory && (
                <p className="text-sm text-amber-400 text-center py-6">No drinks in this category yet.</p>
              )}
            </div>

            {/* Add New Drink */}
            {showAddDrink ? (
              <div className="bg-white border-2 border-dashed border-amber-300 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900">New Drink</p>
                <input
                  type="text"
                  value={addDrink.base_name}
                  onChange={e => setAddDrink(f => ({ ...f, base_name: e.target.value }))}
                  placeholder="Drink name (e.g. Yuan Yang)"
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <CategorySelect
                  value={addDrink.category}
                  custom={addDrink.customCategory}
                  onChangeValue={v => setAddDrink(f => ({ ...f, category: v }))}
                  onChangeCustom={v => setAddDrink(f => ({ ...f, customCategory: v }))}
                />
                <div>
                  <p className="text-xs font-medium text-amber-700 mb-1">Modifier groups</p>
                  <ModGroupCheckboxes
                    selected={addDrink.available_modifiers}
                    onChange={g => toggleModGroup(g, addDrink, f => setAddDrink(f))}
                  />
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => { setShowAddDrink(false); setAddDrink({ ...BLANK_DRINK_FORM }) }}
                    className="flex-1 border border-amber-300 text-amber-700 rounded-lg py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addNewDrink}
                    disabled={!addDrink.base_name.trim() || (!addDrink.category || (addDrink.category === '__new__' && !addDrink.customCategory.trim()))}
                    className="flex-1 bg-amber-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Add Drink
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowAddDrink(true)}
                className="w-full border-2 border-dashed border-amber-300 text-amber-600 rounded-xl py-3 text-sm font-medium hover:border-amber-400 hover:text-amber-700 transition-colors"
              >
                + Add New Drink
              </button>
            )}
          </section>

          {/* ── Section 2: Modifier Groups ── */}
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-amber-900">Modifiers</h2>
              <p className="text-xs text-amber-600 mt-0.5">Edit options available in the drink builder.</p>
            </div>

            {allGroups.map(group => {
              const groupMods = modsByGroup[group] ?? []
              const addForm = addModForms[group]
              return (
                <div key={group} className="bg-white rounded-xl border border-amber-100 p-4 space-y-3">
                  <p className="text-xs font-bold uppercase tracking-widest text-amber-600">{group}</p>

                  <div className="space-y-1.5">
                    {groupMods.map((mod, i) => (
                      <div key={mod.id}>
                        {editingModId === mod.id ? (
                          <div className="flex gap-2 items-center">
                            <input
                              type="text"
                              value={editMod.label}
                              onChange={e => setEditMod(f => ({ ...f, label: e.target.value }))}
                              placeholder="Label"
                              className="flex-1 border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <input
                              type="text"
                              value={editMod.shortcode}
                              onChange={e => setEditMod(f => ({ ...f, shortcode: e.target.value }))}
                              placeholder="Code"
                              className="w-20 border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                            />
                            <button
                              type="button"
                              onClick={() => setEditingModId(null)}
                              className="text-xs text-amber-600 px-2 py-1.5 border border-amber-300 rounded-lg hover:bg-amber-50"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={saveEditMod}
                              disabled={!editMod.label.trim()}
                              className="text-xs bg-amber-700 text-white px-2 py-1.5 rounded-lg disabled:opacity-50"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2">
                            {/* Up/Down */}
                            <div className="flex flex-col">
                              <button
                                type="button"
                                onClick={() => moveModifier(mod, 'up')}
                                disabled={i === 0}
                                className="text-amber-400 hover:text-amber-700 disabled:opacity-20 text-xs leading-none py-0.5"
                                aria-label="Move up"
                              >
                                ▲
                              </button>
                              <button
                                type="button"
                                onClick={() => moveModifier(mod, 'down')}
                                disabled={i === groupMods.length - 1}
                                className="text-amber-400 hover:text-amber-700 disabled:opacity-20 text-xs leading-none py-0.5"
                                aria-label="Move down"
                              >
                                ▼
                              </button>
                            </div>
                            <span className="flex-1 text-sm text-amber-900">{mod.label}</span>
                            <code className="text-xs bg-amber-50 border border-amber-100 px-2 py-0.5 rounded text-amber-700 min-w-[2.5rem] text-center">
                              {mod.shortcode || '—'}
                            </code>
                            <button
                              type="button"
                              onClick={() => startEditMod(mod)}
                              className="text-xs text-amber-700 border border-amber-300 rounded-lg px-2 py-1 hover:bg-amber-50"
                            >
                              Edit
                            </button>
                            {confirmDeleteModId === mod.id ? (
                              <div className="flex items-center gap-1">
                                <span className="text-xs text-red-600 font-medium">Sure?</span>
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteModId(null)}
                                  className="text-xs border border-amber-300 rounded px-2 py-0.5 hover:bg-amber-50"
                                >
                                  No
                                </button>
                                <button
                                  type="button"
                                  onClick={() => deleteMod(mod.id)}
                                  className="text-xs bg-red-600 text-white rounded px-2 py-0.5 hover:bg-red-700"
                                >
                                  Del
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteModId(mod.id)}
                                className="text-xs text-red-500 border border-red-200 rounded-lg px-2 py-1 hover:bg-red-50"
                              >
                                ×
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Add modifier to this group */}
                  {addForm?.open ? (
                    <div className="flex gap-2 items-center pt-1 border-t border-amber-100">
                      <input
                        type="text"
                        value={addForm.label}
                        onChange={e => setAddModForms(prev => ({ ...prev, [group]: { ...prev[group], label: e.target.value } }))}
                        placeholder="Label"
                        className="flex-1 border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <input
                        type="text"
                        value={addForm.shortcode}
                        onChange={e => setAddModForms(prev => ({ ...prev, [group]: { ...prev[group], shortcode: e.target.value } }))}
                        placeholder="Code"
                        className="w-20 border border-amber-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={() => setAddModForms(prev => ({ ...prev, [group]: { label: '', shortcode: '', open: false } }))}
                        className="text-xs text-amber-600 px-2 py-1.5 border border-amber-300 rounded-lg"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => addModToGroup(group)}
                        disabled={!addForm.label.trim()}
                        className="text-xs bg-amber-700 text-white px-2 py-1.5 rounded-lg disabled:opacity-50"
                      >
                        Add
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setAddModForms(prev => ({ ...prev, [group]: { label: '', shortcode: '', open: true } }))}
                      className="text-xs text-amber-600 hover:text-amber-800 transition-colors pt-1 border-t border-amber-50 w-full text-left"
                    >
                      + Add modifier
                    </button>
                  )}
                </div>
              )
            })}

            {/* Add New Group */}
            {showNewGroup ? (
              <div className="bg-white border-2 border-dashed border-amber-300 rounded-xl p-4 space-y-3">
                <p className="text-sm font-semibold text-amber-900">New Modifier Group</p>
                <input
                  type="text"
                  value={newGroup.group_name}
                  onChange={e => setNewGroup(f => ({ ...f, group_name: e.target.value }))}
                  placeholder="Group name (e.g. size)"
                  className="w-full border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newGroup.label}
                    onChange={e => setNewGroup(f => ({ ...f, label: e.target.value }))}
                    placeholder="First option label"
                    className="flex-1 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                  <input
                    type="text"
                    value={newGroup.shortcode}
                    onChange={e => setNewGroup(f => ({ ...f, shortcode: e.target.value }))}
                    placeholder="Code"
                    className="w-24 border border-amber-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => { setShowNewGroup(false); setNewGroup({ group_name: '', label: '', shortcode: '' }) }}
                    className="flex-1 border border-amber-300 text-amber-700 rounded-lg py-2 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={addNewGroup}
                    disabled={!newGroup.group_name.trim() || !newGroup.label.trim()}
                    className="flex-1 bg-amber-700 text-white rounded-lg py-2 text-sm font-medium disabled:opacity-50"
                  >
                    Create Group
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowNewGroup(true)}
                className="w-full border-2 border-dashed border-amber-300 text-amber-600 rounded-xl py-3 text-sm font-medium hover:border-amber-400 hover:text-amber-700 transition-colors"
              >
                + Add New Modifier Group
              </button>
            )}
          </section>
        </main>
      )}

    </div>
  )
}
