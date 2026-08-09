# ADR-1 — Hermes orquestra; não é o cérebro de conversa

**Status:** Aceito (piloto Camila 2026-08)  
**Contexto:** Camila/Duda já usam `platform-sales-brain` + cold-outreach. Hermes instalado 2× na VPS.

**Decisão:** Hermes = torre (lista → dry-run → preflight → vigiar). Send/persona/checkout ficam no stack NexvyBeauty.

**Consequências:** Bridge `platform-hermes-bridge` + UI Torre; skills read-only; sem WhatsApp provider no Hermes neste piloto.

**Revisão:** após 48h do primeiro lote real.