# Plano — adaptar o inbox ao salão/espaço de beleza

> **Status:** proposta para validação. **Nenhum código escrito ainda.**
> **Data:** 2026-06-27 · **Fonte:** investigação (3 agentes lendo os componentes do inbox + os modelos de salão).

---

## 0. A raiz comum (a verdade primeiro)

O inbox foi **herdado do CRM B2B** e está plugado nas tabelas/fluxos de **venda de SaaS/infoproduto** — não no que um salão/espaço de beleza realmente faz. Cada uma das 4 telas aponta pro lugar errado:

| Tela do inbox | Hoje aponta pra… (B2B) | Deveria usar… (salão, **já existe**) |
|---|---|---|
| **Catálogo** | `product_catalog_items` (ofertas raspadas via Firecrawl) → **vazio** | `servico_catalogo` + `pacotes` + `products`(revenda) |
| **Novo Evento** | `calendar_events` (reunião/demo/Meet/lead) | `agendamentos` (cliente+serviço+profissional+data/hora) |
| **Follow-up** | `tasks` "Enviar proposta comercial" | retorno/recompra (modelo `clientActions.ts` já existe) |
| **Cobrar** (link de pagamento) | `payment_links` | — **desabilitar** nesta versão (futuro) |

**Bom dado:** os modelos de salão **já estão prontos e escopados por `organization_id`** — quase tudo é "reapontar a leitura", não construir do zero.

---

## 1. Catálogo → listar o que o salão vende  ·  esforço **médio**

**Hoje:** o botão "Catálogo" abre o `CatalogPickerDialog`, que consulta `product_catalog_items` (catálogo de ofertas do CRM, populado por Firecrawl/CSV) filtrando por `product_id` da conversa. Salão nunca preenche essa tabela → **"Nenhum item no catálogo"**.

**Proposta:** trocar a fonte do picker por um **hook agregador novo** (`useSalaoCatalogo`) que lê as 3 fontes do salão e normaliza num shape comum `{ kind, title, price, description }`:
- **Serviços** → `servico_catalogo` (`nome`, `preco_base`, `descricao`, `duracao_minutos`).
- **Pacotes** → view `pacotes` (`nome`, `valor`, `total_sessoes`, `validade_dias`, `servicos_incluidos`).
- **Produtos de revenda** → `products` tipo=`produto` (`name`, `settings.preco`, estoque/sku).

UI: 3 abas/seções (**Serviços | Pacotes | Produtos**) reusando o `ScrollArea`/`Card` que o dialog já tem. **Remover o filtro por `product_id`** (conceito de CRM, não de salão) — escopar só por `organization_id`. O envio (`handleSend`) fica igual: monta título + preço + descrição → manda no chat. Sem imagem por enquanto (as 3 tabelas não têm imagem; o bloco de mídia já é condicional → não quebra). **Não tocar** nas telas Serviços/Pacotes/Produtos nem nos Edge Functions de CRM — só o picker.

---

## 2. Novo Evento → agendar atendimento (cliente + serviço + profissional)  ·  esforço **médio**

**Hoje:** "Novo Evento" abre o `EventModal`, que grava em `calendar_events` com vocabulário de vendas (tipo Reunião/Ligação/Demo/Follow-up, vincula Lead + Produto SaaS, campo "Link da reunião" Google Meet). **Esse agendamento nunca aparece na `/salao/agenda`** (que lê `agendamentos`), não conta nas stats, não vincula serviço/profissional/valor.

**O salão já tem tudo:** tabela `agendamentos` (cliente + profissional + serviço + data + hora + valor), o form pronto em `pages/salao/Agenda.tsx`, e um **caminho canônico já existente**: o `LeadDetailPage` já converte lead→cliente e navega pra `/salao/agenda?cliente=<id>`, onde o form abre pré-selecionado.

**Duas formas (preciso da sua escolha):**
- **Opção A — reusar a Agenda (menor esforço):** renomear o atalho pra **"Agendar atendimento"** e fazer ele converter o lead→cliente e **navegar pra `/salao/agenda?cliente=<id>`** (a Agenda abre o form pré-preenchido). +1 clique, mas reusa 100% a tela real. Sem lead, resolve a cliente **por telefone** (anti-homônimo).
- **Opção B — modal inline no inbox (mais esforço):** extrair o Dialog de agendamento da Agenda pra um componente compartilhado (`AgendamentoModal`) e abrir ele dentro do chat, gravando em `agendamentos`. O atendente não sai do chat, mas é mais trabalho.

Em ambas: **somem** os campos de venda (Demo/Follow-up, Produto SaaS, Google Meet). Mesma correção vale pro botão "Agendar Evento" do painel do lead (também abre o `EventModal` hoje).

---

## 3. Follow-up → "Agendar retorno"  ·  esforço **baixo** (só copy)

**Hoje:** "Agendar Follow-up" grava em `tasks` com título "Follow-up: {cliente}", placeholder "Ex: Enviar proposta comercial" — língua de SDR. No salão, follow-up = **a cliente voltar a consumir** (retorno, recompra, renovação de pacote).

**Proposta (só copy + valor de domínio, sem migração de schema — confirmado que `type:'followup'` não é lido como filtro em lugar nenhum):**
- Barra: label "Follow-up" → **"Retorno"**, tooltip → "Agendar lembrete de retorno da cliente", ícone → `CalendarClock`/`RotateCcw`.
- Dialog: título "Agendar Follow-up" → **"Agendar retorno"**, registro "Follow-up: X" → "Retorno: X", placeholder → **"Ex: Lembrar de remarcar · renovar pacote · oferecer retorno do serviço"**, `type:'followup'` → `'retorno'`.
- **Evolução opcional (depois):** pré-popular a nota com a mensagem-pronta do motor `clientActions.ts`/`leverMessage` (o mesmo de "Quem chamar hoje"), ligando o inbox ao motor de retorno. Fica pra um 2º passo.

---

## 4. Cobrar (link de pagamento) → desabilitar nesta versão  ·  esforço **baixo** (1 linha)

**Hoje:** o botão "Cobrar" só renderiza **se** a prop `onSendPaymentLink` for passada (o `QuickActionBar` já faz `{onSendPaymentLink && (...)}`). O `SellerInbox` passa essa prop.

**Proposta (mínima e reversível):** **não passar** `onSendPaymentLink` no `SellerInbox` (1 linha) → o botão some sozinho pelo gating que já existe. Deixo o `PaymentLinkDialog` dormindo (ninguém aciona) — quando a feature voltar, é só repassar a prop. **Sem feature-flag/env** (over-engineering pro escopo). Se no futuro for por plano, o lugar é o provisioning/`enabled_modules`, não o inbox.

---

## 5. Junto no lote (3 aprovados na rodada anterior)

- **Ícones tesoura** restantes (4 telas fora da auditoria): `PublicSalaoBooking`, `PublicSalaoPacotes` (públicas, a *cliente* vê), `pages/salao/Profissionais.tsx`, `AgentHumanizationTab` → ícones neutros.
- **Botão "Ver no AI Growth"** (Início) → "Ver oportunidades" (alinhar ao menu que já virou "Oportunidades").

---

## 6. Decisões que preciso de você (antes do código)

1. **Catálogo:** abas (Serviços | Pacotes | Produtos) ou lista única com etiqueta de tipo? Só itens **ativos**? _(recomendo: abas + só ativos)_
2. **Novo Evento:** **Opção A** (navega pra Agenda, reusa a tela, +1 clique) ou **Opção B** (modal inline, não sai do chat, mais esforço)? _(recomendo A agora, B como evolução)_
3. **Agenda de vendas** (`calendar_events`: reunião/demo/Meet): some de vez do NexvyBeauty (produto é 100% salão) ou fica como recurso comercial à parte só desconectado do inbox? _(recomendo desconectar do inbox agora; remover de vez depois se quiser)_
4. **Follow-up:** só o reframe de copy agora, ou já quero a integração que puxa a mensagem-pronta do `clientActions.ts`? _(recomendo só copy agora)_
5. **Cobrar:** esconder via prop (1 linha, dialog dorme) — confirma? _(recomendo sim)_

---

## 7. Ordem de implementação sugerida (quando aprovado)

1. **Cobrar** (1 linha) + **Follow-up** (copy) + **Scissors/AI Growth** — rápidos, baixo risco. _(1 deploy)_
2. **Catálogo** (hook agregador + abas no picker). _(1 deploy + teste real)_
3. **Novo Evento** (Opção A ou B) — o maior, faço por último com cuidado (mexe em agendamento real). _(1 deploy + teste real)_

Cada passo: build + deploy anti-phantom + prova no Chrome real.

_Me responde as 5 decisões do §6 (ou "aprovo as recomendações") que eu sigo pro código nessa ordem._
