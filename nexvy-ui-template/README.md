# Nexvy UI Template

Pacote de **design reutilizável** extraído do NexvyBeauty para aplicar o visual do
grupo em qualquer SaaS novo. Exporta os **4 temas** (Beauty Rosé claro/escuro do
`app.*` + Nexvy Lux navy/gold claro/escuro do `gestao.*`), o **preset Tailwind**, a
**shell colapsável** (desktop + mobile) e as **receitas** de UI.

> **Extração zero-risco.** Este pacote é **aditivo e isolado**: vive só em
> `nexvy-ui-template/` e **nenhum arquivo do app existente importa dele**. Copiar,
> ler ou apagar esta pasta não afeta a produção.

```
nexvy-ui-template/
├── README.md                    ← você está aqui
├── SHOWCASE.html                ← 👀 ABRA ISTO: os 4 temas com switcher + mock de layout
├── tokens/
│   ├── themes.css               ← os 4 temas (CSS custom properties, VERBATIM)
│   └── tailwind-preset.cjs       ← preset Tailwind (colors/radius/fontFamily)
├── shell/
│   ├── types.ts                 ← contrato de navegação (registry) + cn
│   ├── NexvyShell.tsx           ← shell DESKTOP colapsável (sidebar + switcher + topbar)
│   ├── NexvyMobileBottomNav.tsx ← shell MOBILE (bottom nav)
│   ├── index.ts                 ← barrel de exports
│   └── EXAMPLE.tsx              ← uso mínimo (registry de 3 itens)
└── components/
    └── RECIPES.md               ← snippets copiáveis: card/KPI/tabela/badge/botão
```

---

## O modelo host-aware (a ideia central)

**O componente NUNCA sabe o hue.** Todo componente é escrito **token-only** —
`bg-primary`, `text-muted-foreground`, `border-border`, `hsl(var(--primary))`. O
tema entra por uma **classe no `<html>`**, e as CSS custom properties resolvem para
a paleta certa. O mesmo botão vira rosé no `app.*` e navy no `gestao.*` **sem trocar
uma linha**.

| Produto  | Tema | Classe no `<html>` |
|----------|------|--------------------|
| `app.*`  | Beauty Rosé **claro** | *(nenhuma)* |
| `app.*`  | Beauty Rosé **escuro** | `dark` |
| `gestao.*` | Nexvy Lux **claro** (navy) | `theme-nexvy-institucional` |
| `gestao.*` | Nexvy Lux **escuro** (gold) | `theme-nexvy-institucional dark` |

Âncoras de cor (para reconhecer de olho):

- **Beauty Rosé** — claro: rosé `#c54b60` + vinho `#8c041d` sobre creme `#faf7f2`;
  escuro: rosé-claro `#d9718a` sobre vinho-noir `#1b1315`.
- **Nexvy Lux** — claro: **navy `#213156`** (ação) + dourado ocre `#9f702f` sobre
  off-white `#f7f9fc`; escuro: **gold `#dba341`** (ação) sobre charcoal `#171615`.

---

## Como aplicar num SaaS novo (passo a passo)

### 1. Copiar o `themes.css` e importá-lo no topo do CSS de entrada

Copie `tokens/themes.css` para o projeto (ex.: `src/nexvy-theme.css`) e importe-o
**antes** das diretivas do Tailwind, no seu `index.css`:

```css
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
@import './nexvy-theme.css';   /* os 4 temas + base + utilities */

@tailwind base;
@tailwind components;
@tailwind utilities;
```

### 2. Aplicar o preset Tailwind

```js
// tailwind.config.cjs (ou .ts/.js)
const nexvyPreset = require('./nexvy-ui-template/tokens/tailwind-preset.cjs');

module.exports = {
  presets: [nexvyPreset],
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
};
```

Instale os plugins que o preset usa:

```bash
npm i -D tailwindcss tailwindcss-animate @tailwindcss/typography
```

### 3. Aplicar a classe de tema no `<html>` (host-aware) — ANTES do 1º paint

Coloque um script inline no `index.html` (evita flash de tema errado):

```html
<script>
  (function () {
    var h = location.hostname;
    var el = document.documentElement;
    // gestao.* → Nexvy Lux; senão → Beauty Rosé (app.*)
    if (h.indexOf('gestao.') === 0) el.classList.add('theme-nexvy-institucional');
    // dark opcional (persistido, ou prefers-color-scheme)
    if (localStorage.getItem('theme') === 'dark') el.classList.add('dark');
  })();
</script>
```

> Para **testar os 2 produtos** sem trocar de host, aplique a classe manualmente:
> `document.documentElement.classList.toggle('theme-nexvy-institucional')`.

### 4. Envolver o app na Shell + passar o registry de navegação

A navegação é um **registry** (array de módulos → grupos → itens) passado por prop.
Sem router e sem Supabase — a shell é state-driven. Veja `shell/EXAMPLE.tsx` para o
mínimo (3 itens). Esqueleto:

```tsx
import { NexvyShell, NexvyMobileBottomNav, type NexvyModule } from './nexvy-ui-template/shell';
import { LayoutDashboard, Users, Settings } from 'lucide-react';

const MODULES: NexvyModule[] = [{
  id: 'app', label: 'Meu SaaS', icon: LayoutDashboard,
  nav: [
    { id: 'top', label: null, items: [
      { id: 'dashboard', label: 'Visão Geral', icon: LayoutDashboard, render: () => <Dashboard/> },
      { id: 'clientes', label: 'Clientes', icon: Users, render: () => <Clientes/> },
    ]},
    { id: 'cfg', label: 'Configuração', items: [
      { id: 'ajustes', label: 'Ajustes', icon: Settings, render: () => <Ajustes/> },
    ]},
  ],
}];

function App() {
  const [section, setSection] = React.useState('dashboard');
  return (
    <NexvyShell
      modules={MODULES}
      activeModuleId="app" onModuleChange={() => {}}
      activeSection={section} onSectionChange={setSection}
      isDark={false} onToggleTheme={() => {}}
    />
  );
}
```

- **Multi-módulo?** Passe `modules` com 2+ entradas → o **module switcher** (grid
  popover) aparece sozinho. Com 1 módulo, ele some.
- **Seletor de produto / qualquer extra?** Use a prop `headerSlot`.
- **Ações de rodapé** (Sair, Voltar): prop `footerActions`.
- **Mobile**: `NexvyMobileBottomNav` compartilha o mesmo `activeSection`.

---

## O que a shell exige para rodar num SaaS novo

| Requisito | Detalhe |
|---|---|
| **Tokens** | `tokens/themes.css` importado (a shell é 100% token-only). |
| **Preset Tailwind** | `tokens/tailwind-preset.cjs` no `presets` (dá `bg-sidebar`, `text-primary`, `rounded-lg`…). |
| **react** | ≥ 18 (usa `useState`). |
| **lucide-react** | ícones (`{ className?: string }`). |
| **clsx + tailwind-merge** | usados pelo `cn` em `shell/types.ts` (`npm i clsx tailwind-merge`). |
| **shadcn/ui** | **RECOMENDADO, não obrigatório.** A shell é self-contained (usa `<button>` + React state). Para primitivas ricas (Sheet no mobile, Tooltip no rail, Popover, Dialog) e para as receitas do `RECIPES.md`, instale a base shadcn/ui + os mesmos tokens. |

A shell **não** depende de router, Supabase, auth ou tabelas — tudo que era
acoplamento do NexvyBeauty virou **prop/callback**.

---

## Fidelidade

Os tokens e medidas são **LEI** — foram copiados VERBATIM de
`apps/NexvyBeauty/src/index.css` e `tailwind.config.ts` (o que renderiza em
produção), não recriados de cabeça. `--radius = 0.875rem`; densidade global
`html { font-size: 90% }`; `app.*` = Inter, `gestao.*` = stack Apple (SF Pro,
resolvido pela classe `.theme-nexvy-institucional`). As receitas de UI seguem a
rubric travada `TEMPLATE-UI-GESTAO_v2-2026-07-11`. Ver `components/RECIPES.md`.

## Ver o resultado

Abra **`SHOWCASE.html`** no navegador (arquivo único, self-contained, zero build):
switcher entre os 4 temas + mock de layout (sidebar colapsável, header, KPIs,
tabela, badges, botões) com os valores de cor exatos de cada tema.
