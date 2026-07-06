#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// eval-visual.mjs — PROVA VISUAL das telas do gestao.* (screenshot + rubric).
//
// Resolve a dor "aterrissou mas não vejo": navega as telas P1 do módulo Vendas
// e salva prints (desktop 1440 + mobile 390) em ./shots/, prontos p/ um LLM/humano
// pontuar pela rubric-visual.md (gate >= 85, GAN visual).
//
// Fluxo de auth (storageState, login manual 1x — NUNCA credencial em texto):
//   1ª vez  → abre o browser com HEAD visível; Marcelo loga em gestao.nexvy.tech;
//             o script detecta a chegada em /super-admin e salva ./.auth.json.
//   próximas → reusa ./.auth.json em headless, sem pedir login de novo.
//
// Segredos: este script NUNCA recebe/loga senha. O login acontece na mão do
// Marcelo, dentro do browser. O .auth.json (cookies/localStorage de sessão) fica
// gitignored. Nada de credencial trafega pelo código.
//
// Navegação: as telas do gestao.* NÃO têm rota/hash na URL — a shell troca de
// tela por estado React (setActiveSection, ver PlatformSidebar.tsx). Por isso o
// script navega CLICANDO no item do menu (texto = label do registry), não por URL.
//
// Uso:
//   node tasks/eval-visual/eval-visual.mjs                  # roda tudo
//   node tasks/eval-visual/eval-visual.mjs --login          # força re-login
//   node tasks/eval-visual/eval-visual.mjs --base=http://localhost:5173
//   node tasks/eval-visual/eval-visual.mjs --only=Pipeline,Leads
//   node tasks/eval-visual/eval-visual.mjs --desktop-only   # pula mobile
// ─────────────────────────────────────────────────────────────────────────────

import { chromium } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync, existsSync, writeFileSync, rmSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const AUTH_PATH = join(__dirname, '.auth.json');
const SHOTS_DIR = join(__dirname, 'shots');
const BRAND_MARKER = join(SHOTS_DIR, '_AVISO-base-nao-gestao.md');

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const opt = (name, def) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.split('=').slice(1).join('=') : def;
};

const BASE_URL = opt('base', 'https://gestao.nexvy.tech').replace(/\/$/, '');
// O tema institucional AZUL (#0A52D1) do gestao.* é aplicado por um <script> inline
// no index.html que só adiciona a classe `theme-nexvy-institucional` quando
// location.hostname começa com 'gestao.'. Contra localhost/IP (ex.: --base=http://
// localhost:5173) essa classe nunca entra e a UI cai no ROSA global (--primary 330,
// src/index.css). Logo, o item "Marca correta = azul" da rubric-visual.md §1 NÃO se
// aplica a prints locais — reprovaria 100% das telas por artefato do harness, não da UI.
const BASE_HOST = (() => { try { return new URL(BASE_URL).hostname; } catch { return ''; } })();
const IS_GESTAO_BASE = BASE_HOST.startsWith('gestao.');
const SHELL_PATH = '/super-admin';
const FORCE_LOGIN = flag('login');
const DESKTOP_ONLY = flag('desktop-only');
const ONLY = (opt('only', '') || '')
  .split(',')
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

// ── viewports ─────────────────────────────────────────────────────────────────
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 }; // iPhone 12/13/14

// ── telas P1 (verbatim do registry.tsx / TEMPLATE-UI-GESTAO §5) ────────────────
// module: sempre 'Vendas' (default do shell é 'erp' — o script troca).
// group: label do CollapsibleGroup pai; null = grupo de topo (sempre visível).
// label: texto EXATO do NavButton (seletor estável — não há data-testid na sidebar).
const SCREENS = [
  { key: 'dashboard', label: 'Dashboard', group: null, family: 'F3' },
  { key: 'pipeline', label: 'Pipeline', group: null, family: 'F2' },
  { key: 'leads', label: 'Leads', group: null, family: 'F5' },
  { key: 'chat', label: 'Chat', group: 'Atendimentos', family: 'F1' },
  { key: 'painel', label: 'Painel', group: 'Atendimentos', family: 'F3' },
  { key: 'radar-ia', label: 'Radar IA', group: 'Atendimentos', family: 'F3' },
  { key: 'follow-up', label: 'Follow-Up', group: 'Atendimentos', family: 'F5' },
];

const targets = ONLY.length
  ? SCREENS.filter((s) => ONLY.includes(s.label.toLowerCase()) || ONLY.includes(s.key))
  : SCREENS;

// ── helpers ────────────────────────────────────────────────────────────────────
const log = (...a) => console.log('  ', ...a);
const ok = (m) => console.log('  \x1b[32m✓\x1b[0m', m);
const warn = (m) => console.log('  \x1b[33m!\x1b[0m', m);
const err = (m) => console.log('  \x1b[31m✗\x1b[0m', m);

mkdirSync(SHOTS_DIR, { recursive: true });

/**
 * Aviso de marca (guard anti-falso-negativo). O gestao.* só fica AZUL quando a base
 * é um host `gestao.*` (o index.html gateia a classe `theme-nexvy-institucional` por
 * hostname). Contra base local a UI renderiza ROSA — então o item "Marca correta" da
 * rubric-visual.md §1 vira falso-negativo (reprovaria toda tela). Como o SCORE é feito
 * depois, por um LLM/humano lendo os prints (não por este script), o console some antes
 * da avaliação: por isso grava-se também um MARCADOR em shots/, que viaja junto da prova.
 * Quando a base É gestao.*, remove marcador obsoleto de algum run local anterior (anti-drift).
 */
function announceBaseTheme() {
  if (IS_GESTAO_BASE) {
    if (existsSync(BRAND_MARKER)) rmSync(BRAND_MARKER);
    return;
  }
  const rule = '\x1b[33m' + '─'.repeat(70) + '\x1b[0m';
  console.log(rule);
  warn(`base "${BASE_URL}" NÃO é host gestao.* → tema institucional AZUL não ativa.`);
  warn('local renderiza ROSA (--primary 330); o checklist "Marca correta" da');
  warn('rubric-visual.md §1 NÃO se aplica (reprovaria 100% das telas por artefato).');
  warn('Para avaliar MARCA/cor, rode contra https://gestao.nexvy.tech.');
  console.log(rule);
  writeFileSync(
    BRAND_MARKER,
    [
      '# ⚠️ Prints capturados contra base NÃO-`gestao.*`',
      '',
      `- **base usada:** \`${BASE_URL}\` (host \`${BASE_HOST || '?'}\`)`,
      '',
      'O tema institucional **azul Nexvy (#0A52D1)** do `gestao.*` é aplicado por um',
      '`<script>` inline no `index.html`, que só adiciona a classe',
      '`theme-nexvy-institucional` quando `location.hostname` começa com `gestao.`.',
      'Rodando contra `localhost`/IP essa classe **nunca entra** e a UI cai no **ROSA',
      'global** (`--primary: 330 81% 60%`, em `src/index.css`).',
      '',
      '## Impacto ao pontuar pela rubric-visual.md',
      '',
      'O item do checklist binário §1 **"Marca correta = azul Nexvy, rosa reprova"** é',
      '**N/A** para estes prints — o rosa aqui é artefato do harness (base local), **não**',
      'defeito da UI. **Não reprove a tela por isso.** Os demais critérios (hierarquia,',
      'densidade, affordance, estados, mobile) seguem válidos.',
      '',
      'Para avaliar marca/cor de verdade, gere os prints contra `https://gestao.nexvy.tech`.',
      '',
    ].join('\n'),
  );
  warn(`aviso p/ o avaliador salvo em: ${BRAND_MARKER.replace(process.cwd() + '/', '')}`);
}

/**
 * Login manual 1x: abre HEAD visível, espera Marcelo chegar em /super-admin,
 * salva storageState. Idempotente: se .auth.json existe e --login não foi pedido,
 * pula direto.
 */
async function ensureAuth() {
  if (existsSync(AUTH_PATH) && !FORCE_LOGIN) {
    ok(`sessão reusada de ${AUTH_PATH.replace(process.cwd() + '/', '')}`);
    return;
  }
  console.log('\n\x1b[36m── LOGIN MANUAL (1x) ──\x1b[0m');
  console.log('   Vou abrir o browser. Faça login em gestao.nexvy.tech normalmente.');
  console.log('   Quando o painel /super-admin carregar, o script salva a sessão sozinho.');
  console.log('   (Nenhuma senha passa pelo script — você digita direto no browser.)\n');

  const browser = await chromium.launch({ headless: false });
  const ctx = await browser.newContext({ viewport: DESKTOP });
  const page = await ctx.newPage();
  await page.goto(`${BASE_URL}${SHELL_PATH}`, { waitUntil: 'domcontentloaded' });

  // Aguarda a chegada ao shell autenticado (até 5 min p/ o login manual).
  log('aguardando login... (até 5 min)');
  await page.waitForURL(
    (url) => url.pathname.startsWith(SHELL_PATH),
    { timeout: 5 * 60 * 1000 },
  );
  // Confirma que o shell montou (sidebar presente) antes de salvar.
  await page
    .getByRole('button', { name: 'Trocar módulo' })
    .waitFor({ state: 'visible', timeout: 30_000 })
    .catch(() => warn('sidebar não confirmada — salvando sessão mesmo assim'));

  await ctx.storageState({ path: AUTH_PATH });
  await browser.close();
  ok('sessão salva. Próximas execuções rodam headless, sem login.');
}

/** Garante módulo Vendas ativo (default do shell é 'erp'). */
async function ensureVendasModule(page) {
  // Se um item exclusivo de Vendas (Pipeline) já está na sidebar, nada a fazer.
  const pipeline = page.getByRole('button', { name: 'Pipeline', exact: true });
  if (await pipeline.count()) return;

  const switcher = page.getByRole('button', { name: 'Trocar módulo' });
  await switcher.click();
  const vendas = page.getByRole('button', { name: 'Vendas', exact: true });
  await vendas.click({ timeout: 10_000 });
  // Popover fecha e sidebar re-renderiza com os itens de Vendas.
  await page
    .getByRole('button', { name: 'Pipeline', exact: true })
    .waitFor({ state: 'visible', timeout: 10_000 });
}

/** Abre o menu no mobile (sidebar vira Sheet abaixo de lg). */
async function openMobileNavIfNeeded(page, isMobile) {
  if (!isMobile) return;
  const menuBtn = page.locator('header button:has(svg)').first();
  if (await menuBtn.isVisible().catch(() => false)) {
    await menuBtn.click();
    // dá tempo do Sheet animar
    await page.waitForTimeout(350);
  }
}

/** Expande o CollapsibleGroup pai (ex.: "Atendimentos") se o item estiver oculto. */
async function expandGroupIfNeeded(page, screen) {
  if (!screen.group) return;
  const item = page.getByRole('button', { name: screen.label, exact: true });
  if (await item.isVisible().catch(() => false)) return;
  const trigger = page.getByRole('button', { name: screen.group, exact: false });
  if (await trigger.count()) {
    await trigger.first().click().catch(() => {});
    await page.waitForTimeout(250);
  }
}

/** Clica no item de menu e espera a tela assentar. */
async function gotoScreen(page, screen, isMobile) {
  await openMobileNavIfNeeded(page, isMobile);
  await ensureVendasModule(page);
  await expandGroupIfNeeded(page, screen);

  const item = page.getByRole('button', { name: screen.label, exact: true }).first();
  await item.waitFor({ state: 'visible', timeout: 10_000 });
  await item.click();

  // No mobile, clicar fecha o Sheet (onNavigate). Espera a rede e o layout.
  await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => {});
  await page.waitForTimeout(700); // colchão p/ dados/skeleton assentarem
}

/** Captura 1 viewport de 1 tela. Retorna status p/ o sumário. */
async function shoot(browser, screen, viewport, isMobile) {
  const suffix = isMobile ? 'mobile' : 'desktop';
  const file = join(SHOTS_DIR, `${screen.key}-${suffix}.png`);
  const ctx = await browser.newContext({
    viewport,
    storageState: AUTH_PATH,
    deviceScaleFactor: isMobile ? 3 : 2, // prints nítidos
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));

  try {
    await page.goto(`${BASE_URL}${SHELL_PATH}`, { waitUntil: 'domcontentloaded' });
    // guardrail: se a sessão expirou, caímos em /login → aborta cedo e explica.
    await page.waitForTimeout(500);
    if (/\/login/.test(page.url())) {
      throw new Error('sessão expirada (caiu em /login) — rode com --login p/ renovar');
    }
    await gotoScreen(page, screen, isMobile);
    await page.screenshot({ path: file, fullPage: false });
    await ctx.close();
    const rel = file.replace(process.cwd() + '/', '');
    if (consoleErrors.length) {
      warn(`${screen.label} [${suffix}] → ${rel}  (${consoleErrors.length} erro(s) console)`);
      return { screen: screen.label, viewport: suffix, file: rel, consoleErrors: consoleErrors.length, status: 'ok-with-console-errors' };
    }
    ok(`${screen.label} [${suffix}] → ${rel}`);
    return { screen: screen.label, viewport: suffix, file: rel, consoleErrors: 0, status: 'ok' };
  } catch (e) {
    err(`${screen.label} [${suffix}] falhou: ${e.message}`);
    // print de diagnóstico p/ inspecionar por que travou
    const failFile = join(SHOTS_DIR, `${screen.key}-${suffix}.FAIL.png`);
    await page.screenshot({ path: failFile, fullPage: false }).catch(() => {});
    await ctx.close();
    return { screen: screen.label, viewport: suffix, file: failFile.replace(process.cwd() + '/', ''), status: 'FAIL', error: e.message };
  }
}

// ── main ────────────────────────────────────────────────────────────────────
(async () => {
  console.log(`\n\x1b[1mNexvyBeauty · eval-visual\x1b[0m  (base: ${BASE_URL})`);
  console.log(`telas: ${targets.map((t) => t.label).join(', ')}\n`);

  announceBaseTheme();

  await ensureAuth();

  const browser = await chromium.launch({ headless: true });
  const results = [];

  for (const screen of targets) {
    results.push(await shoot(browser, screen, DESKTOP, false));
    if (!DESKTOP_ONLY) {
      results.push(await shoot(browser, screen, MOBILE, true));
    }
  }

  await browser.close();

  // ── sumário ──
  console.log('\n\x1b[1m── sumário ──\x1b[0m');
  const failed = results.filter((r) => r.status === 'FAIL');
  const dirty = results.filter((r) => r.status === 'ok-with-console-errors');
  console.log(`   ${results.length} prints · ${failed.length} falha(s) · ${dirty.length} com erro de console`);
  console.log(`   pasta: ${SHOTS_DIR.replace(process.cwd() + '/', '')}/`);
  if (!IS_GESTAO_BASE) {
    warn('base NÃO-gestao.* → prints em ROSA; item "Marca correta" da rubric é N/A (ver shots/_AVISO-base-nao-gestao.md).');
  }
  if (failed.length) {
    console.log('\n   \x1b[31mfalhas:\x1b[0m');
    failed.forEach((f) => console.log(`     - ${f.screen} [${f.viewport}]: ${f.error}`));
  }
  console.log(
    '\n   Próximo passo: peça a um agente para pontuar os prints pela rubric-visual.md',
  );
  console.log('   (ex.: "Leia tasks/eval-visual/shots/*.png e pontue cada tela pela rubric-visual.md")\n');

  process.exit(failed.length ? 1 : 0);
})().catch((e) => {
  console.error('\n\x1b[31merro fatal:\x1b[0m', e.message);
  process.exit(2);
});
