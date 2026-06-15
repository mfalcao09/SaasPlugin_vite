// ─── RoadFooter — rodapé do hub: estrada ondulada + roadster ───────
// Conceito v7 aprovado (item 4): estrada de ondulação suave no rodapé,
// roadster percorre o caminho (animateMotion + mpath, rotate=auto) com
// rodas girando no próprio eixo. Decorativo (aria-hidden).

import { useId } from 'react';
import { RoadsterSymbol } from './RoadsterCar';

const ROAD_PATH = 'M -40 104 C 70 92, 160 112, 250 102 S 400 90, 480 106 S 620 96, 720 103';

export function RoadFooter() {
  const carId = useId();
  const pathId = useId();

  return (
    <div aria-hidden="true" className="w-full overflow-hidden select-none pointer-events-none">
      <style>{`@keyframes nx-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.1px)}}`}</style>
      <svg
        className="block w-full"
        viewBox="0 0 680 150"
        preserveAspectRatio="xMidYMax meet"
      >
        <defs>
          <RoadsterSymbol id={carId} />
        </defs>
        <path
          id={pathId}
          d={ROAD_PATH}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth="16"
          strokeLinecap="round"
        />
        <path
          d={ROAD_PATH}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2.2"
          strokeDasharray="13 14"
          opacity="0.8"
        />
        <g>
          <g transform="translate(-57,-45)">
            <g style={{ animation: 'nx-bob 0.6s ease-in-out infinite' }}>
              <use href={`#${carId}`} width="114" height="44.2" />
            </g>
          </g>
          <animateMotion dur="9s" repeatCount="indefinite" rotate="auto">
            <mpath href={`#${pathId}`} />
          </animateMotion>
        </g>
      </svg>
    </div>
  );
}
