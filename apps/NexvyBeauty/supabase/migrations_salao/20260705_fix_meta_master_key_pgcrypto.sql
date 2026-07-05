-- ─────────────────────────────────────────────────────────────────────────────
-- 20260705_fix_meta_master_key_pgcrypto.sql — bug de prod no porte Vendus
--
-- get_or_create_meta_master_key() roda com SET search_path TO 'public'
-- (higiene correta de SECURITY DEFINER), mas pgcrypto está no schema
-- `extensions` → gen_random_bytes(32) estourava 42883 na PRIMEIRA cifragem
-- (nenhuma credencial Meta foi salva ainda; o wizard quebraria no submit).
-- Descoberto pelo smoke test do platform-meta-whatsapp-webhook (F1).
--
-- Fix mínimo: qualificar extensions.gen_random_bytes — sem abrir o
-- search_path, sem tocar no contrato (mesmo nome/retorno/semântica).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_or_create_meta_master_key()
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  k text;
  settings_id uuid;
BEGIN
  SELECT id, meta_wa_master_key INTO settings_id, k FROM public.platform_settings LIMIT 1;
  IF settings_id IS NULL THEN
    INSERT INTO public.platform_settings DEFAULT VALUES RETURNING id INTO settings_id;
  END IF;
  IF k IS NULL OR length(k) = 0 THEN
    k := encode(extensions.gen_random_bytes(32), 'base64');
    UPDATE public.platform_settings SET meta_wa_master_key = k WHERE id = settings_id;
  END IF;
  RETURN k;
END;
$function$;
