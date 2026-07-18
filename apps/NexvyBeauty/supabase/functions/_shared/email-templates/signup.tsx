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

interface SignupEmailProps {
  siteName: string
  siteUrl: string
  recipient: string
  confirmationUrl: string
}

export const SignupEmail = ({
  siteName,
  recipient,
  confirmationUrl,
}: SignupEmailProps) => (
  <EmailShell preview={`Confirme seu e-mail no ${siteName}`}>
    <Eyebrow>Boas-vindas</Eyebrow>
    <Title>Bem-vinda ao {siteName}!</Title>
    <BodyText>
      Que alegria ter você aqui. Para começar a usar a plataforma, confirme o
      e-mail{' '}
      <Link href={`mailto:${recipient}`} style={linkStyle}>
        {recipient}
      </Link>{' '}
      tocando no botão abaixo.
    </BodyText>
    <HighlightBox>
      <PrimaryButton href={confirmationUrl} label="Confirmar e-mail" />
    </HighlightBox>
    <Divider />
    <MutedNote>
      Se você não criou uma conta no {siteName}, pode ignorar este e-mail com
      segurança.
    </MutedNote>
  </EmailShell>
)

export default SignupEmail
