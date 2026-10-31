import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import multer from 'multer';
import { prisma } from '../../db';
import { ApiError } from '../../lib/errors';
import { publicUrl } from '../../lib/publicUrl';
import { storage } from '../../lib/storage';
import { categoryInfo } from '../../reference';
import { toApiUser } from '../auth/apiUser';
import { currentUser, requireAdmin, requireCustomer } from '../auth/requireUser';
import { checkImage, fullSize, square } from './images';

// docs/API.md: POST /uploads/listing-photo, POST /me/avatar; admin category pictures
// (BACKEND_PLAN B3.8). One photo per request, up to 10 MB, kept in memory only
// while it is processed.

const MAX_BYTES = 10 * 1024 * 1024;
const one = (field: string) =>
  multer({ storage: multer.memoryStorage(), limits: { fileSize: MAX_BYTES, files: 1 } }).single(field);

const fileOf = (req: Request, field: string) => {
  if (!req.file) throw new ApiError(422, 'VALIDATION', `Missing file field "${field}"`);
  return req.file.buffer;
};

export const uploadRoutes = Router();

/** A listing photo: 1600 px + a 400 × 400 thumbnail. Used by POST /listings (B4). */
uploadRoutes.post('/uploads/listing-photo', ...requireCustomer, one('photo'), async (req, res) => {
  const data = fileOf(req, 'photo');
  await checkImage(data, 'photo');
  const name = `listings/${randomUUID()}`;
  const [full, thumb] = await Promise.all([fullSize(data, 1600), square(data, 400)]);
  const url = await storage.put(`${name}.jpg`, full);
  const thumbUrl = await storage.put(`${name}_400.jpg`, thumb);
  await prisma.upload.create({
    data: { userId: currentUser(res.locals).id, kind: 'listing', url, thumbUrl, bytes: full.length },
  });
  res.status(201).json({ url: publicUrl(req, url) });
});

/** The profile picture: 512 × 512. Replaces the old one. */
uploadRoutes.post('/me/avatar', ...requireCustomer, one('avatar'), async (req, res) => {
  const data = fileOf(req, 'avatar');
  await checkImage(data, 'avatar');
  const user = currentUser(res.locals);
  const image = await square(data, 512);
  const url = await storage.put(`avatars/${randomUUID()}.jpg`, image);
  const updated = await prisma.$transaction(async tx => {
    await tx.upload.create({
      data: { userId: user.id, kind: 'avatar', url, bytes: image.length, usedAt: new Date() },
    });
    return tx.user.update({ where: { id: user.id }, data: { avatarUrl: url } });
  });
  if (user.avatarUrl.startsWith('/files/')) await storage.remove(user.avatarUrl);
  res.json(toApiUser(updated, req));
});

/** An admin replaces a category's picture (the dashboard button comes in B8). */
uploadRoutes.put('/admin/categories/:id/image', ...requireAdmin, one('image'), async (req, res) => {
  const id = req.params.id as string;
  if (!categoryInfo.some(c => c.id === id)) throw new ApiError(404, 'NOT_FOUND', `No category ${id}`);
  const data = fileOf(req, 'image');
  await checkImage(data, 'image');
  const image = await fullSize(data, 1200);
  const url = await storage.put(`categories/${id}-${randomUUID()}.jpg`, image);
  const admin = currentUser(res.locals);
  const previous = await prisma.category.findUnique({ where: { id } });
  await prisma.$transaction([
    prisma.upload.create({
      data: { userId: admin.id, kind: 'category', url, bytes: image.length, usedAt: new Date() },
    }),
    prisma.category.upsert({
      where: { id },
      update: { imageUrl: url, updatedById: admin.id },
      create: { id, imageUrl: url, updatedById: admin.id },
    }),
  ]);
  if (previous) await storage.remove(previous.imageUrl);
  res.json({ id, imageUrl: publicUrl(req, url) });
});
