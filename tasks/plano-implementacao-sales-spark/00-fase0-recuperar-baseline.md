# Fase 0 — F1: Recuperar baseline do sales-spark

> **Status:** ⏸️ aguardando credencial do project Supabase `pfbjfhkhunzrgyzjgiuq` (Marcelo providencia).
> **Decisão:** Rota C (híbrida com adapter). Baseline confirmado ausente em repo local, GitHub, conta CLI e `.env`.

---

## O que preciso receber (escolha UMA via)

### Via A — Lovable export (mais simples se você tem o projeto Lovable)
1. Acesse o projeto Lovable original do sales-spark (lovable.dev/projects/...).
2. Há opção de conectar/ver o Supabase do projeto → de lá pega a **connection string** ou **service-role key**.
3. Me passa pela Via B ou C abaixo.

### Via B — Connection string direta (recomendada — mais segura)
Salve a connection string num arquivo local (NÃO cole no chat, pra não vazar em log):
```bash
# Você roda isto no terminal (substitui [SENHA] pela senha do banco do project):
mkdir -p ~/.config/sales-spark
cat > ~/.config/sales-spark/db.env <<'EOF'
SS_DB_URL=postgresql://postgres:[SENHA]@db.pfbjfhkhunzrgyzjgiuq.supabase.co:5432/postgres
EOF
chmod 600 ~/.config/sales-spark/db.env
```
A senha do banco está em: Supabase Dashboard → project `pfbjfhkhunzrgyzjgiuq` → Settings → Database → Connection string (ou "Reset database password").
Me avisa "pronto" e eu leio o arquivo (sem ecoar o secret) e rodo o dump.

### Via C — Service-role key + transferir project pra sua conta
Se preferir, transfira o ownership do project Supabase pra sua conta (Dashboard → Settings → General → Transfer project). Aí o `supabase link` do seu CLI passa a funcionar e eu dispenso a connection string.

---

## O que eu rodo assim que a credencial chegar (já pronto)

```bash
# Via B (connection string em arquivo):
set -a; source ~/.config/sales-spark/db.env; set +a
supabase db dump --db-url "$SS_DB_URL" -f /tmp/ss-baseline-schema.sql          # 139 tabelas + FKs + índices
supabase db dump --db-url "$SS_DB_URL" --data-only -f /tmp/ss-seeds.sql         # seeds (plans, help, templates)
# Funções/triggers/RLS vêm no schema dump; valido contagem:
grep -c "CREATE TABLE" /tmp/ss-baseline-schema.sql      # esperado ~139
grep -c "CREATE POLICY" /tmp/ss-baseline-schema.sql     # esperado ~377
grep -c "CREATE FUNCTION\|CREATE OR REPLACE FUNCTION" /tmp/ss-baseline-schema.sql  # esperado ~54

# Via C (project linkado):
cd /Users/marcelosilva/Projects/sales-spark-ai-47
supabase link --project-ref pfbjfhkhunzrgyzjgiuq
supabase db dump --linked -f /tmp/ss-baseline-schema.sql
supabase db dump --linked --data-only -f /tmp/ss-seeds.sql
```

---

## Depois do dump (resto da Fase 0)

- **F2** ✅ Rota de schema decidida: **C (híbrida)**.
- **F3** Setup `packages/core-schema` no monorepo com o baseline dumped.
- **F4** Aplicar baseline num project Supabase de staging + validar 139 tabelas / 377 policies / 54 funções.
- **F5** Construir o adapter Rota C: views `organizations`←`empresas`, `profiles`←`empresa_users`, mapeamento `clientes`/`ordens_servico`→`leads`/`deals`. Testar que os edges do sales-spark rodam sobre o adapter.
- **F6** CI: pipeline de `supabase db push` + deploy de edges multi-project.

---

## Segurança (Seção 11 CLAUDE.md)

- Service-role key / connection string são **secrets** — nunca colar no chat, nunca commitar, nunca logar.
- O arquivo `~/.config/sales-spark/db.env` fica `chmod 600`, fora do repo.
- Após o dump, a credencial pode ser revogada (Reset database password) se for de uso único.
- O baseline dumped (`/tmp/ss-*.sql`) NÃO contém secrets — só DDL + seeds públicos. Esse sim pode entrar em `packages/core-schema`.
