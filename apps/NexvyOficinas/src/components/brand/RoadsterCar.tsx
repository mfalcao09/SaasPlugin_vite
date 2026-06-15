// ─── RoadsterCar — carro-símbolo da identidade "estrada" ───────────
// Roadster com rodas raiadas girando no próprio eixo (conceito v7
// aprovado). Uso: renderize <RoadsterSymbol id={uid}/> dentro de <defs>
// e referencie com <use href={`#${uid}`}/>. O id precisa ser único na
// página (useId) porque <symbol> vive no namespace global do documento.

const BODY_PATH =
  'M5643 5008 c-356 -31 -398 -59 -1082 -732 l-214 -211 138 -3 138 -3 291 289 c473 469 490 477 1011 477 193 0 344 -5 400 -13 155 -21 342 -54 356 -62 10 -7 -2 -78 -54 -337 -37 -180 -67 -331 -67 -335 0 -14 170 -9 175 5 24 63 160 793 150 799 -22 13 -214 57 -335 77 -328 55 -643 72 -907 49z M6950 4853 c0 -5 -34 -176 -75 -382 -90 -450 -88 -402 -17 -396 31 3 127 10 212 16 201 14 424 42 580 74 126 25 430 115 430 126 0 7 -258 178 -358 238 -275 164 -772 373 -772 324z M3400 4250 c-900 -51 -1687 -212 -2139 -439 -114 -58 -98 -60 70 -8 608 188 1275 256 2489 257 l445 0 90 90 c49 49 86 92 82 96 -10 10 -865 13 -1037 4z M8065 4234 c-536 -189 -918 -224 -2485 -224 -1847 0 -2861 -20 -3290 -66 -465 -50 -1108 -202 -1335 -316 -392 -197 -570 -519 -491 -885 30 -137 102 -317 124 -308 33 12 253 25 444 25 l206 0 6 98 c26 400 179 677 488 882 296 196 685 225 1001 75 374 -177 637 -572 637 -957 0 -47 0 -48 33 -48 87 -1 3129 82 3173 86 l51 5 12 77 c111 713 824 1122 1470 843 315 -135 546 -425 601 -756 7 -38 15 -73 19 -77 6 -6 462 93 654 142 98 25 98 25 121 126 83 372 59 810 -51 920 -45 45 -115 58 -263 50 l-116 -6 -154 78 c-210 106 -468 193 -760 255 -14 3 -55 -5 -95 -19z m-1589 -497 c20 -17 27 -33 27 -57 0 -72 -25 -80 -263 -80 -122 0 -211 4 -215 10 -3 5 10 41 30 80 l35 70 180 0 c173 0 180 -1 206 -23z m-5066 -85 c161 -121 -258 -552 -611 -628 -314 -68 -268 269 67 492 200 133 460 198 544 136z M2175 3410 c-631 -99 -954 -849 -595 -1380 483 -714 1598 -363 1593 500 -3 534 -486 960 -998 880z m265 -245 c418 -98 622 -558 422 -950 -191 -373 -717 -450 -1017 -150 -451 451 -22 1244 595 1100z M2166 3055 c-474 -130 -548 -791 -113 -1004 325 -158 688 16 762 364 82 391 -274 743 -649 640z M7520 3394 c-642 -137 -916 -921 -502 -1435 446 -553 1342 -356 1522 336 162 624 -402 1232 -1020 1099z m298 -239 c507 -102 694 -725 327 -1090 -459 -457 -1202 -51 -1080 592 65 343 405 567 753 498z M7560 3044 c-534 -141 -531 -901 3 -1046 257 -70 542 81 628 331 145 419 -214 825 -631 715z M9410 2795 c-19 -7 -180 -46 -358 -86 l-322 -74 0 -91 c0 -103 -12 -179 -43 -276 -27 -86 -28 -85 108 -59 216 40 332 87 428 171 83 74 214 294 232 393 8 40 7 41 -45 22z M3393 2454 c-17 -4 -23 -17 -32 -72 -20 -118 -74 -259 -122 -321 -11 -13 -19 -28 -19 -32 0 -5 783 -9 1775 -9 l1775 0 -39 78 c-44 88 -73 176 -91 280 l-13 72 -1082 0 c-595 0 -1318 2 -1606 4 -288 3 -534 3 -546 0z M731 2416 c-69 -6 -126 -15 -128 -21 -6 -18 95 -159 163 -227 127 -127 219 -158 477 -158 163 0 160 -1 118 66 -39 60 -85 190 -101 282 l-13 72 -196 -1 c-108 -1 -252 -7 -320 -13z';

// Centros das rodas no viewBox do símbolo (calculados sobre os arcos do
// path original — validados visualmente no protótipo v7)
const WHEEL_CENTERS = [248, 782] as const;

export const ROADSTER_VIEWBOX = '34 153 932 361';
// proporção altura/largura — use para dimensionar <use> sem distorcer
export const ROADSTER_RATIO = 361 / 932;

function SpinningWheel({ cx }: { cx: number }) {
  return (
    <g transform={`translate(${cx},418)`}>
      <circle r="80" fill="#0b0e16" />
      <g fill="none" stroke="hsl(var(--primary))">
        <circle r="64" strokeWidth="11" />
        <g strokeWidth="10" strokeLinecap="round">
          <line x1="0" y1="-12" x2="0" y2="-58" />
          <line x1="11" y1="-4" x2="55" y2="-18" />
          <line x1="7" y1="10" x2="34" y2="47" />
          <line x1="-7" y1="10" x2="-34" y2="47" />
          <line x1="-11" y1="-4" x2="-55" y2="-18" />
        </g>
      </g>
      <circle r="15" fill="hsl(var(--primary))" />
      {/* rotação SEM centro explícito: gira na origem local do grupo já
          transladado = o próprio eixo da roda */}
      <animateTransform
        attributeName="transform"
        type="rotate"
        from="0"
        to="360"
        dur="0.75s"
        repeatCount="indefinite"
        additive="sum"
      />
    </g>
  );
}

export function RoadsterSymbol({ id }: { id: string }) {
  return (
    <symbol id={id} viewBox={ROADSTER_VIEWBOX}>
      <g transform="translate(1000,0) scale(-1,1)">
        <g transform="translate(0,666) scale(0.1,-0.1)">
          <path fill="hsl(var(--primary))" d={BODY_PATH} />
        </g>
      </g>
      {WHEEL_CENTERS.map((cx) => (
        <SpinningWheel key={cx} cx={cx} />
      ))}
    </symbol>
  );
}
