.PHONY: deploy-beauty deploy-oficinas deploy-barbeiro deploy-foods deploy-gym deploy-all setup-vps pull status

VPS=root@145.223.29.96
REMOTE_DIR=/opt/stacks/saasplugin-vite

# Dominios por app. NexvyOficinas ja esta live.
# Preencha os demais antes de rodar o deploy correspondente.
DOMAIN_BEAUTY=
DOMAIN_BARBEIRO=
DOMAIN_FOODS=
DOMAIN_GYM=
DOMAIN_OFICINAS=nexvyoficinas.com.br

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

deploy-barbeiro: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh BarbeiroPro nexvy-barbeiro $(DOMAIN_BARBEIRO)"

deploy-foods: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyFoods nexvy-foods $(DOMAIN_FOODS)"

deploy-gym: pull
	ssh $(VPS) "$(REMOTE_DIR)/infra/deploy-vps.sh NexvyGYM nexvy-gym $(DOMAIN_GYM)"

# deploy-all: so reaproveita os alvos individuais (cada um valida seu DOMAIN).
# Defina DOMAIN_* antes; alvos sem dominio vao falhar no script (DOMAIN obrigatorio).
deploy-all: deploy-beauty deploy-oficinas deploy-barbeiro deploy-foods deploy-gym

logs-%:
	ssh $(VPS) "docker logs -f nexvy-$* --tail=100"

status:
	ssh $(VPS) "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'nexvy|barbeiro'"
