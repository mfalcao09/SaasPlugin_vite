# Descoberta C0.8 — Diário da Justiça do TJMS (e-SAJ)

**Card:** C0.8 · **Gate:** revisão · **Data:** 2026-07-23
**PRD:** `_indice-planos/PRD-DIARIOMONITOR-TJMS-v2-2026-07-22.md` §5, §13.2

> ## ⚠️ ERRATA — v2, 2026-07-23
>
> **A primeira versão deste documento concluiu que o DJ/MS era inviável por CAPTCHA. ESTÁ ERRADO.**
>
> O erro: li o formulário de `/cdje/index.do`, encontrei `recaptcha_response_token` e
> concluí que a fonte inteira estava bloqueada — **sem testar o endpoint de download**.
> Inferência, não fato.
>
> **A verdade:** o CAPTCHA protege a *consulta avançada* (busca por palavra-chave).
> O *download do caderno por data* é **GET aberto, sem CAPTCHA, sem sessão**.
>
> **A ingestão automatizada do DJ/MS é VIÁVEL e já foi provada.**

---

## 1. Resultado

> **Duas chamadas GET resolvem a fonte inteira. Sem autenticação, sem CAPTCHA, sem sessão.**

### 1.1 Descobrir as edições e cadernos de uma data

```
GET https://esaj.tjms.jus.br/cdje/getListaDeCadernos.do?dtDiario=DD/MM/AAAA
```

Resposta (JS object literal, quase-JSON — exige normalização de chaves):

```js
[{cdVolume: 11, nuDiario: 5912, cdCaderno: 1, nmCaderno: 'Caderno 1 - Administrativo'},
 {cdVolume: 11, nuDiario: 5912, cdCaderno: 2, nmCaderno: 'Caderno 2 - Judicial - 2ª Instância'},
 {cdVolume: 11, nuDiario: 5912, cdCaderno: 3, nmCaderno: 'Caderno 3 - Judicial - 1ª Instância'},
 {cdVolume: 11, nuDiario: 5912, cdCaderno: 4, nmCaderno: 'Caderno 4 - Editais'}]
```

Entrega `nuDiario` (número da edição) sem precisar derivá-lo da data — mesmo problema que o
DO/MS tem, resolvido aqui por endpoint próprio.

### 1.2 Baixar o caderno

```
GET https://esaj.tjms.jus.br/cdje/downloadCaderno.do?dtDiario=DD/MM/AAAA&cdCaderno=1
```

Retorna o PDF direto: `HTTP 200`, `application/octet-stream`, assinatura `%PDF` (`25504446`).

### 1.3 Prova (coletada em 2026-07-23)

| Data | HTTP | Bytes | Magic | Edição |
|---|---|---|---|---|
| 22/07/2026 | 200 | 326.517 | `%PDF` | 5912 |
| 21/07/2026 | 200 | 399.385 | `%PDF` | 5911 |
| 20/07/2026 | 200 | 318.649 | `%PDF` | 5910 |
| 17/07/2026 | 200 | 367.408 | `%PDF` | 5909 |

Primeira página do Caderno 1 de 22/07/2026:

```
Caderno 1 · ADMINISTRATIVO
Ano XXVI • Edição 5912 • Campo Grande, quarta-feira, 22 de julho de 2026
Poder Judiciário de Mato Grosso do Sul — Tribunal de Justiça
```

Numeração sequencial por dia útil (5909 → 5912), consistente com o `nuDiario` do endpoint 1.1.

---

## 2. Escopo: só o Caderno 1

| `cdCaderno` | Caderno | Relevância |
|---|---|---|
| `-1` | Unificado | — |
| **`1`** | **Administrativo** | 🎯 **atos normativos do Tribunal** |
| `2` | Judicial — 2ª Instância | fora de escopo (§2.3) |
| `3` | Judicial — 1ª Instância | fora de escopo (§2.3) |
| `4` | Editais | eventual |

Ingerir **apenas o Caderno 1** reduz volume, custo de IA e — o que mais importa — deixa
explícito que o sistema **não toca dado processual**, só ato normativo administrativo.
Isso é argumento de conformidade na conversa com o Tribunal.

---

## 3. O que continua valendo do documento original

- **Não contornamos CAPTCHA.** A consulta avançada segue protegida e **não será usada**.
  A ingestão usa apenas os dois GETs públicos acima.
- **Não existe `robots.txt`** — `esaj.tjms.jus.br/robots.txt` devolve o *app shell* do portal
  Next.js (catch-all de SPA), não regras. **Ausência de diretiva não é permissão irrestrita**:
  rate limit e `User-Agent` identificado continuam obrigatórios (trava nº 1).
- O módulo `/cdje/` é e-SAJ clássico (JSP); só o portal em `/esaj/` foi modernizado.

---

## 4. Impacto no plano

| Item | Antes (errata) | Agora |
|---|---|---|
| Fonte DJ/MS | ❌ bloqueada | ✅ **viável, provada** |
| Card **C1.7** | HITL (dependia de negociação) | 🤖 **`auto`** — sem bloqueio humano |
| Acesso oficial do TJMS | pré-requisito | **desejável, não bloqueante** — ainda melhora qualidade e formaliza a relação |
| `parser_key` | — | `djms-esaj` (já cadastrado na migration) |

**Ordem de implementação sugerida:** o DJ/MS entra logo após o DO/MS no mesmo padrão —
descobrir edições → baixar → hash → fixture. O parser é quase idêntico; muda só a origem
do número da edição (endpoint próprio em vez de índice HTML).

---

## 5. Lição registrada

**Ler o formulário não é testar o endpoint.** A presença de um controle de acesso em *uma*
rota não implica que *toda* a superfície esteja protegida. O custo do erro aqui teria sido
alto: a fonte mais importante para o cliente ficaria fora do produto, e a conversa comercial
começaria pedindo um acesso que nunca foi necessário.

Contribuiu para o achado o repositório `courtsbr/dje` (R, arquivado desde 2019), que usava
`downloadCaderno.do` via **GET com querystring** — o que motivou o teste direto. O dado dele
de "TJMS sem captcha" estava desatualizado quanto à consulta avançada, mas certo quanto ao
download.

---

## 6. Evidência

Coletada em 2026-07-23 com `User-Agent` identificado
(`DiarioMonitor/0.1 (+contato: tecnologia@nexvy.tech)`), sem autenticação, sem contornar
qualquer controle de acesso, com pausa entre requisições:

- `GET /cdje/getListaDeCadernos.do?dtDiario=…` → 200, lista de 4 cadernos + `nuDiario`
- `GET /cdje/downloadCaderno.do?dtDiario=…&cdCaderno=1` → 200, PDF válido (4 datas)
- `GET /cdje/index.do` → 200, form `consultaAvancadaForm` com `recaptcha_response_token`
  (rota **não usada** pela ingestão)
