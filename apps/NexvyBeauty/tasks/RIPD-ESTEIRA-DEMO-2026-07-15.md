# RIPD — Esteira de Demonstração NexvyBeauty (scan pré-venda do WhatsApp)

> **⚠️ DRAFT — pendente de sign-off jurídico (Bloqueador B5).** Redigido pela sessão autônoma de execução. NÃO publicar, NÃO habilitar tráfego público real sem revisão e aprovação do advogado responsável. O link da demo não vai a público até esta ratificação.
>
> **Instrumento:** Relatório de Impacto à Proteção de Dados Pessoais (art. 38, LGPD).
> **Data:** 2026-07-15 · **Versão:** v1 (draft) · **Pareado com:** `RIPD-ESTEIRA-DEMO-2026-07-15.html`.

---

## 1. Identificação

| Campo | Valor |
|---|---|
| **Operador** | Nexvy Tecnologia e Comunicação LTDA-ME · CNPJ 64.930.755/0001-78 |
| **Controladora** | A lead (dona do salão) que conecta o próprio WhatsApp |
| **DPO / Encarregado** | dpo@nexvy.tech |
| **Tratamento** | Análise pré-contratual do histórico de WhatsApp da lead para identificar clientes inativas e estimar valor recuperável |
| **Sistemas** | Supabase (Postgres + Edge Functions) · Evolution API (Baileys, VPS) |

## 2. Papéis e base legal

- **Lead = Controladora; NexvyBeauty = Operadora.** Enquadramento já declarado no produto (Política §9). Na demo pré-contratual, o aceite da tela do QR é o **instrumento** (instrução documentada da controladora ao operador — art. 39). Sem ele, a Nexvy escorregaria para controladora (exposição direta art. 42).
- **Base legal do acesso (lead → NexvyBeauty):** **consentimento explícito prévio** (art. 7º, I) — a lead autoriza, de forma inequívoca e informada, o acesso e a análise nas condições dos 72h.
- **Base legal da lead sobre as clientes dela:** **legítimo interesse da própria lead** (art. 7º, IX c/c art. 10) — recuperação da própria carteira. A lead **declara ter base legítima** para compartilhar os contatos. LIA fecha: minimização ✓ (só nome+fone+timestamp), expectativa ✓ (cliente espera contato do próprio salão), salvaguardas ✓ (TTL 72h + wipe + nenhum contato com terceiros durante a demo).
- **Nexvy:** nenhuma base própria necessária — opera sob instrução. Tudo além da instrução (treinar modelo, enriquecer CRM próprio, marketing) = **desvio de finalidade, proibido por construção**.

## 3. Natureza e volume dos dados

| Categoria | O que coletamos | O que NÃO coletamos |
|---|---|---|
| Titulares (clientes da lead) | Nome (pushName/agenda), telefone, timestamp da última interação | **Corpo das mensagens NUNCA é persistido no Postgres** (só metadados) |
| Consentimento (a lead) | IP, user-agent, geo aproximada (por IP, GeoLite2 local/CDN — o IP não sai para API 3ª), timestamp, texto e versão do termo | — |

Volume: por demo, potencialmente **centenas a milhares** de contatos de terceiros → justifica este RIPD (art. 38).

## 4. Ciclo de vida do dado (retenção 72h)

- **TTL fixo de 72h nos DADOS** (`organizations.demo_expires_at = criação + 72h`), **independente** de pedido de exclusão.
- **Análise contínua** enquanto a conexão do WhatsApp seguir ativa (inclui mensagens novas do período) — condição **explícita no consentimento**.
- **Botão "Excluir meus dados"** (sem "agora"): registra `deletion_requested_at`, **desconecta a instância na hora** (cessa a análise de novas mensagens — minimização) e **agenda** a remoção para o fim das 72h (art. 18).
- **Wipe automático (T-0):** `demo-reaper` (pg_cron horário) → `wipe-demo-org`: deleção **verificada** da instância no servidor Evolution (re-fetch), storage, e wipe DB de todas as tabelas org-scoped. **Retém como prova** (art. 16/18): `lgpd_consents`, `platform_audit_logs` (contagens do wipe). Idempotente.
- **Aviso T-24h:** WhatsApp "sua demo expira amanhã — seus dados serão apagados".

## 5. Medidas de segurança

- Edge functions server-side; a lead anônima nunca chama o Evolution direto (só via `demo-evolution` com token+session).
- Consentimento forense imutável (`lgpd_consents`, RLS super_admin-only, sem UPDATE/DELETE).
- Endpoint público (`demo-start`) com honeypot + rate-limit durável (IP/telefone).
- Wipe com guard duro `plan_status='demo'` (jamais toca org paga) + deleção verificada (best-effort silencioso seria furo LGPD).
- Comparações de segredo em tempo constante; lookups injection-safe.

## 6. Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Wipe incompleto (instância Baileys órfã no VPS; tabelas sem FK) | `wipe-demo-org` com deleção verificada + RPC que varre TODAS as base tables org-scoped (replication_role) + retém prova |
| Ban do número da lead (Baileys = cliente não-oficial) | Demo é read-only + 1 mensagem de relatório (risco ~zero); nunca prometer imunidade |
| Profundidade do histórico não garantida | Copy "seus últimos meses" (nunca "180 dias"); estado honesto na tela quando raso |
| Abuso do endpoint público | Honeypot + rate-limit durável; instância lazy; token single-session 72h |
| Vazamento do pairing code (QR a terceiro) | Exigir QR base64 (não `api.qrserver.com`) |

## 7. Direitos do titular

- **Titular = a lead:** acesso, correção, **eliminação** (botão dedicado; efetiva no T-0), portabilidade, revogação do consentimento (desconecta a instância).
- **Titulares = clientes da lead:** a Nexvy opera sob instrução; o exercício de direitos flui pela controladora (a lead). Nenhum contato com esses terceiros durante a demo.

## 8. Pendências para sign-off (jurídico)

- [ ] Ratificar a base legal (consentimento + LIA) e o texto do termo (§5.2 do blueprint).
- [ ] Aprovar o bump de `PRIVACY_VERSION` com a cláusula do scan de demo (a política vigente 2026-06-19 não descreve o tratamento).
- [ ] Confirmar a resolução de geo por GeoLite2 **local** (o IP não pode ir a API 3ª — B1). Nota técnica: hoje o consent grava geo a partir dos headers do CDN quando disponíveis; a resolução GeoLite2 local completa é pendência de infra.
- [ ] Autorizar o tráfego público real (o link não vai a público até aqui).

---

*Draft gerado automaticamente. A validade jurídica depende da revisão do advogado responsável e do Encarregado (DPO).*
