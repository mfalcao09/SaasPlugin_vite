// Recupera a mensagem de negócio que uma edge function devolveu.
//
// ⚠️ `supabase.functions.invoke` só preenche `data` em 2xx. Em 409/403/503 ele
// devolve `FunctionsHttpError` com **`data` NULO**, e o corpo — onde vivem as
// frases que dizem ao tenant o que fazer ("este número já está conectado a
// outra conta", "seu plano inclui N conexões…") — só existe em `error.context`,
// que é a `Response` crua.
//
// Sem isto, `error ?? data?.error` cai sempre no texto genérico: as mensagens
// existem no servidor, estão corretas, e NENHUMA chega à tela. O `error.message`
// do próprio SDK também não serve — é "Edge Function returned a non-2xx status
// code", que não ajuda ninguém.
//
// Medido em 2026-08-02: 112 arquivos do app chamam `functions.invoke` e só 3
// leem `error.context`. Este helper existe para que os call sites novos não
// entrem na conta errada — e para que a correção tenha UM lugar, em vez de ser
// recopiada e esquecida como aconteceu no resto do repo.
export async function serverMessage(error: unknown, data: unknown): Promise<string | null> {
  const inline = (data as { error?: string } | null)?.error;
  if (inline) return inline;

  const ctx = (error as { context?: Response } | null)?.context;
  if (!ctx || typeof ctx.json !== 'function') return null;

  try {
    const body = await ctx.json();
    return typeof body?.error === 'string' ? body.error : null;
  } catch (e) {
    // Corpo não-JSON (proxy, gateway, 502). Devolver null é honesto: o chamador
    // mostra o texto genérico em vez de inventar uma causa. O log existe para
    // quem for depurar, não como tratamento — o usuário já foi avisado.
    console.warn('[edge] resposta de erro sem corpo JSON', e);
    return null;
  }
}
