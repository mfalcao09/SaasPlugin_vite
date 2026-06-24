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

// Disparado por `affiliate-admin` (ação create_affiliate), espelhando o
// onboarding de admin: generateLink({type:'recovery'}) -> send-transactional-email.
// templateData consumido EXATAMENTE como o affiliate-admin envia: { fullName, recoveryLink, email }.
interface Props {
  fullName?: string | null
  recoveryLink?: string | null
  email?: string | null
}

const AffiliateWelcomeAccessEmail = ({
  fullName,
  recoveryLink,
  email,
}: Props) => (
  <Html lang="pt-BR" dir="ltr">
    <Head />
    <Preview>Seu acesso ao portal de afiliados está pronto</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          Bem-vindo(a) ao programa de afiliados{fullName ? `, ${fullName}` : ''}!
        </Heading>
        <Text style={text}>
          Cadastramos você como afiliado(a) da NexvyBeauty. A partir de agora
          você pode gerar seus links, acompanhar as indicações e visualizar suas
          comissões direto no portal do afiliado.
        </Text>
        <Text style={text}>
          Para definir sua senha e entrar pela primeira vez, clique no botão
          abaixo:
        </Text>
        {recoveryLink ? (
          <Section style={{ textAlign: 'center', margin: '24px 0' }}>
            <Button href={recoveryLink} style={button}>
              Definir minha senha
            </Button>
          </Section>
        ) : (
          <Text style={text}>
            Use a opção "Esqueci minha senha" na tela de login com o e-mail
            <strong> {email}</strong> para criar sua senha de acesso.
          </Text>
        )}
        <Text style={text}>
          Depois de entrar, acesse o portal em <strong>/afiliado</strong> para
          pegar seu link de divulgação e acompanhar tudo em tempo real.
        </Text>
        <Hr style={hr} />
        <Text style={muted}>
          Se você não esperava este convite, basta ignorar este e-mail.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AffiliateWelcomeAccessEmail,
  subject: 'Seu acesso ao portal de afiliados NexvyBeauty está pronto',
  displayName: 'Boas-vindas — acesso afiliado',
  previewData: {
    fullName: 'Camila',
    email: 'camila@exemplo.com',
    recoveryLink: 'https://app.exemplo.com/reset?token=abc',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: 'Inter, Arial, sans-serif',
  margin: 0,
  padding: 0,
}
const container = { padding: '32px 28px', maxWidth: '600px', margin: '0 auto' }
const h1 = { fontSize: '22px', fontWeight: 700, color: '#111827', margin: '0 0 16px' }
const text = { fontSize: '15px', lineHeight: '24px', color: '#374151', margin: '0 0 12px' }
const muted = { fontSize: '13px', color: '#6b7280', margin: '12px 0 0' }
const hr = { borderColor: '#e5e7eb', margin: '28px 0' }
const button = {
  backgroundColor: '#111827',
  color: '#ffffff',
  padding: '12px 22px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
