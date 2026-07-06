# NotaAS — Varredura da documentação pública (docs.notaas.com.br)
**Data:** 2026-07-06 · **Fonte:** 14 páginas fetchadas via WebFetch (todas extraíveis; nenhuma JS-only) · **Contexto:** NotaAS = MOTOR FISCAL (decisão D6) do SaaS multi-tenant de gestão de cobranças. Volume tenant #1: 500–5.000 NFS-e/mês.

**Base URL:** `https://platform.notaas.com.br/api/v1` · **Versão docs:** API v1 · w0.5.0

---

## A) Matriz de capacidades (operação → endpoint → observações)

| Operação | Endpoint | Observações |
|---|---|---|
| Emitir NFS-e | `POST /emitir` | **Assíncrono**: retorna `202` com `{queued, invoiceId, status:"queued", pollUrl}`. Nunca retorna a nota pronta na hora. [/docs/endpoints, /docs/quickstart] |
| Consultar status | `GET /invoices/{id}/status` | Campos: `status` (queued→processing→issued\|error; issued→cancelled), `chNFSe`, `numeroNfe`, `emittedAt`, `ambiente` ("producao"\|"homologacao"), `pdfUrl`/`xmlUrl` (CDN **sem autenticação** quando `documentsCached=true`), `errorCode/errorMessage/errors`, `cancelledAt`, `cancelXmlUrl`. [/docs/endpoints] |
| XML da nota | `GET /invoices/{id}/xml` | XML de emissão ou de cancelamento. [/docs/endpoints] |
| PDF (DANFSE) | `GET /invoices/{id}/pdf` | Redirect se em CDN; proxy se não. [/docs/endpoints] |
| Cancelar NFS-e | `POST /cancelar` | Body: `invoiceId` + `motivo` (opcional, máx 255 chars). Assíncrono. Nota precisa estar `issued`. **Prazo de cancelamento: não documentado.** [/docs/endpoints] |
| Substituição de NFS-e | — | **Não documentada** (nenhum endpoint de substituição). |
| Emitir em lote | `POST /emitir/batch` | `items[]`, **máx 100 itens/lote**, retorna `202 {batchId, queued, status:"processing"}`. [/docs/batch] |
| Status do lote | `GET /invoices/batch/{batchId}/status` | Estados: `processing`, `completed`, `partial` ("Todos processados, mas alguns com erro"), `failed`. [/docs/batch] |
| Lookup código de serviço | `GET /api/v1/codigos?codigo=170601&ibge=3106200` | Busca por código numérico (`0107`) ou texto (`consultoria`), mín. 2 caracteres. [/docs/codigos] |
| Webhooks CRUD | `POST/GET /webhooks/endpoints`, `PATCH/DELETE /webhooks/endpoints/{id}`, `POST .../{id}/test`, `GET /webhooks/deliveries` | Ver seção C. [/docs/endpoints, /docs/webhooks] |
| Gestão (org) | `/org/*` — ver seção B | Exige Org Token. [/docs/org-api] |
| NF-e/NFC-e | `POST /nfe/emitir`, `GET /nfe/invoices/{id}/status`, `POST /nfe/cancelar`, `GET /nfe/invoices/{id}/danfe`, `GET /nfe/invoices/{id}/xml` | Secundário — ver seção G. [/docs/nfe/endpoints] |

### Autenticação [/docs/authentication]
- Header: **`x-api-key`**. Dois tipos de chave:
  - **Project Key** `ntaas_XXXX…`: escopo **por projeto** (= por CNPJ emissor). Rotas: `/api/v1/emitir, /cancelar, /invoices, /webhooks`.
  - **Org Token** `ntaas_org_…`: administra `/api/v1/org/*` (projetos/keys/settings). Project keys são **rejeitadas** nas rotas org.
- Criação via Dashboard ("Nova Key": seleciona projeto + define rate limit) **ou** via API (`POST /org/projects/{id}/api-keys`). A chave "não será exibida novamente" — exibida uma única vez. **Rotação: não há mecanismo documentado** (fluxo implícito: criar nova + `DELETE` na antiga, revogação imediata).
- Erros: 401 "Header x-api-key ausente ou inválido" · 403 "Chave revogada ou sem permissão" · 429 com header `Retry-After`.

### Payload de emissão NFS-e [/docs/endpoints]
**Obrigatórios:** `tomador.cnpj` OU `tomador.cpf` (14/11 dígitos sem formatação), `tomador.nome`, `servico.descricao`, `valores.total` (BRL), `valores.aliquotaIss` (%).
**Tomador opcionais:** `email`, `telefone`, `endereco{logradouro,numero,complemento,bairro,cidade(IBGE auto-resolvido),uf,cep}`.
**Serviço opcionais:** `codigo` (cTribNac 6 dígitos LC 116, ex. "010700"; **"se omitido, usa o padrão do projeto"**), `codigoServico` (SP, 4–5 díg.), `localPrestacao` (IBGE 7 díg.), `nbs` (9 díg.), `codigoTributacaoMunicipal` (3 díg.; NotaAS resolve cTribMun automaticamente).
**Valores opcionais:** `issRetido` (bool, default false), `totaisTributosAproximados` (% OU R$, nunca misto), `pisCofins{cst, baseCalculo, aliquotaPis, aliquotaCofins, valorPis, valorCofins, tipoRetencao}`, `retencaoIrrf`, `retencaoCp`, `retencaoCsll` (R$).
**Outros:** `competencia` (YYYY-MM, default mês corrente), **`referencia` (identificador externo do seu sistema)** — único gancho para correlação/dedup do lado do SaaS.

---

## B) Modelo multi-empresa e mapeamento tenant → entidade NotaAS

### Modelo [/docs/org-api]
- **Organização** (a conta do dono) → contém **Projetos**. **"Projeto = empresa fiscal": 1 projeto = 1 CNPJ único**, emite NFS-e/NF-e/NFC-e de forma independente, com certificado, numeração, keys e configurações próprias.
- **Tudo criável programaticamente** via Org Token (`ntaas_org_`, rate limit "120 requisições/minuto by default"):
  1. `POST /org/projects` — cadastra a empresa: `name, cnpj, razaoSocial, regimeTributario(1|2|3|3e), codigoMunicipio(IBGE), email, endereco{…}, inscricaoMunicipal, inscricaoEstadual, codigoTributacao, tributacaoIss(1|2|3|4), serieNfse, codigoServicoSp, cnae, serieNfe, serieNfce, cscId, cscToken, cstPisCofins, aliquotaPis, aliquotaCofins`. Resposta 201 `{id, cnpj, active, createdAt}`. Erros: 400 CNPJ inválido, **403 limite do plano**, **409 CNPJ duplicado**. CNPJ é **imutável** (PATCH não altera).
  2. `POST /org/projects/{id}/certificate` — upload **A1 .pfx/.p12 (multipart: file máx 50KB + password)**. Resposta 201 com `subjectCN, validFrom, validUntil, daysUntilExpiration`.
  3. `POST /org/projects/{id}/api-keys` — `{name}` → 201 com `key` (exibida **uma única vez**), `keyPrefix`, `scopes`, `rateLimitPerMinute`.
  4. `POST /org/projects/{id}/logo` — PNG/JPEG/WebP máx 500KB (some no DANFSE); DELETE reseta template p/ "padrao".
- Escopos do Org Token: `projects:read/write`, `api_keys:manage`, `settings:read/write`, `certificates:write`.
- `GET /org/settings` → `planName, creditsUsed, creditsLimit, daysLeft`.

### White-label programático [/docs/org-api]
= **domínio próprio para os documentos (URLs de XML/PDF)**: `PATCH /org/settings` com `storageBaseUrl` (HTTPS only, sem localhost/IPs). Fica `pending_verification` até configurar **CNAME → `backbone.notaas.com.br`**. Ou seja: white-label documentado cobre **storage/links dos documentos**, não um dashboard white-label.

### Numeração (#numeracao) [/docs/org-api]
- `GET /org/projects/{id}/numeracao` → `{nfse:{ultimoNumero,proximoNumero,serie}, nfe:{…}, nfce:{…}}` (ex.: nfse serie "1608").
- `PATCH /org/projects/{id}/numeracao` — body `ultimoNumeroNfse/Nfe/Nfce`. **Guard: números nunca diminuem** (valores abaixo do atual são ignorados via `GREATEST`). Série NFS-e definida no projeto (`serieNfse`). Semântica RPS por município não é detalhada.

### Mapeamento recomendado (tenant do SaaS de cobranças → NotaAS)
| Camada SaaS | Entidade NotaAS | Nota |
|---|---|---|
| Plataforma (dono) | Organização + Org Token | Org Token **só server-side** (Edge Function/backend), nunca no frontend — coerente com Seção 11 do CLAUDE.md |
| Tenant (empresa que cobra) | **1 Projeto (1 CNPJ)** | Onboarding automatizável: create project → upload A1 do tenant → gerar project key → guardar **hash + key cifrada server-side** |
| Cliente-final do tenant | `tomador` no payload | CPF ou CNPJ |
| Cobrança/fatura do SaaS | `referencia` na emissão | Única chave de correlação disponível |

**Ponto crítico:** cada tenant precisa fornecer **certificado A1 (.pfx + senha)** próprio — é pré-requisito de emissão (422 `CERT_MISSING`). O onboarding do SaaS precisa de fluxo de coleta de certificado + monitor de `daysUntilExpiration`.

---

## C) Contrato de webhook [/docs/webhooks, /docs/endpoints]

**Eventos NFS-e:** `nfse.issued` (número + código verificação) · `nfse.error` (detalhes do erro) · `nfse.cancelled` (invoiceId, numeroNfse, cancelledAt) · `nfse.documents_ready` (xmlUrl, pdfUrl, cancelXmlUrl, `documentStatus: "partial"|"complete"` — **pode disparar 2×**: partial=só XML, depois complete) · `batch.completed`.
**Eventos NF-e/NFC-e:** `nfe.issued` ("autorizada pela SEFAZ, cStat 100 ou 150"), `nfe.error`, `nfe.cancelled`, `nfce.issued` (inclui QR code URL), `nfce.error`, `nfce.cancelled`.

**Envelope (verbatim):**
```json
{
  "event": "nfse.issued",
  "deliveryId": "del_xyz789",
  "timestamp": "2026-03-12T19:00:00.000Z",
  "data": { "invoiceId": "inv_abc123", "chNFSe": "4321000001234", "nNFSe": "00001" }
}
```
**Headers:** `Content-Type: application/json` · `X-Notaas-Event` · `X-Notaas-Delivery` (UUID único — **usar para idempotência do consumidor**) · `X-Notaas-Signature` (`sha256=<hash>`, **HMAC-SHA256 do body raw usando o `secret`** configurado; comparar com timing-safe equality).
**Registro:** `POST /webhooks/endpoints` com `url` (HTTPS), `events[]`, `secret` (opcional mas obrigatório na prática p/ segurança). Teste: `POST /webhooks/endpoints/{id}/test`. Histórico: `GET /webhooks/deliveries`.
**Retries:** até **5 tentativas** com backoff exponencial — imediato, 1 min, 5 min, 30 min, 2 h. Falha = resposta não-2xx ou timeout > **10 s**.
**Atenção:** webhooks são gerenciados com **project key** → aparentam ser **por projeto** (1 registro por tenant); não há webhook org-wide documentado.

---

## D) Lote e idempotência [/docs/batch]

- `POST /emitir/batch`: `{"items":[{tomador, servico, valores}, …]}` — **máx 100 itens**. Resposta `202 {"batchId":"bat_xyz456","queued":2,"status":"processing"}`.
- Acompanhamento: polling `GET /invoices/batch/{batchId}/status` (retorna processed/issued/errors) **ou** webhook `batch.completed`. Estados: `processing | completed | partial | failed`.
- **Idempotência: NÃO existe chave de idempotência documentada** (nem header, nem campo). A página de batch nem menciona `referencia`. Duplicate handling: **não endereçado**.
- **Implicação para 500–5.000 notas/mês:** o SaaS precisa de outbox próprio — gravar intenção de emissão com `referencia` única ANTES do POST, nunca reenviar sem consultar status, e reconciliar por `referencia`/`invoiceId`. Retry cego de um `POST /emitir` com timeout de rede = risco real de **nota duplicada** (custo fiscal: exige cancelamento).

---

## E) Lacunas — o que NÃO está documentado (lista explícita)

1. **Sandbox/homologação para NFS-e**: não documentado como ativar. O status retorna `ambiente: "producao"|"homologacao"`, mas nenhuma página NFS-e explica como selecionar. (NF-e tem `NFE_AMBIENTE`/`tp_amb=2`, mas parece config de ambiente, não por-request.)
2. **Preços**: não documentado (apenas `planName/creditsUsed/creditsLimit` em /org/settings e erros `CREDIT_LIMIT`/403 "créditos esgotados").
3. **Rate limits (valores)**: só "120 req/min default" no Org Token; o rate limit da project key é "definido ao criar a key" sem faixas documentadas.
4. **Chave de idempotência**: inexistente (ver D).
5. **Prazo de cancelamento de NFS-e**: não documentado (varia por município na vida real; docs silenciam). NF-e documenta 24h.
6. **Substituição de NFS-e**: nenhum endpoint.
7. **Comportamento em município não coberto**: /docs/cobertura lista sistemas suportados (SNNFSE federal, sistema próprio SP, GINFES/Fortaleza, WebISS ABRASF 2.02, Pronim) e diz "A Notaas resolve o cTribMun automaticamente", mas **não documenta o erro exato para município fora da cobertura** — o mais próximo é 422 "município não configurado" e `E0039` (município não aderente ao SNNFSE). Não há endpoint de consulta de cobertura via API (só "Guia por Município" na doc).
8. **Rotação de API key**: sem endpoint de rotação; só create + revoke (DELETE, desativação imediata).
9. **Rotação/gestão do webhook secret**: não documentada (presumivelmente PATCH do endpoint).
10. **Semântica de RPS por município** (série/lote RPS, conversão RPS→NFS-e): a doc trata numeração de forma genérica (`serieNfse`, `ultimoNumero/proximoNumero`), sem detalhar RPS.
11. **Municípios que exigem credenciais de prefeitura (usuário/senha) em vez de A1**: não mencionado — doc só cobre certificado A1.
12. **Limite de projetos por plano**: existe (403 ao exceder), valor não documentado.
13. **Retenção/expiração das URLs de CDN** (pdfUrl/xmlUrl sem auth): não documentada — atenção LGPD: URLs públicas não autenticadas com dados fiscais.
14. **SLA/tempo típico de emissão** (fila queued→issued): não documentado.

**Nota de método:** WebFetch responde via modelo pequeno sobre o markdown da página; alguns exemplos de e-mail vieram mascarados (`[email protected]`) pelo próprio site (proteção Cloudflare), não são literais.

---

## F) Perguntas abertas para o dono da conta NotaAS

1. **A conta atual é uma Organização com Org Token habilitado** (recurso pode depender de plano)? Quantos projetos o plano permite? Ele hoje emite pelos projetos dele — os tenants do SaaS entrariam como novos projetos na MESMA org ou em org separada?
2. **Preço por nota / pacote de créditos**: quanto custa o degrau de 500–5.000 notas/mês? O que acontece operacionalmente no `CREDIT_LIMIT` (bloqueio imediato? overage?)?
3. **Existe ambiente de sandbox/homologação para NFS-e** para desenvolvermos sem emitir nota real? Como se ativa?
4. **Municípios dos tenants**: o município do tenant #1 está coberto? Que sistema (SNNFSE, SP, GINFES…)? Já emitiu por lá?
5. **Certificado A1 dos tenants**: no fluxo atual dele, quem fornece o certificado? Confirma que **cada CNPJ tenant precisa de A1 próprio** (e não há alternativa via credenciais de prefeitura)?
6. **Cancelamento**: qual prazo prático por município? Já precisou substituir nota (a API não tem substituição — como ele resolve)?
7. **Duplicidade**: já teve caso de nota duplicada por retry? A NotaAS deduplica por `referencia` (não documentado)?
8. **Webhooks**: ele usa? Por projeto? Estabilidade das entregas?
9. **White-label**: interesse em `storageBaseUrl` com domínio do SaaS para os links de PDF/XML enviados aos clientes-finais?
10. **Rate limit da project key**: que valores o dashboard oferece? Suficiente para rajadas de lote (50×100 notas)?

---

## G) NF-e / NFC-e — resumo (5 linhas) [/docs/nfe/*]

1. Suporta **modelo 55 (NF-e, B2B)** e **65 (NFC-e, PDV)** via `POST /nfe/emitir` (assíncrono, mesma mecânica 202→poll/webhook), sob a mesma base URL e `x-api-key`.
2. Ciclo: `queued→processing→issued|error|cancelled|inutilized`; issued devolve `nNf, serie, chaveAcesso(44), nProt, cStat, pdfUrl, xmlUrl`.
3. Cancelamento `POST /nfe/cancelar` (motivo 15–255 chars; **24h NF-e**, variável por UF NFC-e); **CC-e e inutilização não têm endpoint documentado**.
4. NFC-e exige **CSC (cscId+cscToken)** no projeto (senão `cStat=600`); homologação via `NFE_AMBIENTE` (`tp_amb=2`, sem validade fiscal).
5. Erros combinam códigos de API (CERT_*, CREDIT_LIMIT) com **cStat SEFAZ** (100 ok, 206/539 duplicidade, 225 schema, 464/717 NFC-e); webhooks `nfe.*`/`nfce.*` com mesmo HMAC e retries.

---

## H) ADENDO 2026-07-06 — plataforma autenticada (screenshots do dono + navegação logada em platform.notaas.com.br)

> Fonte: capturas de tela de Marcelo (conta Nexvy Tech) + navegação autenticada em /developers/api-reference e /developers/webhooks. RESOLVE a maioria das lacunas da seção E/F.

### H.1 Respostas ao gate G-NOTAAS
1. **Sandbox EXISTE**: "Ambiente de Homologação — notas emitidas não têm valor fiscal", com toggle **"Ativar Produção →"** por organização/projeto, direto na plataforma. ✅
2. **Preço/créditos = cotas por plano**: Free = 50 notas · **SaaS Pro = 2.000 notas/mês** (org Nexvy Tech upgradada p/ SaaS Pro em 2026-07-06). Gestão de cotas POR CLIENTE dentro da plataforma. ⚠️ **2.000 < teto D5 (5.000 faturas/mês do case #1)** → plano/cota é GATE antes do go-live full do case #1. Preço em R$ dos planos: ainda não capturado.
3. **Cancelamento**: `POST /api/v1/cancelar` `{invoiceId, motivo? ≤255}`, nota precisa estar `issued`, assíncrono (202). Prazo legal por município: segue aberto.
4. **Substituição**: segue inexistente na API (cancelar + reemitir).
5. **Limite de projetos**: por plano ("Novo Projeto" com selo Upgrade; org atual 1/1). **Multi-CNPJ é serviço CONTRATADO** (docs auxiliares: /docs/org-api).
6. **Cobertura**: emissão via **SNNFSE nacional** + engines municipais (ex.: `dsf`, `centi` — engines sem PDF entregam `pdfUrl:null` + `documentStatus:"complete"`). Cobertura do município específico do case #1: segue a confirmar.

### H.2 Endpoints canônicos confirmados (API reference autenticada)
| Operação | Endpoint | Fatos |
|---|---|---|
| Emitir | `POST /api/v1/emitir` | 202 + `invoiceId`. Payload: `tomador` (**cpf XOR cnpj obrigatório**, `nome` req, email/telefone/endereco opc — `cidade` resolve p/ IBGE automático), `servico` (`descricao` req; `codigo` cTribNac LC116 6 díg com **default do projeto** — omitido sem default → 422; `codigoServico` SP 4-5 díg; `localPrestacao` IBGE 7 díg; `nbs` 9 díg), `valores` (`total` req, `aliquotaIss` req, `issRetido` default false, `totaisTributosAproximados` Lei 12.741 — percentual XOR valor, 400 se misturar), `competencia` YYYY-MM (default mês atual), **`referencia` = ID externo de rastreabilidade** (nossa chave de outbox/dedup vive aqui) |
| Lote | `POST /api/v1/emitir/batch` | `items[]` ≤100 (mesmo formato do /emitir), retorna `batchId` |
| Status | `GET /api/v1/invoices/:id/status` e `/api/v1/invoices/batch/:batchId/status` | `status: queued\|processing\|issued\|error\|cancelled` · `chNFSe` · `documentsCached` · `xmlUrl`/`pdfUrl` (CDN R2, **públicos sem auth, imutáveis**) · `errorCode`/`errorMessage` (SEFAZ/prefeitura) |
| Cancelar | `POST /api/v1/cancelar` | ver H.1 item 3 |
| Webhooks | `POST/GET /api/v1/webhooks/endpoints` · `GET /api/v1/webhooks/deliveries?limit=20` | `{url HTTPS, events[], secret?}` → HMAC-SHA256 `X-Notaas-Signature`; header `X-Notaas-Event` identifica evento; **5 retentativas com backoff exponencial** (status ≥400); histórico de entregas via API |
| Docs | rotas `/xml` e `/pdf` | 302 redirect p/ CDN público |

- HTTP: 202/200/302/401/**422** (campo inválido)/**429 rate limit** (valor numérico não documentado)/500.
- `nfse.documents_ready` até 2× (partial→complete, retry PDF até 10 min) — confirma seção C.
- Org Token (`ntaas_org_`): escopos exibidos no modal = Projetos leitura+escrita, API Keys (criar/revogar project keys), Settings leitura+escrita (white-label e storage URL), **Certificados (upload A1)**, Invoices (leitura). "Todos os scopes concedidos automaticamente; granularidade futura."
- Eventos NF-e/NFC-e também disponíveis nos webhooks (`nfe.*`, `nfce.*`).

### H.3 Ainda aberto (residual)
Preço em R$ por plano/nota · prazo prático de cancelamento por município · cobertura do município do case #1 · valor numérico do rate limit · dedup por `referencia` no lado NotaAS (não documentado — tratar como inexistente).
