# SaasPlugin_vite — core

Portfólio de **SaaS verticais** (um produto por nicho), cada um app Vite/React independente, deployados via Docker Compose + Traefik num VPS. NÃO é monorepo pnpm — cada app em `apps/<Nome>` tem seu próprio package.json e node_modules.

## Apps (apps/)
- **NexvyBeauty** (nexvy-beauty) — salão/beleza
- **BarbeiroPro** (barbeiro-pro) — barbearia
- **NexvyGYM** — academia
- **NexvyFoods** — food/restaurante
- **NexvyOficinas** — oficina mecânica
- **NexvyOficinasLP** — landing page do Oficinas

Há ainda vários `*-ai-copy-*.zip` na raiz = exports/templates SaaS gerados (auto-flow, clinica-pro, odonto-control, imob-flow, gym-boss etc.) — material-fonte, não código ativo.

## Deploy / infra
- `infra/`: `Dockerfile.app`, `deploy-vps.sh`, `nginx.conf`, `stacks/`, `traefik/`
- `docker-compose.yml` na raiz: serviços nexvy-beauty, nexvy-oficinas, barbeiro-pro, nexvy-foods, nexvy-gym, traefik-public
- `Makefile`: targets `deploy-<app>` (cada um faz `pull` antes), `deploy-all`, `setup-vps`, `status`, `deploy-evolution`.

Detalhes: `mem:tech_stack`, `mem:suggested_commands`, `mem:conventions`, `mem:task_completion`.