import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import { getSellsyToken, getCompanyFullAddress, getCompanyCustomFields } from '@/lib/sellsy';

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

async function processBatch<T>(
  items: any[],
  fn: (item: any) => Promise<T>,
  batchSize = 10,
  delayMs   = 100
): Promise<(T | null)[]> {
  const results: (T | null)[] = [];
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const res   = await Promise.all(batch.map(fn));
    results.push(...res);
    if (i + batchSize < items.length) {
      await new Promise(r => setTimeout(r, delayMs));
    }
  }
  return results;
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

      // Adresses
      const withAddr = await processBatch(
        prospects,
        async (p: any) => {
          const addr = await getCompanyFullAddress(p.id);
          return {
            ...p,
            website:      p.website               ?? null,
            phone:        p.phone_number           ?? p.phone  ?? null,
            phone_mobile: p.mobile_phone_number    ?? p.mobile ?? null,
            zip_code:     addr?.zip_code  ?? null,
            address:      addr?.address   ?? null,
            city:         addr?.city      ?? null,
          };
        },
        10, 100
      );

      // Custom fields
      const enriched = await processBatch(
        withAddr.filter(Boolean),
        async (p: any) => {
          const cf = await getCompanyCustomFields(p.id);
          return { ...p, ...cf };
        },
        10, 100
      );

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