-- BLOCO A (A2 a A7) — fechamento dos itens do placar de GO LIVE.
-- Consolida as migrations aplicadas em prod:
--   a2_cron_capi_send
--   a3_drop_policies_insert_anonimo_irrestrito
--   a5_search_path_imutavel_8_funcoes
--   a6_fecha_listagem_5_buckets_publicos
--   a7_cron_whatsapp_health_alert
--
-- EFEITO MEDIDO no advisor de seguranca: 77 -> 60 alertas, 4 regras zeradas.
-- (A4 — flip do B3 — NAO esta aqui: segue bloqueado, ver o fim do arquivo.)


-- ════════════════════════════════════════════════════════════════════════════
-- A2 — o CONSUMIDOR do CAPI: cron que drena a fila
-- ════════════════════════════════════════════════════════════════════════════
-- `platform-capi-send` existia desde 16/07 e NUNCA foi chamado por ninguem: zero
-- cron, zero invocacao no codigo. Com o A1 produzindo eventos, sem isto eles
-- morreriam na fila.
--
-- SEGURO SEM AS CREDENCIAIS DO META: a propria funcao decide
--   live = CAPI_ENABLED && META_CAPI_TOKEN && META_CAPI_DATASET_ID && META_CAPI_WABA_ID
-- e, sem isso, roda em DRY-RUN. Ligar agora prova o encanamento; quando os 4 secrets
-- entrarem ele passa a enviar de verdade SEM tocar em codigo.
--
-- A cada 5 min, nao a cada minuto: o Meta aceita evento com ate 7 dias e a fila de
-- venda e rala. Um tick por minuto seria 1.440 invocacoes/dia para drenar unidades.
--
-- PROVADO: invocacao pelo mesmo caminho do cron (vault) -> 200
--          {"ok":true,"mode":"dry_run","candidates":0,...}
select cron.schedule('platform-capi-send-drain', '*/5 * * * *', $c1$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/platform-capi-send',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
$c1$);


-- ════════════════════════════════════════════════════════════════════════════
-- A3 — derruba as duas policies de INSERT irrestrito por anonimo
-- ════════════════════════════════════════════════════════════════════════════
-- `WITH CHECK true` = qualquer pessoa na internet, com a chave anon que vive dentro
-- do bundle JS publico, insere linha a vontade. Sem rate limit, sem validacao. Hoje
-- ninguem acha essas URLs; com trafego pago, acham.
--
-- POR QUE NAO QUEBRA O FORMULARIO PUBLICO — verificado, nao presumido:
--   booking-submit        service_role=2  anon=0
--   capture-lead          service_role=1  anon=0
--   webchat-bot           service_role=8  anon=0
--   salao-public-booking  service_role=1  anon=0
--   front (src/)          NAO insere direto em nenhuma das duas
-- service_role IGNORA RLS. A policy anonima era residuo de quando o front inseria
-- direto. As policies legitimas (host_user_id = auth.uid() / is_super_admin) ficam.
--
-- PROVADO: anon -> 42501 nas DUAS · capture-lead -> {"ok":true,"lead_id":"c809a621..."}
drop policy if exists "Anyone can create booking requests" on public.booking_requests;
drop policy if exists "Anyone can insert sales leads"      on public.sales_leads;


-- ════════════════════════════════════════════════════════════════════════════
-- A5 — search_path fixo nas 8 funcoes apontadas
-- ════════════════════════════════════════════════════════════════════════════
-- Funcao SECURITY DEFINER sem search_path fixo resolve nomes de tabela usando o
-- search_path de QUEM CHAMA. Quem controlar isso cria um schema com tabela homonima
-- e faz a funcao privilegiada escrever la — escalonamento silencioso, porque a funcao
-- continua "funcionando".
--
-- Inclui `ads_capi_pending`, que o A2 acabou de ligar no caminho do CAPI: consertado
-- agora em vez de virar divida no que acabou de ser montado.
alter function public.tg_push_subscriptions_updated_at() set search_path to 'public';
alter function public.sc_view_ins()  set search_path to 'public';
alter function public.sc_view_upd()  set search_path to 'public';
alter function public.sc_view_del()  set search_path to 'public';
alter function public.pac_view_ins() set search_path to 'public';
alter function public.pac_view_upd() set search_path to 'public';
alter function public.pac_view_del() set search_path to 'public';
alter function public.ads_capi_pending(integer) set search_path to 'public';


-- ════════════════════════════════════════════════════════════════════════════
-- A6 — fecha a ENUMERACAO dos 5 buckets publicos, sem fechar a leitura
-- ════════════════════════════════════════════════════════════════════════════
-- A policy era `SELECT USING (bucket_id = 'X')` — e a MESMA permissao serve dois usos
-- diferentes: ler um arquivo cujo caminho voce ja sabe, e LISTAR tudo que existe no
-- bucket. A segunda entrega o inventario de arquivos de todos os tenants a qualquer
-- anonimo.
--
-- POR QUE DROPAR NAO QUEBRA A LEITURA: em bucket com `public = true`, a leitura por
-- URL passa pelo endpoint publico e NAO consulta RLS. A policy so governa a API
-- autenticada — que e por onde o `.list()` passa.
--
-- PROVADO EMPIRICAMENTE antes de aplicar aos outros 4 (nao presumido). Objeto de
-- teste subido em squad-icons:
--   ANTES:  GET publico -> 200 · list anonimo -> devolveu nome, id e datas do arquivo
--   DEPOIS: GET publico -> 200 (intacto) · list anonimo -> []
-- Objeto de teste removido. Verificado tambem: ZERO chamadas a `.list()` nesses
-- buckets em src/ e supabase/. As policies de UPDATE/DELETE (dono do avatar, admin
-- da org, super admin) ficam INTACTAS.
--
-- Os 5 buckets estao VAZIOS hoje: isto fecha risco latente, nao vazamento ativo — a
-- porta fica fechada antes de o conteudo chegar.
drop policy if exists "Anyone can view avatars"             on storage.objects;
drop policy if exists "Anyone can view company logos"       on storage.objects;
drop policy if exists "Help media is publicly accessible"   on storage.objects;
drop policy if exists "Anyone can view platform assets"     on storage.objects;
drop policy if exists "Squad icons are publicly accessible" on storage.objects;


-- ════════════════════════════════════════════════════════════════════════════
-- A7 — cron do alerta de WhatsApp caido (metade do B9)
-- ════════════════════════════════════════════════════════════════════════════
-- Quando a instancia desconecta ninguem fica sabendo; a dona descobre porque as
-- clientes pararam de responder. `meuteste1-sal-o1` esta fora desde 21/07 03:28 e
-- nenhum alerta saiu.
--
-- A cada 15 min: queda de instancia nao e evento de segundo, e 15 min e o atraso
-- maximo aceitavel para alguem saber que o canal de atendimento morreu.
--
-- O REALERTA (6h) vive no BANCO — evolution_instances.metadata.health_alert_at —
-- e nao em memoria: `sendTelegramAlertThrottled` guarda estado num Map de processo,
-- e cron cria isolate novo a cada tick; o Map nasceria vazio sempre e o alerta sairia
-- de 15 em 15 min. Ruido treina a pessoa a ignorar o canal.
--
-- PROVADO: 1o disparo -> {"alertadas":1,"detalhe":["meuteste1-sal-o1"]} + marca gravada
--          2o disparo -> {"alertadas":0,"silenciadas":1}  (throttle segurou)
select cron.schedule('whatsapp-health-alert', '*/15 * * * *', $c2$
  select net.http_post(
    url := 'https://fzhlbwhdejumkyqosuvq.supabase.co/functions/v1/whatsapp-health-alert',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body := '{}'::jsonb
  );
$c2$);


-- ════════════════════════════════════════════════════════════════════════════
-- A4 — NAO FEITO, de proposito
-- ════════════════════════════════════════════════════════════════════════════
-- O flip do gate B3 (shadow -> enforcing) NAO foi aplicado. O comentario do proprio
-- evolution-webhook registra o motivo:
--
--   "Nao ha prova de que o Evolution Go ecoa `instance_token` no corpo; enforce cego
--    mataria a ingestao em silencio."
--
-- Um teste sintetico prova que o MECANISMO funciona quando o token chega — o que nao
-- e a mesma afirmacao que "o Evolution manda esse token". `instance_token` e gerado
-- por NOS e enviado PARA o Evolution; que ele volte no webhook e suposicao.
--
-- Com a instancia desconectada nao ha trafego real para observar. Flipar agora
-- significa: se o Evolution nao ecoar, o WhatsApp para de entrar no minuto em que o
-- Marcelo reconectar, sem sintoma obvio.
--
-- DESTRAVA COM: reconectar meuteste1-sal-o1 + 1 mensagem real -> ler o log
-- `B3-SHADOW would_pass` -> so entao flipar.
