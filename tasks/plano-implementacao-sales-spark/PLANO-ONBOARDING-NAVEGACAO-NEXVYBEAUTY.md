# Plano de Melhoria — Onboarding e Navegação do NexvyBeauty

**Para:** Marcelo (fundador) · **Data:** 2026-06-18 · **Fonte:** investigação multi-agente de 7 mapas do código real (afirmações de maior impacto verificadas diretamente no código).
**Relação:** sucede e amplia o `plano-onboarding-redesign.md` (2026-06-10, escopo NexvyOficinas, já executado em `ea3b91b`). Aquele tratou tema/Lovable; **este** cobre funil de venda, checkout, provisionamento, onboarding unificado e navegação no Beauty.

> Base: 7 mapas factuais do código real (fusão flow.ai = atendimento/agenda/inbox + sales-spark = CRM/produtos + vertical salão nova). Tudo que não estava nos mapas e não consegui confirmar no código está marcado **(A VERIFICAR)**.

---

## Resumo executivo

O que está **bom**: a plataforma já tem provisionamento automático funcional — quando o cliente paga via Cakto, um webhook cria a empresa (organization), cria o usuário admin e dispara um e-mail de boas-vindas com link de acesso. O e-mail do checkout é exatamente o mesmo usado no cadastro (1:1, sem duplicação no caminho automático). O onboarding guiado já existe e é "module-aware" (ramifica por módulo).

O que **quebra**: (1) não existe página pública de preços nem botão "Comprar" — o link Cakto está cadastrado no backend mas não aparece em lugar nenhum para o cliente clicar; (2) o checkout não tem mensagens claras ("após pagar você recebe acesso no e-mail"); (3) há risco real de e-mail duplicado quando a venda é manual; (4) o texto "oficina" aparece em telas de salão; (5) os dois SaaS fundidos têm dados duplicados (cliente do salão vs lead do CRM vs contato do inbox) e navegação confusa, sem submenu no salão.

O que **vamos fazer**: corrigir os textos "oficina" e as mensagens de checkout (Fase 0), criar o fluxo de venda com link pré-preenchido para eliminar duplicata de e-mail, unificar a primeira tela de acesso como onboarding de tudo, deixar explícita a ordem interna (cadastra X, depois Y) e costurar os dois cérebros (cliente ↔ lead ↔ contato).

---

## Estado atual de cada fluxo

### Funil da plataforma / LP de vendas

| Item | Hoje (código) | Gap |
|---|---|---|
| LP de vendas | `SalesPage.tsx:95` salva o lead na tabela `sales_leads` (empresa, nome, e-mail, telefone, segmento, desafio + UTM) | É só formulário de interesse. **Não tem checkout, não tem botão "Comprar", não redireciona para pagamento** |
| Página de preços pública | Não existe | Sem vitrine de planos linkada |
| Link de checkout Cakto | Cadastrado por plano em `platform_plans.checkout_url_cakto` via `CaktoPlanMapping.tsx:28,60` | URL existe no banco mas **não é usada em nenhuma página pública** |
| Criação de empresa manual | Super-admin em `OrganizationCreateForm.tsx:89-186` cria org + subscription + chama `create-organization-admin` | Funciona, mas é 100% manual |

**Conclusão factual:** hoje a venda self-serve **não existe ponta a ponta**. Ou é manual (super-admin) ou é "cliente acha o link Cakto por fora → paga → webhook provisiona".

### Checkout e provedores

| Provedor | Cria empresa? | Cria plano? | Cria lead? | Nível | Arquivo |
|---|---|---|---|---|---|
| Cakto `scope=platform` | **SIM** | **SIM** | SIM | Plataforma | `cakto-webhook/index.ts` → `cakto-plan-provisioning.ts` |
| Cakto `scope=organization` | Não | Não | SIM | Tenant (venda do salão) | `cakto-webhook/index.ts:91-121` |
| Hotmart | Não | Não | SIM | Tenant | `hotmart-webhook/index.ts:186-262` |
| Doppus | Não | Não | SIM | Tenant | `doppus-webhook/index.ts:397-478` |

**Gap:** só o Cakto `scope=platform` provisiona a plataforma. Hotmart/Doppus servem para o salão vender os produtos *dele*, não para vender o NexvyBeauty. Não há fallback de URL global, é tudo por plano.

### Pós-pagamento → acesso por e-mail

| Etapa | Hoje (código) | Gap |
|---|---|---|
| Webhook recebe pedido pago | `cakto-webhook/index.ts` (scope=platform default) | OK |
| Cria/acha empresa por e-mail | `cakto-plan-provisioning.ts:104-130` busca por `cakto_customer_email` | OK |
| Cria usuário admin | `cakto-plan-provisioning.ts:193-287`, e-mail = `order.customer_email` | OK |
| Envia e-mail de acesso | `cakto-plan-provisioning.ts:256-282`, template `welcome-admin-access`, com **recovery link** | OK no caminho automático |
| E-mail do checkout = e-mail do cadastro? | **SIM, 1:1** — `cakto-plan-provisioning.ts:86,109,272`. Sem mapeamento adicional | No caminho automático não há duplicata. **O risco de duplicata é só no caminho manual** |

### Primeiro acesso / convite

| Item | Hoje (código) | Gap |
|---|---|---|
| Tela de aceite | `AcceptInvite.tsx`: cria usuário (e-mail + senha mín. 6), aceita convite via RPC `accept_invitation`, faz upsert no profile com `organization_id` **já existente**, redireciona para `/` (ModuleHub) | **Não cria empresa, não cria contatos.** Assume que a org já existe (verificado: nunca insere em `organizations`) |
| Disparo do onboarding | `ModuleHub.tsx` dispara `GuidedOnboarding` se `isFirstAccess` | OK |
| Detecção de 1º acesso | `useGuidedOnboarding.ts:89-90`: `organizations.enabled_modules` vazio = 1º acesso | Coluna lida com `as any` (não tipada) — **(A VERIFICAR)** se migration existe |

### Onboarding guiado

| Item | Hoje (código) | Gap |
|---|---|---|
| Sequência base | Welcome → Identity → Modules → [passos do módulo] → Team → Done (`GuidedOnboarding.tsx:116`) | OK como esqueleto |
| CRM (3 passos) | Produto, WhatsApp, Agente IA — **hardcoded** em `GuidedOnboarding.tsx:569,827,1001` | Inconsistente: CRM fora do registry |
| Salão | **Só 1 passo**: serviços (`OficinaServicesStep.tsx:30`, via registry) | **Falta profissionais, agenda** |
| Atendimento | 1 passo WhatsApp read-only (`AtendimentoWhatsAppStep.tsx:21`) | OK mínimo |
| Cérebro IA | Só o CRM tem cérebro (produto + knowledge). Salão não tem | Esperado por ora |

### Navegação dos 2 cérebros

| Item | Hoje (código) | Gap |
|---|---|---|
| Hub de módulos | `ModuleHub.tsx:70-72`, cards config-driven (`modules.ts:36-86`) | Filtra por **papel** (`visibility`), **não por `enabled_modules`** — módulo desativado ainda aparece e abre vazio |
| Submenu do salão | **Não existe.** `Sidebar.tsx` só renderiza navegação no contexto CRM (produto selecionado). Em `/salao` fica quase vazio | **Beco sem saída**: usuário tem que digitar `/salao/agenda` na URL |
| Rota do atendimento | `modules.ts:64` → `/admin?tab=inbox` | Módulo se chama "Atendimento" mas a URL é `/admin?tab=inbox`. Não existe `/atendimento` |
| Inbox em 2 lugares | `/admin?tab=inbox` (flow.ai) vs `/crm?tab=inbox` (SellerInbox) | Mesmo canal WhatsApp, zero sincronização |
| Cliente vs Lead | `clientes` (core, reusada — **não** é criada na migration do salão, é tabela pré-existente keyed por `organization_id`) vs `leads` (CRM, `types.ts:5932-6067`) | Sem ponte/FK entre as duas |

---

## Respostas diretas às suas perguntas

### 1. Cliente clicou em "comprar" na LP. O que acontece? Cadastra e-mail/telefone? Como o CRM está setado? Qual o funil da própria plataforma?

Hoje, **clicar na LP não inicia uma compra**. A `SalesPage.tsx` (rota `/vendas`) só tem um formulário que salva o interesse na tabela `sales_leads` (`SalesPage.tsx:95`) — coleta empresa, nome, e-mail, telefone, segmento, desafio. **Não há botão de comprar nem redirecionamento para checkout.**

O funil real da plataforma hoje é: cliente recebe um **link Cakto por fora** (e-mail/marketing/manual) → paga → o webhook `cakto-webhook` com `scope=platform` cria a empresa, o admin e dispara o e-mail de acesso. Ou seja, **o "cadastro" da empresa nasce do webhook de pagamento, não do clique na LP.**

### 2. Após checkout e pagamento, ele recebe a liberação por e-mail? Como está configurado?

**Sim, no caminho automático (Cakto platform).** Em `cakto-plan-provisioning.ts:256-282`, depois de criar o admin, o sistema gera um *recovery link* (`admin.auth.admin.generateLink({ type: 'recovery' })`) e envia pelo template `welcome-admin-access` para o `order.customer_email` — que é o mesmo e-mail do checkout. O cliente recebe o e-mail, define a senha e entra. **Não é login automático**, é um link de "criar/recuperar senha".

### 3. Precisamos de mensagens claras de ativação no checkout.

Hoje **não há nenhuma mensagem de orientação** ligada ao checkout (ele está fora do app). Proposta de mensagens exatas (PT-BR):

**Na página de preços / antes do checkout (CTA):**
> "Use o **mesmo e-mail** em que você quer receber o acesso. Após o pagamento aprovado, enviamos o link de acesso para esse e-mail em até 5 minutos."

**Tela de sucesso pós-pagamento (Cakto retorna para uma página de obrigado):**
> "Pagamento confirmado! 🎉 Enviamos o link de acesso para **{e-mail}**. Abra o e-mail, defina sua senha e comece a configurar seu salão. Não chegou em 5 min? Verifique o spam ou fale com a gente."

**No e-mail de boas-vindas (template `welcome-admin-access`):**
> "Seu acesso ao NexvyBeauty está pronto. Clique abaixo para **definir sua senha** e entrar. No primeiro acesso, vamos configurar seu salão em poucos passos."

### 4. Não seria melhor o LINK DE CHECKOUT ser ENVIADO ao cliente (WhatsApp/e-mail) para evitar duplicar cadastro?

**Sim — e é viável com o que já existe.** Avaliação factual:

- Já existe `PaymentLinkDialog.tsx` no inbox (`SellerInbox.tsx:1176`): hoje o vendedor **cola manualmente** uma URL de pagamento (Cakto/Stripe/Pix), grava em `payment_links` e envia no chat. **Limitação confirmada no código:** ele só aceita uma URL colada — **não gera o checkout nem injeta o e-mail do cliente.**
- O Cakto já está mapeado por plano (`checkout_url_cakto`) e o webhook já usa o `customer_email` que vem do pagamento.

**Desenho recomendado (elimina a duplicata):**

1. Super-admin/comercial gera o link a partir do **lead já existente** (`sales_leads`), pré-preenchendo `email`, `name`, `phone` na URL do Cakto (parâmetros de pré-preenchimento do checkout — **(A VERIFICAR)** o nome exato dos query params no painel Cakto).
2. Esse link é enviado por **WhatsApp/e-mail** (reaproveitando a infra do `PaymentLinkDialog` + envio do inbox).
3. Cliente paga **sem digitar e-mail de novo** (vem travado/pré-preenchido) → webhook recebe o **mesmo e-mail** → provisionamento cria a empresa com aquele e-mail → o e-mail de acesso vai para o **mesmo endereço**. **Zero duplicata.**

Esse desenho não pede arquitetura nova — estende o `PaymentLinkDialog` (gerar a partir do plano + lead, em vez de colar URL crua) e o painel de planos. É a forma mais simples de garantir consistência de e-mail.

### 5. A tela de primeiro check-in (era do CRM) precisa ser o ONBOARDING DE TUDO.

Hoje a `AcceptInvite.tsx` faz só: cria usuário + senha, aceita convite, vai para `/`. A criação de empresa e contatos **não acontece ali** (a org já vem pronta do super-admin/webhook). O `GuidedOnboarding` é que cobre identidade, módulos e setup — mas hoje é o **CRM que domina** (3 passos hardcoded) e o salão fica com 1 passo só.

Recomendação: transformar o fluxo `AcceptInvite → ModuleHub → GuidedOnboarding` num **onboarding único de todos os módulos** (detalhe na seção "Sequência de ativação unificada"), com: definição de senha, confirmação dos dados da empresa, escolha/confirmação de módulos, e setup ramificado por módulo (salão e CRM tratados igual, ambos via registry).

### 6. Amarrar os 2 SaaS (flow.ai + sales-spark).

Os dois rodam em silos. Pontos de costura na seção "Amarrar os 2 SaaS". Resumo: o `clientes` (salão) e `leads` (CRM) são tabelas diferentes na mesma org, sem ponte; o inbox aparece em dois lugares; a agenda do salão não conversa com o booking público.

### 7. Orientação das etapas internas (cadastra produto → cliente → próxima etapa).

A ordem **já é forçada pelo banco e pela UI**, mas não está explicada ao usuário:

| Módulo | Passo 1 | Passo 2 | Passo 3 | Passo 4 |
|---|---|---|---|---|
| **CRM** | Criar Produto (`EmptyState.tsx`, FK obrigatória) | Criar Estágios do Pipeline (`pipeline_stages`, FK de `leads`) | Atribuir Produto ao Vendedor (`user_product_assignments`) | Criar Lead |
| **Salão** | Criar Serviços (`Servicos.tsx`) | Criar Profissionais (`Profissionais.tsx`) | Criar Clientes (`Clientes.tsx`) | Criar Agendamento (`Agenda.tsx:225` botão travado sem os 3) |

O onboarding precisa **deixar essa ordem explícita** com um checklist de ativação que mostra "✓ Serviço → ✓ Profissional → ✓ Cliente → Agendar".

### 8. Telas falando "oficina" no Beauty.

Confirmado: ~7 pontos user-facing + código morto. Tabela completa na seção "Correção do bug oficina no Beauty".

---

## Sequência de ativação unificada (ponta a ponta)

> Fluxo ideal. Cada passo tem um **critério verificável (binário)**.

```
1. Venda (LP /vendas ou comercial)
2. Geração do link de checkout pré-preenchido (e-mail travado)
3. Cliente paga no Cakto
4. Webhook provisiona (empresa + admin)
5. E-mail de acesso (definir senha)
6. 1º acesso UNIFICADO (senha + confirma empresa + módulos)
7. Onboarding guiado RAMIFICADO por módulo
8. Ordem interna por cérebro
```

| # | Passo | O que acontece | Critério verificável (binário) |
|---|---|---|---|
| 1 | **Venda** | Lead na `sales_leads` ou contato comercial | Lead existe com e-mail + telefone válidos |
| 2 | **Link pré-preenchido** | `PaymentLinkDialog` (estendido) gera URL Cakto do plano com `email` travado | Abrir o link mostra o e-mail já preenchido e bloqueado |
| 3 | **Pagamento** | Cliente paga no Cakto | Cakto registra pedido `paid` |
| 4 | **Provisionamento** | `cakto-webhook scope=platform` cria org + admin | `organizations` tem 1 linha nova com `cakto_customer_email` = e-mail do checkout |
| 5 | **E-mail de acesso** | Template `welcome-admin-access` com recovery link | Cliente recebe e-mail no **mesmo** endereço; link abre tela de senha |
| 6 | **1º acesso unificado** | Define senha → confirma nome/identidade da empresa → escolhe módulos | Após salvar, `organizations.enabled_modules` deixa de ser vazio |
| 7 | **Onboarding ramificado** | Para cada módulo escolhido, roda os passos (via registry) | Cada módulo escolhido renderiza ≥1 passo de setup |
| 8 | **Ordem interna** | Checklist guia a sequência por cérebro | Botão "Agendar"/"Criar Lead" só habilita quando os pré-requisitos existem |

**Ordem interna por cérebro (o que o checklist deve mostrar):**

- **Salão:** Profissionais → Serviços → (Agenda fica liberada) → Clientes → Agendamento.
  - *Observação:* hoje o onboarding só tem "Serviços". Adicionar passos de Profissionais e Agenda. (No mapa, a UI da Agenda trava sem cliente+profissional+serviço — `Agenda.tsx:225-226`.)
- **CRM:** Produto → Estágios do Pipeline → Atribuir Produto a Vendedor → Cliente/Lead.

---

## Correção do bug "oficina no Beauty"

### Ocorrências user-facing (corrigir o texto)

| Arquivo:linha | Texto atual | Correção |
|---|---|---|
| `GuidedOnboarding.tsx:264` | "configurar sua **oficina** e seus módulos" | "configurar seu **salão**…" |
| `GuidedOnboarding.tsx:482` | "módulos que sua **oficina** vai usar" | "módulos que seu **salão** vai usar" |
| `GuidedOnboarding.tsx:1339` | "Sua **oficina** está configurada" | "Seu **salão** está configurado" |
| `OficinaServicesStep.tsx:73` | "Serviços da **oficina**" | "Serviços do **salão**" |
| `OficinaServicesStep.tsx:75` | "…sua **oficina**… **ordens de serviço** e orçamentos" | "…seu **salão**… **agendamento**" |
| `OficinaServicesStep.tsx:17-28` | `SERVICOS_PADRAO` automotivo (troca de óleo, freios, pneus) | Trocar por padrões de salão (corte, escova, manicure, etc.) |
| `AtendimentoWhatsAppStep.tsx:39` | "conversas da sua **oficina** no inbox" | "conversas do seu **salão**…" |
| `Sidebar.tsx:188-192` | Link "**ERP Oficina**" (ícone Wrench → `/oficina`) | **Remover** ou redirecionar `/oficina → /salao` |
| `PlatformSettings.tsx:626` | placeholder "**NexvyOficinas** — Gestão para sua oficina" | "NexvyBeauty — Beleza com gestão inteligente" |
| `src/docs/content/*.tsx` (vendedor, conceitos, superAdmin, desenvolvedor, registry) | ~13+ ocorrências de "NexvyOficinas" | Substituir por "NexvyBeauty" onde for conteúdo vivo |

### Código legado morto (remover ou redirecionar)

| Alvo | Linhas (aprox.) | Ação |
|---|---|---|
| `src/pages/oficina/*` (Dashboard, Clientes, Veiculos, Ordens, Orcamentos, Financeiro, _shared) | ~963 | Remover (tabelas de oficina não existem no Beauty). Manter em git history |
| `App.tsx:45-51` (imports lazy oficina) + `App.tsx:219-224` (6 rotas `/oficina/*`) | 12 | Remover, ou registrar redirect `/oficina/* → /salao/*` |
| `registry.tsx:32-38` (passo `erp_oficina`) + `OficinaServicesStep.tsx` | ~140 | Renomear/migrar para `SalaoServicesStep` no Beauty |
| Comentários legados em `salao/Agenda.tsx:46`, `salao/Profissionais.tsx:22`, `GuidedOnboarding.tsx:92,125` | — | Limpar (cosmético) |

> Confirmado nos mapas: **o Beauty não depende de nenhum código de oficina** (tabelas não existem, RLS bloqueia). Remover é seguro.

---

## Amarrar os 2 SaaS (flow.ai + sales-spark)

| Atrito / duplicação | Hoje | Como unificar (recomendação) |
|---|---|---|
| **Cliente vs Lead vs Contato** | `clientes` (core, reusada — não nasce na migration do salão) vs `leads` (CRM) vs contatos do inbox flow.ai. Sem ponte | Definir uma **entidade-pessoa canônica por org** (telefone/e-mail normalizado como chave). Mínimo: criar vínculo `lead.cliente_id` (ou view unificada) para o cliente que agendou poder virar lead. **(decisão sua: fundir tabelas ou só ligar com FK)** |
| **Agenda do salão vs Booking público** | `agendamentos` (interno, `migrations_salao`) vs `booking_requests` (público, flow.ai) | Tratar booking público como **fonte** que cria/atualiza um `agendamento`. Ponte de entrada: booking aprovado → cria agendamento + (opcional) cliente |
| **Inbox em 2 lugares** | `/admin?tab=inbox` (flow.ai) vs `/crm?tab=inbox` (SellerInbox) | Escolher **um inbox canônico** por org. No Beauty, o inbox do atendimento deve ser o ponto único; o CRM consome as mesmas conversas. **(decisão sua)** |
| **Produto CRM vs Serviço do salão** | `products` (CRM) vs `servico_catalogo` (salão) | Manter separados por ora (são conceitos diferentes), mas **não exigir produto CRM** para usar o salão. Garantir gating por módulo correto |
| **Navegação** | Sidebar vazio em `/salao`; sem abas Agenda/Clientes/Profissionais | Criar **submenu/abas do salão** (Agenda · Clientes · Profissionais · Serviços · Financeiro) dentro de `/salao/*`. Hoje confirmado: `Sidebar.tsx` não tem isso |
| **Gating do Hub** | `ModuleHub.tsx:70-72` filtra só por papel, ignora `enabled_modules` | Fazer o Hub consultar `usePlanModules` (que já cruza plano ∩ enabled) para **não mostrar módulo que a org não ativou** |

---

## Roadmap faseado

> Esforço: P (pequeno, < 1 dia) · M (médio, 1-3 dias) · G (grande, > 3 dias).

### Fase 0 — Quick wins (texto e mensagens, sem risco)

| O que | Por que | Critério verificável | Esforço | Dep. |
|---|---|---|---|---|
| Corrigir 7 textos "oficina" user-facing | Usuário de salão vê "oficina" no onboarding | Buscar "oficina" nas telas vivas retorna 0 ocorrências user-facing | P | — |
| Trocar `SERVICOS_PADRAO` para serviços de salão | Hoje sugere "troca de óleo" no Beauty | Passo de serviços lista corte/escova/manicure | P | — |
| Remover/redirecionar link "ERP Oficina" da Sidebar | Beco sem saída para `/oficina` | Sidebar não mostra "ERP Oficina"; `/oficina` redireciona p/ `/salao` | P | — |
| Mensagens claras de checkout/sucesso/e-mail (copy da pergunta #3) | Cliente não sabe que recebe acesso por e-mail | Tela de sucesso e e-mail exibem as frases-chave | P | — |
| Placeholder branding `PlatformSettings.tsx:626` | Mostra "NexvyOficinas" | Placeholder = "NexvyBeauty…" | P | — |

### Fase 1 — Navegação do salão e gating do Hub

| O que | Por que | Critério verificável | Esforço | Dep. |
|---|---|---|---|---|
| Submenu/abas do salão (`/salao/*`) | Hoje sem navegação interna | Em `/salao/agenda` consigo ir para Clientes/Profissionais por clique | M | — |
| Hub respeitar `enabled_modules` | Módulo desativado abre vazio | Card de módulo não-ativado não aparece (ou aparece "ativar") | P | — |
| Checklist de ativação por módulo (ordem interna) | Usuário não sabe a sequência | Checklist mostra ✓/○ por passo e linka direto | M | Fase 0 |

### Fase 2 — Onboarding unificado e ramificado

| O que | Por que | Critério verificável | Esforço | Dep. |
|---|---|---|---|---|
| Mover CRM para o registry (igual salão/atendimento) | CRM hardcoded, inconsistente | `registry.tsx` lista os 3 passos CRM; `GuidedOnboarding` não tem passos hardcoded | M | — |
| Adicionar passos Salão: Profissionais + Agenda | Hoje só "Serviços" | Ao ativar salão, onboarding pede profissionais e agenda | M | Fase 1 |
| 1º acesso confirma dados da empresa | Hoje só senha + convite | Tela exibe e permite confirmar nome/identidade da org | P | — |
| Garantir `enabled_modules` (migration tipada) | Hoje lido com `as any` **(A VERIFICAR)** | Coluna existe na migration e em `types.ts`; DoneStep grava | P | — |

### Fase 3 — Link de checkout pré-preenchido (anti-duplicata)

| O que | Por que | Critério verificável | Esforço | Dep. |
|---|---|---|---|---|
| Estender `PaymentLinkDialog` p/ gerar link do plano + e-mail travado | Hoje só cola URL crua | Gerar link a partir de lead+plano produz URL Cakto com e-mail | M | **(A VERIFICAR)** params Cakto |
| Enviar link por WhatsApp/e-mail | Evita o cliente redigitar e-mail | Cliente recebe link e paga sem digitar e-mail | P | acima |
| Validar 1:1 e-mail checkout → acesso | Fechar o loop anti-duplicata | E-mail do acesso = e-mail do lead original | P | acima |

### Fase 3 EXPANDIDA + Fase A — Afiliados, Tracking & Captura (atualização 2026-06-19)

> O Estágio 0 foi **reformulado** (afiliados + rastreamento canal/plataforma + captura robusta antes do checkout). A Fase 3 cresceu e ganhou uma **Fase A — Afiliados & Atribuição**. Detalhe completo, benchmark (UTMify/Voxuy), arquitetura e tabelas novas em **`ESTAGIO0-AFILIADOS-TRACKING-CAPTURA.md`**. Resumo:
> - **Fase 3 (expandida):** botão "Comprar" + modal de captura multi-step + cookie de tracking (`ref` + 5 UTMs) + Edge Function de captura (lead tagueado server-side) + redirect Cakto pré-preenchido + recuperação WhatsApp.
> - **Fase A (nova):** tabelas `affiliates` / `affiliate_links` / `affiliate_commissions`, `cakto-webhook` passando a **atribuir a venda ao afiliado** (lê `data.affiliate`/`utm_*`), e painel mínimo do afiliado (link · vendas · comissão).

### Fase 4 — Costura dos 2 cérebros (dados)

| O que | Por que | Critério verificável | Esforço | Dep. |
|---|---|---|---|---|
| Ponte cliente do salão ↔ lead do CRM | Pessoa que agendou nunca vira lead | Cliente com telefone igual a um lead aparece vinculado | G | decisão Marcelo |
| Booking público → cria agendamento | Dois universos de agenda | Booking aprovado gera um `agendamento` | G | decisão Marcelo |
| Inbox canônico único | Mesmo WhatsApp em 2 telas | Mensagem aparece num só inbox de referência | G | decisão Marcelo |

### Fase 5 — Limpeza de código morto

| O que | Por que | Critério verificável | Esforço | Dep. |
|---|---|---|---|---|
| Remover `src/pages/oficina/*` + rotas | ~963 linhas inúteis no bundle | Build passa sem arquivos de oficina; nenhum import quebrado | M | Fase 0 |
| Limpar comentários legados | Débito técnico | Sem menção a oficina no código do salão | P | — |

---

## Decisões pendentes (suas)

1. **Self-serve vs assistido:** a venda do NexvyBeauty deve ter página de preços pública com "Comprar" (self-serve total), ou continua comercial-assistido (link enviado)? Isso define se priorizamos a página de pricing ou o `PaymentLinkDialog` estendido.
2. **Link pré-preenchido:** confirmar que o checkout Cakto aceita pré-preencher e *travar* o e-mail por query param **(A VERIFICAR no painel Cakto)**. Sem isso, a garantia anti-duplicata cai para "instruir o cliente a usar o mesmo e-mail".
3. **Cliente vs Lead:** fundir as tabelas `clientes` (salão) e `leads` (CRM) numa entidade-pessoa única, ou só ligar com FK (`lead.cliente_id`)? Fusão é mais limpa mas mais arriscada.
4. **Inbox canônico:** qual inbox é a fonte da verdade no Beauty — o do atendimento (flow.ai) ou o do CRM (SellerInbox)?
5. **Agenda canônica:** booking público alimenta a agenda do salão automaticamente, ou ficam separados?
6. **Código oficina:** remover de vez `src/pages/oficina/*` (recomendado) ou manter dormente?
7. **`enabled_modules`:** confirmar se a coluna já existe em migration tipada ou se precisa criar **(A VERIFICAR)**.
