/**
 * LP apex /vendas — oferta "Agenda Lotada sem Contratar".
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
 *   BUG id="como-funciona" duplicado → Modulos ficou id="modulos".
 *   #como-funciona agora é a seção das 3 cadeiras (ex-#como-fica); nav aponta para ela.
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
import "./lp-apex-tokens.css";
import "./clientes-de-volta-lp-apex.css";
import "./clientes-de-volta-lp-apex-islands.css";
import "./clientes-de-volta-lp-apex-planos.css";
import "./clientes-de-volta-lp-apex-faq.css";

/* ── formatação BRL (igual ao protótipo) ── */
const BRL = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const BRL_NUM = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });

/* ── P2: WhatsApp comercial (NEXVY_VENDAS, número oficial) — Hero + Raio-X + rodapé ── */
const WHATSAPP_URL =
  "https://wa.me/5511955021205?text=" +
  encodeURIComponent("Oi! Quero ver como ficaria no meu espaço");

/* ── P3: login "Entrar" → app do salão ── */
const APP_URL = "https://app.nexvybeauty.com.br";

/* ── P4: Instagram oficial ── */
const INSTAGRAM_URL = "https://www.instagram.com/nexvybeauty.br";

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

/** Gera um event_id pra deduplicar o evento entre browser (Pixel) e servidor
 *  (web-CAPI). O mesmo id nos dois lados → o Meta funde e não conta duas vezes. */
function newEventId(): string {
  try {
    const c = (globalThis as unknown as { crypto?: { randomUUID?: () => string } }).crypto;
    if (c?.randomUUID) return c.randomUUID();
  } catch { /* segue pro fallback */ }
  return `${Date.now()}.${Math.random().toString(16).slice(2)}`;
}

/** Espelho SERVER-SIDE do evento (web-CAPI) — recupera quem o adblock/ITP bloqueia
 *  no browser. Best-effort e silencioso: nunca pode quebrar o CTA. */
function sendWebCapi(event: string, eventId: string, custom?: Record<string, unknown>): void {
  try {
    const t = getTracking();
    void supabase.functions
      .invoke("platform-web-capi", {
        body: {
          event_name: event,
          event_id: eventId,
          event_source_url: window.location.href.split("#")[0],
          fbc: t.fbc,
          fbp: t.fbp,
          custom_data: custom && Object.keys(custom).length ? custom : undefined,
        },
      })
      .catch(() => { /* CAPI best-effort: nunca quebra o CTA */ });
  } catch { /* idem */ }
}

/** Dispara o evento no Pixel (browser) E no web-CAPI (servidor) com o MESMO
 *  event_id. Sem pixel, o browser é no-op; o servidor ainda captura. */
function fbqTrack(event: string, params?: Record<string, unknown>): void {
  const eventId = newEventId();
  try {
    const fbq = (window as unknown as { fbq?: (...a: unknown[]) => void }).fbq;
    if (typeof fbq === "function") fbq("track", event, params ?? {}, { eventID: eventId });
  } catch { /* rastreamento nunca pode quebrar o CTA */ }
  sendWebCapi(event, eventId, params);
}

/** Acha o plano por slug na lista pública (undefined enquanto carrega / se sumir). */
function findPlan(plans: PublicPlan[] | undefined, slug: string): PublicPlan | undefined {
  return (plans ?? []).find((p) => p.slug === slug && p.is_public);
}

type BillingCycle = "monthly" | "quarterly" | "yearly";

/** Anual só existe se o banco trouxe price_yearly > 0. Nunca derivar 10×. */
function hasYearlyPrice(plan?: PublicPlan): boolean {
  return Number(plan?.price_yearly) > 0;
}

/** Trimestral só existe se o banco trouxe price_quarterly > 0. */
function hasQuarterlyPrice(plan?: PublicPlan): boolean {
  return Number(plan?.price_quarterly) > 0;
}

function cyclePrice(plan: PublicPlan, cycle: BillingCycle): number | null {
  if (cycle === "yearly") {
    const yearly = Number(plan.price_yearly);
    return yearly > 0 ? yearly : null;
  }
  if (cycle === "quarterly") {
    const quarterly = Number(plan.price_quarterly);
    return quarterly > 0 ? quarterly : null;
  }
  const monthly = Number(plan.price_monthly);
  return Number.isFinite(monthly) ? monthly : null;
}

/** Mensal usa checkout_url. Trimestral/anual usam a URL do ciclo; se só existir um, reusa mensal. */
function cycleCheckout(plan: PublicPlan | undefined, cycle: BillingCycle): string | null {
  if (!plan) return null;
  if (cycle === "yearly") return plan.checkout_url_yearly || plan.checkout_url || null;
  if (cycle === "quarterly") return plan.checkout_url_quarterly || plan.checkout_url || null;
  return plan.checkout_url || null;
}

/* Hero live — woman + official isolated cards + live Canva headline (not a full-page PNG). */
const HERO_WOMAN_SRC = "/hero/hero-woman.png";
const HERO_CARD_INBOX_SRC = "/hero/NB-card-ana.png";
const HERO_CARD_SEMANA_SRC = "/hero/NB-card-juliana.png";
const NAV_LOGO_SRC = "/email/logo-v1-light.png";
const HERO_ART_BG = "#410c18";

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

  /* Web-CAPI: espelha o PageView do browser no servidor com o MESMO event_id
     (window.__nxvPvId, gerado no index.html), pra recuperar o visitante que o
     adblock/ITP bloqueia no browser SEM duplicar quem já foi contado. Best-effort. */
  useEffect(() => {
    const pvId = (window as unknown as { __nxvPvId?: string }).__nxvPvId;
    if (pvId) sendWebCapi("PageView", pvId);
  }, []);

  /* ÂNCORA DE HASH (#planos, #faq, …) — sem isto o link de campanha NÃO rola.
     MEDIDO em produção 2026-08-01 com https://nexvybeauty.com.br/#planos:
     hash="#planos" ok, elemento existe, topo da seção em 8259px — e scrollY=0.
     Causa: a LP entra por lazyWithRetry (App.tsx:102). O browser aplica o hash
     ANTES do chunk montar, não acha o id, desiste — e ninguém rola depois.
     Consequência real: link de story/anúncio cai no topo, ~10 telas acima do alvo.

     Por que RETENTAR em vez de rolar uma vez: mesmo já montado, a posição muda
     enquanto webfont e imagens carregam (a própria LP injeta a Playfair no efeito
     abaixo). Rolar cedo demais acerta o pixel errado. Tentamos por ~2s e paramos
     assim que a posição se estabiliza. Se a pessoa rolar sozinha, desistimos na
     hora — sequestrar a página de quem já está lendo seria pior que não rolar. */
  useEffect(() => {
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;

    let cancelado = false;
    const inicio = Date.now();

    const aoRolarManual = () => { cancelado = true; };
    window.addEventListener("wheel", aoRolarManual, { once: true, passive: true });
    window.addEventListener("touchstart", aoRolarManual, { once: true, passive: true });

    /* SEM saída antecipada por "posição repetida" — foi o erro da 1ª versão deste
       efeito: dois frames consecutivos dão o mesmo topo LOGO NO INÍCIO (a seção
       nem nasceu), então ela desistia no 2º frame. Medido: o topo de #planos
       variou 8259 → 24171 → 13094px conforme a página montava, porque os planos
       vêm de usePublicPlans (fetch) e a seção só existe depois da resposta.
       Re-ancorar a cada frame por 4s é barato (scrollIntoView numa posição já
       correta é no-op) e é o único jeito de acompanhar layout que muda sozinho. */
    const tentar = () => {
      if (cancelado || Date.now() - inicio > 4000) return;
      document.getElementById(id)?.scrollIntoView({ behavior: "auto", block: "start" });
      requestAnimationFrame(tentar);
    };
    requestAnimationFrame(tentar);

    return () => {
      cancelado = true;
      window.removeEventListener("wheel", aoRolarManual);
      window.removeEventListener("touchstart", aoRolarManual);
    };
  }, []);

  /* PORTE: injeta a webfont + título de forma ESCOPADA à LP (sem tocar o index.html global).
     VERIFICADO na lp.css (não é suposição): o corpo usa fontes de SISTEMA (-apple-system/SF Pro/Segoe UI/Roboto)
     e o .serif usa `"Didot","Bodoni MT","Playfair Display","Georgia"` → a ÚNICA webfont necessária é a
     Playfair Display (em Mac o Didot resolve nativo; em Win/Linux cai na Playfair — sem ela cai em Georgia
     e o design muda). Fraunces/Inter NÃO são referenciadas pela lp.css (a premissa do handoff estava errada).
     TODO(porte-B): pra zero-FOUT em produção, a controladora pode mover o <link> pro index.html. */
  useEffect(() => {
    const prevTitle = document.title;
    document.title = "NexvyBeauty: Feito com ❤️, para quem faz acontecer 🚀💪";
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
      href: "https://fonts.googleapis.com/css2?family=Montserrat:wght@500;600;700&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Poppins:wght@600;700&display=swap",
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

  // data-theme="light" trava a paleta Hallmark desta LP (tokens em .lp-root).
  // Sem isto, um prefers-color-scheme:dark residual do app shell pode vazar.
  return (
    <div className="lp-root lp-apex" data-theme="light" ref={rootRef} id="top">
      <div id="progress" ref={progressRef} />

      <Nav />
      <Hero />
      <Nichos />
      <EyeSection />
      <ComoFicaria />
      <Equipia />
      <Planos />
      <Faq />
      <Footer />
    </div>
  );
}

/* ── Nav (sticky burgundy bar; Entrar on hero, CTA past hero) ── */
function Nav() {
  const navRef = useRef<HTMLElement>(null);
  const [onHero, setOnHero] = useState(true);

  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const hero = () => document.querySelector<HTMLElement>(".hero.hero-live");
    const syncHero = () => {
      const section = hero();
      if (!section) return;
      const navBottom = nav.getBoundingClientRect().bottom;
      setOnHero(section.getBoundingClientRect().bottom > navBottom + 24);
    };
    const onScroll = () => {
      syncHero();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    const section = hero();
    let io: IntersectionObserver | null = null;
    if (section && "IntersectionObserver" in window) {
      io = new IntersectionObserver(() => syncHero(), {
        threshold: [0, 0.12, 0.35, 0.6, 1],
      });
      io.observe(section);
    }
    syncHero();
    return () => {
      window.removeEventListener("scroll", onScroll);
      io?.disconnect();
    };
  }, []);

  return (
    <header className={`nav${onHero ? " is-on-hero" : " is-past-hero"}`} ref={navRef} id="nav">
      <div className="nav-bar">
        <a href="#top" className="wordmark wordmark-logo">
          <img src={NAV_LOGO_SRC} alt="NexvyBeauty" width={722} height={163} />
        </a>
        <nav className="nav-cluster" aria-label="Seções">
          <a href="#como-funciona">Como Funciona</a>
          <a href="#equipia">EquipIA</a>
          <a href="#planos">Planos</a>
        </nav>
        <div className="nav-end">
          <a className="nav-login" href={APP_URL}>
            Entrar
          </a>
          <a className="btn btn-sm nav-cta-wide" href={WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
            Veja como ficaria no seu espaço
          </a>
        </div>
      </div>
    </header>
  );
}

/* ── HERO — live HTML/CSS from Canva DAHS_zHCndY (woman + cards + live type + CTA) ── */
function Hero() {
  return (
    <header className="hero hero-live" style={{ backgroundColor: HERO_ART_BG }}>
      <div className="hero-live-stage">
        <div className="hero-live-visual">
          <img
            className="hero-live-card hero-live-card-inbox"
            src={HERO_CARD_INBOX_SRC}
            alt=""
            width={2000}
            height={1280}
            decoding="async"
          />
          <img
            className="hero-live-card hero-live-card-semana"
            src={HERO_CARD_SEMANA_SRC}
            alt=""
            width={2000}
            height={1280}
            decoding="async"
          />
          <img
            className="hero-live-woman"
            src={HERO_WOMAN_SRC}
            alt=""
            width={964}
            height={1422}
            decoding="async"
            fetchPriority="high"
          />
        </div>
        <h1 className="hero-live-copy">
          <span className="hero-live-kicker">NÃO CONTRATE</span>
          {" "}
          <span className="hero-live-word">ATENDENTE</span>
          {" "}
          <span className="hero-live-sub">para o seu espaço</span>
        </h1>
      </div>
      <div className="hero-live-bar">
        <div className="hero-live-bar-inner">
          <p className="hero-live-247">TENHA UMA 24/7</p>
          <a
            className="btn hero-live-cta"
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => fbqTrack("Lead", { content_name: "lp_hero_espaco", content_category: "whatsapp_cta" })}
          >
            Veja como ficaria no seu espaço
          </a>
        </div>
      </div>
    </header>
  );
}

/* ── NOSSO COMPROMISSO — o olho que pisca e revela ── */
function EyeSection() {
  return _EyeSectionImpl();
}

/* ── COMO FICARIA — as 3 cadeiras da EquipIA (diagnóstico visual) ── */
function ComoFicaria() {
  const cadeiras = [
    {
      n: "1",
      t: "Recepcionista 24/7",
      d: "Tira dúvida, agenda e confirma — de noite e no domingo, enquanto você atende.",
    },
    {
      n: "2",
      t: "Quem Sumiu",
      d: "Lista quem parou de vir e a mensagem no seu tom. Você aprova. Ela executa.",
    },
    {
      n: "3",
      t: "Quem Não Fechou",
      d: "Follow-up de quem perguntou preço e sumiu — sem você caçar no WhatsApp.",
    },
  ];
  return (
    <section className="wb-sec como-fica-sec" id="como-funciona">
      <div className="wrap">
        <div className="como-story-grid">
          <header className="como-story">
            <p className="hero-kicker">Não contrate recepcionista</p>
            <h2>
              Agenda lotada,
              <br />
              sem contratar
              <br />
              <em>gente nova.</em>
            </h2>
            <p className="lead">
              WhatsApp atendido de noite e no domingo. Quem sumiu e quem não fechou, de volta na agenda.
              Você aprova cada mensagem. <b>Não contrata gente nova.</b>
            </p>
          </header>
          <header className="como-story">
            <p className="hero-kicker">Como ficaria no seu espaço</p>
            <h3 className="seats-head">
              Três cadeiras. <em>Você não contrata nenhuma.</em>
            </h3>
            <p className="lead">
              O WhatsApp do seu espaço, com quem atende, quem reconquista e quem fecha o follow-up — sem folha nova.
            </p>
          </header>
        </div>
        <div className="seats">
          {cadeiras.map((c, i) => (
            <article key={c.n} className={i === 0 ? "seat seat-lead" : "seat"}>
              <span className="seat-n">{c.n}</span>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </article>
          ))}
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
              Você não montou o seu espaço para viver refém de <em>agenda vazia</em>, <em>gente nova</em> e{" "}
              <em>“amanhã eu te respondo”</em>.
            </h2>
            <div className="m-rule eye-reveal"></div>
            <p className="m-small eye-reveal">O NexvyBeauty existe para lotar a agenda — sem contratar</p>
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
      <p>Manutenções que sumiram.</p>
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
   BUG(corrigido): esta seção usava id="como-funciona" (duplicado). Agora é id="modulos".
   O hash #como-funciona ficou na seção das 3 cadeiras (nav "Como Funciona"). */
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
    <section className="equipia" id="equipia">
      <div className="wrap">
        <p className="eq-quote">
          <span className="l1">Elas cuidam da gestão do seu espaço.</span>
          <span className="l2">
            <em>Você, de entregar o melhor resultado.</em>
          </span>
        </p>
        <p className="hero-kicker">Sua EquipIA</p>
        <h2>
          Só quem empreende como você
          <br />
          entende <em>o valor.</em>
        </h2>
        <div className="eq-grid">
          <div>
            <p className="lead">
              A EquipIA que atende, reconquista e confirma — você não contrata gente nova. No seu WhatsApp, com o seu
              tom, o seu nome e as suas regras.
            </p>
            <ul className="eq-points">
              <li>Atendem, agendam e confirmam horários — 24 horas, 7 dias</li>
              <li>Reativam quem sumiu, com mensagem personalizada</li>
              <li>Fazem o follow-up de quem perguntou e não fechou</li>
              <li>Detectam horários fracos e sugerem a promoção certa</li>
              <li>Você aprova tudo. Eles executam. O mérito é seu.</li>
            </ul>
          </div>
          <figure>
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
            <figcaption className="ph-legend">Demonstração do fluxo de reativação — a IA escreve, você aprova.</figcaption>
          </figure>
        </div>
      </div>
    </section>
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

/* ── PLANOS — LP-V2-PLANS-PORT + copy Marcelo (a/b/c). Preços só de public_plans. ── */
/** P5(a)+P1: bloco de preço + CTA de um card. Preço e checkout SÓ do banco.
 *  - carregando/indisponível → CTA vira WhatsApp (nunca um href="#" morto) e o
 *    preço não é inventado;
 *  - list_price_monthly nulo → a âncora "de R$ X" simplesmente não aparece.
 *  - anual sem price_yearly / trimestral sem price_quarterly → some o número
 *    (não fabrica múltiplo) e o CTA cai no WhatsApp. */
function PlanoPreco({
  plan,
  loading,
  cycle,
}: {
  plan?: PublicPlan;
  loading: boolean;
  cycle: BillingCycle;
}) {
  if (loading) return <div className="preco serif"><small>carregando…</small></div>;
  if (!plan) return null;
  if (cycle === "yearly" && !hasYearlyPrice(plan)) {
    return (
      <div className="preco serif">
        <span className="preco-miss">Anual sob consulta</span>
      </div>
    );
  }
  if (cycle === "quarterly" && !hasQuarterlyPrice(plan)) {
    return (
      <div className="preco serif">
        <span className="preco-miss">Trimestral sob consulta</span>
      </div>
    );
  }
  const price = cyclePrice(plan, cycle);
  if (price == null) return null;
  const showList =
    cycle === "monthly" &&
    plan.list_price_monthly != null &&
    plan.list_price_monthly > plan.price_monthly;
  const monthlyEq =
    cycle === "yearly" ? Math.round(price / 12) : cycle === "quarterly" ? Math.round(price / 3) : null;
  const period = cycle === "yearly" ? "/ano" : cycle === "quarterly" ? "/trimestre" : "/mês";
  return (
    <div className="preco serif">
      {showList && (
        <small className="preco-de">
          de {BRL.format(plan.list_price_monthly as number)}
        </small>
      )}
      <span className="preco-val">
        <span className="preco-cur">R$</span>
        {BRL_NUM.format(price)}
      </span>
      <small>{period}</small>
      {monthlyEq != null && monthlyEq > 0 && (
        <span className="preco-eq">equivale a {BRL.format(monthlyEq)}/mês</span>
      )}
    </div>
  );
}

function PlanoCta({
  plan,
  className,
  cycle,
}: {
  plan?: PublicPlan;
  className: string;
  cycle: BillingCycle;
}) {
  // Sem checkout ainda (ou ciclo sem preço no banco) → WhatsApp comercial.
  // O checkout NUNCA é hardcoded. R1: tracking segue no hop LP→Cakto.
  const cycleMissing =
    (cycle === "yearly" && !hasYearlyPrice(plan)) ||
    (cycle === "quarterly" && !hasQuarterlyPrice(plan));
  const checkout = cycleMissing ? null : cycleCheckout(plan, cycle);
  const href = checkout ? withTracking(checkout) : WHATSAPP_URL;
  const price = plan && !cycleMissing ? cyclePrice(plan, cycle) : null;
  const label = checkout
    ? cycle === "yearly"
      ? "Assinar anual"
      : cycle === "quarterly"
        ? "Assinar trimestral"
        : "Assinar agora"
    : "Falar com a gente";
  return (
    <a
      className={className}
      href={href}
      onClick={() =>
        fbqTrack(checkout ? "InitiateCheckout" : "Contact", {
          content_name: `${plan?.slug ?? "sem-plano"}-${cycle}`,
          value: price ?? undefined,
          currency: "BRL",
        })
      }
    >
      {label}
    </a>
  );
}

function CicloSelector({
  cycle,
  onCycle,
  quarterlyEnabled,
  yearlyEnabled,
  loading,
  error,
}: {
  cycle: BillingCycle;
  onCycle: (next: BillingCycle) => void;
  quarterlyEnabled: boolean;
  yearlyEnabled: boolean;
  loading: boolean;
  error: boolean;
}) {
  const options: BillingCycle[] = [
    "monthly",
    ...(quarterlyEnabled ? (["quarterly"] as const) : []),
    ...(yearlyEnabled ? (["yearly"] as const) : []),
  ];
  const pick = (next: BillingCycle) => (e: React.MouseEvent<HTMLButtonElement>) => {
    e.currentTarget.focus({ preventScroll: true });
    if (next === "yearly" && !yearlyEnabled) return;
    if (next === "quarterly" && !quarterlyEnabled) return;
    onCycle(next);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    e.preventDefault();
    const i = options.indexOf(cycle);
    if (i < 0) return;
    const next = e.key === "ArrowLeft"
      ? options[Math.max(0, i - 1)]
      : options[Math.min(options.length - 1, i + 1)];
    onCycle(next);
  };
  return (
    <div
      className="ciclo-sel"
      role="radiogroup"
      aria-label="Periodicidade do plano"
      data-state={loading ? "loading" : error ? "error" : "ready"}
      data-count={quarterlyEnabled ? 3 : 2}
      onKeyDown={onKeyDown}
    >
      <button
        type="button"
        role="radio"
        aria-checked={cycle === "monthly"}
        className="ciclo-opt"
        onClick={pick("monthly")}
      >
        Mensal
      </button>
      {quarterlyEnabled && (
        <button
          type="button"
          role="radio"
          aria-checked={cycle === "quarterly"}
          className="ciclo-opt"
          onClick={pick("quarterly")}
        >
          Trimestral
        </button>
      )}
      <button
        type="button"
        role="radio"
        aria-checked={cycle === "yearly"}
        className="ciclo-opt"
        disabled={!yearlyEnabled}
        aria-disabled={!yearlyEnabled}
        onClick={pick("yearly")}
      >
        Anual
      </button>
    </div>
  );
}

function Planos() {
  // P5(a): catálogo 100% do banco (view public_plans, SELECT anônimo, já filtrada
  // por is_active e ordenada). Fetch falho → cards sem preço, página inteira segue
  // de pé (fallback gracioso, igual à SalesPage).
  const { data: plans, isLoading, isError } = usePublicPlans();
  const [cycle, setCycle] = useState<BillingCycle>("monthly");
  const essencial = findPlan(plans, PLAN_SLUG.essencial);
  const premium = findPlan(plans, PLAN_SLUG.premium);
  const ultra = findPlan(plans, PLAN_SLUG.ultra);
  const quarterlyEnabled = [essencial, premium, ultra].some(hasQuarterlyPrice);
  const yearlyEnabled = [essencial, premium, ultra].some(hasYearlyPrice);

  useEffect(() => {
    if (isLoading) return;
    if (cycle === "yearly" && !yearlyEnabled) setCycle("monthly");
    if (cycle === "quarterly" && !quarterlyEnabled) setCycle("monthly");
  }, [cycle, quarterlyEnabled, yearlyEnabled, isLoading]);

  return (
    <section className="block planos-wrap" id="planos" style={{ paddingTop: "30px", paddingBottom: "40px" }}>
      <div className="wrap">
        <div className="planos-box rv">
          <h2 className="serif">
            Escolha o tamanho do <em>seu momento.</em>
          </h2>
          <div className="serie">
            ✨ <b>Agentes de IA de série</b> em todos os planos — do primeiro ao último.
          </div>
          <CicloSelector
            cycle={cycle}
            onCycle={setCycle}
            quarterlyEnabled={quarterlyEnabled}
            yearlyEnabled={yearlyEnabled || isLoading}
            loading={isLoading}
            error={isError}
          />
          <p className="ciclo-hint">
            {cycle === "yearly"
              ? "Cobrado anualmente · cancele quando quiser"
              : cycle === "quarterly"
                ? "Cobrado a cada 3 meses · cancele quando quiser"
                : "Cobrado todo mês · cancele quando quiser"}
          </p>
          <div className="planos">
            <div className="plano rv">
              <h3>Essencial</h3>
              <PlanoPreco plan={essencial} loading={isLoading} cycle={cycle} />
              <p className="p-desc">Para quem atende sozinho: organiza a casa e liga a IA no atendimento.</p>
              <ul className="p-feats">
                <li>Agentes de IA no WhatsApp (de série)</li>
                <li>Agenda inteligente + link público 24/7</li>
                <li>Carteira de clientes importada do WhatsApp</li>
                <li>Painel do dinheiro recuperado</li>
              </ul>
              <PlanoCta plan={essencial} className="btn btn-quiet" cycle={cycle} />
            </div>
            <div className="plano destaque rv">
              <span className="p-tag">Mais escolhido</span>
              <h3>Premium</h3>
              {/* card "Premium" da LP = slug `pro` no banco (ver PLAN_SLUG). */}
              <PlanoPreco plan={premium} loading={isLoading} cycle={cycle} />
              <p className="p-desc">Para espaços com equipe: tudo do Essencial, em escala.</p>
              <ul className="p-feats">
                <li>Tudo do Essencial</li>
                <li>Vários profissionais na agenda</li>
                <li>Reativação e campanhas em escala</li>
                <li>Pacotes &amp; sessões com aviso de vencimento</li>
                <li>Financeiro &amp; indicadores completos</li>
              </ul>
              <PlanoCta plan={premium} className="btn btn-terra" cycle={cycle} />
            </div>
            <div className="plano rv">
              <h3>Ultra</h3>
              {/* card "Ultra" da LP = slug `premium` no banco (ver PLAN_SLUG). */}
              <PlanoPreco plan={ultra} loading={isLoading} cycle={cycle} />
              <p className="p-desc">Para operações maiores: crescimento ativo e migração assistida.</p>
              <ul className="p-feats">
                <li>Tudo do Premium</li>
                <li>Funis, formulários e quizzes de captação</li>
                <li>Migração assistida da sua base</li>
                <li>Suporte prioritário</li>
              </ul>
              <PlanoCta plan={ultra} className="btn btn-quiet" cycle={cycle} />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── COMPARATIVO DE MERCADO (pós-planos) ─────────────────────────────────────
 *  Regra desta seção, em ordem de precedência:
 *
 *  1. Só entra dado que exista em página PÚBLICA do concorrente, com a data da
 *     consulta e o link ao lado. Nada de "a partir de" reconstruído de memória:
 *     na apuração de 01/08/2026 dois números que circulavam internamente não
 *     resistiram à fonte (um estava R$ 100 acima do praticado; o outro cobrava
 *     uma taxa de setup que a empresa anuncia como GRÁTIS). Ambos ficaram fora.
 *  2. Preço NOSSO não aparece aqui — ele vem de `public_plans` nos cards acima
 *     (mesma regra do PlanoPreco). Hardcode aqui reintroduziria exatamente a
 *     divergência que aquele componente existe para evitar.
 *  3. Comparação honesta > comparação favorável. A soma abaixo dá EMPATE com o
 *     Essencial, e é assim que ela é apresentada. O que vende não é um desconto
 *     que não existe: é a unificação (uma assinatura, não duas) e a
 *     transparência (a nossa tabela inteira está publicada; a deles, não).
 *
 *  Ao atualizar: reconferir CADA linha na fonte e mover BENCH_CONSULTA junto.
 *  Data velha com número novo é pior do que não ter tabela.                    */
const BENCH_CONSULTA = "01/08/2026";

type BenchRow = {
  nome: string;
  tipo: string;
  preco: string;
  /** true = não é um valor, é a ausência dele (renderiza em itálico apagado). */
  vago?: boolean;
  obs: string;
  fonte?: string;
};

const BENCHMARK: readonly BenchRow[] = [
  {
    nome: "Trinks",
    tipo: "Gestão de salão",
    preco: "R$ 76/mês",
    obs: "Só a faixa de 1 a 2 profissionais. De 3 em diante, as quatro faixas seguintes aparecem como “sob consulta”.",
    fonte: "https://negocios.trinks.com/planos/",
  },
  {
    nome: "AppBarber",
    tipo: "Gestão de salão",
    preco: "R$ 79,90 a R$ 219,90/mês",
    obs: "Publica todas as faixas, de 1 profissional a 15 ou mais.",
    fonte: "https://appbarber.com.br/",
  },
  {
    nome: "BotConversa",
    tipo: "IA no WhatsApp",
    preco: "R$ 199/mês",
    obs: "Plano Pro, com API Oficial do WhatsApp e assistente GPT. R$ 189/mês no anual.",
    fonte: "https://botconversa.com.br/",
  },
  {
    nome: "Zenvia",
    tipo: "IA e atendimento",
    preco: "R$ 600/mês",
    obs: "Plano Specialist: 10 usuários e 500 interações inclusas.",
    fonte: "https://www.zenvia.com/precos/",
  },
  {
    nome: "ChatGuru",
    tipo: "IA no WhatsApp",
    preco: "sob orçamento",
    vago: true,
    obs: "Não publica tabela. O site informa “a partir de R$ 347” e setup gratuito.",
    fonte: "https://chatguru.com.br/planos-e-precos/",
  },
];

function Comparativo() {
  return (
    <section className="block" id="comparativo" style={{ paddingTop: "20px", paddingBottom: "40px" }}>
      <div className="wrap">
        <div className="bench-box rv">
          <div className="eyebrow">Transparência</div>
          <h2 className="serif">
            A conta que ninguém <em>faz pra você.</em>
          </h2>
          <p className="lead">
            Todo preço abaixo saiu da página pública da própria empresa, na data indicada. Se algum
            estiver diferente hoje, o link está ali do lado para você conferir.
          </p>

          <div className="bench-conta">
            <div className="soma">
              Para ter gestão de salão <b>e</b> IA no WhatsApp, somando as duas assinaturas mais
              baratas que publicam preço: <b>R$ 76 + R$ 199 = R$ 275/mês.</b>
            </div>
            <p>
              Duas empresas, duas cobranças, dois logins — e uma agenda que não sabe o que a IA
              respondeu. Aqui é uma assinatura só, e a IA já vem dentro. O preço está nos planos
              acima.
            </p>
          </div>

          <table className="bench">
            <thead>
              <tr>
                <th>Plataforma</th>
                <th>Preço publicado</th>
                <th>O que esse preço cobre</th>
              </tr>
            </thead>
            <tbody>
              {BENCHMARK.map((r) => (
                <tr key={r.nome}>
                  <td>
                    <div className="n">{r.nome}</div>
                    <div className="t">{r.tipo}</div>
                  </td>
                  <td>
                    <span className={r.vago ? "p vago" : "p"}>{r.preco}</span>
                  </td>
                  <td>
                    <div className="obs">
                      {r.obs}{" "}
                      {r.fonte && (
                        <a className="src" href={r.fonte} target="_blank" rel="noopener nofollow">
                          ver fonte
                        </a>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              <tr className="bench-nos">
                <td>
                  <div className="n">NexvyBeauty</div>
                  <div className="t">Gestão + IA, no mesmo lugar</div>
                </td>
                <td>
                  <span className="p vago">os três planos, na página</span>
                </td>
                <td>
                  <div className="obs">
                    Agentes de IA de série em todos os planos, do Essencial ao Ultra — sem add-on,
                    sem taxa de instalação e sem “fale com um consultor” para saber quanto custa.
                  </div>
                </td>
              </tr>
            </tbody>
          </table>

          <p className="bench-fonte">
            Preços consultados nas páginas públicas de cada empresa em {BENCH_CONSULTA}. Planos e
            valores mudam sem aviso — confira na fonte antes de decidir. A comparação usa os planos
            que cada empresa publica; onde a empresa não publica preço, isso está dito na tabela em
            vez de estimado.
          </p>
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
      a: "Você conecta seu WhatsApp de um jeito seguro e padrão — a gente NÃO pede sua senha. A IA só propõe as mensagens; nada é enviado sem você aprovar. Não assinou? A gente apaga os dados em 72h.",
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
    <section className="block" id="faq">
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

/* ── FOOTER (V2 burgundy band — markup aligned to /vendas-v2) ── */
function Footer() {
  return (
    <footer>
      <div className="wrap foot">
        <div className="foot-row">
        <div className="foot-brand">
          <a href="#top" className="wordmark wordmark-logo">
            <img src={NAV_LOGO_SRC} alt="NexvyBeauty" width={722} height={163} />
          </a>
          <p className="fsign serif">Feito com ❤️, para quem faz acontecer 🚀💪</p>
        </div>

        <div className="foot-grid">
          <div className="foot-col">
            <h4>Redes</h4>
            <div className="fsocial">
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
            <Link to="/termos">Termos de Uso</Link>
            <Link to="/privacidade">Privacidade (LGPD)</Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
