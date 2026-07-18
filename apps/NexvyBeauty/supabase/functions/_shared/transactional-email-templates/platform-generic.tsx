/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Html,
  Preview,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface PlatformGenericProps {
  __subject?: string
  __html?: string
  __preview?: string
}

const PlatformGenericEmail = ({
  __subject = 'Notificação',
  __html = '<p>Sem conteúdo.</p>',
  __preview,
}: PlatformGenericProps) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>{__preview ?? __subject}</Preview>
    <Body style={main}>
      <Container style={container}>
        <div style={header}>
          <span style={wordmark}>
            Nexvy<span style={wordmarkAccent}>Beauty</span>
          </span>
        </div>
        <div style={card}>
          <div dangerouslySetInnerHTML={{ __html }} />
        </div>
        <div style={footer}>
          <p style={footerText}>
            Nexvy<span style={footerAccent}>Beauty</span> — sua EquipIA para
            transformar clientes de primeira vez em clientes de sempre.
          </p>
          <p style={footerMuted}>
            © {new Date().getFullYear()} NexvyBeauty. Todos os direitos reservados.
          </p>
        </div>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: PlatformGenericEmail,
  subject: (data: Record<string, any>) => data.__subject || 'Notificação',
  displayName: 'Template genérico (HTML do painel)',
  previewData: {
    __subject: 'Pré-visualização',
    __html:
      '<h1 style="font-family:Georgia,\'Times New Roman\',serif;font-size:22px;font-weight:700;color:#2a2124;margin:0 0 16px">Olá!</h1><p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;color:#2a2124;margin:0 0 12px">Este é um email da plataforma.</p>',
  },
} satisfies TemplateEntry

// ── Estilo da marca NexvyBeauty (LP "Clientes de Volta") ─────────────────────
// Hex inline (clientes de e-mail removem <style>/var()); serif Georgia p/ marca.
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
}
const wordmarkAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
const card = {
  backgroundColor: '#ffffff',
  border: '1px solid #e5d9d0',
  borderRadius: '16px',
  padding: '36px 32px',
}
const footer = { textAlign: 'center' as const, padding: '24px 16px 8px' }
const footerText = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '13px',
  lineHeight: '20px',
  color: '#7d6d71',
  margin: '0 0 6px',
}
const footerAccent = { fontStyle: 'italic' as const, color: '#7c0f24' }
const footerMuted = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '12px',
  color: '#7d6d71',
  margin: 0,
}
