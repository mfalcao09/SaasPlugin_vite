/** Produto cadeado — Camila Harness (PRD-13). */
export const HARNESS_LOCKED_PRODUCT_ID =
  "806b5975-e268-402e-a65c-9e9503271041";

export function isHarnessLockedProduct(
  productId: string | null | undefined,
  envGet?: (k: string) => string | undefined,
): boolean {
  const id = String(productId ?? "").trim();
  if (!id) return false;
  if (id === HARNESS_LOCKED_PRODUCT_ID) return true;
  const get = envGet ?? ((k: string) => {
    try {
      return typeof Deno !== "undefined" ? Deno.env.get(k) : undefined;
    } catch {
      return undefined;
    }
  });
  const env = String(get("HARNESS_PILOT_PRODUCT_ID") ?? "").trim();
  return Boolean(env && env === id);
}
