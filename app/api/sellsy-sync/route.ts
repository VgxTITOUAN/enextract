import { NextResponse } from 'next/server';
import { syncSellsyCache } from '@/lib/sellsy-sync';

export async function GET() {
  try {
    await syncSellsyCache();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
