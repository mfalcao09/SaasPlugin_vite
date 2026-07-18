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

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({ siteName, siteUrl, confirmationUrl }: InviteEmailProps) => (
  <EmailShell preview={`Você foi convidada para o ${siteName}`}>
    <Eyebrow>Você foi convidada</Eyebrow>
    <Title>Um convite para você</Title>
    <BodyText>
      Você recebeu um convite para fazer parte do{' '}
      <Link href={siteUrl} style={linkStyle}>
        <strong>{siteName}</strong>
      </Link>
      . Toque no botão abaixo para aceitar e criar sua conta.
    </BodyText>
    <HighlightBox>
      <PrimaryButton href={confirmationUrl} label="Aceitar convite" />
    </HighlightBox>
    <Divider />
    <MutedNote>
      Se você não esperava este convite, pode ignorar este e-mail com segurança.
    </MutedNote>
  </EmailShell>
)

export default InviteEmail
