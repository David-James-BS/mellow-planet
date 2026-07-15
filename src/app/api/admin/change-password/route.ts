import { NextRequest, NextResponse } from 'next/server'
import { compare, hash } from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const currentPassword: string = body?.currentPassword ?? ''
  const newPassword: string = body?.newPassword ?? ''

  if (!currentPassword || !newPassword) {
    return NextResponse.json({ success: false, error: 'Missing fields' }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data } = await supabase
    .from('admin_config')
    .select('admin_password_hash')
    .eq('id', 1)
    .single()

  if (!data?.admin_password_hash) {
    return NextResponse.json({ success: false, error: 'Config not found' }, { status: 500 })
  }

  const valid = await compare(currentPassword, data.admin_password_hash)
  if (!valid) {
    return NextResponse.json({ success: false, error: 'Current password is incorrect' }, { status: 401 })
  }

  const newHash = await hash(newPassword, 10)
  const { error } = await supabase
    .from('admin_config')
    .update({ admin_password_hash: newHash })
    .eq('id', 1)

  if (error) {
    return NextResponse.json({ success: false, error: 'Failed to update password' }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
