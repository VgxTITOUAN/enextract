import { NextResponse } from 'next/server';

export async function POST() {
  const response = NextResponse.redirect('https://enextract.eness.fr/login');

  response.cookies.set('enextract_token', '', {
    httpOnly: true,
    secure:   true,
    sameSite: 'strict',
    maxAge:   0,
    path:     '/',
  });

  return response;
}