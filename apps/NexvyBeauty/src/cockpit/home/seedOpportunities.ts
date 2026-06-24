// ─── Oportunidades-EXEMPLO (seed) ───────────────────────────────────────
// Mostradas na Home quando a conta ainda NÃO tem análise real (0 conversas).
// Rotuladas "(exemplo)" na UI + CTA "conecte seu WhatsApp". Telefone = null
// de propósito: em seed-mode o card NÃO dispara envio (seria mentira/erro).
// É a dívida da Onda 1 (blueprint VITRINE §4.3/§8.1.5): tela vazia que vende.

import type { OpportunityCardData } from '@/cockpit/types'

export const SEED_OPPORTUNITIES: OpportunityCardData[] = [
  {
    id: 'exemplo-1',
    leadId: null,
    name: 'Júlia M. (exemplo)',
    phone: null,
    classification: 'hot',
    dealValue: 180,
    reason: 'Sumiu há 32 dias — costumava vir todo mês',
    followupMessage:
      'Oi Júlia! Senti sua falta aqui no salão 💕 Faz um tempinho... que tal agendar aquele seu horário de sempre essa semana? Tenho um mimo reservado pra você 🎁',
  },
  {
    id: 'exemplo-2',
    leadId: null,
    name: 'Marcos R. (exemplo)',
    phone: null,
    classification: 'hot',
    dealValue: 150,
    reason: 'Pediu orçamento e não voltou',
    followupMessage:
      'Oi Marcos! Vi que você se interessou no combo corte + barba. Ainda quer fechar? Consigo te encaixar ainda essa semana 😉',
  },
  {
    id: 'exemplo-3',
    leadId: null,
    name: 'Bia F. (exemplo)',
    phone: null,
    classification: 'warm',
    dealValue: 120,
    reason: 'Aniversário semana que vem 🎂',
    followupMessage:
      'Oi Bia! Seu aniversário tá chegando 🎂 Que tal comemorar com aquela escova caprichada? Preparei um desconto especial de niver pra você!',
  },
]
