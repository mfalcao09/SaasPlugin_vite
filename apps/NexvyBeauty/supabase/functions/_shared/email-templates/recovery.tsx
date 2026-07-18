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

interface RecoveryEmailProps {
  siteName: string
  confirmationUrl: string
}

export const RecoveryEmail = ({ siteName, confirmationUrl }: RecoveryEmailProps) => (
  <EmailShell preview={`Redefinir sua senha do ${siteName}`}>
    <Eyebrow>Segurança da sua conta</Eyebrow>
    <Title>Redefinir sua senha</Title>
    <BodyText>
      Recebemos uma solicitação para redefinir a senha da sua conta no {siteName}.
      É rápido: toque no botão abaixo para escolher uma nova senha.
    </BodyText>
    <HighlightBox>
      <PrimaryButton href={confirmationUrl} label="Redefinir senha" />
    </HighlightBox>
    <Divider />
    <MutedNote>
      Se você não solicitou esta redefinição, pode ignorar este e-mail com
      tranquilidade — sua senha continuará a mesma.
    </MutedNote>
  </EmailShell>
)

export default RecoveryEmail
