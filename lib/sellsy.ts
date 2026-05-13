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
//  Type — prospect enrichi retourné par getProspectsEnriched
// ─────────────────────────────────────────────────────────────
export interface ProspectEnriched {
  id:               number;
  name:             string;
  website:          string | null;
  zip_code:         string | null;
  address:          string | null;
  city:             string | null;
  phone:            string | null;   // fixe
  phone_mobile:     string | null;   // mobile
  // champs custom
  datemailling:     string | null;
  datecommandendd:  string | null;
  'date-fin-contrat': string | null;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────
//  GET prospects enrichis — version optimisée
//
//  Stratégie :
//  1. Récupère une page de prospects non archivés
//     → website + téléphones déjà dans la réponse /companies/search
//  2. Charge les adresses en parallèle (batch ×10)
//     → filtre 29/56 ICI, élimine tout le reste immédiatement
//  3. Charge les custom fields UNIQUEMENT sur les 29/56
//     → gain massif : ~10% de la page passe le filtre dept
// ─────────────────────────────────────────────────────────────
export async function getProspectsEnriched(limit = 100, offset = 0): Promise<ProspectEnriched[]> {
  const token = await getSellsyToken();

  // ── Étape 1 : page de prospects ─────────────────────────────
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

  // ── Étape 2 : adresses + filtre 29/56 ───────────────────────
  // On récupère aussi rue + ville ici, pas besoin d'un 2e appel
  const withAddressResults = await processBatch(
    prospects,
    async (p: any) => {
      const addr = await getCompanyFullAddress(p.id);
      if (!addr) return null;
      if (!addr.zip_code.startsWith('29') && !addr.zip_code.startsWith('56')) return null;

      // website et téléphones sont dans la réponse /companies/search
      const phone       = p.phone_number        ?? p.phone        ?? null;
      const phoneMobile = p.mobile_phone_number ?? p.mobile       ?? null;
      const website     = p.website             ?? null;

      return {
        ...p,
        website,
        phone,
        phone_mobile:  phoneMobile,
        zip_code:      addr.zip_code,
        address:       addr.address,
        city:          addr.city,
      };
    },
    10,
    100
  );

  const inZone = withAddressResults.filter(Boolean) as any[];
  if (!inZone.length) return [];

  // ── Étape 3 : custom fields uniquement sur les 29/56 ────────
  const enriched = await processBatch(
    inZone,
    async (p: any) => {
      const customFields = await getCompanyCustomFields(p.id);
      return { ...p, ...customFields } as ProspectEnriched;
    },
    10,
    100
  );

  return enriched.filter(Boolean) as ProspectEnriched[];
}

// ─────────────────────────────────────────────────────────────
//  GET prospects — paginé simple (non enrichi)
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
//  GET adresse complète d'une company
//  Retourne zip_code, address (rue), city
// ─────────────────────────────────────────────────────────────
export async function getCompanyFullAddress(
  companyId: number
): Promise<{ zip_code: string; address: string | null; city: string | null } | null> {
  const token = await getSellsyToken();

  const res = await fetch(
    `${SELLSY_API}/companies/${companyId}/addresses`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) return null;

  const data    = await res.json();
  const addr    = data.data?.[0];
  if (!addr?.postal_code) return null;

  return {
    zip_code: addr.postal_code          ?? '',
    address:  addr.address_line_1       ?? null,
    city:     addr.city                 ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
//  GET adresse simple — rétrocompat (retourne juste le zip)
// ─────────────────────────────────────────────────────────────
export async function getCompanyAddress(companyId: number): Promise<string | null> {
  const full = await getCompanyFullAddress(companyId);
  return full?.zip_code ?? null;
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