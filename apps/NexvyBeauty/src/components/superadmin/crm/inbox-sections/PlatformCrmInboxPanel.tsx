import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { Toggle } from '@/components/ui/toggle';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import {
  Search,
  Filter,
  Bot,
  Users,
  Inbox as InboxIcon,
  Hash,
  RefreshCw,
  Activity,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';
import {
  usePlatformCrmAttendancePanel,
  usePlatformCrmPanelFiltersState,
} from '../data/usePlatformCrmAttendancePanel';
import { usePlatformCrmSectors } from '../data/usePlatformCrmSectors';
import { PanelSection } from './PanelSection';
import { PanelColumn } from './PanelColumn';

/**
 * PAINEL de Atendimentos do CRM de PLATAFORMA (super_admin).
 * PORTE 1:1 de `admin/webchat/AttendancePanel.tsx` (seção `panel` do
 * InboxManager do CRM Vendus): header realtime + barra de filtros (busca /
 * canal / setor / toggles Fila-IA-Humanos) + 3 seções de colunas.
 *
 * DESACOPLAMENTO: dados de `platform_crm_conversations` (hook do painel);
 * setores do filtro = `platform_crm_sectors` (setores da PLATAFORMA). Sem
 * gating de permissão de tenant — a área super-admin já é gated no shell.
 * `onOpenConversation` é injetado pelo pai (fiação do menu), substituindo o
 * sessionStorage + searchParams do tenant.
 */

const CHANNELS = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'webchat', label: 'Site' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'email', label: 'E-mail' },
  { value: 'sms', label: 'SMS' },
];

// Anatomia de chip do exemplar (PlatformCrmKanbanFilters): h-10 px-3.5 rounded-lg
// border hairline + hover dourado. Aplicada aos Popover triggers dos filtros.
const CHIP =
  'h-10 px-3.5 rounded-lg border hairline bg-card text-[13px] font-medium ' +
  'inline-flex items-center gap-2 whitespace-nowrap transition-colors ' +
  'hover:border-[color:var(--hairline-gold)] focus:outline-none focus-visible:ring-2 focus-visible:ring-ring';

interface Props {
  onOpenConversation?: (id: string) => void;
}

export function PlatformCrmInboxPanel({ onOpenConversation }: Props = {}) {
  const { filters, setFilters } = usePlatformCrmPanelFiltersState();
  const { sections, isLoading, isFetching, isError, error, refetch } =
    usePlatformCrmAttendancePanel(filters);
  const { data: sectors = [] } = usePlatformCrmSectors();

  const handleOpenConversation = (id: string) => {
    onOpenConversation?.(id);
  };

  // FORMA F3 (§2): faixa de KPIs derivada de `sections.totals` (dado que o hook
  // já entrega — SEM tocar contrato). Cada card = `.surface-card` com pílula-ícone;
  // o card de DESTAQUE (Total) usa `.brand-gradient .brand-glow` (§L2 REF).
  const totalActive = sections.totals.queue + sections.totals.ai + sections.totals.humans;
  const kpis = [
    {
      key: 'queue',
      label: 'Na fila',
      value: sections.totals.queue,
      hint: 'Aguardando atendimento humano',
      icon: InboxIcon,
      iconClass: 'bg-warning/10 text-warning',
      accent: false,
    },
    {
      key: 'ai',
      label: 'Com IA',
      value: sections.totals.ai,
      hint: 'Atendidas por agentes de IA',
      icon: Bot,
      iconClass: 'bg-primary/10 text-primary',
      accent: false,
    },
    {
      key: 'humans',
      label: 'Com humanos',
      value: sections.totals.humans,
      hint: 'Em atendimento humano ativo',
      icon: Users,
      iconClass: 'bg-emerald-500/10 text-emerald-600',
      accent: false,
    },
    {
      key: 'total',
      label: 'Total ativas',
      value: totalActive,
      hint: 'Conversas abertas no momento',
      icon: Activity,
      // Destaque F3 (§L2 REF): pílula-ícone em brand-gradient + brand-glow.
      iconClass: 'brand-gradient brand-glow text-white',
      accent: true,
    },
  ] as const;

  // §3.3/§3.8: horário legível da última sincronização (tempo real).
  const updatedAt = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());

  const sectorOptions = useMemo(
    () => [
      { id: '__none__', name: 'Sem setor', color: null as string | null },
      ...sectors.map((s) => ({ id: s.id, name: s.name, color: s.color })),
    ],
    [sectors],
  );

  const toggleArr = (arr: string[], v: string) =>
    arr.includes(v) ? arr.filter((x) => x !== v) : [...arr, v];

  const activeFiltersCount = filters.channels.length + filters.sectorIds.length;

  return (
    <div className="space-y-4">
      {/* Header de página F3 (§2): título com ícone (escala §1.4) + sublinha com
          dot pulsante de tempo real + timestamp; ação (refresh) à direita. */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <Activity className="h-5 w-5 text-primary" />
            Painel de Atendimentos
          </h1>
          <p className="mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
            {/* §3.4: dot pulsante de atividade viva (tempo real). */}
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
            </span>
            Tempo real
            <span className="text-[11px] tabular-nums text-muted-foreground/70">
              · atualizado às {updatedAt}
            </span>
          </p>
        </div>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={refetch}
              disabled={isFetching}
              aria-label="Atualizar painel"
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border hairline bg-card text-muted-foreground transition-colors hover:border-[color:var(--hairline-gold)] hover:text-foreground disabled:opacity-50"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </button>
          </TooltipTrigger>
          <TooltipContent>Atualizar agora</TooltipContent>
        </Tooltip>
      </div>

      {/* Erro (§3.1): banner com retry — NUNCA silenciar. surface-card com
          hairline destructive; preserva os filtros. Token `destructive`, sem hex. */}
      {isError && (
        <div
          role="alert"
          className="surface-card flex items-start gap-3 border-destructive/30 p-3 text-destructive"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-sm font-medium">Não foi possível carregar o painel</p>
            <p className="text-xs text-destructive/80">
              {error?.message?.trim()
                ? error.message
                : 'Falha ao buscar os atendimentos. Verifique a conexão e tente novamente.'}
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={refetch}
            disabled={isFetching}
            className="h-8 shrink-0 gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
          >
            <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
            Tentar novamente
          </Button>
        </div>
      )}

      {/* Faixa de KPIs F3 (§L2 REF): surface-card com pílula-ícone (h-10 rounded-xl),
          label uppercase 12px, valor 30px tabular. Destaque (Total) = brand-gradient
          + brand-glow. Skeleton anatômico espelha esta anatomia. */}
      {isLoading ? (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="surface-card flex items-start gap-3.5 p-5">
              <div className="h-10 w-10 shrink-0 animate-pulse rounded-xl bg-muted" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                <div className="h-7 w-12 animate-pulse rounded bg-muted" />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <div
                key={kpi.key}
                className="surface-card surface-card-hover flex items-start gap-3.5 p-5"
              >
                <div
                  className={cn(
                    'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl',
                    kpi.accent ? kpi.iconClass : cn('border hairline', kpi.iconClass),
                  )}
                  aria-hidden="true"
                >
                  <Icon className="h-[18px] w-[18px]" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[12px] uppercase tracking-[0.12em] text-muted-foreground">
                    {kpi.label}
                  </p>
                  <p className="mt-1 truncate text-[30px] font-semibold leading-none tracking-[-0.03em] tabular-nums">
                    {kpi.value}
                  </p>
                  <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={kpi.hint}>
                    {kpi.hint}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Filtros (§L2 REF): UMA surface-card p-3 — busca inline + chips
          "Label: Valor" (Canal/Setor via Popover) + toggles pílula (Fila/IA/
          Humanos) à direita. Anatomia idêntica ao PlatformCrmKanbanFilters. */}
      <div className="surface-card flex flex-wrap items-center gap-2.5 p-3">
        <div className="relative min-w-[200px] max-w-xs flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Buscar por lead, nome ou telefone…"
            className="h-10 border hairline bg-card pl-9"
          />
        </div>

        {/* Chip "Canal" (§L2 REF) */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={CHIP}>
              <Hash className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Canal</span>
              {filters.channels.length > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold tabular-nums text-primary">
                  {filters.channels.length}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            {CHANNELS.map((c) => (
              <label
                key={c.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox
                  checked={filters.channels.includes(c.value)}
                  onCheckedChange={() =>
                    setFilters((f) => ({ ...f, channels: toggleArr(f.channels, c.value) }))
                  }
                />
                <span className="text-sm">{c.label}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {/* Chip "Setor" (§L2 REF) */}
        <Popover>
          <PopoverTrigger asChild>
            <button type="button" className={CHIP}>
              <Filter className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Setor</span>
              {filters.sectorIds.length > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 text-[10px] font-semibold tabular-nums text-primary">
                  {filters.sectorIds.length}
                </span>
              )}
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground/70" />
            </button>
          </PopoverTrigger>
          <PopoverContent className="max-h-72 w-56 overflow-auto p-2" align="start">
            {sectorOptions.map((s) => (
              <label
                key={s.id}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 hover:bg-accent"
              >
                <Checkbox
                  checked={filters.sectorIds.includes(s.id)}
                  onCheckedChange={() =>
                    setFilters((f) => ({ ...f, sectorIds: toggleArr(f.sectorIds, s.id) }))
                  }
                />
                {s.color && (
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                )}
                <span className="text-sm">{s.name}</span>
              </label>
            ))}
          </PopoverContent>
        </Popover>

        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, channels: [], sectorIds: [], search: '' }))}
            className="h-10 text-xs text-muted-foreground"
          >
            Limpar
          </Button>
        )}

        {/* Toggles pílula (§3.4) à direita — §1.2/§1.3: estados via TOKEN
            semântico. warning=fila em espera, primary=IA ativa, emerald=humano. */}
        <div className="ml-auto flex items-center gap-1 rounded-lg border hairline bg-card p-0.5">
          <Toggle
            size="sm"
            pressed={filters.showQueue}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showQueue: v }))}
            aria-label="Mostrar conversas na fila"
            className="h-8 gap-1 rounded-md text-xs data-[state=on]:bg-warning/15 data-[state=on]:text-warning"
          >
            <InboxIcon className="h-3.5 w-3.5" /> Fila
          </Toggle>
          <Toggle
            size="sm"
            pressed={filters.showAI}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showAI: v }))}
            aria-label="Mostrar conversas com IA"
            className="h-8 gap-1 rounded-md text-xs data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
          >
            <Bot className="h-3.5 w-3.5" /> IA
          </Toggle>
          <Toggle
            size="sm"
            pressed={filters.showHumans}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showHumans: v }))}
            aria-label="Mostrar conversas com atendentes humanos"
            className="h-8 gap-1 rounded-md text-xs data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-600"
          >
            <Users className="h-3.5 w-3.5" /> Humanos
          </Toggle>
        </div>
      </div>

      {/* Carregando (§3.1): skeleton ANATÔMICO — espelha seções + colunas
          surface-card do conteúdo real, não um bloco genérico. */}
      {isLoading && (
        <div className="space-y-6" aria-hidden="true">
          {[0, 1].map((s) => (
            <section key={s} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-muted" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                <span className="h-5 w-6 animate-pulse rounded-full bg-muted" />
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex gap-3">
                {[0, 1, 2].map((c) => (
                  <div key={c} className="surface-card w-72 shrink-0 overflow-hidden">
                    <div className="flex items-center gap-2.5 border-b hairline p-3">
                      <div className="h-9 w-9 animate-pulse rounded-xl bg-muted" />
                      <div className="flex-1 space-y-1.5">
                        <div className="h-3 w-24 animate-pulse rounded bg-muted" />
                        <div className="h-2.5 w-14 animate-pulse rounded bg-muted" />
                      </div>
                    </div>
                    <div className="space-y-1.5 p-2">
                      {[0, 1, 2].map((r) => (
                        <div key={r} className="h-14 animate-pulse rounded-xl bg-muted/60" />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Vazio de tela (§3.1): nenhuma conversa ativa e nenhum toggle desligado
          escondendo dado — empty acionável, não em branco. */}
      {!isLoading &&
        !isError &&
        totalActive === 0 &&
        filters.showQueue &&
        filters.showAI &&
        filters.showHumans && (
          <div className="surface-card flex flex-col items-center justify-center gap-3 border-dashed py-16 text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-primary/10">
              <Activity className="h-9 w-9 text-primary opacity-70" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-medium">Nenhum atendimento ativo agora</p>
              <p className="text-xs text-muted-foreground">
                Assim que uma conversa entrar na fila, for atendida pela IA ou por um
                atendente, ela aparece aqui em tempo real.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              disabled={isFetching}
              className="mt-1 gap-1.5"
            >
              <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} />
              Atualizar
            </Button>
          </div>
        )}

      {!isLoading && totalActive > 0 && (
        <div className="space-y-6">
          {filters.showQueue && (
            <PanelSection
              title="Fila"
              icon={<InboxIcon className="h-4 w-4" />}
              count={sections.totals.queue}
              accent="warning"
            >
              {sections.queueBySector.length === 0 ? (
                <SectionEmpty icon={InboxIcon} label="Fila vazia" />
              ) : (
                sections.queueBySector.map((g) => (
                  <PanelColumn
                    key={g.sectorId || 'none'}
                    title={g.name}
                    count={g.items.length}
                    color={g.color}
                    icon={<Hash className="h-4 w-4" />}
                    items={g.items}
                    onCardClick={handleOpenConversation}
                    accent="warning"
                  />
                ))
              )}
            </PanelSection>
          )}

          {filters.showAI && (
            <PanelSection
              title="Agentes IA"
              icon={<Bot className="h-4 w-4" />}
              count={sections.totals.ai}
              accent="primary"
            >
              {sections.aiByAgent.length === 0 ? (
                <SectionEmpty icon={Bot} label="Nenhum agente atendendo no momento" />
              ) : (
                sections.aiByAgent.map((g) => (
                  <PanelColumn
                    key={g.agentId}
                    title={g.name}
                    subtitle="Agente IA"
                    count={g.items.length}
                    avatarUrl={g.avatar}
                    initials={g.name.slice(0, 2).toUpperCase()}
                    icon={<Bot className="h-4 w-4" />}
                    items={g.items}
                    onCardClick={handleOpenConversation}
                    accent="primary"
                  />
                ))
              )}
            </PanelSection>
          )}

          {filters.showHumans && (
            <PanelSection
              title="Atendentes Humanos"
              icon={<Users className="h-4 w-4" />}
              count={sections.totals.humans}
              accent="success"
            >
              {sections.humansByUser.length === 0 ? (
                <SectionEmpty icon={Users} label="Nenhum atendente humano ativo" />
              ) : (
                sections.humansByUser.map((g) => (
                  <PanelColumn
                    key={g.userId}
                    title={g.name}
                    subtitle="Atendente"
                    count={g.items.length}
                    avatarUrl={g.avatar}
                    initials={g.name.slice(0, 2).toUpperCase()}
                    items={g.items}
                    onCardClick={handleOpenConversation}
                    accent="emerald"
                  />
                ))
              )}
            </PanelSection>
          )}
        </div>
      )}
    </div>
  );
}

/** Empty de seção (§3.1): surface-card dashed com ícone esmaecido + dica —
 *  mesma anatomia lux do empty de coluna/tela, no lugar de emoji cru. */
function SectionEmpty({
  icon: Icon,
  label,
}: {
  icon: typeof InboxIcon;
  label: string;
}) {
  return (
    <div className="surface-card flex w-full flex-col items-center justify-center gap-2 border-dashed py-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground opacity-30" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
