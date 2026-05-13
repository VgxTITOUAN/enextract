// ─────────────────────────────────────────────────────────────
//  Client Sellsy — OAuth2 client_credentials
//  Token global, mis en cache côté serveur
//  À utiliser uniquement côté serveur (API routes)
// ─────────────────────────────────────────────────────────────

const SELLSY_API  = 'https://api.sellsy.com/v2';
const SELLSY_AUTH = 'https://login.sellsy.com/oauth2/access-tokens';

// Cache du token en mémoire serveur
let cachedToken: { value: string; expiry: number } | null = null;

// ─────────────────────────────────────────────────────────────
//  Obtenir un token valide (récupère ou rafraîchit)
// ─────────────────────────────────────────────────────────────
export async function getSellsyToken(): Promise<string> {
  if (cachedToken && cachedToken.expiry > Date.now() + 60_000) {
    return cachedToken.value;
  }

  const clientId     = process.env.SELLSY_CLIENT_ID;
  const clientSecret = process.env.SELLSY_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('Credentials Sellsy manquants dans le .env');
  }

  const res = await fetch(SELLSY_AUTH, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type:    'client_credentials',
      client_id:     clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Sellsy auth failed: ${res.status} — ${err}`);
  }

  const data = await res.json();

  cachedToken = {
    value:  data.access_token,
    expiry: Date.now() + (data.expires_in * 1000),
  };

  return cachedToken.value;
}

// ─────────────────────────────────────────────────────────────
//  Helper interne — exécute fn sur items en batches parallèles
//  batchSize : nb d'appels simultanés
//  delayMs   : pause entre deux batches (respect rate-limit)
// ─────────────────────────────────────────────────────────────
async function processBatch<T>(
  items: any[],
  fn: (item: any) => Promise<T>,
  batchSize = 10,
  delayMs   = 100
): Promise<(T | null)[]> {
  const results: (T | null)[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch        = items.slice(i, i + batchSize);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
}

// ─────────────────────────────────────────────────────────────
//  GET prospects enrichis — version optimisée
//
//  Stratégie :
//  1. Récupère une page de prospects non archivés
//  2. Charge UNIQUEMENT les adresses (batch parallèle ×10)
//  3. Élimine immédiatement tout ce qui n'est pas 29/56
//     → les custom fields ne sont chargés QUE pour les 29/56
//  4. Charge les custom fields sur le sous-ensemble restant
//
//  Gain : si ~10 % des prospects sont en 29/56, on divise
//  par ~10 le nombre d'appels custom-fields par page.
// ─────────────────────────────────────────────────────────────
export async function getProspectsEnriched(limit = 100, offset = 0): Promise<any[]> {
  const token = await getSellsyToken();

  // ── Étape 1 : récupération de la page ───────────────────────
  const res = await fetch(
    `${SELLSY_API}/companies/search?limit=${limit}&offset=${offset}`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: { type: 'prospect', is_archived: false },
      }),
    }
  );

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return getProspectsEnriched(limit, offset);
  }

  if (!res.ok) throw new Error(`Sellsy search failed: ${res.status}`);

  const data      = await res.json();
  const prospects = data.data ?? [];
  if (!prospects.length) return [];

  // ── Étape 2 : adresses en parallèle (batch ×10, 100ms) ──────
  //    On filtre 29/56 ICI — pas besoin d'aller chercher les
  //    custom fields pour les prospects hors zone.
  const withAddressResults = await processBatch(
    prospects,
    async (p: any) => {
      const zipCode = await getCompanyAddress(p.id);
      if (!zipCode) return null;
      if (!zipCode.startsWith('29') && !zipCode.startsWith('56')) return null;
      return { ...p, zip_code: zipCode };
    },
    10,  // 10 appels simultanés
    100  // 100ms entre batches
  );

  const inZone = withAddressResults.filter(Boolean) as any[];
  if (!inZone.length) return [];

  // ── Étape 3 : custom fields UNIQUEMENT sur les 29/56 ────────
  //    Typiquement 5-15 prospects sur 100 → gain massif
  const enriched = await processBatch(
    inZone,
    async (p: any) => {
      const customFields = await getCompanyCustomFields(p.id);
      return { ...p, ...customFields };
    },
    10,  // 10 appels simultanés
    100  // 100ms entre batches
  );

  return enriched.filter(Boolean) as any[];
}

// ─────────────────────────────────────────────────────────────
//  GET prospects — paginé (version de base, non enrichie)
// ─────────────────────────────────────────────────────────────
export async function getProspects(limit = 100, offset = 0): Promise<any[]> {
  const token = await getSellsyToken();

  const res = await fetch(
    `${SELLSY_API}/companies/search?limit=${limit}&offset=${offset}`,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: { type: 'prospect', is_archived: false },
      }),
    }
  );

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return getProspects(limit, offset);
  }

  if (!res.ok) throw new Error(`Sellsy GET /companies/search failed: ${res.status}`);

  const data = await res.json();
  return data.data ?? [];
}

// ─────────────────────────────────────────────────────────────
//  PUT prospect — mise à jour champs custom
// ─────────────────────────────────────────────────────────────
export async function updateProspect(id: string, fields: Record<string, any>): Promise<boolean> {
  const token = await getSellsyToken();

  const res = await fetch(`${SELLSY_API}/companies/${id}`, {
    method:  'PUT',
    headers: {
      Authorization:  `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(fields),
  });

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return updateProspect(id, fields);
  }

  return res.ok;
}

// ─────────────────────────────────────────────────────────────
//  GET prospect par ID
// ─────────────────────────────────────────────────────────────
export async function getProspect(id: string): Promise<any> {
  const token = await getSellsyToken();

  const res = await fetch(`${SELLSY_API}/prospects/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) throw new Error(`Sellsy GET /prospects/${id} failed: ${res.status}`);

  return res.json();
}

// ─────────────────────────────────────────────────────────────
//  GET adresse principale d'une company → code postal
// ─────────────────────────────────────────────────────────────
export async function getCompanyAddress(companyId: number): Promise<string | null> {
  const token = await getSellsyToken();

  const res = await fetch(
    `${SELLSY_API}/companies/${companyId}/addresses`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return null;

  const data    = await res.json();
  const address = data.data?.[0];
  return address?.postal_code ?? null;
}

// ─────────────────────────────────────────────────────────────
//  GET champs custom d'une company
// ─────────────────────────────────────────────────────────────
export async function getCompanyCustomFields(id: number): Promise<Record<string, any>> {
  const token = await getSellsyToken();

  const res = await fetch(
    `${SELLSY_API}/companies/${id}/custom-fields`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return {};

  const data   = await res.json();
  const fields: Record<string, any> = {};

  for (const field of data.data ?? []) {
    fields[field.code] = field.value;
  }

  return fields;
}