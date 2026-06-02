import { NextResponse } from 'next/server';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  const token = await getSellsyToken();

  // Récupérer les options du champ select secteuractivite (id 47599)
  const res = await fetch(
    'https://api.sellsy.com/v2/custom-fields/47599',
    {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    }
  );

  const data = await res.json();

  return NextResponse.json({
    status: res.status,
    field: data,
  });
}
