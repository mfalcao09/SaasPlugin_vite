/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { BodyText, EmailShell, Eyebrow, MutedNote, Title } from '../email-brand.tsx'
import type { TemplateEntry } from './registry.ts'

const TestEmail = () => (
  <EmailShell preview="Teste de envio - NexvyBeauty">
    <Eyebrow>Teste de envio</Eyebrow>
    <Title>Tudo certo por aqui 🌸</Title>
    <BodyText>
      Este é um e-mail de teste enviado pela plataforma Nexvy Beauty. Se você
      recebeu, a infraestrutura de envio está funcionando perfeitamente.
    </BodyText>
    <MutedNote>Nexvy Beauty — {new Date().getFullYear()}</MutedNote>
  </EmailShell>
)

export const template = {
  component: TestEmail,
  subject: 'Teste de envio - NexvyBeauty',
  displayName: 'Email de teste',
  previewData: {},
} satisfies TemplateEntry
