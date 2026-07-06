.PHONY: deploy-beauty deploy-oficinas deploy-oficinas-lp deploy-barbeiro deploy-foods deploy-gym deploy-payments deploy-all deploy-evolution setup-vps pull status

VPS=vps-hostinger
REMOTE_DIR=/opt/stacks/saasplugin-vite

# Dominios por app (descobertos via CF API + DNS criados 2026-06-06).
DOMAIN_BEAUTY=nexvybeauty.com.br
DOMAIN_BARBEIRO=nexvybarbershop.com.br
DOMAIN_FOODS=nexvyfood.com.br
DOMAIN_GYM=nexvygym.com.br
DOMAIN_OFICINAS=nexvyoficinas.com.br
DOMAIN_PAYMENTS=nexvypayments.com.br

setup-vps:
	ssh $(VPS) "mkdir -p $(REMOTE_DIR) && (git -C $(REMOTE_DIR) pull 2>/dev/null || git clone https://github.com/mfalcao09/SaasPlugin_vite.git $(REMOTE_DIR))"

pull:
	ssh $(VPS) "cd $(REMOTE_DIR) && git pull && chmod +x infra/deploy-vps.sh"

# Cada deploy: build + (re)run na rede traefik-public + render do template
# Traefik (file provider, hot-reload). Ver infra/deploy-vps.sh.

deploy-beauty: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyBeauty nexvy-beauty $(DOMAIN_BEAUTY)"

deploy-oficinas: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyOficinas nexvy-oficinas-vite $(DOMAIN_OFICINAS)"

# Landing page (apex + www). SaaS Oficinas vai em app.$(DOMAIN_OFICINAS) (alvo deploy-oficinas).
deploy-oficinas-lp: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyOficinasLP nexvy-oficinas-lp $(DOMAIN_OFICINAS)"

deploy-barbeiro: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh BarbeiroPro nexvy-barbeiro $(DOMAIN_BARBEIRO)"

deploy-foods: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyFoods nexvy-foods $(DOMAIN_FOODS)"

deploy-gym: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyGYM nexvy-gym $(DOMAIN_GYM)"

deploy-payments: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyPayments nexvy-payments $(DOMAIN_PAYMENTS)"

# deploy-all: so reaproveita os alvos individuais (cada um valida seu DOMAIN).
# Defina DOMAIN_* antes; alvos sem dominio vao falhar no script (DOMAIN obrigatorio).
deploy-all: deploy-beauty deploy-oficinas deploy-barbeiro deploy-foods deploy-gym

# Evolution API compartilhada (infra/stacks/evolution-api/)
# Pré-requisito: .env em /opt/stacks/evolution-api/.env no VPS
deploy-evolution: pull
	ssh $(VPS) "bash $(REMOTE_DIR)/infra/stacks/evolution-api/deploy.sh"

logs-%:
	ssh $(VPS) "docker logs -f nexvy-$* --tail=100"

status:
	ssh $(VPS) "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'nexvy|barbeiro'"
