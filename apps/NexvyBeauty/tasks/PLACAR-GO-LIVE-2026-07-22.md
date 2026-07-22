# Placar GO LIVE — 22/07/2026

> Atualização do placar pedida por Marcelo. Cada linha aqui tem prova executada, não
> alegação. Onde não houve prova, está escrito **"não provado"** — não "pronto".

---

## Veredito: **não libere o anúncio ainda.** Faltam 2 coisas, e nenhuma é código de produto.

O funil e a segurança fecharam hoje. O que trava é o **outro** lado:

1. **`ads_capi_events = 0`.** Nenhum evento de `Purchase` jamais chegou ao Meta. Rodar
   tráfego pago sem CAPI é pagar por clique e não devolver sinal de conversão — o
   algoritmo não tem o que otimizar. É o item que mais custa dinheiro se ignorado.
2. **Duas policies de `INSERT` abertas a qualquer anônimo** (`booking_requests`,
   `sales_leads`), sem rate limit. Hoje ninguém acha essas URLs. Com tráfego pago,
   acham — e a primeira coisa que chega junto com o cliente é o bot.

Tudo o mais que bloqueava está fechado e provado abaixo.

---

## Fechado hoje, com prova

| # | Item | Prova executada |
|---|---|---|
| **B4** | Ingestão do WhatsApp poluía a carteira com 84.194 linhas, 0 nomes reais | 45.237 `lixeira/lid` · 35.745 `lixeira/nao_br` · 3.212 `a_revisar` · **0** nome curado na lixeira · **0** transacional na lixeira |
| **B4-origem** | `upsert_clientes_whatsapp` gravava o telefone/LID no campo *nome* | RPC corrigida (`coalesce(r.nome,'')`); sem isso a próxima sync recriaria tudo |
| **B4-regex** | Guard de "nome é lixo" usava `\\s` (barra literal, não espaço) | `(11) 99999-9999` era `false`, agora `true`; `Maria Silva` segue `false` |
| **B4-tela** | 9 pontos liam `clientes` sem filtro — inclusive contagens e segmentação de disparo | todos com `carteira_estado='principal'`; abas + botão "É cliente" no ar (`Clientes-BoEZrX3B.js` servido em produção contém os 4 marcadores) |
| **SEC** | `platform_vendas_por_seller` legível por **anônimo** | antes: `{"vendas":2,"receita_total":100.99,...}` sem login → depois: `{"code":"42501","permission denied"}` |
| **B6** | Limite de plano falhava em silêncio | `apply-onboarding v19` ACTIVE, devolve `quota_blocks` |
| **B5** | Agente de tenant nascia sem rota para humano | migration de backfill aplicada |
| **B3** | Webhook Evolution sem validação de origem | **shadow**, logando `B3-SHADOW would_pass` — ver "depende de você" |
| **D1** | E-mail de recompra: `Resend 409 invalid_idempotent_req` | `cakto-webhook v58` + `cakto-reprocess-order v50` deployadas 21/07 23:28 — **não provado** (nenhuma compra desde) |

**Gates:** `npm run build` verde · `tsc` 40 → 32 erros (os 8 introduzidos eliminados;
32 são pré-existentes) · `/demo/salao/clientes` renderiza com 0 erro de console ·
`DEPLOY-VERDE` com gate anti-phantom em `gestao.nexvy.tech`.

---

## Aberto — bloqueia o anúncio

| # | Item | Estado real |
|---|---|---|
| **B7/D5** | Meta Purchase / CAPI | `ads_capi_events = 0`. Nunca disparou. |
| **B8a** | `booking_requests` e `sales_leads`: policy de `INSERT` com `WITH CHECK` sempre verdadeiro | Qualquer anônimo insere sem limite. Superfície de flood sob tráfego pago. |
| **B8b** | Proteção de senha vazada (HaveIBeenPwned) | Desligada. É um toggle no painel Supabase. |
| **B9** | Alerta de WhatsApp caído + PITR | Não configurado. |
| — | 5 buckets públicos permitem **listagem** | Enumeração de arquivos de outros tenants. |
| — | 8 funções com `search_path` mutável | Risco de shadowing; não explorável sozinho. |

---

## Depende de você (HITL) — eu não consigo destravar

| # | O que precisa | Por quê |
|---|---|---|
| 1 | **Reconectar `meuteste1-sal-o1`** e mandar 1 mensagem real | Destrava **duas** coisas: o flip do B3 (preciso ver `B3-SHADOW would_pass` em tráfego real antes de passar a bloquear) e a Camada 2 do B4 (preciso de uma amostra provando `key.fromMe`) |
| 2 | **Uma compra real no Essencial** | Única prova possível do D1 (o e-mail de fato entregar) e do funil ponta-a-ponta com dinheiro real |
| 3 | **Ligar o toggle** de senha vazada no painel Supabase | B8b — 30 segundos, eu não tenho acesso ao painel |
| 4 | Decidir se os **3.212 `a_revisar`** vão pra campanha ou ficam parados | É a carteira de leads da dona-teste; ninguém deve disparar nela sem revisão |

---

## Números da carteira (org de teste `5da38ea6…`)

| Fatia | Qtd | O que é |
|---|---|---|
| Minha carteira | **0** | Zero clientes reais — a org de teste nunca teve venda no salão |
| A revisar | **3.212** | Número BR discável, sem nome. Podem ser clientes. |
| Ruído | **80.982** | LID do Evolution, 0800, DDD inexistente. Recuperável a 1 clique. |

Nada foi apagado. `carteira_estado` volta com um `UPDATE`; o botão **"É cliente"**
grava `revisado_em`, que trava a linha contra qualquer reclassificação futura.

---

## Correção de rumo que eu devo registrar

Eu havia dito que **"todos os gaps de segurança de hoje cedo foram fechados"**. Não
tinham. O vazamento de faturamento por anônimo sobreviveu a B1, B2 e B3 porque essas
ondas olharam *funções* e *policies de tabela* — e o furo estava numa **view**, que
tem um `SECURITY DEFINER` implícito que nenhuma daquelas varreduras cobria.

A lição operacional: varredura por categoria de objeto deixa buraco na categoria que
ninguém listou. O advisor do Supabase pegou; eu só o rodei porque fui conferir em vez
de repetir o que já tinha afirmado.
