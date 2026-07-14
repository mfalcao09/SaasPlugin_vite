// Templates de Fluxo de WhatsApp — espelham o quizTemplates.ts.
// Fluxo de WhatsApp e Quiz compartilham a MESMA tabela (capture_funnels) e a MESMA
// estrutura (FunnelBlock[]); muda só o channel_type. Por isso reusamos block()/chain()
// e a galeria cria via createFunnel({ channel_type: 'whatsapp', flow_blocks }).
import { FunnelBlock, generateBlockId } from '@/types/funnel';
import type { QuizCategory } from '@/data/quizTemplates';

export interface WhatsAppTemplate {
  id: string;
  name: string;
  description: string;
  category: QuizCategory; // captacao | diagnostico | negocios | nichos
  icon: string;
  cover_gradient: string;
  estimated_time: string;
  step_count: number;
  flow_blocks: FunnelBlock[];
}

// ───────────── Helpers (mesmo padrão do quizTemplates) ─────────────
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

const btn = (label: string, variable_name: string, options: string[]) =>
  block('buttons', {
    label,
    variable_name,
    options: options.map((label, i) => ({ id: String(i + 1), label })),
  });

// ───────────── CAPTAÇÃO ─────────────
function tplBoasVindas() {
  return chain(
    block('message', { content: 'Oi! 👋 Que bom te ver por aqui. Sou a assistente do espaço e já te ajudo.' }),
    btn('O que você procura hoje?', 'interesse', ['Agendar um horário', 'Saber preços', 'Falar com alguém']),
    block('create_lead', { content: 'Perfeito! Já anotei seu contato. 💖' }),
    block('end', { content: 'Em instantes alguém da equipe fala com você. Obrigada! 🌸' }),
  );
}

function tplAgendamento() {
  return chain(
    block('message', { content: 'Vamos agendar seu horário? ✨ É rapidinho.' }),
    btn('Qual serviço você quer?', 'servico', ['Cabelo', 'Unhas', 'Cílios', 'Outro']),
    block('schedule', { content: 'Escolha o melhor dia e horário 👇', schedule_message: 'Escolha um horário disponível' }),
    block('create_lead', { content: 'Agendamento quase pronto!' }),
    block('end', { content: 'Prontinho! Te esperamos. 💅 Qualquer coisa, é só chamar aqui.' }),
  );
}

// ───────────── DIAGNÓSTICO ─────────────
function tplDiagnostico() {
  return chain(
    block('message', { content: 'Bora descobrir o melhor cuidado pra você? Só 2 perguntas. 🔍' }),
    btn('Como você está hoje?', 'situacao', ['Quero mudar o visual', 'Manter o que tenho', 'Resolver um problema']),
    btn('O que mais te incomoda?', 'dor', ['Falta de tempo', 'Não sei o que fazer', 'Preço']),
    block('message', { content: 'Com base nas suas respostas, já temos a recomendação ideal pra você. 💡' }),
    block('create_lead', { content: '' }),
    block('end', { content: 'Vou te passar pra uma especialista montar seu plano. 🌟' }),
  );
}

// ───────────── NEGÓCIOS ─────────────
function tplReativacao() {
  return chain(
    block('message', { content: 'Senti sua falta! 💕 Faz um tempinho que você não aparece...' }),
    btn('Que tal voltar com um mimo especial?', 'reativacao', ['Quero! Me manda a oferta', 'Talvez mais pra frente']),
    block('schedule', { content: 'Escolha um horário e o desconto é seu 👇' }),
    block('end', { content: 'Te esperamos de volta! 🥰' }),
  );
}

function tplPosAtendimento() {
  return chain(
    block('message', { content: 'Oi! Como foi seu atendimento com a gente? 💬' }),
    btn('De 0 a 10, quanto você recomendaria?', 'nps', ['9 ou 10 — Amei!', '7 ou 8 — Foi bom', 'Abaixo de 7']),
    block('message', { content: 'Muito obrigada pelo carinho! Sua opinião ajuda demais. 🌸' }),
    block('end', { content: 'Até a próxima! 💖' }),
  );
}

// ───────────── NICHO (beleza) ─────────────
function tplAtendimentoBeleza() {
  return chain(
    block('message', { content: 'Oi, linda! 💖 Bem-vinda ao nosso espaço de beleza. Como posso te ajudar?' }),
    btn('Qual seu interesse?', 'interesse', ['Cabelo', 'Unhas / Nail', 'Cílios / Sobrancelha', 'Estética facial']),
    btn('É a primeira vez com a gente?', 'primeira_vez', ['Sim, primeira vez', 'Já sou cliente']),
    block('create_lead', { content: 'Anotado! 📝' }),
    block('handoff', { content: 'Vou te passar pra nossa equipe finalizar com todo carinho. 💅', handoff_message: 'Nova cliente quer atendimento' }),
    block('end', { content: 'Já já alguém te chama aqui. 🌟' }),
  );
}

// ───────────── Catálogo ─────────────
export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'wa-boas-vindas',
    name: 'Boas-vindas + Captura',
    description: 'Responde a primeira mensagem, descobre o interesse e já cria o lead.',
    category: 'captacao',
    icon: '👋',
    cover_gradient: 'from-pink-400 to-rose-500',
    estimated_time: '30s',
    step_count: 3,
    flow_blocks: tplBoasVindas(),
  },
  {
    id: 'wa-agendamento',
    name: 'Agendamento Direto',
    description: 'Da primeira mensagem ao horário marcado, sem você levantar um dedo.',
    category: 'captacao',
    icon: '📅',
    cover_gradient: 'from-fuchsia-400 to-pink-500',
    estimated_time: '1 min',
    step_count: 4,
    flow_blocks: tplAgendamento(),
  },
  {
    id: 'wa-diagnostico',
    name: 'Diagnóstico Rápido',
    description: 'Faz 2 perguntas e recomenda o melhor cuidado antes de passar pra especialista.',
    category: 'diagnostico',
    icon: '🔍',
    cover_gradient: 'from-blue-400 to-indigo-500',
    estimated_time: '1 min',
    step_count: 4,
    flow_blocks: tplDiagnostico(),
  },
  {
    id: 'wa-reativacao',
    name: 'Reativação de Cliente',
    description: 'Chama quem sumiu com um mimo e já oferece horário pra voltar.',
    category: 'negocios',
    icon: '💕',
    cover_gradient: 'from-emerald-400 to-green-500',
    estimated_time: '30s',
    step_count: 2,
    flow_blocks: tplReativacao(),
  },
  {
    id: 'wa-pos-atendimento',
    name: 'Pós-atendimento (NPS)',
    description: 'Mede a satisfação logo após o serviço e agradece o feedback.',
    category: 'negocios',
    icon: '⭐',
    cover_gradient: 'from-teal-400 to-cyan-500',
    estimated_time: '30s',
    step_count: 3,
    flow_blocks: tplPosAtendimento(),
  },
  {
    id: 'wa-atendimento-beleza',
    name: 'Atendimento Beleza',
    description: 'Recebe a cliente, descobre o serviço e passa pra equipe — com a cara do seu espaço.',
    category: 'nichos',
    icon: '💅',
    cover_gradient: 'from-purple-400 to-fuchsia-500',
    estimated_time: '1 min',
    step_count: 4,
    flow_blocks: tplAtendimentoBeleza(),
  },
];
