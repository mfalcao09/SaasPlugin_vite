// CANDIDATO da sessão BDR, ainda NÃO integrado à suíte. Import de tipo
// adicionado por mim: o original usava Golden[] sem importar (não type-checava).
import type { Golden } from './goldens.ts';

// GOLDENS DO CANAL EVOLUTION (Camila) — 8 goldens, 2 controles negativos.
// Cada um pega UM defeito REAL medido em produção 2026-08-05/06.
//
// ⚠️ TRADUÇÃO PCRE→JS APLICADA. O JSON de origem vinha com flags inline
// (?i) (?s) (?m) — sintaxe Python/PCRE, INVÁLIDA em JavaScript ('Invalid group').
// 51 das 108 asserções não compilavam. Corrigido e verificado no motor do Deno:
//   (?i) → removida (o harness já compila com flag 'i')
//   (?s) → '.' vira '[\s\S]'   (preserva o casamento multi-linha)
//   (?m) → '^.*' vira '[^\n]*'  (preserva 'na MESMA linha')
// Semântica provada por caso: 'Andreia\nAndreia' casa, 'Andreia' sozinho não;
// 'quer ver? https://x' casa, 'quer ver?\nhttps://x' NÃO casa (linhas separadas).
//
// scope 'lastTurn' explícito em todas: medem a resposta ao ÚLTIMO turno.

export const GOLDENS_EVOLUTION: Golden[] = [
  {
    id: 'evo-link-sem-aceite-lead-so-perguntou-preco',
    title: 'Lead pergunta preço e pede explicação — agente responde SEM mandar checkout',
    scenario: 'DEFEITO 5 (link sem aceite): a lead só perguntou quanto custa e pediu pra entender como funciona; nenhuma dessas falas é aceite. A agente mandou o link de checkout mesmo assim. Perguntar preço não é comprar.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'oi bom dia' },
      { content: 'vi sua mensagem aqui' },
      { content: 'ta mas quanto custa isso ai?' },
      { content: 'me explica ai como funciona antes' },
      { content: 'hmm sei la, to meia perdida ainda' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: '(custa|sai por)', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_contain', pattern: 'R$', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'http', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'checkout', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'cakto', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'investimento', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'compensar', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'garantia', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: '(vai subir|vai aumentar|so ate|só até)', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'raio-?x', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'carteira', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'funil', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: 'ia native', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: '(ficou alguma d[úu]vida|alguma d[úu]vida\\?|ficou alguma pergunta)', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
      { kind: 'must_not_contain', pattern: '(sou (uma )?(ia|rob[ôo]|assistente virtual|intelig[êe]ncia artificial))', scope: 'lastTurn', reason: 'evo-link-sem-aceite-lead-so-perguntou-preco' },
    ],
  },
  {
    id: 'evo-aceite-explicito-link-obrigatorio-bolha-separada',
    title: 'CONTROLE NEGATIVO: lead diz \'pode mandar o link\' — link é obrigatório, e sozinho na bolha',
    scenario: 'Controle negativo do detector do DEFEITO 5: aqui a lead ACEITOU explicitamente e pediu o link, então NÃO mandar o link é a falha (o detector de \'link sem aceite\' não pode disparar). Ao mesmo tempo pega o DEFEITO 6 (bolha aglutinada): a URL tem que ir sozinha na própria bolha, nunca colada em pergunta ou texto.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'gostei' },
      { content: 'quero sim' },
      { content: 'pode mandar o link ai que eu ja fecho' },
      { content: 'so nao me manda 50 mensagem kkkk' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: 'https://', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: '[^\\n]*\\?[^\\n]*https?://', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: '[^\\n]*https?://\\S+[ \\t]+\\S+', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: 'garantia', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: 'investimento', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: 'compensar', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: '(vai subir|vai aumentar)', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: 'devolv\\w+.{0,40}resultado', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: 'raio-?x', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: '(ficou alguma d[úu]vida|alguma d[úu]vida\\?)', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
      { kind: 'must_not_contain', pattern: '(sou (uma )?(ia|rob[ôo]|assistente virtual))', scope: 'lastTurn', reason: 'evo-aceite-explicito-link-obrigatorio-bolha-separada' },
    ],
  },
  {
    id: 'evo-reapresentacao-retorno-25min-robo',
    title: 'Retomada depois de 25 min + "vc é robo?" — não pode se reapresentar',
    scenario: 'REAPRESENTAÇÃO (defeito 2, medido 2026-08-05): a agente solta "sou a Camila, da NexvyBeauty" com a conversa já em andamento. O gatilho aqui é duplo — a lead some por ~25 min e volta pedindo desculpa (puxa reabertura tipo primeiro contato) e ainda pergunta se é robô (puxa "sou a Camila, atendente da NexvyBeauty" como resposta defensiva). Por isso o nome próprio dela fica banido na resposta: com a conversa em curso, qualquer autocitação é reapresentação. Trava também a proibição de admitir ser IA, exigindo a frase fixa literal.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'ah entendi' },
      { content: 'entao ela responde os cliente sozinha? sem eu ficar em cima' },
      { content: 'desculpa sumi, tava atendendo uma cliente aqui' },
      { content: 'vc é robo?' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: 'Kkkkkk que isso, sou de carne e osso mesmo, por que?', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'Camila', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'da NexvyBeauty', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'Olá', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'sou uma IA', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'inteligência artificial', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'assistente virtual', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'robô', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'sistema automático', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'IA Native', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'EquipIA', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'agente de carteira', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'raio-X', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'carteira', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'funil', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
      { kind: 'must_not_contain', pattern: 'ficou alguma dúvida', scope: 'lastTurn', reason: 'evo-reapresentacao-retorno-25min-robo' },
    ],
  },
  {
    id: 'evo-nome-repetido-bolhas-seguidas',
    title: 'Lead se apresenta e manda duas perguntas em rajada — nome só uma vez',
    scenario: 'NOME REPETIDO (defeito 3, medido 2026-08-06): a agente usa o primeiro nome da lead duas vezes em bolhas consecutivas. O gatilho é a lead entregar o nome dela e emendar duas perguntas em rajada ("o que vc vende" + "serve pra agendamento"), o que naturalmente puxa duas bolhas de resposta — e cada bolha tenta abrir com "Andreia, ...". O padrão regex pega as duas ocorrências em qualquer distância dentro da resposta inteira.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'oi' },
      { content: 'aqui quem fala e a Andreia do studio bella' },
      { content: 'chegou sua mensagem mas nao entendi direito o que vc vende' },
      { content: 'isso serve pra agendamento tbm? pq minha menina do balcao vive perdendo horario da cliente' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: 'Andreia', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_contain', pattern: 'agenda', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'Andreia[\\s\\S]*Andreia', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'Andreia, Andreia', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'ficou alguma dúvida', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'alguma dúvida?', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'investimento', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'compensar', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'carteira', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'funil', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'raio-X', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'IA Native', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'EquipIA', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'assistente virtual', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
      { kind: 'must_not_contain', pattern: 'sou uma IA', scope: 'lastTurn', reason: 'evo-nome-repetido-bolhas-seguidas' },
    ],
  },
  {
    id: 'evo-receio-conectar-zap-nao-insistir-em-demo',
    title: 'Lead com medo de conectar o WhatsApp do salão — agente recua da demonstração',
    scenario: 'Defeito 8 — INSISTIU CONTRA PREOCUPAÇÃO: a lead diz ter receio de conectar o WhatsApp dela (número do salão inteiro) e a agente empurra a demonstração/agendamento assim mesmo, em vez de acolher o receio, devolver o controle e recuar.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'oi quem e vc?' },
      { content: 'ata... vc falou de me mostrar funcionando né' },
      { content: 'mas peraí, isso ai conecta no meu whatsapp?' },
      { content: 'é que meu zap é o do salao inteiro, agenda de cliente ta tudo ali. ja vi gente perdendo numero' },
      { content: 'to meio receosa de conectar nao vou mentir' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: '(seu n[úu]mero|seu zap|seu whats)', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_contain', pattern: '(pode desconectar|desconectar quando quiser|[ée] s[óo] desconectar|voc[êe] tira quando quiser|vc tira quando quiser)', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_contain', pattern: '(sem pressa|no seu tempo|quando (voc[êe]|vc) (quiser|se sentir|achar))', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: '(demonstra[çc][ãa]o|te mostro|posso te mostrar|te mostrar funcionando)', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: '(agendar|marcar (um|uma|uns)|que horas (voc[êe]|vc) pode|amanh[ãa] (de manh[ãa]|[àa] tarde))', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: 'garantia', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: '\\binvestimento\\b', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: 'compensar', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: '(vai subir|aumenta o pre[çc]o|[úu]ltimos dias|s[óo] at[ée] (hoje|amanh[ãa]|sexta))', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: '(sou (uma )?(ia|intelig[êe]ncia artificial)|sou um rob[ôo]|assistente virtual)', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: '(raio-?x|carteira|funil|ia native|equipia)', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: '(ficou alguma d[úu]vida|alguma d[úu]vida\\?|restou alguma d[úu]vida)', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
      { kind: 'must_not_contain', pattern: 'https?://', scope: 'lastTurn', reason: 'evo-receio-conectar-zap-nao-insistir-em-demo' },
    ],
  },
  {
    id: 'evo-adiar-pra-sabado-nao-e-recusa',
    title: 'Controle negativo — \'agora não dá não\' é adiamento, não recusa: agente segue e marca o sábado',
    scenario: 'Falso positivo do detector do defeito 1 (REOFERTA APÓS RECUSA): a lead usa \'não dá não / não consigo\' para ADIAR e ela mesma pede o fim de semana. O detector de recusa não pode disparar — a agente deve seguir normalmente e fechar o sábado de manhã, sem pedir desculpa por incomodar, sem \'se mudar de ideia\' e sem encerrar a conversa.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'ah entendi, legal isso' },
      { content: 'mas agora nao da nao, to com cliente na cadeira' },
      { content: 'nao consigo ver hoje nao... da pra ser sabado de manha?' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: 's[áa]bado', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_contain', pattern: 'manh[ãa]', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_contain', pattern: '(\\b\\d{1,2}h\\b|\\b\\d{1,2}:\\d{2}\\b|\\b\\d{1,2} horas\\b)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_contain', pattern: '(fechado|combinado|perfeito|show|beleza|pode ser sim|ent[ãa]o fica)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(se (voc[êe] |vc )?mudar de id[ée]ia)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(desculpa.{0,15}incomod|desculpe.{0,15}incomod|n[ãa]o (vou|te) (mais )?incomod)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(respeito (a )?sua decis[ãa]o|fico por aqui|sem problema.{0,25}(paro|desist|encerr))', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(sou a camila|me chamo camila|aqui (quem fala )?[ée] a camila|camila,? da nexvybeauty)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: 'https?://', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: 'garantia', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '\\binvestimento\\b', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: 'compensar', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(vai subir|aumenta o pre[çc]o|[úu]ltimos dias)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(sou (uma )?(ia|intelig[êe]ncia artificial)|sou um rob[ôo]|assistente virtual)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(ficou alguma d[úu]vida|alguma d[úu]vida\\?)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
      { kind: 'must_not_contain', pattern: '(raio-?x|carteira|funil|ia native|equipia|agente de carteira)', scope: 'lastTurn', reason: 'evo-adiar-pra-sabado-nao-e-recusa' },
    ],
  },
  {
    id: 'evo-lista-3-pontos-abortada-por-rajada',
    title: 'Lista de 3 pontos abortada pela rajada da lead no meio da entrega',
    scenario: 'DEFEITO 4 — LISTA ABANDONADA. A lead pede 3 coisas, a Camila anuncia/começa a entregar em bolhas e a rajada dela (turnos 3-5, frescos) aborta o lote antes da última bolha sair. A resposta seguinte trata a rajada e NUNCA volta pra fechar o item que ficou aberto. O golden mede a resposta ao último turno: ela tem que responder o preço na lata E retomar o ponto que faltou, sem abrir lista nova.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'oi vi aqui sua msg, to no meio de um atendimento' },
      { content: 'me fala 3 coisas q isso resolve pra mim, sem enrolaçao' },
      { content: 'peraí' },
      { content: 'quanto custa isso ai?' },
      { content: 'pq aqui é so eu e mais duas meninas, salao pequeno' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: 'terceir|[úu]ltima|[úu]ltimo|faltou te (falar|dizer)|faltou a|voltando (ali|no)|s[óo] faltou', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_contain', pattern: 'custa|sai por|fica em|fica por|por m[êe]s', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_contain', pattern: '\\?', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'investimento', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'compensar', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'garantia|garanto', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'sou a camila|me chamo camila|aqui [ée] a camila|camila,? da nexvy', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'ficou alguma d[úu]vida|alguma d[úu]vida\\?|restou alguma d[úu]vida', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'https?://', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'carteira|funil|raio-?x|ia native|equipia|agente de carteira', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'vai (subir|aumentar)|antes que (suba|aumente)|[úu]ltimos dias|s[óo] at[ée] (hoje|amanh[ãa]|sexta)', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
      { kind: 'must_not_contain', pattern: 'antes de (falar|entrar) (de|em|no) pre[çc]o|j[áa] j[áa] te (falo|digo) o (valor|pre[çc]o)|deixa eu te (mostrar|explicar) (uma coisa )?antes', scope: 'lastTurn', reason: 'evo-lista-3-pontos-abortada-por-rajada' },
    ],
  },
  {
    id: 'evo-objecao-reconhecida-tres-vezes',
    title: 'Mesma objeção martelada 3x — reconhecer pela terceira vez É o defeito',
    scenario: 'DEFEITO 7 — OBJEÇÃO RE-RECONHECIDA. A lead repete a MESMA objeção ("já tentei, ninguém usou, paguei à toa") em três turnos. O reconhecimento já foi gasto nos dois primeiros; na resposta ao terceiro turno a Camila reconhece de novo ("imagino", "entendo", "faz sentido") e o turno anda zero. O golden mede a resposta ao último turno: tem que pular o tempo 1 e ir pro reenquadre mecânico + prova operacional + micro-passo.',
    channel: 'whatsapp_evolution',
    // QUEM FALA (06/08, Controladora): sem este pin o roteador do brain cai em
    // 'sdr_open' e responde a DUDA. Este golden foi escrito para a CAMILA.
    agentType: 'prospector',
    inbound: [
      { content: 'ja tentei um sistema desses ano passado viu' },
      { content: 'ninguem aqui usou nao, as meninas continuaram tudo no caderno' },
      { content: 'e eu paguei 6 meses a toa. nao quero passar por isso dnv' },
    ],
    assertions: [
      { kind: 'must_contain', pattern: 'no (seu|pr[óo]prio) whatsapp|whatsapp que (voc[êe]|vc|vcs) j[áa] usa|whatsapp web|dentro do (seu )?whatsapp|desconecta quando quiser|voc[êe] decide|sem (precisar )?instalar|n[ãa]o precisa (baixar|instalar|aprender)', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_contain', pattern: '\\?', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'imagino|entendo|te entendo|compreendo|faz (todo )?sentido|sei (bem )?como (é|e)|que chato|poxa', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'garantia|garanto', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'devolvo|te devolvo|devolu[çc][ãa]o', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'investimento', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'compensar', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'carteira|funil|raio-?x|ia native|equipia|agente de carteira', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'ficou alguma d[úu]vida|alguma d[úu]vida\\?|restou alguma d[úu]vida', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
      { kind: 'must_not_contain', pattern: 'vai (subir|aumentar)|antes que (suba|aumente)|[úu]ltimos dias|s[óo] at[ée] (hoje|amanh[ãa]|sexta)', scope: 'lastTurn', reason: 'evo-objecao-reconhecida-tres-vezes' },
    ],
  },
];
