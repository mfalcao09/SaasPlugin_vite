# PROTÓTIPO — "Actor de Query" IG (busca dentro dos seguidores por keyword)

**Projeto:** NexvyBeauty · C9 — motor de extração de leads Instagram-first
**Data:** 2026-07-13
**Autor:** spike de scraping (subagente)
**Arquivos:**
- Protótipo: `apps/NexvyBeauty/tasks/c9-follower-query-prototype.ts`
- Este relatório: `apps/NexvyBeauty/tasks/PROTOTIPO-ACTOR-QUERY-IG-2026-07-13.md` (+ `.html`)

---

## 1. VEREDITO

**VIÁVEL — porém a premissa central estava errada e precisa ser corrigida.**

- **[Certo]** O endpoint de busca dentro dos seguidores **existe** e aplica o filtro `query` **server-side** (só volta quem casa). A tese "pagar só pelo rio, não pelo oceano" **se sustenta na banda**.
- **[Certo] Ele NÃO é um endpoint guest.** Exige **sessão autenticada** (cookie `sessionid`). Provei isso ao vivo: em modo guest o endpoint devolveu **HTTP 401 Unauthorized**. A premissa do briefing ("o endpoint guest não usa login") está incorreta **para followers** — a busca de seguidores fica atrás do login-wall independentemente do `query`.
- **Consequência prática:** o setup de produção precisa de **proxy residencial + um POOL DE CONTAS LOGADAS do IG** (não só proxy residencial). Esse é o custo/risco binding, não a banda.
- **O que NÃO consegui provar daqui:** que o filtro devolve só-matches ao vivo — isso exige uma sessão válida, que eu não tenho e não devo criar no spike. A confirmação do filtro é **[Provável]**, ancorada no código do `instagrapi` (usado em produção por milhares), não em execução minha.

> Correção de premissa (Modo Conselheiro): o briefing comparava com o actor de mercado `jWD4G57HhqYY0mFhd` dizendo que ele "não oferece" o filtro. O diferencial real do nosso actor **não é ter acesso guest** (não existe) — é **empurrar o `query` para o servidor e paginar só o subconjunto casado**, usando as mesmas contas logadas que qualquer scraper de followers já precisa. O ganho é de **banda/páginas trafegadas**, não de dispensar autenticação.

---

## 2. Endpoint confirmado + fontes

### 2.1. Resolução `username` → `user_id` (guest, funciona)
```
GET https://i.instagram.com/api/v1/users/web_profile_info/?username=<username>
Header obrigatório:  x-ig-app-id: 936619743392459   (web app id do IG, público)
```
Retorna `data.user.id` (+ `edge_followed_by.count`). **Guest-acessível** com só o `x-ig-app-id`. Provado ao vivo (ver §3).

### 2.2. Busca dentro dos seguidores — o "rio" (autenticado)
```
GET https://www.instagram.com/api/v1/friendships/<user_id>/followers/
      ?count=<n>
      &search_surface=follow_list_page
      &query=<keyword>          <-- filtro server-side: só volta quem casa
      &enable_groups=true
      [&max_id=<cursor>]        <-- paginação (next_max_id do corpo anterior)
Headers:  x-ig-app-id: 936619743392459
          x-csrftoken: <csrftoken>
          cookie: sessionid=<...>; csrftoken=<...>
```
- Params `search_surface=follow_list_page` + `query` + `enable_groups=true` vêm **verbatim do `search_followers_v1` do instagrapi** (a caixa de busca do app do IG usa exatamente essa superfície).
- Host: `www.instagram.com/api/v1/...` (web) — equivalente ao `friendships/<id>/followers/` do app mobile (`i.instagram.com`). Ambos usam `private_request()` = **autenticado**.

### 2.3. Fontes
- **Scrapfly — "How to Scrape Instagram in 2026"** — confirma `web_profile_info` + `x-ig-app-id: 936619743392459`; confirma que **"Full follower and following lists: behind login"**; **"Datacenter IPs blocked instantly / Residential IPs required"**; rate-limit **~200 req/h/IP** para não-autenticado. https://scrapfly.io/blog/posts/how-to-scrape-instagram
- **instagrapi (subzeroid) — `mixins/user.py`** — `search_followers_v1`: endpoint `friendships/{user_id}/followers/`, params `{search_surface: "follow_list_page", query, enable_groups: "true"}`, via `private_request()` (autenticado). `user_followers_v1_chunk` idem, com `count`, `rank_token`, `max_id`. https://github.com/subzeroid/instagrapi (arquivo `instagrapi/mixins/user.py`)
- **instagrapi — issue #234 "Search by followers"** — caso de uso de busca por keyword na lista de seguidores. https://github.com/subzeroid/instagrapi/issues/234
- **Graph API oficial (keyapi)** — confirma que a API oficial **não** devolve a lista de followers, só `followers_count` → por isso a rota é o private API. https://www.keyapi.ai/blog/instagram-graph-api-get-followers-list-following/
- **Apify — pricing de proxy** — Residential **$8/GB** (Free/Starter), **$7.5/GB** (Scale), **$7/GB** (Business). https://apify.com/pricing/proxy

---

## 3. O que rodou AO VIVO (deste ambiente)

Executado a partir do Mac do Marcelo (não é IP de datacenter clássico — é a conexão local), **modo guest, trava de 1 página = 2 requests no total** ao IG:

```
$ node c9-follower-query-prototype.ts unhass.decoradas manicure 1

[spike] alvo=@unhass.decoradas keyword="manicure" maxPages=1 modo=GUEST (sem login)
[spike] user_id=7091857297 followers_total=846481
[spike][ERRO] follower-search bloqueado: HTTP 401 — 401 Unauthorized (login-wall: endpoint exige sessão)
```

**Leitura honesta:**
| Passo | Resultado | Interpretação |
|---|---|---|
| 1. `web_profile_info` (guest) | **200 OK** → user_id `7091857297`, 846.481 seguidores | Resolução de user_id funciona guest; o IP **não** está sob bloqueio geral |
| 2. `followers?query=manicure` (guest) | **HTTP 401** | Login-wall de auth — **não** é bloqueio de IP nem challenge. O passo 1 passou no mesmo IP |

- **O 401 aqui é a trava de autenticação, não bloqueio de IP datacenter.** Como o passo 1 passou, dá pra separar as duas coisas: o endpoint de followers rejeita quem não tem `sessionid`, ponto.
- **Não martelei o IG:** 2 requests, parei no primeiro sinal de bloqueio. Filtro de `query` **não** pôde ser exercido (precisa de sessão).
- **Caveat de IP:** este ambiente **não** reproduz o cenário de produção (proxy residencial + conta logada). Um 401 por falta de sessão continuaria 401 mesmo com proxy residencial — o que destrava é a **conta logada**, não o proxy. O proxy residencial destrava o *outro* eixo (evitar o "datacenter blocked instantly" e o rate-limit por IP), que aqui nem chegou a ser testado.

---

## 4. Diagnóstico de bloqueio (honesto)

Dois eixos de bloqueio, independentes:

1. **Auth (o que bati agora):** followers exige `sessionid`. Guest = 401 sempre. **Proxy não resolve isso** — só conta logada resolve.
2. **IP / rate (não testei ao vivo):** com sessão logada, o IG bane **IP de datacenter "instantly"** e limita ~200 req/h/IP não-autenticado (autenticado costuma ser mais permissivo, mas com risco de challenge na conta). **É aqui que entra o proxy residencial** com sticky session 5–10 min.

Ou seja: para uma medição representativa faltam **as duas coisas ao mesmo tempo** — sessão logada **e** proxy residencial. Deste ambiente só consegui isolar o eixo (1).

---

## 5. Custo estimado por match (Apify Residential Proxy)

**Preço atual:** Apify Residential **$8/GB** (tier Free/Starter) → $7,5 (Scale) → $7 (Business). Cobrança por GB de tráfego. (fonte: apify.com/pricing/proxy)

**Modelo (banda):** cada `user` casado no corpo da resposta ≈ 0,8–1,5 KB de JSON (username, full_name, pk, `profile_pic_url` longa, flags). Com o `query` server-side você pagina **só o subconjunto casado**, então o overhead por request amortiza bem numa página de ~50.

| Cenário | KB efetivos/match | Matches por GB | Custo (a $8/GB) |
|---|---|---|---|
| Otimista | 1,0 | ~1.000.000 | **$0,80 / 100k matches** (~$0,008/1k) |
| Meio (premissa do briefing) | 1,5 | ~666k | **$1,20 / 100k matches** (~$0,012/1k) |
| Conservador (+overhead) | 2,5 | ~400k | **$2,00 / 100k matches** (~$0,02/1k) |

→ **Banda ≈ $1–$2 por 100.000 leads casados.** Desprezível. A tese do "rio" ganha **no eixo banda**.

**[Provável] MAS a banda NÃO é o custo binding.** O que realmente custa/limita:
1. **Pool de contas logadas do IG** (aged/burner). Conta nova toma challenge/ban rápido raspando followers. Conta envelhecida custa ~$1–5+ e **queima**. Esse é o **$/match real** e o spike **não** conseguiu medi-lo.
2. **Apify Compute Units** — runtime do actor. Trivial para chamadas de API (centavos por milhares de requests).
3. **Taxa de ban → custo de reposição de conta** amortizado por lead.

> Resumo de custo: **banda ~$1/100k (irrelevante); a economia real é travada pelo supply de contas logadas e pela taxa de ban — não medido aqui.**

---

## 6. Setup EXATO que falta para uma medição representativa

Para provar o filtro ao vivo e medir $/match de verdade, faltam (em ordem):

1. **1 conta IG logada descartável** (aged, não a da dona/cliente) → extrair `sessionid` + `csrftoken` dos cookies após login manual no navegador. Passar via env, **nunca hardcode**:
   ```
   IG_SESSIONID=<...> IG_CSRFTOKEN=<...> \
     node c9-follower-query-prototype.ts unhass.decoradas manicure 2
   ```
   O protótipo já lê essas envs e entra em "modo AUTENTICADO". Só isso já prova o filtro (esperado: HTTP 200 + só usernames contendo "manicure").
2. **Proxy residencial** (Apify Residential ou IPRoyal/Bright Data) com sticky 5–10 min. No protótipo standalone: plugar via `undici.ProxyAgent`/`HTTP_PROXY`. No Apify Actor: `Actor.createProxyConfiguration({ groups: ['RESIDENTIAL'], countryCode: 'BR' })` e passar o `proxyUrl` ao `fetch`/dispatcher.
3. **Wrapper Apify Actor:** trocar `argv()` por `Actor.getInput()` (`{ username, keyword, maxPages }`), envolver `main()` em `Actor.main()`, e persistir `results` em `Actor.pushData()`. O core (`resolveUserId` + `searchFollowersPage`) fica intacto.
4. **Medição:** rodar contra `unhass.decoradas`/`manicure` com paginação real (5–10 páginas), coletar bytes trafegados pelo proxy (Apify reporta GB por run) e dividir por matches → **$/match empírico**. Rodar em 2–3 contas para estimar a **taxa de challenge/ban** (o número que decide a economia).

**Gate de decisão:** medir a **taxa de ban por conta por N requests** antes de escalar. Se uma conta aguenta milhares de queries antes de challenge, o modelo fecha barato. Se queima em centenas, o custo de conta domina e o $/match sobe 1–2 ordens de grandeza acima da banda.

---

## 7. Restrições respeitadas

- Nenhum segredo exposto. Nenhum token nosso usado. `sessionid` só via env, nunca logado.
- Máx. 2 requests ao IG (spike). Parei no primeiro bloqueio.
- Sem despejo de PII: só o handle público do alvo e nada da lista (que nem retornou).
