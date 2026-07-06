# ui-cobranca-map — Mapa de construção da UI do módulo Cobrança (NexvyPayments)

> **Consumidor deste arquivo:** o orquestrador (Fable) + os subagentes construtores da UI. Documento
> de mapa/spec de leitura — não é importado por código.
>
> **Objetivo (verbatim do usuário):** "A UI vai herdar a tela do gestao, essa nova tela que
> desenhamos, sem as funcionalidades que sejam diferentes." Ou seja: **herdar o SHELL + o
> design system Nexvy Lux** (navy + dourado ocre, já desenhado no NexvyBeauty), trocando só o
> **conteúdo funcional** de salão por conteúdo de **cobrança** (pagadores, contratos, faturas,
> boleto+PIX, NFS-e, régua, inadimplência).
>
> **Regra do fork (ADR-001 / CORE-DELTA):** o módulo de cobrança é **ADITIVO e ISOLADO** — vive
> em arquivos/pastas **novos** (`src/pages/cobranca/*`, `src/components/cobranca/*`). Editar o core
> herdado só quando **inevitável**, e nesse caso **registrar em `docs/CORE-DELTA.md`**.
>
> **Caminhos:** todos absolutos a partir de
> `…/nexvypayments-bootstrap/apps/NexvyPayments` (= **APP**). Onde citado, o gêmeo em
> `…/apps/NexvyBeauty` (= **BEAUTY**) é idêntico (fork), então os moldes valem para os dois.
> Estado de partida: o APP é fork idêntico do Beauty — mesmo `App.tsx`, mesmo `cockpit/`, mesmo
> `pages/salao/`. **`src/pages/cobranca/` NÃO existe ainda (greenfield).**

---

## A) SHELL / TEMA herdado — e como plugar `/cobranca`

### A.1 — Design system Nexvy Lux (herdado, JÁ presente no fork)

O tema Lux já veio 1:1 no fork do Payments (16 refs a `.theme-nexvy-institucional` em `index.css`):

| O quê | Arquivo (APP) | file:line |
|---|---|---|
| Tema claro (navy `221.8 44.7% 23.4%` + dourado ocre `--gold`) | `src/index.css` | `267` (`:root.theme-nexvy-institucional`) |
| Tema dark (cinza-automotivo + dourado, zero azul) | `src/index.css` | `374` (`…institucional.dark`) |
| Tokens custom Lux (`--navy`, `--gold`, `--gradient-*`, `--shadow-gold`) | `src/index.css` | `319`–`361` (claro), `423`–`458` (dark) |
| **Classes utilitárias Lux** (o vocabulário visual dos cards) | `src/index.css` | `.surface-card` `591`, `.surface-card-hover` `599`, `.brand-gradient` `603`, `.text-value` (dourado) `609`, `.brand-glow` `621`, `.tabular` `481` |

**Como o tema ativa (host-aware):** `src/main.tsx:13-14` adiciona a classe `theme-nexvy-institucional`
ao `<html>` **apenas** quando `isGestaoHostname()` (host `gestao.*`). O guard de branding em
`src/hooks/usePlatformBranding.ts:136-144` **remove** cores inline em `gestao.*` para o CSS do tema
pintar o navy/dourado sem interferência do tenant.

> ⚠️ **Decisão de plugagem (premissa a confirmar com Marcelo):** hoje o Lux só pinta em `gestao.*`.
> O app do tenant (`app.*`) usa a paleta Beauty Rosé estática. Para o módulo Cobrança "herdar a
> tela do gestao" (Lux navy+dourado), há 2 caminhos:
> - **(a)** o módulo Cobrança usa **classes Lux** (`.surface-card`, `.text-value`, `.brand-gradient`)
>   diretamente nas telas — elas funcionam em qualquer host, pois são utilitárias neutras (nomes
>   distintos das do tema, sem colisão — `index.css:573`). **Recomendado**: 100% aditivo, zero edição
>   de core, e é exatamente o que `PlatformCrmLeadsKPICards.tsx` já faz.
> - **(b)** ativar a classe de tema `theme-nexvy-institucional` no `app.*` (editaria `main.tsx` →
>   entra em CORE-DELTA). Mais invasivo; muda o visual do app inteiro, não só cobrança.
>
> **Recomendação:** seguir **(a)** — construir as telas de cobrança com as classes utilitárias Lux
> (`surface-card`/`text-value`/`brand-gradient`) + tokens (`hsl(var(--primary))`, `--gold`). Assim a UI
> "fica igual ao gestao" sem tocar o core. Confirmar com Marcelo antes de optar por (b).

### A.2 — Casca de navegação (shell) herdada

| Peça | Arquivo (APP) | Papel |
|---|---|---|
| **Casca canônica** | `src/components/layout/UnifiedShell.tsx` | `<SidebarProvider>` + `Sidebar collapsible="icon"` (shadcn) + grupos colapsáveis (accordion) + `AppTopBar` + `<main>`. Recebe `nav: ShellNavGroup[]` e `title`. **É a moldura que toda tela de módulo deve usar.** |
| Item/grupo de nav (tipo) | `src/components/layout/UnifiedShell.tsx:31-50` | `ShellNavItem { to, label, icon, end?, visibility? }` e `ShellNavGroup { title, items, collapsible?, defaultOpen? }` |
| TopBar | `src/components/layout/AppTopBar.tsx` | seletor de empresa + ações globais |
| Header de página | `src/components/layout/PageHeader.tsx` | `PageHeader{title,description,action}` + `FormDialog` + `NewButton` — topo padronizado de cada tela |
| Nav da casca `/` (cabeleireira) | `src/cockpit/nav.tsx` (`COCKPIT_NAV`) | jargão de salão (Início/Agenda/Clientes/Crescer/…). **Deve ser trocada por nav de cobrança** — ver A.3 |
| Casca do `/` | `src/cockpit/CockpitShell.tsx` | monta `UnifiedShell nav={COCKPIT_NAV}` + `<Outlet/>`. É o que renderiza no `/` do `app.*` |
| Shell da plataforma (`gestao.*`) | `src/components/superadmin/platform-shell/{PlatformShell,PlatformSidebar,registry.tsx}` | shell modular por-registry; **é a referência visual "do gestao"** (2 módulos: ERP + Vendas, cada um com `PlatformNavGroup[]`) |

### A.3 — Como plugar as telas de Cobrança em `/cobranca`

O `modules.ts` já declara o card `cobranca` → rota `/cobranca` (`src/config/modules.ts:38-46`), **mas
a rota `/cobranca` NÃO existe em `App.tsx`** e o card não tem tela. Três pontos de enxerto (todos aditivos):

1. **Rota (`src/App.tsx`):** adicionar bloco lazy + `<Route>` para `/cobranca` e sub-rotas. Molde: as
   rotas `/salao/*` em `App.tsx:357-363` (cada tela protegida por `<ProtectedRoute>`). Preferir uma
   **casca própria de cobrança** (ex. `CobrancaShell` com `<Outlet/>`, espelhando `CockpitShell`) com
   sub-rotas `pagadores`, `grupos`, `contratos`, `faturas`, `regua`, `inadimplencia`, `onboarding`.
   - *Isolamento:* criar `src/pages/cobranca/CobrancaShell.tsx` novo (não editar `CockpitShell`); a única
     edição de core inevitável é **adicionar as linhas de `<Route>` em `App.tsx`** → registrar em CORE-DELTA.

2. **Sidebar (nav):** criar `src/pages/cobranca/nav.tsx` exportando `COBRANCA_NAV: ShellNavGroup[]`
   (mesmo tipo do `UnifiedShell`), com os itens de cobrança. `CobrancaShell` passa `nav={COBRANCA_NAV}`
   para `UnifiedShell`. Molde exato: `src/cockpit/nav.tsx`.

3. **Card do hub:** o card já aponta para `/cobranca` (`modules.ts`). Nada a fazer além de garantir a
   rota. (O hub que renderiza os cards: `src/pages/ModuleHub.tsx`, config-driven a partir de `modules.ts`.)

---

## B) TELAS a construir (PRIORIZADAS)

> Todas seguem o **MOLDE canônico (seção C)**: `UnifiedShell`/casca → `PageHeader` → KPI grid
> (classes Lux) → filtros/busca → Tabs → `<Table>` shadcn → ação (Dialog/wizard) → detalhe.
> Todas em `src/pages/cobranca/*` (novo). Backend = tabelas/edge functions já deployadas.

### B1 — Pagadores: lista + cadastro + import CSV  🟥 (prioridade 1)
- **Molde de UI:** `src/pages/salao/Clientes.tsx` (lista + busca + `<Table>` + Dialog CRUD + detalhe via `ClienteDetail`). Import CSV: `src/components/superadmin/crm/leads/PlatformCrmImportLeadsDialog.tsx` (upload → map colunas → import → done) + parser `parseCsv` em `src/lib/leadsExport.ts`.
- **Reusáveis:** `PageHeader`; `Card`, `Table*`, `Dialog*`, `Input`, `Select`, `Badge`, `AlertDialog` (shadcn); `formatCurrency`/`formatDate` (novo `_shared` de cobrança); `parseCsv`; classes Lux `surface-card`.
- **Backend:** tabela **`payers`** (CRUD) · import em lote via insert. (Sem edge function específica — insert direto/RLS.)

### B2 — Grupos & Contratos  🟥 (prioridade 2)
- **Molde de UI:** `Clientes.tsx` (lista+CRUD) para Grupos; `Financeiro.tsx` Tabs para separar "Grupos" × "Contratos". Contrato = form com valor (BRL), vencimento, recorrência, pagador vinculado (`Select` de payers).
- **Reusáveis:** `PageHeader`, `Tabs`, `Table*`, `Dialog*`, `Select` (vincular payer/grupo), `formatCurrency`.
- **Backend:** tabelas **`billing_groups`** e **`contracts`** (CRUD + vínculo `payer_id`/`group_id`).

### B3 — Faturas: lista + KPI + detalhe + ação "gerar lote"  🟥 (prioridade 3, tela-âncora)
- **Molde de UI:** `src/pages/salao/Financeiro.tsx` (KPI grid + Tabs + `<Table>` com coluna de valor/status). KPIs (total faturado, a vencer, vencido, pago) com **`PlatformCrmLeadsKPICards.tsx`** como molde do KPICard em Lux. Filtro de período: `src/pages/salao/FinanceiroPeriodFilter.tsx`. StatusBadge (rascunho→…→paga/vencida/cancelada/substituida): padrão `EvolutionManager.tsx:41-50` (map `status → {label, variant}` + `<Badge>`).
- **Ação "gerar lote":** botão no header → `Dialog` de confirmação (período/contratos) → invoca edge function.
- **Reusáveis:** KPICards Lux, `PageHeader`, `Tabs`, `FinanceiroPeriodFilter`, `Table*`, `Badge`, `Dialog*`, `formatCurrency`/`formatDate`.
- **Backend:** tabela **`invoices`** (lista/detalhe) + **`invoice_items`** (detalhe) + **`billing_events`** (timeline no detalhe). Edge function **`invoice-batch-generate`** (ação gerar-lote).

### B4 — Régua de cobrança: configuração visual  🟧 (prioridade 4)
- **Molde de UI:** `src/components/admin/cadences/CadenceWizard.tsx` (stepper por `step`) + as telas de cadência do CRM (`PlatformCrmCadencesManager`). Régua = lista de passos por dias-de-vencimento (D-3, D0, D+1, D+5…) com canal (WhatsApp/e-mail) e template.
- **Reusáveis:** `PageHeader`, `Card`/`surface-card`, `Select`, `Input`, `Switch`, `Dialog*`; padrão stepper do `CadenceWizard`.
- **Backend:** tabela **`billing_agreements`** (config da régua) + edge functions **`billing-cadence-enroll`** / **`billing-cadence-stop`** / **`billing-cadence-tick`** (enroll/stop/tick da régua).

### B5 — Painel de Inadimplência + baixa manual  🟧 (prioridade 5)
- **Molde de UI:** `LeadsManager.tsx` (KPI + `<Table>` com seleção + barra de ações em massa `BulkActionsBar.tsx`) — filtra `invoices` vencidas. "Baixa manual" = ação por linha (ou em massa) → `Dialog` (valor recebido/data/forma) → edge function.
- **Reusáveis:** KPICards Lux, `Table*` com checkbox (molde `LeadsTable.tsx`), `BulkActionsBar.tsx`, `Dialog*`, `Badge` (status vencido), `formatCurrency`.
- **Backend:** tabela **`invoices`** (filtro `status='vencida'`) + edge function **`billing-baixa-manual`** (dar baixa).

### B6 — Onboarding financeiro (wizard): conectar C6/NotaAS via cofre  🟩 (prioridade 6)
- **Molde de UI:** `CadenceWizard.tsx` / `ImportLeadsDialog.tsx` (padrão multi-step `step`: escolher provedor → inserir credenciais → validar → done). Anatomia visual: `surface-card` + `brand-gradient` no passo ativo.
- **Segurança (Seção 11 CLAUDE.md):** credenciais **NUNCA no frontend/bundle**. O wizard só coleta e envia via edge function server-side; nada de `NEXT_PUBLIC_*`/localStorage. Persistir hash/cofre no backend.
- **Reusáveis:** `PageHeader`, `Card`/`surface-card`, `Input` (masked), `Button`, `Progress`, `Dialog*` ou página wizard; padrão `step` do `CadenceWizard`.
- **Backend:** cofre **`billing_credentials`** (C6/NotaAS) + webhook **`notaas-webhook`** (NFS-e). Gravação via edge function server-side (onboarding C6/NotaAS).

---

## C) MOLDE de página canônico (copiar exatamente)

**Fonte de verdade:** `src/pages/salao/Financeiro.tsx` (KPI+Tabs+Table+Dialog) e
`src/pages/salao/Clientes.tsx` (lista+busca+CRUD+detalhe). Esqueleto que todo construtor deve replicar:

```tsx
// src/pages/cobranca/<Tela>.tsx  — ADITIVO, não edita core
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/integrations/supabase/client'
import { toast } from 'sonner'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { PageHeader } from '@/components/layout/PageHeader'
import { useOrganizationId, formatCurrency, formatDate } from '@/pages/cobranca/_shared' // criar _shared próprio

export default function FaturasCobranca() {
  const organizationId = useOrganizationId()
  const [tab, setTab] = useState('lista')

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ['invoices', organizationId],
    enabled: !!organizationId,
    queryFn: async () => {
      const { data, error } = await supabase.from('invoices').select('*')
        .eq('organization_id', organizationId!).order('created_at', { ascending: false })
      if (error) throw error
      return data
    },
  })

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Faturas"
        description="Boleto + PIX, status e NFS-e"
        action={<Button /* gerar-lote → invoice-batch-generate */>Gerar lote</Button>}
      />
      {/* KPI grid — usar classes Lux (surface-card + text-value dourado no KPI de valor).
          Molde: src/components/superadmin/crm/leads/PlatformCrmLeadsKPICards.tsx */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">{/* KPICards */}</div>

      <Tabs value={tab} onValueChange={setTab} className="space-y-6">
        <TabsList>{/* Todas / A vencer / Vencidas / Pagas */}</TabsList>
        <TabsContent value="lista">
          <Card><CardContent className="p-0">
            <Table>{/* TableHeader + TableBody; Badge de status; formatCurrency no valor */}</Table>
          </CardContent></Card>
        </TabsContent>
      </Tabs>
      {/* Dialog de detalhe/ação (baixa, gerar-lote) — molde NovoLancamentoDialog em Financeiro.tsx:706 */}
    </div>
  )
}
```

**Convenções obrigatórias (do molde):**
- **BRL:** `formatCurrency` = `new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})` — molde
  `src/pages/salao/_shared.tsx:12`. **Datas:** `formatDate` TZ-safe (`T00:00:00`, sem `new Date(iso)` cru)
  — `_shared.tsx:16`. Criar um `src/pages/cobranca/_shared.tsx` novo (não importar do salão).
- **Tabela:** `<Table>` shadcn puro (`src/components/ui/table.tsx`). **Não há** react-table/DataTable no
  projeto — seleção em massa é feita à mão (molde `LeadsTable.tsx` + `BulkActionsBar.tsx`).
- **StatusBadge:** map `status → {label, variant}` + `<Badge variant>` — molde `EvolutionManager.tsx:41`.
- **`tabular-nums`** em toda coluna de valor; valor-destaque em dourado via classe `.text-value`.
- **Dados:** `useQuery(['<tabela>', organizationId])` + `enabled:!!organizationId`; mutations invalidam a
  query + `toast`. Filtro sempre por `organization_id` (tenant key).

---

## D) LIMPEZA do fork (listar; NÃO remover agora)

O APP herdou toda a vertical de salão do Beauty. Estes paths são **conteúdo de salão sem função em
cobrança** — candidatos a remoção na **limpeza A1** (após a rota `/cobranca` estar de pé e nenhuma
tela de cobrança depender deles). Antes de remover, rodar `grep` de import reverso (o `App.tsx` e o
`cockpit/` os referenciam — remover exige limpar as rotas/imports juntos).

**Telas de salão (pages):**
- `src/pages/salao/` — pasta inteira: `Agenda.tsx`, `Dashboard.tsx`, `Profissionais.tsx`, `Servicos.tsx`,
  `Clientes.tsx`, `ClienteDetail.tsx`, `Financeiro.tsx`, `FinanceiroPeriodFilter.tsx`, `MeuLinkBooking.tsx`,
  `ActivationChecklist.tsx`, `useAgendamentosAsEvents.ts`, `demo-seed.ts`, e todos os `Demo*.tsx`.
  ⚠️ **Exceção — COPIAR antes de remover:** `_shared.tsx` (formatCurrency/formatDate/useOrganizationId),
  `Financeiro.tsx` e `Clientes.tsx` são **os moldes** — extrair os helpers para `src/pages/cobranca/_shared.tsx`
  primeiro. `FinanceiroPeriodFilter.tsx` deve ser **reusado** (mover para `cobranca/` ou `components/shared/`).
- `src/pages/PublicSalaoBooking.tsx`, `src/pages/PublicSalaoPacotes.tsx` — booking público de salão.

**Cockpit da cabeleireira (casca `/` + telas de salão):**
- `src/cockpit/` — a casca `CockpitShell.tsx` + `nav.tsx` (jargão de salão) + telas específicas de salão:
  `Automacoes.tsx`, `MetaMes.tsx`, `SaudeBase.tsx`, `Oportunidades.tsx`, `AiGrowth.tsx`, `AcoesClientes.tsx`,
  `Pacotes.tsx`, `ProdutosRevenda.tsx`, `Relatorios.tsx`, `HomeDeValor.tsx`, `Inicio.tsx`, `PrecisaDeVoce.tsx`,
  `reactivation/`, `home/`, `clientActions.ts`, `clientHygiene.ts`, `levers.ts`, `segments.ts`.
  ⚠️ `CockpitShell.tsx`/`nav.tsx` são o **molde** da casca — replicar como `cobranca/CobrancaShell.tsx` antes.

**Config de módulo herdada:**
- `src/config/modules.ts:22` — `ModuleId 'erp_salao'` (comentado como legado no fork) + o card `erp_salao`
  no `ModuleHub`/`MODULE_SECTIONS` (`src/pages/ModuleHub.tsx`) → remover o item de salão na A1 (edição de
  core → CORE-DELTA).

**Componentes de salão (grep para confirmar antes):**
- `src/components/salao/` e `src/components/calendar/`, `src/components/booking/`, `src/components/goals/`
  (agenda/booking/metas de salão) — confirmar zero uso em cobrança via `grep -rn` antes de remover.

> **Nota de escopo:** o CRM de Vendas (`crm_vendas`) e Atendimento (`atendimento`) **permanecem** (são
> módulos do grupo, não de salão — `PRODUCT_MODULES` em `modules.ts`). A limpeza D é só da **vertical de
> salão**, que a vertical de **cobrança** substitui.

---

### Backend disponível (referência para os construtores)
- **Tabelas:** `payers`, `billing_groups`, `contracts`, `invoices` (status: rascunho→…→paga/vencida/cancelada/substituida),
  `invoice_items`, `billing_events`, `billing_agreements`. Cofre: `billing_credentials`.
- **Edge functions ACTIVE (confirmadas em `supabase/functions/`):** `invoice-batch-generate`,
  `billing-baixa-manual`, `billing-cadence-enroll`, `billing-cadence-stop`, `billing-cadence-tick`, `notaas-webhook`.
