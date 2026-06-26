import { FunnelBlock, generateBlockId } from '@/types/funnel';

export type QuizCategory = 'captacao' | 'diagnostico' | 'negocios' | 'nichos' | 'qualificacao' | 'recomendacao' | 'educacional';
export type QuizBadge = 'mais-usado' | 'recomendado' | 'alta-conversao' | 'diagnostico' | 'evento' | 'nicho' | 'ia';

export interface QuizTemplate {
  id: string;
  name: string;
  description: string;
  category: QuizCategory;
  objective?: string;
  icon: string;
  cover_gradient: string;
  estimated_time: string;
  question_count: number;
  flow_blocks: FunnelBlock[];
  badges?: QuizBadge[];
}

// ───────────── Helpers ─────────────
const block = (type: string, data: any): FunnelBlock => ({
  id: generateBlockId(),
  type: type as any,
  position: { x: 0, y: 0 },
  next_block_id: null,
  data,
});

function chain(...blocks: FunnelBlock[]): FunnelBlock[] {
  for (let i = 0; i < blocks.length - 1; i++) blocks[i].next_block_id = blocks[i + 1].id;
  return blocks;
}

const STD_TIERS_3 = (labels: [string, string, string], colors: [string, string, string], msgs: [string, string, string]) => ([
  { id: 't1', label: labels[0], min: 0, max: 40, color: colors[0], message: msgs[0] },
  { id: 't2', label: labels[1], min: 41, max: 80, color: colors[1], message: msgs[1] },
  { id: 't3', label: labels[2], min: 81, max: 200, color: colors[2], message: msgs[2] },
]);

const captureName = () => block('input', { label: 'Qual seu nome?', placeholder: 'Seu nome', variable_name: 'nome', input_type: 'text', required: true });
const captureWhatsapp = () => block('input', { label: 'Qual seu WhatsApp?', placeholder: '(11) 99999-9999', variable_name: 'whatsapp', input_type: 'phone', required: true });
const captureEmail = () => block('input', { label: 'Qual seu e-mail?', placeholder: 'voce@email.com', variable_name: 'email', input_type: 'email', required: true });

// ───────────── CAPTAÇÃO ─────────────
function tplCapturaSimples() {
  return chain(
    block('text', { content: '👋 Em 30 segundos vamos te conectar com a melhor solução para você.' }),
    captureName(),
    captureWhatsapp(),
    block('buttons', {
      label: 'Qual seu principal interesse?',
      variable_name: 'interesse',
      options: [
        { id: '1', letter: 'A', label: 'Quero conhecer melhor', score: 10, tag: 'curioso' },
        { id: '2', letter: 'B', label: 'Quero comprar agora', score: 30, tag: 'quente' },
        { id: '3', letter: 'C', label: 'Quero pesquisar mais', score: 5, tag: 'frio' },
      ],
    }),
    block('end', {
      content: '✅ Recebemos seu contato! Em breve falaremos com você.',
      result_tiers: STD_TIERS_3(['Frio', 'Morno', 'Quente'], ['#94a3b8', '#3b82f6', '#ef4444'],
        ['Vamos te nutrir com conteúdo.', 'Vamos conversar em breve.', 'Um especialista entrará em contato hoje!']),
    }),
  );
}

function tplListaEspera() {
  return chain(
    block('text', { content: '🚀 Entre na lista de espera VIP e seja o primeiro a saber do lançamento!' }),
    captureName(),
    captureWhatsapp(),
    captureEmail(),
    block('buttons', {
      label: 'O que mais te interessa?',
      variable_name: 'interesse',
      options: [
        { id: '1', letter: 'A', label: 'Preço promocional de lançamento', score: 15, tag: 'preco' },
        { id: '2', letter: 'B', label: 'Acesso antecipado', score: 25, tag: 'antecipado' },
        { id: '3', letter: 'C', label: 'Conteúdo exclusivo', score: 10, tag: 'conteudo' },
      ],
    }),
    block('buttons', {
      label: 'Qual sua maior expectativa?',
      variable_name: 'expectativa',
      options: [
        { id: '1', letter: 'A', label: 'Resolver um problema atual', score: 25 },
        { id: '2', letter: 'B', label: 'Melhorar o que já faço', score: 20 },
        { id: '3', letter: 'C', label: 'Aprender algo novo', score: 10 },
      ],
    }),
    block('end', {
      content: '🎉 Você entrou na lista de espera VIP!',
      result_tiers: STD_TIERS_3(['Curioso', 'Interessado', 'Pronto'], ['#94a3b8', '#3b82f6', '#10b981'],
        ['Vamos te manter informado.', 'Aguarde novidades em breve.', 'Vamos te dar acesso antecipado!']),
    }),
  );
}

function tplEvento() {
  return chain(
    block('text', { content: '🎟️ Garanta sua vaga e personalize sua experiência no evento!' }),
    captureName(),
    captureWhatsapp(),
    block('buttons', {
      label: 'Você já trabalha com o tema do evento?',
      variable_name: 'experiencia',
      options: [
        { id: '1', letter: 'A', label: 'Sim, atuo há mais de 1 ano', score: 30, tag: 'avancado' },
        { id: '2', letter: 'B', label: 'Estou começando', score: 15, tag: 'iniciante' },
        { id: '3', letter: 'C', label: 'Ainda não, quero aprender', score: 5, tag: 'curioso' },
      ],
    }),
    block('buttons', {
      label: 'Qual seu maior desafio hoje?',
      variable_name: 'desafio',
      options: [
        { id: '1', letter: 'A', label: 'Encontrar clientes', score: 20, tag: 'desafio-clientes' },
        { id: '2', letter: 'B', label: 'Escalar a operação', score: 25, tag: 'desafio-escala' },
        { id: '3', letter: 'C', label: 'Aumentar conversão', score: 25, tag: 'desafio-conversao' },
      ],
    }),
    block('buttons', {
      label: 'Qual seu nível de urgência?',
      variable_name: 'urgencia',
      options: [
        { id: '1', letter: 'A', label: 'Preciso resolver já', score: 35, tag: 'urgente' },
        { id: '2', letter: 'B', label: 'Próximos 30 dias', score: 20 },
        { id: '3', letter: 'C', label: 'Sem urgência', score: 5 },
      ],
    }),
    block('end', {
      content: '✅ Vaga garantida! Em breve enviaremos os detalhes.',
      result_tiers: STD_TIERS_3(['Curioso', 'Engajado', 'Prioridade'], ['#94a3b8', '#3b82f6', '#ef4444'],
        ['Vamos te preparar para o evento.', 'Conteúdo pré-evento personalizado.', 'Atenção VIP no dia!']),
    }),
  );
}

// ───────────── DIAGNÓSTICO ─────────────
function tplDiagnosticoComercial() {
  return chain(
    block('text', { content: '🎯 Em 60 segundos, vamos diagnosticar sua operação comercial.' }),
    block('buttons', { label: 'Possui processo comercial definido?', variable_name: 'processo',
      options: [
        { id: '1', letter: 'A', label: 'Não, é tudo no improviso', score: 5 },
        { id: '2', letter: 'B', label: 'Tenho parcialmente', score: 15 },
        { id: '3', letter: 'C', label: 'Sim, muito bem definido', score: 30, tag: 'processo-ok' },
      ] }),
    block('buttons', { label: 'Quantos leads recebe por mês?', variable_name: 'leads',
      options: [
        { id: '1', letter: 'A', label: 'Até 50', score: 5 },
        { id: '2', letter: 'B', label: '50 a 300', score: 15 },
        { id: '3', letter: 'C', label: 'Mais de 300', score: 30, tag: 'volume-alto' },
      ] }),
    block('buttons', { label: 'Usa CRM?', variable_name: 'crm',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Sim, planilha', score: 10 },
        { id: '3', letter: 'C', label: 'Sim, ferramenta dedicada', score: 25, tag: 'crm-ok' },
      ] }),
    block('buttons', { label: 'Faz follow-up estruturado?', variable_name: 'followup',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0, tag: 'precisa-cadencia' },
        { id: '2', letter: 'B', label: 'Manual', score: 15 },
        { id: '3', letter: 'C', label: 'Automatizado', score: 30 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '🎯 Seu diagnóstico está pronto!',
      result_tiers: STD_TIERS_3(
        ['Comercial Desorganizado', 'Comercial em Construção', 'Comercial Pronto p/ Escalar'],
        ['#f97316', '#3b82f6', '#10b981'],
        ['Vamos estruturar o básico para destravar resultados.',
          'Você está no caminho — pequenos ajustes liberam grande crescimento.',
          'Excelente maturidade. Hora de otimizar e escalar.'],
      ),
    }),
  );
}

function tplDiagnosticoAgencia() {
  return chain(
    block('text', { content: '🏢 Diagnóstico rápido da sua agência.' }),
    block('buttons', { label: 'Quantos clientes ativos?', variable_name: 'clientes',
      options: [
        { id: '1', letter: 'A', label: 'Até 5', score: 10 },
        { id: '2', letter: 'B', label: '6 a 20', score: 25 },
        { id: '3', letter: 'C', label: 'Mais de 20', score: 35, tag: 'agencia-grande' },
      ] }),
    block('buttons', { label: 'Vende projeto ou mensalidade?', variable_name: 'modelo',
      options: [
        { id: '1', letter: 'A', label: 'Só projeto', score: 10 },
        { id: '2', letter: 'B', label: 'Mensalidade', score: 25, tag: 'recorrencia' },
        { id: '3', letter: 'C', label: 'Híbrido', score: 20 },
      ] }),
    block('buttons', { label: 'Operação depende de você?', variable_name: 'dependencia',
      options: [
        { id: '1', letter: 'A', label: 'Sim, totalmente', score: 5, tag: 'gargalo-fundador' },
        { id: '2', letter: 'B', label: 'Parcialmente', score: 15 },
        { id: '3', letter: 'C', label: 'Não, equipe roda', score: 30 },
      ] }),
    block('buttons', { label: 'Tem equipe estruturada?', variable_name: 'equipe',
      options: [
        { id: '1', letter: 'A', label: 'Sou solo', score: 5 },
        { id: '2', letter: 'B', label: 'Até 5 pessoas', score: 20 },
        { id: '3', letter: 'C', label: '6+ pessoas', score: 30 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '🏢 Diagnóstico da agência pronto!',
      result_tiers: STD_TIERS_3(
        ['Agência Operacional', 'Agência em Transição', 'Agência Pronta para Plataforma'],
        ['#f97316', '#3b82f6', '#10b981'],
        ['Foco em construir processos.', 'Estruturando recorrência e equipe.', 'Pronta para escalar com plataforma.'],
      ),
    }),
  );
}

function tplDiagnosticoMarketing() {
  return chain(
    block('text', { content: '📊 Vamos avaliar sua maturidade de marketing.' }),
    block('buttons', { label: 'Você anuncia hoje?', variable_name: 'anuncios',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Pouco', score: 10 },
        { id: '3', letter: 'C', label: 'Sim, com gestor', score: 25, tag: 'trafego-ativo' },
      ] }),
    block('buttons', { label: 'Tem página de captura?', variable_name: 'lp',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Tenho uma', score: 15 },
        { id: '3', letter: 'C', label: 'Várias, otimizadas', score: 30 },
      ] }),
    block('buttons', { label: 'Tem automação de follow-up?', variable_name: 'automacao',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0, tag: 'precisa-automacao' },
        { id: '2', letter: 'B', label: 'E-mail básico', score: 15 },
        { id: '3', letter: 'C', label: 'Cadência multicanal', score: 30 },
      ] }),
    block('buttons', { label: 'Mede conversão?', variable_name: 'metrica',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Planilhas', score: 10 },
        { id: '3', letter: 'C', label: 'Dashboard em tempo real', score: 25 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '📊 Resultado do diagnóstico de marketing.',
      result_tiers: STD_TIERS_3(
        ['Marketing Inicial', 'Marketing Intermediário', 'Marketing Estruturado'],
        ['#f97316', '#3b82f6', '#10b981'],
        ['Começando a estruturar canais.', 'Já capta, falta automação.', 'Operação pronta para escala paga.'],
      ),
    }),
  );
}

// ───────────── NEGÓCIOS ─────────────
function tplEmpresarial() {
  return chain(
    block('text', { content: '💼 Em 1 minuto vamos entender a maturidade do seu negócio.' }),
    block('buttons', { label: 'Qual seu faturamento mensal?', variable_name: 'faturamento',
      options: [
        { id: '1', letter: 'A', label: 'Até R$ 10k', score: 5 },
        { id: '2', letter: 'B', label: 'R$ 10k a R$ 50k', score: 15 },
        { id: '3', letter: 'C', label: 'R$ 50k a R$ 200k', score: 25 },
        { id: '4', letter: 'D', label: 'Acima de R$ 200k', score: 35, tag: 'faixa-premium' },
      ] }),
    block('buttons', { label: 'Tamanho da equipe?', variable_name: 'equipe',
      options: [
        { id: '1', letter: 'A', label: 'Só eu', score: 5 },
        { id: '2', letter: 'B', label: '2 a 10', score: 20 },
        { id: '3', letter: 'C', label: '11+', score: 30 },
      ] }),
    block('buttons', { label: 'Vende recorrência?', variable_name: 'recorrencia',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 5 },
        { id: '2', letter: 'B', label: 'Em parte', score: 15 },
        { id: '3', letter: 'C', label: 'Modelo principal', score: 25, tag: 'recorrencia' },
      ] }),
    block('buttons', { label: 'Qual sua meta nos próximos meses?', variable_name: 'meta',
      options: [
        { id: '1', letter: 'A', label: 'Estabilizar', score: 10 },
        { id: '2', letter: 'B', label: 'Crescer 2x', score: 20 },
        { id: '3', letter: 'C', label: 'Crescer 5x+', score: 30, tag: 'high-growth' },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '💼 Diagnóstico de negócio pronto!',
      result_tiers: STD_TIERS_3(
        ['Negócio Inicial', 'Negócio em Crescimento', 'Pronto para Escala'],
        ['#f97316', '#3b82f6', '#10b981'],
        ['Vamos estruturar bases para crescer.', 'Está crescendo, vamos acelerar.', 'Hora de escalar com previsibilidade.'],
      ),
    }),
  );
}

function tplPerfilCliente() {
  return chain(
    block('text', { content: '🎯 Vamos descobrir seu perfil ideal de compra.' }),
    block('buttons', { label: 'Qual seu objetivo principal?', variable_name: 'objetivo',
      options: [
        { id: '1', letter: 'A', label: 'Aumentar vendas', score: 30, tag: 'vendas' },
        { id: '2', letter: 'B', label: 'Reduzir custos', score: 20, tag: 'custos' },
        { id: '3', letter: 'C', label: 'Estruturar processos', score: 15, tag: 'processos' },
      ] }),
    block('buttons', { label: 'Qual seu momento atual?', variable_name: 'momento',
      options: [
        { id: '1', letter: 'A', label: 'Estagnado', score: 25 },
        { id: '2', letter: 'B', label: 'Crescendo devagar', score: 15 },
        { id: '3', letter: 'C', label: 'Explodindo', score: 10 },
      ] }),
    block('buttons', { label: 'Quanto pretende investir?', variable_name: 'investimento',
      options: [
        { id: '1', letter: 'A', label: 'Até R$ 500/mês', score: 5 },
        { id: '2', letter: 'B', label: 'R$ 500 a R$ 5k', score: 20 },
        { id: '3', letter: 'C', label: 'Acima de R$ 5k', score: 35, tag: 'budget-alto' },
      ] }),
    block('buttons', { label: 'Qual sua urgência?', variable_name: 'urgencia',
      options: [
        { id: '1', letter: 'A', label: 'Já', score: 35, tag: 'urgente' },
        { id: '2', letter: 'B', label: '30 dias', score: 20 },
        { id: '3', letter: 'C', label: 'Sem pressa', score: 5 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '🎯 Seu perfil foi identificado!',
      result_tiers: STD_TIERS_3(
        ['Lead Frio', 'Lead Morno', 'Lead Quente'],
        ['#94a3b8', '#3b82f6', '#ef4444'],
        ['Nutrição via conteúdo.', 'Conversa em breve.', 'Especialista te chama hoje!'],
      ),
    }),
  );
}

function tplMaturidadeDigital() {
  return chain(
    block('text', { content: '💻 Vamos medir a maturidade digital do seu negócio.' }),
    block('buttons', { label: 'Possui site?', variable_name: 'site',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Básico', score: 10 },
        { id: '3', letter: 'C', label: 'Profissional', score: 20 },
      ] }),
    block('buttons', { label: 'Usa anúncios?', variable_name: 'ads',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Eventualmente', score: 10 },
        { id: '3', letter: 'C', label: 'Constantemente', score: 25 },
      ] }),
    block('buttons', { label: 'Usa CRM?', variable_name: 'crm',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Planilha', score: 10 },
        { id: '3', letter: 'C', label: 'Sim', score: 25 },
      ] }),
    block('buttons', { label: 'Usa automações?', variable_name: 'auto',
      options: [
        { id: '1', letter: 'A', label: 'Não', score: 0 },
        { id: '2', letter: 'B', label: 'Pouco', score: 10 },
        { id: '3', letter: 'C', label: 'Sim, várias', score: 30, tag: 'auto-ok' },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '💻 Resultado da sua maturidade digital.',
      result_tiers: STD_TIERS_3(
        ['Digital Básico', 'Digital em Evolução', 'Digital Avançado'],
        ['#f97316', '#3b82f6', '#10b981'],
        ['Comece pelos fundamentos.', 'Estruturando bem.', 'Pronto para automação total.'],
      ),
    }),
  );
}

// ───────────── NICHOS (Beleza) — o SaaS atende UM nicho: beleza ─────────────
function tplCabelo() {
  return chain(
    block('text', { content: '💇‍♀️ Vamos achar o serviço de cabelo ideal pra você!' }),
    block('buttons', { label: 'Qual serviço você quer?', variable_name: 'servico',
      options: [
        { id: '1', letter: 'A', label: 'Corte', score: 15, tag: 'corte' },
        { id: '2', letter: 'B', label: 'Coloração / mechas', score: 25, tag: 'cor' },
        { id: '3', letter: 'C', label: 'Tratamento / progressiva', score: 25, tag: 'tratamento' },
      ] }),
    block('buttons', { label: 'Com que frequência você cuida do cabelo?', variable_name: 'frequencia',
      options: [
        { id: '1', letter: 'A', label: 'Toda semana', score: 30, tag: 'frequente' },
        { id: '2', letter: 'B', label: 'Todo mês', score: 20 },
        { id: '3', letter: 'C', label: 'De vez em quando', score: 10 },
      ] }),
    block('buttons', { label: 'É pra alguma ocasião?', variable_name: 'ocasiao',
      options: [
        { id: '1', letter: 'A', label: 'Tenho um evento próximo', score: 30, tag: 'urgente' },
        { id: '2', letter: 'B', label: 'Quero renovar o visual', score: 20 },
        { id: '3', letter: 'C', label: 'Só manutenção', score: 10 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '💇‍♀️ Perfeito! Já já a gente te chama pra agendar seu horário.',
      result_tiers: STD_TIERS_3(
        ['Curiosa', 'Quer agendar', 'Pronta pra marcar'],
        ['#94a3b8', '#3b82f6', '#ec4899'],
        ['Vamos te mandar dicas e novidades.', 'Vamos te ajudar a escolher o melhor horário.', 'Te chamamos hoje pra garantir seu horário!'],
      ),
    }),
  );
}

function tplUnhas() {
  return chain(
    block('text', { content: '💅 Bora deixar suas unhas impecáveis? Responde rapidinho!' }),
    block('buttons', { label: 'O que você procura?', variable_name: 'servico',
      options: [
        { id: '1', letter: 'A', label: 'Manicure / pedicure', score: 15, tag: 'manicure' },
        { id: '2', letter: 'B', label: 'Alongamento (gel/fibra)', score: 30, tag: 'alongamento' },
        { id: '3', letter: 'C', label: 'Esmaltação em gel', score: 20, tag: 'gel' },
      ] }),
    block('buttons', { label: 'Faz as unhas com que frequência?', variable_name: 'frequencia',
      options: [
        { id: '1', letter: 'A', label: 'A cada 15 dias', score: 30, tag: 'frequente' },
        { id: '2', letter: 'B', label: 'Uma vez por mês', score: 20 },
        { id: '3', letter: 'C', label: 'Raramente', score: 10 },
      ] }),
    block('buttons', { label: 'Curte nail art / decoração?', variable_name: 'estilo',
      options: [
        { id: '1', letter: 'A', label: 'Amo, capricha!', score: 25, tag: 'nail-art' },
        { id: '2', letter: 'B', label: 'Algo discreto', score: 15 },
        { id: '3', letter: 'C', label: 'Só uma cor', score: 10 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '💅 Maravilha! Já já te chamamos pra marcar.',
      result_tiers: STD_TIERS_3(
        ['Curiosa', 'Quer agendar', 'Cliente fiel'],
        ['#94a3b8', '#3b82f6', '#d946ef'],
        ['Vamos te mandar novidades.', 'Vamos achar seu melhor horário.', 'Te chamamos hoje pra agendar!'],
      ),
    }),
  );
}

function tplCilios() {
  return chain(
    block('text', { content: '👁️ Cílios dos sonhos? Responde rapidinho que eu te indico o ideal.' }),
    block('buttons', { label: 'Que estilo você quer?', variable_name: 'estilo',
      options: [
        { id: '1', letter: 'A', label: 'Fio a fio (natural)', score: 15, tag: 'fio-a-fio' },
        { id: '2', letter: 'B', label: 'Volume (mais cheio)', score: 25, tag: 'volume' },
        { id: '3', letter: 'C', label: 'Híbrido', score: 20, tag: 'hibrido' },
      ] }),
    block('buttons', { label: 'Você já fez extensão de cílios antes?', variable_name: 'experiencia',
      options: [
        { id: '1', letter: 'A', label: 'Sim, faço sempre', score: 30, tag: 'cliente-fiel' },
        { id: '2', letter: 'B', label: 'Já fiz uma vez', score: 20 },
        { id: '3', letter: 'C', label: 'Nunca fiz', score: 10, tag: 'primeira-vez' },
      ] }),
    block('buttons', { label: 'É pra alguma data especial?', variable_name: 'ocasiao',
      options: [
        { id: '1', letter: 'A', label: 'Sim, evento próximo', score: 30, tag: 'urgente' },
        { id: '2', letter: 'B', label: 'Quero pro dia a dia', score: 20 },
        { id: '3', letter: 'C', label: 'Só pesquisando', score: 10 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '👁️ Que delícia! Já já te chamamos pra agendar a aplicação.',
      result_tiers: STD_TIERS_3(
        ['Curiosa', 'Quer marcar', 'Pronta pra aplicar'],
        ['#94a3b8', '#3b82f6', '#8b5cf6'],
        ['Vamos te mandar dicas de cuidado.', 'Vamos achar seu horário.', 'Te chamamos hoje pra garantir a data!'],
      ),
    }),
  );
}

function tplSobrancelha() {
  return chain(
    block('text', { content: '✨ Vamos desenhar a sobrancelha perfeita pro seu rosto!' }),
    block('buttons', { label: 'Qual serviço te interessa?', variable_name: 'servico',
      options: [
        { id: '1', letter: 'A', label: 'Design / limpeza', score: 15, tag: 'design' },
        { id: '2', letter: 'B', label: 'Design com henna', score: 25, tag: 'henna' },
        { id: '3', letter: 'C', label: 'Micropigmentação', score: 30, tag: 'micro' },
      ] }),
    block('buttons', { label: 'Como estão suas sobrancelhas hoje?', variable_name: 'estado',
      options: [
        { id: '1', letter: 'A', label: 'Bem falhadas', score: 25, tag: 'falhas' },
        { id: '2', letter: 'B', label: 'Sem formato definido', score: 20 },
        { id: '3', letter: 'C', label: 'Só precisam de manutenção', score: 10 },
      ] }),
    block('buttons', { label: 'Com que frequência você faz?', variable_name: 'frequencia',
      options: [
        { id: '1', letter: 'A', label: 'Todo mês', score: 25, tag: 'frequente' },
        { id: '2', letter: 'B', label: 'De vez em quando', score: 15 },
        { id: '3', letter: 'C', label: 'É a primeira vez', score: 10, tag: 'primeira-vez' },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '✨ Perfeito! Já já te chamamos pra marcar seu design.',
      result_tiers: STD_TIERS_3(
        ['Curiosa', 'Quer agendar', 'Pronta pra marcar'],
        ['#94a3b8', '#3b82f6', '#f59e0b'],
        ['Vamos te mandar dicas.', 'Vamos achar seu horário.', 'Te chamamos hoje!'],
      ),
    }),
  );
}

function tplMaquiagem() {
  return chain(
    block('text', { content: '💄 Make dos sonhos? Me conta a ocasião que eu te ajudo!' }),
    block('buttons', { label: 'Pra qual ocasião é a maquiagem?', variable_name: 'ocasiao',
      options: [
        { id: '1', letter: 'A', label: 'Noiva / madrinha', score: 35, tag: 'noiva' },
        { id: '2', letter: 'B', label: 'Festa / formatura', score: 25, tag: 'festa' },
        { id: '3', letter: 'C', label: 'Social / dia a dia', score: 15, tag: 'social' },
      ] }),
    block('buttons', { label: 'Quando é o evento?', variable_name: 'quando',
      options: [
        { id: '1', letter: 'A', label: 'Nas próximas 2 semanas', score: 35, tag: 'urgente' },
        { id: '2', letter: 'B', label: 'Neste mês', score: 20 },
        { id: '3', letter: 'C', label: 'Ainda sem data', score: 10 },
      ] }),
    block('buttons', { label: 'Quer um teste de maquiagem antes?', variable_name: 'teste',
      options: [
        { id: '1', letter: 'A', label: 'Sim, quero garantir', score: 25, tag: 'quer-teste' },
        { id: '2', letter: 'B', label: 'Talvez', score: 15 },
        { id: '3', letter: 'C', label: 'Não precisa', score: 10 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '💄 Amei! Já já te chamamos pra alinhar tudo e agendar.',
      result_tiers: STD_TIERS_3(
        ['Pesquisando', 'Quer agendar', 'Data marcada!'],
        ['#94a3b8', '#3b82f6', '#f43f5e'],
        ['Vamos te mandar referências.', 'Vamos reservar sua data.', 'Atendimento prioritário pra sua data!'],
      ),
    }),
  );
}

function tplEstetica() {
  return chain(
    block('text', { content: '🧖‍♀️ Hora de se cuidar! Responde rapidinho que eu te indico o ideal.' }),
    block('buttons', { label: 'Qual serviço você procura?', variable_name: 'servico',
      options: [
        { id: '1', letter: 'A', label: 'Limpeza de pele', score: 20, tag: 'limpeza' },
        { id: '2', letter: 'B', label: 'Depilação', score: 15, tag: 'depilacao' },
        { id: '3', letter: 'C', label: 'Massagem / relax', score: 20, tag: 'massagem' },
      ] }),
    block('buttons', { label: 'É a primeira vez ou faz com frequência?', variable_name: 'frequencia',
      options: [
        { id: '1', letter: 'A', label: 'Faço sempre', score: 30, tag: 'frequente' },
        { id: '2', letter: 'B', label: 'Já fiz algumas vezes', score: 20 },
        { id: '3', letter: 'C', label: 'É a primeira vez', score: 10, tag: 'primeira-vez' },
      ] }),
    block('buttons', { label: 'Qual sua prioridade agora?', variable_name: 'objetivo',
      options: [
        { id: '1', letter: 'A', label: 'Resolver algo específico', score: 30, tag: 'urgente' },
        { id: '2', letter: 'B', label: 'Autocuidado / relaxar', score: 20 },
        { id: '3', letter: 'C', label: 'Só conhecer', score: 10 },
      ] }),
    captureName(), captureWhatsapp(),
    block('end', {
      content: '🧖‍♀️ Maravilha! Já já te chamamos pra agendar seu cuidado.',
      result_tiers: STD_TIERS_3(
        ['Curiosa', 'Quer agendar', 'Pronta pra marcar'],
        ['#94a3b8', '#3b82f6', '#14b8a6'],
        ['Vamos te mandar dicas.', 'Vamos achar seu horário.', 'Te chamamos hoje pra agendar!'],
      ),
    }),
  );
}

// ───────────── CATÁLOGO ─────────────
export const QUIZ_TEMPLATES: QuizTemplate[] = [
  // Captação
  { id: 'captura-simples', name: 'Quiz de Captura Simples', description: 'Capture nome, WhatsApp e principal interesse em poucos segundos.',
    category: 'captacao', objective: 'Captar leads rápido', icon: '⚡', cover_gradient: 'from-emerald-500 to-teal-600',
    estimated_time: '30s', question_count: 1, flow_blocks: tplCapturaSimples(),
    badges: ['mais-usado', 'alta-conversao'] },
  { id: 'lista-espera', name: 'Quiz Lista de Espera', description: 'Captura leads para lançamento, evento ou produto futuro.',
    category: 'captacao', objective: 'Pré-lançamento', icon: '🚀', cover_gradient: 'from-violet-500 to-purple-600',
    estimated_time: '50s', question_count: 2, flow_blocks: tplListaEspera(),
    badges: ['recomendado'] },
  { id: 'evento-aula', name: 'Quiz Evento / Aula Ao Vivo', description: 'Capture inscritos e descubra o perfil antes do evento.',
    category: 'captacao', objective: 'Inscrição em evento', icon: '🎟️', cover_gradient: 'from-pink-500 to-rose-600',
    estimated_time: '60s', question_count: 3, flow_blocks: tplEvento(),
    badges: ['evento', 'recomendado'] },

  // Diagnóstico
  { id: 'diag-comercial', name: 'Diagnóstico Comercial', description: 'Avalia maturidade comercial e revela gargalos da operação de vendas.',
    category: 'diagnostico', objective: 'Diagnóstico de vendas', icon: '🎯', cover_gradient: 'from-blue-500 to-indigo-600',
    estimated_time: '60s', question_count: 4, flow_blocks: tplDiagnosticoComercial(),
    badges: ['diagnostico', 'mais-usado'] },
  { id: 'diag-agencia', name: 'Diagnóstico de Agência', description: 'Avalia operação, recorrência e dependência do fundador.',
    category: 'diagnostico', objective: 'Diagnóstico de agência', icon: '🏢', cover_gradient: 'from-cyan-500 to-blue-600',
    estimated_time: '60s', question_count: 4, flow_blocks: tplDiagnosticoAgencia(),
    badges: ['diagnostico'] },
  { id: 'diag-marketing', name: 'Diagnóstico de Marketing', description: 'Avalia maturidade de marketing e funil de aquisição.',
    category: 'diagnostico', objective: 'Diagnóstico de marketing', icon: '📊', cover_gradient: 'from-amber-500 to-orange-600',
    estimated_time: '60s', question_count: 4, flow_blocks: tplDiagnosticoMarketing(),
    badges: ['diagnostico'] },

  // Negócios
  { id: 'empresarial', name: 'Quiz Empresarial', description: 'Mede maturidade do negócio: faturamento, equipe, recorrência e meta.',
    category: 'negocios', objective: 'Qualificação B2B', icon: '💼', cover_gradient: 'from-slate-600 to-slate-800',
    estimated_time: '60s', question_count: 4, flow_blocks: tplEmpresarial(),
    badges: ['mais-usado'] },
  { id: 'perfil-cliente', name: 'Quiz de Perfil de Cliente', description: 'Segmenta leads como frio, morno ou quente com base no perfil de compra.',
    category: 'negocios', objective: 'Qualificação por perfil', icon: '🎯', cover_gradient: 'from-red-500 to-pink-600',
    estimated_time: '60s', question_count: 4, flow_blocks: tplPerfilCliente(),
    badges: ['alta-conversao'] },
  { id: 'maturidade-digital', name: 'Quiz de Maturidade Digital', description: 'Avalia nível digital — site, ads, CRM, automações e base.',
    category: 'negocios', objective: 'Maturidade digital', icon: '💻', cover_gradient: 'from-indigo-500 to-blue-700',
    estimated_time: '60s', question_count: 4, flow_blocks: tplMaturidadeDigital(),
    badges: ['recomendado'] },

  // Nichos (Beleza) — o SaaS atende um nicho: beleza.
  { id: 'beleza-cabelo', name: 'Quiz Salão de Cabelo', description: 'Descobre o serviço ideal — corte, cor ou tratamento — e a urgência da cliente.',
    category: 'nichos', objective: 'Cabeleireira', icon: '💇‍♀️', cover_gradient: 'from-pink-500 to-rose-600',
    estimated_time: '50s', question_count: 3, flow_blocks: tplCabelo(),
    badges: ['nicho', 'alta-conversao'] },
  { id: 'beleza-unhas', name: 'Quiz Manicure & Nail', description: 'Qualifica por serviço (manicure, alongamento, gel) e frequência.',
    category: 'nichos', objective: 'Unhas / Nail Designer', icon: '💅', cover_gradient: 'from-fuchsia-500 to-pink-600',
    estimated_time: '50s', question_count: 3, flow_blocks: tplUnhas(),
    badges: ['nicho'] },
  { id: 'beleza-cilios', name: 'Quiz Lash Designer', description: 'Identifica o estilo de cílios (volume, fio a fio, híbrido) e a ocasião.',
    category: 'nichos', objective: 'Cílios / Extensão', icon: '👁️', cover_gradient: 'from-violet-500 to-purple-600',
    estimated_time: '50s', question_count: 3, flow_blocks: tplCilios(),
    badges: ['nicho'] },
  { id: 'beleza-sobrancelha', name: 'Quiz Design de Sobrancelhas', description: 'Qualifica por serviço (design, henna, micro) e estado das sobrancelhas.',
    category: 'nichos', objective: 'Sobrancelhas', icon: '✨', cover_gradient: 'from-amber-500 to-orange-600',
    estimated_time: '50s', question_count: 3, flow_blocks: tplSobrancelha(),
    badges: ['nicho'] },
  { id: 'beleza-maquiagem', name: 'Quiz Maquiagem & Make', description: 'Descobre a ocasião (noiva, festa, social) e a data — qualifica por urgência.',
    category: 'nichos', objective: 'Maquiagem', icon: '💄', cover_gradient: 'from-rose-500 to-red-600',
    estimated_time: '50s', question_count: 3, flow_blocks: tplMaquiagem(),
    badges: ['nicho', 'evento'] },
  { id: 'beleza-estetica', name: 'Quiz Estética & Depilação', description: 'Qualifica por serviço (limpeza, depilação, massagem) e frequência.',
    category: 'nichos', objective: 'Estética', icon: '🧖‍♀️', cover_gradient: 'from-teal-500 to-emerald-600',
    estimated_time: '50s', question_count: 3, flow_blocks: tplEstetica(),
    badges: ['nicho'] },
];

export const CATEGORY_LABELS: Record<QuizCategory, string> = {
  captacao: 'Captação',
  diagnostico: 'Diagnóstico',
  negocios: 'Negócios',
  nichos: 'Nichos',
  qualificacao: 'Qualificação',
  recomendacao: 'Recomendação',
  educacional: 'Educacional',
};

export const BADGE_LABELS: Record<QuizBadge, string> = {
  'mais-usado': 'Mais usado',
  'recomendado': 'Recomendado',
  'alta-conversao': 'Alta conversão',
  'diagnostico': 'Diagnóstico',
  'evento': 'Evento',
  'nicho': 'Nicho específico',
  'ia': 'IA',
};
