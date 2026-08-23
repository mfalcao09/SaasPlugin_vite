import { chromium } from "playwright";
import { writeFileSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

const outDir = "/tmp/vendas-hero-proof";
mkdirSync(outDir, { recursive: true });

const CANVA = {
  stageW: 1440,
  stageH: 900,
  kicker: { left: 41.962, top: 24.871, width: 23.729 },
  word: { left: 37.198, top: 26.242, width: 61.275 },
  sub: { left: 74.896, top: 40.69, width: 21.146 },
};

const wa =
  "https://wa.me/5511955021205?text=" +
  encodeURIComponent("Oi! Quero ver como ficaria no meu espaço");

const VIEWPORTS = [
  { name: "1440", width: 1440, height: 900 },
  { name: "1512", width: 1512, height: 982 },
];

function lum(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function samplePatch(path, x, y, w, h) {
  const py = spawnSync(
    "python3",
    [
      "-c",
      `from PIL import Image
im=Image.open(${JSON.stringify(path)}).convert("RGB")
x,y,w,h=int(round(${x})),int(round(${y})),int(round(${w})),int(round(${h}))
W,H=im.size
xs=max(0,min(W-1,x)); ys=max(0,min(H-1,y))
xe=max(xs,min(W-1,x+max(w,1)-1)); ye=max(ys,min(H-1,y+max(h,1)-1))
cream=skin=hair=other=0
for yy in range(ys,ye+1):
  for xx in range(xs,xe+1):
    r,g,b=im.getpixel((xx,yy))
    L=0.2126*r+0.7152*g+0.0722*b
    wine = r>35 and g<58 and b<62 and r>g+12
    if L>=165 and g>=0.68*r and b>=100:
      cream+=1
    elif wine:
      other+=1
    elif L<95:
      hair+=1
    elif r>140 and g<r*0.86 and L<195:
      skin+=1
    else:
      other+=1
n=max(1,cream+skin+hair+other)
print(cream,skin,hair,other,n,cream/n, (skin+hair)/n)`,
    ],
    { encoding: "utf8" },
  );
  if (py.status !== 0) throw new Error(py.stderr || py.stdout);
  const [cream, skin, hair, other, n, creamR, coverR] = (py.stdout || "")
    .trim()
    .split(/\s+/)
    .map(Number);
  return { cream, skin, hair, other, n, creamR, coverR };
}

function hideCoverRatio(visPath, hidPath) {
  const py = spawnSync(
    "python3",
    [
      "-c",
      `from PIL import Image
a=Image.open(${JSON.stringify(visPath)}).convert("RGB")
b=Image.open(${JSON.stringify(hidPath)}).convert("RGB")
w,h=a.size
changed=skin_or_hair=0
for y in range(h):
  for x in range(w):
    r1,g1,b1=a.getpixel((x,y)); r2,g2,b2=b.getpixel((x,y))
    d=abs(r1-r2)+abs(g1-g2)+abs(b1-b2)
    if d>48:
      changed+=1
      L=0.2126*r1+0.7152*g1+0.0722*b1
      if L<95 or (r1>135 and g1<r1*0.86 and L<195):
        skin_or_hair+=1
n=w*h
print(changed, skin_or_hair, n, (changed/n if n else 0), (skin_or_hair/n if n else 0))`,
    ],
    { encoding: "utf8" },
  );
  if (py.status !== 0) throw new Error(py.stderr || py.stdout);
  const [changed, covered, n, changedR, coveredR] = (py.stdout || "")
    .trim()
    .split(/\s+/)
    .map(Number);
  return { changed, covered, n, changedR, coveredR };
}

async function measure(page) {
  return page.evaluate(() => {
    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, left: r.left, right: r.right, top: r.top, bottom: r.bottom, w: r.width, h: r.height };
    };
    const nav = document.querySelector("#nav");
    const bar = document.querySelector(".nav-bar");
    const hero = document.querySelector(".hero.hero-live");
    const stage = document.querySelector(".hero-live-stage");
    const cream = document.querySelector(".hero-live-bar");
    const ctaNav = document.querySelector("a.nav-cta-wide");
    const ctaHero = document.querySelector("a.hero-live-cta");
    const login = document.querySelector("a.nav-login");
    const logo = document.querySelector(".wordmark-logo img");
    const woman = document.querySelector(".hero-live-woman");
    const agenda = document.querySelector(".hero-live-card-agenda");
    const inbox = document.querySelector(".hero-live-card-inbox");
    const semana = document.querySelector(".hero-live-card-semana");
    const t247 = document.querySelector(".hero-live-247");
    const h1 = document.querySelector("h1.hero-live-copy");
    const kicker = document.querySelector(".hero-live-kicker");
    const word = document.querySelector(".hero-live-word");
    const sub = document.querySelector(".hero-live-sub");
    const headlineImg = h1?.querySelector("img.hero-headline, img.hero-live-headline");
    const cs = (el) => (el ? getComputedStyle(el) : null);
    const sr = stage.getBoundingClientRect();
    const pct = (px, base) => (base ? (px / base) * 100 : null);
    const letters = [];
    if (word) {
      const node = [...word.childNodes].find((n) => n.nodeType === Node.TEXT_NODE && n.textContent);
      const text = node?.textContent ?? "";
      for (let i = 0; i < text.length; i++) {
        const range = document.createRange();
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const r = range.getBoundingClientRect();
        letters.push({
          ch: text[i],
          x: r.x + r.width / 2,
          y: r.y + r.height * 0.42,
          left: r.left,
          right: r.right,
          top: r.top,
          w: r.width,
          h: r.height,
        });
      }
    }
    return {
      httpPath: location.pathname,
      innerWidth: window.innerWidth,
      navClass: nav?.className ?? "",
      onHero: nav?.classList.contains("is-on-hero") ?? false,
      logoSrc: logo?.getAttribute("src") ?? "",
      logoVisible: !!(logo && logo.getBoundingClientRect().width > 8),
      loginText: login?.textContent?.trim() ?? "",
      loginVisible: !!(login && login.getBoundingClientRect().width > 8 && getComputedStyle(login).visibility !== "hidden"),
      navCtaDisplay: ctaNav ? getComputedStyle(ctaNav).display : "missing",
      heroCtaText: ctaHero?.textContent?.trim() ?? "",
      heroCtaHref: ctaHero?.getAttribute("href") ?? "",
      heroCtaVisible: !!(ctaHero && ctaHero.getBoundingClientRect().width > 8),
      heroY: hero?.getBoundingClientRect().y ?? null,
      stage: { x: sr.x, y: sr.y, w: sr.width, h: sr.height },
      woman: {
        src: woman?.getAttribute("src") ?? "",
        box: box(woman),
        widthPct: pct(woman?.offsetWidth, stage.clientWidth),
        leftPct: pct(woman.getBoundingClientRect().left - sr.left, sr.width),
        rightPct: pct(woman.getBoundingClientRect().right - sr.left, sr.width),
        midPct: pct(
          (woman.getBoundingClientRect().left + woman.getBoundingClientRect().right) / 2 - sr.left,
          sr.width,
        ),
        z: cs(woman)?.zIndex ?? "",
        objectPosition: cs(woman)?.objectPosition ?? "",
      },
      agenda: agenda
        ? {
            src: agenda.getAttribute("src") ?? "",
            box: box(agenda),
            widthPct: pct(agenda.offsetWidth, stage.clientWidth),
            leftPct: pct(agenda.getBoundingClientRect().left - sr.left, sr.width),
            rightPct: pct(agenda.getBoundingClientRect().right - sr.left, sr.width),
          }
        : { src: "", box: null },
      inbox: {
        src: inbox?.getAttribute("src") ?? "",
        box: box(inbox),
        widthPct: pct(inbox?.offsetWidth, stage.clientWidth),
        leftPct: pct(inbox.getBoundingClientRect().left - sr.left, sr.width),
        rightPct: pct(inbox.getBoundingClientRect().right - sr.left, sr.width),
      },
      semana: {
        src: semana?.getAttribute("src") ?? "",
        box: box(semana),
        widthPct: pct(semana?.offsetWidth, stage.clientWidth),
        leftPct: pct(semana.getBoundingClientRect().left - sr.left, sr.width),
        rightPct: pct(semana.getBoundingClientRect().right - sr.left, sr.width),
      },
      t247: t247?.textContent ?? "",
      t247Font: cs(t247)?.fontFamily ?? "",
      h1Text: h1?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      headlineImgInH1: !!(headlineImg && headlineImg.getAttribute("src")),
      letters,
      kicker: {
        text: kicker?.textContent?.trim() ?? "",
        font: cs(kicker)?.fontFamily ?? "",
        leftPct: pct(kicker.getBoundingClientRect().left - sr.left, sr.width),
        box: box(kicker),
      },
      word: {
        text: word?.textContent?.trim() ?? "",
        font: cs(word)?.fontFamily ?? "",
        weight: cs(word)?.fontWeight ?? "",
        color: cs(word)?.color ?? "",
        align: cs(word)?.textAlign ?? "",
        leftPct: pct(word.getBoundingClientRect().left - sr.left, sr.width),
        widthPct: pct(word.getBoundingClientRect().width, sr.width),
        box: box(word),
      },
      sub: {
        text: sub?.textContent?.trim() ?? "",
        font: cs(sub)?.fontFamily ?? "",
        align: cs(sub)?.textAlign ?? "",
        leftPct: pct(sub.getBoundingClientRect().left - sr.left, sr.width),
        widthPct: pct(sub.getBoundingClientRect().width, sr.width),
        box: box(sub),
      },
      bar: cream
        ? {
            x: cream.getBoundingClientRect().x,
            w: cream.getBoundingClientRect().width,
            leftGap: cream.getBoundingClientRect().x,
            rightGap: window.innerWidth - cream.getBoundingClientRect().right,
          }
        : null,
    };
  });
}

async function proveViewport(browser, vp, httpOk) {
  const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
  const resp = await page.goto("http://localhost:8080/vendas", {
    waitUntil: "networkidle",
    timeout: 30000,
  });
  await page.waitForSelector(".hero-live-bar");
  await page.waitForSelector("h1.hero-live-copy .hero-live-word");
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);

  const atHero = await measure(page);
  const foldPath = `${outDir}/fold-hero-${vp.name}.png`;
  await page.screenshot({ path: foldPath, clip: { x: 0, y: 0, width: vp.width, height: vp.height } });

  const letterHits = atHero.letters.map((L) => {
    const patch = samplePatch(
      foldPath,
      L.left + L.w * 0.12,
      L.top + L.h * 0.12,
      Math.max(6, L.w * 0.76),
      Math.max(8, L.h * 0.76),
    );
    return {
      ch: L.ch,
      x: L.x,
      y: L.y,
      creamR: patch.creamR,
      coverR: patch.coverR,
      ok: patch.creamR >= 0.1 && patch.coverR <= 0.22,
      patch,
    };
  });

  const womanBox = atHero.woman.box;
  const agendaFace = {
    x: atHero.agenda.box.x + atHero.agenda.box.w * 0.06,
    y: atHero.agenda.box.y + atHero.agenda.box.h * 0.08,
    w: atHero.agenda.box.w * 0.42,
    h: atHero.agenda.box.h * 0.2,
  };
  const inboxFace = {
    x: atHero.inbox.box.x + atHero.inbox.box.w * 0.06,
    y: atHero.inbox.box.y + atHero.inbox.box.h * 0.08,
    w: atHero.inbox.box.w * 0.42,
    h: atHero.inbox.box.h * 0.2,
  };
  const weekFace = {
    x: atHero.semana.box.x + atHero.semana.box.w * 0.03,
    y: atHero.semana.box.y + atHero.semana.box.h * 0.06,
    w: atHero.semana.box.w * 0.22,
    h: atHero.semana.box.h * 0.28,
  };

  const clip = (r) => ({
    x: Math.max(0, r.x),
    y: Math.max(0, r.y),
    width: Math.max(4, r.w),
    height: Math.max(4, r.h),
  });

  const agendaVis = `${outDir}/agenda-vis-${vp.name}.png`;
  const agendaHid = `${outDir}/agenda-hid-${vp.name}.png`;
  const inboxVis = `${outDir}/inbox-vis-${vp.name}.png`;
  const inboxHid = `${outDir}/inbox-hid-${vp.name}.png`;
  const weekVis = `${outDir}/week-vis-${vp.name}.png`;

  await page.screenshot({ path: agendaVis, clip: clip(agendaFace) });
  await page.screenshot({ path: inboxVis, clip: clip(inboxFace) });
  await page.screenshot({ path: weekVis, clip: clip(weekFace) });
  await page.evaluate(() => {
    const w = document.querySelector(".hero-live-woman");
    if (w) w.style.visibility = "hidden";
  });
  await page.screenshot({ path: agendaHid, clip: clip(agendaFace) });
  await page.screenshot({ path: inboxHid, clip: clip(inboxFace) });
  await page.evaluate(() => {
    const w = document.querySelector(".hero-live-woman");
    if (w) w.style.visibility = "";
  });

  const agendaCover = hideCoverRatio(agendaVis, agendaHid);
  const inboxCover = hideCoverRatio(inboxVis, inboxHid);
  const agendaTitle = samplePatch(foldPath, agendaFace.x, agendaFace.y, agendaFace.w, agendaFace.h);
  const weekTitle = samplePatch(foldPath, weekFace.x, weekFace.y, weekFace.w, weekFace.h);

  const stageMid = atHero.stage.x + atHero.stage.w / 2;
  const womanMidX = womanBox.left + womanBox.w / 2;
  const tuckLimit = womanBox.left + 0.15 * atHero.stage.w;
  const wordLeft = atHero.word.box.left;

  const near = (a, b, tol = 1.2) => Math.abs((a ?? 999) - b) <= tol;

  const checks = {
    A_atendenteCreamNotSkin:
      atHero.word.text === "ATENDENTE" &&
      letterHits.length === 9 &&
      letterHits.every((h) => h.ok),
    B_leftCardsClearOfBody:
      atHero.agenda.box.right < tuckLimit &&
      atHero.inbox.box.right < tuckLimit &&
      agendaCover.coveredR < 0.5 &&
      inboxCover.coveredR < 0.5 &&
      agendaTitle.cream >= 60,
    C_weekClearOfBody:
      atHero.semana.box.left >= womanBox.right - 8 &&
      weekTitle.cream >= 60,
    D_womanLeftOfCenter:
      womanMidX < stageMid - 8 &&
      womanBox.right < stageMid &&
      womanBox.right <= wordLeft + 2,
    E_curl200: (resp?.status() === 200 || httpOk) && atHero.httpPath === "/vendas",
    lockedCta: atHero.heroCtaVisible && atHero.heroCtaHref === wa && /Veja como ficaria no seu espaço/.test(atHero.heroCtaText),
    liveType:
      atHero.headlineImgInH1 === false &&
      atHero.kicker.text === "NÃO CONTRATE" &&
      atHero.sub.text === "para o seu espaço" &&
      /Montserrat/i.test(atHero.kicker.font) &&
      /Montserrat/i.test(atHero.word.font) &&
      /Poppins/i.test(atHero.t247Font),
    canvaLockup:
      near(atHero.kicker.leftPct, CANVA.kicker.left, 1.6) &&
      near(atHero.word.leftPct, CANVA.word.left, 1.6) &&
      near(atHero.sub.leftPct, CANVA.sub.left, 1.6) &&
      (atHero.sub.align === "right" || atHero.sub.align === "end"),
    officialAssets:
      /hero-woman\.png$/.test(atHero.woman.src) &&
      /NB-card-hora\.png$/.test(atHero.agenda.src) &&
      /NB-card-ana\.png$/.test(atHero.inbox.src) &&
      /NB-card-juliana\.png$/.test(atHero.semana.src),
    creamBarFull: !!atHero.bar && atHero.bar.leftGap <= 1 && Math.abs(atHero.bar.rightGap) <= 2,
    overlayNav: atHero.onHero === true && atHero.logoVisible && /logo-v1-light\.png$/.test(atHero.logoSrc),
  };

  await page.close();
  return {
    vp: vp.name,
    checks,
    letterHits,
    agendaCover,
    inboxCover,
    agendaTitle,
    weekTitle,
    tuckLimit,
    womanMidX,
    stageMid,
    wordLeft,
    atHero,
    foldPath,
  };
}

const curl = spawnSync("curl", ["-s", "-o", "/dev/null", "-w", "%{http_code}", "http://localhost:8080/vendas"], {
  encoding: "utf8",
});
const httpOk = (curl.stdout || "").trim() === "200";

const browser = await chromium.launch({ channel: "chrome", headless: true });
const results = [];
for (const vp of VIEWPORTS) {
  results.push(await proveViewport(browser, vp, httpOk));
}
await browser.close();

const allPass = results.every((r) => Object.values(r.checks).every(Boolean));
const payload = {
  curlOk: httpOk,
  allPass,
  results: results.map((r) => ({
    vp: r.vp,
    checks: r.checks,
    letterHits: r.letterHits,
    inboxCover: r.inboxCover,
    weekTitle: r.weekTitle,
    tuckLimit: r.tuckLimit,
    woman: {
      leftPct: r.atHero.woman.leftPct,
      rightPct: r.atHero.woman.rightPct,
      midPct: r.atHero.woman.midPct,
      widthPct: r.atHero.woman.widthPct,
      objectPosition: r.atHero.woman.objectPosition,
    },
    agenda: { leftPct: r.atHero.agenda.leftPct, rightPct: r.atHero.agenda.rightPct, widthPct: r.atHero.agenda.widthPct },
    inbox: { leftPct: r.atHero.inbox.leftPct, rightPct: r.atHero.inbox.rightPct, widthPct: r.atHero.inbox.widthPct },
    semana: { leftPct: r.atHero.semana.leftPct, rightPct: r.atHero.semana.rightPct, widthPct: r.atHero.semana.widthPct },
    word: { leftPct: r.atHero.word.leftPct, text: r.atHero.word.text },
    foldPath: r.foldPath,
  })),
};
writeFileSync(`${outDir}/results.json`, JSON.stringify(payload, null, 2));
console.log(JSON.stringify(payload, null, 2));
process.exit(allPass ? 0 : 1);
