/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Você foi convidado para o {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={wordmark}>
            Nexvy<span style={wordmarkAccent}>Beauty</span>
          </Text>
        </Section>
        <Section style={card}>
          <Heading style={h1}>Você foi convidada!</Heading>
          <Text style={text}>
            Você recebeu um convite para participar do{' '}
            <Link href={siteUrl} style={link}><strong>{siteName}</strong></Link>.
            Clique no botão abaixo para aceitar e criar sua conta.
          </Text>
          <Section style={btnWrap}>
            <Button style={button} href={confirmationUrl}>
              Aceitar convite
            </Button>
          </Section>
          <Text style={footer}>
            Se você não esperava este convite, pode ignorar este e-mail com segurança.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

// ── Estilo da marca NexvyBeauty (LP "Clientes de Volta") ─────────────────────
const main = { backgroundColor: '#faf7f2', fontFamily: 'Arial, Helvetica, sans-serif', margin: 0, padding: 0 }
const container = { maxWidth: '600px', margin: '0 auto', padding: '32px 20px' }
const header = { textAlign: 'center' as const, padding: '8px 0 20px' }
const wordmark = { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '26px', fontWeight: 700, color: '#2a2124', letterSpacing: '0.3px', margin: 0 }
const wordmarkAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
const card = { backgroundColor: '#ffffff', border: '1px solid #e5d9d0', borderRadius: '16px', padding: '36px 32px' }
const h1 = { fontFamily: "Georgia, 'Times New Roman', serif", fontSize: '22px', fontWeight: 700, color: '#2a2124', margin: '0 0 16px' }
const text = { fontFamily: 'Arial, Helvetica, sans-serif', fontSize: '15px', lineHeight: '24px', color: '#2a2124', margin: '0 0 20px' }
const link = { color: '#7c0f24', textDecoration: 'underline' }
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
