import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { MessageCircle, Mail, Instagram, Phone } from 'lucide-react';
import type { RecentLead } from '@/hooks/useOperationCenter';

interface Props {
  leads?: RecentLead[];
  onNavigate: (section: string) => void;
}

const channelIcon = (ch: string | null) => {
  const c = (ch || '').toLowerCase();
  if (c.includes('whats')) return <MessageCircle className="h-4 w-4 text-emerald-500" />;
  if (c.includes('insta')) return <Instagram className="h-4 w-4 text-pink-500" />;
  if (c.includes('mail') || c.includes('email')) return <Mail className="h-4 w-4 text-blue-500" />;
  if (c.includes('phone') || c.includes('call')) return <Phone className="h-4 w-4 text-blue-500" />;
  return <MessageCircle className="h-4 w-4 text-muted-foreground" />;
};

const tempBadge = (t: string | null) => {
  switch (t) {
    case 'hot':
      return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0">Quente</Badge>;
    case 'warm':
      return <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">Morno</Badge>;
    case 'cold':
      return <Badge className="bg-sky-100 text-sky-700 hover:bg-sky-100 border-0">Frio</Badge>;
    default:
      return <Badge variant="secondary">Novo</Badge>;
  }
};

const initials = (n: string) =>
  n
    .split(' ')
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

export function RecentLeadsTable({ leads, onNavigate }: Props) {
  const list = leads ?? [];

  return (
    <Card className="border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold">Leads / Conversas Recentes</CardTitle>
      </CardHeader>
      <CardContent>
        {list.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            Nenhum lead ou conversa recente encontrado.
          </div>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs text-muted-foreground border-b border-border">
                  <th className="text-left font-medium py-2 px-2">Lead</th>
                  <th className="text-left font-medium py-2 px-2">Canal</th>
                  <th className="text-left font-medium py-2 px-2">Responsável</th>
                  <th className="text-left font-medium py-2 px-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {list.map((l) => (
                  <tr
                    key={l.id}
                    onClick={() => onNavigate('leads')}
                    className="border-b border-border last:border-0 hover:bg-muted/40 cursor-pointer"
                  >
                    <td className="py-3 px-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <Avatar className="h-8 w-8 flex-shrink-0">
                          <AvatarFallback className="text-xs bg-primary/10 text-primary">
                            {initials(l.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <div className="font-medium text-foreground truncate">{l.name}</div>
                          {l.company && (
                            <div className="text-xs text-muted-foreground truncate">{l.company}</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-2">{channelIcon(l.channel)}</td>
                    <td className="py-3 px-2 text-foreground">
                      {l.assignedName || <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="py-3 px-2">{tempBadge(l.temperature)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
