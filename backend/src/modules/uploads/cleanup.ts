import { prisma } from '../../db';
import { storage } from '../../lib/storage';

// BACKEND_PLAN B3.6. The Sell form uploads each photo as soon as it's picked,
// before Publish. Photos of forms that were never published are deleted after a
// day. Category pictures, avatars and photos of published listings are never
// touched (they're marked used).

const DAY_MS = 86_400_000;

export async function deleteUnusedUploads(olderThanMs = DAY_MS) {
  const stale = await prisma.upload.findMany({
    where: { kind: 'listing', usedAt: null, createdAt: { lt: new Date(Date.now() - olderThanMs) } },
    take: 500,
  });
  for (const upload of stale) {
    await storage.remove(upload.url);
    if (upload.thumbUrl) await storage.remove(upload.thumbUrl);
  }
  await prisma.upload.deleteMany({ where: { id: { in: stale.map(u => u.id) } } });
  return stale.length;
}

/** Runs the clean-up every hour while the server is up (src/lib/jobs.ts: pg-boss once there are several servers). */
export function scheduleUploadCleanup() {
  const run = () =>
    deleteUnusedUploads()
      .then(count => count > 0 && console.log(`Deleted ${count} unused listing photos`))
      .catch(error => console.error('Upload clean-up failed', error));
  setTimeout(run, 60_000);
  setInterval(run, 60 * 60_000);
}
