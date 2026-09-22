# Camila — Harness Engineering

**Programa:** `camila-harness`  
**Versão do contrato:** **v1.2** (2026-09-17) — nome canônico de saída: **Mensagem de Saída** (não “Joice”)  
**Board canônico:** `../evidence/PRD-09/harness-review/board-v2-camila-harness-engineering.jpg`  
  (origem: `~/Downloads/Meu primeiro board v2.jpg`)

## Escopo

**Dentro:** 1º disparo (outbound), triagem, soft/hard exit, pool laranja, atendimento, piloto supervisionado, gates.  
**Fora / TBD:** campanha remarketing (t1–t3); semântica fina do Kill pós-maturidade (`stop_new` / `abort_inflight`).

## Runtime HOJE

Harness ainda não implementado → **Voice OFF + Kill ON** → zero WhatsApp real.

## Documentos

| Arquivo | Conteúdo |
|---|---|
| [PLAN-v1.2.md](./PLAN-v1.2.md) | Plano consolidado |
| [PRD-11-EXECUTION-LOOP.md](./PRD-11-EXECUTION-LOOP.md) | **PRD de execução** (3 loops) |
| [GLOSSARY.md](./GLOSSARY.md) | Vocabulário |
| [STATE-MACHINE.md](./STATE-MACHINE.md) | Estados / eventos |
| [POLICY.md](./POLICY.md) | Gates, Kill, piloto |
| [CONTRACT-ANSWERS.md](./CONTRACT-ANSWERS.md) | Q&A founder |
| [aliases-v1.json](./aliases-v1.json) | Legado → canônico |

## Check binário (docs v1.2)

1. soft_exit ≠ rmkt_t*  
2. pool ≠ campanha automática  
3. FC-1: completa 4 (hard/Voice mid-stream inclusive)  
4. Kill = mata **automático**; **não** cobre disparo supervisionado  
5. Piloto: Voice TEST + Kill ON + lista manual supervisionada  
6. Verde = 1ª bolha; retomada ≤48h antes das bolhas faltantes  
7. Remarketing campaign + Kill maduro = TBD  
8. HOJE OFF+Kill absoluto até implementação  
