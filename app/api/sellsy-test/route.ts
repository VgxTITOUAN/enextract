import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import { getSellsyToken } from '@/lib/sellsy';

export async function GET() {
  const cookieStore = await cookies();
  const authToken = cookieStore.get('enextract_token')?.value;
  if (!authToken) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

  const user = verifyToken(authToken);
  if (!user || user.role !== 'admin') {
    return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
  }

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
