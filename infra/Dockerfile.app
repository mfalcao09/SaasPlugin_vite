# Template Dockerfile — igual para todos os apps Vite (SPA)
# Uso: docker compose build nexvy-beauty
# O ARG APP_DIR é passado pelo docker-compose.yml

ARG APP_DIR=NexvyBeauty

FROM node:20-alpine AS builder
ARG APP_DIR
WORKDIR /app
COPY apps/${APP_DIR}/package*.json ./
RUN npm install --no-audit --no-fund --loglevel=error
COPY apps/${APP_DIR}/ .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/health || exit 1
