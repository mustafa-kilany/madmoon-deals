import { Router } from 'express';
import multer from 'multer';
import { z } from 'zod';
import { ApiError } from '../../lib/errors';
import { currentUser, requireCustomer } from '../auth/requireUser';
import { checkImage } from '../uploads/images';
import { checkCertificate, toCertificateCheck } from './service';
import { LIMITS } from '../../lib/rateLimit';

export const certificateRoutes = Router();

const photo = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024, files: 1 } }).single('photo');
const optionalText = z.string().trim().max(60).optional().transform(value => value || undefined);
const device = z.object({
  category: z.string(),
  type: z.string(),
  brand: z.string().trim().min(1).max(60),
  model: optionalText,
});

/** A shop's test report: read, checked, saved. A failed check is still 201 (status "failed"). */
certificateRoutes.post('/test-certificates', ...requireCustomer, ...LIMITS.certificate, photo, async (req, res) => {
  if (!req.file) throw new ApiError(422, 'VALIDATION', 'Missing file field "photo"');
  await checkImage(req.file.buffer, 'photo');
  const check = await checkCertificate(currentUser(res.locals).id, req.file.buffer, device.parse(req.body));
  res.status(201).json(toCertificateCheck(check));
});
