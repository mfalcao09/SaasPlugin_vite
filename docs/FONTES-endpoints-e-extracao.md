# Fontes — endpoints e estratégia de extração

**Data:** 2026-07-23 · **PRD:** `PRD-DIARIOMONITOR-TJMS-v2-2026-07-22.md` §5
**Método:** 3 pesquisas dirigidas + verificação ao vivo de cada endpoint citado.
Nada aqui é "a documentação diz" — o que está marcado ✅ foi executado e teve a resposta conferida.

---

## 1. Mapa mestre

| # | Fonte | `parser_key` | Modo | Precisa de IA? | Viabilidade | Estado |
|---|---|---|---|---|---|---|
| 1 | **CNJ** — atos normativos | `cnj-atos` | `api` REST/JSON | **não** | **Alta** | ✅ verificado |
| 2 | **DOU** — Imprensa Nacional | `dou-inlabs` | `xml` via INLABS | **não** | **Alta** | ⏳ falta conta |
| 3 | **DJ/MS** — TJMS | `djms-esaj` | `scrape` GET determinístico | **sim** (PDF) | **Alta** | ✅ verificado |
| 4 | **DO/MS** — executivo MS | `doms-pdf` | `scrape` índice + PDF | **sim** (PDF) | **Alta** | ✅ em produção |
| 5 | **STJ** — BDJur | `stj-atos` | DSpace atrás de Cloudflare | sim | **Baixa** | 🔴 bloqueado |
| 6 | **STF** — atos normativos | `stf-atos` | ASP legado, lista curada | sim | **Baixa** | 🔴 incompleto |
| 7 | LexML | — | SRU / OAI-PMH | — | **Baixa** | 🔴 challenge |

> **Leitura:** 4 das 7 fontes são viáveis hoje e cobrem o essencial do escopo — o Tribunal
> (DJ/MS), o estado (DO/MS), a União (DOU) e o órgão de cúpula administrativa (CNJ).
> STF e STJ são complemento, não núcleo.

---

## 2. CNJ — `atos.cnj.jus.br` ✅ **a melhor fonte do sistema**

```
GET https://atos.cnj.jus.br/api/atos
    ?dat_publicacao_ato=AAAA-MM-DD    filtro por data (sincronização incremental)
    &ano=AAAA                         filtro por ano
    &tipoAto=<int>                    7=Resolução 8=Instrução Normativa 9=Portaria 20=Provimento
    &sortBy=seq_ato|dat_publicacao_ato|num_ato   &order=asc|desc
    &perPage=100                      máximo
```

Swagger em `atos.cnj.jus.br/docs/api-docs.json` · Rate limit **60 req/min**
(headers `x-ratelimit-*`) · CORS `*` · `robots.txt` liberado.

### Campos retornados (verificados ao vivo)

| Campo | Exemplo | Uso no DiárioMonitor |
|---|---|---|
| `id` | `1313` | chave estável da fonte |
| `tipo` | `Portaria` | → `atos.tipo` **sem IA** |
| `numero` / `data_publicacao` | `321` / `2026-07-16` | ISO nativo |
| **`situacao`** | `Vigente` · `Alterado` · `Revogado` · `Exaurido` | → **`normas.situacao`** direto |
| `ementa` | HTML | → `atos.ementa` |
| **`url_txt_compilado`** | HTML do texto **consolidado** | → **`norma_versoes.texto_compilado`** |
| **`url_legislacao`** | links `/atos/detalhar/{id}` | → **`norma_relacoes`** já mapeadas |
| `url_ato` | nome do PDF original | evidência |
| `fonte` | `DJe/CNJ n. 169/2026, de 20/07/2026, p. 5` | rastreabilidade |
| `orgao_origem_ato` | `{seq:7, dsc:'Presidência'}` | → `orgao_emissor` |

### Por que é estratégico

O CNJ **já mantém o acervo normativo modelado** — vigência, relações e texto consolidado.
Duas consequências:

1. **Espelhar, não derivar.** Ingestão com `origem_extracao='api'`, `confianca=1.0`,
   sem fila de revisão e sem custo de token.
2. **Gabarito automático do MAN-01.** Centenas de pares `ato → altera/revoga → ato`
   corretos e datados. Serve para treinar e **medir** o motor de relação normativa
   (C2.1/C2.2) sem consumir tempo humano de validação — que fica reservado ao DO/MS e
   TJMS, onde não há alternativa.

**Exemplo real:** Portaria 321/2026 · `situacao: Vigente` · ementa *"Altera a Portaria
Presidência nº 34/2019…"* · `url_legislacao` → ato `2833`.

Distribuição verificada em 2020 (493 atos): `Vigente 47` · `Revogado 35` · `Alterado 17` ·
`Exaurido 1` (amostra de 100).

---

## 3. DOU — INLABS ✅ fluxo completo mapeado

```
POST https://inlabs.in.gov.br/logar.php
     body:   email=<EMAIL>&password=<SENHA>       (form-urlencoded)
     header: origem: 736372697074                 (hex de "script" — literal, obrigatório)
  → Set-Cookie: inlabs_session_cookie

GET  https://inlabs.in.gov.br/index.php?p=AAAA-MM-DD
  → HTML com <a title="Baixar Arquivo"> listando os ZIPs do dia

GET  https://inlabs.in.gov.br/index.php?p=AAAA-MM-DD&dl=AAAA-MM-DD-DO1.zip
     headers: Cookie: inlabs_session_cookie=<TOKEN> · origem: 736372697074
  → ZIP com UM XML POR MATÉRIA
```

Seções `DO1` `DO2` `DO3` + extras `DO1E` `DO2E` `DO3E`. Gratuito desde 2020, cadastro
autosserviço. Referências: `gestaogovbr/Ro-dou` (GPL-3.0 — **ler, não vendorizar**) e
`Imprensa-Nacional/inlabs` (scripts oficiais).

### Estrutura do XML

```xml
<article id="…" idMateria="…" pubName="DO1" artType="Portaria"
         pubDate="16/07/2026" artCategory="Ministério…/Órgão…"
         numberPage="25" editionNumber="86" pdfPage="https://…">
  <body>
    <Identifica><![CDATA[PORTARIA Nº 321, DE 15 DE JULHO DE 2026]]></Identifica>
    <Ementa/><Titulo/><SubTitulo/>
    <Texto><![CDATA[<p>…corpo integral…</p><p class="assina">…</p>]]></Texto>
  </body>
</article>
```

**`artType` já traz o tipo do ato** e `artCategory` a hierarquia do órgão — o DOU **não
precisa de IA para classificar**. Entra com `origem_extracao='xml'`, `confianca=1.0`.

⚠️ **A validar com XML real (card C0.6):** não foi vista amostra com `Ementa` preenchida
nem com `artType` = Resolução/Decreto. Confirmar antes de fixar o mapeamento.

⚠️ O site público `in.gov.br` passou a usar **Cloudflare anti-bot**, quebrando scrapers de
terceiros — mais uma razão para o INLABS oficial.

---

## 4. DJ/MS — TJMS ✅ verificado

Ver a ERRATA em `DESCOBERTA-C0.8-esaj-tjms.md`.

```
GET https://esaj.tjms.jus.br/cdje/getListaDeCadernos.do?dtDiario=DD/MM/AAAA
  → [{cdVolume:11, nuDiario:5912, cdCaderno:1, nmCaderno:'Caderno 1 - Administrativo'}, …]

GET https://esaj.tjms.jus.br/cdje/downloadCaderno.do?dtDiario=DD/MM/AAAA&cdCaderno=1
  → PDF direto (200, %PDF)
```

Provado em 4 datas (edições 5912→5909, 318–399 KB). **Sem CAPTCHA, sem sessão** — o
reCAPTCHA protege a *consulta avançada*, que não usamos. Escopo: **só `cdCaderno=1`
(Administrativo)** — o que também demonstra que o sistema não toca dado processual.

---

## 5. DO/MS ✅ em produção — campos novos a incorporar

O índice em `https://www.diariooficial.ms.gov.br/` (Next.js) devolve **registros
estruturados** no payload RSC, não apenas links:

```json
{ "id": 49697, "numero": 12229, "dataPublicacao": "22/07/2026 07:30:00",
  "descricao": "Diário Oficial Eletrônico n. 12.229",
  "dataInclusao": "21/07/2026 08:29:58",
  "suspenso": false,
  "caminhoArquivo": "https://assets.imprensaoficial.ms.gov.br/…/DO12229_22_07_2026.pdf" }
```

Suplementos trazem `diarioId` (edição-mãe) e `numeroSuplemento`.

| Campo | Por que entra no schema |
|---|---|
| **`suspenso`** | 🔴 **crítico** — edição suspensa não pode gerar boletim nem ato vigente |
| **`diarioId`** | vínculo real suplemento→edição, hoje inferido do nome do arquivo |
| `id` | chave estável da fonte |
| `dataInclusao` | ≠ `dataPublicacao`; permite detectar republicação |
| `descricao` | rótulo do suplemento (ex.: "SAD - Diárias") |

---

## 6. Fontes bloqueadas

| Fonte | Obstáculo | Caminho |
|---|---|---|
| **STJ** (BDJur) | DSpace 7 **100% atrás de Cloudflare Managed Challenge** — REST e OAI-PMH inacessíveis a cliente HTTP | pedir acesso institucional; **não** contornar challenge |
| **STF** | Sem API. Subsistema ASP (`verTexto.asp?servico=processoResolucao`) com lista curada e **desatualizada — último item de 2020** | baixa prioridade; avaliar `manualdeatosoficiais.pdf` |
| **LexML** | SRU sempre devolve challenge anti-bot do Senado; path OAI-PMH não localizado | reavaliar — é rede federada, depende de cada tribunal manter provedor |
| Normas.leg.br | Escopo é legislação federal (Planalto/Congresso) | fora de escopo |

**Regra:** nenhuma será acessada por contorno de proteção anti-bot. Bloqueio técnico vira
pedido de acesso institucional, não gambiarra.

---

## 7. Onde a IA entra (e onde não entra)

```
CNJ   → api  → 0% IA   (tipo, situação, relações e texto consolidado vêm prontos)
DOU   → xml  → 0% IA   (artType + artCategory + Identifica vêm prontos)
DJ/MS → PDF  → IA      (extração de atos do Caderno 1)
DO/MS → PDF  → IA      (extração de atos)
```

Isso concretiza a hierarquia §5.4 do PRD — **API > XML > scrape determinístico > PDF+IA**.
Metade das fontes viáveis dispensa IA por completo: reduz custo, latência e superfície de
alucinação, e concentra o gabarito humano onde é insubstituível.

---

## 8. Reuso open source

| Projeto | Licença | Uso |
|---|---|---|
| `gestaogovbr/Ro-dou` | GPL-3.0 | referência do fluxo INLABS — **ler, não vendorizar** |
| `okfn-brasil/querido-diario` | MIT | arquitetura de spider; cobre municípios de MS, **não** estadual/tribunais |
| `Imprensa-Nacional/inlabs` | oficial | scripts de exemplo (~60 linhas) |
| `courtsbr/dje` | arquivado 2019 | motivou o teste do GET no TJMS |

**Não existe** projeto brasileiro maduro para "PDF de diário → atos normativos
estruturados". Esse componente é nosso.

---

## 9. Pendências

1. **Conta INLABS** (HITL-2) — destrava C0.6/C0.7
2. Validar XML real do DOU: `Ementa` preenchida? `artType` = Resolução/Decreto?
3. Incorporar `suspenso` / `diarioId` / `id` ao schema (migration + parser DO/MS)
4. Confirmar a tabela completa de `tipoAto` do CNJ (o formulário tinha checkboxes truncados)
5. STF/STJ: decidir se entram no MVP ou ficam para fase posterior
