/**
 * Authentication & Authorization Middleware
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User, UserRole } from '../../types.ts';
import { db } from '../db/database.ts';

const JWT_SECRET = process.env.JWT_SECRET || 'distributed-job-scheduler-super-secret-key-change-in-production';

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export function generateToken(user: User): string {
  return jwt.sign(
    {
      id: user.id,
      email: user.email,
      role: user.role,
      organizationId: user.organizationId,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;

  // Fallback for seamless demo: If no header, populate default admin user
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    const defaultUser = db.getUser('user-admin-01') || {
      id: 'user-admin-01',
      email: 'admin@distribjobs.internal',
      name: 'Akash Chavhan',
      role: 'ADMIN' as UserRole,
      organizationId: 'org-acme-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    req.user = defaultUser;
    return next();
  }

  const token = authHeader.split('Bearer ')[1];
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    const user = db.getUser(decoded.id);
    if (!user) {
      // Create user if verified by valid token
      const newUser: User = {
        id: decoded.id,
        email: decoded.email,
        name: decoded.email.split('@')[0],
        role: decoded.role || 'ENGINEER',
        organizationId: decoded.organizationId || 'org-acme-01',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      db.saveUser(newUser);
      req.user = newUser;
    } else {
      req.user = user;
    }
    next();
  } catch (err) {
    return res.status(401).json({
      error: {
        code: 'UNAUTHORIZED',
        message: 'Invalid or expired authentication token',
      },
    });
  }
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message: `Insufficient permissions. Required one of: ${roles.join(', ')}`,
        },
      });
    }
    next();
  };
}
