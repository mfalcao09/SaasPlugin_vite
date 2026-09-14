/**
 * Testes do motor de roteiro da comanda multi-serviço.
 *
 * Rodar:
 *   deno test --no-check apps/NexvyBeauty/supabase/functions/_shared/comanda-roteiro.test.ts
 *
 * Os 3 primeiros blocos são o check binário acordado antes de escrever a Fase 1.
 * Cada um existe porque o motor ANTIGO errava exatamente ali:
 *
 *   FRACIONADO   — antes respondia "sem horários disponíveis" e perdia a venda.
 *   BACK-TO-BACK — antes a grade de 30min inflava 70min de serviço em 90 de agenda.
 *   PAUSA        — antes o almoço do profissional não existia no modelo.
 */
import { assertEquals } from 'https://deno.land/std@0.224.0/assert/mod.ts';
import {
  faseDoServico,
  horaParaMinutos as hm,
  minutosParaHora as mh,
  montarRoteiros,
  ordenarPorPrecedencia,
  podeExecutar,
  type ProfissionalAgenda,
  type ServicoComanda,
} from './comanda-roteiro.ts';

function serv(nome: string, dur: number, categoria: string | null = null): ServicoComanda {
  return { servico_id: `sv-${nome}`, nome, categoria, duracao_minutos: dur };
}
function prof(
  nome: string,
  jornada: [string, string],
  extra: Partial<ProfissionalAgenda> = {},
): ProfissionalAgenda {
  return {
    id: `pf-${nome}`,
    nome,
    especialidades: [],
    inicio: hm(jornada[0]),
    fim: hm(jornada[1]),
    ocupados: [],
    ...extra,
  };
}
const ocupa = (de: string, ate: string) => ({ inicio: hm(de), fim: hm(ate) });

// ─── CHECK 1: fracionamento (gap scheduling) ─────────────────────────────────

Deno.test('fracionado: 2x45min com 2 janelas de 45min separadas por 45min', () => {
  // Jornada 14:00–17:15, ocupado 14:45–15:30 e 16:15–17:15.
  // Janelas livres: 14:00–14:45 e 15:30–16:15 → cabem os dois serviços, mas NÃO
  // existe bloco corrido de 90min. O motor antigo devolveria zero opções.
  const camila = prof('Camila', ['14:00', '17:15'], {
    ocupados: [ocupa('14:45', '15:30'), ocupa('16:15', '17:15')],
  });
  const roteiros = montarRoteiros({
    servicos: [serv('Corte feminino', 45), serv('Escova', 45)],
    profissionais: [camila],
    modo: 'auto',
  });

  const fracionados = roteiros.filter((r) => r.tipo === 'fracionado');
  assertEquals(fracionados.length > 0, true, 'tinha que existir ao menos um roteiro fracionado');

  const r = fracionados[0];
  assertEquals(r.itens.length, 2);
  assertEquals(mh(r.itens[0].inicio), '14:00');
  assertEquals(mh(r.itens[0].fim), '14:45');
  assertEquals(mh(r.itens[1].inicio), '15:30'); // pulou o bloco ocupado
  assertEquals(mh(r.itens[1].fim), '16:15');
  assertEquals(r.espera_minutos, 45);
});

Deno.test('fracionado: sem janela suficiente no dia devolve lista vazia', () => {
  const so30 = prof('Renata', ['09:00', '09:30']);
  const roteiros = montarRoteiros({
    servicos: [serv('Coloração', 120)],
    profissionais: [so30],
    modo: 'auto',
  });
  assertEquals(roteiros.length, 0);
});

// ─── CHECK 2: back-to-back (fim do encaixe rígido de 30 em 30) ───────────────

Deno.test('back-to-back: Barba 20min + Corte 50min ocupa 70min, não 90', () => {
  const juliana = prof('Juliana', ['09:00', '19:00']);
  const roteiros = montarRoteiros({
    servicos: [serv('Barba', 20), serv('Corte feminino', 50)],
    profissionais: [juliana],
    modo: 'auto',
  });

  const r = roteiros[0];
  assertEquals(r.tipo, 'continuo');
  assertEquals(r.espera_minutos, 0);
  // Corte (fase 30) vem antes de Barba (independente, fase 60).
  assertEquals(r.itens.map((i) => i.nome), ['Corte feminino', 'Barba']);
  assertEquals(mh(r.inicio), '09:00');
  assertEquals(mh(r.itens[0].fim), '09:50');
  assertEquals(mh(r.itens[1].inicio), '09:50', 'o 2º item tem que colar no fim do 1º');
  assertEquals(mh(r.fim), '10:10');
  assertEquals(r.fim - r.inicio, 70);
});

Deno.test('back-to-back: encaixa colado no fim de um agendamento existente', () => {
  // Ocupado até 14:40 — o motor tem que oferecer 14:40, não só 15:00.
  const camila = prof('Camila', ['09:00', '19:00'], { ocupados: [ocupa('09:00', '14:40')] });
  const roteiros = montarRoteiros({
    servicos: [serv('Corte feminino', 50)],
    profissionais: [camila],
    modo: 'auto',
  });
  assertEquals(mh(roteiros[0].inicio), '14:40');
});

// ─── CHECK 3: pausa / intervalo ──────────────────────────────────────────────

Deno.test('pausa: nenhum roteiro invade o intervalo 12:00-13:00', () => {
  const camila = prof('Camila', ['09:00', '18:00'], {
    intervalo: { inicio: hm('12:00'), fim: hm('13:00') },
  });
  const roteiros = montarRoteiros({
    servicos: [serv('Coloração', 60)],
    profissionais: [camila],
    modo: 'auto',
    max_roteiros: 50,
  });

  assertEquals(roteiros.length > 0, true);
  const invasores = roteiros.filter((r) =>
    r.itens.some((i) => i.inicio < hm('13:00') && hm('12:00') < i.fim)
  );
  assertEquals(invasores.length, 0, 'algum roteiro atravessou a pausa');
  // E continua oferecendo o encaixe colado no fim do almoço.
  assertEquals(roteiros.some((r) => mh(r.inicio) === '13:00'), true);
});

Deno.test('pausa: comanda longa não é espremida dentro do intervalo', () => {
  const juliana = prof('Juliana', ['09:00', '18:00'], {
    intervalo: { inicio: hm('12:00'), fim: hm('13:00') },
    ocupados: [ocupa('09:00', '11:30')],
  });
  // Sobram 30min antes do almoço; a comanda de 90min tem que ir para depois dele.
  const roteiros = montarRoteiros({
    servicos: [serv('Coloração', 90)],
    profissionais: [juliana],
    modo: 'auto',
  });
  assertEquals(mh(roteiros[0].inicio), '13:00');
});

// ─── Precedência técnica ─────────────────────────────────────────────────────

Deno.test('precedência: química → tratamento → corte → escova', () => {
  const entrada = [
    serv('Escova', 40),
    serv('Corte feminino', 50),
    serv('Hidratação', 50),
    serv('Coloração', 120),
  ];
  assertEquals(
    ordenarPorPrecedencia(entrada).map((s) => s.nome),
    ['Coloração', 'Hidratação', 'Corte feminino', 'Escova'],
  );
});

Deno.test('precedência: serviços independentes vão depois do circuito capilar', () => {
  const entrada = [serv('Esmaltação em gel', 60, 'UNHAS'), serv('Coloração', 120, 'CABELO')];
  assertEquals(
    ordenarPorPrecedencia(entrada).map((s) => s.nome),
    ['Coloração', 'Esmaltação em gel'],
  );
});

Deno.test('precedência: combo assume a fase mais cedo que participa', () => {
  // "Corte + escova" tem que cair depois da coloração, não antes.
  assertEquals(faseDoServico(serv('Corte + escova', 80)) > faseDoServico(serv('Coloração', 120)), true);
});

// ─── Matriz de especialidades ────────────────────────────────────────────────

Deno.test('especialidades: casa por nome ou categoria; lista vazia faz tudo', () => {
  const manicure = prof('Camila', ['09:00', '19:00'], { especialidades: ['Manicure'] });
  const coringa = prof('Renata', ['09:00', '19:00'], { especialidades: [] });
  assertEquals(podeExecutar(manicure, serv('Manicure e pedicure', 60)), true);
  assertEquals(podeExecutar(manicure, serv('Coloração', 120, 'CABELO')), false);
  assertEquals(podeExecutar(coringa, serv('Coloração', 120, 'CABELO')), true);
});

Deno.test('especialidades: ninguém apto vira fail-open (dado mal preenchido não trava venda)', () => {
  const so_unhas = prof('Camila', ['09:00', '19:00'], { especialidades: ['Manicure'] });
  const roteiros = montarRoteiros({
    servicos: [serv('Massagem relaxante', 60, 'ESTETICA')],
    profissionais: [so_unhas],
    modo: 'auto',
  });
  assertEquals(roteiros.length > 0, true, 'deveria alocar mesmo sem especialista declarado');
});

// ─── Modos de preferência ────────────────────────────────────────────────────

Deno.test('modo unico: só entra quem cobre 100% da comanda', () => {
  const camila = prof('Camila', ['09:00', '19:00'], { especialidades: ['Manicure'] });
  const juliana = prof('Juliana', ['09:00', '19:00'], { especialidades: ['Manicure', 'Corte feminino'] });
  const servicos = [serv('Manicure', 60), serv('Corte feminino', 50)];

  const unico = montarRoteiros({ servicos, profissionais: [camila, juliana], modo: 'unico' });
  assertEquals(unico.length > 0, true);
  for (const r of unico) assertEquals(r.profissionais_ids, [juliana.id]);
});

Deno.test('modo unico com preferido: é ELE ou ninguém, nunca cai em outro', () => {
  // "Quero tudo com a Camila" não pode devolver roteiro da Juliana.
  const camila = prof('Camila', ['09:00', '19:00']);
  const juliana = prof('Juliana', ['09:00', '19:00']);
  const roteiros = montarRoteiros({
    servicos: [serv('Corte feminino', 50)],
    profissionais: [camila, juliana],
    modo: 'unico',
    profissional_preferido_id: camila.id,
  });
  assertEquals(roteiros.length > 0, true);
  for (const r of roteiros) assertEquals(r.profissionais_ids, [camila.id]);
});

Deno.test('modo unico com preferido lotado: devolve vazio em vez de trocar de pessoa', () => {
  const camila = prof('Camila', ['09:00', '19:00'], { ocupados: [ocupa('09:00', '19:00')] });
  const juliana = prof('Juliana', ['09:00', '19:00']);
  const roteiros = montarRoteiros({
    servicos: [serv('Corte feminino', 50)],
    profissionais: [camila, juliana],
    modo: 'unico',
    profissional_preferido_id: camila.id,
  });
  assertEquals(roteiros.length, 0);
});

Deno.test('modo unico: sem ninguém cobrindo tudo devolve vazio (UI sugere dividir)', () => {
  const camila = prof('Camila', ['09:00', '19:00'], { especialidades: ['Manicure'] });
  const juliana = prof('Juliana', ['09:00', '19:00'], { especialidades: ['Corte feminino'] });
  const roteiros = montarRoteiros({
    servicos: [serv('Manicure', 60), serv('Corte feminino', 50)],
    profissionais: [camila, juliana],
    modo: 'unico',
  });
  assertEquals(roteiros.length, 0);
});

Deno.test('modo auto: divide entre dois profissionais sem intervalo (sequencial)', () => {
  // Camila só faz unha, Juliana só faz cabelo → a comanda exige os dois.
  const camila = prof('Camila', ['09:00', '19:00'], { especialidades: ['Manicure'] });
  const juliana = prof('Juliana', ['09:00', '19:00'], { especialidades: ['Corte feminino'] });
  const roteiros = montarRoteiros({
    servicos: [serv('Manicure', 60), serv('Corte feminino', 50)],
    profissionais: [camila, juliana],
    modo: 'auto',
  });

  const r = roteiros[0];
  assertEquals(r.tipo, 'sequencial');
  assertEquals(r.espera_minutos, 0);
  assertEquals(r.profissionais_ids.length, 2);
  assertEquals(r.itens[1].inicio, r.itens[0].fim, 'sequencial não pode ter buraco');
});

Deno.test('modo preferido: o preferido pega o que sabe, o resto vai pra outro', () => {
  const camila = prof('Camila', ['09:00', '19:00'], { especialidades: ['Manicure'] });
  const juliana = prof('Juliana', ['09:00', '19:00'], { especialidades: ['Corte feminino'] });
  const roteiros = montarRoteiros({
    servicos: [serv('Manicure', 60), serv('Corte feminino', 50)],
    profissionais: [camila, juliana],
    modo: 'preferido',
    profissional_preferido_id: camila.id,
  });

  const r = roteiros[0];
  const manicure = r.itens.find((i) => i.nome === 'Manicure')!;
  const corte = r.itens.find((i) => i.nome === 'Corte feminino')!;
  assertEquals(manicure.profissional_id, camila.id);
  assertEquals(corte.profissional_id, juliana.id);
});

// ─── Bordas ──────────────────────────────────────────────────────────────────

Deno.test('borda: respeita o piso de horário (não oferece passado quando é hoje)', () => {
  const camila = prof('Camila', ['09:00', '19:00']);
  const roteiros = montarRoteiros({
    servicos: [serv('Corte feminino', 50)],
    profissionais: [camila],
    modo: 'auto',
    minimo: hm('15:20'),
  });
  assertEquals(roteiros.every((r) => r.inicio >= hm('15:20')), true);
  assertEquals(mh(roteiros[0].inicio), '15:20');
});

Deno.test('borda: comanda vazia ou sem profissional devolve vazio, não quebra', () => {
  const camila = prof('Camila', ['09:00', '19:00']);
  assertEquals(montarRoteiros({ servicos: [], profissionais: [camila], modo: 'auto' }), []);
  assertEquals(montarRoteiros({ servicos: [serv('Corte', 30)], profissionais: [], modo: 'auto' }), []);
});

Deno.test('borda: espera acima do teto é descartada', () => {
  // Duas janelas de exatamente 30min (09:00–09:30 e 17:30–18:00) e dois serviços
  // de 30min: é impossível encaixar os dois juntos, então a única combinação
  // possível tem 8h de espera entre eles — acima do teto de 180min.
  const camila = prof('Camila', ['09:00', '18:00'], { ocupados: [ocupa('09:30', '17:30')] });
  const roteiros = montarRoteiros({
    servicos: [serv('Corte feminino', 30), serv('Escova', 30)],
    profissionais: [camila],
    modo: 'auto',
    max_espera_minutos: 180,
  });
  assertEquals(roteiros.length, 0);
});

Deno.test('borda: roteiro nunca ultrapassa o fim da jornada', () => {
  const camila = prof('Camila', ['09:00', '10:00']);
  const roteiros = montarRoteiros({
    servicos: [serv('Corte feminino', 45)],
    profissionais: [camila],
    modo: 'auto',
    max_roteiros: 50,
  });
  assertEquals(roteiros.every((r) => r.fim <= hm('10:00')), true);
});
