import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';
import { updateProspect } from '@/lib/sellsy';

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
//  HELPERS — checkpoints extraction
// ─────────────────────────────────────────────────────────────
async function createExtraction(
  userId: number,
  mode: string,
  dateLancement: string,
  nb: number
): Promise<number> {
  const [result]: any = await pool.execute(
    `INSERT INTO extractions (user_id, type, date_lancement, nb_demande, nb_sortie, status)
     VALUES (?, ?, ?, ?, 0, 'pending')`,
    [userId, mode, dateLancement, nb]
  );

  return result.insertId;
}

async function insertProspectCheckpoint(
  extractionId: number,
  prospect: any,
  sellsyOk: boolean,
  today: string
) {
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
      prospect[CF_DATE_MAILING]   ?? null,
      sellsyOk ? today            : null,
      sellsyOk ? 1                : 0,
    ]
  );
}

async function updateExtractionCheckpoint(
  extractionId: number,
  nbSortie: number,
  nbMaj: number,
  status = 'pending'
) {
  await pool.execute(
    `UPDATE extractions SET nb_sortie = ?, nb_maj_sellsy = ?, status = ? WHERE id = ?`,
    [nbSortie, nbMaj, status, extractionId]
  );
}

function getFinalStatus(nbSortie: number, nbDemande: number): 'done' | 'partial' | 'error' {
  if (nbSortie === 0) return 'error';
  return nbSortie >= nbDemande ? 'done' : 'partial';
}

async function checkpointPage(
  extractionId: number,
  pageProspects: any[]
): Promise<number> {
  const today = toDateStr(new Date());
  let nbMaj = 0;

  for (const prospect of pageProspects) {
    let sellsyOk = true;

    if (!DRY_RUN) {
      await new Promise(r => setTimeout(r, 200));
      sellsyOk = await updateProspect(String(prospect.id), { [CF_DATE_MAILING]: today });
    }

    if (sellsyOk) nbMaj++;
    await insertProspectCheckpoint(extractionId, prospect, sellsyOk, today);
  }

  return nbMaj;
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

    const extractionId = await createExtraction(user.id, mode, dateLancement, nb);
    const collected: any[] = [];
    const collectedIds = new Set<string>();
    let nbMaj = 0;

    async function checkpointEligiblePage(pageProspects: any[]) {
      if (pageProspects.length > 0) {
        const pageNbMaj = await checkpointPage(extractionId, pageProspects);
        nbMaj += pageNbMaj;
        collected.push(...pageProspects);
        pageProspects.forEach(p => collectedIds.add(String(p.id)));
      }

      await updateExtractionCheckpoint(extractionId, collected.length, nbMaj);
    }

    async function processMockPage(page: any[]) {
      const batch1 = applyBatch1(page, dateSortie)
        .filter(p => !collectedIds.has(String(p.id)))
        .slice(0, nb - collected.length);
      await checkpointEligiblePage(batch1);

      if (collected.length < nb) {
        const batch2 = applyBatch2(page)
          .filter(p => !collectedIds.has(String(p.id)))
          .slice(0, Math.min(10, nb - collected.length));
        await checkpointEligiblePage(batch2);
      }

      if (collected.length < nb) {
        const batch3 = applyBatch3(page)
          .filter(p => !collectedIds.has(String(p.id)))
          .slice(0, Math.min(10, nb - collected.length));
        await checkpointEligiblePage(batch3);
      }

      if (collected.length < nb) {
        const batch4 = applyBatch4(page)
          .filter(p => !collectedIds.has(String(p.id)))
          .slice(0, nb - collected.length);
        await checkpointEligiblePage(batch4);
      }
    }

    async function processSellsyBatch(
      filterFn: (prospects: any[]) => any[],
      maxBatchCount: number | null = null
    ) {
      let page = 0;
      let batchCount = 0;

      while (true) {
        const [rows]: any = await pool.execute(
          `SELECT
             sellsy_id AS id,
             name,
             email,
             phone,
             zip_code,
             datemailling,
             datecommandendd,
             date_fin_contrat AS \`date-fin-contrat\`
           FROM sellsy_cache
           WHERE is_archived = 0
           ORDER BY sellsy_id
           LIMIT 100 OFFSET ?`,
          [page * 100]
        );

        const pageProspects = rows ?? [];

        const remainingExtraction = nb - collected.length;
        const remainingBatch = maxBatchCount === null
          ? remainingExtraction
          : Math.min(maxBatchCount - batchCount, remainingExtraction);

        if (pageProspects.length > 0 && remainingExtraction > 0 && remainingBatch > 0) {
          const eligible = filterFn(pageProspects)
            .filter(p => !collectedIds.has(String(p.id)))
            .slice(0, remainingBatch);

          batchCount += eligible.length;
          await checkpointEligiblePage(eligible);
        } else {
          await checkpointEligiblePage([]);
        }

        if (collected.length >= nb) break;
        if (maxBatchCount !== null && batchCount >= maxBatchCount) break;
        if (pageProspects.length < 100) break;
        page++;
      }
    }

    // ── MOCK MODE ─────────────────────────────────────────────
    if (MOCK_MODE) {
      await processMockPage(generateMockProspects(200));
      const status = getFinalStatus(collected.length, nb);
      await updateExtractionCheckpoint(extractionId, collected.length, nbMaj, status);

      return NextResponse.json({
        success: true,
        extractionId,
        nbSortie: collected.length,
        nbMaj,
        status,
        manquant: nb - collected.length,
        mock: true,
      });
    }

    // ── MODE RÉEL ─────────────────────────────────────────────
    await processSellsyBatch(page => applyBatch1(page, dateSortie));
    if (collected.length < nb) await processSellsyBatch(applyBatch2, 10);
    if (collected.length < nb) await processSellsyBatch(applyBatch3, 10);
    if (collected.length < nb) await processSellsyBatch(applyBatch4);

    const status = getFinalStatus(collected.length, nb);
    await updateExtractionCheckpoint(extractionId, collected.length, nbMaj, status);

    return NextResponse.json({
      success: true,
      extractionId,
      nbSortie: collected.length,
      nbMaj,
      status,
      manquant: nb - collected.length,
    });

  } catch (error: any) {
    if (error.name === 'SellsyQuotaError') {
      return NextResponse.json(
        { error: error.message },
        { status: 503 }
      );
    }
    console.error('Extraction error:', error);
    return NextResponse.json({ error: error.message || 'Erreur serveur.' }, { status: 500 });
  }
}