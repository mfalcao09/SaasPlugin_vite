# F5 — Plano completo de retomada (incidente 2026-09-02)

**Atualizado:** 2026-09-02 ~07:32 BRT  
**Campanha:** `piloto-camila-zapi-20260901` (`b480ed6e-73c8-43ec-addd-9c05c6ac68da`) — permanece **paused** + `dry_run=true`  
**Camila:** `68aeece9-26f2-4f7b-a595-a6ea5e8acfa7`  
**Produto:** `806b5975-e268-402e-a65c-9e9503271041`

---

## 1. Estado atual (medido)

| Item | Estado |
|------|--------|
| §1 Merge 8→5 | ✅ Feito — 3 duplicatas `closed`, msgs nas canônicas |
| §2 D+2 cancelado | ✅ Feito — `next_followup_at=NULL`, `skip_reason=INCIDENT_RECOVERY_20260902_MANUAL` nos 5 |
| Camila | ❌ `is_active=false`, `active_in_whatsapp=false` |
| Campanha | `paused`, `dry_run=true` |
| Opt-out INCIDENT | 5 telefones ainda na tabela |
| 5 conversas | `waiting_human` |

### 5 canônicas

| Lead | Telefone | conversation_id |
|------|----------|-----------------|
| Deise | +5538988383104 | `7e427cd4-5181-445d-9eb1-f05906b8f42d` |
| Expert | +5513992028635 | `e882518f-5ebd-457d-8c3c-dc33f400a7a1` |
| Ellas | +5584981356722 | `01385b74-29ab-4044-bf10-3a2bcc26928c` |
| Jeissiane | +5568999576171 | `db870f09-54d1-4e1b-a221-6af8fb24788f` |
| Emilly | +5521971449182 | `db7991a9-df6c-4665-8d9b-481b1cc48d53` |

---

## 2. Estratégia de mensagem (aprovada)

### Já enviado (ontem ~00:05) — bolha 1

> Oi, {Nome}! Tudo bem contigo? Aqui é a Camila, da NexvyBeauty 💅🏻💆‍♀️

### Retomada hoje cedo

**R1**
> Oi, {Nome}! Achei o seu número no Instagram @{handle}. Te mandei mensagem ontem à noite — peço desculpas pela hora.  
> Na verdade, quis mostrar na prática o que a gente fala: quantas clientes enviam mensagem fora do horário comercial e acabam ficando sem resposta se o salão não tem atendimento 24/7.

**R2** (~15s)
> Como eu te falei, eu sou a Camila, da NexvyBeauty. Posso te contar rapidamente como nosso sistema pode te ajudar a resolver isso?

### R1 / R2 — não são absolutos

**Princípio:** Camila **sempre responde o que a lead acabou de dizer**. R1 e R2 são **conteúdo obrigatório a entregar** (desculpa + 24/7 + oferta de contar), não bolhas fixas em ordem cega.

| Intenção | Conteúdo (obrigatório em algum momento) |
|----------|-----------------------------------------|
| **R1** | Origem Instagram @{handle} + desculpa pela hora + ângulo 24/7 |
| **R2** | Sou a Camila / NexvyBeauty (só se ainda não estiver claro no fio) + “posso te contar…?” |

### Proposta — 3 modos de aplicar

#### Modo A — Lead silenciosa (só bolha 1 ontem)

Envia R1 → R2 como texto fechado (já aprovado). Sem ajuste.

#### Modo B — Lead cumprimenta **antes** ou **no lugar** de um “sim”  
Ex.: `Oi, bom dia, tudo bem e você?` (e R1/R2 ainda não foram, ou só bolha 1 existe)

**Regra de eco (obrigatória):**
- Lead perguntou como *você* está (`tudo bem?` / `e você?`) → Camila **responde o estado dela** (`Tô bem sim`).
- Lead **já disse** que está bem → Camila **não** devolve `e você?` / `tudo bem?` (perguntaria de novo o que ela já respondeu).
- Cumprimento de horário (`bom dia` / `boa tarde`) → ecoa só isso (`Bom dia!`).

**Proposta B — bolha única (preferida):**
> Bom dia! Tô bem sim 🙌  
> Te mandei msg ontem à noite — peço desculpas pela hora. Achei teu número no Instagram @{handle} e quis mostrar na prática o que a gente fala: quantas clientes mandam mensagem fora do horário e ficam sem resposta se o salão não tem atendimento 24/7.  
> Posso te contar rapidinho como a NexvyBeauty resolve isso?

**Proposta B — duas bolhas:**
> Bom dia! Tô bem sim 🙌  
> ---  
> Te mandei msg ontem à noite — peço desculpas pela hora. Achei teu @{handle} no Instagram e quis mostrar na prática: cliente que escreve fora do horário e fica sem resposta quando não tem atendimento 24/7. Posso te contar rapidinho como a NexvyBeauty resolve isso?

❌ Errado: `Bom dia! Tô bem sim, e você?` — a lead já veio no “tudo bem”; perguntar de novo quebra o natural.

#### Modo C — Lead cumprimenta **depois** de R1+R2 já enviados  
Ex.: R1+R2 saíram → ela: `Oi, bom dia, tudo bem e você?`

**Não** reenviar R1. Eco sem reperguntar o bem-estar dela:

> Bom dia! Tô bem sim 🙌  
> Posso te contar rapidinho então?

#### Modo Condutor (meio da trilha)

Silêncio após **uma** pergunta de diagnóstico no meio da trilha **não** é “aguardar / nudge seco / repetir a pergunta”.
Camila **CONDUZ**: ache o próximo beat — ponte **“Eu perguntei porque nós temos um sistema que…”** + o que o sistema muda na realidade dela + feche com **“faz sentido?”** (ou oferta de mostrar).
Não volte a R1/R2 frio se a conversa já avançou (apresentação / qualificação).

**Ex.: Jeissiane** — já tem sala própria e atende sozinha; última OUT foi agenda vs caderno/WhatsApp → próximo envio = motivo da pergunta + valor + faz sentido? (**não** esperar; **não** R1/R2).

> Eu perguntei porque a gente tem um sistema feito pra quem atende sozinha no próprio espaço — são agentes de IA que respondem 24/7, agendam, confirmam, remarcam, organizam cobranças. Basicamente ajudam a gerir o seu espaço (inclusive chamamos de sua equipIA kkkkk).  
> Faz sentido eu te mostrar rapidinho como isso ficaria no seu dia a dia?

### Depois do “posso te contar…?”

| Resposta | Ação |
|----------|------|
| Sim / conta / quero / como funciona | Bolha 3 → 4 |
| Outro cumprimento / papo curto | Eco 1× + reabre CTA (máx. 1 vez) |
| Não explícito após CTA | D+2 (operacional) — **não** confundir com hang de diagnóstico Condutor |

### O que **não** fazer em nenhum modo

- Ignorar o “tudo bem e você?” e soltar pitch
- Repetir R1 se já foi dito no fio
- Reapresentar nome/marca se já está claro
- Mandar bolha 3 no mesmo turno do cumprimento, sem ela aceitar “contar”
- Esperar passivamente após pergunta de diagnóstico no meio da trilha

### Bifurcação (atualizada)

```
Contexto da lead
 ├── silêncio após bolha 1              → Modo A (R1 → R2)
 ├── cumprimento (sem R1/R2)            → Modo B (eco + R1+R2 ajustados)
 ├── cumprimento pós R1/R2              → Modo C (eco + reabre R2)
 ├── meio da trilha: OUT diagnóstico
 │   (agenda/caderno) sem resp. humana  → Modo Condutor (ponte valor + faz sentido?)
 └── sim explícito                      → Bolha 3 → 4
```

**Bolha 3** (só após confirmação):
> A NexvyBeauty é um sistema pra espaços de beleza feminina que responde suas clientes no WhatsApp, organiza a agenda e resgata clientes que não marcaram mais nenhum atendimento. Tudo automático, com atendimento por inteligência artificial de verdade — não chatbot de menuzinho.

**Bolha 4**:
> Você acha que faria diferença ter uma IA que encontra clientes pra você, todos os dias?

Bolha 2 original: **removida** (Instagram já entra no bloco R1, em qualquer modo).

---

## 3. O que já foi feito

- [x] Contenção F0 (campanha pausada, Camila off, waiting_human, opt-out INCIDENT)
- [x] F1–F4 código (CRM pin, auto-reply suppress, 4 bolhas motor, go-live gates) + deploy edge
- [x] §1 Merge duplicatas
- [x] §2 Cancelar D+2 em massa (temporário — rearmar seletivo se silêncio)

---

## 4. O que falta alterar / executar

### A) Preparo técnico (antes do envio) — §3–§5

| # | Ação | Como |
|---|------|------|
| A1 | Conversas → `bot_active` + pin Camila + `needs_human=false` | SQL §3 |
| A2 | Camila `is_active=true` + `active_in_whatsapp=true` | SQL §4 |
| A3 | Remover opt-out `INCIDENT_20260902` dos 5 | SQL §5 |
| A4 | Campanha **continua paused** | Não re-armar |

### B) Envio R1+R2 (hoje cedo, 1 a 1)

| # | Ação | Como |
|---|------|------|
| B1 | Ordem: Expert → Emilly → Deise → Ellas → Jeissiane | ~15–20 min entre contatos |
| B2 | Enviar **R1** depois **R2** com copy fixa (não inventar) | Manual inbox **ou** `ai-reactivate` mode=direct com texto travado |
| B3 | Auto-reply: registrar, **não** contar como confirmação | Classificador F3 / critério humano |

**Preferência:** texto fixo (R1/R2) — não deixar o LLM reescrever a ponte.

### C) Pós-R2 — por contato

| Resposta | Ação |
|----------|------|
| **Confirma** | Enviar bolha 3 → 4; Camila segue em `bot_active`; limpar skip_reason recovery se necessário |
| **Não / silêncio** (janela acordada, ex. 2–4h após R2 ou fim do dia) | Rearmar D+2: `next_followup_at = sent_at + 48h` (ou 04/set 00:06), limpar `skip_reason` recovery, status `sent`; **não** mandar bolha 3 |

### D) Código / produto a alterar (se quiser automatizar)

Hoje a retomada R1/R2 **não** está no motor cold — é operação manual/controlada.

| Alteração | Prioridade | Notas |
|-----------|------------|-------|
| Playbook + SQL §3–§5 + rearmar D+2 seletivo | **P0 — agora** | Sem código novo |
| Objective/`ai-reactivate` com copy R1/R2 travada | P1 | Evita LLM desviar |
| Gate “bolha 3 só após confirmação humana” no `apresentar-sequence` | P2 | Hoje: operador ou brain com prompt |
| `processFollowups` respeitar opt-out | P2 | Já mitigado com campanha paused |
| Não re-armar campanha global até F5 fechado | **Regra dura** | |

---

## 5. Ordem operacional completa

```
FEITO  §1 Merge
FEITO  §2 Cancel D+2 em massa

AGORA  Discutir/travar copy          ✅ R1+R2 + bifurcação fechados
       §3 bot_active + pin Camila
       §4 Reativar Camila agente
       §5 Remover opt-out INCIDENT
       Enviar R1+R2 (5 contatos, espaçados)
       Monitorar respostas
         ├─ confirma → bolha 3+4
         └─ silêncio → rearmar D+2 naquele telefone

DEPOIS Desligar Camila de novo? (opcional, se só esses 5)
       Campanha continua paused até OK explícito Marcelo
```

---

## 6. Checklist binário

**Pré-envio**
- [ ] 5 canônicas `waiting_human` → `bot_active` + pin Camila
- [ ] Camila ativa no WhatsApp
- [ ] Opt-out INCIDENT removido nos 5
- [ ] Campanha ainda paused

**Pós-R1/R2**
- [ ] 5 receberam R1+R2 hoje
- [ ] Quem confirmou: bolha 3+4 enviadas
- [ ] Quem não: `next_followup_at` rearmado (~D+2), skip_reason limpo
- [ ] Nenhum tick de campanha em massa

---

## 7. Riscos

| Risco | Mitigação |
|-------|-----------|
| LLM muda R1/R2 | Enviar copy fixa (direct / manual) |
| Auto-reply contado como “sim” | Só confirmação humana |
| D+2 some nos silenciosos | Rearmar seletivo (§2 foi cancel em massa) |
| “Ativar Bot” genérico → Duda | Sempre pin `current_agent_id=Camila` |
| Re-armar campanha cedo | Proibido até Marcelo OK |

---

## SQL

`tasks/F5-retomada-segura.sql` (§3–§5 comentados; §2 já executado; rearmar D+2 = update seletivo pós-silêncio)
