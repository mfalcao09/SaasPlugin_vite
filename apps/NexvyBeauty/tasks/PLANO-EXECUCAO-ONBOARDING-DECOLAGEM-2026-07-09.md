# PLANO DE EXECUÇÃO — Onboarding DECOLAGEM (handoff p/ sessão paralela)
> **2026-07-09 · origem: sessão 6cf2fc02 (Fable) · DESENHO APROVADO pelo Marcelo 07-09**
> **Doc-mãe (LEIA PRIMEIRO):** `apps/NexvyBeauty/tasks/DESENHO-ONBOARDING-NEXVYBEAUTY-2026-07-09.md` — este plano NÃO duplica o desenho; ele o operacionaliza. Divergência entre os dois → o DESENHO manda; registre errata aqui.
> **Regra de vida:** onda N+1 só abre com Review da N preenchido (no §14 do DESENHO). Toda entrega exige EVIDÊNCIA (commit + file:line + prova viva). Sessão morrer → handoff obrigatório com herdeiro nomeado.

---

## 0. CONTEXTO MÍNIMO PARA A SESSÃO EXECUTORA (self-contained)

- **Produto:** NexvyBeauty (SaaS salões). Repo `~/Projects/GitHub/SaasPlugin_vite` (branch base: `main`), app `apps/NexvyBeauty/`. Supabase projeto `fzhlbwhdejumkyqosuvq`.
- **O que já está PROVADO em prod (não reconstruir):** provisionamento pós-pagamento completo (S0: slug + 10 serviços + 4 automações off + 1 radar + founder_status; E2E provado 07-08; functions `cakto-webhook` v19 / `cakto-reprocess-order` v17 ACTIVE) · booking público c/ dispatcher WhatsApp · motor F2 (brain) com Duda/Bia + evals 12/12 · Lux L1-L3 no ar.
- **Fonte de verdade do backlog:** `LEVANTAMENTO-PENDENCIAS-REAIS-2026-07-08.md` (não confie em docs antigos — vários mentem; erratas em curso pela controller).
- **A estrela-guia (critério de aceite global):** ao fim do onboarding, o salão está **voando em piloto automático** — checklist 7/7 do DESENHO §5. Resultado efetivo, não sensação.

## 1. DECISÕES TRAVADAS (aprovação em bloco do Marcelo, 07-09 — não re-litigar)

| # | Decisão travada |
|---|---|
| D-1 | Demo NÃO dispara reativação pré-pagamento (ver é grátis, entregar é pago) |
| D-2 | `org.enabled_modules` DERIVA de `platform_plans.modules`; hardcode vira fallback defensivo |
| D-3 | TTL dos dados de demo = **7 dias** |
| D-4 | Kit v1 = **Recepcionista ("Lia") + Reativadora ("Vera")**; Cuidadora ("Bela") na v1.1 |
| D-5 | Wizard antigo (des-Lovable) ABSORVIDO como S5, reordenado QR-first — jamais 2 onboardings |
| D-6 | Pesquisar API de charge da Cakto; se não existir → gateway via NexvyPayments (Onda 4) |
| D-7 | Import CSV/contatos SEMPRE visível como reforço da carteira |
| D-8 | `feature_instagram` religa no **Premium+** quando IG/Messenger voltar |

## 2. FATO NOVO QUE MOLDA O G0 (decisão técnica 07-09)

O número de salão-teste é **Salvy NOVO** e **não há aparelho físico**. Implicações verificadas:
- **Evolution/Baileys NÃO cria conta WhatsApp** — só pareia conta existente. Caminhos: **(a)** Meta Cloud API = zero aparelho (OTP por SMS/voz que a Salvy recebe; caminho já provado no número de vendas) mas **sem history-sync**; **(b)** emulador Android + WhatsApp Business + OTP Salvy → QR na Evolution (testa Baileys; ToS cinzento; ban-risk alto se automatizar cedo).
- **Número novo = histórico zero** → serve pro ENCANAMENTO, não pra medir PROFUNDIDADE. Logo G0 = G0a + G0b.

---

## 3. ONDAS — entregáveis, checks e medição

### G0a — Encanamento do sync (com o número Salvy) · esforço P-M
**Entregáveis:**
1. Conta WhatsApp ativa no número Salvy via emulador Android + WhatsApp Business (OTP recebido na Salvy). ⚠️ NÃO automatizar envios em massa neste número (ban-risk).
2. Instância Evolution criada com `syncFullHistory: true` + browser Desktop (config da pesquisa 07-08); pareada por QR.
3. **Experimento ground-truth:** semear N≥50 mensagens conhecidas (2-3 chats, distribuídas em ≥3 dias) → desparear → re-parear → medir o que o `MESSAGES_SET` devolve contra o gabarito.
4. Consumer mínimo do webhook `MESSAGES_SET` gravando `{remoteJid, wa_timestamp, direction}` (fundação do S2).

**Checks binários:** ☐ instância `connected` ☐ ≥1 chunk `MESSAGES_SET` processado e gravado ☐ tabela ground-truth publicada (semeadas × recuperadas × % + `min(wa_timestamp)`).
**Medida do entregável:** % de recuperação do gabarito + latência do sync (scan→último chunk).

### G0b — Profundidade REAL (números velhos) · esforço P (medição)
**Entregáveis:** mesma medição em **3-5 números com histórico real** (candidatos: número pessoal do Marcelo em modo READ-ONLY — zero envio; salões parceiros com consentimento). Publicar tabela número×dias-de-profundidade×volume.
**Checks:** ☐ n≥3 números medidos ☐ mediana de profundidade conhecida ☐ copy do produto ratificada ("seus últimos meses", NUNCA "180 dias") no DESENHO §14.
**Bloqueio:** depende do Marcelo indicar os números. G0a NÃO espera G0b; Onda 1 pode abrir com G0a verde + G0b em paralelo.

### ONDA 1 — Golden path do funil 1 (pago → voando) · esforço G
**Entregáveis:**
1. **S1 on-the-fly:** 1º acesso pós-pagamento cria `evolution_instances` da org automaticamente + tela QR com consentimento LGPD (log em `consent_log` — criar tabela+migration) + 2 campos (nome do salão, sub-vertical).
2. **S2 live:** pipeline chunks→banco com `wa_timestamp` (reusa consumer do G0a), idempotente por wamid.
3. **S4:** derivação da carteira — dedupe por telefone normalizado (`phone.ts` existe) → upsert `clientes` (nome do pushName, última visita = último `wa_timestamp` inbound).
4. **S3 Home de Valor:** card "R$ X recuperável" + top-3 com mensagem pronta + AHA parcial (número subindo enquanto chunks chegam). Base: specs VITRINE/PLANO-V1 (§10 do DESENHO).
5. **Disparo 1-clique COM RAMPA + CIRCUIT-BREAKER** (reusa motor de reativação existente). ⚠️ **NÃO é afterthought — é o vetor de ban nº1 do dia-0** (instância Baileys recém-conectada disparando em massa parece bot sequestrado, mesmo em número velho). Guardrail obrigatório [heurística de ecossistema via sessão BDR `local_772a74d4`; **NÃO são números oficiais do WhatsApp — validar; o gate é o SINAL, não a tabela**]:
   - **Warm-up da instância 24-48h** antes do 1º lote (deixar existir com tráfego 2-vias orgânico — a dona respondendo cliente normal). Conectar-e-metralhar = red flag máximo.
   - **Rampa:** D1 ~20-30 msgs · D2 ~40-50 · +50-80%/dia SE sinal limpo · platô em poucas centenas/dia (número estabelecido). Números são chão, não teto.
   - **Jitter 30s-3min** entre envios (NUNCA cadência fixa) · **só horário comercial** no fuso da cliente (zero 23h-8h).
   - **Ordem (alavanca subestimada):** dormente mais RECENTE primeiro, mais antiga por último — resposta positiva constrói reputação, bloqueio/silêncio destrói.
   - **Sem link nas 1ªs mensagens** (link em número em rampa = sinal de spam; aquece com texto, link só após ela responder) · **conteúdo personalizado** (nome + referência à relação real) + **opt-out claro**.
   - **Convide 2 vias** (WhatsApp favorece número que RECEBE — a reativação puxa réplica, não broadcasta).
   - **Circuit-breaker OBRIGATÓRIO:** monitora taxa de bloqueio + não-entrega (2-checks-que-nunca-ficam-azuis); subiu → PAUSA automática. **Convergir o schema com a sessão BDR** (mesmo guardrail serve o número oficial cold DELA e o do salão warm MEU — módulo compartilhável `shared/outbound-guardrail`, cada frente pluga sua política).
   - **Isolação por-tenant** (cada salão = centenas de contatos, não milhões) é a maior mitigação nativa.
   - **COPY DO ONBOARDING:** vender "gerenciado com rampa + circuit-breaker", **NUNCA "imune a ban"** — Baileys é cinza de ToS; rampa reduz o risco, não zera.
   - **CONTRATO DO MÓDULO `shared/outbound-guardrail`** (co-desenhado com a BDR `local_772a74d4`; fonte: spec dela §3.1 — validar ao abrir a Onda 1, ANTES de fechar o schema, com ping pra ela): **núcleo burro** = recebe `Signal` + `Policy` → emite `pause`/`resume`/`alert`, mantém estado verde/amarelo/vermelho com histerese (não sabe nada de WhatsApp) · **adapter de sinal por frente** (o meu: taxa de bloqueio + não-entrega do Baileys; o dela: quality-rating + report-rate da Graph) · **política por frente** (thresholds/janela próprios — meu perfil = warm+spike; dela = cold+quality) · **kill-switch por frente** (o `pause` aciona a parada da MINHA operação = disparo Baileys). Formatos TRAVADOS (mútuo com BDR 07-09): `Signal {ts, metric_id, value, window}` (série normalizada — o núcleo não conhece a origem) · `Policy {metric_id, yellow_at, red_at, window, cooldown}` (histerese via cooldown). **Convenção de direção:** **maior = pior** → breach quando `value ≥ threshold`; métrica "menor = pior" (ex.: taxa de ENTREGA, cair é ruim) é invertida NO adapter (`1 - rate`) antes de virar `Signal` → o núcleo nunca conhece a direção de cada métrica, só compara `value ≥ threshold`. Não construir solo — módulo compartilhado com a frente de aquisição fria (ping pra BDR ANTES de fechar o schema na Onda 1).
6. **D-2:** provisionamento passa a derivar `enabled_modules` de `plan.modules` (+ popular a coluna nos 3 planos; hoje só Ultra tem) — migration + edit em `cakto-plan-provisioning.ts` + redeploy + verificação de versão ACTIVE.
7. **Auditoria de quotas:** verificar enforcement de cada `max_*` (hooks `usePlanGating`/`usePlanModules`); relatório curto do que barra e do que não barra.

**Checks binários:** ☐ org de teste sai do pagamento à 1ª reativação disparada SEM toque humano ☐ carteira ≥ nº de contatos únicos do zap de teste ☐ checklist ≥5/7 ☐ `enabled_modules` da org de teste == `plan.modules` ☐ relatório de quotas publicado.
**Medida:** `time_to_aha` (alvo <10min com sync típico) · `scan_rate` instrumentado.

### ONDA 2 — Setup leve + Tripulação · esforço M-G
**Entregáveis:** wizard antigo reordenado QR-first e absorvido como S5 (D-5) · pergunta única de revenda (SIM→rota de cadastro / NÃO→segue) · **galeria do kit do salão** com Lia + Vera (D-4): templates instanciáveis sobre o motor F2, **campo de nomeação** (nome entra no system prompt + assinatura), guardrails (preço/serviço SÓ do catálogo; escala pra dona em pedido-humano/reclamação) · evals 5-10 goldens POR agente (rito da Fábrica) · gating por `max_ai_agents`.
**Checks:** ☐ agente nomeado responde msg de teste no zap da org ☐ eval ≥90% + caso sabotado falha ☐ Essencial trava no 2º agente ☐ wizard não existe mais como fluxo separado.
**Medida:** `tripulacao_ativada` · `checklist_7de7` instrumentados.

### ONDA 3 — Funil 2 (demo como arma) · esforço G
**Entregáveis (nesta ordem):** **spike da promoção demo→live** (renomear instância sem derrubar sessão Baileys — é O risco; se falhar, fallback = re-scan só no funil 2 com copy honesta) · pool de demo-tenants efêmeros (N slots, fila, rate-limit IP/telefone) · consentimento pré-scan + `consent_log` · agregados em memória (contatos/sumidos/R$; exemplos mascarados; nada persiste) · Home de Valor com véu (ações bloqueadas) · CTA→checkout com plano sugerido pelo tamanho da carteira · pós-pagamento: promoção da instância + recálculo persistindo (S4) · TTL 7d (D-3) com purge + log de exclusão.
**Checks:** ☐ 1 demo completa→pagamento→org nasce com a MESMA conexão ☐ 1 demo abandonada→zerada no TTL com log ☐ zero linhas em `clientes` originadas de demo não-convertida.
**Medida:** `aha_to_payment` · integridade LGPD (auditoria de purge).

### ONDA 4 — Billing nosso · esforço G
**Entregáveis:** resposta D-6 (pesquisa API Cakto: charge on-demand? tokenização?) → ADR curto · arquitetura `checkout.nexvybeauty.com.br` (processador plugável; se Cakto não suportar → ponte NexvyPayments) · **dunning**: retry→aviso (WhatsApp do salão)→grace lendo `grace_period_days`→suspensão (`plan_status`) · perfil coletado no NOSSO checkout.
**Checks:** ☐ ADR publicado ☐ 1 assinatura E2E em staging ☐ 1 falha de renovação percorrendo o dunning inteiro ☐ suspensão reversível provada (paga→volta).
**Medida:** taxa de recuperação de dunning (instrumentar desde o dia 1).

---

## 4. GUARDRAILS DA SESSÃO EXECUTORA (invioláveis)

1. **Porte = cópia com tema, NUNCA "simplificação"** (lei do Marcelo 01/07; tripwire M3 da controller vigia).
2. **§11.1:** browser NUNCA fala com serviços internos — sempre edge/BFF server-side; secrets só em env/cofre, jamais em chat/código/log.
3. **Never-touch-alone:** AffiliatesPanel, módulo ERP compartilhado, `nexvy-agents` (LAW é cliente nº1 de runtime — qualquer restart do agents-engine exige smoke antes/depois).
4. **Nada é "done" sem evidência** (commit + file:line + prova viva: curl/screenshot/query). Sem prova → `in_progress`.
5. **Deploy de edge = redeploy explícito + verificação de versão ACTIVE** (merged ≠ deployed ≠ tested — lição 07-08).
6. **Docs:** ao superar qualquer doc antigo, errata datada (padrão 🩹 da controller); Review do DESENHO §14 preenchido ao fechar cada onda.
7. **Branch:** trabalhar em `feat/onboarding-decolagem-onda<N>`; PR pra main por onda; nunca commit direto em main.

## 5. DEPENDÊNCIAS EXTERNAS (fila HITL do Marcelo)

| Item | Destrava | Status |
|---|---|---|
| Números velhos p/ G0b (3-5, read-only) | medição de profundidade real | ⏳ aguardando Marcelo |
| ~~Local da instância Evolution~~ | G0a/S2 | ✅ RESPONDIDO 07-09: **VPS KVM2** (Hostinger, IP 145.223.29.96) — SSH `root@145.223.29.96`; achar a stack Evolution em `/opt/stacks/` (docker ps) |
| Secrets `TELEGRAM_ALERT_BOT_TOKEN`/`CHAT_ID` | alarme de venda perdida (C1) | ⏳ 5 min |
| OTP Salvy no registro do WhatsApp (G0a) | criação da conta teste | ⏳ presença pontual |
| Aprovação de plano de pesquisa D-6 (Cakto API) | Onda 4 | pode rodar sem ele (pesquisa) |

## 6. RISCOS (com resposta pronta)

| Risco | Sev | Resposta |
|---|---|---|
| Ban do número fresco no Baileys | ALTA | G0a é read-mostly; zero automação de envio no número novo; rampa de volume; Cloud API como blindagem paga (DESENHO §9) |
| Profundidade rasa do sync | MÉDIA | plano B pronto: carteira nasce do que veio + cresce em tempo real + CSV (D-7); copy nunca promete 180d |
| Promoção demo→live falha | MÉDIA | spike PRIMEIRO na Onda 3; fallback re-scan com copy honesta |
| Emulador (ToS) | MÉDIA | uso interno de teste apenas; produção real usa aparelho da dona (fluxo normal) |
| Sessão executora morre | MÉDIA | handoff obrigatório + herdeiro nomeado (governança anti-morte) |

## 7. PROTOCOLO DE REPORTE
- Fim de cada onda: preencher Review no DESENHO §14 + atualizar dossiê P1 (`project_nexvybeauty_golive_autopilot_seeds_2026-07-06.md`) via controladora + reportar ao Marcelo com a régua dele: **"o que ficou FUNCIONANDO?"**
- Métricas §13 do DESENHO instrumentadas desde a Onda 1 (não deixar pra depois).

## 8. ORDEM DE EXECUÇÃO SUGERIDA
`G0a` → *(G0b em paralelo quando Marcelo indicar números)* → `Onda 1` → `Onda 2` → `Onda 3` → `Onda 4`. Complexidade total: **ALTA** (4 ondas G/M + 2 PoCs); primeira vitória visível (Onda 1 verde) é o marco que importa.

---
*Par canônico: PLANO-EXECUCAO-ONBOARDING-DECOLAGEM-2026-07-09.html · Status: PRONTO PARA HANDOFF — aguardando "vai" do Marcelo para a sessão paralela iniciar no G0a.*
