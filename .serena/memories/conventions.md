# Convenções

- **Multi-app, não monorepo:** cada `apps/<Nome>` é isolado (package.json + node_modules próprios). Mudança em um app NÃO afeta os outros. Reuso entre apps é por cópia, não por package compartilhado.
- **shadcn/ui pattern:** componentes em `src/components/` usando CVA + clsx + tailwind-merge; helper `cn()` provável em `src/lib/`. Ícones via lucide-react.
- **Forms:** sempre react-hook-form + zodResolver (validação zod). Não validar à mão.
- **Server state:** TanStack Query para dados Supabase; client do Supabase em `src/lib/`.
- **Segurança (CLAUDE.md §11):** chave Supabase no front é só a **anon key** (RLS obrigatório); service_role NUNCA no bundle Vite (`import.meta.env` exposto é público). Endpoints sensíveis via Edge Function.
- **TS composto:** editar tsconfig.app.json (app) vs tsconfig.node.json (vite/config); raiz tsconfig.json só referencia.
- **ESLint flat config** (eslint.config.js), não `.eslintrc`.
- Apps têm inconsistência proposital: alguns `vite.config.js`, outros `.ts` — verificar antes de editar config.