# Nina / Ana Vitória — Plano de Extração para DUDA (B2B) e EquipIA (tenant)

**Data:** 2026-07-19
**Repo analisado:** `mfalcao09/remix-nina-para-est-tica-e-beleza-19jun` (clone efêmero em `/private/tmp/claude-501/nina-analise/nina`, **fora** do worktree do SaasPlugin_vite)
**Escopo:** análise read-only. Nenhum código de produção tocado. Nada commitado.
**Convenção de citação:** caminhos `src/…` e `supabase/…` referem-se ao **repo da Nina**; caminhos prefixados com `apps/NexvyBeauty/` são **nossos**.

> ⚠️ **Colisão de nomes.** Já existe uma agente chamada **Nina** do nosso lado (retenção/D-7 — ver `apps/NexvyBeauty/tasks/NINA-D7-ATIVACAO-BLUEPRINT-2026-07-15.md`). Neste documento, "Nina" = **o produto comprado da Viver de IA**. Se algum ativo for adotado, renomear na origem para evitar ambiguidade permanente no codebase.

---

## 0. Veredito em uma página

**A resposta desconfortável primeiro:** a proporção 15%/80% está certa em espírito, mas *"a Nina transfere quase inteira (~80%)"* é perigoso se alguém ler como "porta o módulo". **Zero por cento do runtime da Nina é portável.** O código é single-tenant por decisão explícita e assumida (`supabase/migrations/20260521200736_37178991-4ff1-49be-9db0-a305d1a3ff37.sql:2` — *"MIGRAÇÃO: Sistema Single-Tenant (V2)"*), não tem `organization_id` em lugar nenhum, tem RLS que entrega `SELECT` de tudo para qualquer `authenticated`, e todo LLM passa pelo gateway proprietário do Lovable. O que transfere é **conhecimento**: prompt, vocabulário, guardrails, taxonomia, políticas, templates e o *desenho* do configurador.

| Trilha | Avaliação do Marcelo | Correção |
|---|---|---|
| **A — DUDA (B2B)** | ~15%, só técnica | **~15% confirmado em volume; errado em natureza.** Não é "0% de conteúdo": existe um prompt B2B **direto** que a hipótese não considerou — `getDefaultSystemPrompt()` em `supabase/functions/nina-orchestrator/index.ts:1547-1688` é a Nina **vendendo software/IA para donos de empresa**, exatamente o job-shape da Duda. |
| **B — EquipIA (tenant)** | ~80%, quase inteira | **~75% do CONHECIMENTO, ~0% do CÓDIGO.** E um furo na premissa: o *"configurador que permite cada salão ter a sua"* **não existe** — a Nina tem **uma** linha de `nina_settings` para a instância inteira (`nina-orchestrator/index.ts:207-214` cai em `.limit(1).maybeSingle()`). O que existe é um excelente **formulário + arquitetura de geração**; o multi-tenant é nosso (`product_agents`), não deles. |

**Riscos que travam reuso literal (§6):** o repo carrega o **design system e a marca do vendedor** (`src/design-system/viverdeia/` completo, com logos, tokens e marketing kit) e ainda a marca de um **terceiro** (`_reference-assina/`, Assina.ai); tem `.env` commitado apontando para o Supabase do vendedor; e tem duas vulnerabilidades P0 herdadas (service_role key legível **e gravável** pelo frontend; refresh tokens do Google legíveis por qualquer usuário logado). **Nada disso pode encostar no nosso repo.** A extração é feita a mão, por transcrição de conteúdo — nunca por cópia de arquivo.

---

## 1. Mapa do repositório

### 1.1 Origem e stack

- **Origem:** remix do Lovable. Único ancestral: `7fd4dbf "Initial commit from remix"` (2026-07-17). Os 24 commits são todos do mesmo dia — **o histórico do vendedor não veio junto**; temos um snapshot.
- **Rebrand já feito:** `daba1ba "Finalizou rebrand NexvyBeauty"`; `package.json:2` já diz `"name": "nexvy-beauty"`. A persona no arquivo de prompt foi renomeada de "Nina" para "Ana Vitória" — diff de **8 linhas** em `src/prompts/default-nina-prompt.ts`. **O conteúdo do prompt é 100% do vendedor**; o rebrand só trocou nomes próprios.
- **Stack:** React 18 + Vite 6 + TS + Tailwind 3 + shadcn/Radix + Supabase (auth, Postgres, Edge Functions Deno) + Playwright. 225 arquivos versionados; 26 tabelas + 3 views.
- **A Nina já é, ela própria, um fork vertical.** O README original (`git show 7fd4dbf:README.md`) diz: *"É um fork da Nina genérica (SDR)"*. O vendedor mantém um produto-base B2B e verticaliza — o que explica o prompt B2B sobrevivendo como fallback hardcoded na edge function.

### 1.2 Arquitetura de runtime

```
Meta WhatsApp Cloud API (graph.facebook.com/v18.0)
        │  webhook
        ▼
whatsapp-webhook ──► message_grouping_queue   (debounce de 10 s — index.ts:13)
        │
        ▼
message-grouper ────► messages + nina_processing_queue
        │
        ▼
nina-orchestrator ──► claim_nina_processing_batch (lote de 10)
        │              ├─ resolve settings (fallback triplo: user → global → qualquer)
        │              ├─ monta system prompt + variáveis + memória do cliente
        │              ├─ chama Lovable AI Gateway com 4 tools
        │              ├─ executa tool calls (agenda / reagenda / cancela / consulta catálogo)
        │              └─ enfileira resposta em send_queue (delay aleatório 1-3 s)
        │
        ├──► whatsapp-sender       (envia; quebra em chunks se habilitado)
        └──► analyze-conversation  (extrai BANT + move o deal no funil)

pg_cron ──► appointment-reminders   (*/5 min)  ──► pré / pós / NPS / recall
pg_cron ──► google-calendar-watch   (03:00)    ──► renova canal de push do GCal
```

Fontes: `whatsapp-webhook/index.ts:13`; `nina-orchestrator/index.ts:136-137,177-219,255,1179-1207,1463-1494`; `20260525140501_cron_jobs_and_app_config.sql:128-144`.

### 1.3 Onde vive o quê (UI vs. lógica de agente)

| Camada | Onde | Nota |
|---|---|---|
| **Persona / prompt (beleza)** | `src/prompts/default-nina-prompt.ts:18-142` | constante TS no front, usada como *fallback* de UI |
| **Persona / prompt (B2B herdado)** | `supabase/functions/nina-orchestrator/index.ts:1547-1688` | fallback hardcoded no servidor. **Achado principal da trilha DUDA** |
| **Prompt efetivo em runtime** | `nina_settings.system_prompt_override` (TEXT) | `nina-orchestrator/index.ts:255`; slot de A/B em `nina_settings.test_system_prompt` |
| **Configurador de persona** | `src/components/settings/PromptGeneratorSheet.tsx` + `supabase/functions/generate-prompt/index.ts` | 14 campos → template determinístico → LLM só refina |
| **Tools do agente** | `nina-orchestrator/index.ts:13-120` | 4 schemas OpenAI-style, hardcoded no arquivo |
| **Guardrails clínicos** | `default-nina-prompt.ts:69-76` + `generate-prompt/index.ts:152-157` | só no prompt; **não há veto pós-geração** |
| **Catálogo de procedimentos** | tabela `procedures` + tool `list_procedures` + `ProceduresManager.tsx` | `20260522223353_f3_…sql:10-29`; query em `nina-orchestrator/index.ts:507-544` |
| **Follow-up / recall** | `appointment_reminders` + `reminder_templates` + `RemindersManager.tsx` + cron | `20260522223353_f3_…sql:92-148` |
| **Memória / BANT** | `contacts.client_memory` (jsonb), via `analyze-conversation` | `analyze-conversation/index.ts:116-162` |
| **UI que não interessa** | `src/components/{Kanban,Dashboard,Contacts,Scheduling,Team,ChatInterface}.tsx` | CRM genérico com skin rose/gold — nosso CRM é ordens de grandeza maior |

**Regra de leitura:** ~70% dos arquivos são UI de CRM (ruído para nós). O valor está concentrado em **7 arquivos**: `default-nina-prompt.ts`, `nina-orchestrator/index.ts`, `generate-prompt/index.ts`, `PromptGeneratorSheet.tsx`, `ProceduresManager.tsx`, `analyze-conversation/index.ts` e a migration `20260522223353_f3_…sql`.

---

## 2. Inventário dos ativos reutilizáveis (com citação)

### A. Prompt de sistema — vertical beleza
`src/prompts/default-nina-prompt.ts:18-142`. XML tagueado: `<role>`, `<company>`, `<core_philosophy>`, `<knowledge_base>`, `<guidelines>`, `<tool_usage_protocol>`, `<cognitive_process>`, `<output_format>`, `<examples>`. 8 variáveis documentadas no cabeçalho (`:7-15`).

> `:36-40` — *"1. Beleza começa pelo acolhimento. Nunca tratamos uma cliente como 'lead frio'. […] 5. O objetivo é levar a pessoa a uma avaliação ou agendamento. Não é 'fechar venda no WhatsApp'."*

> `:70-75` — *"Não prometa resultado clínico específico […] Não dê diagnóstico médico ou prescreva. […] Não use vocabulário agressivo de venda ('última vaga!', 'promoção relâmpago!', 'garanta já!'). […] Não envie fotos de antes-e-depois de outras clientes sem autorização."*

### B. Prompt de sistema — B2B (o achado que muda a trilha DUDA)
`supabase/functions/nina-orchestrator/index.ts:1547-1688`. É a Nina do **Viver de IA** vendendo formações e soluções de IA para empresários. Conteúdo **B2B SaaS**, mesmo job da Duda.

> `:1569-1573` — *"1. Você é uma 'entendedora', não uma 'explicadora'. Primeiro escute, depois oriente. 2. Objetivo: Fazer o lead falar 70% do tempo. Sua função é fazer as perguntas certas. 3. Regra de Ouro: Nunca faça uma afirmação se puder fazer uma pergunta aberta. 4. Foco: Descobrir a dor real (o 'porquê') antes de apresentar soluções."*

> `:1624` — *"Lead qualificado se demonstrar: ser empresário/gestor/decisor, interesse genuíno em IA, disponibilidade para investir, problema claro que IA pode resolver."*

> `:1683-1685` — contra-exemplo rotulado *"Mau exemplo (muito vendedor)"*, marcado com ❌.

**Nota de propriedade:** o bloco cita nominalmente fundadores, investidores, clientes e prova social do Viver de IA (`:1561-1564`). O texto **não entra** no nosso repo — extrai-se o *padrão*, reescrito com os nossos fatos.

### C. Schemas de tools (contrato de function calling)
`nina-orchestrator/index.ts:13-120`:

| Tool | Linha | Destaque |
|---|---|---|
| `create_appointment` | `:13-50` | enum `type`: `evaluation \| procedure \| followup \| return`; guia de duração dentro do *description* (`:35`: *"30 (avaliação curta), 45 (limpeza simples), 60 (avaliação completa), 90 (procedimento médio), 120 (procedimento longo)"*) |
| `reschedule_appointment` | `:53-77` | captura `reason` livre — vira dado de objeção |
| `cancel_appointment` | `:80-96` | *"Ofereça remarcar antes de cancelar definitivamente"* na própria descrição |
| `list_procedures` | `:99-120` | *"NUNCA invente procedimentos — sempre consulte aqui primeiro"* — anti-alucinação **na tool**, não no prompt |

Validação de negócio no handler, não no modelo: data no passado e **conflito de horário por sobreposição de intervalos** (`:418-457`), com mensagens de erro tipadas (`date_in_past`, `time_conflict`) que voltam como texto para a cliente (`:1264-1268`).

### D. Vocabulário e taxonomia de procedimentos
- **Taxonomia canônica (7 categorias)** com CHECK no banco: `facial`, `corporal`, `harmonizacao`, `capilar`, `bem_estar`, `pos_operatorio`, `outro` — `20260522223353_f3_…sql:14-16`; espelhada no enum da tool (`nina-orchestrator/index.ts:109`) e no select da UI (`ProceduresManager.tsx:24-32`).
- **Vocabulário por área** — `default-nina-prompt.ts:45-50`: limpeza de pele, peeling, microagulhamento, jato de plasma, skinbooster; toxina botulínica, preenchimento labial, bioestimuladores, fios de sustentação; drenagem linfática, massagem modeladora, criolipólise, radiofrequência, ultrassom focalizado, gluteoplastia injetável; drenagem pós-cirúrgica; design de sobrancelhas, micropigmentação, lash design, depilação a laser; laser capilar.
- **8 subverticais de negócio** — `PromptGeneratorSheet.tsx:38-47` (estética facial · harmonização orofacial · estética corporal · dermatologia estética · biomedicina estética · salão completo · SPA · clínica multidisciplinar).
- **Heurística de categorização por título** (regex) — `nina-orchestrator/index.ts:872-877`.

### E. Schema do catálogo (`procedures`)
`20260522223353_f3_…sql:10-29`. Campos que **não temos**: `contraindications` (`:22`), `pre_care` (`:23`), `post_care` (`:24`), `price_min`/`price_max` como **faixa** (`:19-20`) e `price_visible BOOLEAN DEFAULT false` (`:21`). Índices: parcial por categoria e **full-text pt-BR** `gin(to_tsvector('portuguese', name))` (`:31-32`).

O `price_visible` é aplicado **no servidor**: `nina-orchestrator/index.ts:536-542` **remove** `price_min`/`price_max` do payload entregue ao modelo quando a clínica não autoriza. É guardrail de política que o modelo não consegue burlar porque nunca vê o dado — padrão superior ao nosso hábito de instruir por prompt.

UI do CRUD (`ProceduresManager.tsx:222-383`) expõe 11 campos; `professional_id` existe na migration (`:25`) mas **não é exposto**. Copy que resume a intenção do produto: *"Tudo que a Nina pode oferecer. Ela só fala sobre o que está cadastrado aqui."* (`ProceduresManager.tsx:136-138`).

### F. Motor de lembretes / recall + templates literais
- Tipos (CHECK): `pre_24h`, `pre_2h`, `post_24h`, `post_7d_nps`, `recall_30d`, `recall_90d` — `20260522223353_f3_…sql:97`.
- Offsets em código: `nina-orchestrator/index.ts:879-885`. **Atenção:** `recall_90d` existe no enum e tem template, mas **não é agendado** — está ausente da lista de offsets.
- Resolução de template com **fallback por categoria** (específico → genérico): `:892-900`.
- **Templates seed literais** — `20260522223353_f3_…sql:138-148`:

> `pre_24h / harmonizacao`: *"Oi, {{cliente_nome}}! 💖 Lembrando do seu {{procedimento}} amanhã às {{hora}}. Evite anti-inflamatórios e álcool nas próximas 24h. Tudo certo pra vir?"*

> `pre_24h / facial`: *"Amanhã às {{hora}} tem seu protocolo facial. Lembre de vir sem maquiagem e evitar exposição ao sol."*

> `post_24h / harmonizacao`: *"Como está se sentindo? Lembre de não massagear a área tratada por 48h e evitar exposição solar direta."*

> `post_7d_nps`: *"Faz uma semana do seu atendimento. De 0 a 10, o quanto você recomendaria a gente pra uma amiga?"*

> `recall_30d`: *"Faz 30 dias do seu último cuidado com a gente. Quer agendar uma manutenção? ✨"*

O valor aqui é o **cuidado clínico embutido na copy operacional** (anti-inflamatório, álcool, massagear, sol) — conhecimento de domínio, não texto genérico. Placeholders suportados: `{{cliente_nome}}`, `{{data}}`, `{{hora}}`, `{{procedimento}}`, `{{endereco}}` (`RemindersManager.tsx:295`).

### G. Configurador de persona — o desenho (não o código)
`PromptGeneratorSheet.tsx` + `supabase/functions/generate-prompt/index.ts`.

**14 campos** (`generate-prompt/index.ts:30-45`): `assistant_name`, `clinic_name`, `clinic_type`, `subvertical`, `lead_professional`, `ticket_average`, `procedures`, `differentials`, `voice_style`, `forbidden_phrases`, `pricing_policy`, `conversion_action`, `max_lines` (slider 2-6), `emoji_intensity`. Obrigatórios validados nos dois lados: `assistant_name`, `clinic_name`, `procedures`, `differentials` (`PromptGeneratorSheet.tsx:112-121`; `generate-prompt/index.ts:82-94`).

**Enumerações que são o ativo** — cada opção vira um bloco de prompt determinístico:

- `voice_style` → 4 opções com descritor completo (`generate-prompt/index.ts:47-56`). Ex.: *"SPA zen — calma, contemplativa, vocabulário de bem-estar. Usa palavras como 'cuidado', 'presença', 'respiro'. Sem urgência, sem pressão."* · *"Amigo próximo — […] usa diminutivos quando combina ('rapidinho', 'agendinha')."*
- `emoji_intensity` → `none` / `minimal` / `soft` / `high` (`:58-63`), com regra operacional por nível (`minimal` = *"no máximo 1 a cada 3 mensagens. Apenas 💖 ou ✨"*).
- `pricing_policy` → `never` / `range` / `table` (`:65-72`). O `never` traz a frase de contorno pronta: *"Posso te passar a referência exata na avaliação, tá?"*
- `conversion_action` → 5 opções (`PromptGeneratorSheet.tsx:62-68`), incluindo avaliação remota por vídeo e retorno de manutenção.
- `forbidden_phrases` já vem preenchido: *"última vaga, promoção relâmpago, garanta já, oferta exclusiva"* (`PromptGeneratorSheet.tsx:95`).
- `maxLinesAbsolute = Math.min(max_lines + 2, 6)` (`generate-prompt/index.ts:105`) — teto duro além do alvo.

**Arquitetura de geração — isto é o que vale copiar.** O template XML é montado **deterministicamente em código** (`:107-196`) e o LLM entra **só para refinar fluidez**, com meta-prompt que o proíbe de reescrever a estrutura (`:198-225`):

> `:203-205` — *"1. Mantenha TODA a estrutura XML do template exatamente como está. 2. NÃO adicione promessas de resultado, urgência ou escassez. 3. Mantenha o tom acolhedor, profissional e ético — clínica/estética NUNCA usa pressão de venda."*
> `:200` — *"NÃO adicione técnicas de venda agressiva. NÃO troque 'cliente' por 'lead'."*

Mais **whitelist de variáveis** no meta-prompt (`:206-216`) e **sanitizador pós-geração** (`:6-28`) que remove cercas markdown, força os delimitadores `<system_instruction>` e reescreve expressões Luxon vazadas para `{{ data_hora }}`. Isso é engenharia madura de geração de prompt — bem melhor do que "peça pro LLM escrever o prompt".

### H. Extração de memória / BANT estruturado
`supabase/functions/analyze-conversation/index.ts`:
- **Amostragem de custo:** análise pesada só nas interações 1, 5, 10, 15… (`:30`); nas demais, update barato de contador e histórico (`:34-63`).
- **Tool `update_memory_insights`** (`:118-161`): `interests[]`, `pain_points[]`, `qualification_score` 0-100, `next_best_action` enum (`qualify|demo|followup|close|nurture`), `budget_indication`, `decision_timeline`.
- **Movimentação de funil por IA** com critério textual por estágio (`pipeline_stages.ai_trigger_criteria`, `is_ai_managed`) e **gate de confiança > 70** antes de mover o deal (`:302`).
- Reinjeção no prompt: `nina-orchestrator/index.ts:1726-1754`.

**Comparação honesta:** o nosso QCR-V persistido (`apps/NexvyBeauty/supabase/functions/platform-sales-brain/index.ts:275-320,514`) é superior — score determinístico renderizado como **fato imperativo** no prompt, em vez de número que o LLM re-inventa a cada 5 mensagens. Não há o que importar aqui, **exceto** o gate de confiança explícito antes de mutar estado do CRM.

### I. Debounce de mensagens fragmentadas
`whatsapp-webhook/index.ts:13` — `GROUPING_DELAY_MS = 10000`, com `process_after` reagendado a cada nova mensagem do mesmo número (`:314,328`), consumido pelo `message-grouper` que agrupa por telefone (`message-grouper/index.ts:60-68`). Resolve o comportamento real de WhatsApp (a cliente manda 4 mensagens de 3 palavras).

### J. Roteamento adaptativo de modelo
`nina-orchestrator/index.ts:1765-1851`. Modos `flash | pro | pro3 | adaptive`. O `adaptive` (`:1788-1851`) escolhe modelo **e temperatura**: reclamação/urgência → `pro` @ 0.3; técnico → `pro` @ 0.4; vendas com score > 50 → `flash` @ 0.5; conversa nova (< 5 msgs) → `flash` @ 0.8. `max_tokens` fixo em 1000 (`:1200`).

**Avaliação:** a heurística por keyword é frágil; **não recomendo copiá-la**. O que vale é o **princípio de temperatura variável por fase** — hoje não passamos `temperature` (`platform-sales-brain/index.ts:1111-1116`).

### K. Funil de beleza (nomenclatura)
`20260527141926_pipeline_stages_nina_beleza.sql:15-23`: Novas Interessadas → Avaliação Agendada → Pós-avaliação → Negociando Pacote → Cliente Ativa / Não evoluiu. Migration idempotente (UPDATE por `position` + INSERT dos faltantes, sem DELETE de estágio com deal).

### L. Contrato de integrações (documento)
`docs/INTEGRATIONS.md` — 134 linhas com o contrato de "Calendar Adapter" (OAuth → outbound → inbound → disconnect), o **loop guard** via `appointment.last_sync_source`, uma seção *"Quando vale fazer"* (não implementar especulativamente) e o tratamento especial de ERP:

> *"O Nina vira front-of-funnel (qualificar + agendar via WhatsApp) e o ERP segue como back-of-house (executar, faturar, comissionar)."*

Decisão de posicionamento útil para a EquipIA contra Trinks/iClinic/Belezix — e que nós ainda não escrevemos em lugar nenhum.

### M. Bugs herdados — a lista de "não copie isto"
| Bug | Evidência |
|---|---|
| **`{{ clinica_nome }}` e `{{ profissional }}` nunca são interpolados.** A UI anuncia 8 variáveis (`AgentSettings.tsx:263-277`), o interpolador resolve **6** (`nina-orchestrator/index.ts:1712-1723`) e o regex devolve o match original. O prompt padrão manda literalmente *"assistente … da {{ clinica_nome }}"* para o modelo | `default-nina-prompt.ts:20,27,80,120` |
| **`recall_90d` tem enum e template, mas nunca é agendado** | `…f3_…sql:97,147` vs `nina-orchestrator/index.ts:879-885` |
| **`{{endereco}}` é substituído por string vazia** — o lembrete `pre_2h` sai como *"endereço: ."* | `appointment-reminders/index.ts:100-104` |
| **`validateStepData` existe e nunca é chamado** no onboarding — validação é só log | `OnboardingWizard.tsx:287-337` |
| **Prompt duplicado em duas fontes** (constante TS no front + fallback hardcoded na edge) já causou incidente real, documentado em `.lovable/plan.md` | `.lovable/plan.md` |
| **`procedures_catalog_enabled`** é lido em runtime (`nina-orchestrator/index.ts:1187`) e **não tem UI nem coluna documentada** | idem |

---

## 3. Validação da proporção 15% / 80%

### 3.1 Trilha DUDA — 15% está certo, a caracterização não

Concordo com o número. **Discordo de "só a técnica transfere".**

`nina-orchestrator/index.ts:1547-1688` é um prompt de **SDR B2B vendendo software/IA para donos de empresa**: público empresário/gestor/decisor (`:1624`), objeto plataforma SaaS + formações, canal WhatsApp, objetivo descoberta → educação → agendamento. **É a Duda com outro nome e outro produto.** A leitura de que *"o público e a oferta são opostos"* vale para o `DEFAULT_NINA_PROMPT` (beleza), **não** para este.

Ainda assim o volume é pequeno, porque nosso brain já tem o que a Nina não tem: score QCR-V persistido; handoff Duda→Bia com dossiê e regra de continuidade (`apps/NexvyBeauty/supabase/functions/platform-sales-brain/index.ts:1044-1049`); regras invioláveis anti-desconto e anti-escassez-falsa (`:1067-1074`); links de pagamento resolvidos por plano; atribuição CTWA; humanizador com bolhas, delays e tics (`apps/NexvyBeauty/supabase/functions/_shared/humanizer.ts`, 731 linhas). E o que a Nina tem e nós não temos é exatamente o que a hipótese apontou: **few-shot com contra-exemplos, scaffold cognitivo e disciplina de forma declarada**.

**Veredito:** 15% confirmado. Correção: dentro desses 15%, ~1/3 é conteúdo B2B (framing de descoberta consultiva), não só andaime.

### 3.2 Trilha EquipIA — 80% do conhecimento, 0% do código

Concordo com ~80% **se e somente se** "transferir" significar transcrever conhecimento. Eu baixaria para **~75%** e separaria em duas contas, porque a média esconde o risco:

| Dimensão | Transferência | Por quê |
|---|---|---|
| Persona + tom + filosofia de atendimento | **~90%** | `default-nina-prompt.ts:20-41` é reescritível quase palavra a palavra |
| Guardrails clínicos | **~95%** | `:69-76` — melhor do que qualquer coisa que temos (temos **zero** guardrail clínico) |
| Vocabulário + taxonomia de procedimentos | **~90%** | 7 categorias com CHECK + ~25 protocolos nomeados |
| Política de preço | **~85%** | 3 políticas enumeradas + frase de contorno pronta |
| Protocolo de agendamento + tipos | **~80%** | enum `evaluation/procedure/followup/return` mapeia direto |
| Few-shot | **~80%** | 5 exemplos, 2 deles negativos rotulados |
| Templates de lembrete / recall | **~85%** | copy com cuidado clínico real |
| Campos clínicos do catálogo | **~100%** | `contraindications`, `pre_care`, `post_care`, `price_visible` — não temos nenhum |
| **Configurador — desenho** (14 campos + enums + geração template-first) | **~85%** | melhor artefato de engenharia do repo |
| **Configurador — código / persistência** | **~0%** | single-tenant (abaixo) |
| Runtime (orchestrator, filas, RLS, schema, gateway) | **~0%** | §6 |

**Onde a premissa fura.** *"O configurador de persona (que permite cada salão ter a sua)"* não é verdade no código. A Nina resolve settings em cascata até `.limit(1).maybeSingle()` (`nina-orchestrator/index.ts:207-214`); a migration de 2026-05 zerou o `user_id` de propósito (`20260521200736_…sql:32`); e o bootstrap declara *"single-tenant: user_id NULL"* (`20260527142807_bootstrap_admin_and_default_settings.sql:16`). O modelo comercial deles é **um deploy por clínica**. O "cada salão tem a sua" é **nosso** (`product_agents` por `organization_id`) — a Nina só fornece o **formulário**.

**Evidência do tamanho real do buraco do nosso lado:** grep por `contraindic|pre_care|post_care` em `apps/NexvyBeauty/src` e `apps/NexvyBeauty/supabase` → **zero ocorrências**. Os 7 templates de `apps/NexvyBeauty/supabase/functions/_shared/agent-prompt-templates.ts` (`sdr`, `closer`, `support`, `financial`, `admin`, `orchestrator`, `custom`) são **todos B2B genéricos** — falam de "produto", "planos", "quebra de objeção", "checkout". **Não existe template de recepcionista de salão.** E o passo "Sua EquipIA" do onboarding coleta **dois** campos — nome e tom, com 3 opções (`apps/NexvyBeauty/src/components/onboarding/implantacao/ImplantacaoWizard.tsx:377-386`; mapeamento em `apps/NexvyBeauty/supabase/functions/apply-onboarding/index.ts:336`). A Nina coleta 14 campos com enums de domínio.

---

## 4. Trilha DUDA — técnicas a importar para o brain B2B

Escopo: `apps/NexvyBeauty/supabase/functions/platform-sales-brain/index.ts` e `apps/NexvyBeauty/supabase/functions/_shared/agent-prompt-templates.ts`. **Nada de conteúdo estético entra aqui.**

### D1. Bloco `<examples>` com contra-exemplos rotulados — *a maior lacuna*
Hoje nem o `systemPrompt` da Duda (`platform-sales-brain/index.ts:1055-1087`) nem os templates (`_shared/agent-prompt-templates.ts:29-68`) têm **um único exemplo**. Só há proibições em prosa (*"PROIBIDO clichês: 'boa!', 'que ótimo'…"* — `agent-prompt-templates.ts:107`). Proibição sem contraste é a forma mais fraca de instruir.

Padrão da Nina (`default-nina-prompt.ts:120-141`): pares `Cliente → Assistente` rotulados `Bom exemplo` / `Mau exemplo (vendedor demais)` / `Mau exemplo (diagnóstico)`, marcados com ❌ e, num deles, com a correção entre parênteses logo abaixo.

**Aplicação B2B — 5 exemplos com o nosso conteúdo:** (1) abertura vinda de anúncio CTWA; (2) "quanto custa" antes da descoberta; (3) pedido de desconto — contra-exemplo: conceder; correto: reancorar na conta da recuperação; (4) "vou pensar" — contra-exemplo: passar pra Bia cedo demais; correto: uma pergunta de objeção; (5) decisão explícita — contra-exemplo: *"quer que eu te ajude?"*; correto: mandar a URL. Os casos 3-5 já existem como **regra** (`platform-sales-brain/index.ts:1067,1073`); vira exemplo, que é como o modelo aprende melhor.

*Verifica:* 5 goldens novos em `apps/NexvyBeauty/supabase/functions/tmp-eval-agents/goldens.ts` passando, sem regressão nos atuais.

### D2. Scaffold cognitivo explícito
`default-nina-prompt.ts:104-111` — 5 passos silenciosos: ANALISAR (etapa) → VERIFICAR (o que ainda não sei) → PLANEJAR (próxima pergunta) → REDIGIR → REVISAR (bateu o limite? só 1 pergunta?).

O passo 5 é o mais valioso: **auto-checagem da regra de forma dentro do próprio prompt**. Nós declaramos as regras de forma (`platform-sales-brain/index.ts:1080-1087`: ≤300 chars, 1 pergunta, sem markdown) mas não pedimos revisão — e violação de forma é justamente o defeito recorrente.

**Aplicação:** bloco `PROCESSO INTERNO (silencioso)` no fim do system prompt da Duda, com VERIFICAR apontando para `persona.qualification_schema` (`:1060`) e REVISAR checando ≤300 chars / 1 pergunta / sem markdown / não repergunta o que está em "O QUE JÁ SABEMOS DA LEAD".

### D3. Estrutura em tags XML
A Nina usa `<role>`, `<core_philosophy>`, `<guidelines>`, `<examples>`; nós usamos separadores `═══`. Tags delimitam melhor e reduzem vazamento entre seções. Ganho pequeno mas real. **Cautela:** o system prompt da Duda é montado por concatenação condicional (`:1055-1087`) — o tagueamento tem que preservar a montagem. Fazer junto de D1/D2, nunca isolado.

### D4. Anti-alucinação na *description* da tool, não no prompt
`nina-orchestrator/index.ts:103` põe *"NUNCA invente procedimentos — sempre consulte aqui primeiro"* dentro da descrição da tool. A instrução viaja com a tool e não compete por atenção com o resto do system prompt.

**Aplicação:** replicar nas descrições das nossas tools em `apps/NexvyBeauty/supabase/functions/_shared/tools/impl/` — em especial `gerar_link_pagamento.ts` (nunca inventar URL) e `consultar_historico_cliente.ts`.

### D5. Guardrail de política aplicado no servidor, não no prompt
`nina-orchestrator/index.ts:536-542`: com `price_visible = false`, o preço é **removido do payload** antes de o modelo ver. A regra *"NUNCA ofereça desconto"* (`platform-sales-brain/index.ts:1067`) é hoje só texto — se houver campo de desconto no conhecimento do produto, ele deve ser filtrado no servidor antes de entrar no `knowledgeContext`.

### D6. Gate de confiança antes de mutar estado de CRM
`analyze-conversation/index.ts:302` — só move o deal com `confidence > 70`. Conferir se a nossa movimentação automática de estágio tem gate equivalente.

### D7. Temperatura variável por fase
Importar **o princípio, não a heurística de keyword**. Já roteamos modelo por persona (`platform-sales-brain/index.ts:1100-1102`) mas não passamos `temperature` (`:1111-1116`). Proposta mínima: Duda em descoberta com temperatura mais alta; Bia em fechamento e qualquer turno com objeção, mais baixa.

### D-NÃO — o que explicitamente não importar
- Todo o `<company>` / `<knowledge_base>` do prompt B2B (`:1557-1601`) — são fatos do Viver de IA.
- O fallback triplo de settings (`:177-219`) — consequência do single-tenant; para nós seria bug de vazamento entre organizações.
- `getAdaptiveSettings` por keyword (`:1788-1851`).

---

## 5. Trilha EquipIA (tenant) — portar, adaptar, manter

Escopo: `apps/NexvyBeauty/supabase/functions/_shared/agent-prompt-templates.ts`, `.../_shared/tools/`, `apps/NexvyBeauty/src/components/admin/agents/` e o passo "Sua EquipIA" do `ImplantacaoWizard`.

### 5.1 Portar quase direto (transcrição de conteúdo, nunca cópia de arquivo)

| # | Ativo | Origem | Destino |
|---|---|---|---|
| B1 | **Template `beauty_receptionist`** | `default-nina-prompt.ts:18-142` | novo entry em `_shared/agent-prompt-templates.ts` + espelho em `src/components/admin/agents/AgentPromptTemplates.ts` |
| B2 | **Guardrails clínicos** (não prescreve, não diagnostica, não promete resultado, não compara concorrente, não envia antes-e-depois de terceiros) | `default-nina-prompt.ts:69-76` | bloco fixo de B1 + defaults de `prohibited_phrases` |
| B3 | **Taxonomia de 7 categorias** | `…f3_…sql:14-16` | enum de categoria em `products` (tipo `servico`) |
| B4 | **Campos clínicos do catálogo**: `contraindications`, `pre_care`, `post_care`, `price_min/max`, `price_visible` | `…f3_…sql:19-24` | `products.settings` (jsonb) — evita migration de coluna e respeita o contrato `products.tipo='servico'` |
| B5 | **9 templates de lembrete/recall** com cuidado clínico na copy | `…f3_…sql:138-148` | cadência / pós-venda (`cadence-*`, `process-post-sale-scheduled`) |
| B6 | **Ciclo `recall_30d` / `recall_90d`** como conceito de produto | `…f3_…sql:97` | cadência de reativação — é literalmente "Cliente de Volta" |
| B7 | **Few-shot da recepcionista** (5 exemplos, 2 negativos) | `default-nina-prompt.ts:120-141` | dentro de B1 |
| B8 | **Posicionamento front-of-funnel vs. ERP back-of-house** | `docs/INTEGRATIONS.md` | doc de estratégia de integração do tenant |

### 5.2 Adaptar (o desenho serve, a implementação não)

**B9 — Configurador de persona por salão.** Adotar os **14 campos e as enumerações** (§2.G) como *schema de configuração do agente recepcionista*, persistindo em `product_agents` por `organization_id` — que já é o nosso modelo. Campos que hoje **não existem** no nosso `AgentEditor`: `subvertical`, `lead_professional`, `ticket_average`, `pricing_policy`, `conversion_action`, `emoji_intensity`, `max_lines`. (Já temos: nome, tom, objetivo, frases proibidas/obrigatórias, tamanho de mensagem, humanização.)

**B10 — Geração template-first.** Nosso `generate-agent-ai` (`apps/NexvyBeauty/supabase/functions/generate-agent-ai/index.ts`, 559 linhas) já é mais completo que o `generate-prompt` da Nina (291), mas deixa o LLM com mais liberdade estrutural. Adotar os três controles: (1) template montado **em código**, LLM só refina (`generate-prompt/index.ts:107-196` vs `:198-225`); (2) **whitelist de variáveis** no meta-prompt (`:206-216`); (3) **sanitizador pós-geração** (`:6-28`).

**B11 — `price_visible` como gate de servidor** (§2.E / D5): quando o salão não autoriza divulgar preço, o preço **não entra no contexto**. Não é instrução — é ausência de dado.

**B12 — Debounce de 10 s.** Verificar se `evolution-webhook` / `platform-meta-whatsapp-webhook` já agrupam mensagens fragmentadas; se não, adotar o padrão `process_after` reagendável (`whatsapp-webhook/index.ts:13,314,328`).

### 5.3 O que já temos e é melhor — manter, não substituir

| Nosso | Por quê é melhor |
|---|---|
| **Multi-tenant real** (`organization_id`, RLS por org) | a Nina é single-tenant por design (§3.2) |
| **`product_agents` + hierarquia + roteamento + handoff** (`_shared/agent-routing.ts`, `_shared/orchestrator.ts`, `AgentHierarchyView.tsx`) | a Nina tem **um** agente e nenhum roteamento |
| **Humanizador** (`_shared/humanizer.ts`: bolhas, delays, tics regionais, reações, `buildHumanizationPromptBlock`) | a Nina tem delay aleatório + split por `\n\n` (`nina-orchestrator/index.ts:1756-1763`) |
| **Registry de tools** (`_shared/tools/registry.ts` + 5 impls) | a Nina tem 4 tools hardcoded no arquivo do orchestrator |
| **Score QCR-V persistido como fato** | a Nina recalcula score por LLM a cada 5 mensagens |
| **Gateway próprio** (`AI_GATEWAY_URL`, modelo por persona) | a Nina está presa ao `ai.gateway.lovable.dev` |
| **AgentEditor completo** (abas Humanização, Tools, Agendamento, Treinamento, Menu de boas-vindas, Regras de ativação, TestChat, import de documento) | a Nina tem uma textarea + um sheet gerador |
| **Booking do salão, catálogo, cadências, CSAT, push, Instagram, CTWA** | camadas inteiras que a Nina não tem |

**Aviso de fronteira:** booking do CRM (reunião) ≠ agenda do salão (tenant). Todo o material de agendamento da Nina é **agenda de salão** e deve aterrissar na trilha tenant — nunca no `platform_crm`.

---

## 6. Riscos

### 6.1 Propriedade intelectual e licenciamento — bloqueante para cópia literal

| # | Risco | Evidência | Ação |
|---|---|---|---|
| R1 | **Sem licença.** Não há `LICENSE` no repo. Compra ≠ cessão de direitos por default; o escopo do que foi adquirido (uso? fonte? direito de derivar e revender?) não está documentado no repositório | ausência de arquivo de licença; 24 commits de 2026-07-17, sem termo | Confirmar o contrato de compra antes de qualquer merge. Até lá: **extração por transcrição**, não por cópia |
| R2 | **Marca e design system do vendedor embarcados** | `src/design-system/viverdeia/` completo (README, SKILL.md, tokens `--via-*`, previews, marketing kit) + `src/assets/viverdeia/*.svg` (4 logos) | **Nunca copiar.** Se o repo for mantido, remover |
| R3 | **Marca de terceiro embarcada** | `src/design-system/viverdeia/ui_kits/_reference-assina/` — mocks derivados do **Assina.ai**, com aviso no próprio README: *"não copie copy, logo, ou nome"* | idem R2 — risco de terceiro, não do vendedor |
| R4 | **Dados nominais do vendedor no prompt de produção** | `nina-orchestrator/index.ts:1550,1561-1564` (fundadores, investidores, clientes: G4, WEG, V4, Reserva) | Se esse fallback rodar em produção nossa, é afirmação falsa sobre terceiros. Reescrever integralmente |
| R5 | **Identificadores residuais** | `whatsapp_verify_token` default `'viver-de-ia-nina-webhook'` (`20251126124558_…sql:245`) e auto-gerado com prefixo `viver-ia-` no onboarding (`StepWhatsApp.tsx:41-48`); `openai_assistant_id` default `'asst_X8XSK8rxKOLieSVQwOcvQTdZ'` (`:232`); enum `team_assignment` com nomes próprios (`'mateus'\|'igor'\|'fe'`) | Nenhum entra no nosso schema |

### 6.2 Segurança — P0 herdados

| # | Risco | Evidência |
|---|---|---|
| **S1** | **`service_role_key` legível E GRAVÁVEL pelo frontend.** `app_config` guarda a service_role key (a própria descrição do seed diz *"NUNCA exponha em UI cliente"*), mas as policies logo acima dão `SELECT` **e** `FOR ALL` a qualquer `authenticated`, sem checagem de admin — e nenhuma migration posterior corrige. `AppConfigCard.tsx` busca o `value` e o exibe atrás de um toggle. **Escalação direta de privilégio → bypass total de RLS** | `20260525140501_cron_jobs_and_app_config.sql:36-45,50` + `src/components/settings/AppConfigCard.tsx:25-27` |
| **S2** | **Refresh tokens do Google legíveis por qualquer usuário logado** | `google_calendar_credentials` com `FOR ALL TO authenticated USING (auth.role() = 'authenticated')` — `20260522223353_f3_…sql:76-79` |
| S3 | **Chaves de terceiros em texto plano no banco e no DOM.** `elevenlabs_api_key`, `whatsapp_access_token` em `nina_settings`; o front faz `select('*')` e renderiza em `<input type="password">` com botão de revelar. Contido a admins após o hardening de `20260526210715`, mas é chave viva no browser | `20251126124558_…sql:235,243`; `ApiSettings.tsx:165-197,624-643`; `AgentSettings.tsx:88-92` |
| S4 | **API key da ElevenLabs enviada do browser no body** para `test-elevenlabs-tts`, em vez de a function ler do banco | `StepElevenLabs.tsx:104-114` |
| S5 | **`.env` commitado** com `VITE_SUPABASE_PROJECT_ID` / `VITE_SUPABASE_URL` / publishable key do projeto **do vendedor** (`fyhyeypcjszy…`). Chaves públicas por design, mas apontam para infra de terceiro; o README admite: *"O `.env` aponta para o Supabase original do fork"* | `.env` (versionado desde `7fd4dbf`), `supabase/config.toml:1`, `README.md` |
| S6 | **Sem isolamento entre usuários.** Todo `authenticated` lê todos os contatos, conversas, deals, agendamentos, procedimentos e fotos de clientes | `20260521200736_…sql:56-69`; `20260529001254_…sql:37-50`; `…f3_…sql:36-39,110-135` |

S1–S4 violam frontalmente a **Seção 11.1** do CLAUDE.md (chaves nunca no frontend; segredo server-side). É mais um argumento contra reuso de código: **importar o schema da Nina importaria a postura de segurança dela.**

### 6.3 Acoplamentos que impedem porte de código

| # | Acoplamento | Evidência |
|---|---|---|
| T1 | **Lovable AI Gateway** — todo LLM vai para `ai.gateway.lovable.dev` com `LOVABLE_API_KEY`; erro 402 fala em *"créditos do workspace Lovable"* | `nina-orchestrator/index.ts:9`; `generate-prompt/index.ts:228,254`; + `health-check`, `analyze-conversation`, `message-grouper`, `validate-setup` |
| T2 | **Single-tenant estrutural** — sem `organization_id`; settings resolvidos por `.limit(1)` | `20260521200736_…sql:2,32`; `nina-orchestrator/index.ts:207-214` |
| T3 | **Nomes de tabela colidem/divergem** — `contacts`, `messages`, `conversations`, `appointments`, `deals`, `pipeline_stages` existem nos dois lados com colunas diferentes | comparar `src/integrations/supabase/types.ts` com o nosso schema |
| T4 | **`pg_cron` lendo credencial de tabela de aplicação** — `nina_invoke_reminders()` busca URL + service_role em `app_config`; se vazia, **falha em silêncio** (`RETURN NULL`) | `20260525140501_…sql:61-88` |
| T5 | **Prompt duplicado em duas fontes**, com incidente já documentado | `.lovable/plan.md` |
| T6 | **Sem eval de agente** — só 5 specs Playwright de UI; nenhum teste de comportamento de prompt | `e2e/*.spec.ts` |

### 6.4 Risco de processo

- **R6 — Contaminação do worktree.** O clone está em `/private/tmp/claude-501/nina-analise/`. Sob nenhuma hipótese o repo da Nina deve ser copiado para dentro de `SaasPlugin_vite` (worktree compartilhado com outras sessões).
- **R7 — Isto não é um porte.** Pela regra de porte nomeado (Seção 14.3 do CLAUDE.md), não cabe parity-check de contagem origem→destino: é **extração de conhecimento com reescrita**. O controle é checklist de itens (B1..B12, D1..D7) com evidência por item.

---

## 7. Execução proposta

Sequência com critério binário por passo. **Nada aqui está autorizado** — é proposta.

**Fase 0 — destravar (Marcelo)**
1. Confirmar o escopo contratual da compra (uso vs. direito de derivar/revender). → *verifica:* resposta registrada. Se for só uso, a extração fica limitada a ideias, não a texto.
2. Decidir o destino do repo da Nina (arquivar / manter como referência / remover marca de terceiro). → *verifica:* decisão registrada.

**Fase 1 — DUDA (barata, alto retorno)**
3. D1 (few-shot com contra-exemplos) + D2 (scaffold cognitivo). → *verifica:* 5 goldens novos em `tmp-eval-agents/goldens.ts` passando; nenhum golden atual regredindo.
4. D4 (anti-alucinação nas descriptions das tools). → *verifica:* golden "pediu link de pagamento" sem URL inventada em 10/10.
5. D6 (gate de confiança) + D7 (temperatura por fase). → *verifica:* nenhuma movimentação de estágio com confiança < 70 numa janela de 24 h de log.

**Fase 2 — EquipIA, conteúdo (o grosso do valor)**
6. B1+B2+B7 — template `beauty_receptionist` com guardrails clínicos e few-shot. → *verifica:* diante de "estou com manchas no rosto" o agente **não** diagnostica, em 10/10.
7. B3+B4 — taxonomia e campos clínicos em `products.settings`. → *verifica:* serviço criado com `contraindications`/`pre_care`/`post_care` aparece no contexto do agente.
8. B11 — `price_visible` como gate de servidor. → *verifica:* com `price_visible=false`, o preço **não** está no payload enviado ao modelo (asserção sobre o payload, não sobre o output).
9. B5+B6 — templates de lembrete/recall e cadência de reativação. → *verifica:* cadência de 30 d dispara com a copy clínica correta por categoria; `recall_90d` **agendado** (bug §2.M corrigido na nossa implementação).

**Fase 3 — EquipIA, configurador**
10. B9 — 7 campos novos no `AgentEditor`. → *verifica:* salvar e recarregar preserva os 7; o prompt gerado reflete os 7.
11. B10 — template-first + whitelist + sanitizador em `generate-agent-ai`. → *verifica:* 20 gerações seguidas sem markdown vazado, sem variável fora da whitelist, estrutura estável; **e toda variável anunciada na UI resolvida no runtime** (bug §2.M).
12. B12 — debounce, se ainda não existir. → *verifica:* 4 mensagens em 6 s geram **uma** resposta.

---

## Anexo — ordem de leitura recomendada (densidade de valor)

1. `supabase/functions/nina-orchestrator/index.ts` (1851 linhas) — tools, pipeline, prompt B2B, roteamento de modelo
2. `src/prompts/default-nina-prompt.ts` (142) — persona beleza
3. `supabase/functions/generate-prompt/index.ts` (291) — geração template-first + meta-prompt
4. `src/components/settings/PromptGeneratorSheet.tsx` (443) — 14 campos e enums
5. `supabase/migrations/20260522223353_f3_procedures_calendar_reminders_photos.sql` — catálogo, lembretes, templates seed
6. `src/components/settings/ProceduresManager.tsx` (386) + `RemindersManager.tsx` (455) — CRUD e copy operacional
7. `supabase/functions/analyze-conversation/index.ts` (344) — memória / BANT
8. `docs/INTEGRATIONS.md` (134) — contrato de integrações e posicionamento vs. ERP
