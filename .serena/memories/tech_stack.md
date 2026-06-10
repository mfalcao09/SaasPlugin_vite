# Tech stack (por app — padrão NexvyBeauty)

Cada app em `apps/<Nome>` segue o mesmo stack (versões podem variar levemente):

- **UI:** React 19 + react-dom 19, react-router-dom 7
- **Build:** Vite 8 (`@vitejs/plugin-react`), `type: module`
- **Linguagem:** TypeScript ~6.0 (build via `tsc -b`, projeto composto: tsconfig.app.json + tsconfig.node.json)
- **Estilo:** TailwindCSS 3.4 + PostCSS 8 + autoprefixer + `@tailwindcss/postcss`. Padrão shadcn/ui: class-variance-authority, clsx, tailwind-merge, tailwindcss-animate, lucide-react (ícones).
- **Dados/backend:** @supabase/supabase-js 2, @tanstack/react-query 5
- **Forms/validação:** react-hook-form 7 + @hookform/resolvers + zod 4
- **Datas:** date-fns 4
- **Gráficos:** recharts 3
- **Toasts:** sonner 2
- **Lint:** ESLint 10 (flat config) + typescript-eslint 8 + eslint-plugin-react-hooks + react-refresh

Estrutura `src/`: App.tsx, main.tsx, components/, pages/, hooks/, contexts/, lib/, types/, assets/.

Alguns apps usam `vite.config.js` (Foods, BarbeiroPro) em vez de `.ts`.