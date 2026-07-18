/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu código de verificação</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={wordmark}>
            Nexvy<span style={wordmarkAccent}>Beauty</span>
          </Text>
        </Section>
        <Section style={card}>
          <Heading style={h1}>Confirme sua identidade</Heading>
          <Text style={text}>Use o código abaixo para confirmar sua identidade:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Text style={footer}>
            Este código expira em alguns minutos. Se você não solicitou, ignore este e-mail.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

// ── Estilo da marca NexvyBeauty (LP "Clientes de Volta") ─────────────────────
const main = { backgroundColor: '#faf7f2', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '600px', margin: '0 auto', padding: '32px 20px' }
const header = { textAlign: 'center' as const, padding: '8px 0 20px' }
const wordmark = { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '26px', fontWeight: 700, color: '#2a2124', letterSpacing: '0.3px', margin: 0 }
const wordmarkAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
const card = { backgroundColor: '#ffffff', border: '1px solid #e5d9d0', borderRadius: '16px', padding: '36px 32px', textAlign: 'center' as const }
const h1 = { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '22px', fontWeight: 700, color: '#2a2124', margin: '0 0 16px' }
const text = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '15px', lineHeight: '24px', color: '#2a2124', margin: '0 0 20px' }
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '30px',
  fontWeight: 700,
  color: '#7c0f24',
  letterSpacing: '6px',
  margin: '0 0 24px',
}
const footer = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '13px', color: '#7d6d71', margin: '20px 0 0' }
