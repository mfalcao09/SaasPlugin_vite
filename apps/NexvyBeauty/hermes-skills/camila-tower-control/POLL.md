# Poll loop (operador / cron Hermes)

Env necessários na VPS (não commitar):

- `HERMES_BRIDGE_URL` = `https://<project>.supabase.co/functions/v1/platform-hermes-bridge`
- `HERMES_BRIDGE_SECRET` = mesmo valor do secret da edge

Exemplo (dry mental — ajuste local):

```bash
curl -sS "$HERMES_BRIDGE_URL" \
  -H "Content-Type: application/json" \
  -H "x-hermes-bridge-secret: $HERMES_BRIDGE_SECRET" \
  -d '{"action":"poll","limit":5}'
```

Claim / complete usam o mesmo header. Gestao usa JWT do usuário super_admin via `supabase.functions.invoke`.
