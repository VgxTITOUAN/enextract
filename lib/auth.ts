import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

export interface JwtPayload {
  id:    number;
  name:  string;
  email: string;
  role:  'admin' | 'commercial';
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, SECRET, { expiresIn: '8h' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, SECRET) as JwtPayload;
  } catch {
    return null;
  }
}