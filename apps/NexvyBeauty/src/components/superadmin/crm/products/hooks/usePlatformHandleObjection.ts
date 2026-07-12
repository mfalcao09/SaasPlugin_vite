// usePlatformHandleObjection — consumidor de stream (SSE) do edge
// `platform-handle-objection` (CRM de PLATAFORMA, super_admin, product-scoped).
//
// Porte 1:1 do `useHandleObjection` do CRM Vendus (tenant, hooks/useObjectionAI.ts),
// desacoplado do tenant:
//   * Edge product-scoped: platform-handle-objection (gate super_admin + productId,
//     NUNCA organizationId). Streaming SSE PRESERVADO (mesmo passthrough do original).
//   * Auth: o edge valida `Authorization: Bearer <JWT do usuário>` via getClaims e
//     exige role super_admin. O original mandava a PUBLISHABLE_KEY como Bearer — aqui
//     isso daria 401 (claims.sub ausente). Enviamos o access_token FRESCO da sessão
//     (mesmo cuidado de useWebChat: getSession() evita 401 pós-refresh) e a
//     publishable key vai no header `apikey` (exigência do gateway de Functions).
//   * Parser SSE idêntico ao original: buffer por linha, prefixo `data: `,
//     choices[0].delta.content, `[DONE]` encerra.
import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const PUBLISHABLE_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY;

/** Token FRESCO da sessão — o cache do useAuth pode ficar atrás do auto-refresh
 *  do Supabase e causar 401 "Invalid token" logo após o JWT expirar. */
async function getFreshAccessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

export function usePlatformHandleObjection() {
  const [isLoading, setIsLoading] = useState(false);
  const [response, setResponse] = useState<string>('');

  const handleObjection = async (
    objection: string,
    productId: string,
    onDelta?: (text: string) => void,
  ): Promise<string> => {
    setIsLoading(true);
    setResponse('');

    try {
      const accessToken = await getFreshAccessToken();
      if (!accessToken) {
        throw new Error('Sessão expirada. Faça login novamente.');
      }

      const resp = await fetch(`${SUPABASE_URL}/functions/v1/platform-handle-objection`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: PUBLISHABLE_KEY,
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ objection, productId }),
      });

      if (!resp.ok || !resp.body) {
        const error = await resp.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || 'Falha ao obter resposta da IA');
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let textBuffer = '';
      let fullResponse = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        textBuffer += decoder.decode(value, { stream: true });

        let newlineIndex: number;
        while ((newlineIndex = textBuffer.indexOf('\n')) !== -1) {
          let line = textBuffer.slice(0, newlineIndex);
          textBuffer = textBuffer.slice(newlineIndex + 1);

          if (line.endsWith('\r')) line = line.slice(0, -1);
          if (line.startsWith(':') || line.trim() === '') continue;
          if (!line.startsWith('data: ')) continue;

          const jsonStr = line.slice(6).trim();
          if (jsonStr === '[DONE]') break;

          try {
            const parsed = JSON.parse(jsonStr);
            const content = parsed.choices?.[0]?.delta?.content as string | undefined;
            if (content) {
              fullResponse += content;
              setResponse(fullResponse);
              onDelta?.(content);
            }
          } catch {
            textBuffer = line + '\n' + textBuffer;
            break;
          }
        }
      }

      return fullResponse;
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => setResponse('');

  return { handleObjection, isLoading, response, reset };
}

/** Extrai as 3 seções do texto gerado (mesmos regex do original ObjectionAssistant/
 *  ManualObjectionForm). Retorna strings já trimadas (vazias se não casarem). */
export function parseObjectionResponse(response: string): {
  whatTheyMean: string;
  suggestedResponse: string;
  followUpQuestion: string;
} {
  const whatTheyMeanMatch = response.match(
    /\*\*O QUE ELE QUER DIZER:\*\*\s*([\s\S]*?)(?=\*\*RESPOSTA SUGERIDA:\*\*|$)/i,
  );
  const responseMatch = response.match(
    /\*\*RESPOSTA SUGERIDA:\*\*\s*([\s\S]*?)(?=\*\*PERGUNTA DE RETORNO:\*\*|$)/i,
  );
  const questionMatch = response.match(/\*\*PERGUNTA DE RETORNO:\*\*\s*([\s\S]*?)$/i);

  return {
    whatTheyMean: whatTheyMeanMatch?.[1]?.trim() || '',
    suggestedResponse: responseMatch?.[1]?.trim() || '',
    followUpQuestion: questionMatch?.[1]?.trim() || '',
  };
}
