# NexvyLAW Tribunais — build Vite + servidor Node + Poppler (pdftotext/pdftoppm)
FROM node:22-slim AS build
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --no-frozen-lockfile
COPY . .
RUN pnpm build

FROM node:22-slim
WORKDIR /app
# Poppler é parte do MOTOR: extração de texto, página->PNG, bbox do destaque.
RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils postgresql-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
RUN corepack enable
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --prod --no-frozen-lockfile
COPY --from=build /app/dist ./dist
COPY src ./src
COPY scripts ./scripts
COPY supabase ./supabase
RUN mkdir -p fixtures/edicoes fixtures/.ia-cache && chmod +x scripts/migrate.sh
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "./scripts/migrate.sh && node src/server/server.mjs"]
