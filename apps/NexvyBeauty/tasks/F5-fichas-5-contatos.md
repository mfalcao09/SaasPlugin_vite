# F5 — Fichas das 5 conversas (análise individual)

**Gerado:** 2026-09-02 ~15:15 BRT (releitura pós-manhã)  
**Fonte:** DB live (`platform_crm_*`) — canônicas + duplicatas (telefone sem 9º dígito)  
**Uso:** `extra_context` / `reactivation` — **não** tratar todos como Mode A

Roteiro-esqueleto: *apresento → empresa → o que faz → faz sentido?*  
Só avançar o **próximo beat que ainda falta**. Não repetir o que já está no histórico.

**Alerta CRM:** respostas de manhã caíram nas **duplicatas** (sem 9). Duplicatas estão `bot_active` de novo com agente `577fc770…` (Duda, não Camila). **Re-merge obrigatório antes de qualquer kickoff.**

---

## 1) Expert — Mode A (silêncio)

| Campo | Valor |
|-------|--------|
| conversation_id | `e882518f-5ebd-457d-8c3c-dc33f400a7a1` |
| Nome no fio | Expert |
| Handle | `@lancilashesbeauty` |
| Telefone | +5513992028635 |
| Modo kickoff | **A** |

**Histórico**
- OUT cold 00:06: `Oi, Expert! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️`
- IN humano: **nenhum** (manhã inclusa)

**Já entregue:** beat 1 parcial.  
**Próximo:** R1 (@lancilashesbeauty) → R2.  
**Se silêncio após R2:** D+2.

---

## 2) Emilly (LASH) — Mode A (silêncio)

| Campo | Valor |
|-------|--------|
| conversation_id | `db7991a9-df6c-4665-8d9b-481b1cc48d53` |
| Nome no fio | LASH |
| Handle | `@emillylopes_beauty` |
| Telefone | +5521971449182 |
| Modo kickoff | **A** |

**Histórico**
- OUT cold 00:06: `Oi, LASH! … Camila, da NexvyBeauty`
- IN humano: **nenhum**

**Próximo:** R1 (@emillylopes_beauty) → R2. Não forçar “Emilly” se não estiver no fio.  
**Se silêncio após R2:** D+2.

---

## 3) Deise — Mode B (cumprimento de manhã — PENDENTE)

| Campo | Valor |
|-------|--------|
| conversation_id canônica | `7e427cd4-5181-445d-9eb1-f05906b8f42d` (+5538988383104) |
| Duplicata viva | `032bcfbf-911a-4a14-b05b-835e62f0471a` (+553888383104) |
| Handle | `@deisesantos_naildesigner` |
| Modo kickoff | **B** |

**Histórico canônica (madrugada)**
- IN auto-reply loja + horário
- OUT bot failed: `Oi, Deise! Tudo bem contigo?`
- OUT cold: `Oi, Deise! … Camila, da NexvyBeauty`

**Manhã (na duplicata — ainda não respondida)**
- 10:51 BRT IN: `Bom dia! Tudo bem sim e com você?`

**Já entregue:** Camila + NexvyBeauty (bolha 1).  
**Falta:** eco Mode B (sem “e você?”) + R1 + CTA R2.  
**Não fazer:** R1 cego Mode A; perguntar se *ela* está bem de novo; reagir a auto-reply.

**Próximo envio (após re-merge → canônica, Camila pin):**
> Bom dia! Tô bem sim 🙌  
> Te mandei msg ontem à noite — peço desculpas pela hora. Achei teu número no Instagram @deisesantos_naildesigner e quis mostrar na prática… atendimento 24/7.  
> Posso te contar rapidinho como a NexvyBeauty resolve isso?

---

## 4) Ellas — Mode B (cumprimento curto — PENDENTE)

| Campo | Valor |
|-------|--------|
| conversation_id canônica | `01385b74-29ab-4044-bf10-3a2bcc26928c` (+5584981356722) |
| Duplicata viva | `1bb81b0f-76f7-428c-98df-7033b39d092a` (+558481356722) |
| Handle | `@ellastudiodebeleza_` |
| Modo kickoff | **B** |

**Histórico canônica**
- IN auto-reply studio
- OUT bot failed genérico
- OUT cold Camila

**Manhã (duplicata — ainda não respondida)**
- 10:34 BRT IN: `Bom dia`

**Eco:** só `Bom dia!` (ela **não** perguntou “e você?” / “tudo bem?”).  
**Depois:** R1 (@ellastudiodebeleza_) + CTA R2 no mesmo turno (Mode B adaptado).

**Próximo (após re-merge):**
> Bom dia! 🙌  
> Te mandei msg ontem à noite — peço desculpas pela hora. Achei teu número no Instagram @ellastudiodebeleza_ e quis mostrar na prática… 24/7.  
> Posso te contar rapidinho como a NexvyBeauty resolve isso?

---

## 5) Jeissiane — trilha: ponte diagnóstico → valor (CONDUTOR)

| Campo | Valor |
|-------|--------|
| conversation_id canônica | `db870f09-54d1-4e1b-a221-6af8fb24788f` (+5568999576171) |
| Handle | `@jeissianecastronails` |
| Posição na trilha | Apresentação parcial já feita → qualificação (sala própria, só ela) → **pergunta agenda aberta** → próximo beat = **explicar POR QUE perguntou + o que o sistema muda** |
| Modo | **Condutor** — NÃO esperar resposta; NÃO R1/R2 frio |

**Princípio:** nós conduzimos. Pergunta sem resposta na trilha não é “aguardar”; é achar o próximo beat. Aqui a pergunta da agenda é a ponte natural para o valor (equivalente ao beat “o que faz / muda a realidade”).

**Já coletado:** espaço próprio; só ela tocando tudo.  
**Última OUT:** sistema pra agenda vs caderno/WhatsApp.  
**Não fazer:** R1 (desculpa/IG/24/7), R2 CTA frio, re-saudação, “e você?”, repetir a mesma pergunta seca.

**Próximo envio (proposta — validar com Marcelo):**
> Eu perguntei porque a gente tem um sistema feito pra quem atende sozinha no próprio espaço — são agentes de IA que respondem 24/7, agendam, confirmam, remarcam, organizam cobranças. Basicamente ajudam a gerir o seu espaço (inclusive chamamos de sua equipIA kkkkk).  
> Faz sentido eu te mostrar rapidinho como isso ficaria no seu dia a dia?

(Ajuste fino de tom OK; a intenção é: *motivo da pergunta → mudança de realidade → fecha com “faz sentido?”*.)

---

## Resumo operacional (atualizado)

| Ordem | Lead | Modo | Ação agora |
|-------|------|------|------------|
| 1 | Expert | A | R1+R2 |
| 2 | Emilly | A | R1+R2 |
| 3 | Deise | B | Eco sem “e você?” + R1+R2 |
| 4 | Ellas | B | Eco `Bom dia!` + R1+R2 |
| 5 | Jeissiane | Condutor / ponte valor | **Não esperar** — “perguntei porque…” + o que muda + faz sentido? |

**Campanha global:** paused + dry_run.  
**Re-merge manhã:** ✅ feito (`F5_remege_morning_20260902`).
