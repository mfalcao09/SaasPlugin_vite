/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu link de acesso ao {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={wordmark}>
            Nexvy<span style={wordmarkAccent}>Beauty</span>
          </Text>
        </Section>
        <Section style={card}>
          <Heading style={h1}>Seu link de acesso</Heading>
          <Text style={text}>
            Clique no botão abaixo para acessar o {siteName}. Este link expira em alguns minutos.
          </Text>
          <Section style={btnWrap}>
            <Button style={button} href={confirmationUrl}>
              Entrar
            </Button>
          </Section>
          <Text style={footer}>
            Se você não solicitou este link, pode ignorar este e-mail.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

// ── Estilo da marca NexvyBeauty (LP "Clientes de Volta") ─────────────────────
const main = { backgroundColor: '#faf7f2', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '600px', margin: '0 auto', padding: '32px 20px' }
const header = { textAlign: 'center' as const, padding: '8px 0 20px' }
const wordmark = { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '26px', fontWeight: 700, color: '#2a2124', letterSpacing: '0.3px', margin: 0 }
const wordmarkAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
const card = { backgroundColor: '#ffffff', border: '1px solid #e5d9d0', borderRadius: '16px', padding: '36px 32px' }
const h1 = { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '22px', fontWeight: 700, color: '#2a2124', margin: '0 0 16px' }
const text = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '15px', lineHeight: '24px', color: '#2a2124', margin: '0 0 20px' }
const btnWrap = { textAlign: 'center' as const, margin: '4px 0 20px' }
const button = {
  backgroundColor: '#7c0f24',
  color: '#ffffff',
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  fontWeight: 700,
  borderRadius: '12px',
  padding: '16px 30px',
  textDecoration: 'none',
  display: 'inline-block',
}
const footer = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', color: '#7d6d71', margin: '20px 0 0' }
