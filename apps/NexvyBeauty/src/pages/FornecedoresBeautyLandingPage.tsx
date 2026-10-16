import { useEffect, useState } from 'react';
import { ArrowRight, Check, ClipboardList, ExternalLink, FileText, Search, ShieldCheck, Sparkles } from 'lucide-react';
import { captureTrackingFromUrl, getTracking } from '@/lib/tracking';
import './fornecedores-beauty.css';

const CHECKOUT = 'https://pay.kiwify.com.br/F8vRJVm';
const KIWIFY_PARAMS = [
  'src', 'sck', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
] as const;

export function checkoutWithTracking(): string {
  const url = new URL(CHECKOUT);
  const tracking = getTracking();
  for (const key of KIWIFY_PARAMS) {
    const value = tracking[key];
    if (value) url.searchParams.set(key, value.slice(0, 200));
  }
  return url.toString();
}

const faqs = [
  { q: 'O que eu recebo?', a: 'Um PDF com 36 fornecedores Beauty organizados e seus canais de contato. Você pode abrir a lista, escolher opções relevantes e começar suas próprias cotações.' },
  { q: 'Preciso ter CNPJ ou comprar no atacado?', a: 'Não. A lista pode ajudar profissionais que compram para uso no negócio e pessoas que querem pesquisar opções para revenda. As condições de venda de cada fornecedor devem ser confirmadas diretamente com ele.' },
  { q: 'Os preços e estoques estão garantidos?', a: 'Não. Preços, estoques, condições e prazos podem mudar. O guia organiza caminhos para você consultar e comparar; a decisão de compra é sua.' },
  { q: 'Como recebo a lista?', a: 'Após a confirmação do pagamento, a Kiwify libera o acesso ao PDF na área de membros e envia as instruções ao e-mail informado na compra.' },
  { q: 'E se eu me arrepender?', a: 'A compra conta com 7 dias de garantia para solicitação de reembolso, pelas condições informadas no checkout da Kiwify.' },
];

export default function FornecedoresBeautyLandingPage() {
  const [checkoutUrl, setCheckoutUrl] = useState(CHECKOUT);

  useEffect(() => {
    captureTrackingFromUrl();
    setCheckoutUrl(checkoutWithTracking());
  }, []);

  const cta = (label = 'Quero acessar os 36 fornecedores', secondary = false) => (
    <a className={`fbl-cta${secondary ? ' fbl-cta--secondary' : ''}`} href={checkoutUrl} rel="noopener noreferrer">
      {label}<ArrowRight size={19} strokeWidth={2.4} aria-hidden="true" />
    </a>
  );

  return (
    <main className="fbl">
      <div className="fbl-topbar"><span>nexvy<span className="fbl-logo-accent">beauty</span></span><div className="fbl-topbar-actions"><span>GUIA DIGITAL • 36 FORNECEDORES</span><a href={checkoutUrl} rel="noopener noreferrer">Acessar por R$33 <ArrowRight size={15} aria-hidden="true" /></a></div></div>

      <section className="fbl-hero" aria-labelledby="fbl-title">
        <div className="fbl-hero-copy">
          <span className="fbl-kicker"><Sparkles size={15} aria-hidden="true" /> SUA PRÓXIMA COMPRA COMEÇA AQUI</span>
          <h1 id="fbl-title">Pare de depender sempre dos <em>mesmos fornecedores.</em></h1>
          <p className="fbl-lead">Encontre novas opções, compare preços e compre melhor. Uma lista organizada de <strong>36 fornecedores Beauty</strong> para você ir direto às cotações — sem começar a pesquisa do zero.</p>
          <div className="fbl-hero-checks"><span><Check size={16} /> Contatos conferidos</span><span><Check size={16} /> PDF de acesso imediato</span><span><Check size={16} /> R$33, pagamento único</span></div>
          {cta()}
          <p className="fbl-micro">Menos de R$1 por fornecedor organizado · Compra segura pela Kiwify</p>
        </div>
        <div className="fbl-cover-wrap" aria-label="Representação do guia digital de fornecedores Beauty">
          <div className="fbl-cover">
            <span className="fbl-cover-brand">NEXVY BEAUTY</span>
            <span className="fbl-cover-line"></span>
            <span className="fbl-cover-number">36</span>
            <strong>fornecedores<br />Beauty</strong>
            <span className="fbl-cover-caption">Uma curadoria para encontrar opções, comparar e comprar melhor.</span>
            <span className="fbl-cover-bottom">GUIA DIGITAL • PDF</span>
          </div>
          <div className="fbl-cover-tag">Menos de<br /><strong>R$1</strong><br />por fornecedor</div>
        </div>
      </section>

      <section className="fbl-strip" aria-label="Benefícios do guia"><span>36 opções em um só lugar</span><i>✦</i><span>Contatos fáceis de consultar</span><i>✦</i><span>Mais poder de comparação</span></section>

      <section className="fbl-section fbl-pain">
        <div className="fbl-section-head"><span className="fbl-eyebrow">PARA QUEM COMPRA BEAUTY</span><h2>Comprar no automático pode sair caro.</h2><p>Quando você consulta sempre os mesmos contatos, pode deixar de conhecer opções mais interessantes para o seu negócio.</p></div>
        <div className="fbl-cards">
          <article><Search aria-hidden="true" /><h3>Chega de busca sem fim</h3><p>Em vez de perder tempo procurando perfis e links soltos, abra uma lista organizada e comece pelos fornecedores que fazem sentido para você.</p></article>
          <article><ClipboardList aria-hidden="true" /><h3>Compare antes de fechar</h3><p>Com mais opções à mão, você pode pedir cotações e avaliar preço, atendimento e condições por conta própria.</p></article>
          <article><Sparkles aria-hidden="true" /><h3>Descubra novos caminhos</h3><p>Encontre alternativas para abastecer seus atendimentos, testar novos produtos ou explorar oportunidades de revenda.</p></article>
        </div>
      </section>

      <section className="fbl-section fbl-how">
        <div className="fbl-section-head"><span className="fbl-eyebrow">SIMPLES DE USAR</span><h2>Abra. Escolha. Faça sua cotação.</h2></div>
        <div className="fbl-steps"><div><b>01</b><h3>Acesse o PDF</h3><p>Receba o guia digital pela área de membros da Kiwify após a confirmação da compra.</p></div><div><b>02</b><h3>Selecione opções</h3><p>Veja os fornecedores e os canais de contato reunidos em um só lugar.</p></div><div><b>03</b><h3>Compare e decida</h3><p>Peça cotações, confira as condições atuais e escolha o que vale a pena para você.</p></div></div>
      </section>

      <section className="fbl-mid-cta"><p>Uma cotação mais vantajosa <strong>já pode compensar o valor da lista.</strong></p>{cta('Quero comparar novos fornecedores', true)}</section>

      <section className="fbl-section fbl-audience">
        <div className="fbl-section-head"><span className="fbl-eyebrow">FEITO PARA O SEU DIA A DIA</span><h2>Mais opções para quem vive de Beauty.</h2><p>Especialmente para quem compra produtos para usar nos atendimentos — nail designers, lash designers, manicures, esteticistas e profissionais de salão. Também pode ser útil para quem pesquisa fornecedores para revender.</p></div>
        <div className="fbl-audience-note"><ShieldCheck size={24} aria-hidden="true" /><span>Os links foram conferidos manualmente. Isso não significa garantia de preço, estoque, entrega ou qualidade de uma compra futura: confirme cada condição com o fornecedor antes de fechar.</span></div>
      </section>

      <section className="fbl-section fbl-offer" id="oferta">
        <div className="fbl-offer-card"><div className="fbl-offer-left"><span className="fbl-eyebrow">SUA LISTA, SEM ENROLAÇÃO</span><h2>36 fornecedores.<br /><em>Uma decisão mais informada.</em></h2><ul><li><Check /> 36 fornecedores Beauty organizados</li><li><Check /> Canais de contato reunidos em PDF</li><li><Check /> Links conferidos manualmente</li><li><Check /> Acesso pela área de membros da Kiwify</li></ul></div><div className="fbl-price"><span>Pagamento único</span><strong>R$33<span>,00</span></strong><small>R$0,92 por fornecedor organizado</small>{cta()}<p><ShieldCheck size={15} /> 7 dias de garantia</p></div></div>
      </section>

      <section className="fbl-section fbl-faq"><div className="fbl-section-head"><span className="fbl-eyebrow">TIRE SUAS DÚVIDAS</span><h2>Perguntas frequentes</h2></div><div className="fbl-faq-list">{faqs.map(({ q, a }) => <details key={q}><summary>{q}<span>+</span></summary><p>{a}</p></details>)}</div></section>

      <section className="fbl-final"><FileText size={35} aria-hidden="true" /><h2>Pronta para comprar com mais opções?</h2><p>Tenha 36 fornecedores Beauty organizados e comece suas cotações sem partir do zero.</p>{cta()}</section>
      <footer className="fbl-footer"><span>nexvybeauty</span><span>Guia digital de fornecedores Beauty</span><a href="https://nexvybeauty.com.br/privacidade" target="_blank" rel="noopener noreferrer">Privacidade <ExternalLink size={13} /></a></footer>
    </main>
  );
}
