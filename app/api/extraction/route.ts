import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';
import { getProspectsEnriched, updateProspect } from '@/lib/sellsy';

// ─────────────────────────────────────────────────────────────
//  MOCK MODE — passer à false quand Sellsy est connecté
// ─────────────────────────────────────────────────────────────
const MOCK_MODE = false;
const DRY_RUN   = true;  // ← true = pas de modification dans Sellsy

// ─────────────────────────────────────────────────────────────
//  CONSTANTES — codes champs custom Sellsy confirmés
// ─────────────────────────────────────────────────────────────
const CF_DATE_MAILING      = 'datemailling';
const CF_DATE_COMMANDE_NOM = 'datecommandendd';
const CF_DATE_FIN_CONTRAT  = 'date-fin-contrat';
const CF_DEPARTEMENT       = 'zip_code';

// ─────────────────────────────────────────────────────────────
//  DONNÉES MOCK
// ─────────────────────────────────────────────────────────────
function generateMockProspects(nb: number): any[] {
  const depts     = ['29', '56', '35', '22'];
  const companies = ['Dupont SARL', 'Martin & Fils', 'Bretagne Web', 'Finistère Digital', 'Brest Solutions', 'Quimper Tech', 'Morlaix Services', 'Lorient Conseil'];
  const contacts  = ['Marc Leroy', 'Sophie Martin', 'Pierre Dupont', 'Claire Bernard', 'Julien Moreau', 'Isabelle Roux', 'Thomas Petit', 'Amélie Garnier'];

  return Array.from({ length: nb }, (_, i) => ({
    id:                        1000 + i,
    name:                      companies[i % companies.length],
    website:                   `https://www.${companies[i % companies.length].toLowerCase().replace(/\s/g, '')}.fr`,
    address:                   `${i + 1} rue de la Paix`,
    city:                      'Quimper',
    phone:                     `02${String(i).padStart(8, '0')}`,
    phone_mobile:              i % 3 === 0 ? `06${String(i).padStart(8, '0')}` : null,
    [CF_DEPARTEMENT]:          depts[i % depts.length] + '000',
    [CF_DATE_MAILING]:         i % 3 === 0 ? null : new Date(Date.now() - (i * 400 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
    [CF_DATE_COMMANDE_NOM]:    i % 4 === 0 ? null : new Date(Date.now() - (i * 500 * 24 * 60 * 60 * 1000)).toISOString().split('T')[0],
    [CF_DATE_FIN_CONTRAT]:     i % 5 === 0 ? '2025-01-01' : null,
    contact: { name: contacts[i % contacts.length] },
    email:   `contact${i}@prospect.fr`,
  }));
}

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
//  FILTRES MÉTIER
// ─────────────────────────────────────────────────────────────
function applyBatch1(prospects: any[], dateSortie: Date): any[] {
  const limite        = subMonths(dateSortie, 30);
  const limiteMailing = subYears(dateSortie, 2);

  return prospects.filter(p => {
    const dept = p[CF_DEPARTEMENT] ?? '';
    if (!dept.startsWith('29') && !dept.startsWith('56')) return false;

    const dateCommande = p[CF_DATE_COMMANDE_NOM];
    if (!isUnknown(dateCommande) && new Date(dateCommande) > limite) return false;

    if (!isUnknown(p[CF_DATE_FIN_CONTRAT])) return false;

    const dateMailing = p[CF_DATE_MAILING];
    if (!isUnknown(dateMailing) && new Date(dateMailing) > limiteMailing) return false;

    return true;
  });
}

function applyBatch2(prospects: any[]): any[] {
  return prospects.filter(p => {
    if (!(p[CF_DEPARTEMENT] ?? '').startsWith('29')) return false;
    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;
    if (!isUnknown(p[CF_DATE_MAILING]))       return false;
    return true;
  });
}

function applyBatch3(prospects: any[]): any[] {
  const limite2000 = new Date('2000-01-01');
  return prospects.filter(p => {
    if (!(p[CF_DEPARTEMENT] ?? '').startsWith('29')) return false;
    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;
    const dm = p[CF_DATE_MAILING];
    if (isUnknown(dm)) return false;
    if (new Date(dm) >= limite2000) return false;
    return true;
  });
}

function applyBatch4(prospects: any[]): any[] {
  const limite2000    = new Date('2000-01-01');
  const limiteMailing = subYears(new Date(), 2);
  return prospects.filter(p => {
    if (!(p[CF_DEPARTEMENT] ?? '').startsWith('29')) return false;
    if (!isUnknown(p[CF_DATE_COMMANDE_NOM])) return false;
    if (!isUnknown(p[CF_DATE_FIN_CONTRAT]))  return false;
    const dm = p[CF_DATE_MAILING];
    if (isUnknown(dm)) return false;
    const d = new Date(dm);
    if (d < limite2000 || d > limiteMailing) return false;
    return true;
  });
}

// ─────────────────────────────────────────────────────────────
//  HELPER — enregistrement extraction + prospects en BDD
// ─────────────────────────────────────────────────────────────
async function saveExtraction(
  userId: number,
  mode: string,
  dateLancement: string,
  nb: number,
  collected: any[],
  sellsyUpdates: boolean[]
) {
  const [result]: any = await pool.execute(
    `INSERT INTO extractions (user_id, type, date_lancement, nb_demande, nb_sortie, status)
     VALUES (?, ?, ?, ?, ?, 'pending')`,
    [userId, mode, dateLancement, nb, collected.length]
  );

  const extractionId = result.insertId;
  const today = toDateStr(new Date());
  let nbMaj = 0;

  for (let i = 0; i < collected.length; i++) {
    const prospect = collected[i];
    const sellsyOk = sellsyUpdates[i];
    const oldDate  = prospect[CF_DATE_MAILING];
    if (sellsyOk) nbMaj++;

    await pool.execute(
      `INSERT INTO extraction_prospects
       (extraction_id, sellsy_id, company_name, website, address, city, phone, phone_mobile,
        date_mailing_before, date_mailing_after, sellsy_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        extractionId,
        String(prospect.id),
        prospect.name               ?? '',
        prospect.website            ?? null,
        prospect.address            ?? null,
        prospect.city               ?? null,
        prospect.phone              ?? null,
        prospect.phone_mobile       ?? null,
        oldDate                     ?? null,
        sellsyOk ? today            : null,
        sellsyOk ? 1                : 0,
      ]
    );
  }

  const status = collected.length === 0 ? 'error'
    : collected.length < nb ? 'partial'
    : 'done';

  await pool.execute(
    `UPDATE extractions SET nb_sortie = ?, nb_maj_sellsy = ?, status = ? WHERE id = ?`,
    [collected.length, nbMaj, status, extractionId]
  );

  return { extractionId, nbMaj, status };
}

// ─────────────────────────────────────────────────────────────
//  ENDPOINT POST /api/extraction
// ─────────────────────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const { nb, date, mode, heure, rythme } = await req.json();

    if (!nb || nb < 1 || nb > 500) {
      return NextResponse.json({ error: 'Nb prospects invalide.' }, { status: 400 });
    }

    const dateSortie    = date ? new Date(date) : new Date();
    const dateLancement = date
      ? `${date} ${heure || '00:00'}:00`
      : new Date().toISOString().slice(0, 19).replace('T', ' ');

    // ── MOCK MODE ─────────────────────────────────────────────
    if (MOCK_MODE) {
      if (mode === 'planifiee' || mode === 'recurrente') {
        await pool.execute(
          `INSERT INTO schedules (user_id, type, rythme, date_lancement, heure, nb_prospects, actif)
           VALUES (?, ?, ?, ?, ?, ?, 1)`,
          [user.id, mode, rythme ?? null, dateLancement, heure ?? '00:00', nb]
        );
        return NextResponse.json({
          success:   true,
          scheduled: true,
          message:   mode === 'recurrente'
            ? 'Récurrence activée — elle se déclenchera automatiquement.'
            : 'Extraction planifiée — elle se déclenchera à la date prévue.',
        });
      }

      const mockProspects = generateMockProspects(200);
      let collected: any[] = [];

      const b1 = applyBatch1(mockProspects, dateSortie);
      collected.push(...b1);

      if (collected.length < nb) {
        const b2 = applyBatch2(mockProspects)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, Math.min(10, nb - collected.length));
        collected.push(...b2);
      }

      if (collected.length < nb) {
        const b3 = applyBatch3(mockProspects)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, Math.min(10, nb - collected.length));
        collected.push(...b3);
      }

      if (collected.length < nb) {
        const b4 = applyBatch4(mockProspects)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, nb - collected.length);
        collected.push(...b4);
      }

      collected = collected.slice(0, nb);
      const sellsyUpdates = collected.map(() => true);

      const { extractionId, nbMaj, status } = await saveExtraction(
        user.id, mode, dateLancement, nb, collected, sellsyUpdates
      );

      return NextResponse.json({
        success: true, extractionId, nbSortie: collected.length,
        nbMaj, status, manquant: nb - collected.length, mock: true,
      });
    }

    // ── MODE RÉEL ─────────────────────────────────────────────
    // Planifiée ou récurrente → enregistrer en BDD, pas d'extraction immédiate
    if (mode === 'planifiee' || mode === 'recurrente') {
      await pool.execute(
        `INSERT INTO schedules (user_id, type, rythme, date_lancement, heure, nb_prospects, actif)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [user.id, mode, rythme ?? null, dateLancement, heure ?? '00:00', nb]
      );
      return NextResponse.json({
        success:   true,
        scheduled: true,
        message:   mode === 'recurrente'
          ? 'Récurrence activée — elle se déclenchera automatiquement.'
          : 'Extraction planifiée — elle se déclenchera à la date prévue.',
      });
    }

    const collected: any[] = [];
    let page = 0;

    // Batch 1
    while (collected.length < nb) {
      const enriched = await getProspectsEnriched(100, page * 100);
      if (!enriched.length) break;
      const filtered = applyBatch1(enriched, dateSortie)
        .filter(p => !collected.find((c: any) => c.id === p.id))
        .slice(0, nb - collected.length);
      collected.push(...filtered);
      page++;
      if (enriched.length < 100) break;
    }

    // Batch 2
    if (collected.length < nb) {
      page = 0;
      while (collected.length < nb) {
        const enriched = await getProspectsEnriched(100, page * 100);
        if (!enriched.length) break;
        const filtered = applyBatch2(enriched)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, Math.min(10, nb - collected.length));
        collected.push(...filtered);
        if (filtered.length >= 10 || enriched.length < 100) break;
        page++;
      }
    }

    // Batch 3
    if (collected.length < nb) {
      page = 0;
      while (collected.length < nb) {
        const enriched = await getProspectsEnriched(100, page * 100);
        if (!enriched.length) break;
        const filtered = applyBatch3(enriched)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, Math.min(10, nb - collected.length));
        collected.push(...filtered);
        if (filtered.length >= 10 || enriched.length < 100) break;
        page++;
      }
    }

    // Batch 4
    if (collected.length < nb) {
      page = 0;
      while (collected.length < nb) {
        const enriched = await getProspectsEnriched(100, page * 100);
        if (!enriched.length) break;
        const filtered = applyBatch4(enriched)
          .filter(p => !collected.find(c => c.id === p.id))
          .slice(0, nb - collected.length);
        collected.push(...filtered);
        if (enriched.length < 100) break;
        page++;
      }
    }

    // MàJ Sellsy
    const sellsyUpdates: boolean[] = [];
    for (const prospect of collected) {
      if (DRY_RUN) {
        sellsyUpdates.push(true);
        continue;
      }
      await new Promise(r => setTimeout(r, 200));
      const ok = await updateProspect(String(prospect.id), { [CF_DATE_MAILING]: toDateStr(new Date()) });
      sellsyUpdates.push(ok);
    }

    const { extractionId, nbMaj, status } = await saveExtraction(
      user.id, mode, dateLancement, nb, collected, sellsyUpdates
    );

    return NextResponse.json({
      success: true,
      extractionId,
      nbSortie: collected.length,
      nbMaj,
      status,
      manquant: nb - collected.length,
    });

  } catch (error: any) {
    console.error('Extraction error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur.' }, { status: 500 });
  }
}