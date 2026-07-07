import jwt from "jsonwebtoken";
import type { Request, Response, NextFunction } from "express";

const _rawSecret = process.env.JWT_SECRET;
if (!_rawSecret) {
  throw new Error("JWT_SECRET environment variable is required but was not provided.");
}
const JWT_SECRET: string = _rawSecret;

export interface JwtPayload {
  userId: number;
  role: string;
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, JWT_SECRET) as JwtPayload;
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload;
    }
  }
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  try {
    const token = authHeader.slice(7);
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: "Token inválido" });
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "No autorizado" });
    return;
  }
  if (req.user.role !== "admin") {
    res.status(403).json({ error: "Acceso restringido a administradores" });
    return;
  }
  next();
}
