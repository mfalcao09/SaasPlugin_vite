# Porta 5 — apontamentos (4/set/2026, ~23:20 BRT)

Fonte: Marcelo (prints WhatsApp) + medição live no banco/Z-API. Sem telefone completo.

Escopo: qualidade do cérebro / o que a Camila **sabe e vê**. Não liga campanha fria. Não mergeia PR.

---

## 1) Não chamar por nome genérico — consultar o nome do contato

### O que aconteceu (prints)

| Como a Camila chamou | O que o WhatsApp mostra no perfil | Handle IG |
|---|---|---|
| **LASH** | Studio Emilly Lopes (conta comercial) | `emillylopes_beauty` |
| **Expert** | Puríssimo Studio (Thaís / Beatriz no banner) | `lancilashesbeauty` |
| **Karolyna** | ~Kssobrancelhas no push name | `studioksobranceelhas` |

### De onde veio o “LASH” / “Expert” (código, não WhatsApp)

`apify-leads.ts` faz `primeiro_nome = name.split(/\s+/)[0]`.

O cold-outreach usa só esse token em `Oi, {nome}!`:

| Handle | `name` no Instagram | `primeiro_nome` gravado |
|---|---|---|
| emillylopes_beauty | LASH DESIGNER \| NITERÓI - RJ | **LASH** |
| lancilashesbeauty | Expert em Extensões com Naturalidade… | **Expert** |
| eloisalimamicro | Sobrancelha Caruaru / Eloísa | **Sobrancelha** (Eloísa está depois da barra) |
| vanessa_araujomakeup | Maquiagem e penteado… | **Maquiagem** |
| jeissianecastronails | Studio Jeissiane Castro… | **Studio** |
| deisesantos_naildesigner | Deise Santos/Unhas | Deise (ok) |
| studioksobranceelhas | Karolyna \| Designer… | Karolyna (ok) |

O webhook **até recebe** `pushName` do WhatsApp, mas **não sobrescreve** se `visitor_name` já existe:

`platform-whatsapp-qr-webhook`: `pushName && !conversation.visitor_name`.

A abertura fria já gravou LASH/Expert → o perfil do WhatsApp nunca entra.

### É possível consultar o WhatsApp? Medido agora (Z-API, instância `camila-zapi-test`)

| Endpoint | O que a doc promete | O que saiu nestes números |
|---|---|---|
| `GET /contacts/{fone}` | `notify` = nome no WhatsApp | **Phone not exists** (número não está na agenda do chip). Só funcionou em números salvos (Marcelo). |
| `GET /chats/{fone}` | metadata do chat, campo `name` | **Sim, quando o chat existe e o nome não é o próprio dígito.** Deise Santos Esmalteria · Ellas studio De Beleza · Jeissiane Castro Nail · Kssobrancelhas. Expert e Emilly: o `name` veio **igual ao telefone** — não veio “Puríssimo” / “Studio Emilly Lopes”. |
| `GET /business/profile?phone=` | dados da conta business | Expert: **descrição** cita “Studio Puríssimo” + Thais/Beatriz. Emilly: horário/categoria/site, **sem** o título “Studio Emilly Lopes”. Karolyna: Business profile not found. |

**Veredito:** consultar é possível e já há API. **Não** é um botão único que sempre devolve o título da tela “Dados da empresa”. Caminho seguro = cascata:

1. Recusar vocativo genérico (LASH, Expert, Maquiagem, Sobrancelha, Studio, categoria).
2. Preferir `chats.name` quando tiver espaço (nome composto) e não for dígito.
3. Parsear o `name` completo do Instagram (Eloísa depois da `/`, Jeissiane no meio, Vanessa no handle).
4. Se não houver nome de pessoa, **não chamar por nada** (`tudo bem?` sem “Oi, X”).
5. Antes da próxima abertura fria: consultar `/chats/{fone}` (e descrição business se o chat for mudo).

Módulo: `_shared/cold-outreach/camila-display-name.ts` (testes nos casos reais acima). **Ainda não** está ligado no envio ao vivo — campanha continua pausada.

Não dá para apagar o “Oi, LASH” já entregue no celular. O que dá é parar de repetir o genérico nas próximas bolhas e não abrir gente nova assim.

---

## 2) A Camila precisa enxergar todos os contatados

### Entendido

O relógio (`platform-camila-conductor`) **só olha 5 IDs** (`INCIDENT_ALLOWLIST` / `CAMILA-HARNESS-REGRAS.md` §6). Quem está fora some para condução/retomada, mesmo com chip no ar.

### Fila do piloto `piloto-camila-zapi-20260901` (10 linhas)

| Lead (IG) | Fila | Conversa CRM pinada na Camila? | Relógio vê? |
|---|---|---|---|
| Deise | sent | sim | sim |
| Expert / Puríssimo | sent | sim | sim (cutucou 4/set 17:33) |
| Ellas | sent | sim | sim (última bola 3/set, sem wake 4/set) |
| Jeissiane | replied | sim | sim |
| Emilly / LASH | sent | sim | sim (encerrou 4/set 17:04) |
| Eloísa / “Sobrancelha” | **sent** | **não** (`conversation_id` null) | não |
| Vanessa / “Maquiagem” | **sent** | **não** | não |
| Edna | skipped (emergency stop) | conversa antiga `closed`, não no allowlist | não |
| **Karolyna** | skipped na fila | conversa **existe**, mas pinada na **Duda** | não |
| Marcelo teste | skipped | — | não |

Karolyna (print: Bom dia / Tudo sim / E com vc? às 7:41): conversa `4b3cb629-…`, `visitor_name=Kssobrancelhas`, agente **Duda** (`577fc770-…`). **Não há outbound da Camila nesse fio CRM.** O “Oi, Karolyna” do print não está nessa thread — o inbound caiu num atendimento da Duda. Por isso a Camila “não viu” a resposta.

### Por que a mudança só pegou em alguns

O conductor só acorda a allowlist. Entre as 5, Expert/Emilly foram cutucadas em 4/set; Deise/Ellas não. Os outros contatados **nem entram na varredura**.

Enxergar todos ≠ ligar campanha nova. É: (a) conversa no CRM, (b) pin Camila, (c) ID na allowlist **ou** allowlist = toda `bot_active` pinada nela.

---

## Próximo GO (não executei)

1. Ligar `pickCamilaGreetingName` no cold + no brain (próxima bolha deixa de dizer LASH/Expert). Sem disparo extra.
2. Atualizar `visitor_name` das 5 no banco (sem WhatsApp).
3. Karolyna: pin Camila + incluir no relógio — ela tem dívida (“E com vc?”) sem resposta.
4. Eloísa e Vanessa: nascer conversa CRM ou confirmar se o WhatsApp entregou sem inbox.

Risco de 3–4: o relógio pode mandar mensagem. Só com GO explícito.
