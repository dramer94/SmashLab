import { NextRequest, NextResponse } from 'next/server'
import { getAllPlayersGlobal } from '@/lib/queries'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const country = searchParams.get('country') || undefined
  const category = searchParams.get('category') || undefined
  const search = searchParams.get('q') || undefined
  const page = parseInt(searchParams.get('page') || '1')
  const limit = Math.min(parseInt(searchParams.get('limit') || '50'), 100)

  const result = await getAllPlayersGlobal({ country, category, search, page, limit })
  return NextResponse.json(result)
}
