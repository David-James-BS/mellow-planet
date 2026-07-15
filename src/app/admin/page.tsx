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

type Order = {
  id: string
  person_name: string
  drink_description: string
  session_id: string
  created_at: string
}

type AdminTab = 'session' | 'history' | 'settings'

const STORAGE_KEY = 'kopitiam_admin_token'

export default function AdminPage() {
  // Auth
  const [token, setToken] = useState<string | null>(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [loginPassword, setLoginPassword] = useState('')
  const [loginError, setLoginError] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  // UI
  const [activeTab, setActiveTab] = useState<AdminTab>('session')

  // Session
  const [session, setSession] = useState<OrderSession | null>(null)
  const [orders, setOrders] = useState<Order[]>([])
  const [resetting, setResetting] = useState(false)

  // History
  const [pastSessions, setPastSessions] = useState<OrderSession[]>([])
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null)
  const [expandedOrders, setExpandedOrders] = useState<Order[]>([])
  const [loadingExpanded, setLoadingExpanded] = useState(false)

  // Change password
  const [currentPw, setCurrentPw] = useState('')
  const [newPw, setNewPw] = useState('')
  const [confirmPw, setConfirmPw] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwLoading, setPwLoading] = useState(false)
  const [pwSuccess, setPwSuccess] = useState(false)

  // Check localStorage on mount
  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) setToken(stored)
    setAuthChecked(true)
  }, [])

  // Load all admin data when authenticated
  useEffect(() => {
    if (!token) return
    async function loadAdminData() {
      const { data: sess } = await supabase
        .from('order_sessions')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()
      const activeSession = sess ?? null
      setSession(activeSession)

      if (activeSession) {
        const { data: ordData } = await supabase
          .from('orders')
          .select('*')
          .eq('session_id', activeSession.id)
          .order('created_at', { ascending: true })
        setOrders(ordData ?? [])
      }

      const { data: pastData } = await supabase
        .from('order_sessions')
        .select('*')
        .eq('is_active', false)
        .order('closed_at', { ascending: false })
      setPastSessions(pastData ?? [])
    }
    loadAdminData()
  }, [token])

  // Realtime: orders for active session
  useEffect(() => {
    if (!session || !token) return
    const channel = supabase
      .channel(`admin-orders-${session.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        payload => setOrders(prev => [...prev, payload.new as Order])
      )
      .on(
        'postgres_changes',
        { event: 'DELETE', schema: 'public', table: 'orders', filter: `session_id=eq.${session.id}` },
        payload => {
          const id = (payload.old as { id?: string }).id
          if (id) setOrders(prev => prev.filter(o => o.id !== id))
        }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [session, token])

  async function handleLogin() {
    if (!loginPassword.trim()) return
    setLoginLoading(true)
    setLoginError('')
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: loginPassword }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        if (body.error === 'not_configured') {
          setLoginError('Admin not set up yet — run seed.sql in Supabase SQL Editor, then try again.')
        } else {
          setLoginError('Incorrect password')
        }
        return
      }
      const { token: newToken } = await res.json()
      localStorage.setItem(STORAGE_KEY, newToken)
      setToken(newToken)
      setLoginPassword('')
    } catch {
      setLoginError('Login failed. Try again.')
    } finally {
      setLoginLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem(STORAGE_KEY)
    setToken(null)
    setSession(null)
    setOrders([])
    setPastSessions([])
  }

  // Closes current session (if any) and opens a fresh one
  async function performSessionReset(): Promise<void> {
    setResetting(true)

    if (session) {
      await supabase
        .from('order_sessions')
        .update({ is_active: false, closed_at: new Date().toISOString() })
        .eq('id', session.id)
    }

    const { data: newSess } = await supabase
      .from('order_sessions')
      .insert({ is_active: true })
      .select()
      .single()

    if (newSess) {
      if (session) {
        setPastSessions(prev => [
          { ...session, is_active: false, closed_at: new Date().toISOString() },
          ...prev,
        ])
      }
      setSession(newSess)
      setOrders([])
    }
    setResetting(false)
  }

  async function handleCloseAndReset() {
    const hadSession = !!session
    await performSessionReset()
    toast.success(hadSession ? 'Session closed and reset' : 'Session started')
  }

  async function handleExpandSession(sess: OrderSession) {
    if (expandedSessionId === sess.id) {
      setExpandedSessionId(null)
      setExpandedOrders([])
      return
    }
    setExpandedSessionId(sess.id)
    setLoadingExpanded(true)
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('session_id', sess.id)
      .order('created_at', { ascending: true })
    setExpandedOrders(data ?? [])
    setLoadingExpanded(false)
  }

  async function handleChangePassword() {
    setPwError('')
    setPwSuccess(false)
    if (!currentPw || !newPw || !confirmPw) {
      setPwError('All fields are required')
      return
    }
    if (newPw !== confirmPw) {
      setPwError('New passwords do not match')
      return
    }
    if (newPw.length < 6) {
      setPwError('New password must be at least 6 characters')
      return
    }
    setPwLoading(true)
    try {
      const res = await fetch('/api/admin/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      })
      if (!res.ok) {
        const data = await res.json()
        setPwError(data.error ?? 'Failed to update password')
        return
      }
      setPwSuccess(true)
      setCurrentPw('')
      setNewPw('')
      setConfirmPw('')
      toast.success('Password updated')
    } catch {
      setPwError('Request failed. Try again.')
    } finally {
      setPwLoading(false)
    }
  }

  function sessionLabel(iso: string): string {
    return new Date(iso).toLocaleString('en-SG', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function formatDateTime(iso: string): string {
    return new Date(iso).toLocaleString('en-SG', {
      day: 'numeric', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function formatTime(iso: string): string {
    return new Date(iso).toLocaleTimeString('en-SG', {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  // Blank while checking localStorage to avoid flash of login form
  if (!authChecked) return <div className="min-h-screen bg-amber-900" />

  // ── Login form ──
  if (!token) {
    return (
      <div className="min-h-screen bg-amber-900 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl w-full max-w-sm p-6 space-y-4">
          <div className="text-center">
            <h1 className="text-xl font-bold text-amber-900">Admin Login</h1>
            <p className="text-sm text-amber-700 mt-1">David&apos;s Kopitiam</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-stone-700 mb-1">Password</label>
            <input
              type="password"
              value={loginPassword}
              onChange={e => setLoginPassword(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleLogin() }}
              placeholder="Enter admin password"
              className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
            />
          </div>
          {loginError && <p className="text-sm text-red-500">{loginError}</p>}
          <button
            type="button"
            onClick={handleLogin}
            disabled={loginLoading || !loginPassword.trim()}
            className="w-full bg-amber-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
          >
            {loginLoading ? 'Checking…' : 'Login'}
          </button>
        </div>
      </div>
    )
  }

  // ── Admin UI ──
  const TABS: { key: AdminTab; label: string }[] = [
    { key: 'session', label: 'Session' },
    { key: 'history', label: 'History' },
    { key: 'settings', label: 'Settings' },
  ]

  return (
    <div className="min-h-screen bg-stone-100 pb-20">
      {/* Header */}
      <header className="bg-stone-800 text-white px-4 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold leading-tight">Admin Panel</h1>
          <p className="text-xs text-stone-400">David&apos;s Kopitiam</p>
        </div>
        <button
          type="button"
          onClick={handleLogout}
          className="text-stone-400 hover:text-white text-sm transition-colors"
        >
          Logout
        </button>
      </header>

      {/* Tab bar */}
      <div className="flex bg-white border-b border-stone-200 sticky top-0 z-10">
        {TABS.map(tab => (
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
        {/* ── Session tab ── */}
        {activeTab === 'session' && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-stone-800">
                {session ? sessionLabel(session.created_at) : 'No Active Session'}
              </h2>
              <span className="text-sm text-stone-500">
                {orders.length} drink{orders.length !== 1 ? 's' : ''}
              </span>
            </div>

            {orders.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-6">No orders in this session</p>
            ) : (
              <div className="space-y-2">
                {orders.map(order => (
                  <div
                    key={order.id}
                    className="bg-white border border-stone-200 rounded-lg px-4 py-3 flex items-start justify-between gap-3"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-stone-800 text-sm truncate">
                        {order.person_name}
                      </p>
                      <p className="text-sm text-stone-600 mt-0.5">{order.drink_description}</p>
                    </div>
                    <p className="text-xs text-stone-400 shrink-0 mt-0.5">
                      {formatTime(order.created_at)}
                    </p>
                  </div>
                ))}
              </div>
            )}

            <button
              type="button"
              onClick={handleCloseAndReset}
              disabled={resetting}
              className="w-full bg-red-600 text-white rounded-xl py-3 text-sm font-semibold disabled:opacity-50 hover:bg-red-700 transition-colors"
            >
              {resetting ? 'Starting…' : session ? 'Close & Reset Session' : 'Start New Session'}
            </button>
          </div>
        )}

        {/* ── History tab ── */}
        {activeTab === 'history' && (
          <div className="space-y-4">
            <h2 className="text-base font-semibold text-stone-800">Past Sessions</h2>

            {pastSessions.length === 0 ? (
              <p className="text-sm text-stone-400 text-center py-6">No past sessions yet</p>
            ) : (
              <div className="space-y-2">
                {pastSessions.map(sess => (
                  <div
                    key={sess.id}
                    className="bg-white border border-stone-200 rounded-lg overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() => handleExpandSession(sess)}
                      className="w-full px-4 py-3 flex items-center justify-between text-left"
                    >
                      <div>
                        <p className="text-sm font-medium text-stone-800">
                          Started {formatDateTime(sess.created_at)}
                        </p>
                        {sess.closed_at && (
                          <p className="text-xs text-stone-400 mt-0.5">
                            Closed {formatDateTime(sess.closed_at)}
                          </p>
                        )}
                      </div>
                      <span className="text-stone-400 text-xs ml-3">
                        {expandedSessionId === sess.id ? '▲' : '▼'}
                      </span>
                    </button>

                    {expandedSessionId === sess.id && (
                      <div className="border-t border-stone-100 px-4 py-3">
                        {loadingExpanded ? (
                          <p className="text-sm text-stone-400 py-2">Loading…</p>
                        ) : expandedOrders.length === 0 ? (
                          <p className="text-sm text-stone-400 py-2">No orders in this session</p>
                        ) : (
                          <div className="space-y-2.5">
                            {expandedOrders.map(order => (
                              <div
                                key={order.id}
                                className="flex items-start justify-between gap-3"
                              >
                                <div className="flex-1 min-w-0">
                                  <p className="text-sm font-medium text-stone-700 truncate">
                                    {order.person_name}
                                  </p>
                                  <p className="text-xs text-stone-500 mt-0.5">
                                    {order.drink_description}
                                  </p>
                                </div>
                                <p className="text-xs text-stone-400 shrink-0">
                                  {formatTime(order.created_at)}
                                </p>
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

        {/* ── Settings tab ── */}
        {activeTab === 'settings' && (
          <div className="space-y-6">
            <div>
              <h2 className="text-base font-semibold text-stone-800 mb-4">Change Admin Password</h2>
              <div className="space-y-3">
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Current password
                  </label>
                  <input
                    type="password"
                    value={currentPw}
                    onChange={e => setCurrentPw(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    New password
                  </label>
                  <input
                    type="password"
                    value={newPw}
                    onChange={e => setNewPw(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-stone-700 mb-1">
                    Confirm new password
                  </label>
                  <input
                    type="password"
                    value={confirmPw}
                    onChange={e => setConfirmPw(e.target.value)}
                    className="w-full border border-stone-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                {pwError && <p className="text-sm text-red-500">{pwError}</p>}
                {pwSuccess && (
                  <p className="text-sm text-green-600 font-medium">Password updated successfully!</p>
                )}
                <button
                  type="button"
                  onClick={handleChangePassword}
                  disabled={pwLoading || !currentPw || !newPw || !confirmPw}
                  className="w-full bg-amber-700 text-white rounded-xl py-2.5 text-sm font-semibold disabled:opacity-50 transition-colors"
                >
                  {pwLoading ? 'Updating…' : 'Update Password'}
                </button>
              </div>
            </div>

            <div className="border-t border-stone-200 pt-4">
              <button
                type="button"
                onClick={handleLogout}
                className="w-full border-2 border-stone-300 text-stone-600 rounded-xl py-2.5 text-sm font-semibold hover:bg-stone-200 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        )}
      </main>

    </div>
  )
}
