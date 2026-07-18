/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Link } from 'npm:@react-email/components@0.0.22'
import {
  BodyText,
  Divider,
  EmailShell,
  Eyebrow,
  HighlightBox,
  linkStyle,
  MutedNote,
  PrimaryButton,
  Title,
} from '../email-brand.tsx'

interface EmailChangeEmailProps {
  siteName: string
  oldEmail: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  oldEmail,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <EmailShell preview={`Confirme a alteração de e-mail no ${siteName}`}>
    <Eyebrow>Confirmação de e-mail</Eyebrow>
    <Title>Confirme seu novo e-mail</Title>
    <BodyText>
      Você solicitou a alteração do e-mail no {siteName} de{' '}
      <Link href={`mailto:${oldEmail}`} style={linkStyle}>
        {oldEmail}
      </Link>{' '}
      para{' '}
      <Link href={`mailto:${newEmail}`} style={linkStyle}>
        {newEmail}
      </Link>
      .
    </BodyText>
    <HighlightBox>
      <PrimaryButton href={confirmationUrl} label="Confirmar alteração" />
    </HighlightBox>
    <Divider />
    <MutedNote>
      Se você não solicitou esta alteração, proteja sua conta imediatamente.
    </MutedNote>
  </EmailShell>
)

export default EmailChangeEmail
