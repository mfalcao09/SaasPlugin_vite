import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Copy, Loader2, Plus } from 'lucide-react';
import { toast } from 'sonner';
import {
  useAffiliateLinks,
  useGenerateAffiliateLink,
  type Affiliate,
} from '@/hooks/useAffiliateAdmin';
import { getPublicAppUrl } from '@/lib/publicUrl';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  affiliate: Affiliate;
}

export function AffiliateLinksDialog({ open, onOpenChange, affiliate }: Props) {
  const { data: links, isLoading } = useAffiliateLinks(open ? affiliate.id : '');
  const generate = useGenerateAffiliateLink();

  const [refCode, setRefCode] = useState('');
  const [label, setLabel] = useState('');
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  const publicUrlFor = (code: string) => `${getPublicAppUrl()}/vendas?ref=${code}`;

  const copy = (code: string) => {
    navigator.clipboard.writeText(publicUrlFor(code));
    toast.success('URL copiada');
  };

  const handleGenerate = async () => {
    try {
      await generate.mutateAsync({
        affiliate_id: affiliate.id,
        ref_code: refCode.trim() || undefined,
        label: label.trim() || undefined,
        default_utm_source: utmSource.trim() || undefined,
        default_utm_medium: utmMedium.trim() || undefined,
        default_utm_campaign: utmCampaign.trim() || undefined,
      });
      setRefCode('');
      setLabel('');
      setUtmSource('');
      setUtmMedium('');
      setUtmCampaign('');
      toast.success('Link gerado');
    } catch (e: any) {
      toast.error(e.message ?? 'Erro ao gerar link');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Links de {affiliate.name}</DialogTitle>
          <DialogDescription>Gere e gerencie os links de indicação deste afiliado.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-lg border p-4 space-y-3">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label>Código (ref) — opcional</Label>
                <Input value={refCode} onChange={(e) => setRefCode(e.target.value)} placeholder="maria-ig (auto se vazio)" />
              </div>
              <div>
                <Label>Rótulo</Label>
                <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Instagram" />
              </div>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              <div>
                <Label>utm_source</Label>
                <Input value={utmSource} onChange={(e) => setUtmSource(e.target.value)} placeholder="ig" />
              </div>
              <div>
                <Label>utm_medium</Label>
                <Input value={utmMedium} onChange={(e) => setUtmMedium(e.target.value)} placeholder="bio" />
              </div>
              <div>
                <Label>utm_campaign</Label>
                <Input value={utmCampaign} onChange={(e) => setUtmCampaign(e.target.value)} placeholder="lanc" />
              </div>
            </div>
            <Button onClick={handleGenerate} disabled={generate.isPending}>
              {generate.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              Gerar link
            </Button>
          </div>

          <div className="rounded-lg border overflow-hidden">
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground p-4">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando…
              </div>
            ) : !links || links.length === 0 ? (
              <p className="text-sm text-muted-foreground p-4">Nenhum link gerado ainda.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Rótulo</TableHead>
                    <TableHead className="text-right">Cliques</TableHead>
                    <TableHead className="text-right">URL</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {links.map((link) => (
                    <TableRow key={link.id}>
                      <TableCell className="font-mono text-xs">{link.ref_code}</TableCell>
                      <TableCell>{link.label ?? <span className="text-muted-foreground">—</span>}</TableCell>
                      <TableCell className="text-right">
                        <Badge variant="outline">{link.clicks}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="outline" size="icon" onClick={() => copy(link.ref_code)}>
                          <Copy className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
