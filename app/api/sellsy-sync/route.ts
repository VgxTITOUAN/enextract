import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';
import { getSellsyToken, getCompanyFullAddress, getCompanyCustomFields } from '@/lib/sellsy';

// ─────────────────────────────────────────────────────────────
//  POST /api/sellsy-sync
//  Réservé admin — charge tous les prospects non archivés
//  depuis Sellsy et les stocke dans sellsy_cache
//  Durée estimée : 20-40 min pour 42 000 prospects
//  → À appeler via CRON Infomaniak la nuit
//    ou manuellement depuis la page Droits
// ─────────────────────────────────────────────────────────────

const SELLSY_API = 'https://api.sellsy.com/v2';
const PAGE_SIZE  = 100;

// Helper batch parallèle
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
    // Auth — admin uniquement
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });
    }

    const sellsyToken = await getSellsyToken();
    let page          = 0;
    let totalInserted = 0;
    let totalPages    = 0;
    let hasMore       = true;

    while (hasMore) {
      // ── Fetch page ───────────────────────────────────────────
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
        continue; // retry même page
      }

      if (!res.ok) {
        return NextResponse.json({ error: `Sellsy error: ${res.status}` }, { status: 500 });
      }

      const data      = await res.json();
      const prospects = data.data ?? [];
      if (!prospects.length) { hasMore = false; break; }

      // ── Adresses en parallèle ─────────────────────────────────
      const withAddr = await processBatch(
        prospects,
        async (p: any) => {
          const addr = await getCompanyFullAddress(p.id);
          return {
            ...p,
            website:      p.website ?? null,
            phone:        p.phone_number        ?? p.phone        ?? null,
            phone_mobile: p.mobile_phone_number ?? p.mobile       ?? null,
            zip_code:     addr?.zip_code  ?? null,
            address:      addr?.address   ?? null,
            city:         addr?.city      ?? null,
          };
        },
        10, 100
      );

      // ── Custom fields en parallèle ────────────────────────────
      const enriched = await processBatch(
        withAddr.filter(Boolean),
        async (p: any) => {
          const cf = await getCompanyCustomFields(p.id);
          return { ...p, ...cf };
        },
        10, 100
      );

      // ── UPSERT en BDD ─────────────────────────────────────────
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
            p.name                  ?? '',
            p.website               ?? null,
            p.zip_code              ?? null,
            p.address               ?? null,
            p.city                  ?? null,
            p.phone                 ?? null,
            p.phone_mobile          ?? null,
            parseDate(p.datemailling),
            parseDate(p.datecommandendd),
            parseDate(p['date-fin-contrat']),
          ]
        );
        totalInserted++;
      }

      totalPages++;
      page++;
      if (prospects.length < PAGE_SIZE) hasMore = false;
    }

    return NextResponse.json({
      success: true,
      totalInserted,
      totalPages,
      syncedAt: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Sync error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─────────────────────────────────────────────────────────────
//  GET /api/sellsy-sync — état du cache
// ─────────────────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user || user.role !== 'admin') {
      return NextResponse.json({ error: 'Réservé aux admins.' }, { status: 403 });
    }

    const [rows]: any = await pool.execute(
      `SELECT COUNT(*) as total, MAX(synced_at) as last_sync FROM sellsy_cache`
    );

    return NextResponse.json({
      total:     rows[0].total,
      last_sync: rows[0].last_sync,
      is_empty:  rows[0].total === 0,
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
