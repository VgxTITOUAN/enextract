import { NextRequest, NextResponse } from 'next/server';
import pool from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signToken } from '@/lib/auth';

// Rate limiting — max 5 tentatives par IP sur 15 minutes
const loginAttempts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry || entry.resetAt < now) {
    loginAttempts.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true; // OK
  }

  if (entry.count >= 5) {
    return false; // Bloqué
  }

  entry.count++;
  return true; // OK
}

function resetRateLimit(ip: string): void {
  loginAttempts.delete(ip);
}

export async function POST(req: NextRequest) {
  try {
    const ip = req.headers.get('x-forwarded-for')
      ?? req.headers.get('x-real-ip')
      ?? 'unknown';

    if (!checkRateLimit(ip)) {
      return NextResponse.json(
        { error: 'Trop de tentatives. Réessayez dans 15 minutes.' },
        { status: 429 }
      );
    }

    const { email, password } = await req.json();

    // Validation basique
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe obligatoires.' },
        { status: 400 }
      );
    }

    // Récupérer l'utilisateur en base
    const [rows]: any = await pool.execute(
      'SELECT id, email, password, name, role, active FROM users WHERE email = ? AND deleted_at IS NULL LIMIT 1',
      [email]
    );

    const user = rows[0];

    if (!user) {
      return NextResponse.json(
        { error: 'Identifiants incorrects.' },
        { status: 401 }
      );
    }

    if (!user.active) {
      return NextResponse.json(
        { error: 'Compte désactivé. Contactez votre administrateur.' },
        { status: 403 }
      );
    }

    // Vérifier le mot de passe
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return NextResponse.json(
        { error: 'Identifiants incorrects.' },
        { status: 401 }
      );
    }

    resetRateLimit(ip);

    // Mettre à jour derniere_connexion
    await pool.execute(
      'UPDATE users SET derniere_connexion = NOW() WHERE id = ?',
      [user.id]
    );

    // Générer le JWT
    const token = signToken({
      id:    user.id,
      name:  user.name,
      email: user.email,
      role:  user.role,
    });

    // Réponse avec cookie httpOnly
    const response = NextResponse.json({
      success: true,
      user: {
        id:    user.id,
        name:  user.name,
        email: user.email,
        role:  user.role,
      },
    });

    response.cookies.set('enextract_token', token, {
      httpOnly: true,
      secure:   process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge:   60 * 60 * 8, // 8 heures
      path:     '/',
    });

    return response;

  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json(
      { error: 'Erreur serveur.' },
      { status: 500 }
    );
  }
}