/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import {
  BodyText,
  CodeChip,
  Divider,
  EmailShell,
  Eyebrow,
  MutedNote,
  Title,
} from '../email-brand.tsx'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <EmailShell preview="Seu código de verificação">
    <Eyebrow>Código de verificação</Eyebrow>
    <Title>Confirme sua identidade</Title>
    <BodyText>
      Use o código abaixo para confirmar sua identidade e concluir o acesso:
    </BodyText>
    <CodeChip code={token} />
    <Divider />
    <MutedNote>
      Este código expira em alguns minutos. Se você não solicitou, ignore este
      e-mail.
    </MutedNote>
  </EmailShell>
)

export default ReauthenticationEmail
