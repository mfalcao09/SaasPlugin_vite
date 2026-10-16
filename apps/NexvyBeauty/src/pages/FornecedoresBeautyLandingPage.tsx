import { useEffect, useState } from 'react';
import { ArrowUpRight, ExternalLink } from 'lucide-react';
import { captureTrackingFromUrl, getTracking } from '@/lib/tracking';
import './fornecedores-beauty.css';

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
          <a href="#conteudo">O que vem na lista</a>
          <a href="#perguntas">Dúvidas</a>
        </nav>
        <a className="fbe-header-price" href="#preco">Ver preço <ArrowUpRight size={16} aria-hidden="true" /></a>
      </header>

      <section className="fbe-hero" id="inicio" aria-labelledby="fbe-title">
        <div className="fbe-hero-copy">
          <p className="fbe-label">LISTA DE FORNECEDORES / BEAUTY</p>
          <h1 id="fbe-title">Seu próximo fornecedor <span>não precisa ser o de sempre.</span></h1>
          <p className="fbe-hero-description">
            Reunimos <strong>36 fornecedores Beauty</strong> em um PDF simples de consultar.
            Abra, escolha alguns contatos e compare antes de fazer seu próximo pedido.
          </p>
          <div className="fbe-hero-buy">
            {buyLink('Acessar a lista por R$33')}
            <p>Pagamento único. Entrega pela Kiwify.</p>
          </div>
          <p className="fbe-hero-footnote">Menos de R$1 por fornecedor organizado.</p>
        </div>
        <figure className="fbe-cover">
          <img
            src="/fornecedores-cover.webp"
            alt="Capa real do PDF Beauty Lista de fornecedores"
            width="708"
            height="1000"
            fetchPriority="high"
          />
          <figcaption>Capa do material entregue após a compra</figcaption>
        </figure>
      </section>

      <section className="fbe-intro" aria-labelledby="fbe-intro-title">
        <div className="fbe-intro-number" aria-label="36 fornecedores">36<span>fornecedores<br />na lista</span></div>
        <div className="fbe-intro-copy">
          <h2 id="fbe-intro-title">Você conhece os fornecedores de sempre. <span>E os outros?</span></h2>
          <p>
            Pesquisar perfil por perfil toma tempo. Com a lista, você já tem outras portas
            para abrir quando precisar repor material, testar um produto ou pesquisar
            opções para revenda.
          </p>
          <p className="fbe-intro-aside">A decisão continua sua: peça preço, confirme as condições e compare.</p>
        </div>
      </section>

      <section className="fbe-content" id="conteudo" aria-labelledby="fbe-content-title">
        <div className="fbe-content-copy">
          <p className="fbe-label">POR DENTRO DO PDF</p>
          <h2 id="fbe-content-title">Um PDF de contatos. <span>Direto ao ponto.</span></h2>
          <p>
            Os fornecedores estão numerados, com seus canais de contato reunidos no mesmo
            lugar. Você abre os links e começa a cotar com quem fizer sentido para a sua compra.
          </p>
          <dl className="fbe-content-list">
            <div><dt>Para encontrar</dt><dd>36 fornecedores Beauty organizados</dd></div>
            <div><dt>Para entrar em contato</dt><dd>Links de vendas, catálogos, lojas ou redes sociais</dd></div>
            <div><dt>Para se orientar</dt><dd>Endereços quando disponíveis no material</dd></div>
          </dl>
          <p className="fbe-content-detail">Os links foram conferidos manualmente na preparação da lista.</p>
        </div>
        <figure className="fbe-interior">
          <img
            src="/fornecedores-interior-obscured.webp"
            alt="Prévia protegida do interior do PDF, com os contatos ocultos"
            width="660"
            height="930"
          />
          <figcaption>Prévia do interior. Os contatos estão ocultos nesta imagem.</figcaption>
        </figure>
      </section>

      <section className="fbe-note" aria-labelledby="fbe-note-title">
        <h2 id="fbe-note-title">Para quem compra para trabalhar. <span>Ou quer começar a revender.</span></h2>
        <p>
          Pensada principalmente para nail designers, lash designers, manicures, esteticistas
          e profissionais de salão. Também pode ajudar quem quer pesquisar fornecedores
          para revenda. Você não precisa comprar de todos — precisa conhecer opções.
        </p>
      </section>

      <section className="fbe-offer" id="preco" aria-labelledby="fbe-offer-title">
        <div className="fbe-offer-copy">
          <h2 id="fbe-offer-title">Uma cotação mais vantajosa já pode compensar o valor da lista.</h2>
          <p>Novas opções à mão para a próxima vez que você for comprar.</p>
        </div>
        <div className="fbe-offer-action">
          <p>PDF digital · pagamento único</p>
          <strong><span>R$</span>33<small>,00</small></strong>
          <p className="fbe-offer-unit">R$0,92 por fornecedor organizado</p>
          {buyLink('Quero acessar os 36 fornecedores', 'fbe-buy-offer')}
          <small>Checkout Kiwify · 7 dias para solicitar reembolso</small>
        </div>
      </section>

      <section className="fbe-faq" id="perguntas" aria-labelledby="fbe-faq-title">
        <div>
          <h2 id="fbe-faq-title">Ainda tem alguma dúvida?</h2>
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
