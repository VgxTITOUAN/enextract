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

    // Vérifier accès
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

    // Prospects
    const [prospects]: any = await pool.execute(
      `SELECT * FROM extraction_prospects WHERE extraction_id = ? ORDER BY company_name`,
      [id]
    );

    // CSV
    const { searchParams } = new URL(req.url);
    if (searchParams.get('format') === 'csv') {
      const lines = [
        'ID Sellsy;Société;Contact;Email;Téléphone;Date mailing avant;Date mailing après;Sellsy MàJ',
        ...prospects.map((p: any) => [
          p.sellsy_id,
          p.company_name   ?? '',
          p.contact_name   ?? '',
          p.email          ?? '',
          p.phone          ?? '',
          p.date_mailing_before ?? '',
          p.date_mailing_after  ?? '',
          p.sellsy_updated ? 'Oui' : 'Non',
        ].join(';'))
      ];

      const csv = '\uFEFF' + lines.join('\n');

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