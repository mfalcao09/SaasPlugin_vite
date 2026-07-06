# eval-visual — prova visual automática das telas do gestao.*

Resolve a dor **"aterrissou mas não vejo"**: em vez de deployar e torcer, este harness
tira print de cada tela P1 do `gestao.*` (desktop 1440 + mobile 390) e deixa a UI
pronta pra ser **pontuada pela rubric** (`rubric-visual.md`, gate ≥ 85). É a metade
"avaliador" do loop GAN visual — o gerador aplica o `TEMPLATE-UI-GESTAO`, este braço prova.

## O que tem aqui

```
tasks/eval-visual/
├── eval-visual.mjs     ← script Playwright (tira os prints)
├── rubric-visual.md    ← rubric por-screenshot (6 critérios, gate ≥85)
├── README.md           ← este arquivo
├── .auth.json          ← sessão salva (gitignored, criado no 1º login)
└── shots/              ← prints gerados (gitignored)
    ├── pipeline-desktop.png   pipeline-mobile.png
    ├── leads-desktop.png      leads-mobile.png
    └── … (7 telas × 2 viewports)
```

## Pré-requisito (só 1x)

O Playwright já é dep do repo (`@playwright/test`). Falta só o binário do Chromium:

```bash
cd apps/NexvyBeauty
npx playwright install chromium
```

> Se algum dia o `@playwright/test` sair do `package.json`, instale-o: `npm i -D @playwright/test`.

## Como rodar

```bash
cd apps/NexvyBeauty
node tasks/eval-visual/eval-visual.mjs
```

Flags úteis:

| Flag | Efeito |
|---|---|
| `--login` | força novo login (renova a sessão salva) |
| `--base=http://localhost:5173` | aponta pro dev local em vez de `gestao.nexvy.tech` (⚠️ ver aviso abaixo) |
| `--only=Pipeline,Leads` | só essas telas |
| `--desktop-only` | pula os prints mobile |

> ⚠️ **`--base` local e a cor da marca.** O tema institucional **azul Nexvy (#0A52D1)**
> só ativa em host `gestao.*` — o `index.html` gateia a classe `theme-nexvy-institucional`
> por `location.hostname`. Contra `localhost`/IP a UI renderiza no **rosa** global
> (`--primary: 330`, `src/index.css`). Então, ao pontuar prints locais pela
> `rubric-visual.md`, o item §1 **"Marca correta = azul"** é **N/A** — o rosa é artefato do
> harness, **não** defeito da UI (não reprove por isso). Ao detectar base não-`gestao.*`, o
> script avisa no console e grava `shots/_AVISO-base-nao-gestao.md` junto dos prints.
> **Para avaliar marca/cor de verdade, rode contra `gestao.nexvy.tech`.**

## O login (Marcelo faz 1 vez)

Este harness **nunca** vê sua senha. O login é na sua mão, dentro do browser:

1. Na **primeira** execução (ou com `--login`), o script abre um Chromium **visível**.
2. Ele já navega pra `gestao.nexvy.tech/super-admin`. **Você faz login normalmente** nessa janela.
3. Assim que o painel `/super-admin` carrega, o script detecta e salva a sessão em
   `.auth.json` (cookies + storage), fecha o browser sozinho e segue tirando os prints.
4. Nas **próximas** execuções ele reusa `.auth.json` em modo headless — **sem pedir login de novo**,
   até a sessão expirar (aí ele avisa "sessão expirada, rode com `--login`").

`.auth.json` é sessão viva — está no `.gitignore`, **nunca** vai pro repo.

## Como as telas são navegadas (nota técnica)

As telas do `gestao.*` **não têm rota/hash na URL** — a shell troca de tela por estado
React (`setActiveSection`, ver `src/components/superadmin/platform-shell/PlatformSidebar.tsx`).
Por isso o script navega **clicando no item do menu** (texto = label do registry), não por URL.
Ele ainda: troca o módulo default `Gestão(erp)` → `Vendas`, expande o grupo "Atendimentos"
quando preciso, e no mobile abre o menu-hambúrguer antes de clicar.

Telas capturadas (P1, módulo Vendas): **Dashboard, Pipeline, Leads, Chat, Painel, Radar IA, Follow-Up.**

## Como pedir a um agente que pontue os prints

Depois de rodar, os prints estão em `shots/`. Peça a um agente (ou a mim numa próxima sessão):

> "Leia `tasks/eval-visual/rubric-visual.md`, depois abra cada par
> `tasks/eval-visual/shots/<tela>-desktop.png` + `<tela>-mobile.png` e pontue tela por tela
> pela rubric (checklist binário → 6 critérios → veredito). Gate ≥ 85. Devolva a tabela de
> veredito de cada tela + top-3 correções das que ficaram < 85."

O agente lê PNG nativamente (tool Read com imagem). O resultado é uma nota 0–100 por tela,
com evidência visual citada e as correções priorizadas.

## O loop GAN visual (como isto vira recorrente)

```
   ┌──────────────────────────────────────────────────────────────┐
   │  GERADOR: aplica TEMPLATE-UI-GESTAO numa tela (F1..F6)        │
   │      ↓                                                        │
   │  eval-visual.mjs  →  shots/<tela>.png  (prova o que renderizou)│
   │      ↓                                                        │
   │  AVALIADOR (LLM): pontua pela rubric-visual.md  →  nota /100  │
   │      ↓                                                        │
   │  < 85 ?  ── sim ──▶ correções top-3  ──▶ volta pro GERADOR    │
   │      │                                    (máx 4 rodadas)     │
   │      └── ≥ 85 ──▶ APROVADA → tracker §5.3 do template         │
   └──────────────────────────────────────────────────────────────┘
```

- **Adversarial** de verdade: o gerador tenta bater 85, o avaliador tenta reprovar com
  evidência do print. A tela só "passa" quando sobrevive ao print, não à intenção.
- **Recorrente**: rode a cada mudança de UI (ou num cron/CI) — o diff dos prints em `shots/`
  mostra visualmente o que mudou entre duas rodadas, e a nota diz se subiu ou caiu.
- **Barato**: 1 comando gera a evidência; o avaliador é um agente lendo PNGs. Sem infra nova.
- **Ancorado**: a mesma rubric (`rubric-visual.md`) espelha os 6 critérios/pesos do
  `TEMPLATE-UI-GESTAO` — gerador e avaliador falam a mesma língua, sem drift.
