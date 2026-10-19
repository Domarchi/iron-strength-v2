// Dominio reservado para fixtures desechables; nunca incluye las cuentas de dev:seed.
export const E2E_EMAIL_DOMAIN = "iron-strength.e2e.test";
export function isE2EAccount(email: string | undefined): boolean {
  return !!email && email.toLowerCase().endsWith(`@${E2E_EMAIL_DOMAIN}`);
}
