import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  const token = await getSellsyToken();

  const res = await fetch(
    'https://api.sellsy.com/v2/companies/search?limit=1&embed[]=cf.32239&embed[]=cf.264244&embed[]=cf.264245&embed[]=invoicing_address&embed[]=smart_tags',
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filters: { type: 'prospect', is_archived: false } }),
    }
  );

  const data = await res.json();
  const prospect = data?.data?.[0];

  return NextResponse.json({
    status: res.status,
    // Structure complète pour explorer les champs dispo
    full_prospect: prospect,
    // Zoom sur _embed pour voir les champs custom
    embed: prospect?._embed,
    // Zoom sur les champs de base du prospect
    top_level_fields: prospect ? Object.keys(prospect) : [],
  });
}
