import { NextResponse } from 'next/server';
import { APP_VERSION } from '@/lib/app-version';

export const dynamic = 'force-dynamic';

/** Текущая версия кода сайта — открытые вкладки сверяют её со своей. */
export function GET() {
  return NextResponse.json({ version: APP_VERSION }, { headers: { 'Cache-Control': 'no-store' } });
}
