import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Máscara de e-mail: 2 primeiros chars do local + ••• + @dominio.
 * Ex.: "claudia@nexvy.tech" → "cl•••@nexvy.tech".
 * Vive aqui (e não dentro do ImplantacaoWizard) porque a etapa final de criação
 * de senha também precisa dela — importar do wizard criaria ciclo de módulos
 * (wizard → step → wizard).
 */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at <= 0) return email;
  return `${email.slice(0, Math.min(2, at))}•••${email.slice(at)}`;
}
