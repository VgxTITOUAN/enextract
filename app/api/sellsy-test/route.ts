import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  const token = await getSellsyToken();

  // Lister tous les custom fields disponibles
  const res = await fetch(
    'https://api.sellsy.com/v2/custom-fields?limit=100',
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await res.json();

  return NextResponse.json({
    status: res.status,
    total: data?.pagination?.total,
    fields: (data?.data ?? []).map((f: any) => ({
      id: f.id,
      name: f.name,
      code: f.code,
      type: f.type,
      related_objects: f.related_objects,
    }))
  });
}
