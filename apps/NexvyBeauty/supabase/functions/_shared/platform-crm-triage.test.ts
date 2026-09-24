import {
  isPromotableTriage,
  legacySegmentFromTriage,
  triageFromLegacySegment,
} from './platform-crm-triage.ts';

Deno.test('triagem mapeia o legado para os baldes canônicos', () => {
  if (triageFromLegacySegment('salao_cliente') !== 'principal') throw new Error('principal');
  if (triageFromLegacySegment('afiliado_infoproduto') !== 'semente') throw new Error('semente');
  if (triageFromLegacySegment('revisao') !== 'nao_classificado') throw new Error('não classificado');
  if (triageFromLegacySegment('descarte') !== 'remocao_confirmada') throw new Error('remoção');
});

Deno.test('projeção legada não confunde remoção reversível com lixeira', () => {
  if (legacySegmentFromTriage('remocao_confirmada') !== 'revisao') throw new Error('projection');
  if (!isPromotableTriage('principal') || !isPromotableTriage('semente')) throw new Error('promotable');
  if (isPromotableTriage('nao_classificado') || isPromotableTriage('remocao_confirmada')) throw new Error('not promotable');
});
