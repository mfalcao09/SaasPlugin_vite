import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface InstagramLoginConnection {
  id: string;
  instagram_user_id: string;
  username: string | null;
  name: string | null;
  account_type: string | null;
  status: string;
  token_expires_at: string | null;
  last_error: string | null;
  created_at: string;
}

const SELECT =
  'id, instagram_user_id, username, name, account_type, status, token_expires_at, last_error, created_at';

export function useInstagramLoginConnections() {
  return useQuery({
    queryKey: ['instagram-login-connections'],
    queryFn: async (): Promise<InstagramLoginConnection[]> => {
      const { data, error } = await supabase
        .from('instagram_login_connections' as never)
        .select(SELECT)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as InstagramLoginConnection[];
    },
  });
}

export function useStartInstagramLogin() {
  return useMutation({
    mutationFn: async (): Promise<{ authorize_url: string }> => {
      const { data, error } = await supabase.functions.invoke('instagram-login-oauth-start', {
        body: {},
      });
      if (error) throw error;
      if ((data as { error?: string } | null)?.error) {
        throw new Error((data as { error: string }).error);
      }
      const url = (data as { authorize_url?: string } | null)?.authorize_url;
      if (!url) throw new Error('authorize_url ausente');
      return { authorize_url: url };
    },
    onError: (e: Error) => toast.error('Não foi possível iniciar o Instagram Login', {
      description: e.message,
    }),
  });
}
