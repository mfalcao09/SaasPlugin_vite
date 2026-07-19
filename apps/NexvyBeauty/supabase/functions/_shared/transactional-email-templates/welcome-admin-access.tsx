/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  fullName?: string | null
  planName?: string | null
  recoveryLink?: string | null
  email?: string | null
}

// Destino do card Cofounder: formulário público `/f/interesse-cofounder` (JÁ
// EXISTE no CRM — form "Interesse Cofounder", produto Cofounder e2e1e85d, com
// pipeline próprio Interessada→…→Concluída) → edge platform-form-submit → cria
// lead na coluna "Interessada" do kanban do produto Cofounder.
// TODO(ops): confirmar o domínio público que serve as rotas /f/:slug.
const COFOUNDER_URL = 'https://nexvybeauty.com.br/f/interesse-cofounder'
const INSTAGRAM_URL = 'https://instagram.com/nexvytech'
const WHATSAPP_LABEL = '(11) 95502-1205'
const WHATSAPP_URL = 'https://wa.me/5511955021205'

// Slices do design Canva "NexvyBeauty - Boas Vindas" (fonte visual da verdade).
// Hospedadas em apps/NexvyBeauty/public/email/ → servidas pelo front em
// https://nexvybeauty.com.br/email/* (exigem deploy do front para ficarem públicas).
const HERO_IMG = 'https://nexvybeauty.com.br/email/hero.jpg'
const COFOUNDER_IMG = 'https://nexvybeauty.com.br/email/cofounder.jpg'

// Paleta sampleada do PDF do Canva (200dpi):
const PINK = '#cf3f6e' // CTA principal rosa/magenta
const SAGE = '#798a83' // CTA Cofounder verde-sálvia
const CREAM = '#f3ece7' // faixa creme / fundo geral
const FOOTER_BG = '#d5d9da' // rodapé cinza-azulado
const INK = '#2a2124' // texto escuro

const COFOUNDER_PILLARS: Array<{ title: string; body: string }> = [
  {
    title: 'Mentoria individual e personalizada',
    body:
      'Nada de técnica genérica que serve pra qualquer negócio. A gente analisa o seu espaço, com o seu contexto e os seus números.',
  },
  {
    title: 'Raio-X financeiro do seu negócio',
    body:
      'Margem líquida, margem de contribuição, ROI. Se você não sabe esses números hoje, é um bom sinal de que está trabalhando às cegas.',
  },
  {
    title: 'Percepção de marca e precificação',
    body:
      'Posicionamento, valor percebido, forma de vender e composição de ticket — o que faz a cliente escolher (e pagar bem) por você.',
  },
  {
    title: '8 encontros individuais, no seu tempo',
    body:
      '1 hora cada, marcados sob demanda ao longo de 3 meses. E toda a implantação do sistema feita por nós, em paralelo.',
  },
]

const WelcomeAdminAccessEmail = ({
  fullName,
  planName,
  recoveryLink,
  email,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Um novo tempo começou — sua EquipIA já está de plantão</Preview>
    <Body style={main}>
      <Container style={container}>
        {/* ── HERO (design Canva: foto full-bleed com tipografia assada) ── */}
        <Section style={heroSection}>
          <Img
            src={HERO_IMG}
            width="600"
            alt="Um novo tempo começou! Obrigado por assinar NexvyBeauty — estamos comprometidos em mudar a gestão do seu negócio."
            style={heroImg}
          />
        </Section>

        {/* ── Faixa creme: corpo verbatim do Canva v2 ── */}
        <Section style={creamBody}>
          <Text style={lead}>
            Estamos muito felizes em ter você no universo NexvyBeauty! Agora
            começa o seu onboarding, que vai ser acompanhado com nossa Equip(IA)
            - sim, também temos a nossa!
          </Text>
          <Text style={text}>
            Nosso desejo é ajudá-la a trazer suas clientes de volta,
            fidelizá-las; além de atendê-las virtualmente no dia-a-dia com
            qualidade e agilidade!
          </Text>
          <Text style={text}>
            Prepare-se para transformar a experiência no seu salão e impulsionar
            o sucesso do seu negócio com inteligência e sofisticação.
          </Text>
          {recoveryLink ? (
            <Section style={ctaWrap}>
              <Button href={recoveryLink} style={pinkButton}>
                Começar meu Onboarding
              </Button>
            </Section>
          ) : (
            <Text style={text}>
              Use a opção “Esqueci minha senha” na tela de login com o e-mail
              <strong> {email}</strong> para criar sua senha de acesso.
            </Text>
          )}
          <Text style={muted}>
            Se você não reconhece esta compra, basta ignorar este e-mail.
          </Text>
        </Section>

        {/* ── Bloco Cofounder: 2 colunas (foto | conteúdo), padrão Canva ── */}
        <Section style={cofounderBlock}>
          <div style={colPhoto}>
            <Img
              src={COFOUNDER_IMG}
              width="288"
              alt="Sessão de massagem em um espaço de bem-estar claro e acolhedor"
              style={cofounderImg}
            />
          </div>
          <div style={colContent}>
            <Text style={cofounderHeading}>Programa Cofounder</Text>
            <Text style={cofounderTagline}>
              Mais do que um sistema: um lugar ao seu lado.
            </Text>
            <Text style={cofounderIntro}>
              Para um grupo pequeno de fundadoras, o Cofounder é mentoria
              individual para destravar o seu negócio de dentro pra fora:
            </Text>
            {COFOUNDER_PILLARS.map((p) => (
              <Text key={p.title} style={pillar}>
                <span style={pillarSpark}>✨</span>{' '}
                <strong style={pillarTitle}>{p.title}</strong>
                <br />
                <span style={pillarBody}>{p.body}</span>
              </Text>
            ))}
          </div>
        </Section>

        {/* ── CTA Cofounder verde-sálvia sobre creme ── */}
        <Section style={sageCtaSection}>
          <Button href={COFOUNDER_URL} style={sageButton}>
            Quero conhecer o Cofounder
          </Button>
        </Section>

        {/* ── Rodapé cinza-azulado: filete + wordmark/slogan + filete ── */}
        <Section style={footer}>
          <div style={filete} />
          <Text style={footerWordmark}>
            Nexvy<span style={footerWordmarkBeauty}>Beauty</span>
          </Text>
          <Text style={footerSlogan}>
            sua EquipIA para transformar clientes de primeira vez em clientes de
            sempre.
          </Text>
          <div style={filete} />
          <Text style={footerContact}>
            <Link href={INSTAGRAM_URL} style={footerLink}>
              Instagram: @nexvytech
            </Link>
            <br />
            <Link href={WHATSAPP_URL} style={footerLink}>
              WhatsApp: {WHATSAPP_LABEL}
            </Link>
          </Text>
          <Text style={footerCompany}>
            <strong style={footerCompanyName}>NexvyBeauty</strong>
            <br />
            NEXVY TECNOLOGIA E COMUNICAÇÃO LTDA
            <br />
            CNPJ: 64.930.755/0001-78
            <br />
            Av. Brig. Faria Lima, 1572 – Sala 1022 · Jardim Paulistano · São
            Paulo/SP
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WelcomeAdminAccessEmail,
  subject: (data: Record<string, any>) =>
    data.planName
      ? `Bem-vinda ao NexvyBeauty — seu acesso ao ${data.planName} está pronto`
      : 'Bem-vinda ao NexvyBeauty — seu acesso está pronto',
  displayName: 'Boas-vindas — acesso admin (Cakto)',
  previewData: {
    fullName: 'Maria',
    planName: 'Pro',
    email: 'maria@exemplo.com',
    recoveryLink: 'https://app.exemplo.com/reset?token=abc',
  },
} satisfies TemplateEntry

// ── Estilos (fiéis ao design Canva "NexvyBeauty - Boas Vindas") ──────────────
const main = {
  backgroundColor: CREAM,
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: 0,
  padding: 0,
}
const container = {
  maxWidth: '600px',
  margin: '0 auto',
  padding: 0,
  backgroundColor: CREAM,
}

// Hero
const heroSection = { padding: 0, backgroundColor: '#c9a691' }
const heroImg = {
  width: '100%',
  maxWidth: '600px',
  display: 'block',
  border: 0,
  outline: 'none',
}

// Faixa creme (corpo)
const creamBody = {
  backgroundColor: CREAM,
  padding: '34px 32px 26px',
  textAlign: 'center' as const,
}
const lead = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  lineHeight: '24px',
  color: INK,
  margin: '0 0 14px',
}
const text = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  lineHeight: '24px',
  color: INK,
  margin: '0 0 12px',
}
const muted = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  color: '#7d6d71',
  margin: '16px 0 0',
}
const ctaWrap = { textAlign: 'center' as const, margin: '26px 0 4px' }
const pinkButton = {
  backgroundColor: PINK,
  color: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontStyle: 'italic' as const,
  fontWeight: 700,
  fontSize: '15px',
  padding: '15px 34px',
  borderRadius: '999px',
  textDecoration: 'none',
  display: 'inline-block',
}

// Bloco Cofounder (2 colunas híbridas: empilham no mobile)
const cofounderBlock = {
  backgroundColor: '#ffffff',
  padding: 0,
  fontSize: 0,
  textAlign: 'center' as const,
}
const colPhoto = {
  display: 'inline-block',
  width: '100%',
  maxWidth: '288px',
  verticalAlign: 'middle',
}
const cofounderImg = {
  width: '100%',
  maxWidth: '288px',
  display: 'block',
  border: 0,
}
const colContent = {
  display: 'inline-block',
  width: '100%',
  maxWidth: '312px',
  verticalAlign: 'middle',
  padding: '22px 24px',
  boxSizing: 'border-box' as const,
  textAlign: 'left' as const,
}
const cofounderHeading = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '17px',
  fontWeight: 700,
  color: INK,
  margin: '0 0 6px',
}
const cofounderTagline = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontStyle: 'italic' as const,
  fontSize: '13px',
  lineHeight: '18px',
  color: '#5b4e50',
  margin: '0 0 10px',
}
const cofounderIntro = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  lineHeight: '18px',
  color: '#5b4e50',
  margin: '0 0 12px',
}
const pillar = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  lineHeight: '17px',
  color: INK,
  margin: '0 0 10px',
}
const pillarSpark = { color: PINK }
const pillarTitle = { color: INK, fontWeight: 700, fontSize: '13px' }
const pillarBody = { color: '#5b4e50' }

// CTA Cofounder
const sageCtaSection = {
  backgroundColor: CREAM,
  textAlign: 'center' as const,
  padding: '28px 32px',
}
const sageButton = {
  backgroundColor: SAGE,
  color: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontWeight: 600,
  fontSize: '14px',
  padding: '14px 30px',
  borderRadius: '999px',
  textDecoration: 'none',
  display: 'inline-block',
}

// Rodapé
const footer = {
  backgroundColor: FOOTER_BG,
  padding: '28px 24px 30px',
  textAlign: 'center' as const,
}
const filete = {
  borderTop: `1px solid ${INK}`,
  lineHeight: '1px',
  fontSize: '1px',
}
const footerWordmark = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '25px',
  fontWeight: 700,
  lineHeight: '30px',
  color: INK,
  margin: '18px 0 6px',
}
const footerWordmarkBeauty = { fontStyle: 'italic' as const }
const footerSlogan = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  lineHeight: '18px',
  color: '#5b6165',
  margin: '0 0 18px',
}
const footerContact = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  lineHeight: '22px',
  color: INK,
  margin: '18px 0 10px',
}
const footerLink = { color: INK, textDecoration: 'none', fontWeight: 600 }
const footerCompany = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  lineHeight: '17px',
  color: '#4a5054',
  margin: 0,
  textAlign: 'left' as const,
}
const footerCompanyName = { fontSize: '14px', color: INK }
