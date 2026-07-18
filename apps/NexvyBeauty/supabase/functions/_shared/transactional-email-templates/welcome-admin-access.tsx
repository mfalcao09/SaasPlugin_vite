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

const WelcomeAdminAccessEmail = ({
  fullName,
  planName,
  recoveryLink,
  email,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu acesso à sua EquipIA está pronto</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={wordmark}>
            Nexvy<span style={wordmarkAccent}>Beauty</span>
          </Text>
        </Section>
        <Section style={card}>
          <Heading style={h1}>
            Bem-vinda{fullName ? `, ${fullName}` : ''}!
          </Heading>
          <Text style={lead}>
            Sua compra{planName ? ` do plano ${planName}` : ''} está confirmada — e
            a sua EquipIA já está de plantão para trazer suas clientes de volta.
          </Text>
          <Text style={text}>
            Falta um único passo: defina sua senha e faça o primeiro acesso ao
            painel de administradora.
          </Text>
          {recoveryLink ? (
            <Section style={{ textAlign: 'center', margin: '28px 0 8px' }}>
              <Button href={recoveryLink} style={button}>
                Definir minha senha
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
        <Section style={footer}>
          <Text style={footerText}>
            Nexvy<span style={footerAccent}>Beauty</span> — sua EquipIA para
            transformar clientes de primeira vez em clientes de sempre.
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
      ? `Seu acesso ao plano ${data.planName} está pronto`
      : 'Seu acesso de administrador está pronto',
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
const footer = { textAlign: 'center' as const, padding: '24px 16px 8px' }
const footerText = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
  color: '#7d6d71',
  margin: 0,
}
const footerAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
