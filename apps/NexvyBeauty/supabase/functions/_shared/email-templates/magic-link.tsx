/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  BodyText,
  Divider,
  EmailShell,
  Eyebrow,
  HighlightBox,
  MutedNote,
  PrimaryButton,
  Title,
} from '../email-brand.tsx'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({ siteName, confirmationUrl }: MagicLinkEmailProps) => (
  <EmailShell preview={`Seu link de acesso ao ${siteName}`}>
    <Eyebrow>Acesso rápido</Eyebrow>
    <Title>Seu link de acesso</Title>
    <BodyText>
      Toque no botão abaixo para entrar no {siteName}. Por segurança, este link
      expira em alguns minutos.
    </BodyText>
    <HighlightBox>
      <PrimaryButton href={confirmationUrl} label="Entrar na plataforma" />
    </HighlightBox>
    <Divider />
    <MutedNote>Se você não solicitou este link, pode ignorar este e-mail.</MutedNote>
  </EmailShell>
)

export default MagicLinkEmail
