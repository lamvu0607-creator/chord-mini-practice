import { NextResponse } from 'next/server';
import { getDatabaseHealth } from '@/server/persistence/database';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const { databasePath: _databasePath, ...health } = getDatabaseHealth();
    return NextResponse.json(health, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({ ready: false, error: error instanceof Error ? error.message : 'Persistence unavailable' }, { status: 503 });
  }
}
