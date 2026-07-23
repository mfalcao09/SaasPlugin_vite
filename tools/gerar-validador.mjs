#!/usr/bin/env node
// ============================================================================
// Gerador do validador de gabarito — apoio ao card C1.1b (PRD v2.1 §9)
//
//   node tools/gerar-validador.mjs   →   tools/validar-gabarito.html
//
// Produz UM arquivo HTML self-contained, com os gabaritos embutidos, para
// Marcelo + AGDM validarem os atos sem editar JSON à mão.
//
// Por que HTML gerado, e não um app: a validação é ato pontual, precisa rodar
// offline, sem servidor, sem build e sem depender do estado do repo. O produto
// do trabalho é o JSON exportado — o HTML é descartável.
//
// A ferramenta NÃO decide nada: apresenta o que a heurística propôs e registra
// o julgamento humano. Quem valida é quem assina.
// ============================================================================

import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = join(AQUI, '..');
const FIXTURES = join(RAIZ, 'fixtures/edicoes');
const SAIDA = join(AQUI, 'validar-gabarito.html');

const log = (...a) => console.error(...a);

async function main() {
  const arquivos = (await readdir(FIXTURES)).filter((f) => f.endsWith('.expected.json')).sort();
  if (arquivos.length === 0) throw new Error('nenhum .expected.json — rode antes: npm run gabarito');

  const gabaritos = [];
  for (const nome of arquivos) {
    gabaritos.push(JSON.parse(await readFile(join(FIXTURES, nome), 'utf8')));
  }
  const totalAtos = gabaritos.reduce((s, g) => s + g.atos.length, 0);
  const totalRel = gabaritos.reduce((s, g) => s + (g.relacoes_sugeridas?.length ?? 0), 0);
  const baixa = gabaritos.reduce(
    (s, g) => s + g.atos.filter((a) => a.confianca_heuristica === 'baixa').length, 0);

  log(`[validador] ${gabaritos.length} edições · ${totalAtos} atos · ${totalRel} relações`);
  log(`[validador] ${baixa} ato(s) com confiança BAIXA — priorizar na validação`);

  await mkdir(AQUI, { recursive: true });
  await writeFile(SAIDA, montarHtml(gabaritos));
  log('[validador] gerado: tools/validar-gabarito.html');
  log('[validador] abra no navegador; ao terminar, use "Baixar validados".');
}

function montarHtml(gabaritos) {
  // Escapa "<" para não encerrar o </script> que embute os dados.
  const dados = JSON.stringify(gabaritos).replace(/</g, '\\u003c');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Validação do gabarito — DiárioMonitor</title>
<style>
  /* Tema Nexvy Lux institucional (navy #213156 + ouro #9f702f) — §7.1.1 */
  :root{
    --bg:#f7f9fc; --surface:#fff; --line:#e2e8f0; --line-2:#cbd5e1;
    --fg:#0f172a; --fg-dim:#475569; --fg-mute:#94a3b8;
    --primary:#213156; --gold:#9f702f;
    --ok:#15803d; --ok-bg:#f0fdf4; --bad:#b91c1c; --bad-bg:#fef2f2;
    --warn:#a16207; --warn-bg:#fefce8;
    --mono:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
  }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);
    font:15px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Inter,sans-serif}
  header{position:sticky;top:0;z-index:10;background:var(--primary);color:#fff;
    padding:14px 22px;display:flex;align-items:center;gap:18px;flex-wrap:wrap;
    box-shadow:0 1px 3px rgba(15,23,42,.2)}
  header h1{font-size:16px;margin:0;font-weight:650;letter-spacing:-.01em}
  .prog{font:600 13px/1 var(--mono);background:rgba(255,255,255,.14);padding:7px 12px;border-radius:8px}
  .prog b{color:#dba341}
  header .sp{flex:1}
  button{font:inherit;border:0;border-radius:8px;padding:8px 14px;cursor:pointer;
    font-weight:600;font-size:13.5px;transition:.12s}
  .b-gho{background:rgba(255,255,255,.14);color:#fff} .b-gho:hover{background:rgba(255,255,255,.24)}
  .wrap{max-width:1080px;margin:0 auto;padding:22px}
  .aviso{background:var(--warn-bg);border:1px solid #fde68a;border-left:4px solid var(--warn);
    border-radius:10px;padding:14px 18px;margin-bottom:22px;font-size:14px;color:#713f12}
  .ed{background:var(--surface);border:1px solid var(--line);border-radius:12px;
    margin-bottom:16px;overflow:hidden}
  .ed-h{padding:13px 18px;background:#f1f5f9;border-bottom:1px solid var(--line);
    display:flex;align-items:center;gap:14px;cursor:pointer;user-select:none}
  .ed-h:hover{background:#e8eef6}
  .sig{font:700 11px/1 var(--mono);padding:4px 8px;border-radius:5px;background:var(--primary);
    color:#fff;letter-spacing:.04em}
  .sig.DOMS{background:var(--gold)}
  .ed-t{font-weight:650;font-size:14.5px}
  .ed-m{color:var(--fg-mute);font-size:12.5px;font-family:var(--mono)}
  .chev{margin-left:auto;color:var(--fg-mute);font-size:18px;transition:.15s}
  .ed.open .chev{transform:rotate(90deg)}
  .ed-b{display:none;padding:6px 0} .ed.open .ed-b{display:block}
  .ato{display:grid;grid-template-columns:34px 1fr auto;gap:12px;padding:12px 18px;
    border-bottom:1px solid #f1f5f9;align-items:start}
  .ato:last-child{border-bottom:0}
  .ato.ok{background:var(--ok-bg)} .ato.bad{background:var(--bad-bg);opacity:.62}
  .idx{font:600 12px/1.7 var(--mono);color:var(--fg-mute)}
  .cab{font-weight:650;font-size:14px;margin-bottom:3px}
  .cab .num{color:var(--primary)}
  .ementa{font-size:13.5px;color:var(--fg-dim);margin-bottom:5px}
  .ementa.vazia{color:#b91c1c;font-style:italic}
  .meta{font:11.5px/1.5 var(--mono);color:var(--fg-mute)}
  .fonte-txt{margin:8px 0 4px;padding:10px 13px;background:#fffdf5;border:1px solid #f0e6cc;
    border-left:3px solid var(--gold);border-radius:0 8px 8px 0;font:13px/1.65 Georgia,'Times New Roman',serif;
    color:#3f3f46;max-height:150px;overflow-y:auto}
  .fonte-lbl{font:700 9.5px/1 var(--mono);letter-spacing:.1em;text-transform:uppercase;
    color:var(--gold);margin-bottom:5px;display:block}
  .tag{display:inline-block;padding:1px 7px;border-radius:4px;font:600 10.5px/1.6 var(--mono);margin-right:5px}
  .t-baixa{background:#fee2e2;color:#991b1b} .t-media{background:#fef3c7;color:#92400e}
  .acoes{display:flex;gap:6px}
  .ac{width:32px;height:32px;border-radius:7px;border:1px solid var(--line-2);background:#fff;
    font-size:14px;line-height:1;padding:0}
  .ac:hover{border-color:var(--primary)}
  .ac.on-ok{background:var(--ok);border-color:var(--ok);color:#fff}
  .ac.on-bad{background:var(--bad);border-color:var(--bad);color:#fff}
  .campos{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:8px}
  .campos label{font:600 10.5px/1.6 var(--mono);color:var(--fg-mute);text-transform:uppercase}
  .campos input{width:100%;padding:6px 9px;border:1px solid var(--line-2);border-radius:6px;font:13px var(--mono)}
  .campos input:focus{outline:2px solid var(--primary);outline-offset:-1px}
  .rel{padding:11px 18px;background:#f8fafc;border-top:1px solid var(--line);font-size:13px}
  .rel b{color:var(--primary)}
  .rel-i{font:12px/1.7 var(--mono);color:var(--fg-dim)}
  .vazio{padding:20px 18px;color:var(--fg-mute);font-style:italic;font-size:13.5px}
  footer{position:sticky;bottom:0;background:var(--surface);border-top:1px solid var(--line);
    padding:12px 22px;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
  footer input{padding:8px 11px;border:1px solid var(--line-2);border-radius:7px;font:inherit;font-size:13.5px}
  .b-ok{background:var(--primary);color:#fff}
  .hint{color:var(--fg-mute);font-size:12.5px}
</style>
</head>
<body>
<header>
  <h1>Validação do gabarito · DiárioMonitor</h1>
  <span class="prog">Julgados <b id="pj">0</b> / <span id="pt">0</span></span>
  <span class="sp"></span>
  <button class="b-gho" onclick="marcarTodos()">Aceitar todos das abas abertas</button>
  <button class="b-gho" onclick="abrirTudo()">Expandir tudo</button>
</header>

<div class="wrap">
  <div class="aviso">
    <b>O que você está fazendo aqui.</b> A máquina leu os PDFs do diário e propôs esta lista
    de atos. Ela erra. Seu julgamento é o que vira <i>gabarito</i> — a régua contra a qual a IA
    será medida depois. Sem isso, a IA seria avaliada por ela mesma.<br><br>
    <b>Como julgar cada ato:</b> leia o bloco bege (<i>texto no diário oficial</i>) e compare com
    o cabeçalho acima dele. Bate o tipo, o número e o ano? Clique <b>✓</b>. É um falso positivo —
    algo que não é ato, ou está duplicado? Clique <b>✗</b>. Se um campo estiver errado, corrija no
    formulário: o que você digitar é o que vale.<br><br>
    <b>Se notar um ato do diário que NÃO está na lista</b>, me avise a edição — falso negativo é
    mais grave, porque nenhum teste detecta ausência.
  </div>
  <div id="lista"></div>
</div>

<footer>
  <label class="hint">Validado por:</label>
  <input id="quem" placeholder="seu nome" style="width:200px">
  <button class="b-ok" onclick="exportar()">Baixar validados</button>
  <span class="hint" id="rodape"></span>
</footer>

<script>
const GABARITOS = ${dados};
const estado = {};   // "arquivo#indice" -> 'ok' | 'bad'
const chave = (a, i) => a + '#' + i;
const esc = (t) => String(t ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

function render() {
  document.getElementById('lista').innerHTML = GABARITOS.map((g, gi) => {
    const atos = g.atos.map((a, i) => {
      const st = estado[chave(g.arquivo, i)] || '';
      const conf = a.confianca_heuristica || 'media';
      return \`
      <div class="ato \${st}" id="a-\${gi}-\${i}">
        <div class="idx">\${String(i + 1).padStart(2, '0')}</div>
        <div>
          <div class="cab">\${a.tipo_completo || a.tipo} <span class="num">n. \${a.numero}/\${a.ano}</span></div>
          \${a.trecho_original ? \`<div class="fonte-txt"><span class="fonte-lbl">texto no diário oficial</span>\${esc(a.trecho_original)}</div>\` : ''}
          <div class="ementa \${a.ementa ? '' : 'vazia'}">\${a.ementa ? '<b>Ementa extraída:</b> ' + esc(a.ementa) : 'ementa não isolada — confira no texto acima'}</div>
          <div class="meta"><span class="tag t-\${conf}">\${conf}</span>
            data do ato: \${a.data_ato || '—'} · órgão: \${a.orgao_emissor || '—'}</div>
          <div class="campos">
            <div><label>tipo</label><input value="\${(a.tipo_completo || a.tipo || '').replace(/"/g, '&quot;')}" onchange="edit(\${gi},\${i},'tipo',this.value)"></div>
            <div><label>número</label><input value="\${a.numero || ''}" onchange="edit(\${gi},\${i},'numero',this.value)"></div>
            <div><label>ano</label><input value="\${a.ano || ''}" onchange="edit(\${gi},\${i},'ano',this.value)"></div>
            <div><label>data do ato</label><input value="\${a.data_ato || ''}" placeholder="AAAA-MM-DD" onchange="edit(\${gi},\${i},'data_ato',this.value)"></div>
          </div>
        </div>
        <div class="acoes">
          <button class="ac \${st === 'ok' ? 'on-ok' : ''}" title="Correto" onclick="julgar(\${gi},\${i},'ok')">✓</button>
          <button class="ac \${st === 'bad' ? 'on-bad' : ''}" title="Falso positivo" onclick="julgar(\${gi},\${i},'bad')">✗</button>
        </div>
      </div>\`;
    }).join('') || '<div class="vazio">Nenhum ato detectado nesta edição. Se você souber que há atos aqui, é falso negativo — me avise.</div>';

    const rel = (g.relacoes_sugeridas || []).length
      ? \`<div class="rel"><b>\${g.relacoes_sugeridas.length} relação(ões) sugerida(s)</b> — matéria-prima do MAN-01, validadas depois:<br>
         \${g.relacoes_sugeridas.slice(0, 6).map(r => \`<span class="rel-i">\${r.tipo} → \${r.destino.tipo} \${r.destino.numero}/\${r.destino.ano}</span>\`).join(' · ')}\${g.relacoes_sugeridas.length > 6 ? ' <span class="rel-i">… +' + (g.relacoes_sugeridas.length - 6) + '</span>' : ''}</div>\`
      : '';

    return \`
    <div class="ed" id="ed-\${gi}">
      <div class="ed-h" onclick="toggle(\${gi})">
        <span class="sig \${g.fonte}">\${g.fonte}</span>
        <span class="ed-t">Edição \${g.edicao}</span>
        <span class="ed-m">\${g.data_publicacao} · \${g.atos.length} ato(s)</span>
        <span class="chev">›</span>
      </div>
      <div class="ed-b">\${atos}\${rel}</div>
    </div>\`;
  }).join('');
  atualizar();
}

const toggle = (gi) => document.getElementById('ed-' + gi).classList.toggle('open');
const abrirTudo = () => document.querySelectorAll('.ed').forEach(e => e.classList.add('open'));

function julgar(gi, i, v) {
  const k = chave(GABARITOS[gi].arquivo, i);
  estado[k] = estado[k] === v ? undefined : v;
  const el = document.getElementById('a-' + gi + '-' + i);
  el.className = 'ato ' + (estado[k] || '');
  const b = el.querySelectorAll('.ac');
  b[0].className = 'ac' + (estado[k] === 'ok' ? ' on-ok' : '');
  b[1].className = 'ac' + (estado[k] === 'bad' ? ' on-bad' : '');
  atualizar();
}

function edit(gi, i, campo, valor) {
  const a = GABARITOS[gi].atos[i];
  a[campo] = campo === 'ano' ? (Number(valor) || null) : (valor || null);
  a.editado_por_humano = true;
}

function marcarTodos() {
  document.querySelectorAll('.ed.open').forEach(ed => {
    const gi = Number(ed.id.split('-')[1]);
    GABARITOS[gi].atos.forEach((_, i) => { estado[chave(GABARITOS[gi].arquivo, i)] = 'ok'; });
  });
  render(); abrirTudo();
}

function atualizar() {
  const total = GABARITOS.reduce((s, g) => s + g.atos.length, 0);
  const feitos = Object.values(estado).filter(Boolean).length;
  document.getElementById('pj').textContent = feitos;
  document.getElementById('pt').textContent = total;
  document.getElementById('rodape').textContent =
    feitos < total ? (total - feitos) + ' ato(s) ainda sem julgamento' : 'tudo julgado ✓';
}

function exportar() {
  const quem = document.getElementById('quem').value.trim();
  if (!quem) { alert('Preencha "Validado por" — o gabarito precisa de autoria.'); return; }

  const agora = new Date().toISOString();
  let n = 0;
  GABARITOS.forEach(g => {
    const mantidos = g.atos.filter((_, i) => estado[chave(g.arquivo, i)] !== 'bad');
    const semJulgar = g.atos.filter((_, i) => !estado[chave(g.arquivo, i)]).length;

    const saida = {
      ...g,
      validado: semJulgar === 0,   // só vira gabarito se TUDO foi julgado
      validado_por: quem,
      validado_em: agora,
      origem_anotacao: 'heuristica-c1.1a + validacao-humana-c1.1b',
      total_atos: mantidos.length,
      atos: mantidos,
      descartados_na_validacao: g.atos.length - mantidos.length,
      atos_sem_julgamento: semJulgar,
    };
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([JSON.stringify(saida, null, 2) + '\\n'], { type: 'application/json' }));
    a.download = g.arquivo.replace('.pdf', '.expected.json');
    a.click();
    n++;
  });
  alert(n + ' arquivo(s) baixado(s).\\n\\nSubstitua os de fixtures/edicoes/ e me avise para eu commitar.');
}

render();
</script>
</body>
</html>`;
}

main().catch((e) => { log(`[validador] FALHA: ${e.message}`); process.exit(1); });
