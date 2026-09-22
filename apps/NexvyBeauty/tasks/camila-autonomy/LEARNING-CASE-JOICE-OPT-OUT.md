# Aprendizado — Joice (opt-out soft → site + remarketing)

Atualizado: 2026-09-16  
Evidência: `evidence/PRD-09/learning-joice-opt-out-20260915.json`  
Conv: `b23200a2-be5f-4a1e-9810-553ed43276dd` · `@joicefbeltramini`

## O que aconteceu (provado no CRM)

| BRT | Dir | Texto |
|-----|-----|--------|
| 10:02–10:20 | out | Abordagem APRESENTAR 4/4 |
| 18:00:37 | in | Oiee |
| 18:00:45 | in | No momento não tenho interesse |
| 18:00:50 | in | Talvez em outra oportunidade |
| *(humano — texto não no CRM)* | out | Fechamento R2 + link (enviado no celular) |
| 20:09:55 | in | Pode deixar |
| 20:09:56 | in | Obrigada |

Metadata após: `remarketing=true`, `do_not_contact=true`, `opt_out_text="No momento não tenho interesse"`.

## Regra que o agente deve internalizar (R2)

**Gatilho:** lead diz que não tem interesse / talvez outra oportunidade (soft ou hard opt-out).

**Resposta (2 bolhas, na ordem):**

1. `Sem problemas, {usuário}! Vou deixar aqui o nosso site para você dar uma olhada com calma, e se tiver interesse é só nos chamar no whatsapp novamente. Combinado?`
2. `https://nexvybeauty.com.br` (preview OG da LP)

**Depois:**

- Marcar opt-out + remarketing (WHEN remarcar = TBD)
- `do_not_contact=true` na cold atual
- Silenciar brain / não insistir / não reabrir pitch no mesmo dia
- Se a lead responder “Pode deixar” / “Obrigada” → **ack de fechamento**, não reengajar

## Por que isso funciona (observado)

A lead acusou o fechamento educado + site sem atrito (`Pode deixar` / `Obrigada`). Porta fica aberta para remarketing futuro sem queimar o relacionamento.

## Lacuna técnica

Outbound humano pelo chip celular **não espelhou** em `platform_crm_messages`. Quando o **agente** executar R2, as bolhas devem ser persistidas pelo runtime (não depender do sync do celular).

## Constituição

`opt_out` é **não-aprendível** pelo Learning Controller (`camila-learning.ts`). Esta regra entra por PR humano / playbook — não por auto-promoção.


## Path A (2026-09-16)

- “Pode deixar” / “Obrigada” = **farewell_ack** (não reabrir, não brain).
- Soft opt-out ≠ hard DNC eterno.
- Se no futuro a lead disser “quero ver / mudei de ideia” = **reopen_intent** (reply + libera soft cold com hold 24h, sem blast).
- Ver `evidence/PRD-09/path-a-loop/corpus-v1.json` e PRD-10.
