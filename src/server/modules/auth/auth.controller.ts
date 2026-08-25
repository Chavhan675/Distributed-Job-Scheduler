/**
 * Authentication Module Router & Controller
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../../db/database.ts';
import { User, UserRole } from '../../../types.ts';
import { generateToken, requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';

export const authRouter = Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
  name: z.string().min(2),
  organizationName: z.string().optional(),
  role: z.enum(['ADMIN', 'ENGINEER', 'OPERATOR', 'VIEWER']).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

// POST /api/auth/register
authRouter.post('/register', validateBody(registerSchema), async (req: Request, res: Response) => {
  const { email, password, name, organizationName, role } = req.body;

  const existing = db.getUserByEmail(email);
  if (existing) {
    return res.status(409).json({
      error: { code: 'USER_EXISTS', message: 'User with this email already exists' },
    });
  }

  // Create or assign organization
  let orgId = 'org-acme-01';
  if (organizationName) {
    const newOrg = {
      id: `org-${Date.now()}`,
      name: organizationName,
      slug: organizationName.toLowerCase().replace(/[^a-z0-9]/g, '-'),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveOrganization(newOrg);
    orgId = newOrg.id;
  }

  const user: User = {
    id: `usr-${Date.now()}`,
    email,
    name,
    role: (role as UserRole) || 'ENGINEER',
    organizationId: orgId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.saveUser(user);
  const token = generateToken(user);

  return res.status(201).json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId },
    token,
  });
});

// POST /api/auth/login
authRouter.post('/login', validateBody(loginSchema), async (req: Request, res: Response) => {
  const { email, password } = req.body;
  let user = db.getUserByEmail(email);

  if (!user) {
    // For demo convenience, auto-create if demo user
    user = {
      id: `usr-${Date.now()}`,
      email,
      name: email.split('@')[0],
      role: 'ADMIN',
      organizationId: 'org-acme-01',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    db.saveUser(user);
  }

  const token = generateToken(user);

  return res.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, organizationId: user.organizationId },
    token,
  });
});

// GET /api/auth/me
authRouter.get('/me', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  return res.json({ user: req.user });
});
