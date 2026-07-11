import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Search, Building2, Mail, Calendar, Users, Loader2, MessageCircle,
  Megaphone, Sparkles, Link2, ExternalLink, Target,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const STATUS_MAP: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  new: { label: 'Novo', variant: 'default' },
  contacted: { label: 'Contactado', variant: 'secondary' },
  qualified: { label: 'Qualificado', variant: 'outline' },
  converted: { label: 'Convertido', variant: 'default' },
  lost: { label: 'Perdido', variant: 'destructive' },
};

// Normaliza WhatsApp BR para link wa.me (55 + DDD + número).
function waLink(raw?: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return `https://wa.me/${digits.startsWith('55') ? digits : '55' + digits}`;
}

// Rótulo amigável do canal de aquisição (lead_channel = "afiliado:<ref>" | "organico").
function channelInfo(lead: any): { label: string; isAffiliate: boolean; ref?: string } {
  const ch: string = lead.lead_channel || '';
  if (ch.startsWith('afiliado')) {
    const ref = lead.ref_code || ch.split(':')[1] || null;
    return { label: ref ? `Afiliado · ${ref}` : 'Afiliado', isAffiliate: true, ref };
  }
  return { label: 'Orgânico', isAffiliate: false };
}

export function SalesLeadsManager() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [selectedLead, setSelectedLead] = useState<any>(null);
  const [notes, setNotes] = useState('');

  // Carrega TODOS os leads (filtro de status é client-side, p/ alimentar os
  // cards de estatística e as abas sem refetch).
  const { data: leads = [], isLoading } = useQuery({
    queryKey: ['sales-leads'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_leads')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as any[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const { error } = await supabase.from('sales_leads').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sales-leads'] });
      toast.success('Lead atualizado');
    },
  });

  const stats = useMemo(() => {
    const count = (s: string) => leads.filter((l) => l.status === s).length;
    const afiliado = leads.filter((l) => channelInfo(l).isAffiliate).length;
    const total = leads.length;
    const convertidos = count('converted');
    return {
      total,
      novos: count('new'),
      qualificados: count('qualified'),
      convertidos,
      afiliado,
      organico: total - afiliado,
      taxa: total ? Math.round((convertidos / total) * 100) : 0,
    };
  }, [leads]);

  const filteredLeads = leads.filter((l) => {
    if (statusFilter !== 'all' && l.status !== statusFilter) return false;
    if (!search) return true;
    const s = search.toLowerCase();
    return [l.company_name, l.contact_name, l.email, l.whatsapp]
      .some((v) => (v ?? '').toString().toLowerCase().includes(s));
  });

  const openDetail = (lead: any) => {
    setSelectedLead(lead);
    setNotes(lead.notes || '');
  };

  const STAT_CARDS = [
    { key: 'total', label: 'Total de leads', value: stats.total, sub: `${stats.taxa}% convertidos`, icon: Users, color: 'text-primary' },
    { key: 'novos', label: 'Novos', value: stats.novos, sub: 'aguardando contato', icon: Sparkles, color: 'text-primary' },
    { key: 'qualificados', label: 'Qualificados', value: stats.qualificados, sub: 'prontos para fechar', icon: Target, color: 'text-primary' },
    { key: 'convertidos', label: 'Convertidos', value: stats.convertidos, sub: 'viraram clientes', icon: Megaphone, color: 'text-primary' },
    { key: 'canal', label: 'Por canal', value: `${stats.afiliado}/${stats.organico}`, sub: 'afiliado / orgânico', icon: Link2, color: 'text-primary' },
  ];

  const TABS: { value: string; label: string; count: number }[] = [
    { value: 'all', label: 'Todos', count: stats.total },
    { value: 'new', label: 'Novos', count: stats.novos },
    { value: 'contacted', label: 'Contactados', count: leads.filter((l) => l.status === 'contacted').length },
    { value: 'qualified', label: 'Qualificados', count: stats.qualificados },
    { value: 'converted', label: 'Convertidos', count: stats.convertidos },
    { value: 'lost', label: 'Perdidos', count: leads.filter((l) => l.status === 'lost').length },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" /> Leads Comerciais
        </h1>
        <p className="text-muted-foreground">Leads capturados pela página de vendas — funil da plataforma.</p>
      </div>

      {/* ─── Cards de estatística ─────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {STAT_CARDS.map((c) => (
          <Card key={c.key}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</span>
                <c.icon className={`h-4 w-4 ${c.color}`} />
              </div>
              <div className="text-2xl font-bold mt-1">{c.value}</div>
              <div className="text-xs text-muted-foreground mt-0.5">{c.sub}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* ─── Abas de status + busca ───────────────────────────── */}
      <div className="flex flex-wrap items-center gap-2">
        {TABS.map((t) => (
          <button
            key={t.value}
            onClick={() => setStatusFilter(t.value)}
            className={[
              'px-3 py-1.5 rounded-full text-sm font-medium transition-colors flex items-center gap-1.5',
              statusFilter === t.value ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:text-foreground',
            ].join(' ')}
          >
            {t.label}
            <span className={statusFilter === t.value ? 'opacity-80' : 'opacity-60'}>{t.count}</span>
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Buscar por empresa, nome, email ou WhatsApp..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* ─── Lista ────────────────────────────────────────────── */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredLeads.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            Nenhum lead encontrado.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {filteredLeads.map((lead) => {
            const st = STATUS_MAP[lead.status] || STATUS_MAP.new;
            const ch = channelInfo(lead);
            return (
              <Card
                key={lead.id}
                className="cursor-pointer hover:border-primary/30 transition-colors"
                onClick={() => openDetail(lead)}
              >
                <CardContent className="p-4 flex items-center gap-4">
                  <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-semibold truncate">{lead.company_name || lead.contact_name || 'Lead'}</h3>
                      <Badge variant={st.variant} className="text-xs">{st.label}</Badge>
                      <Badge variant={ch.isAffiliate ? 'default' : 'outline'} className="text-[10px]">{ch.label}</Badge>
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground mt-0.5 flex-wrap">
                      <span>{lead.contact_name}</span>
                      <span className="hidden sm:inline">•</span>
                      <span className="hidden sm:inline truncate">{lead.email}</span>
                      {lead.whatsapp && (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                          <MessageCircle className="h-3 w-3" /> {lead.whatsapp}
                        </span>
                      )}
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground shrink-0">
                    {lead.created_at ? format(new Date(lead.created_at), 'dd/MM/yy', { locale: ptBR }) : '-'}
                  </span>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ─── Detalhe ──────────────────────────────────────────── */}
      <Dialog open={!!selectedLead} onOpenChange={(o) => !o && setSelectedLead(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          {selectedLead && (() => {
            const ch = channelInfo(selectedLead);
            const wa = waLink(selectedLead.whatsapp);
            return (
              <>
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Building2 className="h-5 w-5 text-primary" />
                    {selectedLead.company_name || selectedLead.contact_name || 'Lead'}
                  </DialogTitle>
                </DialogHeader>

                <div className="space-y-4 mt-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={(STATUS_MAP[selectedLead.status] || STATUS_MAP.new).variant}>
                      {(STATUS_MAP[selectedLead.status] || STATUS_MAP.new).label}
                    </Badge>
                    <Badge variant={ch.isAffiliate ? 'default' : 'outline'}>{ch.label}</Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    <div className="flex items-center gap-2"><Users className="h-4 w-4 text-muted-foreground shrink-0" /> {selectedLead.contact_name}</div>
                    <div className="flex items-center gap-2 min-w-0"><Mail className="h-4 w-4 text-muted-foreground shrink-0" /> <span className="truncate">{selectedLead.email}</span></div>
                    {selectedLead.whatsapp && (
                      <div className="flex items-center gap-2">
                        <MessageCircle className="h-4 w-4 text-emerald-500 shrink-0" />
                        {wa ? (
                          <a href={wa} target="_blank" rel="noreferrer" className="text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1">
                            {selectedLead.whatsapp} <ExternalLink className="h-3 w-3" />
                          </a>
                        ) : selectedLead.whatsapp}
                      </div>
                    )}
                    <div className="flex items-center gap-2"><Calendar className="h-4 w-4 text-muted-foreground shrink-0" /> {selectedLead.created_at ? format(new Date(selectedLead.created_at), 'dd/MM/yyyy HH:mm', { locale: ptBR }) : '-'}</div>
                  </div>

                  {(selectedLead.company_size || selectedLead.segment) && (
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {selectedLead.company_size && <div><span className="text-muted-foreground">Tamanho:</span> {selectedLead.company_size}</div>}
                      {selectedLead.segment && <div><span className="text-muted-foreground">Segmento:</span> {selectedLead.segment}</div>}
                    </div>
                  )}

                  {selectedLead.main_challenge && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Principais dores / desafio</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{selectedLead.main_challenge}</p>
                    </div>
                  )}
                  {selectedLead.message && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Mensagem</Label>
                      <p className="text-sm mt-1 whitespace-pre-wrap">{selectedLead.message}</p>
                    </div>
                  )}

                  {/* Origem / atribuição */}
                  {(selectedLead.utm_source || selectedLead.utm_medium || selectedLead.utm_campaign || selectedLead.utm_term || selectedLead.utm_content || selectedLead.landing_page) && (
                    <div>
                      <Label className="text-muted-foreground text-xs">Origem (tracking)</Label>
                      <div className="flex gap-1.5 flex-wrap mt-1">
                        {selectedLead.utm_source && <Badge variant="outline" className="text-[10px]">source: {selectedLead.utm_source}</Badge>}
                        {selectedLead.utm_medium && <Badge variant="outline" className="text-[10px]">medium: {selectedLead.utm_medium}</Badge>}
                        {selectedLead.utm_campaign && <Badge variant="outline" className="text-[10px]">campaign: {selectedLead.utm_campaign}</Badge>}
                        {selectedLead.utm_term && <Badge variant="outline" className="text-[10px]">term: {selectedLead.utm_term}</Badge>}
                        {selectedLead.utm_content && <Badge variant="outline" className="text-[10px]">content: {selectedLead.utm_content}</Badge>}
                        {ch.ref && <Badge variant="outline" className="text-[10px]">ref: {ch.ref}</Badge>}
                      </div>
                      {selectedLead.landing_page && (
                        <p className="text-[11px] text-muted-foreground mt-1 truncate">Landing: {selectedLead.landing_page}</p>
                      )}
                    </div>
                  )}

                  <div className="space-y-2">
                    <Label>Status</Label>
                    <Select
                      value={selectedLead.status}
                      onValueChange={(v) => {
                        updateMutation.mutate({ id: selectedLead.id, updates: { status: v } });
                        setSelectedLead({ ...selectedLead, status: v });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_MAP).map(([k, v]) => (
                          <SelectItem key={k} value={k}>{v.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Notas internas</Label>
                    <Textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="Anotações sobre este lead..."
                      rows={3}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          updateMutation.mutate({ id: selectedLead.id, updates: { notes } });
                          setSelectedLead({ ...selectedLead, notes });
                        }}
                      >
                        Salvar notas
                      </Button>
                      {wa && (
                        <Button size="sm" asChild>
                          <a href={wa} target="_blank" rel="noreferrer" className="gap-2">
                            <MessageCircle className="h-4 w-4" /> Abrir WhatsApp
                          </a>
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
