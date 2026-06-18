# Guia: como o NexvyBeauty é usado (fluxo de ponta a ponta)

> **Para:** Marcelo (fundador) · **Data:** 2026-06-18
> **Objetivo:** entender o fluxo de uso/onboarding, onde estão as funções, e separar "quebra real" de "fluxo não-explicado".

---

## 1. O modelo em 1 minuto

O sistema é uma **plataforma SaaS multi-empresa**. A hierarquia é:

```
PLATAFORMA (você, super admin)
   └── EMPRESAS / tenants  (cada salão = 1 organização)
          └── USUÁRIOS  (papéis: admin · gerente · vendedor)
                 └── PRODUTOS  (o que a empresa vende)
                        └── MÓDULOS  (CRM, Salão, Atendimento, Admin)
```

**Regra de ouro:** quase tudo é "por empresa". Um usuário pertence a **uma** empresa (`organization_id`). A segurança (RLS) garante que cada empresa só vê os próprios dados.

---

## 2. Os 3 níveis de usuário (papéis)

| Papel | Quem é | O que vê/faz |
|---|---|---|
| **Super Admin** (você) | Dono da plataforma | TODAS as empresas. Cria empresas, planos, billing. Pode "entrar" em qualquer empresa (impersonar). É o único que vê "Gestão da Plataforma". |
| **Admin da empresa** | Dono/gerente de 1 salão | Configura a empresa: produtos, equipe, integrações, identidade. Vê os módulos do plano dela. |
| **Vendedor / Profissional** (seller) | Operador do dia a dia | Opera no CRM os produtos que o admin liberou pra ele. |

---

## 3. O fluxo de uso — passo a passo (6 fases)

| Fase | Quem | O que acontece | Onde |
|---|---|---|---|
| **1. Setup da plataforma** (1x) | Super admin | 1º acesso: define senha, marca plataforma como pronta | `/super-admin` |
| **2. Criar empresa** (N×) | Super admin | Cria a organização (nome, plano) → o sistema cria o **admin** dela e um convite | `/super-admin → Organizações` (`OrganizationCreateForm`) |
| **3. Admin entra** | Admin | Aceita o convite / loga → cai no **Hub de Módulos** | `/aceitar-convite` ou `/login` → `/` |
| **4. Onboarding guiado** | Admin | Wizard de 6-8 passos: identidade (logo/cor) → escolhe módulos → **cria produto** → conecta WhatsApp → cria agente IA → convida equipe | `GuidedOnboarding` (dispara no 1º acesso do admin) |
| **5. Equipe usa** | Vendedores | Aceitam convite → veem os produtos atribuídos → trabalham o CRM | `/crm` |
| **6. Suporte** | Super admin | "Entra" em qualquer empresa (impersonação) para configurar/testar | botão **"Acessar Empresa..."** na topbar |

---

## 4. Os 5 módulos e o que cada um faz (onde estão as funções)

| Módulo | Rota | O que tem dentro |
|---|---|---|
| **Gestão do Salão** ✂️ | `/salao` | Dashboard, **Agenda**, Profissionais, Serviços, Clientes, Financeiro. *(vertical novo, feito no cascateamento)* |
| **CRM de Vendas** 📈 | `/crm` | Pipeline (Kanban), Leads, Inbox, Tarefas, Agendamentos, Cadências, Playbooks, Objeções, Materiais, **IA Copiloto** — tudo **por produto** |
| **Atendimento** 💬 | `/admin?tab=inbox` | Inbox central: WhatsApp, webchat, templates, filas |
| **Administração** ⚙️ | `/admin` | **Produtos**, Equipe, Integrações (Cakto/Hotmart/FB/Google), Captura (formulários/quiz/chatbot/funis), Agentes IA, Webhooks, Campanhas, Cadências |
| **Gestão da Plataforma** 👑 | `/super-admin` | *(super admin só)* Organizações, Usuários, Planos, Billing, White-label, Auditoria, Saúde |

---

## 5. A distinção-chave (a fonte da confusão)

O NexvyBeauty tem **dois "cérebros"** convivendo:

- **🅰️ Operacional do salão** (`Gestão do Salão`) — construído no cascateamento. **Pronto pra usar**: cadastra profissionais/serviços, agenda horários, atende clientes. **É o coração de um salão.**
- **🅱️ Máquina de vendas** (`CRM de Vendas` + Captura + IA) — herdada do sales-spark (Oficinas). É um CRM **organizado por PRODUTO**, pensado pra **vender** (pacotes, planos, alto ticket) com pipeline, leads, cadências e IA. **Só funciona depois de cadastrar produtos.**

> **Para um salão, o uso natural começa pelo 🅰️ (Agenda).** O 🅱️ (CRM) é opcional/avançado — útil se o salão quiser vender pacotes e prospectar leads. **Não é obrigatório pra operar.**

---

## 6. Por que o CRM mostra "Configure sua plataforma"

A tela "Configure sua plataforma" **não é um erro** — é o **estado-vazio do CRM**, que aparece quando a empresa ativa **não tem nenhum produto cadastrado**. Como o CRM é "por produto", sem produto não há pipeline pra mostrar.

**A quebra real (que vale corrigir):** a mensagem manda *"Ir ao painel Super Admin"*. Isso faz sentido quando você é super admin **sem empresa**. Mas quando você está **operando uma empresa** (ex.: impersonando "Salão Bella Hair"), o certo seria: *"Cadastre um produto em Administração → Produtos"*. A mensagem está dando o caminho errado pro contexto.

---

## 7. Paridade — tudo do sales-spark foi trazido? ✅ SIM

Auditoria (Oficinas → Beauty):

| Item | Oficinas | Beauty |
|---|---|---|
| Edge functions | 118 | **118** ✅ |
| Componentes admin | 300+ | **300+** ✅ |
| Páginas core | 26 | **26** ✅ |
| Adições no Beauty | — | +7 telas `salao/` + impersonação |

**As 24 capacidades do sales-spark** (CRM, pipeline, captura, IA de vendas, cadências, campanhas, inbox WhatsApp, agendamento, playbooks, comissões, metas, dashboards, integrações, super-admin…) **estão todas presentes.** Nada foi removido; só foi **adicionado** o vertical salão.

---

## 8. As "quebras" — reais vs esperadas

| Situação | É quebra? | Explicação |
|---|---|---|
| CRM mostra "Configure sua plataforma" | ⚠️ **Meia-quebra** | Estado-vazio correto, mas a **mensagem dá o caminho errado** na impersonação → corrigir |
| CRM/Leads/Agenda vazios numa empresa nova | ✅ Esperado | Empresa nova não tem dados; popula com o uso |
| Integrações (WhatsApp/IA/Cakto) inativas | ✅ Esperado | Dormentes até cadastrar as chaves |
| Vendedor vê "Aguardando liberação" | ✅ Esperado | Admin precisa atribuir produtos ao vendedor |
| Super admin "vira" empresa mas não percebe | ⚠️ Menor | Há o badge âmbar "Acessando: X" — mas pode ser reforçado |
| Opções de super-admin para não-super | ✅ **Não acontece** | 7 guardas confirmadas — super-admin só aparece pra super admin |

---

## 9. Confirmação da pergunta 2 — gating de super-admin ✅

Verificado em 7 pontos (ModuleHub, badge, OrganizationSelector, SuperAdminRoute, dialog, Sidebar, App.tsx): **as opções de super-admin aparecem SOMENTE para usuários `super_admin`.** Um admin de empresa comum **não vê** "Gestão da Plataforma", nem o badge "Super Admin", nem o botão "Acessar Empresa…". Sem vazamentos.

---

## 10. O que fazer agora (recomendação)

1. **Decisão de produto:** o Beauty entra como **"salão com gestão"** (foco Agenda, 🅰️) ou **"salão + vendas"** (usa o CRM 🅱️ também)? Isso define o que mostrar no onboarding e no hub.
2. **Corrigir a mensagem do EmptyState** do CRM (caminho contextual: produto na Administração quando há empresa ativa).
3. **(Opcional)** simplificar o hub para o salão: se o foco é Agenda, o CRM pode entrar como módulo secundário/avançado.
