// ─────────────────────────────────────────────────────────────
//  lib/scheduler.ts
//  Scheduler interne — lance la sync Sellsy chaque nuit à 2h
//  Initialisé une seule fois au démarrage de l'app Next.js
// ─────────────────────────────────────────────────────────────

import cron from 'node-cron';

let initialized = false;

export function initScheduler() {
  if (initialized) return;
  initialized = true;

  // Toutes les nuits à 2h00
  cron.schedule('0 2 * * *', async () => {
    console.log('[CRON] Sync Sellsy démarrée —', new Date().toISOString());

    try {
      const secret = process.env.CRON_SECRET;
      if (!secret) {
        console.error('[CRON] CRON_SECRET manquant dans .env.local');
        return;
      }

      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://enextract.eness.fr';

      const res = await fetch(`${baseUrl}/api/sellsy-sync/cron`, {
        method:  'POST',
        headers: { 'x-cron-secret': secret },
      });

      const data = await res.json();

      if (!res.ok) {
        console.error('[CRON] Sync échouée :', data.error);
        return;
      }

      console.log(`[CRON] Sync terminée — ${data.totalInserted} prospects — ${data.syncedAt}`);

    } catch (err) {
      console.error('[CRON] Erreur inattendue :', err);
    }

  }, {
    timezone: 'Europe/Paris',
  });

  console.log('[CRON] Scheduler initialisé — sync Sellsy tous les soirs à 2h (Europe/Paris)');
}