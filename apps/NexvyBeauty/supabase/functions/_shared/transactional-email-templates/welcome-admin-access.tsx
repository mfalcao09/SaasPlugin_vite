/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'
import { Text } from 'npm:@react-email/components@0.0.22'
import {
  BodyText,
  brand,
  Divider,
  EmailShell,
  Eyebrow,
  HighlightBox,
  MutedNote,
  PrimaryButton,
  Title,
} from '../email-brand.tsx'
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
  <EmailShell preview="Seu acesso à sua EquipIA está pronto">
    <Eyebrow>Sua EquipIA está pronta</Eyebrow>
    <Title>Bem-vinda{fullName ? `, ${fullName}` : ''}!</Title>
    <BodyText>
      Sua compra{planName ? ` do plano ${planName}` : ''} está confirmada — e a
      sua EquipIA já está de plantão para trazer suas clientes de volta.
    </BodyText>
    <BodyText>
      Falta um único passo: defina sua senha e faça o primeiro acesso ao painel
      de administradora.
    </BodyText>
    {recoveryLink ? (
      <HighlightBox>
        <Text style={boxLead}>Ative seu acesso agora</Text>
        <PrimaryButton href={recoveryLink} label="Definir minha senha" />
      </HighlightBox>
    ) : (
      <HighlightBox>
        <Text style={boxLead}>
          Use a opção “Esqueci minha senha” na tela de login com o e-mail{' '}
          <strong style={{ color: brand.vinho }}>{email}</strong> para criar sua
          senha de acesso.
        </Text>
      </HighlightBox>
    )}
    <Divider />
    <MutedNote>
      Se você não reconhece esta compra, basta ignorar este e-mail.
    </MutedNote>
  </EmailShell>
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

// ── Estilo local ─────────────────────────────────────────────────────────────
const boxLead = {
  fontFamily: 'Arial, Helvetica, sans-serif',
  fontSize: '15px',
  lineHeight: '23px',
  color: brand.ink,
  margin: '0 0 16px',
}
