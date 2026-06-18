// ─── FooterDecoration — ornamento de marca no rodapé direito ───────
// Ilustrações line-art de beleza usadas como MÁSCARA CSS, recoloridas
// na cor da marca (--primary) → funciona em light e dark como marca
// d'água sutil. Escolhe uma das 4 por rota (determinístico). Decorativa:
// aria-hidden + pointer-events-none. Oculta em telas pequenas e em
// páginas públicas (que têm visual próprio).

import { useLocation } from 'react-router-dom';

const DECORS = [
  '/decor/decor-1.webp',
  '/decor/decor-2.webp',
  '/decor/decor-3.webp',
  '/decor/decor-4.webp',
];

// rotas públicas / com visual próprio onde NÃO exibir o ornamento
const HIDE_PREFIXES = [
  '/login', '/reset-password', '/aceitar-convite', '/install',
  '/f/', '/c/', '/q/', '/agendar', '/confirmar', '/reagendar',
  '/vendas', '/unsubscribe', '/docs',
];

export function FooterDecoration() {
  const { pathname } = useLocation();
  if (HIDE_PREFIXES.some((p) => pathname.startsWith(p))) return null;

  // escolha estável da ilustração por rota
  let h = 0;
  for (let i = 0; i < pathname.length; i++) h = (h * 31 + pathname.charCodeAt(i)) >>> 0;
  const src = DECORS[h % DECORS.length];

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed bottom-0 right-0 z-20 hidden h-[230px] w-[210px] md:block"
      style={{
        WebkitMaskImage: `url(${src})`,
        maskImage: `url(${src})`,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'bottom right',
        maskPosition: 'bottom right',
        backgroundColor: 'hsl(var(--primary))',
        opacity: 0.13,
      }}
    />
  );
}
