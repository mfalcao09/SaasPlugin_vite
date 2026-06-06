# Arquitetura AutoFlow AI — Modelo de Plataforma Corrigido

## Visão Geral

O AutoFlow AI é uma plataforma SaaS para gerenciamento de oficinas automotivas com modelo **1 única instância para múltiplas oficinas clientes**.

---

## Modelo de Usuários e Acesso

### 1. Super Admin (Proprietário da Plataforma)
- **Identificação:** Usuário criado por `"base44"` (criador padrão do sistema)
- **Acesso:** Painel Master (`/master`)
- **Responsabilidades:**
  - Criar novas oficinas clientes
  - Gerenciar status, plano e dados principais das oficinas
  - Visualizar progresso de onboarding de cada oficina
  - Monitorar plataforma em nível macro
- **Isolamento:** Vê TODAS as oficinas na plataforma
- **Sidebar:** Acesso ao /master e sem empresa específica vinculada

### 2. Admin da Oficina
- **Identificação:** Usuário criado por seu próprio email (criador da empresa `Empresa`)
- **Acesso:** Painel privado completo (`/dashboard`, `/clientes`, `/veiculos`, etc.)
- **Responsabilidades:**
  - Gerenciar operação da sua oficina
  - Convidar e gerenciar equipe
  - Cadastrar clientes, veículos, orçamentos, OS
  - Controlar financeiro
  - Visualizar relatórios da sua oficina
- **Isolamento:** Vê apenas dados da empresa que criou (filtro por `empresa_id`)
- **Onboarding:** Se a empresa não tiver onboarding_concluido, é redirecionado obrigatoriamente

### 3. Usuário Convidado (Equipe da Oficina)
- **Identificação:** Usuário criado por outro usuário (admin da oficina)
- **Acesso:** Painel privado (acesso limitado por role/papel)
- **Responsabilidades:** Conforme seu papel (técnico, atendimento, financeiro, etc.)
- **Isolamento:** Vê apenas dados da empresa vinculada
- **Papel:** Define permissões (Admin, Técnico, Atendimento, Financeiro, Usuário Padrão)

---

## Fluxo de Acesso

### Fluxo 1: Super Admin (Proprietário/Aluno)
```
1. Login na plataforma
2. Sistema detecta: created_by === "base44"
3. Desvio automático para /master (Painel Master)
4. Acesso a todas as oficinas, criação de novas, gestão de plataforma
```

### Fluxo 2: Admin da Oficina (Gerente da Oficina Cliente)
```
1. Login na plataforma
2. Sistema detecta: created_by === seu_email
3. Busca Empresa vinculada (created_by === seu_email)
4. Se onboarding incompleto → /onboarding
5. Se completo → /dashboard (com dados isolados por empresa_id)
```

### Fluxo 3: Usuário Convidado (Equipe)
```
1. Recebe convite por email (criado por admin da oficina)
2. Clica no link, faz login
3. Sistema detecta: created_by !== "base44" && sem empresa criada
4. Procura empresa onde foi adicionado
5. Acessa painel privado com filtragem por empresa_id
```

---

## Isolamento de Dados

Todos os módulos operacionais filtram por `empresa_id`:
- **Clientes:** `empresa_id` obrigatório
- **Veículos:** `empresa_id` obrigatório
- **Orçamentos:** `empresa_id` obrigatório
- **Ordens de Serviço:** `empresa_id` obrigatório
- **Lançamentos Financeiros:** `empresa_id` obrigatório
- **Relatórios:** Filtrados por `empresa_id` do usuário
- **Equipe:** Usuários vinculados à `empresa_id`

**Garantia:** Um usuário nunca vê dados de outra empresa.

---

## Painel Master (Super Admin)

### Funcionalidades Implementadas
1. **Listagem de Oficinas:** Todas as empresas cadastradas
2. **Criar Nova Oficina:** Interface de formulário
3. **Editar Oficina:** Dados principais, status, plano
4. **Visualizar Progresso:** Onboarding progress bar
5. **KPIs:** Total, Ativas, Em Trial

### Funções do Super Admin
- Cria nova empresa com dados básicos
- Define status (Trial, Ativo, Inativo)
- Define plano (Trial, Básico, Profissional)
- Acompanha onboarding de cada oficina
- Pode editar dados principais da oficina

---

## Processo de Criação de Nova Oficina

### Pelo Super Admin (Painel Master)

```
1. Super Admin acessa /master
2. Clica em "+ Nova Oficina"
3. Preenche formulário:
   - Nome da oficina
   - Telefone, Email, Endereço
   - Status (Trial/Ativo/Inativo)
   - Plano (Trial/Básico/Profissional)
4. Clica "Criar"
5. Sistema cria Empresa no banco
6. Super Admin compartilha acesso com admin da oficina (via email externo)
7. Admin da oficina faz login
8. Sistema detecta: precisa de onboarding
9. Admin segue onboarding de 4 etapas
10. Completa onboarding
11. Acessa dashboard normal
```

**IMPORTANTE:** O vínculo entre Super Admin e Empresa é apenas de visualização. O vínculo real é entre Admin da Oficina (criador) e Empresa.

---

## Onboarding por Empresa

- **Acionado:** Quando Admin da Oficina faz primeiro login e `onboarding_concluido = false`
- **Etapas:** 4 (Dados da Oficina, Identidade Visual, Primeiro Cliente, Primeiro Veículo)
- **Persistência:** Progresso salvo em `onboarding_step` por empresa
- **Resultado:** Ao final, `onboarding_concluido = true`, Admin vai para Dashboard

---

## Hooks Principais

### `useEmpresaUser()`
Detecta:
- Se é super admin
- Qual empresa o usuário tem vinculada
- Se é admin ou convidado
- Carrega dados completos do usuário

### `useEmpresaConfig()`
Aplica:
- Customização visual da empresa (cor, nome, slogan)
- Apenas para usuários não super admin

### `useEmpresa()` (Legado)
Será descontinuado — usar `useEmpresaUser()` é preferível

---

## Segurança e Isolamento

1. **Super Admin Check:** `SuperAdminGuard` no /master
2. **Empresa Filtering:** Todo CRUD filtra por `empresa_id`
3. **User Authentication:** Base44 auth gerencia autenticação
4. **Role-Based Access:** Papéis controlam granularidade dentro da empresa
5. **No Cross-Tenant Data:** Garantia de isolamento entre empresas

---

## Para o Aluno (Proprietário da Plataforma)

### Inicialização
1. Clone o AutoFlow AI no Base44
2. Faz primeiro login
3. Automaticamente é Super Admin
4. Acessa /master
5. Começa a criar oficinas clientes

### Criar Primeira Oficina
1. Em /master, clica "+ Nova Oficina"
2. Preenche dados: nome, plano, status
3. Compartilha credenciais com admin da oficina
4. Admin entra, faz onboarding, começa a usar

### Escalar para N Oficinas
- Mesma instância (1 clone)
- Mesma plataforma
- Múltiplas oficinas isoladas
- Super Admin gerencia todas do /master

---

## Diferença do Modelo Anterior

❌ **Antes:** 1 clone por cliente (ineficiente, não escalável)
✅ **Agora:** 1 clone para N clientes (plataforma SaaS real)

---

## Próximas Expansões (Futuro)

- Billing integrado por empresa
- Webhooks por empresa
- Integrações específicas por empresa
- Relatórios consolidados (super admin)
- Exportação de dados por empresa
- Backup automático por empresa