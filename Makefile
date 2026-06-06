.PHONY: deploy-beauty deploy-oficinas deploy-barbeiro deploy-foods deploy-gym deploy-all setup-vps status

VPS=root@145.223.29.96
REMOTE_DIR=/opt/stacks/saasplugin-vite

setup-vps:
	ssh $(VPS) "mkdir -p $(REMOTE_DIR) && (git -C $(REMOTE_DIR) pull 2>/dev/null || git clone https://github.com/mfalcao09/SaasPlugin_vite.git $(REMOTE_DIR))"

pull:
	ssh $(VPS) "cd $(REMOTE_DIR) && git pull"

deploy-beauty: pull
	ssh $(VPS) "cd $(REMOTE_DIR) && docker compose build --no-cache nexvy-beauty && docker compose up -d nexvy-beauty"

deploy-oficinas: pull
	ssh $(VPS) "cd $(REMOTE_DIR) && docker compose build --no-cache nexvy-oficinas && docker compose up -d nexvy-oficinas"

deploy-barbeiro: pull
	ssh $(VPS) "cd $(REMOTE_DIR) && docker compose build --no-cache barbeiro-pro && docker compose up -d barbeiro-pro"

deploy-foods: pull
	ssh $(VPS) "cd $(REMOTE_DIR) && docker compose build --no-cache nexvy-foods && docker compose up -d nexvy-foods"

deploy-gym: pull
	ssh $(VPS) "cd $(REMOTE_DIR) && docker compose build --no-cache nexvy-gym && docker compose up -d nexvy-gym"

deploy-all: pull
	ssh $(VPS) "cd $(REMOTE_DIR) && docker compose build && docker compose up -d"

logs-%:
	ssh $(VPS) "docker logs -f nexvy-$* --tail=100"

status:
	ssh $(VPS) "docker ps --format 'table {{.Names}}\t{{.Status}}' | grep -E 'nexvy|barbeiro'"
