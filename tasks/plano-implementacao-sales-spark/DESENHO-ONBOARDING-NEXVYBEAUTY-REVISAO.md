# Desenho do Onboarding NexvyBeauty — da compra à plataforma (para revisão)

**Para:** Marcelo (fundador) · **Data:** 2026-06-18 · **Status:** desenho para sua revisão **antes** de construir as Fases 2 e 3.

> Legenda: ✅ **No ar** (já funciona, verificado no código) · 🔧 **A construir** (Fase 2 ou 3). Funil escolhido: **"os dois"** — comercial-assistido agora, self-serve depois.

---

## A jornada em 8 estágios (visão geral)

| # | Estágio | Cliente vê | Status |
|---|---|---|---|
| 0 | Descoberta & compra | LP única (afiliado + UTM) + captura robusta | 🔧 Fase 3 + Fase A |
| 1 | Checkout (Cakto) | Paga; e-mail + tracking carregados | 🔧 Fase 3 |
| 2 | Provisionamento automático | (bastidor) empresa + admin criados | ✅ No ar |
| 3 | E-mail de acesso | "Defina sua senha" | ✅ No ar |
| 4 | 1º acesso unificado | Senha → empresa → módulos | 🔧 Fase 2 |
| 5 | Onboarding ramificado | Passos de cada módulo escolhido | 🔧 Fase 2 |
| 6 | Checklist de ativação | "Ative seu salão" (ordem) | ✅ Fase 1 |
| 7 | Operação | Agenda, atende, vende | ✅ No ar |

**Tradução:** o **meio da jornada já está pronto** (pagou → empresa criada → e-mail de acesso). O que falta construir está nas **duas pontas**: a **entrada** (como ele compra) e o **miolo do onboarding** (deixar o setup de TODOS os módulos num fluxo só e ramificado).

---

## Os dois caminhos de venda (você escolheu "os dois")

### 🅰️ Comercial-assistido (começamos por aqui — Fase 3)
1. Cliente demonstra interesse (LP `/vendas` salva o lead com nome/e-mail/telefone).
2. Você ou o comercial **gera o link de checkout do plano já pré-preenchido com o e-mail dele** e envia por **WhatsApp/e-mail**.
3. Ele paga **sem digitar e-mail de novo** → garante e-mail único, sem duplicar cadastro.

**Por que primeiro:** elimina o risco de e-mail duplicado e dá controle de quem entra. Reaproveita o `PaymentLinkDialog` que já existe no inbox.

### 🅱️ Self-serve (depois — Fase 3+)
1. Página de **preços pública** com botão **"Comprar"** que leva direto ao checkout Cakto.
2. Escala sem comercial, mas depende de **instruir o cliente a usar o mesmo e-mail** (não dá pra travar 100%).

> Os dois caminhos **desembocam no mesmo lugar**: o checkout do Cakto → provisionamento automático (estágio 2). A diferença é só como ele chega ao checkout.

---

## Estágio a estágio (detalhado)

### Estágio 0 — Descoberta & compra 🔧 Fase 3 + Fase A (REFORMULADO)

> **Reprojetado** para suportar **afiliados + rastreamento (canal + plataforma) + captura robusta**. Detalhe completo — benchmark UTMify/Voxuy, arquitetura, tabelas novas e roadmap — em **`ESTAGIO0-AFILIADOS-TRACKING-CAPTURA.md`**.

- **👤 Cliente vê:** uma **LP única** (idêntica para todos), aberta por um link de afiliado/anúncio (`/vendas?ref=<afiliado>&utm_source=meta&...`). Ao clicar **"Comprar"**, um **modal de captura robusta** (multi-step) pede **nome, e-mail, WhatsApp** + qualificação (Instagram, dor principal…).
- **⚙️ Bastidor:** a LP persiste `ref` (canal/afiliado) + 5 UTMs (plataforma) em **cookie 1st-party**; o submit cria o **lead tagueado server-side** (canal + plataforma + `affiliate_id`); o cliente segue pro checkout Cakto **pré-preenchido** carregando o tracking (e o e-mail, que mata a duplicidade).
- **🔧 O que entra:** botão "Comprar", modal multi-step, tabelas `affiliates` / `affiliate_links` / `affiliate_commissions`, e o `cakto-webhook` passando a **atribuir a venda ao afiliado** (comissão). Mesmo quem **não pagar** fica salvo → habilita **recuperação no WhatsApp** (estilo Voxuy).

### Estágio 1 — Checkout (Cakto) 🔧 Fase 3 (mensagens)

- **👤 Cliente vê:** a tela de pagamento do Cakto (fora do nosso app), com o **e-mail já preenchido** (assistido).
- **⚙️ Bastidor:** o Cakto processa o pagamento. O e-mail do checkout é o que vai virar o login.
- **🔧 O que entra (mensagens claras — você cola no painel Cakto):**
  - *Antes de pagar:* "Use o **mesmo e-mail** em que você quer receber o acesso. Após o pagamento aprovado, enviamos o link em até 5 minutos."
  - *Tela de obrigado:* "Pagamento confirmado! 🎉 Enviamos o link de acesso para o seu e-mail. Abra, defina sua senha e configure seu salão."

### Estágio 2 — Provisionamento automático ✅ No ar

- **👤 Cliente vê:** nada (acontece em segundos, nos bastidores).
- **⚙️ Bastidor (já funciona):** o `cakto-webhook` recebe "pago" e o `cakto-plan-provisioning`:
  1. cria/acha a **empresa** (`organizations`) pelo e-mail do checkout;
  2. cria o **usuário admin** com esse mesmo e-mail;
  3. define o **plano** da empresa (o plano determina **quais módulos ela pode ativar**);
  4. dispara o e-mail de acesso.
- **Sem ação sua.** É 100% automático no caminho Cakto-plataforma.

### Estágio 3 — E-mail de acesso ✅ No ar (copy a melhorar)

- **👤 Cliente vê:** o e-mail "Seu acesso de administrador está pronto" → clica no botão → cai numa tela para **definir a senha**.
- **⚙️ Bastidor:** template `welcome-admin-access` com um *link de recuperação* (definir senha) para o **mesmo e-mail** do checkout.
- **Observação:** esse e-mail é **compartilhado entre todos os SaaS** (Oficinas, Beauty…), por isso é neutro de propósito — **não** vamos escrever "salão" nele.

### Estágio 4 — 1º acesso unificado 🔧 Fase 2

> **Hoje já existe a base:** depois de definir a senha, o cliente cai no **Hub de Módulos** e o **onboarding guiado abre sozinho** (é o "1 de 5" que você viu). O que a Fase 2 faz é **deixar esse fluxo único e completo**.

- **👤 Cliente vê (alvo):** uma sequência só, que cobre **tudo**:
  1. **Definir senha** (já existe)
  2. **Confirmar os dados da empresa** (nome, identidade visual) — 🔧 novo na Fase 2
  3. **Escolher/confirmar os módulos** que vai usar (já existe — passo "Módulos") — isso grava o `enabled_modules` da empresa, que é o que o Hub respeita (Fase 1 ✅)
- **⚙️ Bastidor:** hoje a tela de aceite (`AcceptInvite`) só troca a senha; quem faz o setup é o `GuidedOnboarding`. A Fase 2 costura os dois para o cliente sentir **um fluxo só**, cobrindo salão + CRM + atendimento (e não "só CRM" como é hoje).

### Estágio 5 — Onboarding ramificado por módulo 🔧 Fase 2

- **👤 Cliente vê (alvo):** depois de escolher os módulos, ele faz **só os passos dos módulos que escolheu**:
  - **Salão** → cadastrar **Profissionais** → **Serviços** → (Agenda liberada) *(hoje só tem "Serviços"; Fase 2 adiciona Profissionais e Agenda)*
  - **CRM** → cadastrar **Produto** → conectar **WhatsApp** → criar **Agente IA** *(hoje existe, mas "chumbado"; Fase 2 organiza igual aos outros)*
  - **Atendimento** → conectar um número de **WhatsApp**
- **⚙️ Bastidor:** todos os passos passam a vir de um **registro único** (`registry`), então cada módulo mostra os seus e nada de outro nicho aparece. (É também aqui que matamos de vez qualquer resíduo de fluxo.)

### Estágio 6 — Checklist de ativação ✅ Fase 1 (já no ar)

- **👤 Cliente vê:** ao entrar no **Salão**, um card **"Ative seu salão"** com a ordem certa e ✓/○ por passo:
  **Profissionais → Serviços → Clientes → 1º agendamento.** Clicou, vai direto pra tela. Some quando tudo está cadastrado.
- **No CRM**, o equivalente: a tela vazia diz **"Cadastre seu primeiro produto"** → e a sequência segue Produto → Pipeline → Vendedor → Lead.
- **⚙️ Bastidor:** o checklist conta os registros reais de cada tabela por empresa. Já está em produção (Fase 1).

### Estágio 7 — Operação do dia a dia ✅ No ar

- **👤 Cliente vê:** o **Hub** mostra só os módulos que ele ativou (Fase 1 ✅). Ele agenda horários, atende no WhatsApp e (se usar o CRM) trabalha o pipeline.
- **⚙️ Bastidor:** cada empresa só enxerga os próprios dados (segurança por empresa). Tudo já operante.

---

## O que muda em relação a hoje (resumo honesto)

| Estágio | Hoje | Depois (Fases 2/3) |
|---|---|---|
| Comprar | Só formulário de interesse | Link de checkout pré-preenchido (e depois página de preços) |
| Checkout | Sem orientação | Mensagens claras de "mesmo e-mail / acesso por e-mail" |
| Provisionar | ✅ Já automático | (sem mudança) |
| E-mail acesso | ✅ Já envia | (sem mudança) |
| 1º acesso | Senha + onboarding "CRM-pesado" | Fluxo único: senha + empresa + módulos |
| Onboarding | Só "Serviços" no salão; CRM chumbado | Passos completos por módulo, ramificados |
| Ativação | ✅ Checklist do salão (Fase 1) | (sem mudança) |

---

## Pontos que dependem de você (decisões antes de eu construir)

1. **Link pré-preenchido (Cakto):** preciso confirmar no painel do Cakto se dá pra **travar** o e-mail por parâmetro. Se não der, a garantia anti-duplicata vira "instruir o cliente a usar o mesmo e-mail".
2. **Confirmar dados da empresa no 1º acesso:** você quer esse passo (nome + logo/cor) logo no começo, ou prefere deixar opcional/depois?
3. **`enabled_modules`:** confirmar se a coluna já existe como migration tipada (está marcado A VERIFICAR no plano) — é o que liga o "escolher módulos" ao "Hub esconde o que não foi ativado".
4. **Identidade no onboarding:** quanto do branding (logo, cor) você quer pedir no 1º acesso vs deixar pré-configurado pela plataforma.

---

## O que eu construo na Fase 2 e 3 (escopo)

**Fase 2 — onboarding unificado/ramificado** (estágios 4 e 5):
- 1º acesso vira fluxo único (senha + empresa + módulos).
- Passos do salão completos (Profissionais + Agenda, além de Serviços).
- CRM movido para o mesmo "registro" dos outros (consistência).
- Garantir a coluna `enabled_modules` tipada.

**Fase 3 — checkout assistido + mensagens** (estágios 0 e 1):
- Gerar link de checkout pré-preenchido a partir do lead (estende o `PaymentLinkDialog`).
- Enviar por WhatsApp/e-mail.
- Mensagens claras de checkout/sucesso (copy acima).
- (Self-serve / página de preços fica para uma fase seguinte.)
