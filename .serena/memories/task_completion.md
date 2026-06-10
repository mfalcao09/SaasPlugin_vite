# Checklist de conclusão (por app)

Rodar DENTRO de `apps/<Nome>` após mudança:

1. `npm run typecheck` → `tsc -b` limpo.
2. `npm run lint` → `eslint .` sem erros.
3. `npm run build` → `vite build` passa (pega erros que o dev server não pega).
4. `npm run preview` + checagem visual se mudou UI.

Deploy só depois do build verde: `make deploy-<app>` da raiz (atualiza o container no VPS via Traefik).

Regra CLAUDE.md: "pronto" exige prova (build verde + smoke). Atenção a `import.meta.env`: nada de secret server-side no bundle. Sem prova de funcionamento → in_progress.