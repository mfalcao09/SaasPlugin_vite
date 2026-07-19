/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
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
        <Section style={header}>
          <Text style={wordmark}>
            Nexvy<span style={wordmarkAccent}>Beauty</span>
          </Text>
        </Section>

        {/* ── Bloco transacional (ação primária: definir senha / 1º acesso) ── */}
        <Section style={card}>
          <Heading style={h1}>
            Bem-vinda{fullName ? `, ${fullName}` : ''}! Um novo tempo começou.
          </Heading>
          <Text style={lead}>
            Estamos muito felizes em ter você no universo NexvyBeauty! Sua compra
            {planName ? ` do plano ${planName}` : ''} está confirmada — e agora
            começa o seu onboarding, acompanhado pela sua EquipIA (sim, também
            temos a nossa!).
          </Text>
          <Text style={text}>
            Nosso desejo é ajudar você a trazer suas clientes de volta,
            fidelizá-las e atendê-las com qualidade e agilidade no dia a dia.
            Falta um único passo: defina sua senha e faça o primeiro acesso ao seu
            painel.
          </Text>
          {recoveryLink ? (
            <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
              <Button href={recoveryLink} style={button}>
                Começar meu onboarding
              </Button>
            </Section>
          ) : (
            <Text style={text}>
              Use a opção “Esqueci minha senha” na tela de login com o e-mail
              <strong> {email}</strong> para criar sua senha de acesso.
            </Text>
          )}
          <Hr style={hr} />
          <Text style={muted}>
            Se você não reconhece esta compra, basta ignorar este e-mail.
          </Text>
        </Section>

        {/* ── Card Cofounder (secundário, "outra esteira": mentoria) ── */}
        <Section style={cofounderCard}>
          <Text style={eyebrow}>Programa Cofounder</Text>
          <Heading style={cofounderTitle}>
            Mais do que um sistema: um lugar ao seu lado.
          </Heading>
          <Text style={cofounderIntro}>
            Para um grupo pequeno de fundadoras, o Cofounder é mentoria individual
            para destravar o seu negócio de dentro pra fora:
          </Text>
          {COFOUNDER_PILLARS.map((p) => (
            <Text key={p.title} style={pillar}>
              <span style={pillarSpark}>✨</span>{' '}
              <strong style={pillarTitle}>{p.title}</strong>
              <br />
              <span style={pillarBody}>{p.body}</span>
            </Text>
          ))}
          <Section style={{ textAlign: 'center', margin: '22px 0 4px' }}>
            <Button href={COFOUNDER_URL} style={cofounderButton}>
              Quero conhecer o Cofounder
            </Button>
          </Section>
        </Section>

        {/* ── Rodapé (marca + contato + dados fiscais) ── */}
        <Section style={footer}>
          <Text style={footerBrand}>
            Nexvy<span style={footerAccent}>Beauty</span> — sua EquipIA para
            transformar clientes de primeira vez em clientes de sempre.
          </Text>
          <Text style={footerText}>
            <Link href={INSTAGRAM_URL} style={footerLink}>
              Instagram @nexvytech
            </Link>
            {'  ·  '}
            <Link href={WHATSAPP_URL} style={footerLink}>
              WhatsApp {WHATSAPP_LABEL}
            </Link>
          </Text>
          <Text style={footerFiscal}>
            NEXVY TECNOLOGIA E COMUNICAÇÃO LTDA · CNPJ 64.930.755/0001-78
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

// ── Estilo da marca NexvyBeauty (LP "Clientes de Volta") ─────────────────────
const main = {
  backgroundColor: '#faf7f2',
  fontFamily: 'Arial, Helvetica, sans-serif',
  margin: 0,
  padding: 0,
}
const container = { maxWidth: '600px', margin: '0 auto', padding: '32px 20px' }
const header = { textAlign: 'center' as const, padding: '8px 0 20px' }
const wordmark = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '26px',
  fontWeight: 700,
  color: '#2a2124',
  letterSpacing: '0.3px',
  margin: 0,
}
const wordmarkAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5d9d0',
  borderRadius: '16px',
  padding: '36px 32px',
}
const h1 = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '24px',
  fontWeight: 700,
  color: '#2a2124',
  lineHeight: '32px',
  margin: '0 0 16px',
}
const lead = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '16px',
  lineHeight: '25px',
  color: '#2a2124',
  margin: '0 0 14px',
}
const text = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  lineHeight: '24px',
  color: '#2a2124',
  margin: '0 0 12px',
}
const muted = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  color: '#7d6d71',
  margin: '12px 0 0',
}
const hr = { borderColor: '#e5d9d0', margin: '28px 0' }
const button = {
  backgroundColor: '#7c0f24',
  color: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  padding: '16px 30px',
  borderRadius: '12px',
  fontSize: '15px',
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block',
}

// ── Card Cofounder (secundário) ──────────────────────────────────────────────
const cofounderCard = {
  backgroundColor: '#f6ece7',
  border: '1px solid #e7d5cc',
  borderRadius: '16px',
  padding: '30px 28px',
  margin: '20px 0 0',
}
const eyebrow = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  fontWeight: 700,
  letterSpacing: '1.4px',
  textTransform: 'uppercase' as const,
  color: '#7c0f24',
  margin: '0 0 8px',
}
const cofounderTitle = {
  fontFamily: "Georgia, 'Times New Roman', serif",
  fontSize: '20px',
  fontWeight: 700,
  color: '#2a2124',
  lineHeight: '27px',
  margin: '0 0 12px',
}
const cofounderIntro = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  lineHeight: '23px',
  color: '#2a2124',
  margin: '0 0 18px',
}
const pillar = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '14px',
  lineHeight: '21px',
  color: '#2a2124',
  margin: '0 0 14px',
}
const pillarSpark = { color: '#b0563a' }
const pillarTitle = { color: '#2a2124', fontWeight: 700 }
const pillarBody = { color: '#5b4e50' }
const cofounderButton = {
  backgroundColor: '#b0563a',
  color: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  padding: '13px 26px',
  borderRadius: '12px',
  fontSize: '14px',
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block',
}

// ── Rodapé ───────────────────────────────────────────────────────────────────
const footer = { textAlign: 'center' as const, padding: '24px 16px 8px' }
const footerBrand = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
  color: '#7d6d71',
  margin: '0 0 12px',
}
const footerAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
const footerText = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
  color: '#7d6d71',
  margin: '0 0 10px',
}
const footerLink = { color: '#7c0f24', textDecoration: 'none', fontWeight: 700 }
const footerFiscal = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '11px',
  lineHeight: '17px',
  color: '#9a8c8f',
  margin: 0,
}
