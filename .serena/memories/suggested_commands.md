# Comandos

## Dev de um app (rodar DENTRO de apps/<Nome>)
- `npm run dev` → `vite` (dev server)
- `npm run build` → `vite build`
- `npm run preview` → `vite preview`
- `npm run typecheck` → `tsc -b`
- `npm run lint` → `eslint .`

> Cada app é independente: `cd apps/NexvyBeauty && npm install` antes. NÃO há workspace pnpm na raiz; o gerenciador é npm por app.

## Deploy (rodar da RAIZ via Makefile)
- `make deploy-beauty` / `deploy-oficinas` / `deploy-oficinas-lp` / `deploy-barbeiro` / `deploy-foods` / `deploy-gym` (cada um roda `pull` antes)
- `make deploy-all` — todos
- `make setup-vps` — provisiona VPS
- `make status` — status dos containers
- `docker compose up -d <serviço>` para subir local/manual

## Darwin (macOS)
Shell zsh; `sed -i ''` (sufixo obrigatório); BSD grep (use `grep -E`).