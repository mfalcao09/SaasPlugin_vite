// AIModelsPanel — escolhe o MODELO de LLM por AGENTE, num lugar só.
//
// POR QUE EXISTE: até 2026-08-01 o modelo vinha de env GLOBAL. Para afinar UMA
// persona — a Demo é a vitrine dos ads — seria preciso trocar o modelo da Lia e da
// Duda junto, ou seja, do funil que está vendendo. Agora cada agente tem `model`
// própria; vazio = herda o padrão, comportamento de sempre.
//
// DUAS FONTES, DE PROPÓSITO:
//   * platform_crm_product_agents → NOSSAS personas (Mavi, Lia, Bia, Duda…)
//   * product_agents              → agentes DOS TENANTS (cada salão cria os seus)
// A segunda aparece aqui porque, quando um salão reclamar do atendimento, a
// primeira pergunta é "em que modelo ele está?" — e responder não pode exigir SQL.
//
// ≠ AIRoutingPanel (admin/integrations): aquele decide PROVEDOR e modelo por
// ORG × CAPABILITY. Este decide por AGENTE, e vence aquele (config mais
// específica). O catálogo de modelos é o MESMO — importado, nunca reescrito.

import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { MODELS_BY_PROVIDER } from '@/config/aiModelsCatalog';
import { toast } from 'sonner';
import { Bot, Building2, Cpu, Loader2, X } from 'lucide-react';

/** Radix não aceita SelectItem com value="" — daí as sentinelas. */
const HERDA = '__herda__';
const OUTRO = '__outro__';

/** Defaults REAIS do runtime. Se mudarem no código, mudam aqui:
 *   platform-sales-brain → DEFAULT_MODEL = 'google/gemini-2.5-flash'
 *   _shared/ai-router.ts → DEFAULT_MODEL = 'google/gemini-3-flash-preview' */
const DEFAULT_PLATAFORMA = 'google/gemini-2.5-flash';
const DEFAULT_TENANT = 'google/gemini-3-flash-preview';

/** Modelos que o GATEWAY serve. Fonte única: aiModelsCatalog (mesmo do
 *  AIRoutingPanel). Só chat — transcrição/embeddings não valem para agente. */
const MODELOS_GATEWAY = MODELS_BY_PROVIDER.lovable.filter((m) =>
  m.supports.includes('agent_chat'),
);

interface AgentRow {
  id: string;
  name: string;
  model: string | null;
  is_active: boolean;
  agent_type: string | null;
  /** produto (plataforma) ou organização (tenant) — rótulo de agrupamento */
  grupo: string;
  escopo: 'plataforma' | 'tenant';
}

function useAgents() {
  return useQuery({
    queryKey: ['ai-models', 'agents'],
    queryFn: async (): Promise<AgentRow[]> => {
      const [plat, tenant, prods, orgs] = await Promise.all([
        supabase.from('platform_crm_product_agents')
          .select('id, name, model, is_active, agent_type, product_id').order('name'),
        supabase.from('product_agents')
          .select('id, name, model, is_active, agent_type, organization_id').order('name'),
        supabase.from('platform_crm_products').select('id, name'),
        supabase.from('organizations').select('id, name'),
      ]);

      // Falha de QUALQUER uma das quatro é erro. Lista pela metade aqui faria
      // parecer que um agente sumiu — e alguém recriaria um agente que existe.
      const err = plat.error || tenant.error || prods.error || orgs.error;
      if (err) throw err;

      const prodName = new Map((prods.data ?? []).map((p) => [p.id, p.name as string]));
      const orgName = new Map((orgs.data ?? []).map((o) => [o.id, o.name as string]));
      const pick = (r: Record<string, unknown>) =>
        typeof r.model === 'string' && r.model.trim() ? r.model : null;

      return [
        ...(plat.data ?? []).map((r): AgentRow => ({
          id: r.id as string,
          name: (r.name as string) || '(sem nome)',
          model: pick(r as Record<string, unknown>),
          is_active: !!r.is_active,
          agent_type: (r.agent_type as string) ?? null,
          grupo: prodName.get(r.product_id as string) ?? '(sem produto)',
          escopo: 'plataforma',
        })),
        ...(tenant.data ?? []).map((r): AgentRow => ({
          id: r.id as string,
          name: (r.name as string) || '(sem nome)',
          model: pick(r as Record<string, unknown>),
          is_active: !!r.is_active,
          agent_type: (r.agent_type as string) ?? null,
          grupo: orgName.get(r.organization_id as string) ?? '(org desconhecida)',
          escopo: 'tenant',
        })),
      ];
    },
  });
}

function useSetModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (v: { row: AgentRow; model: string | null }) => {
      const table = v.row.escopo === 'plataforma'
        ? 'platform_crm_product_agents'
        : 'product_agents';
      const { error } = await supabase.from(table)
        .update({ model: v.model } as never).eq('id', v.row.id);
      if (error) throw error;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ['ai-models', 'agents'] });
      toast.success(v.model
        ? `${v.row.name} agora usa ${v.model}`
        : `${v.row.name} voltou a herdar o padrão`);
    },
    onError: (e: unknown) => {
      toast.error(`Não consegui salvar: ${(e as Error)?.message ?? 'erro desconhecido'}`);
    },
  });
}

function ModelCell({ row }: { row: AgentRow }) {
  const setModel = useSetModel();
  const noCatalogo = !!row.model && MODELOS_GATEWAY.some((m) => m.id === row.model);
  // Modelo salvo que NÃO está no catálogo abre já em modo livre — senão o Select
  // mostraria vazio e o valor real ficaria invisível para quem for auditar.
  const [modoLivre, setModoLivre] = useState(!!row.model && !noCatalogo);
  const [livre, setLivre] = useState(!noCatalogo ? (row.model ?? '') : '');
  const salvando = setModel.isPending;
  const padrao = row.escopo === 'plataforma' ? DEFAULT_PLATAFORMA : DEFAULT_TENANT;

  if (modoLivre) {
    return (
      <div className="flex items-center gap-2">
        <Input
          value={livre}
          onChange={(e) => setLivre(e.target.value)}
          placeholder="ID exato que o gateway serve"
          className="h-8 w-[240px] font-mono text-xs"
          disabled={salvando}
        />
        <Button size="sm" variant="secondary" disabled={salvando || !livre.trim()}
          onClick={() => setModel.mutate({ row, model: livre.trim() })}>
          {salvando ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Salvar'}
        </Button>
        <Button size="sm" variant="ghost" disabled={salvando} title="cancelar"
          onClick={() => { setModoLivre(false); setLivre(''); }}>
          <X className="h-3 w-3" />
        </Button>
      </div>
    );
  }

  return (
    <Select
      value={row.model ?? HERDA}
      disabled={salvando}
      onValueChange={(v) => {
        if (v === OUTRO) { setModoLivre(true); return; }
        setModel.mutate({ row, model: v === HERDA ? null : v });
      }}
    >
      <SelectTrigger className="h-8 w-[320px] text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>
        <SelectItem value={HERDA}>
          Herda o padrão
          <span className="ml-2 font-mono text-[10px] text-muted-foreground">{padrao}</span>
        </SelectItem>
        {MODELOS_GATEWAY.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            {m.label}
            <span className="ml-2 text-[10px] text-muted-foreground">{m.description}</span>
          </SelectItem>
        ))}
        <SelectItem value={OUTRO}>Outro — digitar o ID…</SelectItem>
      </SelectContent>
    </Select>
  );
}

function Tabela({ rows }: { rows: AgentRow[] }) {
  // Agrupa por produto/organização: com dezenas de tenants, lista corrida vira
  // parede e ninguém acha o agente que veio procurar.
  const grupos = useMemo(() => {
    const m = new Map<string, AgentRow[]>();
    for (const r of rows) {
      if (!m.has(r.grupo)) m.set(r.grupo, []);
      m.get(r.grupo)!.push(r);
    }
    return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
  }, [rows]);

  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-muted-foreground">Nenhum agente aqui.</p>;
  }

  return (
    <div className="space-y-6">
      {grupos.map(([grupo, itens]) => (
        <div key={grupo}>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-medium">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            {grupo}
            <span className="text-xs font-normal text-muted-foreground">
              {itens.length} agente{itens.length > 1 ? 's' : ''}
            </span>
          </h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[300px]">Agente</TableHead>
                <TableHead className="w-[100px]">Status</TableHead>
                <TableHead>Modelo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {itens.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground" />
                      <span className="text-sm">{r.name}</span>
                      {r.agent_type && (
                        <span className="text-[10px] text-muted-foreground">{r.agent_type}</span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.is_active ? 'default' : 'secondary'} className="text-[10px]">
                      {r.is_active ? 'ativo' : 'inativo'}
                    </Badge>
                  </TableCell>
                  <TableCell><ModelCell row={r} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}

export function AIModelsPanel() {
  const { data, isLoading, error } = useAgents();
  const rows = data ?? [];
  const plataforma = rows.filter((r) => r.escopo === 'plataforma');
  const tenants = rows.filter((r) => r.escopo === 'tenant');
  const comOverride = rows.filter((r) => !!r.model).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Cpu className="h-4 w-4" /> Modelos de IA por agente
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            <strong>Herda o padrão</strong> = usa o modelo global, comportamento de
            sempre. Trocar um agente aqui <strong>não afeta os outros</strong> — é o
            que permite afinar a Demo sem mexer no funil que está vendendo.
          </p>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-4 text-sm">
          <span><strong>{plataforma.length}</strong> personas nossas</span>
          <span><strong>{tenants.length}</strong> agentes de tenants</span>
          <span><strong>{comOverride}</strong> com modelo próprio</span>
        </CardContent>
      </Card>

      {error && (
        <Card className="border-destructive">
          <CardContent className="py-4 text-sm text-destructive">
            Não consegui carregar os agentes: {(error as Error)?.message}
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> carregando agentes…
        </div>
      ) : (
        <Tabs defaultValue="plataforma">
          <TabsList>
            <TabsTrigger value="plataforma">Nossas personas ({plataforma.length})</TabsTrigger>
            <TabsTrigger value="tenants">Agentes dos tenants ({tenants.length})</TabsTrigger>
          </TabsList>
          <TabsContent value="plataforma" className="mt-4">
            <Tabela rows={plataforma} />
          </TabsContent>
          <TabsContent value="tenants" className="mt-4">
            <Tabela rows={tenants} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
