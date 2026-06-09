// Wrapper fino sobre o OAuth social nativo do Supabase.
// Mantém a interface `lovable.auth.signInWithOAuth(provider, opts)` usada pelo
// frontend, sem depender de SDKs externos de cloud-auth.

import { supabase } from "../supabase/client";

type SignInOptions = {
  redirect_uri?: string;
  extraParams?: Record<string, string>;
};

type SignInResult = {
  redirected: boolean;
  error?: Error | { message: string };
};

export const lovable = {
  auth: {
    signInWithOAuth: async (
      provider: "google" | "apple" | "microsoft" | "lovable",
      opts?: SignInOptions,
    ): Promise<SignInResult> => {
      // O Supabase só suporta provedores OAuth reais; "lovable" não é um.
      if (provider === "lovable") {
        return { redirected: false, error: new Error("Provider não suportado: lovable") };
      }

      const { error } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo: opts?.redirect_uri,
          queryParams: opts?.extraParams,
        },
      });

      if (error) {
        return { redirected: false, error };
      }

      // signInWithOAuth redireciona o navegador automaticamente quando bem-sucedido.
      return { redirected: true };
    },
  },
};
