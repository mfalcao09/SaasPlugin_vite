import { useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';

/**
 * Heartbeat de presença do atendente super_admin no CRM de PLATAFORMA.
 *
 * O motor de distribuição (edge `platform-distribute-lead` + RPC
 * `platform_crm_distribute_lead`) só atribui lead a membro de squad cujo
 * `platform_crm_user_status.status = 'online'`. Sem um heartbeat no front esse
 * status nunca fica vivo e o round-robin/least-busy nunca vê ninguém online.
 * Este hook mantém a presença viva enquanto a shell da plataforma está montada.
 *
 * Porte do padrão de `useUserStatus` (tenant, tabela `user_status`), com os
 * guardrails do CRM de plataforma:
 *   - SEM organization_id (a tabela `platform_crm_user_status` não tem a coluna;
 *     a RLS super_admin-only isola os dados).
 *   - Gate por `is_super_admin(_user_id)` — só super_admin faz upsert (a policy
 *     `platform_crm_user_status_super_admin_only` rejeitaria qualquer outro).
 *
 * NÃO existe coluna `last_seen_at` nesta tabela; o "visto por último" é
 * `last_status_change`/`updated_at`. O motor não lê staleness (só filtra
 * `status = 'online'`), então marcar online já basta para a distribuição.
 * NÃO há RPC de upsert de status nem endpoint de beacon → upsert direto na
 * tabela (mesmo padrão `onConflict: 'user_id'` do original tenant).
 */

const HEARTBEAT_MS = 60_000;

// Upsert de presença. NÃO lança: presença é best-effort e não pode derrubar a shell.
async function markPresence(userId: string, status: 'online' | 'offline') {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('platform_crm_user_status')
    .upsert(
      {
        user_id: userId,
        status,
        last_status_change: now,
        updated_at: now,
      },
      { onConflict: 'user_id' },
    );
  if (error) {
    // Log, nunca silenciar: presença falha ≠ app quebrado, mas o motor precisa saber.
    console.warn('[platform-presence] upsert falhou:', error.message);
  }
}

export function usePlatformPresenceHeartbeat() {
  const { user } = useAuth();
  // Evita corrida no offline do unload: guarda o último userId "provado" super_admin.
  const activeUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    const userId = user?.id;
    if (!userId) {
      activeUserIdRef.current = null;
      return;
    }

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | undefined;

    // beforeunload: marca offline best-effort. NÃO dá para await no unload;
    // o upsert é disparado e o browser o carrega enquanto pode (sem beacon
    // porque não há endpoint dedicado). Idempotente e sem efeito colateral.
    const handleBeforeUnload = () => {
      const uid = activeUserIdRef.current;
      if (uid) void markPresence(uid, 'offline');
    };

    (async () => {
      // Gate: só super_admin participa da distribuição de leads da plataforma.
      const { data: isSuper, error } = await supabase.rpc('is_super_admin', {
        _user_id: userId,
      });
      if (cancelled) return;
      if (error) {
        console.warn('[platform-presence] is_super_admin falhou:', error.message);
        return;
      }
      if (!isSuper) return;

      activeUserIdRef.current = userId;

      // Marca online on mount + a cada 60s.
      void markPresence(userId, 'online');
      interval = setInterval(() => {
        void markPresence(userId, 'online');
      }, HEARTBEAT_MS);

      window.addEventListener('beforeunload', handleBeforeUnload);
    })();

    return () => {
      cancelled = true;
      if (interval) clearInterval(interval);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // Ao desmontar (logout / troca de shell), marca offline best-effort.
      const uid = activeUserIdRef.current;
      if (uid) void markPresence(uid, 'offline');
      activeUserIdRef.current = null;
    };
  }, [user?.id]);
}
