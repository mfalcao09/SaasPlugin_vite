// ─── DemoPreview — harness DEV do wizard da Esteira (NÃO vai pra produção) ───
// Mancha zero em prod: a rota /demo/preview é registrada em App.tsx SÓ quando
// import.meta.env.DEV. Injeta um DemoEvolutionApi MOCK (QR/relatório/planos
// canned) para eyeball do front sem infra live (o QR real é físico do Marcelo).
// Deep-link por ?step=empresa|whatsapp_qr|relatorio_dinheiro|planos.

import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { DemoWizard, type DemoStepId } from './DemoWizard';
import type { DemoEvolutionApi, DemoReport } from './demoApi';
import type { ImplantacaoPayload } from '@/hooks/useImplantacao';

// QR falso (SVG data-uri) só pra provar o caminho base64/data-image do QR step.
function fakeQrDataUri(): string {
  const N = 25;
  const cell = 8;
  const size = N * cell;
  let rects = '';
  const on = (x: number, y: number) => {
    // finders nos 3 cantos
    const finder = (fx: number, fy: number) =>
      x >= fx && x < fx + 7 && y >= fy && y < fy + 7 &&
      (x === fx || x === fx + 6 || y === fy || y === fy + 6 ||
        (x >= fx + 2 && x <= fx + 4 && y >= fy + 2 && y <= fy + 4));
    if (finder(0, 0) || finder(N - 7, 0) || finder(0, N - 7)) return true;
    return ((x * 7 + y * 13 + x * y * 3) % 5) === 0;
  };
  for (let y = 0; y < N; y++)
    for (let x = 0; x < N; x++)
      if (on(x, y)) rects += `<rect x="${x * cell}" y="${y * cell}" width="${cell}" height="${cell}"/>`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<rect width="${size}" height="${size}" fill="#fff"/><g fill="#000">${rects}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

// Relatório canned — nomes/telefones sintéticos, conta forte (o AHA).
function mockReport(ticket: number): DemoReport {
  const raw: Array<[string, string, number]> = [
    ['Maria Eduarda Rocha', '5511998877665', 52],
    ['Ana Carolina Souza', '5511997766554', 61],
    ['Juliana Mendes', '5511996655443', 73],
    ['Patrícia Gomes', '5511995544332', 88],
    ['Fernanda Lima', '5511994433221', 96],
    ['Camila Ribeiro', '5511993322110', 104],
    ['Beatriz Almeida', '5521992211009', 118],
    ['Larissa Carvalho', '5521991100998', 129],
    ['Vanessa Oliveira', '5531990099887', 141],
    ['Tatiane Barbosa', '5531989988776', 152],
    ['Renata Dias', '5541988877665', 163],
    ['Sabrina Freitas', '5541987766554', 176],
  ];
  const items = raw.map(([name, phone, dias]) => ({
    name, phone, dealValue: ticket, reason: `Sumiu há ${dias} dias`,
  }));
  const count = 23; // mais sumidos do que os 12 cards exibidos
  return { ok: true, count, total: count * ticket, ticket, items };
}

export default function DemoPreview() {
  const [params] = useSearchParams();
  const initialStep = (params.get('step') as DemoStepId) || 'empresa';

  const [empresa, setEmpresa] = useState<ImplantacaoPayload['empresa']>({
    nome_fantasia: 'Espaço Bella Vita',
    telefone: '(11) 99988-7766',
    instagram: '@espacobellavita',
    segmento: 'salao',
    ticket_medio: 120,
  });

  const api = useMemo<DemoEvolutionApi>(() => {
    let statusHits = 0;
    return {
      accept: async () => ({ ok: true }),
      connect: async () => ({ ok: true, instance_id: 'preview', qr_code: fakeQrDataUri() }),
      status: async () => {
        // fica em qr_pending por ~2 ciclos, depois conecta (dá tempo de ver o QR).
        statusHits += 1;
        return { ok: true, status: statusHits >= 3 ? 'connected' : 'qr_pending', qr_code: null };
      },
      report: async () => mockReport(empresa?.ticket_medio ?? 120),
      sendReport: async () => ({ ok: true }),
      requestDeletion: async () => ({ ok: true }),
    };
  }, [empresa?.ticket_medio]);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 pt-4">
        <div className="rounded-md border border-dashed bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          PREVIEW DEV (dados mock) · deep-link: <code>?step=empresa|whatsapp_qr|relatorio_dinheiro|planos</code>
        </div>
      </div>
      <DemoWizard
        api={api}
        empresa={empresa}
        onEmpresaChange={(patch) => setEmpresa((e) => ({ ...e, ...patch }))}
        reportUrl="https://gestao.nexvy.tech/implantacao/preview"
        initialStep={initialStep}
      />
    </div>
  );
}
