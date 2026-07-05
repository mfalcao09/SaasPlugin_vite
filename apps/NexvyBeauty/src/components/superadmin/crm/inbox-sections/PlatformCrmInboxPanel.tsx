import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
  // já entrega — SEM tocar contrato). Cada card mapeia para o accent semântico
  // da seção correspondente (§1.3). "Total ativos" = soma das 3 frentes.
  const totalActive = sections.totals.queue + sections.totals.ai + sections.totals.humans;
  const kpis = [
    {
      key: 'queue',
      label: 'Na fila',
      value: sections.totals.queue,
      hint: 'Aguardando atendimento humano',
      icon: InboxIcon,
      iconClass: 'bg-warning/10 text-warning',
    },
    {
      key: 'ai',
      label: 'Com IA',
      value: sections.totals.ai,
      hint: 'Atendidas por agentes de IA',
      icon: Bot,
      iconClass: 'bg-primary/10 text-primary',
    },
    {
      key: 'humans',
      label: 'Com humanos',
      value: sections.totals.humans,
      hint: 'Em atendimento humano ativo',
      icon: Users,
      iconClass: 'bg-emerald-500/10 text-emerald-600',
    },
    {
      key: 'total',
      label: 'Total ativas',
      value: totalActive,
      hint: 'Conversas abertas no momento',
      icon: Activity,
      iconClass: 'bg-muted text-muted-foreground',
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
      {/* Header de página F3 (§2): título + subtítulo com dot pulsante de tempo
          real + timestamp; ação (refresh) à direita, acessível. */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="space-y-0.5">
          <h2 className="text-lg font-semibold">Painel de Atendimentos</h2>
          <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
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
            <Button
              variant="outline"
              size="sm"
              onClick={refetch}
              disabled={isFetching}
              aria-label="Atualizar painel"
              className="h-9 w-9 p-0"
            >
              <RefreshCw className={cn('h-4 w-4', isFetching && 'animate-spin')} />
            </Button>
          </TooltipTrigger>
          <TooltipContent>Atualizar agora</TooltipContent>
        </Tooltip>
      </div>

      {/* Erro (§3.1): banner com retry — NUNCA silenciar. Aparece no topo do
          conteúdo preservando os filtros; token `destructive` (§1.1), sem hex. */}
      {isError && (
        <div
          role="alert"
          className="flex items-start gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
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

      {/* Faixa de KPIs F3 (§2): grid responsivo; valor grande tabular, label
          micro, ícone tokenizado. Skeleton anatômico espelha esta anatomia. */}
      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Card key={i} className="p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-2">
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                  <div className="h-7 w-10 animate-pulse rounded bg-muted" />
                </div>
                <div className="h-9 w-9 animate-pulse rounded-lg bg-muted" />
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {kpis.map((kpi) => {
            const Icon = kpi.icon;
            return (
              <Card key={kpi.key} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                      {kpi.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums leading-none">
                      {kpi.value}
                    </p>
                    <p className="mt-1.5 truncate text-[11px] text-muted-foreground" title={kpi.hint}>
                      {kpi.hint}
                    </p>
                  </div>
                  <span
                    className={cn(
                      'flex h-9 w-9 shrink-0 items-center justify-center rounded-lg',
                      kpi.iconClass,
                    )}
                    aria-hidden="true"
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap p-3 rounded-lg bg-muted/40 border border-border">
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
            placeholder="Buscar por lead, nome ou telefone…"
            className="pl-8 h-9"
          />
        </div>

        {/* Channel filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Hash className="h-3.5 w-3.5" />
              Canal
              {filters.channels.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {filters.channels.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-52 p-2" align="start">
            {CHANNELS.map((c) => (
              <label
                key={c.value}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
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

        {/* Sector filter */}
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="gap-1.5">
              <Filter className="h-3.5 w-3.5" />
              Setor
              {filters.sectorIds.length > 0 && (
                <Badge variant="secondary" className="h-4 px-1 text-[10px]">
                  {filters.sectorIds.length}
                </Badge>
              )}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 p-2 max-h-72 overflow-auto" align="start">
            {sectorOptions.map((s) => (
              <label
                key={s.id}
                className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-accent cursor-pointer"
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

        <div className="flex-1" />

        {/* Status toggles — §1.2/§1.3: estados via TOKEN semântico, sem `dark:`
            por tela. warning=fila em espera, primary=IA ativa, emerald=humano. */}
        <div className="flex items-center gap-1 bg-background rounded-md border border-border p-0.5">
          <Toggle
            size="sm"
            pressed={filters.showQueue}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showQueue: v }))}
            aria-label="Mostrar conversas na fila"
            className="data-[state=on]:bg-warning/15 data-[state=on]:text-warning h-7 text-xs gap-1"
          >
            <InboxIcon className="h-3.5 w-3.5" /> Fila
          </Toggle>
          <Toggle
            size="sm"
            pressed={filters.showAI}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showAI: v }))}
            aria-label="Mostrar conversas com IA"
            className="data-[state=on]:bg-primary/15 data-[state=on]:text-primary h-7 text-xs gap-1"
          >
            <Bot className="h-3.5 w-3.5" /> IA
          </Toggle>
          <Toggle
            size="sm"
            pressed={filters.showHumans}
            onPressedChange={(v) => setFilters((f) => ({ ...f, showHumans: v }))}
            aria-label="Mostrar conversas com atendentes humanos"
            className="data-[state=on]:bg-emerald-500/15 data-[state=on]:text-emerald-600 h-7 text-xs gap-1"
          >
            <Users className="h-3.5 w-3.5" /> Humanos
          </Toggle>
        </div>

        {activeFiltersCount > 0 && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFilters((f) => ({ ...f, channels: [], sectorIds: [], search: '' }))}
            className="text-xs"
          >
            Limpar
          </Button>
        )}
      </div>

      {/* Carregando (§3.1): skeleton ANATÔMICO — espelha seções + colunas do
          conteúdo real, não um bloco genérico. */}
      {isLoading && (
        <div className="space-y-6" aria-hidden="true">
          {[0, 1].map((s) => (
            <section key={s} className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="h-2 w-2 rounded-full bg-muted" />
                <div className="h-4 w-24 animate-pulse rounded bg-muted" />
                <div className="h-px flex-1 bg-border" />
              </div>
              <div className="flex gap-3">
                {[0, 1, 2].map((c) => (
                  <div
                    key={c}
                    className="h-64 w-72 shrink-0 animate-pulse rounded-xl border border-border bg-muted/40"
                  />
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
          <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/20 py-16 text-center">
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

/** Empty de seção (§3.1): ícone esmaecido + dica, no lugar de emoji cru. */
function SectionEmpty({
  icon: Icon,
  label,
}: {
  icon: typeof InboxIcon;
  label: string;
}) {
  return (
    <div className="flex w-full flex-col items-center justify-center gap-2 py-8 text-center">
      <Icon className="h-8 w-8 text-muted-foreground opacity-30" />
      <p className="text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
