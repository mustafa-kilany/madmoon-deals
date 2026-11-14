# File storage (SECURITY_PLAN S0.5, decision D1)

`STORAGE=local` keeps files in `backend/uploads` and `backend/uploads-private`, for development.
Production **refuses to start** without `STORAGE=s3`: on most hosts the disk is wiped on every deploy.

## What goes where

| Bucket | Holds | Who can read it |
|---|---|---|
| Public (`S3_PUBLIC_BUCKET`) | Listing photos, avatars, category pictures, blurred certificates. Random names. | Anyone, through `FILES_PUBLIC_URL` |
| Private (`S3_PRIVATE_BUCKET`) | Test certificate originals (IMEI, serial numbers) | Nobody directly. Admins with the `certificates` permission, through `GET /admin/certificates/:id/photo` |

The database stores `/files/listings/x.jpg` and `private:certificates/x.jpg`, never a full address, so a move to another
provider changes settings, not data.

## Setting up Cloudflare R2 (the plan's recommendation, D1)

1. Cloudflare dashboard → R2 → create two buckets: `madmoon-photos` and `madmoon-private`.
2. `madmoon-photos` → Settings → **Custom Domains** → `files.sahla.jo`. Leave `madmoon-private` with **no** public access and no domain.
3. R2 → **Manage API Tokens** → create one with *Object Read & Write*, limited to those two buckets. It shows the access key id and the secret once.
4. Set these in the host's secret settings (never in git):
   ```
   STORAGE=s3
   S3_ENDPOINT=https://<account id>.r2.cloudflarestorage.com
   S3_REGION=auto
   S3_ACCESS_KEY_ID=…
   S3_SECRET_ACCESS_KEY=…
   S3_PUBLIC_BUCKET=madmoon-photos
   S3_PRIVATE_BUCKET=madmoon-private
   FILES_PUBLIC_URL=https://files.sahla.jo
   ```
5. **Check it:** `npm run check:storage`. It writes, reads and deletes a file in each bucket and proves the private bucket refuses anonymous reads.
   Do this **before** the first real upload.
6. On the `files.sahla.jo` domain add a Cloudflare response header rule: `X-Content-Type-Options: nosniff` (SECURITY_PLAN S4.4).

AWS S3, DigitalOcean Spaces and MinIO work the same way: only `S3_ENDPOINT` and `S3_REGION` differ.
