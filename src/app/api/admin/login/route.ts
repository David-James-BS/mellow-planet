import { NextRequest, NextResponse } from 'next/server'
import { compare } from 'bcryptjs'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  const password: string = body?.password ?? ''

  if (!password) {
    return NextResponse.json({ success: false }, { status: 400 })
  }

  const supabase = getSupabase()
  const { data } = await supabase
    .from('admin_config')
    .select('admin_password_hash')
    .eq('id', 1)
    .single()

  if (!data?.admin_password_hash) {
    return NextResponse.json({ success: false, error: 'not_configured' }, { status: 500 })
  }

  const valid = await compare(password, data.admin_password_hash)
  if (!valid) {
    return NextResponse.json({ success: false, error: 'invalid_password' }, { status: 401 })
  }

  const token = crypto.randomUUID()
  return NextResponse.json({ success: true, token })
}
