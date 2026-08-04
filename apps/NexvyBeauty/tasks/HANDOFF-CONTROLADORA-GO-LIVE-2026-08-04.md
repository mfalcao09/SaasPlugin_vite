# HANDOFF — Controladora NexvyBeauty GO-LIVE
### 2026-08-04 · sessão `b2962cc4-9e0b-4e1b-be1c-6dc04ff527a6` → sessão nova (outra conta Claude Code)

> **Motivo:** limite semanal esgotando. **Nada está pela metade.** Tudo que está no ar foi verificado lendo do servidor, não do worktree.
> **Leia até o fim antes do primeiro tool-call.** As seções §7 e §8 são as que impedem repetir erros que custaram caro hoje.

---

# 1. QUEM VOCÊ É

Você é a **Controladora da frente GO-LIVE do NexvyBeauty**. O papel, definido pelo Marcelo:

- **Não codar por impulso.** Verificar o que as sessões-filhas alegam, medindo de forma independente.
- **Ratificar ou corrigir** decisões cruzadas entre frentes.
- **Levar ao Marcelo só o que só ele pode decidir.**
- **Orquestrar por subagentes** e auditar cada entrega antes de aceitar.

**Modo Conselheiro** (CLAUDE.md §13): nunca começar concordando · etiquetar confiança **[Certo] / [Provável] / [Palpite]** · verdade desconfortável primeiro · **nunca fabricar discordância** só para cumprir a regra (§13.1).

**Idioma:** português brasileiro. **Tom:** direto, sem bajulação, sem preâmbulo.

---

# 2. AS TRÊS SESSÕES VIVAS

| Sessão | sessionId (roteável) | Escopo |
|---|---|---|
| **Controladora GO-LIVE** (você) | `local_78dacaec-755e-4bc6-b527-670e8abaa916` | SDR Duda · inbound API oficial · orquestração |
| **Criação do BDR** | `local_9af8ac86-36f2-4aa2-a0d5-849e184b693d` | BDR Camila · canal Evolution · prospecção ativa |
| **Anúncios NexvyBeauty** | `local_7a00e7fb-5b2b-4ecf-b302-c159d6f2d325` | Meta Ads · criativos · verba |

Comunicação via `mcp__ccd_session_mgmt__send_message`. **Triangulada, nunca 1:1 sobre decisão compartilhada.**

⚠️ **sessionId roteável ≠ id do workspace do harness** (o do path do scratchpad). Publicar o do scratchpad manda mensagem pro vazio, **sem erro nenhum**.

**Despacho:** sessão-irmã NUNCA cria chip/spawn_task/sessão para achado fora do escopo dela → **relata à controladora**.

---

# 3. INFRA — o essencial

```
Supabase project   fzhlbwhdejumkyqosuvq
produto            806b5975-e268-402e-a65c-9e9503271041   "NexvyBeauty"
produto DEMO       9cc5102e-20b4-4572-958e-76205174f98b   "Studio Flor"  ← NUNCA tocar
repo               /Users/marcelosilva/Projects/GitHub/SaasPlugin_vite
app                apps/NexvyBeauty
branch             feat/bdr-autonomo   ⚠️ COMPARTILHADO com a sessão BDR

domínios           nexvybeauty.com.br (apex) · /vendas → MESMO componente (App.tsx:263)
                   app.nexvybeauty.com.br · gestao.nexvy.tech (canônico do gestão)
WhatsApp Vendas    +55 11 95502-1205
  connection_id    1f7ca6e3-a846-493d-908e-b6d74ccf8c84
  phone_number_id  1239336002593934
  template         boas_vindas_ativacao
```

**Deploy de edge function:** `supabase functions deploy <slug> --project-ref fzhlbwhdejumkyqosuvq`, rodando de `apps/NexvyBeauty`.

⚠️ **Função grande com `_shared` sobe por CLI, NUNCA pelo MCP de deploy** — o MCP exige reconstruir todos os arquivos no contexto, e uma truncagem silenciosa sobe código quebrado. O CLI empacota do disco e preserva o `verify_jwt` do `config.toml`.

---

# 4. ESTADO VERIFICADO — medido agora, lendo do servidor

## 4.1 No ar

```
platform-sales-brain   v80   ACTIVE   ← verificado no servidor, não no worktree
  ✅ claim INCONDICIONAL + hand-back            brain_claim_at 4 · handback 10
  ✅ anti-repetição preservado                  jaDito 4 · BOLHA REPETIDA SUPRIMIDA 1
  ✅ canal agnóstico (sessão BDR) preservado
       whatsapp_evolution  5 linhas / 6 ocorrências   ⚠️ ver nota abaixo
       BRAIN_CHANNELS 2 · deliverViaEvolution 2 · sendEvolutionPresence 2
       (baseline medido 04/08 · NÃO é alvo — é o estado a preservar)
  ✅ âncora temporal de preço MORTA
       'preço de lançamento'   0
       'sobe para o de tabela' 0
       'sobe em breve'         2  ← só comentários que EXPLICAM a remoção
       'hoje sai por'          5  ← preço comparado do presente
  ✅ guard de negação no sanitizeReply           const NEG 1
  CONTROLE NEGATIVO 'zxqvw' 0 → o detector discrimina

platform-meta-whatsapp-webhook       v50   (áudio: transcrição Gemini + player + Storage + CSP)
platform-cold-outreach               v22
platform-start-whatsapp-conversation v28
platform-evolution-webhook           v45
```

## 4.2 Banco

```
knowledge_base   13.811 chars · md5 7572b1ea      (era 3.939 · a695dff2)
backup           bkp_agents_pre_pr3_20260804 (7 agentes) → reversão em 1 linha

agentes ATIVOS no WhatsApp:
  Duda         [sdr]        model=anthropic/claude-sonnet-5   ← ganha o roteamento
  Camila       [prospector] model=google/gemini-2.5-flash
  Lia          [support]    model=NULL   🔴 recebe a cliente logo após o pagamento
  Nina         [retention]  model=NULL
  Orquestrador [custom]     model=NULL
  Ativação     [custom]     model=NULL
INATIVA: Bia [closer] — desativada, NUNCA deletada (é a reversão da PR-3)

12 conversas · 325 mensagens · 8 leads
4 conversas ÓRFÃS (lead_id NULL) — todas COM telefone, uma com 56 mensagens
cakto_orders: 2 pagos · 0 com lead_id  🔴
159 mensagens nas últimas 24h
```

## 4.3 Git

```
branch feat/bdr-autonomo · 4 commits à frente do remoto · NADA EMPURRADO
  a6e98fb  guard de negação no sanitizeReply — ele invertia a frase certa
  a02cff5  docs PR-3 (aplicada) + PR-2c contrato do sinal de pagamento
  73af4ef  mata a âncora temporal de preço no cérebro
  5aed1c8  PR-2b corrida no cérebro + PR-4 seleção de LLM por agente
```

⚠️ **16 arquivos não commitados que NÃO são da controladora** (6 modificados + 10 untracked): trabalho vivo da sessão BDR + um trio órfão de 08-03 (`EvolutionInstancesPanel`, `PlatformCrmEvolutionInstancesPanel`, `platform-evolution-proxy`). **Qualquer `git add -A` os leva junto.**

---

# 5. O QUE FOI ENTREGUE — PRD do SDR, 6 PRs

Canônico: `apps/NexvyBeauty/tasks/PRD-SDR-DUDA-2026-08-04.md` (+`.html`).
Par: `PRD-BDR-CAMILA-2026-08-04.md` — **seções A e C byte-idênticas** nos dois por acordo. Mudar uma exige espelhar a outra.

| PR | O que era | Estado |
|---|---|---|
| **PR-2** | separar efeito da REGRA #0 vs base nova | ✅ baseline `0/3` pré → `2/4` pós (marco 17:53:18 BRT) |
| **PR-2b** | corrida entre invocações do cérebro | ✅ no ar · claim incondicional + hand-back |
| **PR-1** | reescrever `knowledge_base` (331 KB → ≤15 KB) | ✅ gravada 13.811 chars · **+ a metade do código** |
| **PR-3** | unificar Duda + Bia | ✅ aplicada · Duda absorveu fechamento · Bia inativa |
| **PR-4** | ligar `aiModelsCatalog` no `AgentEditor` | ✅ commitada · **front NÃO deployado** |
| **PR-2c** | contrato do sinal de pagamento | ✅ documento · buraco do `lead_id` nomeado |
| **PR-5** | identidade de lead (`phoneVariantsBR` + `merged_into`) | ⛔ **BLOQUEADA — falta palavra separada do Marcelo** |

**Fora do PRD:** guard de negação no `sanitizeReply` — defeito vivo, atingia **100% das negações**.

### A causa-raiz que ordenou tudo

Verbatim do Marcelo sobre os 7 leads de segunda: *"cliente chegou perguntando sobre o sistema, Duda foi direto para questionamento de qualificação, não respondeu a dúvida"*.

**Medição derrubou o diagnóstico:** a REGRA #0 funcionava. O que queimou os leads foi (a) **áudio não transcrevia** — Francisco perdeu 8 áudios, Eraldo 4 — e (b) **corrida**: texto + áudio com 1,7s de intervalo geraram duas invocações paralelas, 7 bolhas em 39s, duas saudações, pergunta repetida com diferença de **uma vírgula**. Os dois estão corrigidos.

---

# 6. O QUE TRAVA COM O MARCELO — leve isto, nada mais

| # | Decisão | Por que é dele |
|---|---|---|
| **1** | **PR-5 — identidade de lead** | Muda dado em produção com lead entrando. Sem ela o `lead_id` de `cakto_orders` segue nulo e a travessia Camila→Lia não fecha |
| **2** | **`model` da Lia** | Hoje `NULL → env AI_SALES_BRAIN_MODEL → google/gemini-2.5-flash`. Torná-lo explícito **MUDA** o que vale, com efeito em custo. Duda está em `claude-sonnet-5` |
| **3** | **push + deploy do front** | 4 commits locais · 16 arquivos de terceiros no worktree entrariam junto |
| **4** | **golden suite** | `tmp-eval-agents/goldens.ts` (linhas 103, 322, 341-343, 469-499) **ainda exige a âncora temporal revogada** — vai reprovar o comportamento correto. Não sei se roda em CI |
| **5** | **gramática do `sanitizeReply`** | A substituição troca substantivo por oração e ignora artigo/concordância: *"consigo um a conta da recuperação especial"*. Exige concordância ou **regenerar** em vez de reescrever. **Arquitetura, não patch** |
| **6** | **`prohibited_phrases` nos 4 agentes em zero** | **Melhoria, NÃO trava** (ver §7.6). A Lia é a que eu olharia primeiro |
| **7** | **trio órfão de 08-03** | 3 arquivos Evolution modificados há dias, testados com `deno check` verde, sem dono. Entram ou voltam? |

---

# 7. AS REGRAS DA CASA — o mais valioso deste documento

Cada uma nasceu de um erro real desta madrugada e custou trabalho perdido ou alarme falso.

### 7.1 Nenhum reporte vira verdade sem 2ª medição independente
E **quem mede não pode ser quem escreveu.** "Corrigi / deployei / está no ar" é **alegação**. Ler do **servidor** (não do worktree), `ls-remote` (não `git log`), `SELECT` (não a migration).

### 7.2 Todo detector precisa de CONTROLE POSITIVO na mesma medição
Sem ele, *"zero"* é indistinguível entre **não existe** e **não medi direito**. Hoje um `grep` quebrado por aspas do zsh quase virou o alarme *"os anúncios apontam para uma rota inexistente há semanas"* — era falso.

### 7.3 🔴 CORREÇÃO NA CAMADA ERRADA — *"vitória verificável na camada que não decide"*
**O erro mais caro do dia.** Removi 3 âncoras de preço da `knowledge_base` e declarei vitória. A medição pós-correção dava **"0 âncoras na base"** — verdadeiro, verificável, reprodutível. **E irrelevante:** o código as reinjetava em 5 pontos, dois deles **reescrevendo a saída do modelo depois dele**.

**Antídoto:** quando você corrige uma **fonte de dados** e o consumidor é **código**, pergunte **"o que roda DEPOIS disto?"** antes de declarar. Pós-processamento, regras injetadas mais tarde e defaults de fallback são todos posteriores à fonte — e todos vencem.

A âncora morava em **quatro camadas**: memória → persona → prompt de sistema → pós-processamento. **Matar em três dá exatamente a mesma frase na boca da agente.**

### 7.4 Cobertura completa com o EIXO errado convence mais que amostra
Classifiquei 6 chamadores de `phoneVariantsBR` por *"tem o remendo?"* quando o critério que decide é *"contra qual convenção compara?"*. O laudo ia mandar consertar 2 arquivos **corretos**. Amostra levanta suspeita natural; inventário de 6 em 6 não levanta nenhuma.

### 7.5 O detector que pune a PROIBIÇÃO junto com a INFRAÇÃO
**Quatro vezes hoje.** Uma base bem escrita diz *"NUNCA diga que o preço vai subir"* — e o detector de `vai subir` a reprova. **Quanto melhor escrita a persona, mais o detector reprova.** Toda varredura de frase banida precisa **excluir a janela de proibição** (`NUNCA|PROIBIDO|jamais|não diga|sem` num raio de ~40 chars).

**E a versão grave:** o mesmo erro **dentro de um mecanismo** custa a conversa, não o relatório. Era o caso do `sanitizeReply` — corrigido no v80.

### 7.6 `prohibited_phrases` NÃO é trava
```
:1563  select da persona
:1770-1771  .map(p => `- ${p}`).join('\n')
:1794  ${prohibited ? `\nFRASES PROIBIDAS (nunca use):\n${prohibited}` : ''}
consumo fora da montagem do prompt: NENHUM
```
É **instrução estruturada** — mais robusta que prosa solta (campo dedicado, título com peso posicional), **desobedecível como qualquer instrução**. Chamá-la de trava instala no repositório o padrão que estamos combatendo: **símbolo com a forma da garantia e sem a garantia**.

**Trava de verdade = pós-processamento da saída.** A máquina já existe (`sanitizeReply`, `:722`, chamada em `:2043`) — é acrescentar par na tabela, não construir arquitetura.

> **A ironia que fecha o dia:** o único mecanismo real deste cérebro foi construído **para impor uma mentira** sobre preço, e nunca foi usado para impor uma verdade. *O que existia era mecanismo e desonesto; o que sobrou é honesto e sem mecanismo.*

### 7.7 `created_at` NÃO é o relógio do mundo
`platform_crm_messages.created_at` tem `DEFAULT now()` — é o instante do **insert**. O relógio do WhatsApp é **`metadata.wa_timestamp`**, e é dele que `inboundEpochMs()` lê. Medido: **+12s de diferença**. Com transcrição de áudio, a mensagem de `wa_timestamp` **anterior** vira linha ~12s **depois** — a ordem não fica imprecisa, fica **invertida**.

⚠️ **Backfill reescreve conteúdo in place e mantém o carimbo antigo** → análise pré-vs-pós por timestamp **não vale** em tabela reescrita.

### 7.8 Proteção que cobre um caminho e deixa o outro aberto
*"é mais perigosa que nenhuma, porque a metade coberta convence"* — formulação da sessão BDR. O guarda anti-corrida vivia dentro de `if (ageMs < DEBOUNCE_MS)`; qualquer latência de início (transcrição, retry, cold start, fila) passava por baixo. **Claim/lock nasce INCONDICIONAL**, fora de todo `if` de idade, canal ou latência. E **perdedor SAI, não espera a vez** — mas precisa devolver o bastão (hand-back), senão troca resposta dobrada por **silêncio**, que é pior.

### 7.9 Memo é fonte; fonte desatualizada contamina todo derivado
A sessão BDR quase reintroduziu a âncora porque a spec **na memória dela** era anterior à correção. Quando uma decisão muda em conversa, **a correção precisa voltar ao artefato de onde ela será lida de novo** — senão o próximo agente reintroduz o erro citando a nossa própria spec.

⚠️ **A Bia é essa armadilha viva:** texto preservado no banco, com âncora **e** com a palavra "garantia". **Estado congelado pré-decisão, NÃO referência viva.** Quem a ler como template de fechamento importa os dois defeitos.

### 7.10 Corrigir um caso não autoriza propagar a correção
Achei um erro de fuso numa citação da sessão de Anúncios e inferi que **todo** o eixo do tempo dela estava deslocado. Não estava — e isso pôs o marco errado no meu PRD (usei `22:20`, o último deploy, em vez de `17:53`, o que levou a REGRA #0).

### 7.11 Testar concorrência com atraso artificial no INSERT
Duas mensagens rápidas exercitam justamente o caminho que o guarda cobre. **É o teste que passa sem provar nada.**

### 7.13 `grep -c` conta LINHAS · `.count()` conta OCORRÊNCIAS — declare qual
**Aconteceu duas vezes hoje, e uma delas quase virou correção errada neste handoff.**

```js
channel: conversation.channel === 'whatsapp_evolution' ? 'whatsapp_evolution' : 'whatsapp_cloud'
                                  ↑ 1ª                    ↑ 2ª   — MESMA LINHA
```
`grep -c` → **5** · python `.count()` → **6**. Nenhum errado; denominadores diferentes.

A sessão BDR mediu 5 no worktree, eu medi 6 no bundle do servidor, e ela reportou o handoff como tendo número errado. **Se eu tivesse "corrigido" sem investigar, teria trocado um número certo por outro certo e perdido a informação de que são medidas distintas.**

**Regra:** número de marcador em documento vem sempre com **método e fonte** — `grep -c` (linhas) ou `.count()` (ocorrências), worktree ou servidor. Sem isso, o próximo a medir conclui que alguém apagou trabalho.

### 7.14 🔴 A ressalva que se arquiva é a mais perigosa que existe
Formulação da sessão BDR, e é a mais desconfortável do dia:

> *"Ela já passou pelo filtro de 'isso pode ser problema' e foi rebaixada por quem tinha contexto pra rebaixar. Ninguém volta nela. **A etiqueta de 'nomeada' faz parecer tratada.**"*

**Caso real:** eu registrei *"substituição cega no `sanitizeReply` não entende contexto — não medi se acontece"* como **pendência nomeada**. A sessão BDR foi medir: acontecia em **100% das negações**, em produção, e o prompt que eu mesma escrevi **obrigava** a Duda a produzir a frase que era destruída.

**Antídoto:** ao escrever "pendência nomeada" ou "não medi", pergunte **"quanto custa medir agora?"**. Se a resposta for minutos, **meça** — a etiqueta é para o que custa caro, não para o que dá preguiça.

### 7.15 Divergência entre duas medições honestas é PERGUNTA, não erro
Formulação da sessão BDR, no último ato do dia, depois de ela mesma cair nela:

> *"Divergência entre duas medições honestas quase nunca é 'uma está errada' — é **'estão medindo coisas diferentes'**. Eu tratei como erro; tu trataste como pergunta."*

**O caso:** ela mediu `whatsapp_evolution` = 5, eu medi 6, e ela reportou o handoff como tendo número errado — com razão aparente, boa-fé e a medição dela correta. Eu fui investigar em vez de corrigir. Eram linhas × ocorrências.

**Se eu tivesse "corrigido"**, o handoff sairia com `5` sem qualificar o método, e a sessão nova — medindo com `.count()` — acharia 6 e reabriria exatamente a caça que o alerta dela pretendia evitar. **A correção teria criado o problema que ela estava prevenindo.**

**Regra:** duas medições honestas que discordam → **primeiro achar o denominador de cada uma**, e só depois decidir se alguma está errada. Reconciliar antes de entender é como se troca um número certo por outro certo, perdendo a informação que estava na diferença.

### 7.12 Só se corta a partir do FIM
Quando uma peça encolhe num formato, cortar do meio quebra sequência (pergunta sem resposta). Cortar do fim é elipse — o leitor preenche e nada fica mentindo. Vale para arte, log e histórico de conversa.

---

# 8. ARMADILHAS OPERACIONAIS CONCRETAS

### 8.1 🔴 Worktree e ÍNDICE GIT compartilhados com a sessão BDR
Mesmo diretório, mesmo branch. **`git add` escreve num índice compartilhado.**
- **NUNCA** `git add -A`, `git add .`, `git commit -a`.
- **Sempre listar arquivo por arquivo.**
- **E conferir o conteúdo do arquivo antes de commitar** — listar o arquivo não basta quando o arquivo contém duas autoras.
- **`stat` no arquivo antes de lançar subagente** em território compartilhado: modificado nos últimos minutos → pergunte antes.

### 8.2 Fact-Forcing Gate
Um hook exige, antes de `Write`/`Edit`/primeiro `Bash`: (1) quem referencia o arquivo, (2) confirmar que não existe equivalente, (3) campos/dados tocados, (4) **citar a instrução do usuário verbatim**. Dispara também em comandos **read-only** cujo *padrão de busca* contenha `DELETE`/`DROP`/`UPDATE` — nesse caso explique que é leitura e siga.

### 8.3 `push origin main` de worktree em outro branch é no-op SILENCIOSO
Use `git push origin HEAD:main` e confirme com `git ls-remote`.

### 8.4 zsh quebra `grep --include=*.tsx` sem aspas
Falha com `no matches found` e devolve **vazio** — indistinguível de zero resultados.

### 8.5 Roteamento de agente é acoplado a STRING
`agent_type='sdr'` é **a única coisa** que segura a conversa da Duda. Trocá-lo ou renomeá-la derruba o match → `no_persona` → **o número de vendas fica MUDO**.
`activation_priority` e `activation_keywords` são **colunas mortas** — nenhuma edge function as lê.
⚠️ `isCloserAgent` casa qualquer nome contendo **"bia"** — uma futura "Bianca" ou "Fabiana" herdaria conversa por acidente.

### 8.6 Segredos
**Nunca imprimir valor de secret.** Verificar por presença/tamanho. `OPENAI_API_KEY` está **REVOGADA (401)** — não usar; a transcrição de áudio hoje é **Gemini**.
⚠️ **Nunca colocar placeholder de secret dentro de bloco ```bash** — o botão Run já transformou um placeholder em secret real.

### 8.7 Gates de operação (não são código)
- **Gate G:** nenhum disparo a lead real no **outbound** antes de um ciclo completo provado. O **inbound está vivo** por decisão do Marcelo.
- **Duplo gate do motor:** `campaign.dry_run=true` + env `COLD_OUTREACH_ENABLED`.
- **Cofounder: DORMENTE** por ordem do Marcelo. Nenhuma sessão mexe.

### 8.8 Relatórios sempre em `.md` + `.html` pareados
Regra canônica do CLAUDE.md §4. Exceção: arquivos de memória/índice.

---

# 9. A RESSALVA QUE VALE MAIS QUE TODO O RESTO

**Nada disso foi exercitado por lead real.**

- A corrida **não viu uma rajada** desde o conserto.
- A base nova **não atendeu ninguém**.
- A Duda unificada **não fechou uma venda**.
- O guard de negação **nunca rodou numa conversa de verdade**.
- Os 3 checks binários da PR-2b **não rodaram em runtime** — a semântica do claim foi exercitada em tabela temporária; concorrência real **ninguém mediu**.

**Foram entregues defeitos FECHADOS, não defeitos PROVADOS AUSENTES.** A diferença é exatamente a que derrubou a declaração de vitória sobre a âncora de preço.

**A primeira coisa a fazer quando um lead real chegar:** medir em `platform_crm_messages` se a REGRA #0 foi obedecida (explicação funcional **antes** de qualificação) e se houve saudação dupla ou pergunta repetida.

---

# 10. COMO ABRIR A SESSÃO NOVA

```
1. Ler este documento inteiro.
2. Anunciar às duas sessões irmãs que a controladora mudou de sessão,
   com o novo sessionId.
3. NÃO commitar, NÃO empurrar, NÃO deployar antes de medir —
   o estado pode ter mudado desde 2026-08-04.
4. Rodar a auditoria consolidada (§4) e comparar com os números daqui.
   Divergência = alguém mexeu. Investigar ANTES de agir.
5. Levar ao Marcelo as 7 decisões da §6. Nada além disso.
```

**Primeira pergunta ao Marcelo, se ele não disser nada:**
> "Chegou lead real desde ontem? Se sim, quero medir a REGRA #0 e a corrida antes de qualquer outra coisa."

---

## Documentos de referência no repo

```
apps/NexvyBeauty/tasks/
  PRD-SDR-DUDA-2026-08-04.md|.html            ← o PRD desta frente
  PRD-BDR-CAMILA-2026-08-04.md|.html          ← o par (§A e §C byte-idênticas)
  PR3-UNIFICACAO-DUDA-BIA-2026-08-04.md|.html
  PR2c-CONTRATO-SINAL-PAGAMENTO-2026-08-04.md|.html
  BACKUP-knowledge_base-…-pre-PR1.md          ← rollback da PR-1, md5 a695dff2
  KNOWLEDGE-BASE-DUDA-v2-2026-08-04.md        ← o texto que está no banco
```

## Memória (namespace `-Users-marcelosilva-Projects-GitHub`)

```
MEMORY.md                                                        ← índice, ~17 KB
reference_cobertura_completa_eixo_errado_2026-08-04              ← §7.3 §7.4 §7.10
reference_created_at_nao_e_instante_de_visibilidade_2026-08-04   ← §7.7
feedback_reporte_exige_segunda_medicao_independente_2026-08-01   ← §7.1
reference_defeito_de_costura_contrato_entre_frentes_2026-08-01
reference_deploy_beauty_pull_e_gate_antiphantom_2026-08-01
```

⚠️ O `MEMORY.md` está a **~58 bytes do teto** de 17,1 KB. Memo novo entra como **seção de memo existente**, não como arquivo + linha nova no índice.

---

*Cinco achados grandes nesta madrugada. Em nenhum deles quem viu foi quem escreveu.*
