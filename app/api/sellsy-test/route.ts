import { NextResponse } from 'next/server';
import { getSellsyToken, getProspects } from '@/lib/sellsy';

export async function GET() {
  try {
    // Test 1 — connexion OAuth2
    const token = await getSellsyToken();

    // Test 2 — récupérer 1 seul prospect (lecture seule, rien ne change dans Sellsy)
    const prospects = await getProspects(1, 0);

    return NextResponse.json({
      success:        true,
      token_ok:       !!token,
      nb_prospects:   prospects.length,
      premier_prospect: prospects[0] ?? null, // pour voir la structure des champs
    });

  } catch (error: any) {
    return NextResponse.json({
      success: false,
      error:   error.message,
    }, { status: 500 });
  }
}