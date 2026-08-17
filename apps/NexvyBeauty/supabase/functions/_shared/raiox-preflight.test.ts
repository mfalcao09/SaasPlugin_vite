import { assert, assertEquals, assertFalse } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  RAIOX_PREFLIGHT_TEXT,
  RAIOX_TAG,
  deveLiberarRaiox,
  ensureRaioxPreflight,
  inboundConfirmaPreflight,
  isRaioxUrl,
  stripRaioxArtifacts,
} from './raiox-preflight.ts';

Deno.test('isRaioxUrl: só implantação', () => {
  assert(isRaioxUrl('https://app.nexvybeauty.com.br/implantacao/abc'));
  assertFalse(isRaioxUrl('https://app.nexvybeauty.com.br/planos'));
});

Deno.test('caso medido: "Sim, pode ser que sim" NÃO libera sem preflight', () => {
  assertFalse(deveLiberarRaiox({
    preflightAsked: false,
    inboundText: 'Sim, pode ser que sim',
  }));
});

Deno.test('depois do preflight, confirmação curta LIBERA', () => {
  assert(deveLiberarRaiox({
    preflightAsked: true,
    inboundText: 'Não, pode mandar',
  }));
  assert(deveLiberarRaiox({
    preflightAsked: true,
    inboundText: 'Entendi, pode enviar',
  }));
});

Deno.test('pergunta nova NÃO libera mesmo com aceite misturado', () => {
  assertFalse(inboundConfirmaPreflight('ok, mas ele pega minha senha?'));
  assertFalse(inboundConfirmaPreflight('É seguro?'));
  assertFalse(deveLiberarRaiox({
    preflightAsked: true,
    inboundText: 'Não tô confiando',
  }));
});

Deno.test('ensureRaioxPreflight: tag+URL viram a pergunta, sem link', () => {
  const out = ensureRaioxPreflight(
    `Boa! Já te mando ${RAIOX_TAG}\nhttps://app.nexvybeauty.com.br/implantacao/TOKEN`,
  );
  assertFalse(out.includes(RAIOX_TAG));
  assertFalse(isRaioxUrl(out));
  assert(out.includes(RAIOX_PREFLIGHT_TEXT));
});

Deno.test('stripRaioxArtifacts remove tag e URL e preserva o resto', () => {
  const out = stripRaioxArtifacts(`Opa ${RAIOX_TAG} https://app.nexvybeauty.com.br/implantacao/x`);
  assertEquals(out.includes(RAIOX_TAG), false);
  assertEquals(isRaioxUrl(out), false);
  assert(out.startsWith('Opa'));
});
