# Camila Harness — regras cravadas

**Aprovado:** 2026-09-02 (Marcelo)  
**Agente:** Camila `68aeece9-26f2-4f7b-a595-a6ea5e8acfa7` (prospector)  
**Modelo:** `anthropic/claude-sonnet-5` (alinhado Duda/Bia; 2026-09-03)  
**Objetivo da jornada:** fechamento (checkout), sem handoff.

Fonte de verdade da política de wake. Código: `_shared/cold-outreach/camila-conductor-policy.ts`.

---

## 1. Identidade e vocabulário

**EquipIA / agentes de IA**
- **Proibido** no frio (Mode A/B, R1/R2).
- **Permitido** a partir do beat **o que faz** (ponte diagnóstico→valor, pós-sim).

**“É robô / IA?” → B2 transparência**
> Sou a Camila, da Nexvy — te atendo por aqui com o time e o sistema. Por que a pergunta?

**Não usar:** “sou de carne e osso” (B1).

---

## 2. Dívida (ela falou, Camila calou)

Wake após **2 min** de debounce.

- Conversa **já ativa** (já houve OUT nossa + inbound sem resposta): janela **8h–22h BRT seg–sáb** (`CAMILA_ACTIVE_DEBT_WINDOW`) — não deixa a lead esfriar no fim do comercial 18h.
- Só abertura fria (ainda sem OUT nossa na trilha): continua **9h–18h** comercial.

---

## 3. Condução (última bola é nossa)

Wake após **45 min** de silêncio, mesma janela.  
Trail decide o beat (Jeissiane = ponte valor). Não repetir pergunta seca. Não voltar ao R1 frio.

---

## 4. Retomada fria (só bolha 1)

**Próxima janela comercial** (depois das 18h → próximo dia útil 9h).  
Um R1+R2. Se calar → D+2 (motor cold). Depois breakup. Para.  
Não usar régua 8/20/25/35 da Duda.

---

## 5. Tetos anti-ban

- Máx. **1 wake por tick** do cron (1/min) — nunca rajada nas 5.
- Máx. **1 wake** de dívida/condução **por conversa a cada 2 h** (`metadata.camila_last_wake_at`).
- Máx. **8 wakes/hora** no número da Camila.
- Auto-reply de loja (away) → **noop** (não responde).

---

## 6. Escopo

- **v1:** allowlist das 5 conversas do incidente 2026-09-02.
- **Depois** do dry-run verde: toda conversa `bot_active` pinada na Camila.

| Lead | conversation_id |
|------|-----------------|
| Deise | `7e427cd4-5181-445d-9eb1-f05906b8f42d` |
| Expert | `e882518f-5ebd-457d-8c3c-dc33f400a7a1` |
| Ellas | `01385b74-29ab-4044-bf10-3a2bcc26928c` |
| Jeissiane | `db870f09-54d1-4e1b-a221-6af8fb24788f` |
| Emilly | `db7991a9-df6c-4665-8d9b-481b1cc48d53` |

---

## Invariantes

- Loop próprio (`platform-camila-conductor`), **não** o sweeper da Duda.
- `CAMILA_CONDUCTOR_ENABLED` default OFF; dry-run default ON.
- Campanha cold paused até GO separado.
- `conductor_wake` ignora `stale_redelivery`.
- Opt-out / “não” / janela comercial / 1 pergunta por bolha.
