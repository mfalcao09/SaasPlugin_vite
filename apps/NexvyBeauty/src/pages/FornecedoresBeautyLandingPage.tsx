import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ExternalLink, LockKeyhole, ShieldCheck } from 'lucide-react';
import { captureTrackingFromUrl, getTracking } from '@/lib/tracking';
import './fornecedores-beauty.css';

const CHECKOUT = 'https://pay.kiwify.com.br/F8vRJVm';
const KIWIFY_PARAMS = ['src', 'sck', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content'] as const;

function checkoutWithTracking(): string {
  const url = new URL(CHECKOUT);
  const tracking = getTracking();
  for (const key of KIWIFY_PARAMS) {
    const value = tracking[key];
    if (value) url.searchParams.set(key, value.slice(0, 200));
  }
  return url.toString();
}

const faqs = [
  { q: 'O que exatamente vem no PDF?', a: 'Uma lista organizada com 36 fornecedores Beauty, endereços quando disponíveis e links para seus canais de contato, como site, catálogo, Instagram ou WhatsApp.' },
  { q: 'Preciso ter CNPJ ou comprar no atacado?', a: 'Não. A lista também serve para profissionais que compram produtos para usar nos atendimentos. As condições de venda de cada fornecedor devem ser confirmadas diretamente com ele.' },
  { q: 'Vocês garantem economia ou preços mais baixos?', a: 'Não há garantia de economia: os preços e condições variam. A lista oferece novas opções para você solicitar cotações e comparar antes de comprar.' },
  { q: 'Quando e onde recebo o material?', a: 'Após a confirmação do pagamento, a Kiwify libera o PDF na área de membros e envia as instruções para o e-mail informado na compra.' },
  { q: 'O material recebe atualizações?', a: 'Não há atualização periódica incluída. Os links foram conferidos na preparação do material, mas canais, estoques e condições podem mudar.' },
  { q: 'E se eu me arrepender?', a: 'Você tem 7 dias para solicitar reembolso, conforme as condições informadas no checkout da Kiwify.' },
];

export default function FornecedoresBeautyLandingPage() {
  const [checkoutUrl, setCheckoutUrl] = useState(CHECKOUT);
  useEffect(() => { captureTrackingFromUrl(); setCheckoutUrl(checkoutWithTracking()); }, []);

  const cta = (label = 'Quero acessar a lista') => (
    <a className="fbl-cta" href={checkoutUrl} rel="noopener noreferrer"><span>{label}</span><ArrowUpRight size={20} aria-hidden="true" /></a>
  );

  return <main className="fbl">
    <div className="fbl-announcement">36 fornecedores Beauty em um só lugar <span>✦</span> Acesso imediato por R$33</div>
    <header className="fbl-header">
      <a className="fbl-brand" href="#inicio" aria-label="Nexvy Beauty — início"><span className="fbl-monogram">N<span>·</span></span><span>nexvy<em>beauty</em></span></a>
      <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#o-que-recebo">O que recebo</a><a className="fbl-header-cta" href="#oferta">Ver a oferta <ArrowRight size={15} aria-hidden="true" /></a></nav>
    </header>

    <section className="fbl-hero" id="inicio" aria-labelledby="fbl-title">
      <div className="fbl-hero-copy">
        <span className="fbl-overline"><span /> O GUIA PARA SUA PRÓXIMA COMPRA</span>
        <h1 id="fbl-title">Mais opções para <em>comprar melhor.</em></h1>
        <p className="fbl-hero-subtitle">Pare de depender sempre dos mesmos fornecedores. Encontre <strong>36 opções Beauty</strong>, compare preços e escolha com mais liberdade — sem começar a pesquisa do zero.</p>
        <div className="fbl-hero-action">{cta('Quero conhecer os 36 fornecedores')}<a className="fbl-text-link" href="#o-que-recebo">Veja o que está incluso <ArrowDown size={15} aria-hidden="true" /></a></div>
        <div className="fbl-hero-assurance"><span><Check size={15} /> PDF com contatos clicáveis</span><span><Check size={15} /> Pagamento único de R$33</span></div>
      </div>
      <div className="fbl-hero-visual">
        <div className="fbl-hero-image-frame"><img src="/fornecedores-cover.webp" alt="Capa real do PDF Beauty Lista de fornecedores, com produtos de beleza sobre uma bancada" width="708" height="1000" fetchPriority="high" /></div>
        <div className="fbl-hero-seal"><small>MENOS DE</small><strong>R$1</strong><span>por fornecedor</span></div>
        <span className="fbl-hero-image-note">O PRODUTO QUE VOCÊ VAI RECEBER ↗</span>
      </div>
    </section>

    <div className="fbl-divider" aria-label="Resumo da oferta"><span>36 fornecedores</span><i>✦</i><span>Contatos reunidos</span><i>✦</i><span>Mais poder de comparação</span></div>

    <section className="fbl-story" id="como-funciona" aria-labelledby="fbl-story-title">
      <div className="fbl-story-left"><span className="fbl-section-index">01 / O PONTO DE PARTIDA</span><h2 id="fbl-story-title">Comprar sempre no mesmo lugar é fácil. <em>Comparar é mais inteligente.</em></h2><p>Se a busca por novos contatos fica para depois, você pode continuar comprando sem saber quais outras opções existem.</p></div>
      <div className="fbl-story-right"><div className="fbl-story-lead"><span>O QUE MUDA NA PRÁTICA</span><ArrowUpRight size={19} aria-hidden="true" /></div>
        <article><b>01</b><div><h3>Você deixa de procurar do zero</h3><p>Os caminhos de contato já estão reunidos para você abrir e avaliar.</p></div></article>
        <article><b>02</b><div><h3>Você tem opções para cotar</h3><p>Fale com fornecedores diferentes e compare preço, atendimento e condições.</p></div></article>
        <article><b>03</b><div><h3>Você decide com mais informação</h3><p>Escolha o que faz sentido para o seu negócio, no seu tempo e do seu jeito.</p></div></article>
      </div>
    </section>

    <section className="fbl-preview" id="o-que-recebo" aria-labelledby="fbl-preview-title">
      <div className="fbl-preview-art"><div className="fbl-preview-page"><img src="/fornecedores-interior-obscured.webp" alt="Prévia protegida de uma página interna do PDF; os contatos foram ocultados nesta imagem" width="660" height="930" /></div><span className="fbl-preview-stamp">PRÉVIA DO INTERIOR<br /><strong>CONTATOS OCULTOS</strong></span></div>
      <div className="fbl-preview-copy"><span className="fbl-section-index">02 / O QUE VOCÊ RECEBE</span><h2 id="fbl-preview-title">Não é mais uma pasta de links soltos. <em>É sua lista pronta para consultar.</em></h2><p>Um PDF com 36 fornecedores Beauty organizados. Abra, encontre canais de contato e comece suas próprias cotações em poucos minutos.</p><ul><li><Check size={17} /> Fornecedores numerados e fáceis de localizar</li><li><Check size={17} /> Links para vendas, catálogos, lojas ou redes sociais</li><li><Check size={17} /> Endereços quando disponíveis no material</li><li><Check size={17} /> Links conferidos manualmente na preparação da lista</li></ul><div className="fbl-preview-note"><LockKeyhole size={16} aria-hidden="true" /> A imagem ao lado mostra a estrutura do PDF; os contatos ficam visíveis apenas no material adquirido.</div></div>
    </section>

    <section className="fbl-audience" aria-labelledby="fbl-audience-title"><span className="fbl-section-index">03 / PARA QUEM É</span><h2 id="fbl-audience-title">Para quem vive de Beauty. <em>E compra para fazer acontecer.</em></h2><p>Feita principalmente para nail designers, lash designers, manicures, esteticistas e profissionais de salão que compram produtos para trabalhar. Também pode ser útil para quem pesquisa opções de revenda.</p><div className="fbl-audience-tags"><span>NAIL</span><span>LASH</span><span>MANICURE</span><span>ESTÉTICA</span><span>SALÃO</span><span>REVENDA</span></div></section>

    <section className="fbl-offer-section" id="oferta" aria-labelledby="fbl-offer-title"><div className="fbl-offer-copy"><span className="fbl-section-index">A SUA PRÓXIMA COTAÇÃO COMEÇA AQUI</span><h2 id="fbl-offer-title">Uma cotação mais vantajosa <em>já pode compensar o valor da lista.</em></h2><p>Tenha novas opções à mão para comparar antes de fazer a próxima compra.</p><div className="fbl-offer-facts"><span><Check size={16} /> 36 fornecedores Beauty</span><span><Check size={16} /> PDF digital</span><span><Check size={16} /> Acesso após a compra</span></div></div><div className="fbl-offer-price"><span>INVESTIMENTO ÚNICO</span><strong><span>R$</span>33<small>,00</small></strong><p>R$0,92 por fornecedor organizado</p>{cta('Acessar os 36 fornecedores')}<div className="fbl-offer-security"><ShieldCheck size={16} /> Checkout seguro Kiwify · 7 dias de garantia</div></div></section>

    <section className="fbl-faq" aria-labelledby="fbl-faq-title"><div className="fbl-faq-heading"><span className="fbl-section-index">AINDA TEM DÚVIDAS?</span><h2 id="fbl-faq-title">Tudo claro antes de comprar.</h2></div><div className="fbl-faq-list">{faqs.map(({ q, a }) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>
    <footer className="fbl-footer"><div><span className="fbl-footer-brand">nexvy<em>beauty</em></span><p>Encontre opções. Compare. Compre melhor.</p></div><div><span>© {new Date().getFullYear()} Nexvy Beauty</span><a href="https://nexvybeauty.com.br/privacidade" target="_blank" rel="noopener noreferrer">Política de privacidade <ExternalLink size={13} /></a></div></footer>
  </main>;
}
