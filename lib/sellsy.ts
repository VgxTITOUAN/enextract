// ─────────────────────────────────────────────────────────────
//  Client Sellsy — OAuth2 client_credentials
//  Token global, mis en cache côté serveur
//  À utiliser uniquement côté serveur (API routes)
// ─────────────────────────────────────────────────────────────

const SELLSY_API    = 'https://api.sellsy.com/v2';
const SELLSY_AUTH   = 'https://login.sellsy.com/oauth2/access-tokens';

// Cache du token en mémoire serveur
let cachedToken: { value: string; expiry: number } | null = null;

// ─────────────────────────────────────────────────────────────
//  Obtenir un token valide (récupère ou rafraîchit)
// ─────────────────────────────────────────────────────────────
export async function getSellsyToken(): Promise<string> {
  // Si le token est encore valide (avec 60s de marge)
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
//  GET prospects — paginé
// ─────────────────────────────────────────────────────────────
export async function getProspects(limit = 100, offset = 0): Promise<any[]> {
  const token = await getSellsyToken();

  const query = new URLSearchParams({
    limit:  String(limit),
    offset: String(offset),
  });

  const res = await fetch(`${SELLSY_API}/prospects?${query}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    // Rate limit — attendre 2 secondes et réessayer
    await new Promise(r => setTimeout(r, 2000));
    return getProspects(limit, offset);
  }

  if (!res.ok) {
    throw new Error(`Sellsy GET /prospects failed: ${res.status}`);
  }

  const data = await res.json();
  return data.data ?? [];
}

// ─────────────────────────────────────────────────────────────
//  PUT prospect — mise à jour date_mailing
// ─────────────────────────────────────────────────────────────
export async function updateProspect(id: string, fields: Record<string, any>): Promise<boolean> {
  const token = await getSellsyToken();

  const res = await fetch(`${SELLSY_API}/prospects/${id}`, {
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
//  GET prospect par ID — pour inspecter les champs custom
// ─────────────────────────────────────────────────────────────
export async function getProspect(id: string): Promise<any> {
  const token = await getSellsyToken();

  const res = await fetch(`${SELLSY_API}/prospects/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Sellsy GET /prospects/${id} failed: ${res.status}`);
  }

  return res.json();
}