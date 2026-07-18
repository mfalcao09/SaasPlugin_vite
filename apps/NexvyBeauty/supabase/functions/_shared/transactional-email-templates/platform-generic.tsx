/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'
import { Divider, EmailShell } from '../email-brand.tsx'
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
  <EmailShell preview={__preview ?? __subject}>
    <div dangerouslySetInnerHTML={{ __html }} />
    <Divider />
  </EmailShell>
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
