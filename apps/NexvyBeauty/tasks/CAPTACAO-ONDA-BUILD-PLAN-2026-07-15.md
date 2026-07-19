# Onda Captação (T1.10) — PLANO DE BUILD executável

> **Data:** 2026-07-15 · **Fonte:** T1.10 do `PLANO-MESTRE-GO-LIVE-2026-07-11.md` (linhas 72-84)
> **Escopo:** C1 + C5 (build) · C2 + C3 (verificar/errata) · C7 + C8 (triviais)
> **Repo:** `/Users/marcelosilva/Projects/GitHub/SaasPlugin_vite/apps/NexvyBeauty`
> **Estado:** READ-ONLY audit — nenhum código foi tocado. Este doc é o hand-off para o agente de build.

---

## ⚠️ Descoberta de escopo que MUDA o plano (ler antes de qualquer coisa)

O menu **Captação** vive no **mundo PLATAFORMA (super_admin)** — `src/components/superadmin/crm/capture/**` + edges `platform-*` + tabelas `platform_crm_*`. **NÃO** é o mundo tenant (`src/components/admin/**`, edges `form-generate-ai`/`quiz-generate-ai`, tabela `forms`).

O menu é montado direto no registry do platform-shell (`src/components/superadmin/platform-shell/registry.tsx`, grupo `vendas-captacao`, linhas 412-469):

| Item nav | id | Componente montado |
|---|---|---|
| Quiz | `v-quiz` | `PlatformCrmQuizManager` (registry:420) |
| Formulários | `v-formularios` | `PlatformCrmFormsManager` (registry:426) |
| Templates/Resultados/Analytics | `v-templates`/`v-resultados`/`v-analytics` | componentes reais (registry:456/462/468) |

**Consequência prática nº1:** o plano-mestre cita as edges como `form-generate-ai` / `quiz-generate-ai` (nomes do mundo tenant). **O alvo real é a versão `platform-`**: `platform-form-generate-ai` e `platform-quiz-generate-ai` (ambas existem, `supabase/functions/`, criadas 07-12). Um agente que ligar a edge tenant vai furar o recorte de plataforma (product-scoped/super_admin, sem `organization_id`).

**Consequência prática nº2:** 2 dos 4 itens investigados **já foram construídos** depois da auditoria de 07-12. C2 e C3 estão prontos — viram *verificação + errata*, não build.

---

## 🔒 Fact-Forcing Gate (4 fatos verificados com arquivo:linha)

| # | Fato | Evidência (arquivo:linha) |
|---|---|---|
| **F1** | **C1 é real e é UI-only.** O dialog "Novo Formulário" oferece só 2 métodos ("Do Zero"/"Template") — falta "Com IA". A edge `platform-form-generate-ai` existe e retorna `{success, blocks, suggested_name}` (mesmo shape da tenant). | `src/components/superadmin/crm/capture/PlatformCrmFormsManager.tsx:489-512` (grid de métodos) · `supabase/functions/platform-form-generate-ai/index.ts:69-80` (body) `:364-368` (retorno) |
| **F2** | **C3 JÁ ESTÁ PRONTO.** O `PlatformCrmQuizManager` (montado em `v-quiz`) abre o launcher com 3 cards (Criar do Zero / **Com IA** / Template); o "Com IA" chama `platform-quiz-generate-ai`. | `PlatformCrmQuizManager.tsx:240-265` (launcher wired) · `quiz/create/PlatformCrmQuizCreateWithAI.tsx:68` (invoke `platform-quiz-generate-ai`) · `registry.tsx:417-420` |
| **F3** | **C2 JÁ ESTÁ PRONTO.** `/f/:slug` → `PublicForm` cai no fallback de plataforma e renderiza `<PlatformCrmPublicForm>`, que submete via `platform-form-submit`. O publish (`PlatformCrmFormPublish`) gera o link `/f/{slug}` real (copy + abrir + embed). Não existe botão "Link público em breve" no mundo plataforma. | `src/pages/PublicForm.tsx:57-60,577-578` (fallback) · `src/pages/PlatformCrmPublicForm.tsx:56,225` (`platform-form-submit`) · `form/PlatformCrmFormPublish.tsx:23` (link) · `form/PlatformCrmFormBuilder.tsx:382` (mounted) |
| **F4** | **C5 é UI-only e reusa componentes que já existem.** O footer do detalhe da resposta só tem "Fechar". Os 3 botões reaproveitam `PlatformCrmCallWithAIDialog`, `PlatformCrmSendCadenceDialog` (props `open/onOpenChange/leadId/productId`) e `PlatformCrmLeadDetail` (`leadId`); a coluna `lead_id` existe na submission (FK). Nenhuma edge nova. | `form/PlatformCrmFormResponseDetail.tsx:10-12` (comentário "v2 não portado") `:269-271` (só Fechar) · `inbox/PlatformCrmCallWithAIDialog.tsx:55-61` · `inbox/PlatformCrmSendCadenceDialog.tsx:28-42` · `src/integrations/supabase/types.ts` (`platform_crm_form_submissions.lead_id`) |

---

## 📊 Resumo executável (o que o build faz)

| Item | Veredito | Arquivo(s) a tocar | Tipo | Esforço | Sinal |
|---|---|---|---|---|---|
| **C1** — Form "Com IA" | **BUILD** | `PlatformCrmFormsManager.tsx` (edit) + `form/PlatformCrmFormCreateWithAI.tsx` (novo) | UI-only (edge+hooks prontos) | **M** | 🟢 UI-only barato |
| **C2** — Link público | **PRONTO → verificar** | — (smoke test) | verificação | P | ⚪ sem build |
| **C3** — Quiz "Com IA"/Template | **PRONTO → verificar** | — (smoke test) | verificação | P | ⚪ sem build |
| **C5** — 3 botões no ResponseDetail | **BUILD** | `form/PlatformCrmFormResponseDetail.tsx` (edit) | UI-only (reusa 3 componentes) | **M** | 🟢 UI-only barato |
| **C7** — Upload do quiz | **BUILD (outlier)** | `quiz/PlatformCrmQuizCategorizedPalette.tsx:200` (+ runtime/bucket p/ versão real) | UI **+ storage** | P–M | 🔴 toca storage |
| **C8** — Comentário stale | **ERRATA** | `PlatformCrmCaptureManager.tsx:14-17` | doc | trivial | ⚪ 1-linha |

**Regra de ouro:** só C1, C5 e C8 tocam código com certeza. C7 é o único que sai do "UI-only barato" (storage). C2/C3 são smoke tests que fecham como errata.

---

## C1 — "Novo Formulário" sem "Com IA"  🟢 UI-only barato

**Onde falta:** `src/components/superadmin/crm/capture/PlatformCrmFormsManager.tsx`, dialog de criação, bloco de métodos em **linhas 489-512** (grid 2 colunas: "Do Zero" + "Template"). Não há botão "Com IA".

**Recursos que JÁ existem (não recriar):**
- Edge `platform-form-generate-ai` — `supabase/functions/platform-form-generate-ai/index.ts`.
  - **Body esperado** (`:69-80`): `{ product_id, objective: 'qualification'|'diagnostic'|'capture'|'presale'|'feedback', tone, num_questions, user_context?, use_brain?=true, use_objections?=true }`.
  - **Retorno** (`:364-368`): `{ success: true, blocks: enhancedBlocks, suggested_name }`.
  - Auth via `authenticatePlatformAgent` — mesmo caminho que o quiz já usa com sucesso (precedente F2), então funciona com o JWT super_admin.
- Hooks de persistência: `useCreatePlatformCrmForm` (já importado no manager, `:69`) + `usePlatformCrmSaveFormBlocks` (`form/usePlatformCrmSaveFormBlocks.ts:21`).
- Referências para espelhar: tenant `admin/forms/FormAIGenerator.tsx:77-110` (handler + shape) e o irmão de plataforma `quiz/create/PlatformCrmQuizCreateWithAI.tsx` (padrão platform já pronto).

**Mudança precisa (UI-only, sem edge nova):**
1. **Novo componente** `src/components/superadmin/crm/capture/form/PlatformCrmFormCreateWithAI.tsx` — espelho de `PlatformCrmQuizCreateWithAI` + `FormAIGenerator`. Props: `{ open, onOpenChange, productId, onCreated(formId) }`. Campos: objetivo (select com os 5 valores), tom, nº de perguntas, contexto, toggles use_brain/use_objections. `supabase.functions.invoke('platform-form-generate-ai', { body })`. No `{success, blocks, suggested_name}`: cria o form via `useCreatePlatformCrmForm` (name = `suggested_name`, product_id), grava os blocos via `usePlatformCrmSaveFormBlocks`, chama `onCreated(newId)`.
2. **Editar `PlatformCrmFormsManager.tsx`:** transformar o grid de métodos (`:492`) em 3 colunas e adicionar o botão "Com IA" (ícone `Sparkles`). Ao clicar, abrir o novo dialog (estado `aiOpen`), passando `productId = newFormProductId || effectiveProductId`. No `onCreated`, `setBuilderFormId(newId)` (abre o builder, igual ao fluxo do quiz que faz `setSelectedId`).

**É UI-only? SIM.** Edge pronta, hooks prontos, nenhuma migration.

**Esforço:** M.

**Check binário:** em `v-formularios` → "Novo Formulário" mostra **3 métodos incl. "Com IA"** → escolher objetivo + gerar dispara `platform-form-generate-ai` (Network **200**) → um form nasce com blocos de IA e o builder abre. `tsc` 0 erros.

---

## C2 — "Link público" (a incerteza do plano)  ⚪ PRONTO → só verificar

**Veredito: já funciona.** A dúvida do plano ("`/f/:slug`+`platform-form-submit` do PR#26 podem já existir → viraria só fiação") — **existem e estão fiados**:
- Rota `/f/:slug` → `PublicForm` (`src/App.tsx:223`). O `PublicForm` tenta o form do salão; se não achar, `setFallbackToPlatform(true)` (`PublicForm.tsx:57-60`) e renderiza `<PlatformCrmPublicForm slug={slug} />` (`:577-578`).
- `PlatformCrmPublicForm` submete via `platform-form-submit` (`src/pages/PlatformCrmPublicForm.tsx:56,225`).
- O publish já produz o link real `/f/{form.slug}` com copiar/abrir/embed (`form/PlatformCrmFormPublish.tsx:23`), montado no builder (`form/PlatformCrmFormBuilder.tsx:382`) atrás do botão "Publicar" (`:203,209,269`).

**O botão morto "Link público em breve" do plano NÃO existe** no mundo plataforma (a string não aparece no código — foi paráfrase de um estado antigo/tenant). **É errata.**

**Residual OPCIONAL (fora desta onda — backlog separado, não bloqueia):** as abas Embed/Widget do publish geram snippets para `/embed/form/:id` + `public/form-widget.js` que **não existem** (rota/asset ausentes); o QR Code é placeholder (`PlatformCrmFormPublish.tsx:203-206`). Nada disso é "form que não publica não capta" — o link direto capta.

**Check binário (smoke):** publicar um form de plataforma (status active) → abrir `/f/{slug}` anônimo → renderiza o runtime de plataforma → enviar → `platform-form-submit` **200** → a submissão aparece em "Respostas". Se passar, fechar C2 como ✅ (errata).

---

## C3 — Novo Quiz sem "Com IA"/"Template"  ⚪ PRONTO → só verificar

**Veredito: já foi construído** (componentes datados 07-12 13:16, após a auditoria). O `PlatformCrmQuizManager` (montado em `v-quiz`, `registry.tsx:420`):
- Botão "Novo Quiz" abre `PlatformCrmQuizCreationLauncher` com 3 cards: Criar do Zero / **Criar com IA** / Usar Template (`PlatformCrmQuizManager.tsx:240-265`).
- "Com IA" → `PlatformCrmQuizCreateWithAI` → `supabase.functions.invoke('platform-quiz-generate-ai')` (`quiz/create/PlatformCrmQuizCreateWithAI.tsx:68`).
- "Template" → `PlatformCrmQuizTemplateLibrary`. "Do Zero" → `PlatformCrmQuizCreateFromScratch`.

**Nota:** existe um duplicado `templates/create/PlatformCrmQuizCreateWithAI.tsx` — **ignorar**; o manager importa o de `quiz/create/`.

**Check binário (smoke):** `v-quiz` → "Novo Quiz" abre launcher com **3 cards** → "Criar com IA" gera via `platform-quiz-generate-ai` (**200**) e abre o builder. Se passar, fechar C3 como ✅ (errata).

---

## C5 — FormResponseDetail sem os 3 botões  🟢 UI-only barato

**Onde falta:** `src/components/superadmin/crm/capture/form/PlatformCrmFormResponseDetail.tsx`. O footer (**linhas 269-271**) só tem "Fechar". O próprio comentário do arquivo (**linhas 10-12**) admite que os 3 atos não foram portados.

**Cada botão → o que chama (tudo já existe no mundo plataforma; ZERO edge nova):**

| Botão | Reusar | Props | Gate |
|---|---|---|---|
| **Chamar com IA** | `inbox/PlatformCrmCallWithAIDialog.tsx` (`:55-61`) | `open`, `onOpenChange`, `lead={ name: leadName, phone: leadPhone }` | sempre (nome/telefone já computados no componente, `:129-130`) |
| **Inserir em Cadência** | `inbox/PlatformCrmSendCadenceDialog.tsx` (`:28-42`) | `open`, `onOpenChange`, `leadId={submission.lead_id}`, `productId` | só se `submission.lead_id` |
| **Ver Lead no CRM** | `leads/PlatformCrmLeadDetail.tsx` dentro de um `<Dialog>` (padrão de `kanban/PlatformCrmKanban.tsx:339`) | `leadId={submission.lead_id}` | só se `submission.lead_id` |

**Mudança precisa (UI-only):**
1. No `PlatformCrmFormResponseDetail.tsx`: adicionar estados (`aiOpen`, `cadenceOpen`, `leadOpen`) + imports dos 3 componentes.
2. Reescrever o footer (`:269-271`) para 3 botões (condicionais em `submission.lead_id` para Cadência/Ver-Lead; "Chamar com IA" sempre).
3. Montar os 3 dialogs no fim do componente.
4. Atualizar o comentário stale (`:10-12`) para refletir que foi portado.

**Dado disponível:** `submission` é `PlatformCrmFormSubmission = Tables<'platform_crm_form_submissions'>` com `lead_id` (FK) — vem do pai `PlatformCrmFormResponses`. `leadName`/`leadPhone` já resolvidos por heurística no componente.

**É UI-only? SIM.** Reusa 3 componentes + 1 tabela existentes. Nenhuma edge/migration.

**Esforço:** M.

**Check binário:** "Respostas" → abrir uma resposta → footer mostra **3 botões**. Com `lead_id`: "Inserir em Cadência" grava linha em `platform_crm_cadence_enrollments`; "Ver Lead" abre o detalhe do lead; "Chamar com IA" abre o dialog de ligação. `tsc` 0 erros.

---

## C7 — Upload do quiz = placeholder  🔴 toca storage (outlier da onda)

**Onde:** `src/components/superadmin/crm/capture/quiz/PlatformCrmQuizCategorizedPalette.tsx:200` — o subtipo `upload` mapeia para `input_type='text'` com `placeholder='Anexar arquivo (em breve)'`. Não sobe arquivo.

**Este é o ÚNICO item que sai do "UI-only barato"** — upload real exige: (a) bucket no Supabase Storage, (b) handler de upload no runtime público do quiz (`src/pages/PublicQuiz.tsx`), (c) render do campo de arquivo no builder. Prioridade "baixa" no plano.

**Duas rotas — o build escolhe conforme o apetite da onda:**
- **Barata (honesta, mantém UI-only):** trocar o placeholder para algo verdadeiro (ex.: "Upload de arquivo — em desenvolvimento") e não prometer o que não faz. Fecha o gap cosmético sem storage.
- **Completa (recomendada só se a onda aceitar storage):** criar bucket `quiz-uploads`, `input_type='file'`, upload no `PublicQuiz`, salvar a URL na resposta.

**Recomendação:** se a onda é "UI-only barato", fazer a rota barata agora e abrir card separado para o upload real. **Sinalizado como o item que quebra a homogeneidade da onda.**

**Check binário (rota barata):** o campo de upload no builder do quiz não diz mais "em breve" de forma enganosa. **(rota completa):** no quiz público, anexar um arquivo persiste no bucket e a URL aparece na resposta.

---

## C8 — Comentário stale  ⚪ errata 1-linha

**Onde:** `src/components/superadmin/crm/capture/PlatformCrmCaptureManager.tsx:14-17` — o comentário diz `v-templates / v-resultados / v-analytics: TODO(edge)`. **Duplamente stale:** (1) o registry monta componentes reais (`PlatformCrmCaptureTemplatesLibrary` registry:456, `PlatformCrmCaptureResultsSection` :462, `PlatformCrmCaptureAnalyticsTab` :468); (2) esses itens nem passam mais por `PlatformCrmCaptureManager` (o registry monta os componentes direto).

**Mudança:** remover/atualizar a linha do TODO. Antes de editar, o build dá um olhar nos 3 componentes para confirmar que são reais (o Templates já tem empty-state honesto "Em breve", `templates/PlatformCrmCaptureTemplatesLibrary.tsx:121`).

**Check binário:** `grep "TODO(edge)"` no arquivo não retorna a linha dos 3 menus.

---

## 🧭 Ordem de execução sugerida

1. **C8** (errata 1-linha) — aquece, zero risco.
2. **C5** (UI-only, alto valor operacional) — reusa 3 componentes prontos.
3. **C1** (UI-only, é o exemplo do Marcelo) — novo dialog + botão, edge pronta.
4. **Verificar C2 e C3** (smoke tests) — fechar como ✅/errata; **não** reconstruir.
5. **C7** por último — decidir rota barata vs storage; se storage, tratar como card à parte.

## ⚠️ Armadilhas (para o agente de build não repetir a auditoria)
- **NÃO** ligar as edges tenant `form-generate-ai`/`quiz-generate-ai` — o alvo é `platform-form-generate-ai`/`platform-quiz-generate-ai`.
- **NÃO** tocar `src/components/admin/**` (mundo tenant/salão) — Captação é 100% `superadmin/crm/capture/**`.
- **NÃO** reconstruir C2/C3 — já existem; só verificar.
- **NÃO** criar edge nova para C1/C5 — todas existem.
- Ignorar o duplicado `templates/create/PlatformCrmQuizCreateWithAI.tsx` (o vivo é `quiz/create/`).
