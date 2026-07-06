# CONTEXTO DE SESSÕES — NexvyPayments (fio para o histórico completo)

> **Para que serve:** dar à próxima sessão (a que vai IMPLEMENTAR o NexvyPayments) o rastro completo de tudo que foi decidido e discutido — não só os artefatos finais, mas o *porquê* de cada decisão. Comece por aqui.
> **Data:** 2026-07-06.

---

## 1. Transcritos completos (fonte-da-verdade das discussões)

Duas sessões produziram este plano. Os transcritos JSONL são o registro literal de tudo que foi falado e feito:

| Sessão | Papel | Caminho do JSONL (fonte-da-verdade) |
|--------|-------|-------------------------------------|
| **`b58002ed-d7b0-432d-9ac0-69392b2cb91b`** | **Esteira original** — criou os 6 artefatos do produto (as-is×to-be, blueprint, roadmap, spec auditável, plano-loop, apresentação) partindo do CRM Vendus clonado. Absorveu Vendus + C6 + NotaAS, rodou o confronto adversarial. | `/Users/marcelosilva/.claude/projects/-Users-marcelosilva-Projects-GitHub/b58002ed-d7b0-432d-9ac0-69392b2cb91b.jsonl` (~15M) |
| **`61748ace-f41f-46e0-b031-920b420be4de`** | **Repivô → monorepo** — reassentou tudo como app embutido `apps/NexvyPayments/` forkado do NexvyBeauty; cravou a estratégia de fork (ADR-001); apagou o repo standalone. É a sessão que gerou ESTE documento (o JSONL contém o restante dela). | `/Users/marcelosilva/.claude/projects/-Users-marcelosilva-Projects-GitHub/61748ace-f41f-46e0-b031-920b420be4de.jsonl` (~21M+) |

Snapshots incrementais (backup, mesmo conteúdo por marco): `~/.claude/sessions-snapshots/{61748ace…,b58002ed…}-*.jsonl`.

### ⚠️ Como ler os JSONLs (crítico — não estoure seu contexto)
Os transcritos têm **15–21 MB cada**. **NUNCA** faça `Read` do arquivo inteiro — vai estourar o contexto e derrubar a sessão. Em vez disso:
- **Fonte primária = os `.md`/`.html` deste diretório e de `../specs/`.** Eles já destilam as decisões. Leia-os primeiro; na maioria dos casos você não precisa do JSONL.
- **Consulta pontual ao JSONL** (só quando precisar do *porquê* de uma decisão): `grep -a "<termo>" <caminho.jsonl>` para achar o trecho, ou despache um **subagente** com a instrução "leia o JSONL X, extraia só o que se falou sobre Y" (o subagente absorve o volume e te devolve o resumo).
- Termos úteis para grep: `D1`, `hard fork`, `mTLS`, `NotaAS`, `C6`, `margem`, `PIX`, `CRM`, `V3`, `V5`, `admin-provision-users`, `whatsapp-router`, `pgmq`.

---

## 2. Linha do tempo das decisões (o que aconteceu, em ordem)

**Sessão 1 (`b58002ed`) — esteira sobre o Vendus clonado:**
1. Clonou o CRM Vendus (`mfalcao09/saas-gest-o-de-cobran-a-e-clientes`, remix Lovable) e mapeou o as-is com file:line.
2. Travou escopo D1–D6 via perguntas ao Marcelo (multi-tenant horizontal; motor Cakto+C6; v1 completo; 500–5.000 fat/mês; NFS-e via NotaAS).
3. Absorveu C6 (adapter Python no ERP-Educacional, smoke sandbox) e NotaAS (crawl da doc + navegação autenticada: homologação existe, cota SaaS Pro 2.000 notas/mês, `referencia`=idempotência).
4. Produziu blueprint + roadmap; confronto adversarial (SIM-COM-CORREÇÕES, 13 correções); spec auditável (24 entregáveis, OpenAPI 3.1, 9 gates); plano-loop; apresentação. Parecer PMF: pré-PMF, Rota A, gate G-PILOTO (compromisso pago).

**Sessão 2 (`61748ace`) — repivô para o monorepo (esta sessão):**
5. Marcelo mudou a estratégia: lançar dentro do `SaasPlugin_vite`, seguindo o NexvyBeauty ("sistema mais avançado, quase pronto").
6. Esclarecimentos que corrigiram o rumo (todos no JSONL): (a) três CRMs que nunca se fundem — NexvyTech central vende, CRM embutido de cada app cobra; (b) todos os SaaS = fork do Vendus; (c) versões divergentes: Beauty=**V3**+mods, NexvyTech=V4, clone-Payments=**V5**; (d) as versões **divergem e não retroagem** (upstream não vê nossas mods, nossas mods não sobem).
7. Decisão de base + estratégia: **forka do Beauty (V3+mods)**, não da V5. **Hard fork gerenciado** (ADR-001): mods isoladas + `CORE-DELTA.md` + patches seletivos. V5 descartada (vira fonte de patch como qualquer versão).
8. Reassentou os 6 artefatos sobre a base Beauty (re-mapeou file:line, D1→Beauty, LGPD/automação já-resolvidos, esteira `migrations_cobranca/`, PASSO-0-app = criar app via rsync do Beauty + cascade A+B). Descobriu ao aterrissar: `admin-provision-users` não existe no Beauty (bloqueador some), `email_infra`/pgmq e `whatsapp-router.ts` também não (→ P-COBR-009).
9. Apagou o repo standalone local; commitou tudo no branch `feat/nexvypayments-planning`.

---

## 3. Ordem de leitura recomendada (para a sessão de implementação)

1. **Este arquivo** (você está aqui) — o mapa.
2. `../../../docs/ADR-001-estrategia-fork.md` — a regra de fork que governa TODA edição (por que e como isolar).
3. `docs/specs/nexvypayments-spec-auditavel.md` — **fonte de verdade da implementação** (26 entregáveis A0..E4+A7, critérios binários, matriz de conformidade, OpenAPI, 9 gates).
4. `tasks/nexvypayments-plano-execucao-loop.md` — o **PROMPT DE LANÇAMENTO** (§4) + loop-readiness + PASSO-0-app.
5. `docs/CORE-DELTA.md` — o registro (vazio) de edições de core; alimente-o desde a 1ª edição.
6. Contexto de negócio (só se precisar do porquê): `docs/specs/nexvypayments-as-is-to-be.md` (gaps, riscos, unit economics, parecer PMF) e `docs/specs/nexvypayments-blueprint.md` (arquitetura, DDL).
7. Insumos verificados: `docs/insumos/` (mapa as-is Vendus, C6, NotaAS, veredito adversarial, mapa do SaasPlugin).
8. Só se um *porquê* específico não estiver nos `.md` acima → grep nos JSONLs da §1.

---

## 4. Decisões travadas (resumo de 1 tela — detalhe nos docs)

- **D1′:** forka do NexvyBeauty (base-mãe Nexvy), não do Vendus clonado. **Estratégia:** hard fork gerenciado (ADR-001).
- **D2:** produto horizontal multi-tenant (qualquer negócio de mensalidade: NF + boleto + conversa). Case #1 = água/condomínio; case #2 = cowork.
- **D3:** motor Cakto (checkout/cartão) + C6 (boleto/PIX registrado). **D6:** NFS-e via NotaAS.
- **D4:** v1 completo (lote + NFS-e + régua + IA). **D5:** 500–5.000 faturas/mês.
- **Núcleo de cobrança = greenfield** (pagador/fatura/boleto/PIX/NFS-e/conciliação nunca existiram). Régua/IA/multi-tenant/WhatsApp/LGPD = herdados do Beauty.
- **A0 (PoC mTLS C6 em edge function)** = gate bloqueante no topo do trilho bancário. Fallback: microserviço fora do edge.
- **9 gates humanos** e **pendências P-COBR-001..010** — ver spec §7/§8.
