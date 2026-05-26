import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ error: 'Non autorisé.' }, { status: 401 });

    const { id: idParam } = await params;
    const id = parseInt(idParam);

    const [rows]: any = await pool.execute(
      user.role === 'admin'
        ? `SELECT e.*, u.name AS user_name FROM extractions e JOIN users u ON u.id = e.user_id WHERE e.id = ?`
        : `SELECT e.*, u.name AS user_name FROM extractions e JOIN users u ON u.id = e.user_id WHERE e.id = ? AND e.user_id = ?`,
      user.role === 'admin' ? [id] : [id, user.id]
    );

    if (!rows.length) {
      return NextResponse.json({ error: 'Extraction introuvable.' }, { status: 404 });
    }

    const extraction = rows[0];

    const [prospects]: any = await pool.execute(
      `SELECT * FROM extraction_prospects WHERE extraction_id = ? ORDER BY company_name`,
      [id]
    );

    const { searchParams } = new URL(req.url);
    if (searchParams.get('format') === 'csv') {

      // "29200 Brest"
      const formatVille = (zip: string | null, city: string | null): string => {
        const z = zip?.trim() || null;
        const c = city?.trim() || null;
        if (!z && !c) return '';
        return [z, c].filter(Boolean).join(' ');
      };

      // "+33298450100" → "02 98 45 01 00"
      const formatPhone = (raw: string | null): string => {
        if (!raw) return '';
        let digits = raw.replace(/\D/g, '');
        if (digits.startsWith('33') && digits.length === 11) {
          digits = '0' + digits.slice(2);
        }
        if (digits.length === 10) {
          return digits.match(/.{2}/g)!.join(' ');
        }
        return raw;
      };

      const formatDate = (d: any) => {
        if (!d) return '';
        return new Date(d).toISOString().split('T')[0];
      };

      const headers = [
        'Société',
        'Site web',
        'Adresse',
        'Code postal Ville',
        'Téléphone fixe',
        'Téléphone mobile',
        'Date mailing',
      ];

      const lines = [
        headers.join(';'),
        ...prospects.map((p: any) => [
          p.company_name  ?? '',
          p.website       ?? '',
          p.address       ?? '',
          formatVille(p.zip_code ?? null, p.city ?? null),
          formatPhone(p.phone        ?? null),
          formatPhone(p.phone_mobile ?? null),
          formatDate(p.date_mailing_before ?? null),
        ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(';')),
      ];

      const csv = '\uFEFF' + 'sep=;\n' + lines.join('\n');

      return new NextResponse(csv, {
        headers: {
          'Content-Type':        'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="extraction_${id}_${new Date().toISOString().split('T')[0]}.csv"`,
        },
      });
    }

    return NextResponse.json({ extraction, prospects });

  } catch (error: any) {
    console.error('Telechargement error:', error);
    return NextResponse.json({ error: 'Erreur serveur.' }, { status: 500 });
  }
}