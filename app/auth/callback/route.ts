import { createClient } from '@/lib/supabase/server'
import { syncAppUser } from '@/lib/auth/session'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl
  const code = searchParams.get('code')
  const requestedNext = searchParams.get('next') ?? '/'
  const next = requestedNext.startsWith('/') && !requestedNext.startsWith('//') ? requestedNext : '/'

  if (code) {
    const supabase = await createClient()
    const { data, error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      const user = data.user ?? data.session?.user ?? null

      if (user) {
        try {
          await syncAppUser({ id: user.id, email: user.email ?? null })
        } catch (syncError) {
          console.error(
            '[auth] app user sync failed:',
            syncError instanceof Error ? syncError.message : String(syncError),
          )
        }
      }

      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  return NextResponse.redirect(`${origin}/auth/error`)
}
