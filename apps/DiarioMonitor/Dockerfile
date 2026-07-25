# NexvyLAW Tribunais — build Vite + servidor Node + Poppler (pdftotext/pdftoppm)
FROM node:22-slim AS build
WORKDIR /app
# npm puro: o gate de build-scripts do pnpm 10/11 muda a cada versão e
# quebrou o build 3x; o app não usa recursos de workspace. Dívida do piloto:
# sem lockfile pnpm no build (determinismo via ranges do package.json).
COPY package.json ./
RUN npm install --no-audit --no-fund
COPY . .
RUN npm run build

FROM node:22-slim
WORKDIR /app
# Poppler é parte do MOTOR: extração de texto, página->PNG, bbox do destaque.
RUN apt-get update && apt-get install -y --no-install-recommends \
      poppler-utils postgresql-client ca-certificates \
    && rm -rf /var/lib/apt/lists/*
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY src ./src
COPY scripts ./scripts
COPY supabase ./supabase
RUN mkdir -p fixtures/edicoes fixtures/.ia-cache && chmod +x scripts/migrate.sh
ENV NODE_ENV=production PORT=3000
EXPOSE 3000
CMD ["sh", "-c", "./scripts/migrate.sh && node src/server/server.mjs"]
