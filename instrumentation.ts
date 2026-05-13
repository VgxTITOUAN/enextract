// ─────────────────────────────────────────────────────────────
//  instrumentation.ts — point d'entrée Next.js côté serveur
//  Exécuté une seule fois au démarrage de l'app
//  Doc : https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
// ─────────────────────────────────────────────────────────────

export async function register() {
    // Uniquement côté serveur Node.js (pas dans l'edge runtime)
    if (process.env.NEXT_RUNTIME === 'nodejs') {
      const { initScheduler } = await import('./lib/scheduler');
      initScheduler();
    }
  }