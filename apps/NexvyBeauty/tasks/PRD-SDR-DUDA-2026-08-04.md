# PRD — SDR Duda (inbound, API oficial)
### NexvyBeauty · 2026-08-04 · sessão Controladora GO-LIVE

> **Status:** aguardando GO do Marcelo. **Nada implementado.**
> **Par:** `PRD-BDR-CAMILA-2026-08-04.md` — seções A e C são **byte-idênticas** nos dois por acordo. Mudança em uma exige espelhar na outra.

---

## 0. O problema, dito pelo dono

Verbatim do Marcelo, 2026-08-04, sobre os 7 leads de segunda-feira:

> *"cliente chegou perguntando sobre o sistema, Duda foi direto para questionamento de qualificação, não respondeu a dúvida"*

E antes, sobre a causa:

> *"Nosso sistema É SUPER robusto, e o nosso atendimento está resumindo em RAIO-X… parece que não conhece o sistema (e de fato, se não construímos isso no prompt, na base de conhecimento dela, ela nunca vai saber como explicar)"*

**7 leads, nenhum atendido com qualidade.** Ele assumiu os atendimentos à mão.

### A distinção que ordena este PRD

O prompt **já manda** responder primeiro e explicar o produto (REGRA #0 + bloco "O QUE É O NEXVYBEAUTY", ambos em produção desde 03/08). **A Duda não tem o que explicar** — a base que o cérebro lê não descreve o sistema.

```
knowledge_base atual: 3.939 chars
  raio-x ✅   agenda ✅   AGENTES DE IA ❌   COMISSÕES ❌   PACOTES ❌
conteúdo: posicionamento e preço. Zero descrição funcional.
```

**Mandar explicar sem dar o que explicar produz exatamente o que ele viu:** a agente cai no único assunto que domina — o Raio-X.

### ⚠️ ERRATA — a premissa original deste PRD foi derrubada

A 1ª versão deste documento dizia que REGRA #0 "nunca foi exercitada por lead real". **É falso.** Duas sessões mediram independentemente (BDR e Anúncios) e eu confirmei: em 03/08, às 21:00:26 BRT, a Duda explicou o produto **antes** de qualificar. **REGRA #0 funciona.**

O que de fato queimou os 7 leads foram **dois defeitos de execução, não de instrução**:
1. **áudio não transcrevia** até 03/08 21:49:36 BRT — Francisco perdeu 8 áudios, Eraldo 4, a Duda repetiu *"não consegui ouvir"* 6×, o Marcelo assumiu à mão. **Corrigido e provado** (4 áudios do caminho vivo, com transcrição e player).
2. **corrida:** texto + áudio com 1,7s de intervalo dispararam duas invocações paralelas do cérebro → 7 bolhas em 39s, duas saudações, pergunta repetida. **NÃO corrigido** → PR-2b.

A causa raiz que este PRD ataca (a base não descreve o sistema) **continua real e continua sendo a PR-1** — mas ela não é a explicação dos 7 leads. Registrar a diferença é o que impede a PR-1 de receber crédito por um conserto que não é dela.

---

## 1. Escopo

**Dentro:** conhecimento do produto no cérebro · unificação Duda/Bia · seleção de LLM por agente · identidade de lead no inbound oficial · conversas órfãs.

**Fora:** canal Evolution e persona Camila (PRD do BDR) · Cofounder (**dormente por ordem do Marcelo**) · aprovação de leads e disparo em massa (operação do BDR).

**Contrato compartilhado com o BDR:** cérebro único · `products.knowledge_base` como fonte · seções A e C byte-idênticas · anunciar antes de ato em produção · 2ª medição por quem não escreveu.

---

## 2. Seção A — ÂNCORA DE PREÇO *(byte-idêntica no PRD do BDR)*

### Fato medido — duas medições independentes
```
public_plans.list_price_monthly EXISTE, preenchido, já lido em runtime
  Essencial 275 → 450   (+64%)
  Premium   427 → 720   (+69%)
  Ultra     693 → 1190  (+72%)
  Trial e Teste E2E: NULL — correto, não são públicos
```

### Decisão do Marcelo (2026-08-04)
> **Não existe data de subida.**

### Consequência — regra final
```
âncora TEMPORAL            ❌ NÃO USAR, em nenhuma das duas agentes
                              sem data, "vai subir" é a escassez falsa que a base proíbe
delta como PREÇO COMPARADO ✅ "o plano custa 450, hoje sai por 275"
                              fato do PRESENTE, verificável na página de preços
                              não promete nada sobre o futuro → não pode ser desmentido
campo price_anchor_until   ❌ FORA DE ESCOPO — sem data, não há o que guardar
```

**Momento** (mesma regra, gatilho por funil): preço só entra **depois de a lead ter um número dela**.
- SDR: depois de a lead dizer carteira **ou** ticket, ou depois do Raio-X.
- BDR: depois do Raio-X.

⚠️ **No SDR, preço é a ÚLTIMA ferramenta.** A Duda já foi flagrada trocando *"explicar o produto"* por *"criar pressa"*. Antes de a lead ter referência de valor, preço é ruído.

**Se um dia existir data:** a regra volta a valer com `price_anchor_until` em config (nunca em prosa — prosa apodrece e vira mentira verificável), default silencioso, e a obrigação de **cumprir** — âncora não cumprida queima a credibilidade da próxima frase.

---

## 3. Seção C — IDENTIDADE DE LEAD *(byte-idêntica no PRD do BDR)*

```
MODELO (já existe, nunca exercitado)
  platform_crm_conversations.lead_id é FK → N conversas : 1 lead é NATIVO
  "duplicado no atendimento, unificado no CRM" = o esquema atual
  max conversas por lead hoje: 1 — o padrão nunca engatou

RESOLUÇÃO (escrita — 3 webhooks, toda mensagem)
  telefone SOZINHO, via helper único de _shared/ que cobre
  DDI · 9º dígito · E O PREFIXO "+"
  ⚠️ DUAS CONVENÇÕES coexistem, e as duas são legítimas:
       lado PLATAFORMA  platform_crm_leads.phone e
                        platform_crm_conversations.visitor_phone guardam "+E.164"
                        medido: 8/8 com "+" (6 de 12 dígitos, 2 de 13, 1 sem DDI 55)
       lado TENANT/PROVEDOR  dígitos puros (JID da Evolution, API do provedor)
     phoneVariantsBR() devolve SÓ DÍGITOS (_shared/phone.ts:30,33) —
     CORRETA para o lado tenant/provedor, INSUFICIENTE para o lado plataforma.
     Usada crua num ponto de resolução de PLATAFORMA, casa ZERO linhas.
  ⚠️ O lado plataforma não tem adaptador: 4 chamadores escreveram o mesmo
     ajuste por conta própria (meta-whatsapp-send:112 ·
     start-whatsapp-conversation:106 · _shared/whatsapp-connection:182 ·
     _shared/onboarding-handoff:279). Nenhum lugar onde a regra viva.
  MIGRAM para o helper: os 4 acima + os 3 pontos de resolução abaixo.
  NÃO MIGRAM (convenção dígitos, corretos como estão):
     platform-check-whatsapp-number:51 · evolution-webhook:1138 (TENANT)
     ⚠️ evolution-webhook ≠ platform-evolution-webhook — os dois existem.
  → o helper encapsula as DUAS coisas: variantes do lado plataforma
    (dígitos + "+") e desreferência de merged_into.
    NENHUM ponto de resolução de plataforma chama phoneVariantsBR direto.
  o resolvedor SEMPRE desreferencia merged_into e devolve o CANÔNICO
  ↳ um ponto de controle cobre todo caminho automatizado
  ↳ quem não sabe que merge existe fica correto de graça
  pontos: platform-evolution-webhook:329 · platform-meta-whatsapp-webhook:388
          cakto-webhook resolveOrCreateLead:356

LEITURA (display — caminho humano)
  view platform_crm_leads_ativos = WHERE merged_into IS NULL
  migração incremental dos 41 pontos; NÃO-MIGRADO É SEGURO (vê a tabela, mostra 1 a mais)

MERGE (remediação — evento raro)
  gatilho    ≥2 sinais concordantes (núcleo BR + email, OU núcleo BR + org)
  canônico   vence o MAIS ANTIGO (histórico e vínculos)
  reaponta   as 20 TABELAS — deals e payment_links são os CRÍTICOS
  cadeia     achata no ato: reaponta também quem já apontava pro perdedor
             ↳ cadeia nunca passa de 1 salto; desreferenciador fica trivial
  descarte   NUNCA deletar — merged_into preserva auditoria

INVARIANTE
  ensureLead que falha NÃO devolve null e segue.
  Ou repete, ou marca a conversa como precisando de vínculo, ou alerta.
  Prova: 4 conversas órfãs no canal oficial, todas COM telefone,
         uma com 56 mensagens — o caminho de falha degrada por SEMANAS em silêncio.
```

**Dano hoje: zero duplicatas** — mas em base de **8 leads**, com as duas convenções de 9º dígito já convivendo (6 com 12 dígitos, 2 com 13). A colisão não aconteceu por falta de volume, não por acerto do casamento.

---

## 4. AS PRs

### PR-1 · Conhecimento do sistema na `knowledge_base` 🔴 PRIMEIRA
**Problema:** a base tem 3.939 chars de posicionamento e zero descrição funcional. A Duda não sabe o que vende.

**Fonte** *(caminhos verificados 2026-08-04)*: `tasks/arsenal-atendimento/` (8 arquivos, **248 KB**) + `tasks/PLAYBOOK-CAMINHO-FELIZ-2026-07-21.md` (**83 KB**) = **331 KB → 15 KB (22:1)**.
⚠️ **Errata:** a 1ª versão citava `GUIA-FLUXO-USO-NEXVYBEAUTY.md`. **Não existe** — busca ampla no app, com controle positivo. Citação de memória que não se sustentou.

🔴 **ACHADO na base atual** (backup em `tasks/BACKUP-knowledge_base-NexvyBeauty-2026-08-04-pre-PR1.md`): a base **instrui a agente a usar "o preço sobe em breve" como alavanca de urgência, em 3 lugares** — contrariando a decisão do Marcelo ("não existe data de subida") e contradizendo a si mesma, já que proíbe "relógio falso" dois parágrafos acima. **A §A não estava a implementar: estava sendo ativamente contrariada em produção.** Remover as 3 é entregável da PR-1.

✅ **Achado que barateia a PR-3:** o bloco `PLAYBOOK CLOSER — BIA` **já vive nesta mesma base** (7 micro-passos + objeções por valor). A unificação não porta material — remove o handoff e reescreve na 1ª pessoa.

**Entregável:** `platform_crm_products.knowledge_base` reescrita, cobrindo:
- agentes de IA que atendem, vasculham a agenda, agendam e confirmam horário
- agenda unificada, link público de agendamento
- comissões · pacotes e sessões · financeiro (quanto entrou, de qual serviço, com qual profissional)
- vitrine/catálogo · lembretes no ritmo do serviço
- Raio-X **como uma entre várias**, não como o produto
- **camada "do zero"** (F5): descrição para quem nunca ouviu falar da Nexvy — serve o frio do BDR e o inbound que chega sem entender o anúncio
- **preço:** nunca em prosa. `price_monthly` e `list_price_monthly` de `public_plans` em runtime
- **escassez:** sem quota, sem vagas, sem âncora temporal (§2)

**Check binário** *(comportamental — corrigido após apontamento da sessão BDR)*:
1. lead que pergunta *"o que é isso?"* recebe **3-4 funções concretas** ligadas ao que ela disse, em 2-3 bolhas, **sem** cair no Raio-X como resposta única. Medido em `platform_crm_messages`.
2. `length(knowledge_base) ≤ 15 KB`. Estourou, a PR **não fecha** — vira o gatilho da frente `platform_crm_product_knowledge_sources` (hoje 0 linhas, 0 leitores).

> O `ILIKE` para `agente|agenda|comiss|pacote|financ` desce a **pré-condição de sanidade**, não é critério de aceite: um glossário colado passaria nele. Presença do símbolo ≠ garantia de comportamento.

**Qualidade:** ≤1 pergunta por turno; nenhum fecho que peça objeção (*"ficou alguma dúvida?"* está banido — ver PR-3).

**Risco:** base longa dilui instrução. A mitigação *"conhecimento na base, forma no prompt"* é **hipótese sobre comportamento de LLM, não medição** — por isso o teto de 15 KB é check, não recomendação.

### PR-2 · Separar o efeito da REGRA #0 do efeito da base nova
**Premissa anterior DERRUBADA:** eu escrevi que REGRA #0 "nunca foi exercitada". **É falso**, por duas medições independentes (sessão BDR + sessão Anúncios), confirmadas por mim:

```
Eraldo · 08-03 21:00:26 BRT
  "O NexvyBeauty entra no seu WhatsApp e faz duas c…"   ← explicação
  depois → "Me conta: você atende em espaço próprio…"   ← qualificação
REGRA #0 funciona. Não foi ela que queimou os 7 leads.
```

**Instantes de deploy, medidos na fonte (não no git):**
```
deploy que levou a REGRA #0    17:53:18 BRT  ← MARCO CORRETO (sessão Anúncios)
platform-meta-whatsapp-webhook v50  21:49:36 BRT
platform-sales-brain           v76  22:20:58 BRT  ← ÚLTIMO deploy, NÃO o da REGRA #0
```

⚠️ **Errata:** a 1ª versão desta PR usava 22:20:58 como corte. Errado — é o último deploy, não o que levou a REGRA #0. O baseline seria composto de conversas **já pós-fix** e a conclusão seria "a REGRA #0 não mudou nada". Medido com o marco certo:
```
A. antes de 17:53   3 conversas ·  4 inbound ·   8 bot   ← baseline real (fino, mas é o certo)
B. 17:53–22:20      8 conversas · 36 inbound · 105 bot
```

⚠️ **Contaminação registrada:** a 1ª mensagem transcrita na tabela é de **21:45**, *anterior* ao deploy das 21:49 — porque um **backfill reescreveu `content`/`metadata` in place** e o `created_at` ficou com o instante da mensagem. **Pré-vs-pós por timestamp não vale em tabela que sofreu backfill.** Vale para o cérebro (sem backfill, corte limpo em 22:20:58); não vale para o áudio — só as 4 linhas posteriores a 21:49:36 são do caminho vivo.

**Entregável:** comparação pré (`< 22:20:58`) vs pós na base atual, **antes** da PR-1, para separar o efeito da REGRA #0 do efeito da base nova — hoje bundleados.

**Check binário:** existe medição pré e pós com N≥1 conversa de cada lado e o veredito de cada metade é declarado separadamente.

**Por que importa:** do jeito anterior, a PR provava a *combinação*. Se o resultado fosse ruim, não daria pra saber qual metade consertar.

### PR-2b · 🔴 CORRIDA — duas invocações paralelas do cérebro
**Problema medido, e é o que de fato queimou os leads:**
```
20:59:55 visitor  "Olá! Posso ter mais informações sobre isso?"
20:59:57 visitor  [audio]                                    ← 1,7s
21:00:17 A  "Oi Eraldo!"
21:00:30 B  "Oi! Aqui é a Duda 💛 Vi que você veio do anúncio…"  ← 2ª saudação
21:00:38 B  "O NexvyBeauty entra na sua base e mostra quem…"     ← 2ª explicação
21:00:41 A  "Me conta: você atende em espaço próprio…"
21:00:56 B  "Me conta, você atende em espaço próprio…"           ← difere por UMA VÍRGULA
```
7 bolhas em 39s, duas aberturas, pergunta final duplicada.

**Mecanismo, medido no arquivo** *(achado da sessão BDR, verificado por mim linha a linha)*:
```
:77    DEBOUNCE_MS = 12000
:1106  await sleep(...)          ← por invocação, SEM coordenação
:1107  historyDesc = loadMessages()
:1118  return json({skipped:'superseded'})   ← guarda de desistência
:1131  return json({skipped:'recent_bot_message'})  ← 2º guarda (<5s)
advisory_lock | FOR UPDATE | claim  →  0 ocorrências
```

**O `sleep` não coalesce, ALINHA.** Duas entradas separadas por 1,7s dormem 12s cada e acordam a ~2s uma da outra — recarregando o histórico no mesmo instante, quando nenhuma escreveu ainda.

**🔴 O guarda está ANINHADO dentro de `if (ageMs < DEBOUNCE_MS)`** — achado da sessão BDR, confirmado por mim no arquivo:
```
:1101  if (triggerInbound && DEBOUNCE_MS > 0 && !inactivityMode) {
:1104    if (ageMs < DEBOUNCE_MS) {        ← tudo abaixo depende disto
:1106      await sleep(...)  :1107  loadMessages()  :1118  skipped:'superseded'
:1120    } }
```
**O guarda só existe no caminho rápido.** Qualquer invocação cujo gatilho já tenha >12s **pula o sleep, o reload e o guarda inteiro**. Não é defeito do áudio: transcrição, download, retry, cold start e fila abrem a mesma porta. O áudio foi uma instância.

- **A** (texto) acordou ~21:00:07, recarregou e **não viu** a linha do áudio → não superseded → falou.
- **B** (áudio) só começou depois de o webhook tentar transcrever e falhar → `ageMs > 12000` → entrou por baixo do guarda.

O 2º guarda (`recent_bot_message`) também não podia pegar: para B, `historyDesc[0]` é o histórico de **antes** do sleep (dado errado), e A→B levou 13s, fora dos 5s da janela (janela errada).

**Raiz:** o desenho do `superseded` está certo e repousa numa premissa que o schema não garante — que a ordem de `created_at` é a ordem de **visibilidade** da linha. **Terceira aparição do mesmo carimbo enganoso em 24h** (a 1ª foi o backfill): neste schema `created_at` significa "quando a mensagem existiu no mundo", e todo mecanismo que o lê como "quando a linha ficou visível" está errado por construção.

**Defeito vs gatilho — não conflacionar:**
```
o DEFEITO   estrutural, lê-se no código → n é irrelevante, está CONFIRMADO
o GATILHO   exige 2 invocações sobrepostas → 1 rajada em 40h → n=1
            governa PRIORIDADE, não existência
```
Ler a porta aberta prova que ela está aberta; não diz com que frequência alguém passa. **Gatilho raro, consequência quase certa quando ocorre.**

**Entregável — dois defeitos, e corrigir um não resolve o outro** *(distinção da sessão BDR)*:

| | o que é | se corrigir só isso |
|---|---|---|
| **corrida** | duas invocações entrelaçam a saída | some o entrelaçamento, **continuam 2 respostas** |
| **rajada** | N mensagens em segundos → N invocações | serializadas, a lead recebe N respostas para 1 pensamento |

Fila no banco (não `sleep` — sobrevive a cold start) **+ reivindicação real**:
```
claim       INCONDICIONAL — toda invocação tenta tomar a conversa, sempre
            FORA de qualquer if de latência, idade ou canal
perdedores  SAEM, não esperam a vez
ordenação   por estado que só existe DEPOIS do insert — nunca por created_at
```
⚠️ **Se o claim nascer dentro de `if (ageMs < X)`, ele herda o furo — e fica mais difícil de ver, porque com fila parece robusto.** É o padrão da casa (proteção com forma perfeita e sem alcance) sendo reproduzido dentro da própria correção dele.

**Check binário:** duas mensagens da mesma lead com <3s de intervalo produzem **uma** sequência de bolhas — uma saudação, uma pergunta final — e **uma** resposta, não duas serializadas.

**Como testar** *(critério da sessão BDR)*: com **atraso artificial no insert**, não com duas mensagens rápidas. Duas mensagens rápidas exercitam justamente o caminho que o guarda cobre — é o teste que passa sem provar nada.

**Prioridade:** primeira. Está viva, e é pré-condição do funil do BDR (rajada é caso modal no frio, não exceção).

### PR-2c · Contrato do sinal de pagamento *(assumido do PRD do BDR, linha 208)*
**Problema:** o PR-BDR-6 depende de um contrato de sinal de pagamento (`cakto_orders` + `organizations.plan_status`) declarado como "entregue pela controladora" — e que não existia em PR nenhuma. Sem ele, a travessia Camila → Lia não fecha.

**Entregável:** contrato documentado do sinal que marca "pagou" e é consumível pelas duas frentes.

**Check binário:** pagamento confirmado dispara o sinal uma vez, com `lead_id` resolvido, consumível por Camila (encerrar) e Lia (assumir).

**Nota:** achado pela sessão BDR na revisão cruzada. Sem essa linha, os dois PRDs seriam aprovados com um buraco nos segundos seguintes ao pagamento.

### PR-3 · Unificar Duda + Bia
**Decisão do Marcelo:** *"VAMOS UNIFICAR."*

**Fato medido:** Bia com **0 conversas, 0 mensagens, 0 handoffs** contra 165 mensagens da Duda. O handoff SDR→Closer nunca rodou.

**Entregável:** material de fechamento do `PLAYBOOK-CLOSER-BIA-2026-07-05.md` absorvido na `knowledge_base` (PR-1) e no prompt da Duda; Bia `is_active=false` (**não deletar**); `[PASSAR_BIA]` removido do prompt.

**Check binário:** Duda conduz da abertura ao checkout sem handoff; `platform_crm_product_agents` com 1 SDR ativo no WhatsApp.

**Qualidade:** vence objeção com o esqueleto de 5 tempos (reconhece → reenquadra → estrutura → prova → pede); arrependimento de 7 dias (CDC art. 49) como menção lateral, **nunca** "garantia", **nunca** como argumento.

**Proibições importadas da spec da Camila** (estavam só no lado do BDR): nenhum fecho que peça objeção — *"Ficou alguma dúvida sobre como funciona?"* saiu da Duda às 21:09 de 03/08, é literalmente o padrão banido · adjetivo no lugar de prova · catálogo antes de ela comprar o problema · léxico: "custa"/"sai por", nunca "investimento".

**Reversão:** `UPDATE is_active=true` — uma coluna.

**Depende de:** PR-1.

### PR-4 · Seleção de LLM por agente
**Problema medido:** `src/config/aiModelsCatalog.ts` está completo (Opus 5, Sonnet 5, GPT-5.2, Gemini 3) e **`AgentEditor.tsx` não o usa** — 0 ocorrências. Consequência: `model` é **NULL em 5 de 8 agentes**, incluindo **Lia · Implantação**, que o Marcelo acabou de pôr no onboarding pós-pagamento.

**Entregável:** campo de modelo no `AgentEditor` alimentado pelo catálogo; `model` definido explicitamente para Duda e Lia.

**Check binário:** editar agente pela tela e o valor persistir em `platform_crm_product_agents.model`; nenhum agente ativo em WhatsApp com `model` NULL.

**Qualidade:** o modelo escolhido é o que a conversa usa — verificado no log do brain, não na tela.

**Nota:** a Lia recebe a cliente segundos após o pagamento. Modelo indefinido no momento de maior valor é risco, e foi a sessão do BDR que marcou.

### PR-5 · Identidade de lead no inbound oficial *(seção C)*
**Escopo meu:** `platform-meta-whatsapp-webhook:388` e `cakto-webhook:356` → `phoneVariantsBR`; resolvedor desreferencia `merged_into`; coluna + view + política de merge.

**Escopo do BDR:** `platform-evolution-webhook:329`.

⚠️ **Muda dado em produção** — leads reais entrando. Requer palavra explícita do Marcelo, separada do GO geral.

**Check binário:** mesmo telefone com e sem 9º dígito resolve para o mesmo `lead_id`; as 8 linhas conferidas à mão depois.

### PR-6 · Conversa órfã é estado inválido
**Problema medido:** 4 conversas sem `lead_id`, todas do canal oficial, **todas com telefone preenchido** — uma com 56 mensagens, outra com 36. Atendimento longo, invisível no CRM. Causa: `ensureLead` non-fatal devolvendo `null` e a conversa seguindo calada.

**Entregável:** `ensureLead` que falha não segue em silêncio; as 4 existentes vinculadas.

**Check binário:** zero conversas com `lead_id IS NULL`; falha nova produz sinal observável.

**Depende de:** PR-5.

---

## 5. Ordem e dependências

```
PR-2b CORRIDA             ← 🔴 PRIMEIRA de fato. Vivo, queimando lead agora.
PR-2  separar efeitos     ← mede a base ATUAL antes de trocá-la (só existe janela agora)
PR-1  conhecimento        ← a causa raiz do que o Marcelo viu
  └─ PR-3 unificar Duda/Bia  ← absorve material na mesma base
PR-4  seleção de LLM      ← independente; destrava a Lia
PR-2c contrato pagamento  ← destrava o PR-BDR-6
PR-5  identidade de lead  ← ⚠️ requer palavra separada (muda dado em produção)
  └─ PR-6 conversa órfã
```

⚠️ **A PR-2 tem janela e ela fecha:** a comparação pré-vs-pós usa a base **atual**. Depois que a PR-1 reescrever a `knowledge_base`, os dois efeitos ficam bundleados para sempre. Medir antes, ou não medir.

**PR-2b, PR-2 e PR-1 são a madrugada.** O Marcelo foi explícito: *"o SDR está ao vivo, está acontecendo"* — o gate G (nenhum lead real antes do ciclo completo) vale para o outbound; o inbound já está ligado e queimando lead.

---

## 6. O que trava, e com quem

| Trava | Com quem |
|---|---|
| **GO com este escopo** | Marcelo |
| **PR-5 — muda dado em produção** | Marcelo, palavra separada |
| Data de subida do preço | ✅ respondido: não existe → §2 fechada |
| Diagnóstico dos 7 leads | ✅ respondido → ordena PR-1 |
| Unificar Duda/Bia | ✅ decidido: unificar |
| Onboarding | ✅ decidido: Lia · `+55 11 95502-1205` · `boas_vindas_ativacao` |

---

## 7. Dependências entre as duas frentes

**Do BDR para mim:** a `PR-4` dela (cérebro agnóstico de canal) está **bloqueada até eu estabilizar o SDR**, por decisão dela — o arquivo atende lead real agora. **Aviso quando estabilizar.**

**De mim para o BDR:** `model` da Lia NULL bloqueia a travessia de onboarding dela (PR-6 do BDR) — está no meu PR-4. O **contrato do sinal de pagamento** que ela mapeou virou meu PR-2c.

**Resolução de `merged_into`:** helper único em `_shared/` (junto do `phone.ts`), **escrito por mim** — 2 dos 3 webhooks são meus, então a chance de divergência é menor. Ela importa. Sem isso, "um ponto de controle" viraria duas implementações da mesma regra.

**A corrida (PR-2b) muda o critério de aceite dela:** o PR-BDR-4 mede não-regressão contra *"o canal que fatura hoje"* — e o canal que fatura hoje **tem** a corrida. Medir contra o comportamento atual carimbaria o defeito como linha de base. A PR-2b entrega antes; a não-regressão dela mede contra o corrigido.

**Compartilhado:** `platform-sales-brain` — minhas regiões `~1666-1731` (anti-repetição) e `~1480-1530` (temperatura); dela `:190/:205/:226/:1809` (envio) e `:1029` (gates). Sem interseção, confirmado pelas duas. Quem encostar anuncia antes e faz `merge origin/main`.

---

## 8. Registrado, fora do escopo

- **Cofounder** — dormente por ordem do Marcelo. Nenhuma das duas mexe.
- **`founder_campaign_status`** — view LIVE no banco enquanto a base de venda nega que fundadora exista. Não tocar sem decisão dele.
- **Temperatura adaptativa por duração** (porte da Nina original: conversa >15 msgs → temp 0.5, ataca monólogo). Candidata a PR futura.
- **Debounce em fila no banco** em vez de `sleep` — sobrevive a cold start. Vale mais ao BDR (rajada de resposta a disparo).
- **Tool de catálogo com grounding** (*"NUNCA invente — consulte primeiro"*) + segundo turno ao LLM com o resultado. Porte da Nina; casa com a proibição de adjetivo-no-lugar-de-prova.
