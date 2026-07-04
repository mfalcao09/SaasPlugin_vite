# RUNBOOK — Org piloto zerada (F2.2 · lancamento-v3)
> Objetivo: organização nova, limpa (sem seed/conversas de teste), etiquetada por sub-vertical, pronta pro concierge em <10 min.

## Passos (superadmin — gestao.nexvybeauty.com.br)

1. **Criar a organização** (superadmin → Organizações → Nova): nome do negócio da piloto, slug curto (vira o link público `/s/<slug>`), plano **Essencial** (solo) ou **Premium** (salão com equipe). O provisioning já seta `enabled_modules` automaticamente.
2. **Etiquetar a sub-vertical** (até existir select na UI, via SQL — 1 linha):
   ```sql
   UPDATE organizations SET sub_vertical = '<salao|nails|lash|brow|podologia|estetica>'
   WHERE slug = '<slug-da-piloto>';
   ```
3. **Convidar a dona** (e-mail dela) como owner da org nova.
4. **Concierge (30 min, com ela na chamada):**
   a. `/conexoes` → Nova conexão → QR no WhatsApp DELA (não trocar número).
   b. Importar carteira: clientes com nome+telefone (planilha simples ou digitação dos top 30).
   c. Cadastrar 3-5 serviços com preço (dá `valor` aos agendamentos → alimenta o painel Recuperado).
   d. Rodar o primeiro scan em `/ai-growth` → mostrar o R$ dela na tela.
   e. Disparar 1 reativação real com aprovação dela (alimenta `reactivation_log`).

## Verificação de "zerada" (rodar ANTES de entregar o acesso)

```sql
-- tudo deve retornar 0 para a org nova (troque :org)
SELECT
  (SELECT count(*) FROM clientes         WHERE organization_id = :org) AS clientes,
  (SELECT count(*) FROM agendamentos     WHERE organization_id = :org) AS agendamentos,
  (SELECT count(*) FROM reactivation_log WHERE organization_id = :org) AS disparos;
```

## Regras
- **NUNCA** usar a org de demonstração (seed Maria/Joana/Ana/Bruna) para piloto real — ela é ferramenta de venda (demo), não de operação.
- 1 org por piloto; `sub_vertical` obrigatório no dia 0 (o experimento 5×1 depende disso).
- Registro semanal: `SELECT * FROM pilot_activation_funnel WHERE organization_id = :org ORDER BY semana;` (sexta-feira — F4.4).

**Check binário do runbook:** cronometrar a 1ª execução real — meta <10 min até o passo 3 (o concierge dos 30 min é à parte, com a piloto).
