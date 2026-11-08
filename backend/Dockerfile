# The API, for any host that runs containers (decision D4). Build from the repo's root,
# because the backend shares the app's rules and reference data (frontend/src):
#   docker build -f backend/Dockerfile -t sahla-api .
# The steps for a release are in backend/docs/DEPLOY.md.

FROM node:24-slim

WORKDIR /app/backend
# Shared code and the category pictures. Nothing else of the app.
COPY frontend/src /app/frontend/src
COPY frontend/assets/images /app/frontend/assets/images
COPY frontend/tsconfig.json /app/frontend/tsconfig.json

COPY backend/package.json backend/package-lock.json backend/prisma.config.ts backend/tsconfig.json ./
COPY backend/prisma ./prisma
# prisma generate (postinstall) reads the schema only; the address is never used at build time.
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npm ci --omit=dev

COPY backend/src ./src
COPY backend/scripts ./scripts

ENV NODE_ENV=production
EXPOSE 4000

# Not root: a bug in the server shouldn't own the container.
RUN mkdir -p /app/backend/node_modules/.cache && chown -R node:node /app/backend
USER node

HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://localhost:'+(process.env.PORT||4000)+'/v1/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"

CMD ["npx", "tsx", "src/server.ts"]
