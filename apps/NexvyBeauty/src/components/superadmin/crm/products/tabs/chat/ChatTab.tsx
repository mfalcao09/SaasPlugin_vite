// ChatTab — Simulador de conversa do produto (aba do Hub de Produto).
//
// PORTE ENXUTO (recuperação do F1a estagnado): a fonte
// `admin/products/tabs/chat/ChatSimulator.tsx` (438 linhas) testa o agente de
// venda do produto usando `useKnowledgeSources` + `WebChatAgentConfig` (tenant)
// + edge `webchat-bot`. Essas dependências pertencem à ONDA DE AGENTES (F1d),
// ainda não portada. Aqui entregamos o simulador funcional-mínimo wired ao
// `platform-webchat-bot` (que existe) com contexto de produto; o porte 1:1
// profundo (fontes de conhecimento, config de agente, streaming) é TODO(F1d).
import { useState, useRef, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bot, User, Send, Trash2, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformCrmProduct } from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { cn } from '@/lib/utils';

interface ChatTabProps {
  productId: string;
}

interface SimMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export function ChatTab({ productId }: ChatTabProps) {
  const { data: product } = usePlatformCrmProduct(productId);
  const [messages, setMessages] = useState<SimMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    setMessages((m) => [...m, { role: 'user', content: text }]);
    setLoading(true);
    try {
      // TODO(F1d): passar config do agente-de-produto (platform_crm_product_agents)
      // + fontes de conhecimento quando a onda de Agentes portar esse subsistema.
      const { data, error } = await supabase.functions.invoke('platform-webchat-bot', {
        body: { simulate: true, product_id: productId, message: text },
      });
      if (error) throw error;
      const reply =
        (data && (data.reply || data.message || data.content)) ||
        'Simulador conectado, mas o edge não retornou resposta contextualizada ainda (TODO F1d).';
      setMessages((m) => [...m, { role: 'assistant', content: String(reply) }]);
    } catch (e) {
      setMessages((m) => [
        ...m,
        {
          role: 'system',
          content:
            'Não foi possível simular a resposta do agente. O simulador completo (config de agente + base de conhecimento) chega na onda de Agentes (F1d).',
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          Simulador de Conversa
        </CardTitle>
        <CardDescription>
          Teste como o agente responde por {product?.name ? `"${product.name}"` : 'este produto'}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <ScrollArea className="h-[380px] rounded-lg border bg-muted/20 p-4">
          {messages.length === 0 ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center text-center text-sm text-muted-foreground">
              <Bot className="mb-2 h-8 w-8 opacity-40" />
              Envie uma mensagem para simular o atendimento deste produto.
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg, i) => (
                <div
                  key={i}
                  className={cn('flex gap-2', msg.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  {msg.role !== 'user' && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Bot className="h-4 w-4" />
                    </div>
                  )}
                  <div
                    className={cn(
                      'max-w-[75%] rounded-2xl px-3 py-2 text-sm',
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : msg.role === 'system'
                          ? 'border border-amber-300 bg-amber-50 text-amber-800'
                          : 'border bg-white text-foreground',
                    )}
                  >
                    {msg.content}
                  </div>
                  {msg.role === 'user' && (
                    <div className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <User className="h-4 w-4" />
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> pensando…
                </div>
              )}
              <div ref={endRef} />
            </div>
          )}
        </ScrollArea>
        <div className="flex items-center gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && send()}
            placeholder="Digite como um lead…"
            disabled={loading}
          />
          <Button onClick={send} disabled={loading || !input.trim()} className="gap-1.5">
            <Send className="h-4 w-4" /> Enviar
          </Button>
          {messages.length > 0 && (
            <Button variant="ghost" size="icon" onClick={() => setMessages([])} title="Limpar">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
