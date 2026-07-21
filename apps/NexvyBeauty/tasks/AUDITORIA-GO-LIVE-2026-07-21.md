# AUDITORIA DE PRONTIDÃO — GO LIVE NexvyBeauty
> Gerada 2026-07-21 pela bateria `go-live-readiness` (6 auditores + refutação adversarial + juiz).
> 26 achados confirmados · 3 derrubados na verificação · 6 dimensões.
> B1/B2/B4 RE-CONFIRMADOS por query independente da sessão orquestradora (não só pelos agentes).

Os três achados mais decisivos estão confirmados pelas minhas próprias queries (não só pelo dossiê): os 4 RPCs de e-mail executáveis por `anon`, a carteira 0%-nomeada/16,5%-discável, e os 219 lints com 98 funções SECURITY DEFINER abertas a anon e ZERO tabela public sem RLS. Tenho base para o veredito.

---

## VEREDITO (1 linha)

**NÃO. Não libere anúncios e não declare GO LIVE oficial ainda** — o fluxo funcionou ao vivo, mas ainda existe um primitivo de **tomada de conta de qualquer usuário (inclusive super_admin) executável com a chave pública que está no bundle do front** (confirmei agora: `anon` executa `read_email_batch`/`enqueue_email` na fila de recuperação de senha), e o ativo central da oferta — a carteira de 84.194 "clientes" — é inutilizável (0% com nome real, 83,5% sem telefone discável, também confirmado agora).

---

## As 4 perguntas

| # | Pergunta do Marcelo | Resposta | Justificativa em 1 frase |
|---|---|---|---|
| a | Podemos liberar os anúncios? | **NÃO** | O Meta não recebe evento de **Compra** (otimização cega, sem ROAS) e o tráfego pago em escala baterá numa superfície com primitivo de takeover ainda aberto. |
| b | Agentes operando 100% prontos? | **NÃO (parcial)** | Os agentes de **plataforma** (Duda/Lia) estão vivos e provados; mas **todo agente de tenant** nasce sem rota de escalonamento para humano, sem escopo e com telemetria zerada. |
| c | Está tudo devidamente calibrado? | **NÃO** | Seeds corretos, mas a carteira é lixo (0% nome, 16,5% discável), o painel do 1º login mostra um "R$ recuperável" inventado e instável, e o wizard vende 3 agentes/usuários que o plano Essencial (1/1) não entrega. |
| d | Gaps de segurança de hoje cedo foram fechados? | **PARCIAL — quase todos, mas o que sobrou é pior** | 15 gaps nomeados fechados e provados; sobrou um primitivo de takeover tão grave quanto o P0 corrigido (fila de e-mail anon) + 5 webhooks mortos por config drift silencioso. |

---

## Bloqueadores confirmados (ordenados por "o que impede o quê")

### GATE 1 — impede o GO LIVE (não pode entrar NENHUM cliente real, nem orgânico)

| # | Bloqueador | Por que bloqueia | Menor ação que destrava |
|---|---|---|---|
| **B1** | **Fila de e-mail anon-executável → takeover de qualquer conta.** [Certo, re-verifiquei] `read_email_batch`, `enqueue_email`, `delete_email`, `move_to_dlq`: todos `security_definer=true` + `anon_can_execute=true` (controle negativo `recompute_lead_scores`=false confirma que o grant é real). E-mail está LIVE (15 enviados). | Com a chave pública do bundle: lê o link de recuperação de senha da vítima → toma a conta (inclusive super_admin); envia phishing de `@nexvybeauty.com.br`; apaga o e-mail de acesso de quem acabou de pagar. Viola a Seção 11.1 diretamente. | **1 migration, 3 linhas:** `REVOKE EXECUTE ON FUNCTION ... FROM PUBLIC, anon, authenticated` nas 4 funções (+ `register_human_seller`). `service_role` mantém o grant → `process-email-queue` segue drenando. Prova: PoC anon → 404 PGRST202. |
| **B2** | **A CLASSE não foi varrida: 98 funções SECURITY DEFINER anon-executáveis.** [Certo, re-verifiquei] advisor: 98 `anon_security_definer_function_executable` (+99 authenticated, +2 `security_definer_view` ERROR: `platform_vendas_por_seller`, `public_plans`). A auditoria de hoje tratou 7; amostra de 8 não-auditadas achou 2 bloqueadores (B1). | Amostragem, não varredura. A taxa de acerto (2 furos em 8) diz que há mais B1 escondidos. Com ads, o próximo se descobre por incidente com cliente real. | **1 query de inventário** classificando as 98 em: trigger-funcs (revogar), com-gate-verificado (manter), sem-gate (revogar/gatear). Critério binário: contador do advisor cai para um número justificado item a item. |
| **B3** | **`evolution-webhook` público sem prova criptográfica.** [Provável] Única "auth" é o nome da instância existir. Foi a EF que ingeriu os 84k clientes. | Quem souber o nome da instância (16 chars, prefixo "meu…") injeta mensagem no inbox, dispara o LLM e faz o **WhatsApp real do salão ENVIAR** para um número escolhido pelo atacante → risco de ban + exfil. | **Portar o gate que a casa já tem:** `evolution-history-sync` valida `instance_token` com `timingSafeEqual`. Copiar para o webhook principal. |
| **B4** | **Carteira de 84.194 é inutilizável.** [Certo, re-verifiquei] 84.194/84.194 nomes numéricos, só 13.885 (16,5%) discáveis, 45.237 (53,7%) são LIDs >13 dígitos, 0 e-mails. Causa-raiz reproduzida: `normalize_phone_br('313985414995065301')` devolve os 18 dígitos em vez de NULL. | A oferta É a carteira. Template sairia "Oi 82807086960834!"; disparo em massa = ~83% de falha de entrega = padrão que a Meta usa pra **banir o número da dona**; a dona vê 84k linhas de números → reembolso imediato. Sistêmico: todo tenant que conectar WhatsApp herda o bug. | Endurecer `normalize_phone_br` para retornar NULL fora de `^55[1-9][0-9]{9,10}$`; RPC parar de usar telefone como nome; purgar + re-ingerir instrumentado (medir `dropped_lid`). |
| **B5** | **Agente de tenant nasce cego e mudo para escalar.** [Provável] Os 3 agentes semeados têm `can_transfer=false`, `handoff_triggers=[]`, `cannot_do=[]`, `additional_prompt=''`. Três travas independentes fecham a saída para humano. | A cliente do salão que pedir "quero falar com a Juliana", reclamar ou cobrar errado **fala com o robô pra sempre**. Falha de produto na primeira coorte paga. | No seed: `can_transfer=true` + `handoff_triggers` mínimos; OU injetar o bloco `[HANDOFF:humano]` incondicionalmente em `buildAgentSystemPrompt` (o parser já existe). |
| **B6** | **Wizard vende 3 agentes/usuários que o Essencial não entrega, e o erro vira "warning" invisível.** [Provável] Trigger `trg_enforce_max_ai_agents` bloqueia (Essencial=1), mas `apply-onboarding` retorna `ok:true` com o erro em `warnings[]` e trava `onboarding_locked=true`. | Compradora Essencial (R$275, o mais vendido em ads frios) escolhe 3 agentes, vê "Implantação concluída", fica com 1. Sem erro, sem refazer. O E2E não pegou porque rodou no plano Teste (max=10). | Gatear os presets no limite do plano na UI + `apply-onboarding` separar `failures` de `warnings` (nunca `ok:true` em falha de quota). |

### GATE 2 — impede LIGAR ADS (adicional; pode operar orgânico sem isto, mas não gastar verba)

| # | Bloqueador | Por que bloqueia | Menor ação que destrava |
|---|---|---|---|
| **B7** | **Meta não recebe evento de COMPRA.** [Provável] `ads_capi_events=0`, nenhum cron chama `platform-capi-send`, nenhum código emite `sale_completed`/`pix_paid`, Pixel desligado no host `app.*` onde `/bem-vindo` cai. | Campanha otimiza só por "Lead" (clique no WhatsApp) → algoritmo compra curioso barato, sem medir ROAS dentro do Meta. É o único bloqueador **puramente de ads**. | **Primeiro um check de 2 min:** ver no Meta Events Manager se a **integração nativa do Cakto** já dispara Purchase (o checkout é hospedado lá). Se não, emitir `sale_completed` no `cakto-webhook` + cron para `platform-capi-send`. |
| **B8** | **Zero rate limit na borda + Leaked Password Protection off no console super-admin.** [Certo, re-verifiquei] advisor tem `auth_leaked_password_protection` (WARN); middleware `rate-limit-strict` existe mas não está nos routers. `gestao.nexvy.tech` (dados de TODAS as orgs) no mesmo container. | Ads atraem scraper/bot junto com cliente; credential stuffing contra o super-admin roda sem freio. Seção 11.2 exige rate limit como obrigatório. | Plugar `rate-limit-strict@file` nos 4 routers Beauty/gestão (4 linhas YAML) + ligar Leaked Password Protection (1 clique). |
| **B9** | **WhatsApp cai e ninguém é avisado + PITR desligado.** [Provável] Às 03:28 de hoje o WhatsApp caiu (401) e nenhum alerta disparou (3 falhas simultâneas: código retorna antes de alertar; Uptime Kuma com 0 canais; monitor checa raiz que responde 200 com instância morta). PITR off = até 24h de perda. | O modo de falha mais provável com ads (WhatsApp cai) é o único que não alerta → você paga por lead que morre em canal morto e descobre no faturamento do dia seguinte. | Alertar em `no_active_connection`; 1 canal no Uptime Kuma; monitor por `connectionStatus='open'`; ligar PITR. |

**Config drift crítico (transversal, corrigir junto do GATE 1):** [Provável] 5 webhooks declarados `verify_jwt=false` no config.toml estão devolvendo 401 de **gateway** em produção — `hotmart-webhook`, `doppus-webhook`, `facebook-leads-webhook`, `handle-email-unsubscribe`, `cakto-recovery-trigger`. Consequência: **venda Hotmart/Doppus morre em silêncio**, **Lead Ads da Meta nunca chega** (justo o que os ads vão alimentar), e **descadastro one-click quebrado** (risco LGPD Art.18 + reputação de domínio). O `cakto-webhook` (caminho da venda provada) está correto e vivo. Menor ação: redeploy das 5 com `--no-verify-jwt` + re-sondar (critério: 401 **de negócio**, nunca `UNAUTHORIZED_NO_AUTH_HEADER`).

**Aviso de preço (não é bloqueador, mas trava o criativo):** [Provável] os preços reais são **275/427/693**, não 217/387/687 (que está inclusive no briefing DESTA auditoria). Criativo que anunciar 217 bate num checkout de 275 = promessa quebrada + risco de reprovação por publicidade enganosa no Meta.

---

## Derrubados na verificação (e por quê) — concordo com as 3 refutações

| Achado derrubado | Por que caiu (e eu concordo) |
|---|---|
| "Pixel não recebe Purchase = BLOQUEADOR de código" | Erro de **camada**: o checkout é hospedado no **Cakto**, PIX é assíncrono; disparar Purchase no `/bem-vindo` (app.*) seria design errado. A ausência no código do app é correta-por-design. Sobra um item de **config/ops** (o Cakto está disparando Purchase?), que virou o B7 — não um defeito de repo. |
| "WhatsApp da única org paga está desconectado" | A "org paga" é uma **compra de teste interna** (`claudinho@nexvy.tech`, PIX R$10,99). O 401 25 min após o connect é o rabo esperado do próprio teste. Sessão de linked-device caindo é normal. Mas expôs o B9 real (falta de alerta), que **fica de pé**. |
| "restic do VPS não cobre o Supabase" | **Erro de categoria**: o banco de produção é Supabase Cloud **gerenciado** (backups nativos offsite), nunca foi responsabilidade do restic (que é backup de host). Sobra só o hardening de ligar PITR — dobrado no B9. |

O trabalho de refutação foi honesto: os três separaram "fato assustador" de "defeito real" corretamente. Isso me dá confiança de que os que **sobraram** como bloqueadores não são falso-positivo.

---

## O que NÃO foi verificado (e o quanto pesa)

| Lacuna | Peso | Por quê |
|---|---|---|
| **90 das 98 funções SECURITY DEFINER anon** não inspecionadas uma a uma | **ALTO** | Amostra de 8 achou 2 bloqueadores. É o maior risco residual: pode haver mais B1 aberto. Este é o motivo nº1 de o B2 existir como card. |
| **Discoverability do nome da instância** Evolution | **MÉDIO** | É o que separa B3 entre BLOQUEADOR e ALTO. Auth por obscuridade de identificador não é auth (fail-safe → tratei como bloqueador), mas se provar que o nome nunca vaza, cai para ALTO. |
| **Cakto está disparando Purchase nativo?** | **MÉDIO** | Se sim, o B7 se dissolve (vira só verificação). Custa 2 min no Events Manager — não tenho acesso ao Business Manager. |
| **Telegram de alerta entrega mesmo?** | **MÉDIO** | Secrets existem (updated_at 2026-07-10) mas nenhum alerta de teste foi disparado. Se o bot foi removido do grupo, TODO alerta de "venda-que-falhou" é engolido em silêncio. |
| **Cadeia completa do takeover** (recover→poll→reset senha) | **BAIXO agora** | Não executei (é sequestro real). Mas o **primitivo** está provado e eu re-confirmei o privilégio anon por query própria — o elo que faltava era o grant, e ele existe. |
| **Compra real no plano Essencial** | **MÉDIO** | O E2E rodou no plano Teste (max 8/6/10). O caminho do cliente pagante (limites 1/1/1) é provado por inspeção, não execução. |
| **Teste de carga** | **MÉDIO p/ ads** | Tudo medido com o sistema ocioso e 1 org. Volume é justamente o que os ads trazem. |
| **Cloudflare na frente do Traefik** | **BAIXO-MÉDIO** | Se houver WAF/rate-limit no CF, parte do B8 estaria mitigada por uma camada não inspecionada. |

Relatório que esconde a própria cegueira é pior que um incompleto assumido — o item que mais me incomoda é o primeiro: a superfície SECURITY DEFINER foi **amostrada, não varrida**.

---

## Rota mais curta para o GO LIVE (cards ordenados)

**GATE 1 — antes de qualquer cliente real (horas, não dias):**

1. **Migration REVOKE** nas 4 funções de fila + `register_human_seller`. Prova: `has_function_privilege('anon',...)` → false; PoC anon → 404; cron `process-email-queue` segue `processed>0`. *(B1)*
2. **Inventário das 98 SECURITY DEFINER** → revogar trigger-funcs, gatear/revogar as sem-gate, documentar remanescentes. Prova: contador do advisor cai para número justificado. *(B2)*
3. **Portar gate `instance_token`** para `evolution-webhook` + `platform-evolution-webhook`. Prova: POST sem token → 401; webhook real ainda ingere. *(B3)*
4. **Endurecer `normalize_phone_br`** (NULL fora do padrão BR) + RPC não usar telefone como nome + purgar/re-ingerir a org de teste. Prova: `normalize_phone_br('313985414995065301')` → NULL; re-ingestão mostra pushNames > 0. *(B4)*
5. **Semear handoff-para-humano** nos agentes de tenant. Prova: "quero falar com uma pessoa" → `needs_human`. *(B5)*
6. **Wizard gatear por plano** + `apply-onboarding` separar falha de warning. Prova: Essencial com 3 agentes → bloqueado/surfaceado, nunca `ok:true` silencioso. *(B6)*
7. **Redeploy dos 5 webhooks drifted** + re-sondar. Prova: cada um responde 401 de negócio, não `UNAUTHORIZED_NO_AUTH_HEADER`. *(config drift)*

**GATE 2 — antes de ligar 1 real em ads:**

8. **Rate limit nos 4 routers + Leaked Password Protection.** Prova: rajada → 429; advisor perde `auth_leaked_password_protection`. *(B8)*
9. **Alerta de WhatsApp-down + canal Uptime Kuma + PITR on.** Prova: matar instância de teste → Telegram dispara; PITR = enabled. *(B9)*
10. **Confirmar Purchase no Meta** (Cakto nativo ou emitir server-side). Prova: PIX de teste → Purchase visível no Events Manager. *(B7)*
11. **Alinhar todo criativo a 275/427/693** + verificação de domínio no Business Manager.
12. **1 compra real Essencial E2E** (ou cupom 100%). Prova: org nasce, wizard completa, 1 WhatsApp conecta, resumo bate 1:1.

Cards 1–7 = portão do GO LIVE orgânico. Cards 8–12 = portão de LIGAR ADS. A boa notícia que sustenta a pressa curta: a base criptográfica é boa, nenhuma tabela public está sem RLS (re-verifiquei), o bundle não vaza segredo, e o fluxo de compra→provisão→ingestão já rodou ponta-a-ponta. O que falta é **fechar buraco de autorização e limpar o ativo da oferta** — trabalho de horas, não de reescrita.
