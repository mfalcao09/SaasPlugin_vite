/**
 * LP "Clientes de Volta" (portada do Lovable, project 304b956f).
 * Extraída de src/routes/index.tsx (TanStack Start) → página React 18.
 * Serve o APEX (nexvybeauty.com.br) e /vendas.
 *
 * Metade B (integração) — RESOLVIDO:
 *   P1 checkout dos 3 planos → checkout_url do plano vindo de usePublicPlans (nunca hardcode).
 *   P2 WhatsApp comercial → WHATSAPP_URL (NEXVY_VENDAS, número oficial).
 *   P3 login "Entrar" → APP_URL (app.nexvybeauty.com.br).
 *   P4 footer → rotas internas /termos e /privacidade + Instagram oficial + WhatsApp.
 *   P5 PREÇO → 100% de public_plans (cards + calculadora). ZERO preço hardcoded nesta página.
 *   P6 modal Cofounder → posta no edge público `platform-form-submit` (slug `interesse-cofounder`),
 *      com loading/sucesso/erro tratados. Block IDs resolvidos em RUNTIME via {action:'load'}.
 *   BUG id="como-funciona" duplicado → Modulos virou id="modulos"; o nav aponta pra "Como Funciona".
 *   P8 og:image / meta social → asset gerado A PARTIR DESTA LP (paleta/Didot/promessa do hero):
 *      public/og-clientes-de-volta.png (1200×630). As tags og:/twitter: vivem no index.html
 *      ESTÁTICO (o crawler não executa JS) — NÃO injetar daqui/helmet, senão o preview vem vazio.
 *
 * Metade B — DELIBERADAMENTE NÃO RESOLVIDO (falta insumo/decisão, não código):
 *   TODO(P7) "50 vagas" do Cofounder (×2) — número de escassez; real vs remover é decisão do Marcelo.
 *   TODO(P9) cookie A/B "nx_lp_var" — segue gravando o cookie; ligar a analytics é opcional.
 *
 * UPSTREAM: o bug do id duplicado também existe no Lovable (project 304b956f). Corrigir lá,
 * senão volta no próximo sync.
 */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Instagram } from "lucide-react";
import { Link } from "react-router-dom";
import { usePublicPlans, type PublicPlan } from "@/hooks/usePlatformPlans";
import { supabase } from "@/integrations/supabase/client";
import { captureTrackingFromUrl, getTracking } from "@/lib/tracking";
import "./clientes-de-volta-lp.css";

/* ── formatação BRL (igual ao protótipo) ── */
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});

/* ── P2: WhatsApp comercial (NEXVY_VENDAS, número oficial) — Hero + Raio-X + rodapé ── */
const WHATSAPP_URL =
  "https://wa.me/5511955021205?text=" +
  encodeURIComponent("Oi! Vim pela página e quero o Raio-X da minha carteira.");

/* ── P3: login "Entrar" → app do salão ── */
const APP_URL = "https://app.nexvybeauty.com.br";

/* ── P4: Instagram oficial ── */
const INSTAGRAM_URL = "https://instagram.com/nexvytech";

/* ── P6: form público do Programa Cofounder (platform_crm_forms.slug) ── */
const COFOUNDER_FORM_SLUG = "interesse-cofounder";

/* ── P5: preço vem SÓ de public_plans. Mapa card-da-LP → slug no banco.
   ARMADILHA VERIFICADA: os nomes COLIDEM. O card "Premium" da LP é o slug `pro`
   (o destaque, referência da calculadora), e o card "Ultra" é o slug `premium`.
   Casar por NOME aqui pegaria o plano errado — por isso o casamento é por SLUG. */
const PLAN_SLUG = { essencial: "starter", premium: "pro", ultra: "premium" } as const;

/* ── R1: atribuição de anúncio ─────────────────────────────────────────────
   O tracking (ref/UTM/fbclid→fbc/fbp) é capturado no mount e vive no cookie
   1st-party nxv_track (src/lib/tracking.ts). Aqui ele é REPASSADO adiante: sem
   isso a venda chega no Cakto sem saber de qual criativo veio — o furo R1 da
   auditoria (tráfego pago cego, sem CAC por criativo, sem retargeting). */

/** Anexa os params de tracking ao checkout, sem sobrescrever o que a URL já traz. */
function withTracking(url: string): string {
  try {
    const u = new URL(url);
    for (const [k, v] of Object.entries(getTracking())) {
      if (v && !u.searchParams.has(k)) u.searchParams.set(k, String(v).slice(0, 200));
    }
    return u.toString();
  } catch {
    return url; // URL relativa/inválida → segue sem tracking (CTA nunca quebra)
  }
}

/** Dispara evento do Pixel se ele existir. Sem pixel = no-op silencioso. */
function fbqTrack(event: string, params?: Record<string, unknown>): void {
  try {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq === "function") fbq("track", event, params ?? {});
  } catch { /* rastreamento nunca pode quebrar o CTA */ }
}

/** Acha o plano por slug na lista pública (undefined enquanto carrega / se sumir). */
function findPlan(plans: PublicPlan[] | undefined, slug: string): PublicPlan | undefined {
  return (plans ?? []).find((p) => p.slug === slug && p.is_public);
}

/* ── rotação A/B/C de eyebrow + headline (variante rastreável por cookie) ── */
const EYEBROWS = [
  "A SUA NOVA MÁQUINA DE LOTAR AGENDA, RECUPERAR CLIENTES E FAZER DINHEIRO",
  "O dinheiro que já é seu — só que parado",
  "Antes de pagar, a gente te mostra o número",
];
type Seg = { t: string; em?: boolean };
const HEADS: Seg[][] = [
  [{ t: "Agenda cheia," }, { t: "sem gastar com anúncio —" }, { t: "com quem já é sua cliente.", em: true }],
  [{ t: "5 minutos por dia." }, { t: "Clientes que somem," }, { t: "voltando sozinhas.", em: true }],
  [{ t: "Antes de pagar," }, { t: "a gente te mostra" }, { t: "o dinheiro que está parado.", em: true }],
];

/* ============================================================================
   Página
   ============================================================================ */
export default function LandingPage() {
  const rootRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);

  /* R1: captura ref/UTM/fbclid da URL no cookie 1st-party JÁ no mount — tem que ser
     antes de qualquer clique, senão o hop LP→checkout/WhatsApp perde a origem. */
  useEffect(() => {
    captureTrackingFromUrl();
  }, []);

  /* PORTE: injeta a webfont + título de forma ESCOPADA à LP (sem tocar o index.html global).
     VERIFICADO na lp.css (não é suposição): o corpo usa fontes de SISTEMA (-apple-system/SF Pro/Segoe UI/Roboto)
     e o .serif usa `"Didot","Bodoni MT","Playfair Display","Georgia"` → a ÚNICA webfont necessária é a
     Playfair Display (em Mac o Didot resolve nativo; em Win/Linux cai na Playfair — sem ela cai em Georgia
     e o design muda). Fraunces/Inter NÃO são referenciadas pela lp.css (a premissa do handoff estava errada).
     TODO(porte-B): pra zero-FOUT em produção, a controladora pode mover o <link> pro index.html. */
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "NexvyBeauty — Recupere clientes que sumiram pelo seu WhatsApp";
    const links: HTMLLinkElement[] = [];
    const add = (attrs: Record<string, string>) => {
      const l = document.createElement("link");
      Object.entries(attrs).forEach(([k, v]) => l.setAttribute(k, v));
      document.head.appendChild(l);
      links.push(l);
    };
    add({ rel: "preconnect", href: "https://fonts.googleapis.com" });
    add({ rel: "preconnect", href: "https://fonts.gstatic.com", crossorigin: "" });
    add({
      rel: "stylesheet",
      href: "https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400..700;1,400..700&display=swap",
    });
    return () => {
      document.title = prevTitle;
      links.forEach((l) => l.remove());
    };
  }, []);

  /* barra de progresso + reveal on-scroll + rede de segurança */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const bar = progressRef.current;
    const prog = () => {
      const h = document.documentElement;
      const p = h.scrollTop / (h.scrollHeight - h.clientHeight || 1);
      if (bar) bar.style.width = p * 100 + "%";
    };
    document.addEventListener("scroll", prog, { passive: true });
    prog();

    const rvs = Array.from(root.querySelectorAll<HTMLElement>(".rv"));
    let io: IntersectionObserver | null = null;
    if (reduced || !("IntersectionObserver" in window)) {
      rvs.forEach((el) => el.classList.add("in"));
    } else {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((e) => {
            if (e.isIntersecting) {
              e.target.classList.add("in");
              io!.unobserve(e.target);
            }
          });
        },
        { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
      );
      rvs.forEach((el) => io!.observe(el));
    }

    const safety = window.setTimeout(() => {
      if (root.querySelectorAll(".rv.in").length === 0) {
        rvs.forEach((el) => el.classList.add("in"));
      }
    }, 2500);

    return () => {
      document.removeEventListener("scroll", prog);
      io?.disconnect();
      window.clearTimeout(safety);
    };
  }, []);

  return (
    <div className="lp-root" ref={rootRef} id="top">
      <div id="progress" ref={progressRef} />

      <Nav />
      <Hero />
      <Calculadora />
      <RaioXDaCarteira />
      <EyeSection />
      <Nichos />
      <OQueResolvemos />
      <Modulos />
      <Equipia />
      <ComoFunciona />
      <Planos />
      <ChamadaPosPlanos />
      <Cofounder />
      <Faq />
      <Footer />
    </div>
  );
}

/* ── NAV transparente ── */
function Nav() {
  return (
    <nav>
      <div className="nav-in">
        <a href="#top" className="wordmark serif">
          Nexvy<em>Beauty</em>
        </a>
        <div className="nav-links">
          <a href="#para-quem">Para Quem?</a>
          <a href="#o-que-resolvemos">O que resolvemos</a>
          <a href="#como-funciona">Como Funciona</a>
          <a href="#equipia">Sua EquipIA</a>
          <a href="#calc">Onde está seu dinheiro?</a>
          <a href="#planos">Planos</a>
        </div>
        <div className="nav-cta">
          {/* P3: login do salão. */}
          <a className="btn btn-quiet btn-sm" href={APP_URL}>
            Entrar
          </a>
          <a className="btn btn-rose btn-sm" href="#planos">
            Assine Já!
          </a>
        </div>
      </div>
    </nav>
  );
}

/* ── HERO (eyebrow/headline A/B/C + álbum de 3 telas) ── */
function Hero() {
  const eyebrowRef = useRef<HTMLSpanElement>(null);
  const headlineRef = useRef<HTMLHeadingElement>(null);
  const slidesRef = useRef<HTMLDivElement>(null);
  const dotsRef = useRef<HTMLDivElement>(null);
  const prevRef = useRef<HTMLButtonElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);

  /* variante rastreável (mutação de DOM direta como no protótipo — sem re-render) */
  useEffect(() => {
    try {
      // D2 (2026-07-19): variante CONGELADA na 0 durante o teste A/B de PÚBLICO do
      // Meta — o sorteio (Math.random) criava uma 2ª variável não-medida que
      // contaminava o teste e fazia o algoritmo otimizar contra página instável.
      // Para reativar a rotação: religar o sorteio JUNTO com medição por variante.
      const ei = 0;
      const hi = 0;
      if (eyebrowRef.current) eyebrowRef.current.textContent = EYEBROWS[ei];
      const h1 = headlineRef.current;
      if (h1) {
        while (h1.firstChild) h1.removeChild(h1.firstChild);
        HEADS[hi].forEach((seg, i) => {
          if (i > 0) h1.appendChild(document.createElement("br"));
          if (seg.em) {
            const em = document.createElement("em");
            em.textContent = seg.t;
            h1.appendChild(em);
          } else {
            h1.appendChild(document.createTextNode(seg.t));
          }
        });
      }
      document.cookie = "nx_lp_var=eb" + ei + "-hl" + hi + "; path=/; max-age=2592000; SameSite=Lax";
    } catch {
      /* fallback estático já está no JSX */
    }
  }, []);

  /* álbum de screenshots (swipe + dots + setas + auto-avanço 6s) */
  useEffect(() => {
    const slides = slidesRef.current;
    const dotsWrap = dotsRef.current;
    const prevBtn = prevRef.current;
    const nextBtn = nextRef.current;
    if (!slides || !dotsWrap || !prevBtn || !nextBtn) return;
    const album = slides.closest(".album");
    if (!album) return;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const dots = Array.from(dotsWrap.querySelectorAll<HTMLElement>("i"));
    let cur = 0;
    const N = slides.children.length;
    let timer: number | null = null;

    const goSlide = (i: number) => {
      cur = (i + N) % N;
      slides.style.transform = "translateX(" + -cur * 100 + "%)";
      dots.forEach((d, j) => (d.className = j === cur ? "on" : ""));
    };
    const stopAlbum = () => {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
    };
    const autoAlbum = () => {
      stopAlbum();
      if (!reduced) timer = window.setInterval(() => goSlide(cur + 1), 6000);
    };

    const onPrev = () => {
      goSlide(cur - 1);
      autoAlbum();
    };
    const onNext = () => {
      goSlide(cur + 1);
      autoAlbum();
    };
    prevBtn.addEventListener("click", onPrev);
    nextBtn.addEventListener("click", onNext);
    const dotHandlers = dots.map((d, j) => {
      const h = () => {
        goSlide(j);
        autoAlbum();
      };
      d.addEventListener("click", h);
      return h;
    });

    const onEnter = () => stopAlbum();
    const onLeave = () => autoAlbum();
    album.addEventListener("pointerenter", onEnter);
    album.addEventListener("pointerleave", onLeave);

    let x0: number | null = null;
    const onDown = (e: Event) => {
      const pe = e as PointerEvent;
      x0 = pe.clientX;
      slides.classList.add("drag");
      try {
        slides.setPointerCapture(pe.pointerId);
      } catch {
        /* noop */
      }
    };
    const onMove = (e: Event) => {
      const pe = e as PointerEvent;
      if (x0 !== null) {
        const dx = pe.clientX - x0;
        slides.style.transform = "translateX(calc(" + -cur * 100 + "% + " + dx + "px))";
      }
    };
    const endDrag = (e: Event) => {
      const pe = e as PointerEvent;
      if (x0 === null) return;
      slides.classList.remove("drag");
      const dx = pe.clientX - x0;
      x0 = null;
      if (Math.abs(dx) > 44) goSlide(cur + (dx < 0 ? 1 : -1));
      else goSlide(cur);
      autoAlbum();
    };
    slides.addEventListener("pointerdown", onDown);
    slides.addEventListener("pointermove", onMove);
    slides.addEventListener("pointerup", endDrag);
    slides.addEventListener("pointercancel", endDrag);

    goSlide(0);
    autoAlbum();

    return () => {
      stopAlbum();
      prevBtn.removeEventListener("click", onPrev);
      nextBtn.removeEventListener("click", onNext);
      dots.forEach((d, j) => d.removeEventListener("click", dotHandlers[j]));
      album.removeEventListener("pointerenter", onEnter);
      album.removeEventListener("pointerleave", onLeave);
      slides.removeEventListener("pointerdown", onDown);
      slides.removeEventListener("pointermove", onMove);
      slides.removeEventListener("pointerup", endDrag);
      slides.removeEventListener("pointercancel", endDrag);
    };
  }, []);

  return (
    <header className="hero">
      <div className="wrap hero-grid">
        <div>
          <span className="eyebrow" ref={eyebrowRef}>
            Agenda cheia com quem já é sua cliente
          </span>
          <h1 className="serif" ref={headlineRef}>
            Agenda cheia,
            <br />
            sem gastar com anúncio —
            <br />
            <em>com quem já é sua cliente.</em>
          </h1>
          <p className="hero-sub">
            Em <b>5 minutos por dia</b>, <b>sem gastar com anúncio</b>: a sua EquipIA varre suas conversas de WhatsApp,
            acha quem sumiu, escreve a mensagem no seu tom — e <b>você só aprova</b>. Antes de pagar um centavo, a gente
            te mostra <b>quanto dá para recuperar em 30 dias</b>, com a sua base.
          </p>
          <div className="hero-ctas">
            <a
              className="btn btn-rose"
              href={WHATSAPP_URL}
              onClick={() => fbqTrack("Lead", { content_name: "raiox_hero", content_category: "whatsapp_cta" })}
            >
              Quero meu Raio-X grátis
            </a>
            <a className="btn btn-quiet" href="#equipia">
              Ver demonstração e entender como o sistema funciona
            </a>
          </div>
        </div>

        <div className="stage" aria-hidden="true">
          <div className="album">
            <div className="slides-clip">
              <div className="slides" ref={slidesRef}>
                {/* slide 1 — radar EquipIA */}
                <div className="slide">
                  <div className="mock">
                    <div className="mock-bar">
                      <i></i>
                      <i></i>
                      <i></i>
                    </div>
                    <div className="mock-body">
                      <div className="radar-t">É assim que a sua EquipIA acha dinheiro para você</div>
                      <p className="radar-s">
                        Toda manhã ela varre suas conversas e te entrega quem dá para reconquistar — com a mensagem já
                        pronta.
                      </p>
                      <div className="radar">
                        <div>
                          <div className="rl">↗ Recuperável esta semana</div>
                          <div className="rvl">R$ 450,00</div>
                          <div className="rs">
                            Sua EquipIA encontrou <strong>3 clientes</strong> que dá para reconquistar com uma mensagem.
                          </div>
                        </div>
                      </div>
                      <div className="triage">
                        <div className="tri hot">
                          <div className="tt">
                            <span>Prontas para fechar</span>
                            <span>2</span>
                          </div>
                          <div className="tv">R$ 330,00</div>
                          <div className="td">Quase fechando — chama hoje</div>
                        </div>
                        <div className="tri warm">
                          <div className="tt">
                            <span>Vale um lembrete</span>
                            <span>1</span>
                          </div>
                          <div className="tv">R$ 120,00</div>
                          <div className="td">Um carinho reacende</div>
                        </div>
                        <div className="tri cold">
                          <div className="tt">
                            <span>Esfriaram</span>
                            <span>0</span>
                          </div>
                          <div className="tv">R$ 0,00</div>
                          <div className="td">Sumiram faz tempo</div>
                        </div>
                      </div>
                      <div className="ops-label">As 3 melhores oportunidades de hoje</div>
                      <div className="ops">
                        <div className="op">
                          <span className="otag">Prioridade alta</span>
                          <h4>8 clientes inativas há mais de 45 dias</h4>
                          <p>Mensagem personalizada pronta para o seu WhatsApp.</p>
                          <span className="oi">Impacto estimado · +R$ 2.800</span>
                        </div>
                        <div className="op">
                          <span className="otag">Padrão detectado</span>
                          <h4>Terças, 14h–16h: três horários vagos</h4>
                          <p>Sugestão: promoção de manicure expressa.</p>
                          <span className="oi">3 horários recuperáveis/semana</span>
                        </div>
                        <div className="op equipia">
                          <span className="otag">Sua EquipIA · agora</span>
                          <h4>Acabei de confirmar a Fernanda das 10:30 e chamei 4 clientes que sumiram. 💅</h4>
                          <span className="oi">+R$ 720 em retorno estimado</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* slide 2 — agenda do dia */}
                <div className="slide">
                  <div className="mock">
                    <div className="mock-bar">
                      <i></i>
                      <i></i>
                      <i></i>
                    </div>
                    <div className="mock-body">
                      <div className="mock-head">
                        <span className="mock-hi serif">Bom dia, Marina 🌸</span>
                        <span className="chip">Recuperado no mês&nbsp; R$ 2.180</span>
                      </div>
                      <div className="kpis">
                        <div className="kpi">
                          <div className="kl">Agendamentos hoje</div>
                          <div className="kv">
                            8 <small>· 2 a confirmar</small>
                          </div>
                        </div>
                        <div className="kpi">
                          <div className="kl">Faturamento previsto</div>
                          <div className="kv">
                            R$ 1.240 <small>· hoje</small>
                          </div>
                        </div>
                      </div>
                      <div className="mock-rows">
                        <div className="mock-row">
                          <span className="h">09:00</span>
                          <span>
                            Juliana Alves <span className="s">· design de sobrancelha</span>
                          </span>
                          <span className="v">R$ 80</span>
                        </div>
                        <div className="mock-row">
                          <span className="h">10:30</span>
                          <span>
                            Fernanda Rocha <span className="s">· cílios volume brasileiro</span>
                          </span>
                          <span className="v">R$ 180</span>
                        </div>
                        <div className="mock-row">
                          <span className="h">13:00</span>
                          <span>
                            Patrícia Menezes <span className="s">· fibra de vidro</span>
                          </span>
                          <span className="v">R$ 250</span>
                        </div>
                        <div className="mock-row">
                          <span className="h">15:00</span>
                          <span>
                            Camila Duarte <span className="s">· manutenção fio a fio</span>
                          </span>
                          <span className="v">R$ 120</span>
                        </div>
                        <div className="mock-row">
                          <span className="h">17:00</span>
                          <span>
                            Beatriz Lima <span className="s">· spa das mãos</span>
                          </span>
                          <span className="v">R$ 110</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* slide 3 — WhatsApp */}
                <div className="slide">
                  <div className="mock">
                    <div className="mock-bar">
                      <i></i>
                      <i></i>
                      <i></i>
                    </div>
                    <div className="mock-body">
                      <div className="radar-t">Sua EquipIA no WhatsApp</div>
                      <p className="radar-s">Ela escreve com o seu tom — você só aprova.</p>
                      <div className="wchat">
                        <div className="wmsg out">
                          Oi, Fernanda! 💕 Sentimos sua falta — seu último volume brasileiro já faz 52 dias. Que tal
                          renovar essa semana?
                        </div>
                        <div className="wmsg in">Aiii verdade!! Tem horário quinta de manhã? 😅</div>
                        <div className="wmsg out">Tenho sim! Quinta às 10h30 com a Ana. Confirmo pra você?</div>
                        <div className="wmsg in">Fechado! 🥰</div>
                        <div className="wmsg out">Agendado ✨ Te espero quinta!</div>
                      </div>
                      <div className="wfoot">
                        <span>Reativação concluída</span>
                        <b>+R$ 180 recuperados</b>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <button className="anav prev" ref={prevRef} type="button" aria-label="Tela anterior">
              ‹
            </button>
            <button className="anav next" ref={nextRef} type="button" aria-label="Próxima tela">
              ›
            </button>
            <div className="dots" ref={dotsRef}>
              <i className="on"></i>
              <i></i>
              <i></i>
            </div>
          </div>
          <p className="mock-caption serif">O seu dia, organizado por quem entende do seu negócio.</p>
        </div>
      </div>
    </header>
  );
}

/* ── NOSSO COMPROMISSO — o olho que pisca e revela ── */
function EyeSection() {
  return _EyeSectionImpl();
}

/* ── RAIO-X DA CARTEIRA — prova antes de pagar ── */
function RaioXDaCarteira() {
  return (
    <section className="dores-sec" id="raio-x">
      <div className="firula" aria-hidden="true">
        <svg viewBox="0 0 340 26">
          <line x1="6" y1="13" x2="140" y2="13" />
          <path d="M170 4 L179 13 L170 22 L161 13 Z" />
          <path d="M170 9 L174 13 L170 17 L166 13 Z" />
          <line x1="200" y1="13" x2="334" y2="13" />
        </svg>
      </div>
      <div className="wrap">
        <span className="eyebrow rv">Antes de pagar um centavo</span>
        <h2 className="serif rv">
          A gente te manda o <em>Raio-X da sua carteira</em>.
        </h2>
        <p className="lead rv">
          Em até 48h você recebe, <b>por escrito</b>: <b>quantas clientes sumiram</b>, <b>seu ticket médio</b> e{" "}
          <b>quanto dá para recuperar em 30 dias</b> — com a sua base, não com um exemplo genérico. Se o número não te
          animar, <b>não assina</b>. Simples assim.
        </p>
        <div className="dores">
          <div className="dor rv">
            <span className="n serif">✓</span>
            <p><b>Prova antes de pagar.</b> Você vê o número real antes de qualquer boleto.</p>
          </div>
          <div className="dor rv">
            <span className="n serif">✓</span>
            <p><b>7 dias de arrependimento</b> — CDC art. 49, sem letra miúda.</p>
          </div>
          <div className="dor rv">
            <span className="n serif">✓</span>
            <p><b>Você conecta e autoriza</b> — sem senha, você no controle. Não assinou? A gente <b>apaga tudo em 72h</b>, com confirmação. E <b>nada sai pra sua cliente sem o seu ok</b>.</p>
          </div>
        </div>
        <div className="hero-ctas rv" style={{ marginTop: 24 }}>
          <a
            className="btn btn-rose"
            href={WHATSAPP_URL}
            onClick={() => fbqTrack("Lead", { content_name: "raiox_secao", content_category: "whatsapp_cta" })}
          >
            Quero ver o meu número
          </a>
        </div>
      </div>
    </section>
  );
}

function _EyeSectionImpl() {
  const eyeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const eye = eyeRef.current;
    if (!eye) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const openEye = () => eye.classList.add("opened");
    const blinkAndReveal = () => {
      if (reduced) {
        openEye();
        return;
      }
      eye.classList.remove("blink");
      void eye.offsetWidth;
      eye.classList.add("blink");
      // conteúdo aparece enquanto o olho reabre (após "segurar" fechado)
      window.setTimeout(openEye, 520);
    };

    if ("IntersectionObserver" in window && !reduced) {
      let blinked = false;
      const ioEye = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting && !blinked) {
            blinked = true;
            window.setTimeout(blinkAndReveal, 260);
            ioEye.disconnect();
          }
        },
        { threshold: 0.45 },
      );
      ioEye.observe(eye);
      return () => ioEye.disconnect();
    } else {
      openEye();
    }
  }, []);

  return (
    <>
      <svg width="0" height="0" style={{ position: "absolute" }} aria-hidden="true">
        <defs>
          <clipPath id="eyeclip" clipPathUnits="objectBoundingBox">
            <path d="M0,0.5 C0.2,-0.08 0.8,-0.08 1,0.5 C0.8,1.08 0.2,1.08 0,0.5 Z" />
          </clipPath>
        </defs>
      </svg>
      <section className="eye-sec">
        <div className="eye" ref={eyeRef}>
          <div className="iris" aria-hidden="true"></div>
          <div className="lid top"></div>
          <div className="lid bot"></div>
          <div className="wrap">
            <p className="m-kicker eye-reveal">Nosso compromisso</p>
            <h2 className="m eye-reveal">
              Você não montou o seu espaço para viver refém de <em>caderninho</em>, <em>print de conversa</em> e{" "}
              <em>“amanhã eu te respondo”</em>.
            </h2>
            <div className="m-rule eye-reveal"></div>
            <p className="m-small eye-reveal">O NexvyBeauty existe para te devolver o controle do seu tempo</p>
          </div>
        </div>
      </section>
    </>
  );
}

/* ── NICHOS — cartões feitos à mão (marquee duplicado) ── */
function Nichos() {
  const cards: React.ReactElement[] = [
    <div className="cardm" key="salao">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash" cx="38" cy="38" rx="26" ry="20" transform="rotate(-14 38 38)" />
        <path className="stroke" d="M20 21 C29 29 40 36 53 43" />
        <path className="stroke" d="M20 51 C29 44 40 37 53 30" />
        <circle className="stroke" cx="16" cy="17" r="5" />
        <circle className="stroke" cx="16" cy="55" r="5" />
      </svg>
      <h3 className="script">Salão</h3>
      <p>Escovas que não voltaram.</p>
    </div>,
    <div className="cardm" key="nails">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash2" cx="36" cy="42" rx="22" ry="18" transform="rotate(10 36 42)" />
        <path
          className="stroke"
          d="M29 33 C28 33 27 34 27 36 L27 54 C27 57 29 59 32 59 L41 59 C44 59 46 57 46 54 L46 36 C46 34 45 33 44 33 Z"
        />
        <path className="stroke" d="M31 33 L31 24 C31 22 33 21 36 21 C40 21 42 22 42 24 L42 33" />
        <path className="stroke" d="M36 21 L36 12" />
      </svg>
      <h3 className="script">Nails</h3>
      <p>Manutenções perdidas.</p>
    </div>,
    <div className="cardm" key="lash">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash" cx="36" cy="42" rx="26" ry="16" />
        <path className="stroke" d="M13 44 C23 29 49 29 59 44" />
        <path className="stroke" d="M20 36 L15 29" />
        <path className="stroke" d="M28 32 L25 24" />
        <path className="stroke" d="M37 30 L36 22" />
        <path className="stroke" d="M46 32 L49 24" />
        <path className="stroke" d="M54 37 L58 30" />
      </svg>
      <h3 className="script">Lash</h3>
      <p>Retoques esquecidos.</p>
    </div>,
    <div className="cardm" key="sobrancelha">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash2" cx="36" cy="36" rx="24" ry="14" transform="rotate(-6 36 36)" />
        <path className="stroke" style={{ strokeWidth: 3.4 }} d="M15 33 C25 22 46 22 57 31" />
        <path className="stroke" d="M22 45 C31 51 43 51 51 45" />
      </svg>
      <h3 className="script">Sobrancelha</h3>
      <p>Design de 30 dias que vira 60.</p>
    </div>,
    <div className="cardm" key="podologia">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash" cx="37" cy="44" rx="20" ry="19" />
        <ellipse className="stroke" cx="38" cy="47" rx="11" ry="15" />
        <circle className="stroke" cx="24" cy="30" r="3.4" />
        <circle className="stroke" cx="32" cy="25" r="3" />
        <circle className="stroke" cx="40" cy="23" r="2.7" />
        <circle className="stroke" cx="48" cy="25" r="2.4" />
        <circle className="stroke" cx="54" cy="30" r="2.2" />
      </svg>
      <h3 className="script">Podologia</h3>
      <p>Retorno de 45 dias sem lembrete.</p>
    </div>,
    <div className="cardm" key="estetica">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash2" cx="36" cy="38" rx="20" ry="22" transform="rotate(16 36 38)" />
        <path className="stroke" d="M36 59 C19 45 23 24 36 13 C49 24 53 45 36 59 Z" />
        <path className="stroke" d="M36 54 L36 19" />
        <path className="stroke" d="M36 43 C31 41 28 38 27 33" />
        <path className="stroke" d="M36 35 C41 33 44 30 45 25" />
      </svg>
      <h3 className="script">Estética</h3>
      <p>Pacotes pagos pela metade.</p>
    </div>,
    <div className="cardm" key="massoterapia">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash" cx="36" cy="46" rx="24" ry="16" />
        <ellipse className="stroke" cx="36" cy="52" rx="17" ry="7" />
        <ellipse className="stroke" cx="36" cy="42" rx="13" ry="6" />
        <ellipse className="stroke" cx="36" cy="33" rx="9" ry="5" />
        <path className="stroke" d="M28 22 C29 19 27 17 28 14" />
        <path className="stroke" d="M36 21 C37 18 35 16 36 13" />
        <path className="stroke" d="M44 22 C45 19 43 17 44 14" />
      </svg>
      <h3 className="script">Massoterapia</h3>
      <p>Pacotes que não renovam.</p>
    </div>,
    <div className="cardm" key="estetica-corporal">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash2" cx="36" cy="38" rx="18" ry="24" transform="rotate(-8 36 38)" />
        <path className="stroke" d="M26 12 C22 22 24 28 30 34 C36 40 38 46 34 58" />
        <path className="stroke" d="M46 12 C50 22 48 28 42 34 C36 40 34 46 38 58" />
      </svg>
      <h3 className="script">Estética corporal</h3>
      <p>Sessões esquecidas no meio do protocolo.</p>
    </div>,
    <div className="cardm" key="esmalteria">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash" cx="38" cy="44" rx="24" ry="17" />
        <path className="stroke" d="M18 58 L18 42 C18 40 19 39 21 39 L27 39 C29 39 30 40 30 42 L30 58" />
        <path className="stroke" d="M20 39 L20 32 L28 32 L28 39" />
        <path className="stroke" d="M33 58 L33 38 C33 36 34 35 36 35 L42 35 C44 35 45 36 45 38 L45 58" />
        <path className="stroke" d="M35 35 L35 27 L43 27 L43 35" />
        <path className="stroke" d="M48 58 L48 45 C48 43 49 42 51 42 L55 42 C57 42 58 43 58 45 L58 58" />
        <path className="stroke" d="M50 42 L50 36 L56 36 L56 42" />
        <path className="stroke" d="M14 58 L62 58" />
      </svg>
      <h3 className="script">Esmalteria</h3>
      <p>A cliente “da semana” que virou “do mês”.</p>
    </div>,
    <div className="cardm" key="depilacao">
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <ellipse className="wash2" cx="36" cy="40" rx="22" ry="20" transform="rotate(-12 36 40)" />
        <rect className="stroke" x="22" y="16" width="28" height="16" rx="3" />
        <path className="stroke" d="M26 32 C26 40 24 48 22 56" />
        <path className="stroke" d="M33 32 C33 40 32 48 31 56" />
        <path className="stroke" d="M40 32 C40 40 41 48 42 56" />
        <path className="stroke" d="M47 32 C47 40 49 48 51 56" />
      </svg>
      <h3 className="script">Depilação</h3>
      <p>Retorno de 21 dias que ninguém lembra.</p>
    </div>,
  ];

  return (
    <section className="block" id="para-quem" style={{ padding: "64px 0 30px" }}>
      <div className="wrap">
        <span className="eyebrow rv">Seja qual for a sua realidade</span>
        <h2 className="serif rv" style={{ fontSize: "clamp(24px, 3vw, 40px)" }}>
          Para diferentes perspectivas e dificuldades…
          <br />
          <em>…uma solução integrada e unificada.</em>
        </h2>
      </div>
      <div className="marquee rv">
        <div className="track">
          {cards}
          {cards.map((c, i) =>
            React.cloneElement(
              c as React.ReactElement<{ className?: string; "aria-hidden"?: boolean }>,
              { key: "dup-" + i, className: "cardm dup", "aria-hidden": true },
            ),
          )}
        </div>
      </div>
    </section>
  );
}

/* ── DORES ── */
function OQueResolvemos() {
  const dores = [
    "Agenda no papel ou no WhatsApp — cheia de furos, conflitos e horários perdidos.",
    "Clientes sumindo sem que você perceba — e sem ninguém para chamá-las de volta.",
    "Receita real? Só um número solto no fim do mês, sem saber de onde veio.",
    "Pacotes vendidos no caderno, sessões perdidas, saldo que ninguém controla.",
    "Nenhuma visão de qual serviço rende mais — nem qual profissional é mais rentável.",
    "No-show alto porque confirmar horário, uma a uma, não cabe no seu dia.",
  ];
  return (
    <section className="dores-sec" id="o-que-resolvemos">
      <div className="firula" aria-hidden="true">
        <svg viewBox="0 0 340 26">
          <line x1="6" y1="13" x2="140" y2="13" />
          <path d="M170 4 L179 13 L170 22 L161 13 Z" />
          <path d="M170 9 L174 13 L170 17 L166 13 Z" />
          <line x1="200" y1="13" x2="334" y2="13" />
        </svg>
      </div>
      <div className="wrap">
        <span className="eyebrow rv">Se você se reconhecer em pelo menos três situações abaixo…</span>
        <h2 className="serif rv">
          …a gente precisa <em>conversar.</em>
        </h2>
        <div className="dores">
          {dores.map((d, i) => (
            <div className="dor rv" key={i}>
              <span className="n serif">{i + 1}</span>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── MÓDULOS (8 sistemas + ícone integração 8-nós) ──
   BUG(corrigido): esta seção usava id="como-funciona", DUPLICANDO o id da seção
   ComoFunciona → HTML inválido, e o link do nav pulava pra cá (o primeiro no DOM).
   Agora é id="modulos"; o "#como-funciona" do nav resolve pra ComoFunciona.
   Corrigir TAMBÉM no Lovable upstream (project 304b956f), senão volta no sync. */
function Modulos() {
  return (
    <section className="block" id="modulos" style={{ paddingTop: "60px", paddingBottom: "40px" }}>
      <div className="wrap">
        <span className="eyebrow rv">O que vem dentro</span>
        <div className="h2row rv">
          <h2 className="serif" style={{ fontSize: "clamp(28px, 4.2vw, 54px)", lineHeight: 1.1 }}>
            <span>Oito sistemas trabalhando por você.</span>
            <br />
            <em>Uma mensalidade!</em>
          </h2>
          <svg viewBox="0 0 72 72" aria-hidden="true">
            <circle className="int-core" cx="36" cy="36" r="7" />
            <line className="int-stroke" x1="36" y1="29" x2="36" y2="12" />
            <line className="int-stroke" x1="36" y1="43" x2="36" y2="60" />
            <line className="int-stroke" x1="29" y1="36" x2="12" y2="36" />
            <line className="int-stroke" x1="43" y1="36" x2="60" y2="36" />
            <line className="int-stroke" x1="31" y1="31" x2="19" y2="19" />
            <line className="int-stroke" x1="41" y1="31" x2="53" y2="19" />
            <line className="int-stroke" x1="31" y1="41" x2="19" y2="53" />
            <line className="int-stroke" x1="41" y1="41" x2="53" y2="53" />
            <circle className="int-dot" cx="36" cy="9" r="3.2" />
            <circle className="int-dot" cx="36" cy="63" r="3.2" />
            <circle className="int-dot" cx="9" cy="36" r="3.2" />
            <circle className="int-dot" cx="63" cy="36" r="3.2" />
            <circle className="int-dot" cx="17" cy="17" r="3.2" />
            <circle className="int-dot" cx="55" cy="17" r="3.2" />
            <circle className="int-dot" cx="17" cy="55" r="3.2" />
            <circle className="int-dot" cx="55" cy="55" r="3.2" />
          </svg>
        </div>
        <p className="lead rv">
          <b>Total integração tecnológica</b> para o melhor da gestão estratégica.
        </p>
        <div className="indice">
          <div className="mod rv">
            <span className="tag">Agenda</span>
            <h3 className="serif">Agenda inteligente</h3>
            <p>
              Por profissional, com validação de conflitos e bloqueios. Zero double-booking. Link público para a cliente
              agendar sozinha, 24/7.
            </p>
          </div>
          <div className="mod rv">
            <span className="tag">Clientes</span>
            <h3 className="serif">Carteira de clientes</h3>
            <p>
              Ficha completa com histórico, preferências, aniversário e sinais de sumiço. Sua carteira nasce pronta:
              importamos do seu WhatsApp.
            </p>
          </div>
          <div className="mod rv">
            <span className="tag">Inteligência artificial</span>
            <h3 className="serif">Agentes de IA</h3>
            <p>
              Atendem no WhatsApp, agendam, confirmam, recuperam quem sumiu e fazem o follow-up que não cabe no seu dia.
            </p>
            <a className="goto" href="#equipia">
              Veja a sua EquipIA trabalhando ↓
            </a>
          </div>
          <div className="mod rv">
            <span className="tag">Crescimento</span>
            <h3 className="serif">Captação &amp; crescimento</h3>
            <p>
              Formulários, quizzes e funis de captação para transformar seguidor em cliente — e cliente em cliente fiel.
            </p>
          </div>
          <div className="mod rv">
            <span className="tag">Atendimento</span>
            <h3 className="serif">WhatsApp em um só lugar</h3>
            <p>
              Todas as conversas numa caixa de entrada única, com o histórico da cliente do lado. Você — ou a sua IA —
              responde dali.
            </p>
          </div>
          <div className="mod rv">
            <span className="tag">Equipe</span>
            <h3 className="serif">Seus profissionais</h3>
            <p>Especialidades, horários por dia, vínculo com a agenda e comissão por serviço.</p>
          </div>
          <div className="mod rv">
            <span className="tag">Comercial</span>
            <h3 className="serif">Pacotes &amp; sessões</h3>
            <p>Validade, sessões usadas, parcelas e saldo por cliente — sem caderno, sem sessão esquecida.</p>
          </div>
          <div className="mod rv">
            <span className="tag">Gestão</span>
            <h3 className="serif">Financeiro &amp; indicadores</h3>
            <p>Receita por período, ticket médio, formas de pagamento e projeções em tempo real.</p>
          </div>
          <div className="mod rv">
            <span className="tag">Roadmap vivo</span>
            <h3 className="serif">Cresce com você</h3>
            <p>
              O sistema evolui com o negócio: novidades entram no ritmo do que as próprias assinantes pedem — sem custo
              extra, sem plano novo.
            </p>
          </div>
        </div>
        <p className="essencial serif rv">
          Aqui, você foca no que é essencial: <b>as suas clientes.</b>
        </p>
      </div>
    </section>
  );
}

/* ── EQUIPIA (bloco dark + demo de chat) ── */
type ChatMsg = { who: "in" | "out"; text: string; t: string; recover?: number };
function Equipia() {
  const chatRef = useRef<HTMLDivElement>(null);
  const recRef = useRef<HTMLSpanElement>(null);
  const phoneRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const chat = chatRef.current;
    const recEl = recRef.current;
    const phone = phoneRef.current;
    if (!chat || !recEl || !phone) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const roteiro: ChatMsg[] = [
      {
        who: "out",
        text: "Oi, Fernanda! 💕 Aqui é do Espaço Ana Beleza. Sentimos sua falta — seu último volume brasileiro já faz 52 dias! Que tal renovar essa semana?",
        t: "09:12",
      },
      { who: "in", text: "Aiii verdade!! Tava precisando 😅 Tem horário quinta de manhã?", t: "09:15" },
      { who: "out", text: "Tenho sim! Quinta às 10h30 com a Ana. Confirmo pra você?", t: "09:15" },
      { who: "in", text: "Fechado! 🥰", t: "09:16" },
      { who: "out", text: "Agendado ✨ Te espero quinta! Vou te mandar um lembrete na véspera.", t: "09:16", recover: 180 },
    ];

    const typing = document.createElement("div");
    typing.className = "typing";
    for (let k = 0; k < 3; k++) typing.appendChild(document.createElement("i"));

    let idx = 0;
    let total = 0;
    let cancelled = false;
    const timers: number[] = [];
    const wait = (fn: () => void, ms: number) => {
      const id = window.setTimeout(() => {
        if (!cancelled) fn();
      }, ms);
      timers.push(id);
    };

    const push = (m: ChatMsg) => {
      const el = document.createElement("div");
      el.className = "msg " + m.who;
      el.textContent = m.text;
      const mt = document.createElement("span");
      mt.className = "mt";
      mt.textContent = m.t + (m.who === "out" ? " ✓✓" : "");
      el.appendChild(mt);
      chat.appendChild(el);
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.classList.add("show");
        }),
      );
      chat.scrollTop = chat.scrollHeight;
      if (m.recover) {
        total += m.recover;
        recEl.textContent = "R$ " + total.toLocaleString("pt-BR");
      }
    };
    const limpa = () => {
      while (chat.firstChild) chat.removeChild(chat.firstChild);
    };
    const step = () => {
      if (cancelled) return;
      if (idx >= roteiro.length) {
        wait(() => {
          limpa();
          idx = 0;
          total = 0;
          recEl.textContent = "R$ 0";
          step();
        }, 6000);
        return;
      }
      const m = roteiro[idx];
      if (m.who === "out") {
        chat.appendChild(typing);
        typing.classList.add("show");
        chat.scrollTop = chat.scrollHeight;
        wait(
          () => {
            typing.classList.remove("show");
            if (typing.parentNode) typing.parentNode.removeChild(typing);
            push(m);
            idx++;
            wait(step, 1400);
          },
          reduced ? 100 : 1300,
        );
      } else {
        wait(
          () => {
            push(m);
            idx++;
            wait(step, 1400);
          },
          reduced ? 100 : 900,
        );
      }
    };

    let started = false;
    const startChat = () => {
      if (!started) {
        started = true;
        step();
      }
    };

    let io2: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduced) {
      io2 = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) {
            startChat();
            io2!.disconnect();
          }
        },
        { threshold: 0.4 },
      );
      io2.observe(phone);
    } else {
      roteiro.forEach(push);
      started = true;
    }

    const safety = window.setTimeout(startChat, 2500);
    timers.push(safety);

    return () => {
      cancelled = true;
      timers.forEach((id) => window.clearTimeout(id));
      io2?.disconnect();
      limpa();
    };
  }, []);

  return (
    <>
      <svg className="curve-dark" viewBox="0 0 1440 74" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0,74 C420,8 1020,8 1440,74 L1440,74 L0,74 Z"></path>
      </svg>
      <section className="equipia" id="equipia">
        <div className="sparkles" aria-hidden="true">
          <i>✦</i>
          <i>✧</i>
          <i>✦</i>
          <i>✧</i>
          <i>✦</i>
          <i>✧</i>
          <i>✦</i>
          <i>✧</i>
        </div>
        <div className="wrap">
          <p className="eq-quote serif rv">
            <span className="l1">Elas cuidam da gestão do seu espaço.</span>
            <span className="l2">
              <em>Você, de entregar o melhor resultado.</em>
            </span>
          </p>
          <span className="eyebrow rv">Sua EquipIA</span>
          <h2 className="serif rv">
            Só quem empreende como você
            <br />
            entende <em>o valor.</em>
          </h2>
          <div className="eq-grid">
            <div>
              <p className="lead rv">
                Quem vive de agenda cheia sabe: o difícil não é atender — é <b>tudo o que vem junto</b>. A sua EquipIA
                existe para dividir esse peso: agentes de inteligência artificial que trabalham no seu WhatsApp com o seu
                tom, o seu nome e as suas regras.
              </p>
              <ul className="eq-points">
                <li className="rv">Atendem, agendam e confirmam horários — 24 horas, 7 dias</li>
                <li className="rv">Reativam quem sumiu, com mensagem personalizada</li>
                <li className="rv">Fazem o follow-up de quem perguntou e não fechou</li>
                <li className="rv">Detectam horários fracos e sugerem a promoção certa</li>
                <li className="rv">Você aprova tudo. Eles executam. O mérito é seu.</li>
              </ul>
            </div>
            <div className="rv">
              <div className="phone" ref={phoneRef}>
                <div className="ph-top">
                  <div className="ph-av">EA</div>
                  <div>
                    <div className="ph-name">Espaço Ana Beleza</div>
                    <div className="ph-status">online agora</div>
                  </div>
                </div>
                <div className="ph-chat" ref={chatRef}></div>
                <div className="ph-foot">
                  <span>Recuperado hoje</span>
                  <span className="ph-rec" ref={recRef}>
                    R$ 0
                  </span>
                </div>
              </div>
              <p className="ph-legend">▲ Demonstração do fluxo de reativação — a IA escreve, você aprova.</p>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

/* ── CALCULADORA (3 ranges) ── */
function Calculadora() {
  const [clientes, setClientes] = useState(200);
  const [ticket, setTicket] = useState(120);
  const [somem, setSomem] = useState(30);

  // P5(b): a referência do "×mensalidade" é o plano DESTAQUE (card "Premium" da LP
  // = slug `pro`), lida do banco — NUNCA hardcoded. Se trocássemos só os cards, este
  // múltiplo continuaria dividindo por um preço velho e mentiria em silêncio.
  const { data: plans } = usePublicPlans();
  const refPlan = findPlan(plans, PLAN_SLUG.premium);
  const refPrice = refPlan?.price_monthly ?? null;

  const lost = Math.round(clientes * (somem / 100) * ticket * 4.4);
  const rec = Math.round(lost * 0.3);
  // Fallback gracioso: sem preço (loading/erro/plano fora do ar) o múltiplo some da
  // frase em vez de exibir "NaN×" ou um número inventado.
  const mult = refPrice && refPrice > 0 ? Math.max(1, Math.round(rec / 12 / refPrice)) : null;

  return (
    <section className="block" id="calc">
      <div className="wrap">
        <span className="eyebrow rv">Faça as contas</span>
        <h2 className="serif rv">
          Quanto dinheiro está <em>vazando</em> da sua carteira?
        </h2>
        <p className="lead rv">
          Aqui você mexe os controles e vê uma <b>estimativa ilustrativa</b>. No <b>Raio-X da Carteira</b> a gente te
          entrega <b>o seu número real</b>, com a sua base — antes de qualquer boleto.
        </p>
        <div className="calc-card rv">
          <div>
            <div className="ctrl">
              <label htmlFor="r1">
                Clientes na sua carteira <output>{clientes}</output>
              </label>
              <input
                type="range"
                id="r1"
                min="50"
                max="1000"
                step="10"
                value={clientes}
                onChange={(e) => setClientes(+e.target.value)}
              />
            </div>
            <div className="ctrl">
              <label htmlFor="r2">
                Ticket médio por visita <output>{BRL.format(ticket)}</output>
              </label>
              <input
                type="range"
                id="r2"
                min="50"
                max="500"
                step="10"
                value={ticket}
                onChange={(e) => setTicket(+e.target.value)}
              />
            </div>
            <div className="ctrl">
              <label htmlFor="r3">
                Clientes que somem por ano <output>{somem}%</output>
              </label>
              <input
                type="range"
                id="r3"
                min="10"
                max="60"
                step="5"
                value={somem}
                onChange={(e) => setSomem(+e.target.value)}
              />
            </div>
          </div>
          <div className="calc-out">
            <span className="co-label">Vazando da sua carteira</span>
            <div className="co-big serif">{BRL.format(lost)}</div>
            <p className="co-sub">por ano, em clientes que sumiram sem ninguém chamar de volta</p>
            <div className="co-pay">
              Recuperando só <b>3 em cada 10</b>, a sua EquipIA devolve <b>{BRL.format(rec)}</b>/ano
              {mult !== null ? (
                <>
                  {" "}
                  — <b>{mult}×</b> a mensalidade.
                </>
              ) : (
                "."
              )}
            </div>
            <p className="co-note">
              Estimativa ilustrativa com base nos seus números — o painel real mostra o valor exato, cliente a cliente.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── COMO FUNCIONA (4 passos) ── */
function ComoFunciona() {
  return (
    <section className="block" id="como-funciona" style={{ paddingTop: "30px", paddingBottom: "50px" }}>
      <div className="wrap">
        <span className="eyebrow rv">Onboarding guiado, tela a tela</span>
        <h2 className="serif rv">
          Seu negócio no automático em <em>quatro passos.</em>
        </h2>
        <p className="lead rv">
          Nada de se virar sozinho com manuais: um assistente te conduz do início ao fim, e a nossa equipe acompanha
          cada etapa.
        </p>
        <div className="passos">
          <div className="passo rv">
            <span className="pn serif">1</span>
            <h3>Seu espaço</h3>
            <p>
              Você informa o básico — nome, marca, cor, horários — num <b>assistente guiado</b>. Minutos, não dias.
            </p>
          </div>
          <div className="passo rv">
            <span className="pn serif">2</span>
            <h3>Serviços &amp; equipe</h3>
            <p>O que você faz, quanto custa, quem atende. O catálogo nasce pronto para a agenda e para o seu link público.</p>
          </div>
          <div className="passo rv">
            <span className="pn serif">3</span>
            <h3>WhatsApp conectado</h3>
            <p>
              Escaneou o QR, pronto: <b>suas conversas viram sua carteira de clientes</b> — na hora, <b>sem pedir sua
              senha</b> — você conecta e autoriza, e continua no controle de tudo.
            </p>
          </div>
          <div className="passo rv">
            <span className="pn serif">4</span>
            <h3>EquipIA no ar</h3>
            <p>
              Os agentes assumem atendimento, confirmações e reativação — e o painel mostra <b>o retorno em R$</b>.
            </p>
          </div>
        </div>
        <p className="guiado rv">
          Travou em qualquer passo? <b>A gente entra junto</b> — suporte durante toda a implantação.
        </p>
      </div>
    </section>
  );
}

/* ── PLANOS (box branco, 3 planos, 1 destaque) — preços reais de lançamento ── */
/** P5(a)+P1: bloco de preço + CTA de um card. Preço e checkout SÓ do banco.
 *  - carregando/indisponível → CTA vira WhatsApp (nunca um href="#" morto) e o
 *    preço não é inventado;
 *  - list_price_monthly nulo → a âncora "de R$ X" simplesmente não aparece. */
function PlanoPreco({ plan, loading }: { plan?: PublicPlan; loading: boolean }) {
  if (loading) return <div className="preco serif"><small>carregando…</small></div>;
  if (!plan) return null;
  return (
    <div className="preco serif">
      {plan.list_price_monthly != null && plan.list_price_monthly > plan.price_monthly && (
        <small style={{ display: "block", opacity: 0.55, textDecoration: "line-through", fontSize: 15, marginBottom: 4 }}>
          de {BRL.format(plan.list_price_monthly)}
        </small>
      )}
      <span style={{ whiteSpace: "nowrap" }}>{BRL.format(plan.price_monthly)}</span>
      <small>/mês</small>
    </div>
  );
}

function PlanoCta({ plan, className }: { plan?: PublicPlan; className: string }) {
  // Sem checkout_url ainda (ou plano fora do ar) → manda pro WhatsApp comercial
  // em vez de um link morto. O checkout NUNCA é hardcoded aqui.
  // R1: o checkout leva o tracking junto → o Cakto passa a saber a origem da venda.
  const href = plan?.checkout_url ? withTracking(plan.checkout_url) : WHATSAPP_URL;
  return (
    <a
      className={className}
      href={href}
      onClick={() =>
        fbqTrack(plan?.checkout_url ? "InitiateCheckout" : "Contact", {
          content_name: plan?.slug ?? "sem-plano",
          value: plan?.price_monthly ?? undefined,
          currency: "BRL",
        })
      }
    >
      {plan?.checkout_url ? "Assinar agora" : "Falar com a gente"}
    </a>
  );
}

function Planos() {
  // P5(a): catálogo 100% do banco (view public_plans, SELECT anônimo, já filtrada
  // por is_active e ordenada). Fetch falho → cards sem preço, página inteira segue
  // de pé (fallback gracioso, igual à SalesPage).
  const { data: plans, isLoading } = usePublicPlans();
  const essencial = findPlan(plans, PLAN_SLUG.essencial);
  const premium = findPlan(plans, PLAN_SLUG.premium);
  const ultra = findPlan(plans, PLAN_SLUG.ultra);

  return (
    <section className="block planos-wrap" id="planos" style={{ paddingTop: "30px", paddingBottom: "40px" }}>
      <div className="wrap">
        <div className="planos-box rv">
          <h2 className="serif">
            Escolha o tamanho do <em>seu momento.</em>
          </h2>
          <p className="lead">
            Sem fidelidade. Cancele quando quiser, sem multa e sem burocracia.{" "}
            <b>Uma cliente recuperada por mês já paga a mensalidade — as outras são lucro.</b>
          </p>
          <div className="serie">
            ✨ <b>Agentes de IA de série</b> em todos os planos — do primeiro ao último.
          </div>
          <p className="lead rv" style={{ margin: "6px 0 18px" }}>
            <b>Preço de lançamento</b> — sobe pra tabela em breve. <b>Anual:</b> 2 meses por nossa conta (10× o mensal).
          </p>
          <div className="planos">
            <div className="plano rv">
              <h3>Essencial</h3>
              <PlanoPreco plan={essencial} loading={isLoading} />
              <p className="p-desc">Para quem atende sozinho: organiza a casa e liga a IA no atendimento.</p>
              <ul className="p-feats">
                <li>Agentes de IA no WhatsApp (de série)</li>
                <li>Agenda inteligente + link público 24/7</li>
                <li>Carteira de clientes importada do WhatsApp</li>
                <li>Painel do dinheiro recuperado</li>
              </ul>
              <PlanoCta plan={essencial} className="btn btn-quiet" />
            </div>
            <div className="plano destaque rv">
              <span className="p-tag">Mais escolhido</span>
              <h3>Premium</h3>
              {/* card "Premium" da LP = slug `pro` no banco (ver PLAN_SLUG). */}
              <PlanoPreco plan={premium} loading={isLoading} />
              <p className="p-desc">Para espaços com equipe: tudo do Essencial, em escala.</p>
              <ul className="p-feats">
                <li>Tudo do Essencial</li>
                <li>Vários profissionais na agenda</li>
                <li>Reativação e campanhas em escala</li>
                <li>Pacotes &amp; sessões com aviso de vencimento</li>
                <li>Financeiro &amp; indicadores completos</li>
              </ul>
              <PlanoCta plan={premium} className="btn btn-terra" />
            </div>
            <div className="plano rv">
              <h3>Ultra</h3>
              {/* card "Ultra" da LP = slug `premium` no banco (ver PLAN_SLUG). */}
              <PlanoPreco plan={ultra} loading={isLoading} />
              <p className="p-desc">Para operações maiores: crescimento ativo e migração assistida.</p>
              <ul className="p-feats">
                <li>Tudo do Premium</li>
                <li>Funis, formulários e quizzes de captação</li>
                <li>Migração assistida da sua base</li>
                <li>Suporte prioritário</li>
              </ul>
              <PlanoCta plan={ultra} className="btn btn-quiet" />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── CHAMADA PÓS-PLANOS (3 botões "Começar com <plano>") ── */
function ChamadaPosPlanos() {
  return (
    <section className="final" style={{ padding: "18px 0 110px" }}>
      <div className="wrap">
        <h2 className="serif rv">
          O seu espaço merece uma gestão <em>à sua altura.</em>
        </h2>
        <p className="fnote rv">
          Suas clientes só percebem uma coisa: o atendimento ficou melhor!
        </p>
        {/* D4: ponto de maior momentum (pós-preço) terminava SEM saída — o comentário
            da seção prometia botões que nunca existiram. CTA único, mesmo padrão do hero. */}
        <div className="hero-ctas rv" style={{ marginTop: 22 }}>
          <a
            className="btn btn-rose"
            href={WHATSAPP_URL}
            onClick={() => fbqTrack("Lead", { content_name: "pos_planos", content_category: "whatsapp_cta" })}
          >
            Quero começar pelo Raio-X grátis
          </a>
        </div>
      </div>
    </section>
  );
}

/* ── COFOUNDER — Programa Fundadora (creme amarelado, mentoria 12×R$387) ── */
/* P6: bloco público do form (o `load` expõe só id/tipo/label — NÃO expõe maps_to). */
type LoadedBlock = { id: string; block_type: string; label: string | null; order_index: number };

function Cofounder() {
  const [modalOpen, setModalOpen] = useState(false);
  const [modalStep, setModalStep] = useState<"ask" | "email" | "info" | "done">("ask");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [whatsapp, setWhatsapp] = useState("");
  const [blocks, setBlocks] = useState<LoadedBlock[] | null>(null);
  const [sending, setSending] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const openModal = () => {
    setModalStep("ask");
    setNome("");
    setEmail("");
    setWhatsapp("");
    setErro(null);
    setModalOpen(true);
  };

  const closeModal = () => setModalOpen(false);

  // P6: os block_id são resolvidos em RUNTIME (action:'load') em vez de hardcodados
  // — se alguém recriar os blocos no builder, a LP continua postando nos IDs certos.
  // Só carrega quando o modal abre (nada de fetch no 1º paint da LP).
  useEffect(() => {
    if (!modalOpen || blocks) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("platform-form-submit", {
        body: { action: "load", slug: COFOUNDER_FORM_SLUG },
      });
      if (cancelled) return;
      if (error || !data?.blocks) {
        setErro("Não consegui carregar o formulário agora. Tente de novo em instantes.");
        return;
      }
      setBlocks(data.blocks as LoadedBlock[]);
    })();
    return () => { cancelled = true; };
  }, [modalOpen, blocks]);

  // O form tem 3 campos OBRIGATÓRIOS (Nome/E-mail/WhatsApp) — validação é dura no
  // servidor. Casamos por block_type (há exatamente um de cada).
  const blockIdOf = (type: string) => blocks?.find((b) => b.block_type === type)?.id;

  const enviar = async () => {
    setErro(null);
    const idNome = blockIdOf("text");
    const idEmail = blockIdOf("email");
    const idFone = blockIdOf("phone");
    if (!idNome || !idEmail || !idFone) {
      setErro("Não consegui carregar o formulário agora. Tente de novo em instantes.");
      return;
    }
    // Pré-checagem local só pra evitar round-trip óbvio; o servidor é a autoridade.
    if (!nome.trim() || !email.trim() || !whatsapp.trim()) {
      setErro("Preencha nome, e-mail e WhatsApp.");
      return;
    }

    setSending(true);
    try {
      const q = new URLSearchParams(window.location.search);
      const { data, error } = await supabase.functions.invoke("platform-form-submit", {
        body: {
          action: "submit",
          slug: COFOUNDER_FORM_SLUG,
          responses: {
            [idNome]: nome.trim(),
            [idEmail]: email.trim(),
            // só dígitos: o servidor valida telefone BR (10-11 dígitos após o 55).
            [idFone]: whatsapp.replace(/\D/g, ""),
          },
          tracking: {
            utm_source: q.get("utm_source") || undefined,
            utm_medium: q.get("utm_medium") || undefined,
            utm_campaign: q.get("utm_campaign") || undefined,
            utm_term: q.get("utm_term") || undefined,
            utm_content: q.get("utm_content") || undefined,
            referrer_url: document.referrer || undefined,
            landing_page: window.location.href,
            user_agent: navigator.userAgent,
          },
        },
      });

      // A edge devolve 400 com {error:"<msg em PT-BR>"}; no supabase-js o corpo
      // do erro vem em error.context — sem ler isso, a mensagem boa se perde.
      if (error) {
        let msg = "Não consegui enviar agora. Tente de novo em instantes.";
        try {
          const body = await (error as any)?.context?.json?.();
          if (body?.error) msg = body.error;
        } catch { /* corpo não-JSON → mantém a mensagem genérica */ }
        setErro(msg);
        return;
      }
      if (!data?.success) {
        setErro(data?.error || "Não consegui enviar agora. Tente de novo em instantes.");
        return;
      }
      setModalStep("done");
    } catch {
      setErro("Não consegui enviar agora. Tente de novo em instantes.");
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="cofounder" id="fundadora">
      <div className="wrap">
        <span className="eyebrow rv">Programa Cofounder - 50 vagas</span>
        <h2 className="serif rv">
          Um <em>cofounder</em> para o seu negócio.
        </h2>
        <p className="cof-lead rv">
          Para quem quer <b>ir além</b>: empreender com técnica, método e gestão profissional. Não é curso. Não é turma.
          É a gente sentando com você — <b>1 a 1</b> — para olhar o <b>seu</b> espaço de perto.
        </p>
        <div className="cof-grid">
          <ul className="cof-points rv">
            <li>
              <div className="cp-h">Individual e personalizada</div>
              <p className="cp-d">
                Nada de técnica genérica que serve pra qualquer negócio. Aqui a gente analisa o <em>seu</em> espaço, com
                o seu contexto e os seus números.
              </p>
            </li>
            <li>
              <div className="cp-h">Raio-X financeiro do seu negócio</div>
              <p className="cp-d">
                Margem líquida, margem de contribuição, ROI.{" "}
                <em>Se você não sabe esses números hoje, é um bom sinal de que está trabalhando às cegas.</em>
              </p>
            </li>
            <li>
              <div className="cp-h">Percepção de marca e precificação</div>
              <p className="cp-d">
                Posicionamento, valor percebido, forma de vender e composição de ticket — o que faz a cliente escolher (e
                pagar bem) por você.
              </p>
            </li>
            <li>
              <div className="cp-h">8 encontros individuais, no seu tempo</div>
              <p className="cp-d">
                1 hora cada, marcados sob demanda ao longo de 3 meses. E toda a implantação do sistema feita por nós, em
                paralelo.
              </p>
            </li>
          </ul>
          <div className="cof-card rv">
            <span className="cc-badge">Produto apenas para espaços que já são assinantes NexvyBeauty</span>
            <span className="cc-tag">Programa Cofounder</span>
            <div className="cc-price serif">12× R$ 387</div>
            <p className="cc-full">no cartão — cabe no seu bolso, sem pesar no mês</p>
            <span className="cc-scarce">50 vagas · mentoria 1 a 1</span>
            <button className="btn" type="button" onClick={openModal}>
              Quero uma vaga na mentoria →
            </button>
          </div>
        </div>
      </div>

      {modalOpen && (
        <div className="cof-modal-overlay" onClick={closeModal} role="dialog" aria-modal="true">
          <div className="cof-modal" onClick={(e) => e.stopPropagation()}>
            <button className="cof-modal-close" type="button" onClick={closeModal} aria-label="Fechar">
              ×
            </button>

            {modalStep === "ask" && (
              <div className="cof-modal-step">
                <h3 className="cof-modal-title">Você já é assinante do NexvyBeauty?</h3>
                <div className="cof-modal-actions">
                  <button className="btn" type="button" onClick={() => setModalStep("email")}>
                    Sim
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setModalStep("info")}>
                    Não
                  </button>
                </div>
              </div>
            )}

            {modalStep === "email" && (
              <form
                className="cof-modal-step"
                onSubmit={(e) => { e.preventDefault(); if (!sending) void enviar(); }}
              >
                <h3 className="cof-modal-title">Garanta sua vaga na mentoria</h3>
                {/* A vaga só fica reservada se este lead casar com a assinatura (por e-mail/telefone).
                    Dado diferente = vaga que o sistema não enxerga — daí o aviso ser explícito. */}
                <p className="cof-modal-text">
                  Use os mesmos dados que você usa (ou vai usar) na assinatura do NexvyBeauty — é assim que a gente
                  encontra você e reserva sua vaga.
                </p>
                <input
                  className="cof-modal-input"
                  type="text"
                  placeholder="Seu nome completo"
                  autoComplete="name"
                  value={nome}
                  onChange={(e) => setNome(e.target.value)}
                  disabled={sending}
                />
                <input
                  className="cof-modal-input"
                  type="email"
                  placeholder="E-mail da assinatura"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={sending}
                />
                <input
                  className="cof-modal-input"
                  type="tel"
                  placeholder="WhatsApp da assinatura (com DDD)"
                  autoComplete="tel"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                  disabled={sending}
                />
                {erro && (
                  <p className="cof-modal-text" role="alert" style={{ color: "#b3261e" }}>
                    {erro}
                  </p>
                )}
                <button className="btn" type="submit" disabled={sending || !blocks}>
                  {sending ? "Enviando…" : "Enviar"}
                </button>
                <button
                  className="cof-modal-back"
                  type="button"
                  onClick={() => setModalStep("ask")}
                  disabled={sending}
                >
                  ← Voltar
                </button>
              </form>
            )}

            {modalStep === "done" && (
              <div className="cof-modal-step">
                <h3 className="cof-modal-title">Recebemos seu interesse!</h3>
                <p className="cof-modal-text">
                  A gente entra em contato pelo WhatsApp. Sua vaga fica reservada quando você assinar o NexvyBeauty.
                </p>
                <button className="btn" type="button" onClick={closeModal}>
                  Fechar
                </button>
              </div>
            )}

            {modalStep === "info" && (
              <div className="cof-modal-step">
                <h3 className="cof-modal-title">Este produto é exclusivo para assinantes</h3>
                <p className="cof-modal-text">
                  O Programa Cofounder é atendimento 1 a 1 — 8 encontros individuais em 3 meses — e só faz sentido
                  aplicado dentro do NexvyBeauty. Assine um dos planos e volte aqui: sua vaga fica reservada até o
                  primeiro encontro.
                </p>
                <button className="cof-modal-back" type="button" onClick={() => setModalStep("ask")}>
                  ← Voltar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/* ── FAQ ── */
function Faq() {
  const faqs = [
    {
      q: "Preciso instalar alguma coisa?",
      a: "Não. Roda 100% no navegador, no celular e no computador. Basta criar a conta e começar a usar.",
    },
    {
      q: "Já tenho meus dados em outro sistema. E agora?",
      a: "Importamos sua base de clientes e serviços por planilha. Nos planos superiores, nosso time faz a migração com você.",
    },
    {
      q: "A IA realmente funciona?",
      a: "Sim. Ela analisa o histórico real do seu negócio e gera sugestões concretas — quem reativar, qual horário promover, qual pacote oferecer. Você aprova antes de qualquer envio.",
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim. Sem multa, sem fidelidade, sem constrangimento.",
    },
    {
      q: "Funciona para o meu tipo de espaço?",
      a: "Funciona para qualquer espaço de beleza e bem-estar: nails, lash, sobrancelhas, estética, barbearia, podologia, clínicas.",
    },
    {
      q: "Como funciona o link de agendamento?",
      a: "Seu espaço ganha um link único. Você compartilha no Instagram e no WhatsApp, e a cliente reserva sozinha — a qualquer hora.",
    },
    {
      q: "Isso não é golpe? Vocês pegam meu WhatsApp?",
      a: "Você conecta seu WhatsApp de um jeito seguro e padrão — a gente NÃO pede sua senha. A IA só propõe as mensagens; nada é enviado sem você aprovar. Antes de pagar, você recebe o Raio-X da sua carteira em até 48h; se o número não te animar, não assina — e a gente apaga seus dados em 72h.",
    },
    {
      q: "A IA não vai soar robô com minhas clientes?",
      a: "Ela é treinada com o seu tom, seu nome e as suas regras. Nada é enviado sem você aprovar — na prática, é como ter uma recepcionista escrevendo do seu jeito, só muito mais rápida.",
    },
    {
      q: "E se eu me arrepender?",
      a: "Você tem 7 dias de arrependimento (CDC art. 49) e cancelamento a qualquer momento, sem multa e sem fidelidade.",
    },
  ];
  return (
    <section className="block" id="faq" style={{ paddingTop: "10px", paddingBottom: "10px" }}>
      <div className="wrap">
        <span className="eyebrow faq-eyebrow rv">Perguntas frequentes</span>
        <div className="faq rv">
          {faqs.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p className="a">{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ── FOOTER ── */
function Footer() {
  return (
    <footer>
      <div className="wrap foot">
        <div className="foot-row">
        <div className="foot-brand">
          <a href="#top" className="wordmark serif">
            Nexvy<em>Beauty</em>
          </a>
          <p className="fsign serif">Feito no Brasil, para quem faz acontecer.</p>
        </div>

        <div className="foot-grid">
          <div className="foot-col">
            <h4>Empresa</h4>
            <a href="#careers">Ecossistema</a>
            <a href="#about">Sobre nós</a>
          </div>
          <div className="foot-col">
            <h4>Redes</h4>
            <div className="fsocial">
              {/* P4: Instagram oficial. */}
              <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener" aria-label="Instagram">
                <Instagram size={20} />
              </a>
              <a href={WHATSAPP_URL} target="_blank" rel="noreferrer noopener" aria-label="WhatsApp">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.134 1.585 5.931L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
                </svg>
              </a>
            </div>
          </div>
        </div>
        </div>

        <div className="fline">
          <p className="copy">© 2026 NexvyBeauty — Sistema premium para negócios de beleza e bem-estar.</p>
          <div className="foot-bottom">
            {/* P4: rotas internas que JÁ existem (App.tsx /termos e /privacidade),
                servidas pelo mesmo container no apex. <Link> mantém o SPA. */}
            <Link to="/termos">Termos de Uso</Link>
            <Link to="/privacidade">Privacidade (LGPD)</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
