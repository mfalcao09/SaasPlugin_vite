# Regra — Opt-out → Remarketing (marca)

Atualizado: 2026-09-16

## Quando

Lead responde com opt-out explícito, incluindo (não limitado a):

- "não tenho interesse" / "no momento não tenho interesse"
- "sem interesse"
- SAIR / PARE / STOP / descadastrar / não me mande…

Classificador: `opt-out.ts` → `inbound-plan.ts` (`intent=opt_out`).

## O que fazer agora

1. **Responder educado (1 bolha)** —  
   `Sem problemas, {usuário}! Vou deixar aqui o nosso site para você dar uma olhada com calma, e se tiver interesse é só nos chamar no whatsapp novamente. Combinado?`
2. **Enviar link** — `https://nexvybeauty.com.br` (preview OG: título + hero atuais)
3. **Opt-out** — gravar `platform_crm_lead_optout` (`reason=runtime_opt_out_remarketing`)
4. **Parar cadência** — fila `opted_out`, `next_followup_at=null`
5. **Silenciar brain** — após o fechamento acima
6. **Marcar remarketing** — `conversation.metadata.remarketing=true` (+ `remarketing_reason`, `remarketing_at`)
7. **Não recontactar** na cold atual — `do_not_contact=true`

## O que NÃO fazer ainda

- Regra de **quando** remarcar (D+N, oferta, canal) — **TBD**
- Disparo automático de remarketing

Ver pacote completo: `RULES-AUTOMATED-COLD.md` (R1 retomada incompleta + R2).

## Completar script se inbound no meio da abordagem

Se a bolha 1 (opening) já saiu e ainda faltam bolhas 2–4:

- **Não abortar** a sequência APRESENTAR
- Completar as bolhas restantes
- Só depois liberar atendimento humano/brain

Código: `updateApresentarOnInbound` em `platform-cold-outreach`.

---

## Caso real — Joice (2026-09-15)

- Inbound: "No momento não tenho interesse" + "Talvez em outra oportunidade"
- Fechamento humano (R2 + site): lead respondeu "Pode deixar" / "Obrigada"
- Metadata: `remarketing=true`, `do_not_contact=true`
- Aprendizado materializado: `LEARNING-CASE-JOICE-OPT-OUT.md` + `evidence/PRD-09/learning-joice-opt-out-20260915.json`


---

## Path A — reabertura inteligente (policy 2026-09-16)

Fonte: PRD-10 + Sol `sol-plan-reopen-path-A.md`. Opção B.

### Soft vs hard
- **Soft** (“não tenho interesse”, “talvez outra oportunidade”): R2 (quando flag ON) + remarketing_eligible + cold_suppressed. **Não** é “Camila muda para sempre”.
- **Hard** (PARE/SAIR/STOP/descadastrar): `dnc_hard=true`. Classificador de reopen **nunca** limpa.

### Pós-R2 / pós-fechamento
- Janela farewell **48h**: msgs curtas (“Pode deixar”, “Obrigada”, “valeu”) → `farewell_ack` → **0 outbound**, conversa permanece `closed`.
- `reopen_intent` explícito → pode reabrir reply + **revogar soft** (liberar cold) **sem** reenqueue/blast; `cold_not_before = +24h`.
- `ambiguous` → no máximo **1 clarificação / 24h**; permanece `closed`.
- `do_not_contact` legado: em Path A, não usar como sinônimo de soft forever; preferir `dnc_hard` / `cold_suppressed`.

### R2 automático
Só após canário de reopen (Q4). Até lá: playbook humano/docs; runtime R2 flag OFF.

### Contenção emergencial
Até Path A enforce no canário: closed+DNC/remarketing **não** reabre (patch atual). Path A substitui essa regra dura por classificador + grants.
