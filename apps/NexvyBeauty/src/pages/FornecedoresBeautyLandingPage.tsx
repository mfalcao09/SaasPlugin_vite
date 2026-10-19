import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { captureTrackingFromUrl, getTracking } from '@/lib/tracking';
import './fornecedores-beauty-v4.css';

const CHECKOUT = 'https://pay.kiwify.com.br/F8vRJVm';
const KIWIFY_PARAMS = [
  'src', 'sck', 'utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content',
] as const;

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
  {
    q: 'O que vem no PDF?',
    a: 'Uma lista de 36 fornecedores Beauty. Você encontra nomes, endereços quando disponíveis e links para canais como WhatsApp, Instagram, site ou catálogo.',
  },
  {
    q: 'Preciso ter CNPJ?',
    a: 'Não para comprar a lista. As condições de venda variam entre fornecedores; confirme diretamente com cada um se atende pessoa física, pedido mínimo e forma de entrega.',
  },
  {
    q: 'Vou encontrar preços menores?',
    a: 'A lista não garante preços menores. Ela amplia suas opções para pedir cotações e comparar as condições atuais antes de comprar.',
  },
  {
    q: 'Como recebo o material?',
    a: 'Após a confirmação do pagamento, a Kiwify libera o PDF na área de membros e envia as instruções para o e-mail informado na compra.',
  },
  {
    q: 'A lista é atualizada?',
    a: 'Não há atualização periódica incluída. Os links foram conferidos na preparação do material, mas canais, estoques e condições podem mudar.',
  },
  {
    q: 'Posso pedir reembolso?',
    a: 'Sim. Você tem 7 dias para solicitar reembolso, conforme as condições apresentadas no checkout da Kiwify.',
  },
];

export default function FornecedoresBeautyLandingPage() {
  const [checkoutUrl, setCheckoutUrl] = useState(CHECKOUT);

  useEffect(() => {
    captureTrackingFromUrl();
    setCheckoutUrl(checkoutWithTracking());
  }, []);

  const buyLink = (label: string, className = '') => (
    <a className={`fbe-buy ${className}`} href={checkoutUrl} rel="noopener noreferrer">
      <span>{label}</span>
      <ArrowUpRight size={19} aria-hidden="true" />
    </a>
  );

  return (
    <main className="fbe">
      <header className="fbe-header">
        <a className="fbe-wordmark" href="#inicio" aria-label="NexvyBeauty, início">
          nexvy<span>beauty</span>
        </a>
        <nav aria-label="Navegação da página">
          <a href="#conteudo">Veja a lista</a>
          <a href="#perguntas">Dúvidas</a>
        </nav>
        <a className="fbe-header-price" href="#preco">Ver oferta <ArrowUpRight size={16} aria-hidden="true" /></a>
      </header>

      <section className="fbe-hero" id="inicio" aria-labelledby="fbe-title">
        <div className="fbe-hero-copy">
          <p className="fbe-label">FORNECEDORES BEAUTY PARA O SEU PRÓXIMO PEDIDO</p>
          <h1 id="fbe-title">Pare de depender sempre dos <span>mesmos fornecedores.</span></h1>
          <p className="fbe-hero-description">
            Encontre <strong>36 fornecedores Beauty</strong> reunidos em um PDF digital.
            Abra novas opções, peça cotações e compare antes de comprar.
          </p>
          <p className="fbe-hero-facts">36 fornecedores <span aria-hidden="true">·</span> contatos e canais de compra <span aria-hidden="true">·</span> PDF digital</p>
          <div className="fbe-hero-buy">
            <p><span>Pagamento único</span><strong>R$33<small>,00</small></strong></p>
            {buyLink('Quero acessar a lista')}
          </div>
          <p className="fbe-hero-footnote">Entrega pela Kiwify após a compra · 7 dias para solicitar reembolso</p>
        </div>
        <figure className="fbe-cover">
          <img
            src="/fornecedores-cover.webp"
            alt="Capa real do PDF Beauty Lista de fornecedores"
            width="708"
            height="1000"
            loading="eager"
          />
          <figcaption>Esta é a capa do material que você vai receber.</figcaption>
        </figure>
      </section>

      <section className="fbe-intro" aria-labelledby="fbe-intro-title">
        <div className="fbe-intro-copy">
          <p className="fbe-label">A COMPRA QUE VOCÊ FAZ TODA SEMANA</p>
          <h2 id="fbe-intro-title">Comprar dos mesmos lugares por conveniência pode custar mais do que parece.</h2>
          <div className="fbe-intro-contrast">
            <p><strong>Sem outras opções à mão:</strong> você repete o pedido, aceita o preço disponível e deixa a pesquisa para depois.</p>
            <p><strong>Com a lista aberta:</strong> você escolhe contatos, pede cotações e compara as condições antes de decidir.</p>
          </div>
          <p className="fbe-intro-aside">A lista não define onde você deve comprar. Ela encurta o caminho até outras possibilidades.</p>
        </div>
      </section>

      <section className="fbe-content" id="conteudo" aria-labelledby="fbe-content-title">
        <div className="fbe-content-copy">
          <p className="fbe-label">VEJA O QUE VOCÊ RECEBE</p>
          <h2 id="fbe-content-title">Não é um curso. É a lista que você abre para começar a cotar.</h2>
          <p>São 36 fornecedores organizados num PDF, com nomes e canais de contato reunidos no mesmo lugar.</p>
          <dl className="fbe-content-list">
            <div><dt>36 fornecedores</dt><dd>Opções Beauty para pesquisar antes do próximo pedido.</dd></div>
            <div><dt>Canais de compra</dt><dd>Links de WhatsApp, Instagram, site ou catálogo, conforme o fornecedor.</dd></div>
            <div><dt>Informações úteis</dt><dd>Endereços quando disponíveis no material.</dd></div>
          </dl>
          <p className="fbe-content-detail">Os links foram conferidos manualmente na preparação da lista. Preço, estoque, entrega e pedido mínimo devem ser confirmados com cada fornecedor.</p>
          {buyLink('Acessar os 36 fornecedores por R$33', 'fbe-buy-inline')}
        </div>
        <figure className="fbe-interior">
          <img
            src="/fornecedores-interior-preview.webp"
            alt="Página real do PDF mostrando a organização por fornecedor e canais, com nomes, endereços e contatos ocultos"
            width="660"
            height="930"
          />
          <figcaption>Página real do PDF. Nomes, endereços e contatos ocultos nesta amostra.</figcaption>
        </figure>
      </section>

      <section className="fbe-note" aria-labelledby="fbe-note-title">
        <p className="fbe-label">COMO VOCÊ USA</p>
        <h2 id="fbe-note-title">Abra. Escolha. Compare.</h2>
        <p>
          Na próxima reposição de material, abra o PDF, selecione fornecedores que fazem sentido
          para o que você precisa e peça cotações. Você já parte de uma lista organizada,
          sem refazer a pesquisa do zero.
        </p>
        <p className="fbe-note-audience">Pensada principalmente para nail designers, lash designers, manicures, esteticistas e profissionais de salão. Também serve a quem pesquisa produtos para revenda.</p>
      </section>

      <section className="fbe-offer" id="preco" aria-labelledby="fbe-offer-title">
        <div className="fbe-offer-copy">
          <p className="fbe-label">A LISTA COMPLETA</p>
          <h2 id="fbe-offer-title">Uma cotação mais vantajosa já pode compensar o valor da lista.</h2>
          <p>36 fornecedores Beauty para você ter mais opções quando for comprar para trabalhar ou revender.</p>
        </div>
        <div className="fbe-offer-action">
          <p>PDF digital · pagamento único</p>
          <strong><span>R$</span>33<small>,00</small></strong>
          <p className="fbe-offer-unit">Menos de R$1 por fornecedor organizado</p>
          {buyLink('Quero acessar os 36 fornecedores', 'fbe-buy-offer')}
          <small>Checkout seguro na Kiwify · 7 dias para solicitar reembolso</small>
        </div>
      </section>

      <section className="fbe-faq" id="perguntas" aria-labelledby="fbe-faq-title">
        <div>
          <h2 id="fbe-faq-title">Perguntas antes de comprar</h2>
        </div>
        <div className="fbe-faq-items">
          {faqs.map(({ q, a }) => (
            <details key={q}>
              <summary>{q}<span aria-hidden="true">+</span></summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <footer className="fbe-footer">
        <span className="fbe-wordmark">nexvy<span>beauty</span></span>
        <span>© {new Date().getFullYear()} NexvyBeauty</span>
        <a href="https://nexvybeauty.com.br/privacidade" target="_blank" rel="noopener noreferrer">
          Privacidade <ExternalLink size={13} aria-hidden="true" />
        </a>
      </footer>
    </main>
  );
}
