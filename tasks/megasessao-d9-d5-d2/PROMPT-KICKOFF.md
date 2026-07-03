# Prompt de kickoff da megasessão (colar na nova sessão, cwd = ~/Projects/GitHub)

---

/loop Megasessão D9+D5+D2 do CRM do grupo (SaasPlugin_vite/apps/NexvyBeauty).

**Fonte única de verdade:** `SaasPlugin_vite/tasks/megasessao-d9-d5-d2/plano-execucao.md` — leia INTEIRO antes de qualquer ação (contexto, máxima de desacoplamento, regras de serialização, traps do D7, fatias com CHECK binário). Esse arquivo é o ESTADO do loop: marque checkbox + evidência a cada fatia concluída e registre bloqueios nele.

**Missão:** executar as 3 frentes em loop contínuo — D9 (web push + Telegram), D5 (Mia ações+memória, botões inline) e D2 (builders: meta F1+Widget+Flow nesta sessão). Prioridade D9 → D5 → D2; quando uma frente bloquear em átomo humano, avance a próxima. Fundações já aplicadas em prod (tabelas push + mia, commits 67eaf33/ca3a745). D7 está shipped — não retrabalhar.

**Regras inegociáveis:**
1. Toda fatia só é done com o CHECK binário verde (gate `tasks/d3-multiproduto/verify.sh` + smoke real quando indicado). Duvidou, rode o gate.
2. Serializar no loop principal: migrations, generate_typescript_types, deploy de edges, deploy VPS, arquivos compartilhados. Paralelizar só port de código isolado (subagentes/worktree), cada um terminando com gate --fast verde.
3. Modelo canônico = `.vendus-src-reference/` (port 1:1 desacoplado, tabelas platform_crm_*, zero organization_id, RLS super_admin). Fronteira tenant↔plataforma SEMPRE zero.
4. Commits pequenos por fatia (`feat(crm-grupo): ...`), push ao fechar marcos. **Deploys ao VPS estão PRÉ-AUTORIZADOS por mim nesta instrução** (gestao.nexvy.tech / app.nexvybeauty.com.br), sempre com anti-phantom nos 2 hosts.
5. Segredos: nunca imprimir valor (presença/tamanho só). VAPID private + TELEGRAM_BOT_TOKEN via `supabase secrets set` sem eco.
6. Dados de teste: sempre limpar após smoke (padrão do smoke D7).

**Comunicação comigo (Telegram — Slice 3 da sessão paralela):**
- No início da sessão: rode `~/.claude/hooks/cc-remote status`; se DESLIGADO, ligue com `~/.claude/hooks/cc-remote on`. Com isso, cada fim de turno + pedidos de permissão chegam no meu Telegram automaticamente (hook 3a `cc-telegram-notify.sh`, JÁ LIVE).
- Se `~/.claude/hooks/.cc-control.env` existir, minhas respostas no Telegram chegam INJETADAS no turno (hook 3b `cc-telegram-control.sh`, decision:block+additionalContext) — trate-as como resposta minha na sessão. (Depende do bot de controle dedicado — átomo humano meu no KVM4.)
- Para marcos/bloqueios NO MEIO de execuções longas (hooks só disparam no fim do turno): `bash SaasPlugin_vite/tasks/megasessao-d9-d5-d2/notify-marcelo.sh "msg"` — decisão bloqueante · átomo humano (ex.: D9.8 permitir push) · marco concluído · falha travada >2 tentativas. Não spammar.

**Ritmo do loop:** a cada iteração, reler o plano → próxima fatia → executar → CHECK → commit → atualizar plano → (se marco/bloqueio) notify. Use ScheduleWakeup para pacing quando aguardar builds/átomos humanos. Se o contexto compactar, o plano-execucao.md é o estado — retome do checkbox.

Comece agora: leia o plano e execute a primeira fatia (D9.1).

---
