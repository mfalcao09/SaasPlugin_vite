# Template Dockerfile — igual para todos os apps Vite (SPA)
# Uso: docker compose build nexvy-beauty
# O ARG APP_DIR é passado pelo docker-compose.yml

ARG APP_DIR=NexvyBeauty

FROM node:22-alpine@sha256:0a7108bf6c7bf5de370ffb1a3ed6be93d405b43ff159f681a8d18c0e2bc2e402 AS builder
ARG APP_DIR
WORKDIR /app
COPY apps/${APP_DIR}/package*.json ./
RUN npm ci --no-audit --no-fund --loglevel=error
COPY apps/${APP_DIR}/ .
RUN npm run build

FROM nginx:alpine@sha256:df221db836e1754089190208cee7eeda94f233197056426eda74a43ab1abeac2
COPY --from=builder /app/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/health || exit 1
