// ─── RoadProgress — progresso como estrada + roadster ──────────────
// Conceito v7 aprovado (item 2): estrada fixa, faixas centrais acendem
// atrás do carro e o roadster (rodas girando no eixo) avança conforme
// `value`. Proporção do carro preservada (sem preserveAspectRatio=none).

import { useId } from 'react';
import { cn } from '@/lib/utils';
import { RoadsterSymbol, ROADSTER_RATIO } from './RoadsterCar';

const VB_W = 600;
const VB_H = 52;
const ROAD_Y = 28;
const ROAD_H = 16;
const CAR_W = 64;
const CAR_H = CAR_W * ROADSTER_RATIO;
// carro "pisando" na borda superior da estrada
const CAR_Y = ROAD_Y - CAR_H + 5;
const DASHES = Array.from({ length: 14 }, (_, i) => 10 + i * 42);

interface RoadProgressProps {
  /** progresso 0–100 */
  value: number;
  className?: string;
}

export function RoadProgress({ value, className }: RoadProgressProps) {
  const carId = useId();
  const clamped = Math.min(100, Math.max(0, value));
  const carX = (clamped / 100) * (VB_W - CAR_W);

  return (
    <svg
      className={cn('block w-full', className)}
      viewBox={`0 0 ${VB_W} ${VB_H}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(clamped)}
    >
      <defs>
        <RoadsterSymbol id={carId} />
      </defs>
      <rect x="0" y={ROAD_Y} width={VB_W} height={ROAD_H} rx="5" fill="hsl(var(--muted))" />
      <line x1="0" y1={ROAD_Y + 1.5} x2={VB_W} y2={ROAD_Y + 1.5} stroke="hsl(var(--border))" strokeWidth="1.2" />
      <line x1="0" y1={ROAD_Y + ROAD_H - 1.5} x2={VB_W} y2={ROAD_Y + ROAD_H - 1.5} stroke="hsl(var(--border))" strokeWidth="1.2" />
      <g fill="hsl(var(--primary))">
        {DASHES.map((x) => (
          <rect
            key={x}
            x={x}
            y={ROAD_Y + ROAD_H / 2 - 2}
            width="22"
            height="4"
            rx="2"
            style={{
              opacity: x + 11 <= carX + CAR_W / 2 ? 1 : 0.15,
              transition: 'opacity 0.4s ease',
            }}
          />
        ))}
      </g>
      <g style={{ transform: `translateX(${carX}px)`, transition: 'transform 0.5s ease' }}>
        <use href={`#${carId}`} x="0" y={CAR_Y} width={CAR_W} height={CAR_H} />
      </g>
    </svg>
  );
}
