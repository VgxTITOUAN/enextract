import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSellsyToken } from '@/lib/sellsy';

// ─────────────────────────────────────────────────────────────
//  POST /api/sellsy-sync/cron
//  Protégé par clé secrète dans .env.local
//  CRON_SECRET=une_chaine_aleatoire_longue
//
//  Appelé chaque nuit à 2h via crontab SSH :
//  0 2 * * * curl -s -X POST https://enextract.eness.fr/api/sellsy-sync/cron -H "x-cron-secret: VALEUR_DE_CRON_SECRET"
// ─────────────────────────────────────────────────────────────

const SELLSY_API = 'https://api.sellsy.com/v2';
const PAGE_SIZE  = 100;

const SELLSY_CUSTOM_FIELD_IDS = {
  datemailling:      32239,
  datecommandendd:   264244,
  dateFinContrat:    264245,
};

function enrichFromEmbed(prospect: any) {
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
    website:            prospect.website             ?? null,
    phone:              prospect.phone_number        ?? prospect.phone  ?? null,
    phone_mobile:       prospect.mobile_phone_number ?? prospect.mobile ?? null,
    zip_code:           invoicingAddress?.postal_code ?? null,
    address:            invoicingAddress?.address_line_1 ?? null,
    city:               invoicingAddress?.city ?? null,
    datemailling:       getCustomFieldValue('datemailling', SELLSY_CUSTOM_FIELD_IDS.datemailling),
    datecommandendd:    getCustomFieldValue('datecommandendd', SELLSY_CUSTOM_FIELD_IDS.datecommandendd),
    'date-fin-contrat': getCustomFieldValue('date-fin-contrat', SELLSY_CUSTOM_FIELD_IDS.dateFinContrat),
  };
}

export async function POST(req: NextRequest) {
  try {
    // ── Auth par clé secrète ─────────────────────────────────
    const secret = req.headers.get('x-cron-secret');
    if (!secret || secret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });
    }

    const sellsyToken = await getSellsyToken();
    let page          = 0;
    let totalInserted = 0;
    let hasMore       = true;

    while (hasMore) {
      const res = await fetch(
        `${SELLSY_API}/companies/search?limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
        {
          method:  'POST',
          headers: {
            Authorization:  `Bearer ${sellsyToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            filters: { type: 'prospect', is_archived: false },
            embed: ['custom_fields', 'invoicing_address'],
          }),
        }
      );

      if (res.status === 429) {
        await new Promise(r => setTimeout(r, 3000));
        continue;
      }

      if (!res.ok) {
        return NextResponse.json({ error: `Sellsy error: ${res.status}` }, { status: 500 });
      }

      const data      = await res.json();
      const prospects = data.data ?? [];
      if (!prospects.length) { hasMore = false; break; }
      const enriched = prospects.map(enrichFromEmbed);

      // UPSERT BDD
      for (const p of enriched.filter(Boolean) as any[]) {
        const parseDate = (v: any) => {
          if (!v || v === '0000-00-00') return null;
          const d = new Date(v);
          return isNaN(d.getTime()) ? null : d.toISOString().split('T')[0];
        };

        await pool.execute(
          `INSERT INTO sellsy_cache
             (id, name, website, zip_code, address, city, phone, phone_mobile,
              datemailling, datecommandendd, date_fin_contrat)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             name             = VALUES(name),
             website          = VALUES(website),
             zip_code         = VALUES(zip_code),
             address          = VALUES(address),
             city             = VALUES(city),
             phone            = VALUES(phone),
             phone_mobile     = VALUES(phone_mobile),
             datemailling     = VALUES(datemailling),
             datecommandendd  = VALUES(datecommandendd),
             date_fin_contrat = VALUES(date_fin_contrat),
             synced_at        = CURRENT_TIMESTAMP`,
          [
            p.id,
            p.name                       ?? '',
            p.website                    ?? null,
            p.zip_code                   ?? null,
            p.address                    ?? null,
            p.city                       ?? null,
            p.phone                      ?? null,
            p.phone_mobile               ?? null,
            parseDate(p.datemailling),
            parseDate(p.datecommandendd),
            parseDate(p['date-fin-contrat']),
          ]
        );
        totalInserted++;
      }

      page++;
      if (prospects.length < PAGE_SIZE) hasMore = false;
    }

    // Log en BDD pour traçabilité
    await pool.execute(
      `INSERT INTO extractions (user_id, type, date_lancement, nb_demande, nb_sortie, status)
       VALUES (0, 'cron_sync', NOW(), ?, ?, 'done')`,
      [totalInserted, totalInserted]
    ).catch(() => {}); // non bloquant

    return NextResponse.json({
      success:      true,
      totalInserted,
      syncedAt:     new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('CRON sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}