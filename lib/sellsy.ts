// ─────────────────────────────────────────────────────────────
//  lib/sellsy.ts — accès API Sellsy
// ─────────────────────────────────────────────────────────────

import pool from '@/lib/db';

class SellsyQuotaError extends Error {
  constructor(public type: 'day', message: string) {
    super(message);
    this.name = 'SellsyQuotaError';
  }
}

const SELLSY_API  = 'https://api.sellsy.com/v2';
const SELLSY_AUTH = 'https://login.sellsy.com/oauth2/access-tokens';

const SELLSY_CUSTOM_FIELD_IDS = {
  datemailling:      32239,
  datecommandendd:   264244,
  dateFinContrat:    264245,
};

let cachedToken: { value: string; expiry: number } | null = null;

async function checkQuota(response: Response): Promise<void> {
  const bySecond = parseInt(response.headers.get('X-Quota-Remaining-By-Second') ?? '999');
  const byMinute = parseInt(response.headers.get('X-Quota-Remaining-By-Minute') ?? '999');
  const byDay    = parseInt(response.headers.get('X-Quota-Remaining-By-Day')    ?? '999');

  console.log(`Quota — seconde: ${bySecond} | minute: ${byMinute} | jour: ${byDay}`);

  if (byDay <= 100) {
    throw new SellsyQuotaError('day', `Quota journalier Sellsy presque épuisé (${byDay} restants). Extraction stoppée pour protéger les données.`);
  }

  if (bySecond <= 5) {
    console.log('Quota/seconde critique — pause 60s');
    await new Promise(r => setTimeout(r, 60_000));
  } else if (byMinute <= 30) {
    console.log('Quota/minute critique — pause 60s');
    await new Promise(r => setTimeout(r, 60_000));
  }
}

// ─────────────────────────────────────────────────────────────
//  Auth Sellsy
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
  await checkQuota(res);

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
//  Type prospect enrichi
// ─────────────────────────────────────────────────────────────
export interface ProspectEnriched {
  id:                   number;
  name:                 string;
  website:              string | null;
  zip_code:             string | null;
  address:              string | null;
  city:                 string | null;
  phone:                string | null;
  phone_mobile:         string | null;
  datemailling:         string | null;
  datecommandendd:      string | null;
  'date-fin-contrat':   string | null;
  [key: string]: any;
}

// ─────────────────────────────────────────────────────────────
//  GET prospects enrichis — pagination par curseur Sellsy
// ─────────────────────────────────────────────────────────────
export async function getProspectsEnriched(
  limit = 100,
  cursor: string | null = null
): Promise<{ prospects: ProspectEnriched[]; nextCursor: string | null }> {
  const url = `${SELLSY_API}/companies/search?limit=${limit}${cursor ? `&after=${encodeURIComponent(cursor)}` : ''}`;
  const token = await getSellsyToken();

  const res = await fetch(
    url,
    {
      method:  'POST',
      headers: {
        Authorization:  `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        filters: { type: 'prospect', is_archived: false },
        embed: ['custom_fields', 'invoicing_address'],
      }),
    }
  );
  await checkQuota(res);

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return getProspectsEnriched(limit, cursor);
  }

  if (res.status === 400) {
    const err = await res.text();
    console.log(`Sellsy embed indisponible sur /companies/search: ${res.status} — ${err}`);
    return { prospects: [], nextCursor: null };
  }

  if (!res.ok) throw new Error(`Sellsy GET /companies/search failed: ${res.status}`);

  const data = await res.json();
  const companies = data.data ?? [];

  if (companies.length > 0 && companies.some((prospect: any) => !prospect._embed)) {
    console.log('Sellsy embed absent dans la réponse /companies/search — page ignorée.');
    return { prospects: [], nextCursor: null };
  }

  const rawNextCursor = data.pagination?.offset;
  const nextCursor = rawNextCursor !== null && rawNextCursor !== undefined
    ? String(rawNextCursor)
    : null;
  const safeNextCursor = nextCursor !== cursor ? nextCursor : null;

  const enriched = companies.map((prospect: any) => {
    const customFields: Record<string, any> = {};
    const rawCustomFields = prospect._embed?.custom_fields ?? [];

    for (const cf of rawCustomFields) {
      customFields[cf.code] = cf.value;
    }

    const getCustomFieldValue = (code: string, id: number) => {
      return customFields[code]
        ?? rawCustomFields.find((cf: any) => Number(cf.id) === id)?.value
        ?? null;
    };

    const invoicingAddress = prospect._embed?.invoicing_address;

    return {
      ...prospect,
      website:              prospect.website             ?? null,
      phone:                prospect.phone_number        ?? prospect.phone  ?? null,
      phone_mobile:         prospect.mobile_phone_number ?? prospect.mobile ?? null,
      zip_code:             invoicingAddress?.postal_code ?? null,
      address:              invoicingAddress?.address_line_1 ?? null,
      city:                 invoicingAddress?.city ?? null,
      datemailling:         getCustomFieldValue('datemailling', SELLSY_CUSTOM_FIELD_IDS.datemailling),
      datecommandendd:      getCustomFieldValue('datecommandendd', SELLSY_CUSTOM_FIELD_IDS.datecommandendd),
      'date-fin-contrat':   getCustomFieldValue('date-fin-contrat', SELLSY_CUSTOM_FIELD_IDS.dateFinContrat),
    };
  });

  return {
    prospects: enriched as ProspectEnriched[],
    nextCursor: safeNextCursor,
  };
}

// ─────────────────────────────────────────────────────────────
//  GET prospects simple (non enrichi) — toujours depuis Sellsy
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
  await checkQuota(res);

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return getProspects(limit, offset);
  }

  if (!res.ok) throw new Error(`Sellsy GET /companies/search failed: ${res.status}`);

  const data = await res.json();
  return data.data ?? [];
}

// ─────────────────────────────────────────────────────────────
//  PUT prospect — mise à jour datemailling dans Sellsy
//  ET dans le cache BDD
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
  await checkQuota(res);

  if (res.status === 429) {
    await new Promise(r => setTimeout(r, 2000));
    return updateProspect(id, fields);
  }

  const ok = res.ok;

  // Sync cache BDD si succès
  if (ok && fields.datemailling) {
    await pool.execute(
      `UPDATE sellsy_cache SET datemailling = ?, synced_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [fields.datemailling, id]
    ).catch(() => {}); // non bloquant
  }

  return ok;
}

// ─────────────────────────────────────────────────────────────
//  GET adresse complète depuis Sellsy (utilisé par /api/sellsy-sync)
// ─────────────────────────────────────────────────────────────
export async function getCompanyFullAddress(
  companyId: number
): Promise<{ zip_code: string; address: string | null; city: string | null } | null> {
  const token = await getSellsyToken();

  const res = await fetch(
    `${SELLSY_API}/companies/${companyId}/addresses`,
    { headers: { Authorization: `Bearer ${token}` } }
  );
  await checkQuota(res);

  if (!res.ok) return null;

  const data = await res.json();
  const addr = data.data?.[0];
  if (!addr?.postal_code) return null;

  return {
    zip_code: addr.postal_code    ?? '',
    address:  addr.address_line_1 ?? null,
    city:     addr.city           ?? null,
  };
}

// ─────────────────────────────────────────────────────────────
//  GET prospect par ID
// ─────────────────────────────────────────────────────────────
export async function getProspect(id: string): Promise<any> {
  const token = await getSellsyToken();

  const res = await fetch(`${SELLSY_API}/prospects/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  await checkQuota(res);

  if (!res.ok) throw new Error(`Sellsy GET /prospects/${id} failed: ${res.status}`);

  return res.json();
}
