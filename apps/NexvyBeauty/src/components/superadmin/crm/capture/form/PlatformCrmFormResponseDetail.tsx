/**
 * CRM de PLATAFORMA (super_admin) — detalhe de uma RESPOSTA de formulário.
 * Portado de src/components/admin/forms/FormResponseDetail.tsx (CRM Vendus).
 *
 * DESACOPLADO do tenant:
 *   - Sem `@/hooks/*` de tenant. A submission vem da row `platform_crm_form_submissions`.
 *   - `responses` é `Json` na row → tratado como `Record<string, unknown>`.
 *   - Sem join `leads` (a row de plataforma não expõe `submission.leads`); resolvemos
 *     nome/email/telefone só por mapping/heurística sobre `responses` + blocos.
 * v2: CallWithAIDialog (Chamar com IA) tenant nao portado.
 * v2: useCadences / cadence-enroll (Inserir em Cadência) tenant nao portado.
 * v2: "Ver Lead no CRM" (navegação /admin#lead-) tenant nao portado.
 */
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  User, Mail, Phone, Target, Tag, Clock, Globe,
  Smartphone, MapPin, Link as LinkIcon,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { PlatformCrmFormSubmission, PlatformCrmFormBlock } from '@/components/superadmin/crm/data/usePlatformCrmForms';

interface PlatformCrmFormResponseDetailProps {
  submission: PlatformCrmFormSubmission;
  blocks: PlatformCrmFormBlock[];
  onClose: () => void;
}

const NAME_KEYWORDS = ['nome', 'name', 'full name'];
const EMAIL_KEYWORDS = ['email', 'e-mail'];
const PHONE_KEYWORDS = ['whatsapp', 'telefone', 'phone', 'celular'];

export function PlatformCrmFormResponseDetail({ submission, blocks, onClose }: PlatformCrmFormResponseDetailProps) {
  const responses = (submission.responses ?? {}) as Record<string, unknown>;

  const formatValue = (value: unknown): string => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
    if (Array.isArray(value)) return value.join(', ');
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  const matchLabel = (label: string, keywords: string[]) =>
    keywords.some((k) => (label || '').toLowerCase().includes(k));

  // Respostas são salvas com LABEL como chave (responsesWithLabels), mas pode
  // haver chaves por block.id legado. Resolve nos dois formatos.
  const getValueByMapping = (mapping: string): string | null => {
    if (responses[mapping]) return String(responses[mapping]);
    const block = blocks.find((b) => (b as any).maps_to === mapping);
    if (!block) return null;
    if (responses[block.id]) return String(responses[block.id]);
    if (block.label && responses[block.label]) return String(responses[block.label]);
    return null;
  };

  const getByHeuristic = (keywords: string[], typeMatch?: (t: string) => boolean): string | null => {
    const block = blocks.find((b) => {
      const okType = typeMatch ? typeMatch(b.block_type ?? '') : true;
      if (!okType || !matchLabel(b.label ?? '', keywords)) return false;
      return responses[b.id] || (b.label && responses[b.label]);
    });
    if (block) return String(responses[block.id] ?? (block.label ? responses[block.label] : '') ?? '');
    // Fallback: qualquer chave de resposta cujo nome bata com o keyword
    const key = Object.keys(responses).find((k) => matchLabel(k, keywords));
    return key ? String(responses[key]) : null;
  };

  const getLeadName = (): string => {
    return (
      getValueByMapping('name') ||
      getValueByMapping('full_name') ||
      getByHeuristic(NAME_KEYWORDS) ||
      String(responses?.name || responses?.nome || responses?.full_name || 'Anônimo')
    );
  };

  const getLeadEmail = (): string | null => {
    return (
      getValueByMapping('email') ||
      getByHeuristic(EMAIL_KEYWORDS, (t) => t === 'email' || t === 'short_text' || t === 'text') ||
      (responses?.email ? String(responses.email) : null)
    );
  };

  const getLeadPhone = (): string | null => {
    return (
      getValueByMapping('phone') ||
      getByHeuristic(PHONE_KEYWORDS, (t) => t === 'phone' || t === 'short_text' || t === 'text') ||
      (responses?.phone ? String(responses.phone) : null) ||
      (responses?.telefone ? String(responses.telefone) : null)
    );
  };

  const getScoreColor = (score: number): string => {
    if (score >= 70) return 'text-green-500 bg-green-500/10';
    if (score >= 40) return 'text-yellow-500 bg-yellow-500/10';
    return 'text-red-500 bg-red-500/10';
  };

  const getAnswers = () => {
    const answers: { label: string; value: string; key: string }[] = [];
    const seenLabels = new Set<string>();
    blocks.forEach((block) => {
      if (['welcome_screen', 'end_screen', 'conditional', 'score', 'tag', 'hidden_field', 'image', 'video_upload', 'video_embed', 'carousel', 'divider'].includes(block.block_type ?? '')) return;
      const value = responses[block.id] ?? (block.label ? responses[block.label] : undefined);
      if (value !== undefined && value !== null && value !== '') {
        answers.push({ label: block.label ?? '', value: formatValue(value), key: block.id });
        seenLabels.add(block.label ?? '');
      }
    });
    // Inclui respostas órfãs (labels que não bateram com nenhum bloco atual)
    Object.entries(responses).forEach(([key, value]) => {
      if (seenLabels.has(key)) return;
      if (['name', 'nome', 'email', 'phone', 'telefone', 'full_name'].includes(key)) return;
      if (value === undefined || value === null || value === '') return;
      answers.push({ label: key, value: formatValue(value), key });
    });
    return answers;
  };

  const answers = getAnswers();
  const leadName = getLeadName();
  const leadPhone = getLeadPhone();
  const tags = (submission.tags ?? []) as string[];
  const totalScore = submission.total_score ?? 0;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl h-[85vh] flex flex-col p-0">
        <DialogHeader className="p-6 pb-4 border-b shrink-0">
          <DialogTitle className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center">
              <User className="h-5 w-5 text-primary" />
            </div>
            <div>
              <span className="text-xl">{leadName}</span>
              {submission.created_at && (
                <p className="text-sm text-muted-foreground font-normal">
                  {format(new Date(submission.created_at), "dd 'de' MMMM 'às' HH:mm", { locale: ptBR })}
                </p>
              )}
            </div>
          </DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-6">
            <div className="flex flex-wrap gap-4">
              {getLeadEmail() && (
                <div className="flex items-center gap-2 text-sm">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <a href={`mailto:${getLeadEmail()}`} className="hover:underline">{getLeadEmail()}</a>
                </div>
              )}
              {leadPhone && (
                <div className="flex items-center gap-2 text-sm">
                  <Phone className="h-4 w-4 text-muted-foreground" />
                  <span>{leadPhone}</span>
                </div>
              )}
            </div>

            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-2 rounded-lg ${getScoreColor(totalScore)}`}>
                <Target className="h-4 w-4" />
                <span className="font-bold">{totalScore} pontos</span>
              </div>
              {tags.length > 0 && (
                <div className="flex items-center gap-2">
                  <Tag className="h-4 w-4 text-muted-foreground" />
                  <div className="flex gap-1">
                    {tags.map((tag, i) => <Badge key={i} variant="secondary">{tag}</Badge>)}
                  </div>
                </div>
              )}
            </div>

            <Separator />

            <div>
              <h3 className="text-lg font-semibold mb-4">Respostas do Formulário</h3>
              <div className="space-y-4">
                {answers.length > 0 ? answers.map((answer, index) => (
                  <Card key={index}>
                    <CardContent className="p-4">
                      <p className="text-sm font-medium text-muted-foreground mb-1">{answer.label}</p>
                      <p className="text-foreground">{answer.value}</p>
                    </CardContent>
                  </Card>
                )) : (
                  <p className="text-muted-foreground text-center py-4">Nenhuma resposta registrada</p>
                )}
              </div>
            </div>

            {(submission.utm_source || submission.landing_page || submission.referrer_url) && (
              <>
                <Separator />
                <div>
                  <h3 className="text-lg font-semibold mb-4">Dados de Rastreamento</h3>
                  <div className="grid grid-cols-2 gap-4">
                    {submission.utm_source && (
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div><p className="text-xs text-muted-foreground">UTM Source</p><p className="text-sm">{submission.utm_source}</p></div>
                      </div>
                    )}
                    {submission.utm_medium && (
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div><p className="text-xs text-muted-foreground">UTM Medium</p><p className="text-sm">{submission.utm_medium}</p></div>
                      </div>
                    )}
                    {submission.utm_campaign && (
                      <div className="flex items-start gap-2">
                        <Globe className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div><p className="text-xs text-muted-foreground">UTM Campaign</p><p className="text-sm">{submission.utm_campaign}</p></div>
                      </div>
                    )}
                    {submission.landing_page && (
                      <div className="flex items-start gap-2 col-span-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div><p className="text-xs text-muted-foreground">Landing Page</p><p className="text-sm truncate">{submission.landing_page}</p></div>
                      </div>
                    )}
                    {submission.referrer_url && (
                      <div className="flex items-start gap-2 col-span-2">
                        <LinkIcon className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div><p className="text-xs text-muted-foreground">Referrer</p><p className="text-sm truncate">{submission.referrer_url}</p></div>
                      </div>
                    )}
                    {submission.geo_city && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div><p className="text-xs text-muted-foreground">Localização</p><p className="text-sm">{submission.geo_city}{submission.geo_country && `, ${submission.geo_country}`}</p></div>
                      </div>
                    )}
                    {submission.user_agent && (
                      <div className="flex items-start gap-2">
                        <Smartphone className="h-4 w-4 text-muted-foreground mt-0.5" />
                        <div><p className="text-xs text-muted-foreground">Dispositivo</p><p className="text-sm truncate max-w-[200px]">{submission.user_agent}</p></div>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            <Separator />
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <div className="flex items-center gap-2">
                <Clock className="h-4 w-4" />
                <span>Tempo de preenchimento: {submission.time_spent_seconds ? `${Math.floor(submission.time_spent_seconds / 60)}m ${submission.time_spent_seconds % 60}s` : '-'}</span>
              </div>
              {submission.completed_at && (
                <span>Finalizado em: {format(new Date(submission.completed_at), 'HH:mm:ss')}</span>
              )}
            </div>
          </div>
        </ScrollArea>

        <div className="flex flex-wrap justify-end gap-2 p-4 border-t bg-background shrink-0">
          <Button variant="outline" onClick={onClose}>Fechar</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
