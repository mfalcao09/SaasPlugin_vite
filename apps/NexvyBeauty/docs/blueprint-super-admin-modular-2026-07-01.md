# Blueprint — Super-Admin Modular (Módulo Vendas/CRM + Módulo ERP/Gestão)

**Data:** 2026-07-01 · **Contexto:** `gestao.*` deixa de ser um "painel de super-admin" e vira uma **plataforma modular** (padrão do ecossistema: ERP, Intentus). Dois módulos segregados: **Vendas (CRM Vendus Remix)** = operação comercial de venda do nosso SaaS; **ERP/Gestão (Super Admin)** = gestão do SaaS (empresas, assinaturas, financeiro). Base de evidência: estudo do bench **Intentus** + **matriz de conflito** CRM ⟷ super-admin (ambos por subagente, sobre o código).

---

## 0. A MÁXIMA (lei que governa todo o desenho)

> **"Vendemos um CRM + ERP para o tenant × teremos um CRM e um ERP para a nossa operação."**

A "duplicação" é **permanente e intencional** — não é bug a deduplicar. O tenant tem o CRM+ERP dele (operar o salão); **nós** temos o nosso (vender o SaaS). Regras:
- **Nunca fundir através da fronteira tenant↔plataforma.** Uma tela que serve o **admin do tenant** fica intocada; a nossa é uma **instância separada**.
- **Só unificar DENTRO da mesma instância** (ex: `sales_leads` + `platform_crm_leads` são ambos NOSSOS → podem fundir; leads do tenant → jamais).
- **Correção à matriz §5:** onde diz "fundir Cakto/Leads", releia como "2 escopos servindo 2 clientes (tenant × nós)" — mantém os dois; a resolução é **classificar o escopo certo**, não mesclar.

---

## 1. Modelo mental

- **Plataforma = 2 módulos.** O usuário troca de módulo por um **ModuleSwitcher** no header (grid de ícones), como no Intentus. Um **shell/layout único** serve os dois; a **sidebar muda** conforme o módulo ativo.
- **Módulo VENDAS (CRM):** motor comercial completo (Dashboard/Central de Operação, Mia, Pipeline, Leads, Agenda, Atendimentos, Automação&IA, Captação, Gestão-de-vendas, Config-de-vendas). Roda **desacoplado** em `platform_crm_*` (RLS super_admin). É a operação de VENDER o NexvyBeauty pra salões.
- **Módulo ERP/GESTÃO (Super Admin):** gestão do nosso SaaS — **Empresas, Usuários, Assinaturas, Faturamento, Pagamentos (billing SaaS), Cakto-platform, Planos (CRUD), Afiliados, Sistema/Observabilidade**. **Estruturalmente segregado** — não vive no CRM e não deve.
- **Eixo de modularização = o módulo** (Vendas | ERP), não um `scope` compartilhado (ver §4). **Isolamento de dado = RLS no backend** (o front só decide o que mostrar) — lição direta do Intentus.

---

## 2. Padrão de shell (do Intentus, com 1 melhoria)

| Peça | Intentus | Aqui |
|---|---|---|
| Shell | `AppLayout` único (SidebarProvider + header + `<Outlet/>`) | igual — 1 shell p/ os 2 módulos |
| Registry | `MODULE_DEFINITIONS[]` em `useActiveModule.tsx` (id/label/icon/color/pathPatterns) | copiar quase literal |
| Troca de módulo | `ModuleSwitcher` (Popover grid) + `navigate(landing)` | igual |
| Rotas | 100% flat, módulo **inferido do path** (localStorage) | igual (mantém simples) |
| Sidebar | `switch(activeModule)` → `NavItem[]` + seções colapsáveis | **melhoria:** nav **dentro** de cada `ModuleDefinition` (sem o switch gigante — dívida do Intentus com 15 módulos) |
| Gating | 3 eixos: role · entitlement/plano · permissão-de-página | adotar (já dá plano/add-on por módulo de graça) |
| Tema | — | **o atual (rosa/claro)** — decisão do Marcelo |

---

## 3. Sidebar / IA dos 2 módulos (tema atual, colapsável)

### Módulo **VENDAS** (`platform_crm_*`, desacoplado)
- **Topo:** Dashboard (Central de Operação) · Funil (Pipeline) ✅ · Contatos (Leads) ✅ · Agenda
- **Atendimentos:** Chat · Painel · Radar IA · Follow-Up · Relatórios
- **Automação & IA:** Agentes IA · Campanhas · Cadências · Webhooks
- **Captação:** Quiz · Formulários · ChatBot · Widget · WhatsApp · Templates · Resultados · Analytics
- **Gestão de Vendas:** Negócios · Comissões · Metas · Setores · Equipes · Financeiro (de vendas) · Pagamentos (de vendas)
- **Config (de vendas):** Conexões · Campos · Etiquetas · Notificações · Horários
> Vivos hoje: Funil + Contatos. Data-ready (só UI): Negócios/Comissões/Metas/Setores/Equipes/Etiquetas/Campos/Relatórios. Stub "em breve": Mia/Atendimentos/Automação/Captação/Agenda (backend pesado, progressivo).

### Módulo **ERP / GESTÃO** (super-admin atual — mantido)
- **Topo:** Dashboard da Plataforma (MRR/ARR/saúde) · Empresas · Usuários
- **Comercial (SaaS):** Planos (CRUD) · Assinaturas · Faturamento · Pagamentos (Cakto — billing SaaS)
- **Crescimento:** Afiliados · Pagamentos (Vendas)
- **Infra/Provisioning:** WhatsApp/Evolution · Integrações · Identidade Visual · E-mail
- **Observabilidade & Suporte:** Central de Ajuda · Suporte · Ações dos Agentes · Qualidade da IA · Atualizações · Logs · Saúde

---

## 4. Decisão de desacoplamento (o crux — recomendo, você bate o martelo)

A matriz recomendou **1 motor parametrizado por `scope: tenant|platform`** (DRY). **Eu recomendo NÃO seguir isso** no eixo plataforma↔tenant:

- **Dado:** já desacoplado e **inegociável** — Vendas roda em `platform_crm_*`, ERP nas tabelas de plataforma. ✅
- **Componente:** o módulo Vendas usa **componentes próprios** (`superadmin/crm/*`, reimportados do original limpo), **NÃO** compartilhados com o cockpit do tenant. Motivo: (a) seu mandato de desacoplamento; (b) os componentes do fork estão **mortos/salon-izados** — compartilhar reacoplaria ao lixo. Custo: alguma duplicação de código (aceitável e isolada).
- **Limpeza obrigatória:** o `AffiliatesPanel` atual **importa** `ReportsManager`/`FinancialDashboard`/`TeamManager` do **admin do tenant** — isso **viola** o desacoplamento (super-admin dependendo de código do tenant). Trocar por componentes de plataforma.

---

## 5. Resoluções de conflito (condensado da matriz)

| Conflito | Resolução |
|---|---|
| **Afiliados (ERP) ⟷ Vendedores/Equipes (CRM)** | É **cópia física** (AffiliatesPanel importa 3 componentes do tenant). Afiliados fica no ERP mas com **modelo de dados próprio** (GAP §6); a gestão de vendedores/squads da venda-da-plataforma fica no módulo Vendas. |
| **Cakto** | `CaktoSuperAdminPanel` (scope=platform, billing do SaaS) = **ERP legítimo, fica**. `CaktoAdminPanel` aparece 2× (duplicado) → **fundir**. |
| **Leads (triplo): Contatos + Leads Comerciais + Leads-CRM** | **Fundir** em Contatos (`platform_crm_leads`); `sales_leads` da LP entra direto como inbound. |
| **WhatsApp/Evolution ⟷ Conexões** | **NÃO fundir.** ERP **provisiona** instâncias (infra/QR/multi-tenant); Vendas **consome** a conexão. Formalizar a fronteira. |
| **Planos (CRUD) ⟷ Config-Plano** | ERP = **cria** o catálogo (super-admin); Vendas/tenant = **lê** o próprio plano. Segrega por permissão, não funde. |
| **Dashboard / Relatórios / Financeiro** | Mesmo componente-base, **KPIs por módulo** (Vendas = funil; ERP = MRR/tenants). |

---

## 6. Os 2 GAPs reais (construir-novo — não existem em lugar nenhum)

1. **Ciclo de vida de assinatura** (dunning, upgrade/downgrade, proração, cobrança recorrente real). O `SubscriptionsManager` atual é só CRUD de vínculo tenant↔plano. **Falta o motor.**
2. **Modelo de dados de Afiliado** (platform-level). O `AffiliatesPanel` declara no código: "modelo será ligado depois". Hoje mostra dado do escopo errado.

---

## 7. Fases de build (execução em /loop, orquestrador + subagentes, validação Chrome)

- **Fase A — Shell modular:** `AppLayout` + registry (`MODULE_DEFINITIONS`) + `ModuleSwitcher` + os 2 módulos com nav própria, tema atual. Vendas: Funil/Contatos vivos + resto stub/data-ready. ERP: seções atuais reorganizadas nos grupos (limpando os imports de tenant do AffiliatesPanel). **👁 marco:** trocar de módulo no header muda o sidebar; nada do super-admin se perde. 🔒 tenant em `app.*` intocado.
- **Fase B — Data-ready Vendas:** wire Negócios/Comissões/Metas/Setores/Equipes/Etiquetas/Campos/Relatórios (componentes → `platform_crm_*`).
- **Fase C — Conflitos:** fundir Cakto duplicado; fundir Leads triplo; formalizar fronteira Evolution/Conexões; Planos por permissão.
- **Fase D — GAPs:** motor de ciclo de vida de assinatura + modelo de afiliado.
- **Fase E — Heavy (progressivo):** Mia · Atendimentos (inbox) · Automação&IA · Captação · Agenda — cada um conforme portamos o backend. (Instagram DM entra aqui, no inbox de Atendimentos.)

---

## 8. Gate de aprovação

Aprova o blueprint (especialmente **§4 desacoplamento de componente** e a **IA dos 2 módulos §3**) → disparo a **Fase A** (shell modular). Sem build até seu ok — o desenho modular é a espinha; errar aqui custa caro.
