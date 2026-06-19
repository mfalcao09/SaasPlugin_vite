import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Loader2, Plus, Search, Link2, Pencil } from 'lucide-react';
import { useAffiliates, type Affiliate, type AffiliateStatus } from '@/hooks/useAffiliateAdmin';
import { AffiliateFormDialog } from './AffiliateFormDialog';
import { AffiliateLinksDialog } from './AffiliateLinksDialog';

const STATUS_META: Record<AffiliateStatus, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' },
  paused: { label: 'Pausado', className: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  blocked: { label: 'Bloqueado', className: 'bg-destructive/10 text-destructive border-destructive/20' },
};

function brl(cents: number) {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function AffiliatesList() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<AffiliateStatus | 'all'>('all');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Affiliate | null>(null);
  const [linksFor, setLinksFor] = useState<Affiliate | null>(null);

  const { data, isLoading } = useAffiliates({
    search: search.trim() || undefined,
    status: statusFilter === 'all' ? undefined : statusFilter,
  });

  const affiliates = data?.affiliates ?? [];

  const openCreate = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (a: Affiliate) => {
    setEditing(a);
    setFormOpen(true);
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail…"
            className="pl-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as AffiliateStatus | 'all')}>
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os status</SelectItem>
            <SelectItem value="active">Ativo</SelectItem>
            <SelectItem value="paused">Pausado</SelectItem>
            <SelectItem value="blocked">Bloqueado</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" /> Novo afiliado
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground p-6">
              <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
            </div>
          ) : affiliates.length === 0 ? (
            <p className="text-sm text-muted-foreground p-6">Nenhum afiliado encontrado.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nome</TableHead>
                  <TableHead>E-mail</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Comissão</TableHead>
                  <TableHead className="text-right">Pendente</TableHead>
                  <TableHead className="text-right">A receber</TableHead>
                  <TableHead className="text-right">Pago</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {affiliates.map((a) => {
                  const meta = STATUS_META[a.status];
                  const s = a.summary;
                  return (
                    <TableRow key={a.id}>
                      <TableCell className="font-medium">{a.name}</TableCell>
                      <TableCell className="text-muted-foreground">{a.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={meta.className}>
                          {meta.label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">{Math.round((a.commission_pct ?? 0) * 100)}%</TableCell>
                      <TableCell className="text-right">{brl(s?.pending_cents ?? 0)}</TableCell>
                      <TableCell className="text-right">{brl(s?.approved_cents ?? 0)}</TableCell>
                      <TableCell className="text-right">{brl(s?.paid_cents ?? 0)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" title="Links" onClick={() => setLinksFor(a)}>
                            <Link2 className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" title="Editar" onClick={() => openEdit(a)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AffiliateFormDialog open={formOpen} onOpenChange={setFormOpen} affiliate={editing} />
      {linksFor && (
        <AffiliateLinksDialog
          open={!!linksFor}
          onOpenChange={(o) => !o && setLinksFor(null)}
          affiliate={linksFor}
        />
      )}
    </div>
  );
}
