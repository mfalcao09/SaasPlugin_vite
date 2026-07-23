# Descoberta C0.8 — Diário da Justiça do TJMS (e-SAJ)

**Card:** C0.8 · **Gate:** revisão · **Data:** 2026-07-23
**PRD:** `_indice-planos/PRD-DIARIOMONITOR-TJMS-v2-2026-07-22.md` §5, §13.2

---

## Resultado em uma linha

> **A ingestão automatizada do DJ/MS por scraping é INVIÁVEL: o download é
> protegido por CAPTCHA.** O caminho viável é acesso oficial concedido pelo
> próprio TJMS — que é o cliente do projeto.

---

## 1. O que foi mapeado

| Item | Valor |
|---|---|
| Portal de consulta | `https://esaj.tjms.jus.br/cdje/index.do` |
| Tecnologia | e-SAJ clássico (JSP, form POST com `jsessionid`) |
| Endpoint de download | `POST /cdje/downloadCaderno.do` |
| Endpoint de busca | `POST /cdje/consultaAvancada.do` |
| Controle de acesso | `POST /cdje/captchaControleAcesso.do` |

> Nota: o portal em `esaj.tjms.jus.br/esaj/` foi modernizado para Next.js, mas
> o módulo do Diário (`/cdje/`) permanece no e-SAJ clássico em JSP.

### Parâmetros do formulário

`dtDiario` · `dtDiarioCad` · `nuDiario` · `nuDiarioCadUnificado` · `cadernos` ·
`cadernosCad` · `secoes` · `pagina` · `download` ·
`dadosConsulta.cdCaderno` · `dadosConsulta.dtInicio` · `dadosConsulta.dtFim` ·
`dadosConsulta.pesquisaLivre` · **`recaptcha_response_token`**

### Cadernos disponíveis

| `cdCaderno` | Caderno | Relevância para o DiárioMonitor |
|---|---|---|
| `-1` | Caderno unificado | — |
| **`1`** | **Administrativo** | 🎯 **onde ficam os atos normativos do Tribunal** |
| `2` | Judicial — 2ª Instância | fora de escopo (§2.3) |
| `3` | Judicial — 1ª Instância | fora de escopo (§2.3) |
| `4` | Editais | eventual |

**Consequência de escopo:** o produto precisa apenas do **Caderno 1**. Isso
reduz volume, custo de IA e superfície de acesso a negociar — e reforça que não
pedimos dados processuais, apenas atos normativos administrativos.

---

## 2. O bloqueio

O formulário carrega `recaptcha_response_token` e existe o endpoint
`captchaControleAcesso.do`. O acesso ao download é mediado por CAPTCHA.

**Decisão registrada:** *não contornamos CAPTCHA.* Não é limitação técnica — é
regra. Contornar controle de acesso de um tribunal seria indefensável
justamente diante do cliente que queremos atender, e comprometeria a
conformidade que o produto vende (§10).

### Não existe `robots.txt`

`https://esaj.tjms.jus.br/robots.txt` devolve o *app shell* do portal Next.js
(catch-all de SPA), não um arquivo de regras. **Ausência de `robots.txt` não é
permissão irrestrita** — a trava nº 1 do PRD continua valendo integralmente: o
loop de desenvolvimento nunca toca o portal.

---

## 3. Caminhos possíveis (decisão de Marcelo — HITL)

| # | Caminho | Viabilidade | Observação |
|---|---|---|---|
| **A** | **Acesso oficial concedido pelo TJMS** (credencial de serviço, IP liberado, ou entrega direta do Caderno 1) | ✅ **Recomendado** | O cliente controla a fonte. Vira cláusula de contrato, não gambiarra |
| **B** | Dump/API interna do sistema de publicação do Tribunal | ✅ Alta | Melhor qualidade que PDF; conversa direta com a AGDM |
| **C** | Ingestão manual assistida (servidor da AGDM baixa e sobe no sistema) | 🟡 Média | Funciona no piloto; não escala, mas destrava a demonstração |
| **D** | Scraping com resolução de CAPTCHA | ❌ **Vetado** | Regra, não limitação |

**Recomendação:** A ou B, negociados junto com o contrato. Enquanto não houver
definição, o **C** destrava a demonstração sem violar nada.

---

## 4. Impacto no plano

| Item do PRD | Antes | Depois desta descoberta |
|---|---|---|
| §5, linha DJ/MS, modo `scrape` | Média confiança | **Bloqueado** — depende de acesso oficial |
| Card **C1.7** (ingestão TJMS) | `auto` | **HITL** — não roda sem o caminho A/B/C definido |
| §13.2 (pendência TJMS) | "capturar padrão de URL" | ✅ **Resolvido** — padrão mapeado; o obstáculo é acesso, não URL |
| Escopo de captura | Diário inteiro | **Só Caderno 1 (Administrativo)** |

**O que NÃO muda:** F0 e F1 seguem normalmente com DO/MS (funcionando, 10
fixtures) e DOU/INLABS. O TJMS entra quando o acesso estiver resolvido.

---

## 5. Evidência

Coletada em 2026-07-23 com `User-Agent` identificado
(`DiarioMonitor/0.1 (+contato: tecnologia@nexvy.tech)`), sem autenticação e sem
qualquer tentativa de contornar controle de acesso:

- `GET /cdje/index.do` → HTTP 200; form `consultaAvancadaForm` (method POST)
- Campos e cadernos extraídos do HTML público da página de consulta
- `GET /robots.txt` → HTTP 200 servindo HTML do portal, não regras
