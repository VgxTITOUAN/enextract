// ─────────────────────────────────────────────────────────────
//  lib/scheduler.ts
//  Deux jobs automatiques :
//  1. Sync Sellsy — chaque nuit à 2h
//  2. Exécution des planifications et récurrences — chaque minute
// ─────────────────────────────────────────────────────────────

import cron from 'node-cron';
import pool from '@/lib/db';
import { updateProspect } from '@/lib/sellsy';
import { syncSellsyCache } from '@/lib/sellsy-sync';

let initialized = false;

// ─────────────────────────────────────────────────────────────
//  Helpers dates
// ─────────────────────────────────────────────────────────────
function toDateStr(date: Date): string {
  return date.toISOString().split('T')[0];
}

function isUnknown(val: any): boolean {
  return val === null || val === undefined || val === '' || val === '0000-00-00';
}

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

// ─────────────────────────────────────────────────────────────
//  Filtres métier (identiques à route.ts)
// ─────────────────────────────────────────────────────────────
const CF_DATE_MAILING      = 'datemailling';
const CF_DATE_COMMANDE_NOM = 'datecommandendd';
const CF_DATE_FIN_CONTRAT  = 'date-fin-contrat';
const CF_DEPARTEMENT       = 'zip_code';
const DRY_RUN              = true;  // ← passer à false quand validé avec Rémi

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
//  Sauvegarde extraction en BDD
// ─────────────────────────────────────────────────────────────
async function saveExtraction(
  userId: number,
  mode: string,
  scheduleId: number | null,
  dateLancement: string,
  nb: number,
  collected: any[],
  sellsyUpdates: boolean[]
) {
  const [result]: any = await pool.execute(
    `INSERT INTO extractions (user_id, schedule_id, type, date_lancement, nb_demande, nb_sortie, status)
     VALUES (?, ?, ?, ?, ?, ?, 'pending')`,
    [userId, scheduleId, mode, dateLancement, nb, collected.length]
  );

  const extractionId = result.insertId;
  const today        = toDateStr(new Date());
  let   nbMaj        = 0;

  for (let i = 0; i < collected.length; i++) {
    const prospect = collected[i];
    const sellsyOk = sellsyUpdates[i];
    if (sellsyOk) nbMaj++;

    await pool.execute(
      `INSERT INTO extraction_prospects
       (extraction_id, sellsy_id, company_name, website, address, city, zip_code,
        contact_name, email, phone, phone_mobile,
        date_mailing_before, date_mailing_after, sellsy_updated)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        extractionId,
        String(prospect.id),
        prospect.name             ?? '',
        prospect.website          ?? null,
        prospect.address          ?? null,
        prospect.city             ?? null,
        prospect.zip_code         ?? null,
        prospect.contact_name     ?? null,
        prospect.email            ?? null,
        prospect.phone            ?? null,
        prospect.phone_mobile     ?? null,
        prospect[CF_DATE_MAILING] ?? null,
        sellsyOk ? today          : null,
        sellsyOk ? 1              : 0,
      ]
    );
  }

  const status = collected.length === 0       ? 'error'
    : collected.length < nb                   ? 'partial'
    : 'done';

  await pool.execute(
    `UPDATE extractions SET nb_sortie = ?, nb_maj_sellsy = ?, status = ? WHERE id = ?`,
    [collected.length, nbMaj, status, extractionId]
  );

  return { extractionId, nbMaj, status };
}

// ─────────────────────────────────────────────────────────────
//  Exécution d'une extraction planifiée ou récurrente
// ─────────────────────────────────────────────────────────────
async function runScheduledExtraction(schedule: any) {
  const { id: scheduleId, user_id, nb_prospects, type } = schedule;
  const dateSortie    = new Date();
  const dateLancement = toDateStr(dateSortie) + ' ' + dateSortie.toTimeString().slice(0, 5) + ':00';
  const nb            = nb_prospects;

  console.log(`[CRON] Extraction ${type} #${scheduleId} démarrée — ${nb} prospects`);

  try {
    const collected: any[] = [];
    const collectedIds = new Set<string>();

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
             website,
             address,
             city,
             zip_code,
             email,
             phone,
             phone_mobile,
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
          collected.push(...eligible);
          eligible.forEach(p => collectedIds.add(String(p.id)));
        }

        if (collected.length >= nb) break;
        if (maxBatchCount !== null && batchCount >= maxBatchCount) break;
        if (pageProspects.length < 100) break;
        page++;
      }
    }

    await processSellsyBatch(page => applyBatch1(page, dateSortie));
    if (collected.length < nb) await processSellsyBatch(applyBatch2, 10);
    if (collected.length < nb) await processSellsyBatch(applyBatch3, 10);
    if (collected.length < nb) await processSellsyBatch(applyBatch4);

    // MàJ Sellsy
    const sellsyUpdates: boolean[] = [];
    for (const prospect of collected) {
      if (DRY_RUN) { sellsyUpdates.push(true); continue; }
      await new Promise(r => setTimeout(r, 200));
      const ok = await updateProspect(String(prospect.id), { [CF_DATE_MAILING]: toDateStr(new Date()) });
      sellsyUpdates.push(ok);
    }

    const { extractionId, status } = await saveExtraction(
      user_id, type, scheduleId, dateLancement, nb, collected, sellsyUpdates
    );

    // ── Récurrente : calculer la prochaine date ──────────────
    if (type === 'recurrente') {
      const prochaine = new Date();
      if (schedule.rythme === 'demi-semaine') {
        prochaine.setDate(prochaine.getDate() + 3); // +3 jours (lun→jeu ou jeu→lun)
      } else {
        prochaine.setDate(prochaine.getDate() + 7); // +7 jours
      }
      const prochaineDateStr = toDateStr(prochaine) + ' ' + (schedule.heure ?? '00:00') + ':00';
      await pool.execute(
        `UPDATE schedules SET date_lancement = ? WHERE id = ?`,
        [prochaineDateStr, scheduleId]
      );
      console.log(`[CRON] Récurrence #${scheduleId} — prochaine le ${prochaineDateStr}`);
    }

    // ── Planifiée : désactiver après exécution ───────────────
    if (type === 'planifiee') {
      await pool.execute(`UPDATE schedules SET actif = 0 WHERE id = ?`, [scheduleId]);
    }

    console.log(`[CRON] Extraction #${extractionId} terminée — ${collected.length}/${nb} prospects — ${status}`);

  } catch (err) {
    console.error(`[CRON] Erreur extraction schedule #${scheduleId} :`, err);
    await pool.execute(
      `INSERT INTO extractions (user_id, schedule_id, type, date_lancement, nb_demande, nb_sortie, status)
       VALUES (?, ?, ?, ?, ?, 0, 'error')`,
      [user_id, scheduleId, type, dateLancement, nb]
    ).catch(() => {});
  }
}

// ─────────────────────────────────────────────────────────────
//  Job — vérification des planifications (chaque minute)
// ─────────────────────────────────────────────────────────────
async function checkSchedules() {
  try {
    const now = new Date();
    // Fenêtre : entre now-1min et now+1min pour ne pas rater un déclenchement
    const from = new Date(now.getTime() - 60_000);
    const to   = new Date(now.getTime() + 60_000);

    const fromStr = toDateStr(from) + ' ' + from.toTimeString().slice(0, 5) + ':00';
    const toStr   = toDateStr(to)   + ' ' + to.toTimeString().slice(0, 5)   + ':00';

    const [schedules]: any = await pool.execute(
      `SELECT * FROM schedules
       WHERE actif = 1
         AND date_lancement BETWEEN ? AND ?`,
      [fromStr, toStr]
    );

    for (const schedule of schedules) {
      // Éviter les doubles exécutions — vérifier qu'aucune extraction n'existe déjà pour ce schedule aujourd'hui
      const [existing]: any = await pool.execute(
        `SELECT id FROM extractions
         WHERE schedule_id = ?
           AND DATE(date_lancement) = ?`,
        [schedule.id, toDateStr(now)]
      );

      if (existing.length > 0) {
        console.log(`[CRON] Schedule #${schedule.id} déjà exécuté aujourd'hui — skip`);
        continue;
      }

      // Lancer l'extraction en arrière-plan (non bloquant)
      runScheduledExtraction(schedule).catch(err =>
        console.error(`[CRON] Erreur schedule #${schedule.id} :`, err)
      );
    }
  } catch (err) {
    console.error('[CRON] Erreur checkSchedules :', err);
  }
}

// ─────────────────────────────────────────────────────────────
//  Initialisation
// ─────────────────────────────────────────────────────────────
export function initScheduler() {
  if (initialized) return;
  initialized = true;

  // ── Job 1 : sync Sellsy — chaque nuit à 2h ──────────────────
  cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Démarrage sync Sellsy cache');
    try {
      await syncSellsyCache();
    } catch (error: any) {
      console.error('[CRON] Erreur sync Sellsy:', error.message);
    }
  }, { timezone: 'Europe/Paris' });

  // ── Job 2 : vérification planifications — chaque minute ─────
  cron.schedule('* * * * *', checkSchedules, { timezone: 'Europe/Paris' });

  console.log('[CRON] Scheduler initialisé — sync 2h/nuit + planifications chaque minute (Europe/Paris)');
}