import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const originals = '/Users/marcelosilva/Downloads/Beauty - Teste final 10 conceitos (2026-10-15)';
const out = '/Users/marcelosilva/Downloads/Beauty - Revisao consolidada 10 conceitos (2026-10-18)';
const revisions = JSON.parse(await fs.readFile(path.join(root, 'canva-revisions.json'), 'utf8'));
const controls = {
  '02': 'Criativo_02_Original_Feed_1080x1350_v3.png',
  '03': 'Criativo_03_Story_1080x1920.png',
  '06': 'Criativo_06_Feed_1080x1350.png',
  '08': 'Criativo_08_Feed_1080x1350_v5.png',
  '10': 'Criativo_10_Feed_1080x1350.png',
};
const concepts = [
  'Comparar antes de comprar', 'Oferta original', 'Onde comprar', 'Procurar no escuro',
  'Preço e hábito de compra', 'Tempo de pesquisa', 'Pesquisar, comparar e cotar',
  'Atendimento e revenda', 'Caixinha de pergunta', '36 por R$33 / menos de R$1',
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const copyAsset = (source, destination) => execFileSync('/bin/cp', ['-c', source, destination]);
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await fs.mkdir(out, { recursive: true });
const items = [];
for (let i = 1; i <= 10; i++) {
  const id = String(i).padStart(2, '0');
  const control = Object.hasOwn(controls, id);
  const filename = `Criativo_${id}_${control ? 'controle' : id === '09' ? 'aprovado' : 'revisao'}.png`;
  if (control) {
    const source = path.join(originals, controls[id]);
    const before = hash(await fs.readFile(source));
    copyAsset(source, path.join(out, filename));
    if (hash(await fs.readFile(source)) !== before || hash(await fs.readFile(path.join(out, filename))) !== before) throw new Error(`Copy mismatch ${id}`);
  }
  const bytes = await fs.readFile(path.join(out, filename));
  if (bytes.toString('hex', 0, 8) !== '89504e470d0a1a0a') throw new Error(`Not PNG ${id}`);
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  const format = i % 2 ? 'Story 9:16' : 'Feed Instagram 4:5';
  const url = new URL('https://lpfornecedores.nexvy.beauty/');
  Object.entries({utm_source:'meta',utm_medium:'paid',utm_campaign:'fornecedores-lt-validacao',utm_content:`criativo_${id}`,src:'instagram',sck:`adset-${id}`}).forEach(([k,v]) => url.searchParams.set(k,v));
  items.push({id,concept:concepts[i-1],format,filename,width,height,sha256:hash(bytes),people:['01','08','09'].includes(id),status:control?'Controle preservado':id==='09'?'Aprovada e salva no Canva':'Prévia; aprovação pendente',design_id:revisions[id]?.design_id ?? (id==='09'?'DAHYSgy_YNM':null),destination:url.href,ad_ready_resolution:width===1080&&height===(i%2?1920:1350)});
}
if (items.length !== 10 || new Set(items.map(x=>x.sha256)).size !== 10 || items.filter(x=>x.people).length !== 3) throw new Error('Inventory check failed');
const summary = {
  title:'Fornecedores Beauty — apresentação consolidada', date:'2026-10-18',
  offer:'36 fornecedores em PDF digital · R$33 · entrega Kiwify · 7 dias',
  warning:'As cinco imagens exportadas do Canva pelo MCP têm 600 px de altura e servem para revisão. A exportação em 1080 px continua necessária antes de anunciar.',
  lp:'LP v4 local com entrada própria, amostra real com campos ocultos, três CTAs Kiwify e origem preservada. Não publicada nesta etapa.',
  tests:'Revisão independente: build em memória exit 0, ESLint da entrada/componente exit 0, UTMs URL 7/7 e retorno cookie 7/7. Browser em 320/390/1440: sem overflow, CTA na primeira dobra, imagens e FAQ funcionais. Conferência final pelo Chrome direto: errors=[], imagens carregadas e três links de compra.',
  production:'Domínio público HTTP 200, código do Pixel presente e ID numérico configurado no HTML, sem placeholder pendente. Isso não comprova recebimento de eventos. O repositório contém kiwify-beauty-lt-webhook, valida HMAC e produto e chama platform_crm_ingest_beauty_lt_order; a execução real até o DB ainda precisa ser comprovada.',
  campaign:'Plano aprovado: uma campanha ABO, dez conjuntos, um anúncio por conjunto; R$14/dia por conjunto durante três dias, total R$420. Feed apenas do Instagram; Stories conforme o formato. Ativação pendente.',
  copy:'36 fornecedores Beauty em um PDF, com contatos e canais de compra para cotar e comparar. Acesse a lista por R$33.',
  headline:'36 fornecedores Beauty em PDF', cta:'Saiba mais',
};
const md = [`# ${summary.title}`, '', ...Object.entries(summary).filter(([k])=>k!=='title').map(([k,v])=>`**${k}:** ${v}\n`), '| Peça | Conceito | Formato | Estado | Arquivo | Resolução |', '|---|---|---|---|---|---|', ...items.map(x=>`| ${x.id} | ${x.concept} | ${x.format} | ${x.status} | [${x.filename}](${encodeURI(x.filename)}) | ${x.width}×${x.height} |`), '', '## Página de vendas', '', '[Captura desktop](lp-desktop.jpg) · [Captura mobile](lp-mobile.jpg)', '', '## Pendências antes de ativar', '', '- Aprovação das revisões 01, 04, 05 e 07, seguida do salvamento no Canva.', '- Avaliação da LP local e publicação da versão aprovada.', '- Exportação das peças em resolução de anúncio e conferência de posicionamento no Meta.', '- Compra de teste controlada: Kiwify → webhook autenticado/idempotente → produto Fornecedor Beauty - LT no platform_crm_*; eventos e origem comprovados.', '', '## Origem dos novos cenários', '', 'Gerados pelo imagegen integrado; capa do PDF original sobreposta no Canva. Tablet: foto frontal em bancada Beauty com tela vazia, luz natural, sem pessoas/papel/texto. Celular: foto frontal centralizada em bancada Beauty, tela vazia, sem pessoas/papel/texto. Arquivos de origem na subpasta fontes.', '', '## URLs por criativo', '', ...items.map(x=>`- ${x.id}: ${x.destination}`)].join('\n');
const cards = items.map(x=>{
  const thumb=execFileSync('magick',[path.join(out,x.filename),'-resize','480x600>','-quality','82','webp:-']);
  return `<article><div class="meta"><b>${x.id} · ${esc(x.concept)}</b><span>${esc(x.format)}</span></div><img src="data:image/webp;base64,${thumb.toString('base64')}" alt="Criativo ${x.id}"><p>${esc(x.status)}<br><small>${x.width}×${x.height} · ${x.ad_ready_resolution?'resolução de anúncio':'prévia de revisão'}</small></p></article>`;
}).join('');
const lpImages = await Promise.all(['desktop','mobile'].map(async kind=>`<figure><figcaption>LP · ${kind}</figcaption><img class="lp" src="data:image/jpeg;base64,${(await fs.readFile(path.join(out,`lp-${kind}.jpg`))).toString('base64')}" alt="LP ${kind}"></figure>`));
const html=`<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${summary.title}</title><style>body{margin:0;background:#f4eeea;color:#2a2023;font:16px/1.6 system-ui,sans-serif}main{max-width:1380px;margin:auto;padding:32px}h1{line-height:1.12;max-width:900px;font-size:42px}h2{margin-top:48px}.notice{background:#fff;padding:20px;border-left:5px solid #8b1730}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:22px}article{background:white;padding:16px;display:flex;flex-direction:column;box-shadow:0 4px 20px #3213200c}article img{width:100%;height:460px;object-fit:contain;background:#faf7f3}article p{font-size:13px}.meta{min-height:76px}.meta span{display:block;font-size:12px;color:#6b565c}.lp{max-width:100%;height:auto}figure{margin:20px 0;padding:16px;background:white}figure:nth-child(2){max-width:430px}.lp-grid{display:grid;grid-template-columns:2fr 1fr;gap:24px;align-items:start}small{color:#6b565c}details{margin:24px 0}pre{white-space:pre-wrap;font:14px/1.7 system-ui}@media(max-width:700px){main{padding:18px}h1{font-size:32px}.lp-grid{display:block}article img{height:500px}}</style><main><p>NEXVY BEAUTY · 18/10/2026</p><h1>${summary.title}</h1><p>${summary.offer}</p><p class="notice">${summary.warning}</p><p>${summary.lp}</p><h2>As dez peças</h2><div class="grid">${cards}</div><h2>Página de vendas</h2><p>${summary.tests}</p><div class="lp-grid">${lpImages.join('')}</div><h2>Plano de tráfego preservado</h2><p>${summary.campaign}</p><h2>Texto comum proposto para isolar o teste da arte</h2><p>${summary.copy}</p><p><b>${summary.headline}</b> · ${summary.cta}</p><details><summary>Registro completo, limites e URLs</summary><pre>${esc(md)}</pre></details></main></html>`;
await fs.writeFile(path.join(out,'consolidacao.md'),md);
await fs.writeFile(path.join(out,'consolidacao.html'),html);
await fs.writeFile(path.join(out,'manifesto.json'),JSON.stringify({summary,items},null,2));
await fs.copyFile(path.join(root,'canva-revisions.json'),path.join(out,'canva-revisions.json'));
await fs.mkdir(path.join(out,'fontes'),{recursive:true});
for(const [source,dest] of [['exec-1a0034ab-f019-47c0-92ab-cdd568984bde.png','tablet.png'],['exec-d0ac83a3-7fbd-484d-a6cc-a54d11dff11c.png','celular.png']]) copyAsset(path.join('/Users/marcelosilva/.codex/generated_images/01a11162-21e3-7f83-a4ee-358aecb2899b',source),path.join(out,'fontes',dest));
console.log(`PASS 10/10 peças únicas; 5 controles idênticos às fontes; 3/10 com pessoas; HTML autocontido e Markdown: ${out}`);
