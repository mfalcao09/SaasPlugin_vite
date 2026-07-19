# Handoff Técnico — Porte da LP "Clientes de Volta" (Lovable → repositório)

> **Data:** 2026-07-17 · **De:** sessão de oferta/copy (`local_01d1912ac1f7`) · **Para:** sessão CONTROLADORA GO-LIVE
> **Objetivo:** dar à controladora TUDO que é necessário pra portar a LP do Lovable e implementar no nosso repositório — inventário técnico, placeholders, quebrados, ajustes, direcionamentos. **READ-ONLY até agora: nada foi portado.**
> **Par:** `HANDOFF-PORTE-LP-CLIENTES-DE-VOLTA-2026-07-17.html`

---

## 0. Identidade do projeto Lovable (via MCP Lovable, verificado)

| Campo | Valor |
|---|---|
| Projeto Lovable | `volta-cliente-magica` (display "Clientes de Volta") |
| **project_id** | `304b956f-a6d4-4fe1-8b13-c57606d85e04` |
| workspace | `fP5vn9r9t2PfoOn707P7` ("marcelo's Lovable", owner) |
| editor_url | https://lovable.dev/projects/304b956f-a6d4-4fe1-8b13-c57606d85e04 |
| preview_url | https://id-preview--304b956f-a6d4-4fe1-8b13-c57606d85e04.lovable.app |
| URL pública | https://volta-cliente-magica.lovable.app |
| repo git | https://github.com/mfalcao09/clientes-de-volta |
| último commit | `f1d6fc5` (2026-07-16 15:39) "Ajustou estrutura e honestidade" · status `completed`, publicado, 67 edições |

---

## 1. Tech stack + a decisão-chave do porte

**A LP é TanStack Start** (`@tanstack/react-start` 1.168 + `react-router` 1.170 + Nitro), **React 19**, **Tailwind v4**, **Vite 8** (via `@lovable.dev/vite-tanstack-config`).
**O app de destino** (`apps/NexvyBeauty`) é **Vite + React-Router** (React 18, Tailwind v3). → **framework mismatch.**

**Mas o porte é simples**, porque a LP **não depende do framework**:
- Todo o conteúdo vive em **1 arquivo**: `src/routes/index.tsx` (JSX cru + `useEffect`/`useRef`/`useState` + `React.cloneElement` — **tudo compatível com React 18**, nenhuma API nova de React 19).
- Todo o **design** vive em `src/lp.css` (classes próprias: `.hero`, `.wrap`, `.plano`, `.calc-card`, `.equipia`, etc.). **NÃO usa** shadcn/radix nem classes Tailwind. Os componentes `src/components/ui/*` (radix/shadcn) e `styles.css` (base Tailwind) **NÃO são usados pela LP**.
- Sem loaders, sem server functions, sem SSR-dependente: são animações client-side (IntersectionObserver, carrossel, chat-demo).
- **Backend/DB/secrets/conexões: NENHUM** (`list_connections` = vazio, `get_project_knowledge` = vazio). LP 100% estática.

**Estratégia de porte recomendada:** extrair `index.tsx` como um **componente de página** no app de destino, trazer `lp.css`, dropar o wrapper `createFileRoute`, e plugar como rota do React-Router. Não migra backend (não há).

---

## 2. Inventário de arquivos

**PORTAR:**
| Arquivo (origem) | Vira | Nota |
|---|---|---|
| `src/routes/index.tsx` (~1.606 linhas) | página React (ex.: `LandingPageClientesDeVolta.tsx`) | remover `import { createFileRoute }` + `export const Route = createFileRoute("/")(...)`; exportar o componente `LandingPage`. Sub-componentes (Nav, Hero, Calculadora, RaioXDaCarteira, EyeSection, Nichos, OQueResolvemos, Modulos, Equipia, ComoFunciona, Planos, ChamadaPosPlanos, Cofounder, Faq, Footer) ficam no mesmo arquivo ou quebrados em pasta. |
| `src/lp.css` | css da LP | importar no componente. É o design inteiro. Portar **verbatim**. |
| **Fontes** (ver §3) | `<head>` do destino | Fraunces + Inter (Google Fonts). |
| **Meta/OG** (ver §3) | head/route meta | trocar a OG image (hoje = screenshot do Lovable). |

**PROVÁVEL DESCARTE (verificar):**
- `src/assets/{hero-salon,lash-work,whatsapp-hands}.jpg` — **o `index.tsx` NÃO os importa** (usa SVG inline + CSS). Confirmar se `lp.css` os referencia via `url(...)`; se não, descartar.
- `src/components/ui/*` (49 componentes shadcn/radix) — **não usados pela LP**. Descartar (o destino já tem os seus).
- `src/styles.css` — base Tailwind/shadcn; a LP usa `lp.css`. Só portar se algum reset for necessário (checar).

**DESCARTAR (scaffolding TanStack — não vai pro destino):**
`src/routes/__root.tsx`, `src/router.tsx`, `src/routeTree.gen.ts`, `src/server.ts`, `src/start.ts`, `src/routes/README.md`, `src/lib/{error-capture,error-page,lovable-error-reporting}.ts` (reporting específico do Lovable), `src/hooks/use-mobile.tsx` (usado?), `vite.config.ts` (do Lovable).

---

## 3. Fontes + Meta/OG (do `__root.tsx`)

**Fontes (Google Fonts) — a LP depende delas:**
```
https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=Inter:wght@400;500;600;700&display=swap
```
Fraunces = a serif (classe `.serif`); Inter = corpo. Adicionar preconnect + o stylesheet no head do destino.

**Meta/OG (title/description em pt-BR):**
- title: "NexvyBeauty — Recupere clientes que sumiram pelo seu WhatsApp"
- description: "Radar de IA encontra as clientes que sumiram da sua carteira, escreve a mensagem e traz de volta pelo seu WhatsApp. Primeiro R$ recuperável em 15 minutos."
- **⚠️ og:image / twitter:image = URL de screenshot do Lovable** (`pub-bb2e103a…r2.dev/…lovable.app-….png`) → **trocar por uma OG image própria hospedada** no nosso domínio.
- `<html lang="en">` no RootShell, mas conteúdo é **pt-BR** → setar `lang="pt-BR"` no destino (SEO/a11y).

---

## 4. Mapa COMPLETO de placeholders / quebrados / a-corrigir

> O Lovable marcou os pontos de fiação com `data-todo="…"` e a const `WHATSAPP_URL = "#whatsapp"` (linha 18). Nada está plugado.

| # | O que | Onde (no `index.tsx`) | Estado | Ação |
|---|---|---|---|---|
| P1 | **Checkout dos 3 planos** | Planos, botões "Assinar agora" | `href="#"` · `data-todo="checkout-essencial/premium/ultra"` | plugar `checkout_url` real de cada plano (fonte: `public_plans`) |
| P2 | **WhatsApp comercial** | const `WHATSAPP_URL="#whatsapp"`; usado no CTA do Hero, no CTA do Raio-X ("Quero ver o meu número") e no rodapé | `#whatsapp` · `data-todo="whatsapp"` (×3) | apontar pro número/wa.me comercial real |
| P3 | **Login "Entrar"** | Nav | `href="#"` | URL de login do app |
| P4 | **Footer legais/redes** | Footer | `data-todo="termos"`, `data-todo="privacidade-lgpd"`, `data-todo="instagram"` — `href="#"` | Termos, Política LGPD, Instagram reais |
| P5 | **PREÇO hardcoded ×2 lugares** | Planos (275/427/693 + de-para 450/720/1.190) **e** Calculadora (`const mult = …/427`, linha ~1155) | strings/número fixos | **decisão** (§6): ler de `public_plans` (`usePublicPlans` já existe no app!) ou aceitar hardcode de LP standalone. Se hardcodar, mudar preço exige atualizar **os 2 lugares**. |
| P6 | **Modal do Cofounder — captura de e-mail é NO-OP** | Cofounder, passo "email" → botão "Enviar" chama `closeModal()` | não envia/salva nada | wire real (salvar lead / enviar) ou remover o passo |
| P7 | **"50 vagas" do Cofounder** | eyebrow "Programa Cofounder - 50 vagas" + badge `cc-scarce` "50 vagas" | ×2 | **decisão** (§6): limite real de agenda 1-a-1 (manter) ou marketing (remover — nossa regra = escassez só honesta) |
| P8 | **OG image** | `__root.tsx` head | screenshot Lovable | trocar por OG própria (§3) |
| P9 | **Cookie A/B do Hero** | `nx_lp_var` (rotação eyebrow/headline) | grava cookie, sem consumidor | opcional: ligar a analytics real, ou manter só como variante |

**Já CORRIGIDO nas iterações (não são mais pendência):** qualifier invertido (removido), "sem acesso ao WhatsApp" (trocado por "você conecta e autoriza, sem senha, apaga 72h"), Lorem ipsum do modal, reorder (Calculadora↑ + Raio-X), FAQ com as 3 objeções, de-para Ladder A nos cards. Contexto: `OFERTA-IRRESISTIVEL-NEXVYBEAUTY-2026-07-16` + as iterações desta sessão.

---

## 5. Integração com o nosso stack (o valor de portar pro repo)

- **Preço single-source:** o app já tem `usePublicPlans()` (`src/hooks/usePlatformPlans.ts`) que lê `public_plans` (com `list_price_monthly` = a Ladder A). **Portada pro repo, a LP deveria consumir esse hook** em vez de hardcodar 275/427/693 + 450/720/1.190 → mata o drift (memória `reference_cakto_pricing_integrity`). Isso resolve P5 de raiz.
- **Checkout:** `public_plans.checkout_url` (Cakto) → resolve P1. A correção Cakto (link velho cai ao mudar preço) já está no ar.
- **Deploy:** o front do NexvyBeauty é deploy MANUAL via `ssh vps-hostinger` + `deploy-vps.sh` (DOMAIN=gestao.nexvy.tech), sem CI (memória `reference_deploy_pipeline_nexvybeauty_vps`). A LP entra nesse pipeline (nova rota) ou vira deploy próprio — decisão da controladora.
- **Rota/domínio:** decidir se a LP substitui/coexiste com a `SalesPage` atual (`main:src/pages/SalesPage.tsx`), e em qual domínio/rota (apex? `/lp`? subdomínio?).

---

## 6. Decisões pendentes (precisam de direção)

1. **Preço:** ler de `public_plans` (recomendado — mata drift) **ou** hardcode de LP standalone? (P5)
2. **Ladder A (450/720/1.190) já é pública/oficial?** A LP mostra "de R$450…"; a memória diz que o campo `list_price_monthly` foi construído no admin (PlansManager/PlanFormDialog) — confirmar que os valores estão semeados/ativos antes da LP prometer o de-para. (Nota: um recall de memória menciona possível confusão USD×BRL nos valores — **verificar a moeda/valor real no `public_plans` antes de publicar**.)
3. **50 vagas** do Cofounder: real ou remover? (P7)
4. **Mecanismo do Raio-X:** "em 48h por escrito" (manual) vs esteira self-service (conecta→vê). Define a operação por trás da promessa. (não é código)
5. **Rota/domínio + relação com a `SalesPage` atual** (§5).
6. **Links reais** (checkout ×3, WhatsApp, login, legais) — P1-P4.

---

## 7. Quem executa? (critério: mais contexto + capacidade)

O porte tem 2 metades:
- **(A) Extração/adaptação do código da LP** — LP → componente de página, strip do scaffolding TanStack, lp.css + fontes + meta, React19→18 (trivial). **Contexto máximo aqui é DESTA sessão** (li cada linha do `index.tsx`, tenho o MCP do Lovable, acompanhei todas as iterações de copy).
- **(B) Integração no repo + wiring + deploy** — `usePublicPlans`, `checkout_url` Cakto, links reais, rota/domínio, pipeline de deploy manual, confirmação da Ladder A/moeda. **Contexto máximo aqui é da CONTROLADORA** (dona do repo, `public_plans`, Cakto, deploy, go-live).

**Proposta:** híbrido — **esta sessão prepara o PR do código da LP** (metade A, deixando os placeholders claramente marcados e, se combinado, já plugando `usePublicPlans`); **a controladora faz a integração/wiring/deploy** (metade B). **OU** a controladora executa tudo se preferir/tiver banda. Decisão dela pelo critério "quem entrega melhor". **Empate/dúvida → perguntar ao Marcelo.**

---

*Levantamento via MCP Lovable (list_workspaces/list_projects/list_connections/get_project_knowledge/read_file) + clone git + leitura integral do `index.tsx`. Nada portado/aplicado.*
