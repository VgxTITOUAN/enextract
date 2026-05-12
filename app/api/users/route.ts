import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { verifyToken } from '@/lib/auth';
import pool from '@/lib/db';
import bcrypt from 'bcryptjs';

export async function POST(req: NextRequest) {
  try {
    // Auth
    const cookieStore = await cookies();
    const token = cookieStore.get('enextract_token')?.value;
    if (!token) return NextResponse.json({ success: false, error: 'Non autorisé.' }, { status: 401 });

    const user = verifyToken(token);
    if (!user) return NextResponse.json({ success: false, error: 'Non autorisé.' }, { status: 401 });

    // Admin uniquement
    if (user.role !== 'admin') {
      return NextResponse.json({ success: false, error: 'Accès refusé.' }, { status: 403 });
    }

    const { action, user_id, new_password, name, email, password, role } = await req.json();

    // ── Toggle actif/inactif ──
    if (action === 'toggle') {
      if (user_id === user.id) {
        return NextResponse.json({ success: false, error: 'Impossible de modifier votre propre compte.' }, { status: 400 });
      }

      await pool.execute('UPDATE users SET active = 1 - active WHERE id = ?', [user_id]);

      const [rows]: any = await pool.execute('SELECT name, active FROM users WHERE id = ?', [user_id]);
      const updated = rows[0];

      return NextResponse.json({
        success: true,
        active:  updated.active === 1,
        name:    updated.name,
      });
    }

    // ── Reset mot de passe ──
    if (action === 'reset_password') {
      if (!new_password || new_password.length < 8) {
        return NextResponse.json({ success: false, error: 'Mot de passe trop court.' }, { status: 400 });
      }

      const hash = await bcrypt.hash(new_password, 12);
      await pool.execute('UPDATE users SET password = ? WHERE id = ?', [hash, user_id]);

      const [rows]: any = await pool.execute('SELECT name FROM users WHERE id = ?', [user_id]);

      return NextResponse.json({ success: true, name: rows[0].name });
    }

    // ── Créer un utilisateur ──
    if (action === 'create') {
      if (!name || !email || !password || password.length < 8) {
        return NextResponse.json({ success: false, error: 'Champs invalides.' }, { status: 400 });
      }

      // Vérifier que l'email n'existe pas
      const [existing]: any = await pool.execute('SELECT id FROM users WHERE email = ?', [email]);
      if (existing.length > 0) {
        return NextResponse.json({ success: false, error: 'Cet email est déjà utilisé.' }, { status: 400 });
      }

      const hash = await bcrypt.hash(password, 12);
      const [result]: any = await pool.execute(
        'INSERT INTO users (email, password, name, role, active) VALUES (?, ?, ?, ?, 1)',
        [email, hash, name, role ?? 'commercial']
      );

      const newUser = {
        id:                 result.insertId,
        email,
        name,
        role:               role ?? 'commercial',
        active:             1,
        derniere_connexion: null,
        created_at:         new Date().toISOString(),
      };

      return NextResponse.json({ success: true, user: newUser });
    }

    return NextResponse.json({ success: false, error: 'Action inconnue.' }, { status: 400 });

  } catch (error: any) {
    console.error('Users API error:', error);
    return NextResponse.json({ success: false, error: 'Erreur serveur.' }, { status: 500 });
  }
}