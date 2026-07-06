# VEREDITO DO PLANNER ADVERSARIAL (Etapa 3a) — Vendus Cobranças — 2026-07-06

> Consumidor: consolidador da Etapa 3b (spec auditável) + Etapa 4. Veredito: **SIM-COM-CORREÇÕES**.
> NOTA DA SESSÃO PRINCIPAL: este veredito foi produzido ANTES do adendo §H do notaas-report.md.
> O adendo SUPERSEDE a quebra #3: sandbox NotaAS EXISTE (ambiente de homologação com toggle
> "Ativar Produção" na plataforma). A correção 3 muda de "descobrir se há sandbox" para
> "critérios de F3 rodam em homologação; cutover de produção é gate". Também novo do adendo:
> plano SaaS Pro = 2.000 notas/mês < teto D5 (5.000) → criar gate G-QUOTA (upgrade de plano
> NotaAS antes do go-live full do case #1); campo `referencia` confirmado no payload de emissão
> (chave do outbox); endpoints canônicos confirmados na seção H.2.

## Resultado central
Confrontadas 9 alegações do blueprint contra código/insumo real. As citações de reuso CONFEREM
(meta-crypto.ts:25-51 ✅ · email_infra.sql:131-175 wrappers pgmq genéricos parametrizados ✅ ·
cakto-webhook:209-212 echo ✅ · registry.ts:5-17 extensão trivial ✅ · meta-crypto.ts:11 chave
global única = risco A1 real ✅). A premissa falsa é de ESFORÇO: "portar é fácil / adapter é fino".

## Os 5 pontos de quebra (ranqueados)

**#1 [Provável, ALTO] mTLS com certificado de cliente em Supabase Edge Functions NÃO PROVADO.**
c6.py:160-162,184-194: TODA chamada C6 (incl. /v1/auth) exige mTLS. fetch padrão Deno não expõe
client cert por-request; Deno.createHttpClient({cert,key}) é unstable e possivelmente indisponível
no runtime gerenciado Supabase. Se indisponível → trilho C6 não roda em edge function.
CORREÇÃO A0: PoC mTLS = PRIMEIRO entregável de F2, gate binário (POST /v1/auth sandbox de dentro
de edge function deployada → 200 + access_token). Fallback: micro-serviço C6 fora do edge
(colide com P4 — decidir antes de F2). O GET de confirmação do webhook C6 TAMBÉM depende de mTLS
(dependência encadeada com #5).

**#2 [Certo, ALTO] Motor cadence-* é lead-cêntrico; régua por fatura é CONSTRUÇÃO NOVA.**
(a) Stop errado: cadence-on-response:63-64 para enrollments por lead_id — payer com 3 faturas
abertas: pagar 1 pararia as 3 réguas. source_ref existe no enrollment (cadence-enroll:118) mas
tick/on-response não o leem. (b) Mensagem sem contexto de fatura: cadence-tick:298-312 chama
manual-outreach só com lead_ids — não sabe qual fatura/valor/vencimento. (c) Agenda por delay
(computeScheduledAt:35-41 = now+delay), não por due_date — D-3 relativo a vencimento requer
lógica nova. Reusa-se o EXECUTOR de step_runs; trigger+contexto+stop são novos. F4 redimensionar.

**#3 [superado pelo adendo H — ver nota acima] Critérios F3 assumiam sandbox não documentado.**
Resolvido: homologação existe. Manter: separação explícita homologação vs produção nos critérios;
"Ativar Produção" é gate humano.

**#4 [Provável, médio] verify_jwt dos webhooks públicos sem dono.**
config.toml tem 1 linha (project_id = "bwjtesqybhthahmwkbvo") — NÃO "0 linhas" como no as-is-map;
o mecanismo verify_jwt=false por função não está versionado no repo (vive no deploy Lovable/dashboard).
c6-webhook e notaas-webhook precisam ser públicos. CORREÇÃO A6: entregável explícito — curl externo
sem JWT em c6-webhook/notaas-webhook → 200; funções de dinheiro → 401.

**#5 [Provável, baixo-médio] "Idempotência nativa C6" superestimada.**
c6.py:288-323 = retry do CLIENTE com external_reference_id estável; dedup server-side do C6 nunca
foi testada em produção (smoke 19/19 offline). Webhook C6 sem assinatura → GET de confirmação é a
única defesa, e usa mTLS (ver #1).

## Lacunas de escopo (11) — "escopo consciente"
1. multa/juros: DDL invoices SEM multa_pct/juros_pct/valor_multa/valor_juros (ERP tem — portar).
2. 2ª via de boleto vencido = NOVA emissão com novo vencimento → estado "substituida/reemitida"
   ausente na máquina de estados; nova referencia/nosso_numero.
3. Tool `renegociar` não especifica O QUE materializa (fatura c/ desconto? N parcelas? novo
   contrato?) — a tool mais complexa é a menos especificada.
4. Acordo de parcelamento / fatura-mãe→parcelas: sem tabela.
5. Sobrepagamento (bolepix pago 2× boleto+PIX) / estorno: não tratado; fiscalmente relevante.
6. Multi-CNPJ por tenant bloqueado por UNIQUE(org, provider) — trocar por UNIQUE(org, provider,
   cnpj) custa 1 coluna, OU declarar limitação v1 explícita.
7. Pagador sem WhatsApp: sem fallback e-mail (pgmq ocioso p/ isso) — incluir ou subtrair explícito.
8. Vencimento em feriado/fim de semana → dia útil seguinte: business_hours/holidays existem no CRM
   e não estão conectados.
9. Retenções (issRetido, ISS/PIS/COFINS/IRRF): payload NotaAS aceita; modelo não tem onde declarar.
   Case #2 (cowork B2B) precisa.
10. LGPD do A1: chave-mestra global única (meta-crypto.ts:11) custodiando A1 de N tenants — ok p/
    1-2 tenants, inaceitável ao escalar; falta gate "derivação por-org antes de N tenants".
11. Suporte/admin burden não estimado (renovação anual A1 por tenant, notas em erro, cancelamentos,
    municípios não cobertos) — incorporar em horas/mês na unit economics.

## Auditoria RLS por amostragem (9 tabelas pós-baseline)
cadences/cadence_steps/cadence_enrollments/cadence_step_runs (20260529113339), payment_links
(20260427171243), webchat_conversations/messages/widgets/agent_configs (20260110185851): TODAS com
RLS ON e policies org-scoped. Hipótese "RLS ausente em massa" NÃO se sustentou. Risco real: policies
PERMISSIVAS — ex.: webchat_conversations INSERT WITH CHECK (true) (":234-236"). Item 0.3 deve varrer
as ~54 por permissividade, não só ausência.

## As 13 correções numeradas
1. [BLOQUEADOR] A0 PoC mTLS edge→C6 antes de qualquer coisa do trilho C6; fallback muda arquitetura.
2. [BLOQUEADOR] Reescrever decisão 7: trigger+contexto+stop por FATURA = construção nova;
   invoice_id no enrollment (source_ref estruturado); tick passa fatura ao outreach; stop por fatura.
3. G-NOTAAS: superado (sandbox existe) → critérios F3 em homologação; "Ativar Produção" = gate.
4. Entregável verify_jwt explícito (A6) + corrigir "config.toml vazio" (tem 1 linha).
5. Split G-C6 → G-C6-SANDBOX (dev F2) e G-C6-PROD (conta PJ + tarifa negociada; gate do Marco 2).
6. DDL invoices += multa_pct, juros_pct, valor_multa, valor_juros, valor_original; estado
   substituida/reemitida.
7. Especificar `renegociar` (o que materializa) antes de F4; tabela de acordo se parcelar.
8. Multi-CNPJ: UNIQUE(org, provider, cnpj) OU limitação v1 declarada.
9. Fallback e-mail p/ pagador sem WhatsApp (reusa pgmq) OU subtração explícita.
10. Conectar business_hours/holidays ao cálculo de vencimento (dia útil).
11. Campos de retenção no contrato/fatura (issRetido, ISS/PIS/COFINS/IRRF).
12. Estimar admin burden (h/mês) e incorporar na unit economics.
13. Item 0.3 vira: RLS ON + caça a policies permissivas (WITH CHECK true) nas ~54 tabelas.

## Tabela de entregáveis auditáveis (base para a matriz do spec)
| ID | Descrição | Critério binário | Aferição | Gate HITL |
|---|---|---|---|---|
| A0 | PoC mTLS edge→C6 | POST /v1/auth sandbox de dentro de EF deployada → 200+token | CURL | Marcelo decide arquitetura se falhar |
| A1 | Remover admin-provision-users | ls → não existe; grep front → 0 | INSP+CI | Revisor |
| A2 | Helper require-caller-org | org do body → 403; sem JWT → 401 | TA | — |
| A3 | Auditoria RLS ~54 tabelas (ON + sem WITH CHECK true indevido) | 100% ON; permissivas listadas/justificadas | VEXT | Revisor |
| A4 | Cofre billing_credentials cifrado | SELECT anon → 0 linhas; round-trip v1: = plaintext | TA | — |
| A5 | DDL modelo + multa/juros + retenção + cnpj | INSERT cross-org rejeitado; campos presentes | TA+INSP | — |
| A6 | verify_jwt=false p/ webhooks C6/NotaAS | curl s/ JWT webhook → 200; c6-billing → 401 | CURL | — |
| B1 | c6-billing (pós-A0) | sandbox: Bolepix → nosso_numero+linha+QR; consulta idempotente | CURL | G-C6-SANDBOX |
| B2 | Outbox billing_outbox (wrappers pgmq) | enqueue/read/move_to_dlq OK | TA | — |
| B3 | invoice-batch idempotente | 2× mesma competência → 0 duplicadas | TA | — |
| B4 | c6-webhook + GET confirmação (mTLS) | pago → paga; repetido → idempotente | TA+CURL | — |
| B5 | 1ª fatura boleto+PIX PROD | boleto real emitido | INSP | G-C6-PROD |
| C1 | notaas-emit lote (homologação) | lote 100 → 202; 101 → split 2 | TA/CURL homolog | G-NOTAAS-resid + G-A1 |
| C2 | notaas-webhook HMAC+dedup | assinatura inválida rejeitada; delivery repetido 1× | TA | — |
| C3 | Imutabilidade fiscal | DELETE nota emitida rejeitado | TA | — |
| D1 | Trigger régua POR FATURA (invoice_id no enrollment) | billing_events(emitida) → enrollment c/ invoice_id; msg cita fatura/valor | TA | — |
| D2 | Agendamento por due_date (D-3 = venc-3d) | fatura venc D+3 → step D-3 agendado hoje | TA | — |
| D3 | Stop POR FATURA | payer 2 faturas, paga 1 → régua da outra CONTINUA | TA | — |
| D4 | Régua Meta prod + opt-in | template aprovado; sem opt-in → não envia | CURL+INSP | G-META-TPL |
| D5 | 4 tools IA + renegociar especificada | 2ª via → novo boleto; renegociar cria [definido]; desconto>alçada → handoff | TA | — |
| E1 | Conciliação + fallback e-mail | baixa manual grava evento; sem WhatsApp → e-mail | TA | — |
| E2 | LGPD mínimo + audit PII | CRUD payers → audit; erasure anonimiza mantendo fiscal | TA | — |
| E3 | Instrumentação custo real/fatura + limites Lovable | custo/fatura medido; invocations/mês visível | INSP | G-INFRA |
| E4 | Prova horizontalidade case #2 | cowork onboarded sem migration nova | INSP | G-PILOTO |
