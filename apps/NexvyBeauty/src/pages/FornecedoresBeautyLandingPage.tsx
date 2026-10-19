import { useEffect, useState } from 'react';
import { ArrowUpRight, BadgeCheck, Check, MousePointerClick, ShieldCheck, Smartphone, Store } from 'lucide-react';
import { captureTrackingFromUrl, getTracking } from '@/lib/tracking';
import './fornecedores-beauty-v5.css';

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
  { q: 'O que vem no PDF?', a: 'Uma lista de 36 fornecedores Beauty. Você encontra nomes, endereços quando disponíveis e links para canais como WhatsApp, Instagram, site ou catálogo.' },
  { q: 'Preciso ter CNPJ?', a: 'Não para comprar a lista. As condições de venda variam entre fornecedores; confirme diretamente com cada um se atende pessoa física, pedido mínimo e forma de entrega.' },
  { q: 'Como recebo o material?', a: 'Após a confirmação do pagamento, a Kiwify libera o PDF na área de membros e envia as instruções para o e-mail informado na compra.' },
  { q: 'A lista é atualizada?', a: 'Não há atualização periódica incluída. Os links foram conferidos na preparação do material, mas canais, estoques e condições podem mudar.' },
];
const deliverables = [
  ['36 fornecedores Beauty no mesmo lugar', 'Uma relação organizada para você não começar a busca do zero a cada reposição.'],
  ['Contatos e canais de compra clicáveis', 'WhatsApp, Instagram, site ou catálogo, conforme os canais de cada fornecedor.'],
  ['Links conferidos manualmente', 'Todos os links foram checados na preparação do material. Endereços incluídos quando disponíveis.'],
  ['Um PDF para consultar no celular ou computador', 'Acesse o material pela Kiwify após a confirmação do pagamento.'],
];
const deliverableIcons = [Store, MousePointerClick, BadgeCheck, Smartphone];
const steps = [
  ['Abra o PDF', 'Consulte a lista no celular ou no computador.'],
  ['Escolha os contatos', 'Veja quais fornecedores fazem sentido para o seu pedido.'],
  ['Peça suas cotações', 'Compare preço e condições antes de comprar.'],
];

export default function FornecedoresBeautyLandingPage() {
  const [checkoutUrl, setCheckoutUrl] = useState(CHECKOUT);
  useEffect(() => {
    captureTrackingFromUrl();
    setCheckoutUrl(checkoutWithTracking());
  }, []);

  const buyLink = (label: string, className = '') => (
    <a className={`fbe-buy ${className}`} href={checkoutUrl} rel="noopener noreferrer">
      <span>{label}</span><ArrowUpRight size={19} aria-hidden="true" />
    </a>
  );

  return (
    <main className="fbe">
      <header className="fbe-header" id="inicio">
        <a className="fbe-cover-brand" href="#inicio" aria-label="NexvyBeauty, início">
          <img src="/fornecedores-identidade-canva_v2.png" width="600" height="150" alt="Beauty — Lista de fornecedores, com a nova logo NexvyBeauty" />
        </a>
      </header>
      <p className="fbe-pain-strip">Você compra sempre nos mesmos lugares porque não sabe onde mais procurar?</p>
      <section className="fbe-hero" aria-labelledby="fbe-title">
        <div className="fbe-wrap">
          <h1 id="fbe-title">Pare de depender dos mesmos fornecedores.<br /><span>Acesse <em>36 fornecedores</em> Beauty para cotar e comprar melhor.</span></h1>
          <p className="fbe-hero-description">Os contatos reunidos em um <strong>PDF digital</strong> para você comparar preços, encontrar novas opções e economizar na próxima reposição.</p>
          <p className="fbe-shortcut">Abra a lista. Escolha os contatos. Comece suas cotações.</p>
          <div className="fbe-demonstration" id="conteudo">
            <p className="fbe-label">VEJA O MATERIAL QUE VOCÊ VAI RECEBER</p>
            <div className="fbe-pages">
              <figure className="fbe-cover">
                <span>A LISTA</span>
                <img src="/fornecedores-cover.webp" alt="Capa real do PDF Beauty Lista de fornecedores" width="708" height="1000" loading="eager" />
                <figcaption>36 fornecedores em um PDF digital.</figcaption>
              </figure>
              <figure className="fbe-interior">
                <span>DETALHE REAL DO PDF</span>
                <div className="fbe-interior-zoom" role="img" aria-label="Recorte ampliado de uma ficha real do PDF, mostrando a organização por fornecedor e os canais Instagram e vendas; nomes, endereços e contatos foram ocultados" />
                <figcaption>Recorte ampliado de uma ficha real. Identificadores e contatos foram ocultados nesta amostra.</figcaption>
              </figure>
            </div>
          </div>
          <div className="fbe-hero-action">
            {buyLink('Quero os 36 fornecedores por R$33')}
            <p>Pagamento único · Menos de R$1 por fornecedor · 7 dias de garantia</p>
          </div>
          <p className="fbe-demo-note">Imagens reais do material. Você recebe o PDF, não um produto físico.</p>
        </div>
      </section>
      <section className="fbe-intro" aria-labelledby="fbe-intro-title">
        <div className="fbe-wrap">
          <p className="fbe-label">NA HORA DE REPOR SEU MATERIAL...</p>
          <h2 id="fbe-intro-title">Você sabe o preço que paga.<br /><span>Mas já comparou com outras opções?</span></h2>
          <p className="fbe-lead">Às vezes, você nem precisa de mais um produto. Precisa encontrar outro lugar para comprar.</p>
          <div className="fbe-intro-contrast">
            <div><h3>Sem outras opções à mão</h3><p>Você repete o pedido no mesmo lugar, aceita o preço disponível e deixa a pesquisa para depois.</p></div>
            <div><h3>Com 36 opções para consultar</h3><p>Você abre a lista, escolhe os contatos e pede cotações antes de decidir onde comprar.</p></div>
          </div>
          <p className="fbe-transition">E se, na sua próxima compra, você já tivesse essa pesquisa organizada?</p>
        </div>
      </section>
      <section className="fbe-content" aria-labelledby="fbe-content-title">
        <div className="fbe-wrap">
          <p className="fbe-label">É ISSO QUE A LISTA FORNECEDORES BEAUTY ENTREGA</p>
          <h2 id="fbe-content-title">Menos tempo procurando.<br /><span>Mais opções para comparar.</span></h2>
          <p className="fbe-lead">Não é um curso para assistir. É um material para abrir e usar.</p>
          <ul className="fbe-deliverables">{deliverables.map(([title, description], index) => {
            const Icon = deliverableIcons[index];
            return <li key={title}><span className="fbe-feature-icon"><Icon aria-hidden="true" /></span><div><h3>{title}</h3><p>{description}</p></div></li>;
          })}</ul>
          <div className="fbe-curation">
            <h3>Sobre a nossa lista</h3>
            <p>São 36 fornecedores de produtos Beauty em um PDF cuidadosamente organizado. Todos os links e contatos foram conferidos manualmente. Com essa lista você consegue entrar em contato direto e obter suas cotações. Simples e rápido, como tem que ser, para agilizar a sua rotina!</p>
          </div>
          <p className="fbe-content-detail">Preço, estoque, pedido mínimo e entrega devem ser confirmados com cada fornecedor. A lista amplia suas opções; as condições de compra variam.</p>
          {buyLink('Acessar os 36 fornecedores por R$33', 'fbe-buy-inline')}
        </div>
      </section>
      <section className="fbe-note" aria-labelledby="fbe-note-title">
        <div className="fbe-wrap">
          <p className="fbe-label">PARA QUEM COMPRA PARA TRABALHAR OU REVENDER</p>
          <h2 id="fbe-note-title">Seu próximo pedido começa<br />com uma escolha melhor informada.</h2>
          <p className="fbe-lead">Nail designer, lash designer, manicure, esteticista, profissional de salão ou revendedora: se você compra produtos Beauty, vale conhecer outras opções.</p>
          <ol className="fbe-steps">{steps.map(([title, description], index) => (
            <li key={title}><strong>{String(index + 1).padStart(2, '0')}</strong><h3>{title}</h3><p>{description}</p></li>
          ))}</ol>
        </div>
      </section>
      <section className="fbe-offer" id="preco" aria-labelledby="fbe-offer-title">
        <div className="fbe-wrap">
          <p className="fbe-label">A LISTA COMPLETA</p>
          <h2 id="fbe-offer-title">Uma cotação mais vantajosa<br /><span>já pode compensar o valor da lista.</span></h2>
          <p className="fbe-lead">Você não precisa comprar de todos. Precisa encontrar boas opções para o que o seu negócio precisa.</p>
          <div className="fbe-offer-action">
            <h3>36 fornecedores Beauty</h3>
            <ul>{['PDF digital com contatos e canais de compra', 'Links conferidos na preparação do material', 'Entrega na área de membros da Kiwify'].map(item => <li key={item}><Check size={18} aria-hidden="true" />{item}</li>)}</ul>
            <p>Tenha acesso à lista completa por</p>
            <strong className="fbe-price"><span>R$</span>33<small>,00</small></strong>
            <p className="fbe-offer-unit">Menos de R$1 por fornecedor organizado</p>
            <p className="fbe-payment">Pagamento único. Sem mensalidade.</p>
            {buyLink('Quero acessar os 36 fornecedores', 'fbe-buy-offer')}
            <small>Compra pela Kiwify · Produto 100% digital</small>
          </div>
        </div>
      </section>
      <section className="fbe-guarantee" aria-labelledby="fbe-guarantee-title">
        <div className="fbe-wrap">
          <ShieldCheck size={48} strokeWidth={1.5} aria-hidden="true" />
          <h2 id="fbe-guarantee-title">Você tem 7 dias de garantia.</h2>
          <p>Compre, acesse o material e avalie. Se decidir que a lista não é para você, solicite o reembolso em até 7 dias, conforme as condições do checkout.</p>
          <p className="fbe-content-detail">Após a confirmação do pagamento, a Kiwify libera o PDF na área de membros e envia as instruções ao e-mail da compra.</p>
        </div>
      </section>
      <section className="fbe-faq" id="perguntas" aria-labelledby="fbe-faq-title">
        <div className="fbe-wrap">
          <h2 id="fbe-faq-title">Ainda tem alguma dúvida?</h2>
          <div className="fbe-faq-items">{faqs.map(({ q, a }) => (
            <details key={q}><summary>{q}<span aria-hidden="true">+</span></summary><p>{a}</p></details>
          ))}</div>
        </div>
      </section>
      <section className="fbe-closing" aria-labelledby="fbe-closing-title">
        <div className="fbe-wrap">
          <h2 id="fbe-closing-title">Na próxima reposição,<br /><span>tenha mais opções à mão.</span></h2>
          <p>36 fornecedores Beauty. Um PDF digital. R$33, pagamento único.</p>
          {buyLink('Quero minha lista de fornecedores')}
          <p className="fbe-content-detail">Entrega pela Kiwify · 7 dias de garantia</p>
        </div>
      </section>
      <footer className="fbe-footer">
        <svg className="fbe-footer-brand" viewBox="465 20 125 108" width="125" height="108" role="img" aria-label="Nova logo NexvyBeauty: símbolo N e escrita nexvybeauty">
          <image href="/fornecedores-identidade-canva_v2.png" width="600" height="150" />
        </svg>
        <span>© {new Date().getFullYear()} NexvyBeauty</span>
      </footer>
    </main>
  );
}
