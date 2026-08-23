import { chromium } from "playwright";

const URL = "http://localhost:8080/vendas";
const FAIL = [];

function check(name, ok, detail) {
  const line = `${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`;
  console.log(line);
  if (!ok) FAIL.push(name);
}

const curl = await fetch(URL);
check("curl 200", curl.status === 200, `status=${curl.status}`);

const browser = await chromium.launch({ headless: true, channel: "chrome" });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto(URL, { waitUntil: "networkidle", timeout: 60000 });
await page.locator("#faq").scrollIntoViewIfNeeded();
await page.locator("#faq .faq-eyebrow").waitFor({ state: "visible", timeout: 8000 });
await page.waitForTimeout(400);

const report = await page.evaluate(() => {
  const faq = document.querySelector("#faq");
  const title = faq?.querySelector(".faq-eyebrow");
  const kicker = faq?.querySelector(".hero-kicker");
  const details = Array.from(faq?.querySelectorAll(".faq details") ?? []);
  const first = details[0];
  const summary = first?.querySelector("summary");

  const titleCs = title ? getComputedStyle(title) : null;
  const before = title ? getComputedStyle(title, "::before") : null;
  const after = title ? getComputedStyle(title, "::after") : null;
  const plus = summary ? getComputedStyle(summary, "::after") : null;

  const cards = details.map((d) => {
    const cs = getComputedStyle(d);
    return {
      bg: cs.backgroundColor,
      radius: parseFloat(cs.borderRadius) || 0,
      borderTop: cs.borderTopWidth,
      borderRight: cs.borderRightWidth,
      borderBottom: cs.borderBottomWidth,
      borderLeft: cs.borderLeftWidth,
    };
  });

  return {
    hasHeroKicker: !!kicker,
    titleTag: title?.tagName ?? null,
    titleText: (title?.textContent ?? "").trim(),
    titleDisplay: titleCs?.display ?? null,
    titleJustify: titleCs?.justifyContent ?? null,
    titleAlign: titleCs?.textAlign ?? null,
    titleTransform: titleCs?.textTransform ?? null,
    beforeW: before ? parseFloat(before.width) || 0 : 0,
    beforeH: before ? parseFloat(before.height) || 0 : 0,
    beforeContent: before?.content ?? "",
    afterW: after ? parseFloat(after.width) || 0 : 0,
    afterH: after ? parseFloat(after.height) || 0 : 0,
    afterContent: after?.content ?? "",
    plusContent: plus?.content ?? "",
    plusColor: plus?.color ?? "",
    cardCount: details.length,
    cards,
    firstOpenBefore: first?.hasAttribute("open") ?? false,
    firstAnswer: first?.querySelector(".a")?.textContent?.trim() ?? "",
  };
});

check(
  "centered title both-side lines",
  !report.hasHeroKicker &&
    report.titleTag === "SPAN" &&
    /perguntas frequentes/i.test(report.titleText) &&
    report.titleDisplay === "flex" &&
    report.titleJustify === "center" &&
    report.titleTransform === "uppercase" &&
    report.beforeW >= 30 &&
    report.afterW >= 30 &&
    report.beforeH >= 1 &&
    report.afterH >= 1 &&
    report.beforeContent !== "none" &&
    report.afterContent !== "none",
  JSON.stringify({
    kicker: report.hasHeroKicker,
    tag: report.titleTag,
    text: report.titleText,
    display: report.titleDisplay,
    justify: report.titleJustify,
    transform: report.titleTransform,
    before: [report.beforeW, report.beforeH, report.beforeContent],
    after: [report.afterW, report.afterH, report.afterContent],
  }),
);

const whiteCards = report.cards.filter((c) => {
  const m = c.bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  const rgb = m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  const isWhite = rgb[0] >= 250 && rgb[1] >= 250 && rgb[2] >= 250;
  const sides = [c.borderTop, c.borderRight, c.borderBottom, c.borderLeft].every(
    (w) => parseFloat(w) >= 1,
  );
  return isWhite && c.radius >= 14 && sides;
});
check(
  "white rounded cards",
  report.cardCount === 9 && whiteCards.length === 9,
  JSON.stringify({ count: report.cardCount, ok: whiteCards.length, sample: report.cards[0] }),
);

const plusRgb = (report.plusColor.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/) || []).slice(1).map(Number);
const plusPink =
  report.plusContent.includes("+") &&
  plusRgb.length === 3 &&
  plusRgb[0] > plusRgb[1] + 20 &&
  plusRgb[0] > plusRgb[2];
check(
  "pink + icons",
  plusPink,
  JSON.stringify({ content: report.plusContent, color: report.plusColor }),
);

await page.locator("#faq .faq details").first().locator("summary").click();
await page.waitForTimeout(200);
const opened = await page.evaluate(() => {
  const first = document.querySelector("#faq .faq details");
  const a = first?.querySelector(".a");
  const cs = a ? getComputedStyle(a) : null;
  return {
    open: first?.hasAttribute("open") ?? false,
    answerVisible: !!a && cs?.display !== "none" && (a.textContent ?? "").trim().length > 10,
    answer: (a?.textContent ?? "").trim().slice(0, 80),
  };
});
check(
  "accordion click opens answer",
  opened.open && opened.answerVisible,
  JSON.stringify(opened),
);

await browser.close();

if (FAIL.length) {
  console.error(`\nFAILED: ${FAIL.join(", ")}`);
  process.exit(1);
}
console.log("\nALL 5 CHECKS PASSED");
