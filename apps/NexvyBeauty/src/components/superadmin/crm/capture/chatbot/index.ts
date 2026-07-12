// CRM de PLATAFORMA (super_admin) — barrel do ChatBot (C4), DESACOPLADO do tenant.
// Superfície própria de chatbot (porte 1:1 de admin/capture/chatbot/*), só funis de
// channel_type === 'chatbot'. Ponto de entrada consumido pelo registry (menu v-chatbot).
export { PlatformCrmChatBotManager } from './PlatformCrmChatBotManager';
export { PlatformCrmChatBotBuilder } from './PlatformCrmChatBotBuilder';
