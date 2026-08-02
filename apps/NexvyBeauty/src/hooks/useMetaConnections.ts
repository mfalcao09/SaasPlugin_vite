// Lista as conexões de WhatsApp Oficial (Meta) da própria organização.
//
// ⚠️ POR QUE ISTO NÃO EXISTIA ATÉ AGORA — e por que a falta era invisível: a aba
// "WhatsApp Oficial" exibia um card com o texto "Nenhum número oficial conectado
// nesta conta ainda" **hardcoded**, sem query nenhuma por trás. E o botão de
// conectar, ao ter sucesso, chamava
// `invalidateQueries({ queryKey: ['whatsapp-meta-connections'] })` — uma chave
// que NENHUMA query no app usava (medido: a única ocorrência era a própria
// invalidação).
//
// O efeito: uma conexão bem-sucedida mostrava o toast de sucesso e a tela
// continuava afirmando que não havia conexão nenhuma. Para sempre.
//
// O `invalidateQueries` é o caso mais limpo do padrão que esta trilha catalogou:
// tem a FORMA exata de "atualize a lista", faz quem lê o código parar de
// perguntar, e não atualiza nada porque não há lista. Este arquivo é a lista.
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/** Chave única — a mesma que o wizard invalida ao concluir. */
export const META_CONNECTIONS_KEY = ['whatsapp-meta-connections'] as const;

export interface MetaConnection {
  id: string;
  display_name: string;
  phone_number: string | null;
  business_account_name: string | null;
  status: string;
  quality_rating: string | null;
  messaging_limit_tier: string | null;
  created_at: string;
}

export function useMetaConnections() {
  return useQuery({
    queryKey: META_CONNECTIONS_KEY,
    queryFn: async (): Promise<MetaConnection[]> => {
      // ⚠️ A projeção é EXPLÍCITA e nunca deve virar `select('*')`.
      // A tabela guarda `access_token_encrypted` e `app_secret_encrypted`; um
      // `*` mandaria os dois para o navegador. Cifrados, sim — mas não há
      // motivo para o front recebê-los, e "está cifrado" é justamente o tipo de
      // consolo que faz alguém parar de perguntar.
      //
      // A RLS permite este SELECT para admin/manager da própria org
      // (`user_belongs_to_organization` + `has_role`), então a leitura vai
      // direto do client — sem edge function no meio.
      const { data, error } = await supabase
        .from('whatsapp_meta_connections')
        .select(
          'id, display_name, phone_number, business_account_name, status, ' +
            'quality_rating, messaging_limit_tier, created_at',
        )
        // Rascunhos (`status='pending'`, criados pela `-exchange` e completados
        // pela `-register`) NÃO são conexões: são wizard pela metade. Mostrá-los
        // faria a tela contar como canal algo que ainda não conecta nada — e o
        // contador do plano, que lê `get_org_channel_usage`, também não os conta.
        .neq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return (data ?? []) as MetaConnection[];
    },
  });
}
