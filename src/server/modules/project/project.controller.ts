/**
 * Projects Router & Controller
 */

import { Router, Response } from 'express';
import { z } from 'zod';
import { db } from '../../db/database.ts';
import { Project } from '../../../types.ts';
import { requireAuth, AuthenticatedRequest } from '../../middleware/auth.ts';
import { validateBody } from '../../middleware/validate.ts';

export const projectRouter = Router();

const createProjectSchema = z.object({
  name: z.string().min(2),
  slug: z.string().optional(),
  description: z.string().optional(),
  organizationId: z.string().optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(2).optional(),
  description: z.string().optional(),
});

// GET /api/projects
projectRouter.get('/', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const orgId = (req.query.organizationId as string) || req.user?.organizationId;
  const projects = db.listProjects(orgId);
  return res.json({ projects });
});

// POST /api/projects
projectRouter.post('/', requireAuth, validateBody(createProjectSchema), (req: AuthenticatedRequest, res: Response) => {
  const { name, slug, description, organizationId } = req.body;
  const orgId = organizationId || req.user?.organizationId || 'org-acme-01';

  const newProject: Project = {
    id: `proj-${Date.now()}`,
    name,
    slug: slug || name.toLowerCase().replace(/[^a-z0-9]/g, '-'),
    description,
    organizationId: orgId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  db.saveProject(newProject);
  return res.status(201).json({ project: newProject });
});

// GET /api/projects/:id
projectRouter.get('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }
  return res.json({ project });
});

// PUT /api/projects/:id
projectRouter.put('/:id', requireAuth, validateBody(updateProjectSchema), (req: AuthenticatedRequest, res: Response) => {
  const project = db.getProject(req.params.id);
  if (!project) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }

  const { name, description } = req.body;
  if (name) project.name = name;
  if (description !== undefined) project.description = description;
  project.updatedAt = new Date().toISOString();

  db.saveProject(project);
  return res.json({ project });
});

// DELETE /api/projects/:id
projectRouter.delete('/:id', requireAuth, (req: AuthenticatedRequest, res: Response) => {
  const deleted = db.deleteProject(req.params.id);
  if (!deleted) {
    return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Project not found' } });
  }
  return res.json({ success: true, message: 'Project and all associated queues deleted' });
});
