import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

// ─────────────────────────────────────────────────────────────
//  CONSTANTES — À remplacer par les vrais noms de champs Sellsy
//  Une fois les accès API obtenus, faire un GET /v2/prospects/{id}
//  dans Postman et noter les noms exacts des champs custom
// ─────────────────────────────────────────────────────────────
const SELLSY_API     = 'https://api.sellsy.com/v2';
const CF_DATE_MAILING       = 'date_mailing';        // ← à confirmer
const CF_DATE_COMMANDE_NOM  = 'date_commande_nom';   // ← à confirmer
const CF_DATE_FIN_CONTRAT   = 'date_fin_contrat';    // ← à confirmer
const CF_DEPARTEMENT        = 'zip_code';            // ← à confirmer

// ─────────────────────────────────────────────────────────────
//  HELPERS dates
// ─────────────────────────────────────────────────────────────
function subYears(date: Date, years: number): Date {
  const d = new Date(date);
  d.setFullYear(d.getFullYear() - years);
  return d;
}

function subMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() - months);
  return d;
}

function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isUnknown(val: any): boolean {
  return val === null || val === undefined || val === '' || val === '0000-00-00';
}

// ─────────────────────────────────────────────────────────────
//  RÉCUPÉRATION TOKEN SELLSY depuis la BDD
// ─────────────────────────────────────────────────────────────
async function getSellsyToken(userId: number): Promise<string> {
  const [rows]: any = await pool.execute(
    'SELECT sellsy_token, sellsy_token_exp FROM users WHERE id = ?',
    [userId]
  );
  const user = rows[0];

  if (!user?.sellsy_token) {
    throw new Error('Compte Sellsy non connecté. Veuillez vous connecter à Sellsy.');
  }

  if (new Date(user.sellsy_token_exp) <= new Date()) {
    throw new Error('Token Sellsy expiré. Veuillez vous reconnecter à Sellsy.');
  }

  return user.sellsy_token;
}

// ─────────────────────────────────────────────────────────────
//  APPEL API SELLSY — récupère une page de prospects
// ─────────────────────────────────────────────────────────────
async function fetchProspects(token: string, params: Record<string, string> = {}, limit = 100, offset = 0): Promise<any[]> {
  const query = new URLSearchParams({
    limit:  String(limit),
    offset: String(offset),
    ...params,
  });

  const res = await fetch(`${SELLSY_API}/prospects?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Sellsy API error ${res.status}`);
  }

  const data = await res.json();
  return data.data ?? [];
}

// ─────────────────────────────────────────────────────────────
//  FILTRES MÉTIER — appliqués côté back après récupération
// ─────────────────────────────────────────────────────────────
function applyBatch1(prospects: any[], datesSortie: Date): any[] {
  const limite = subMonths(datesSortie, 30); // 2 ans et demi avant date sortie
  const limiteMailling = subYears(new Date(), 2);

  return prospects.filter(p => {
    const dept = p[CF_DEPARTEMENT] ?? '';
    const is29or56 = dept.startsWith('29') || dept.startsWith('56');
    if (!is29or56) return false;

    const dateCommande = p[CF_DATE_COMMANDE_NOM];
    if (!isUnknown(dateCommande) && new Date(dateCommande) > limite) return false;

    const dateFin = p[CF_DATE_FIN_CONTRAT];
    if (!isUnknown(dateFin)) return false;

    const dateMailing = p[CF_DATE_MAILING];
    if (!isUnknown(dateMailing) && new Date(dateMailing) > limiteMailling) return false;

    return true;
  });
}

function applyBatch2(prospects: any[]): any[] {
  return prospects.filter(p => {
    const dept = p[CF_DEPARTEMENT] ?? '';
    if (!dept.startsWith('29')) return false;

    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;
    if (!isUnknown(p[CF_DATE_MAILING]))       return false;

    return true;
  });
}

function applyBatch3(prospects: any[]): any[] {
  const limite2000 = new Date('2000-01-01');

  return prospects.filter(p => {
    const dept = p[CF_DEPARTEMENT] ?? '';
    if (!dept.startsWith('29')) return false;

    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;

    const dateMailing = p[CF_DATE_MAILING];
    if (isUnknown(dateMailing)) return false;
    if (new Date(dateMailing) >= limite2000) return false;

    return true;
  });
}

function applyBatch4(prospects: any[]): any[] {
  const limite2000   = new Date('2000-01-01');
  const limiteMailling = subYears(new Date(), 2);

  return prospects.filter(p => {
    const dept = p[CF_DEPARTEMENT] ?? '';
    if (!dept.startsWith('29')) return false;

    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;

    const dateMailing = p[CF_DATE_MAILING];
    if (isUnknown(dateMailing)) return false;

    const d = new Date(dateMailing);
    if (d < limite2000)         return false;
    if (d > limiteMailling)     return false;

    return true;
  });
}

// ─────────────────────────────────────────────────────────────
//  ENDPOINT POST /api/extraction
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    // Auth
    const cookieStore = await (await import('next/headers')).cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    // Body
    const { nb, date, mode, heure, rythme } = await req.json();

    if (!nb || nb < 1 || nb > 500) {
      return NextResponse.json({ error: 'Nb prospects invalide.' }, { status: 400 });
    }

    // Token Sellsy
    const sellsyToken = await getSellsyToken(user.id);

    const dateSortie = date ? new Date(date) : new Date();
    let collected: any[] = [];
    let page = 0;

    // ── Batch 1 — priorité max, pas de limite ──
    while (collected.length < nb) {
      const raw = await fetchProspects(sellsyToken, {}, 100, page * 100);
      if (!raw.length) break;

      const filtered = applyBatch1(raw, dateSortie).filter(
        p => !collected.find(c => c.id === p.id)
      );
      collected.push(...filtered);
      page++;
      if (raw.length < 100) break;
    }

    // ── Batch 2 — max 10 ──
    if (collected.length < nb) {
      page = 0;
      while (collected.length < nb) {
        const raw = await fetchProspects(sellsyToken, {}, 100, page * 100);
        if (!raw.length) break;

        const filtered = applyBatch2(raw)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, Math.min(10, nb - collected.length));

        collected.push(...filtered);
        if (filtered.length >= 10 || raw.length < 100) break;
        page++;
      }
    }

    // ── Batch 3 — max 10 ──
    if (collected.length < nb) {
      page = 0;
      while (collected.length < nb) {
        const raw = await fetchProspects(sellsyToken, {}, 100, page * 100);
        if (!raw.length) break;

        const filtered = applyBatch3(raw)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, Math.min(10, nb - collected.length));

        collected.push(...filtered);
        if (filtered.length >= 10 || raw.length < 100) break;
        page++;
      }
    }

    // ── Batch 4 — complète jusqu'au nb demandé ──
    if (collected.length < nb) {
      page = 0;
      while (collected.length < nb) {
        const raw = await fetchProspects(sellsyToken, {}, 100, page * 100);
        if (!raw.length) break;

        const filtered = applyBatch4(raw)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, nb - collected.length);

        collected.push(...filtered);
        if (raw.length < 100) break;
        page++;
      }
    }

    // Tronquer au nb demandé
    collected = collected.slice(0, nb);

    // ── Enregistrement en BDD ──
    const dateLancement = date
      ? `${date} ${heure || '00:00'}:00`
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    const [result]: any = await pool.execute(
      `INSERT INTO extractions (user_id, type, date_lancement, nb_demande, nb_sortie, status)
       VALUES (?, ?, ?, ?, ?, 'pending')`,
      [user.id, mode, dateLancement, nb, collected.length]
    );

    const extractionId = result.insertId;

    // ── MàJ Sellsy + enregistrement prospects ──
    let nbMaj = 0;
    const today = toDateStr(new Date());

    for (const prospect of collected) {
      const oldDate = prospect[CF_DATE_MAILING];

      // PATCH Sellsy
      const patchRes = await fetch(`${SELLSY_API}/prospects/${prospect.id}`, {
        method:  'PUT',
        headers: {
          Authorization:  `Bearer ${sellsyToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ [CF_DATE_MAILING]: today }),
      });

      const sellsyOk = patchRes.ok;
      if (sellsyOk) nbMaj++;

      // Enregistrement prospect en BDD
      await pool.execute(
        `INSERT INTO extraction_prospects
         (extraction_id, sellsy_id, company_name, contact_name, email, phone, date_mailing_before, date_mailing_after, sellsy_updated)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          extractionId,
          String(prospect.id),
          prospect.name        ?? '',
          prospect.contact?.name ?? '',
          prospect.email       ?? '',
          prospect.phone       ?? '',
          oldDate              ?? null,
          sellsyOk ? today     : null,
          sellsyOk ? 1         : 0,
        ]
      );
    }

    // ── Finalisation extraction ──
    const status = collected.length === 0 ? 'error'
      : collected.length < nb ? 'partial'
      : 'done';

    await pool.execute(
      `UPDATE extractions SET nb_sortie = ?, nb_maj_sellsy = ?, status = ? WHERE id = ?`,
      [collected.length, nbMaj, status, extractionId]
    );

    return NextResponse.json({
      success:      true,
      extractionId,
      nbSortie:     collected.length,
      nbMaj,
      status,
      manquant:     nb - collected.length,
    });

  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json(
      { error: error.message || 'Erreur serveur.' },
      { status: 500 }
    );
  }
}