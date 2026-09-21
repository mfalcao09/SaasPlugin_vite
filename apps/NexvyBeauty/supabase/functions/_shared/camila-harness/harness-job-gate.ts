// Corte B — webhook só grava; cérebro exige job neste produto.
import {
  parseHarnessJob,
  type HarnessJobRecord,
} from "./harness-puller.ts";
import { isHarnessLockedProduct } from "./harness-product.ts";

export function shouldDispatchSalesBrainFromWebhook(input: {
  productId: string | null | undefined;
  envGet?: (k: string) => string | undefined;
}): { dispatch: boolean; reason: string } {
  if (isHarnessLockedProduct(input.productId, input.envGet)) {
    return { dispatch: false, reason: "harness_webhook_record_only" };
  }
  return { dispatch: true, reason: "other_product" };
}

export function harnessBrainJobGate(input: {
  productId: string | null | undefined;
  bodyJobId?: string | null;
  storedJob?: unknown;
  continuation?: boolean;
  envGet?: (k: string) => string | undefined;
}): { allowed: boolean; reason: string; job: HarnessJobRecord | null } {
  if (!isHarnessLockedProduct(input.productId, input.envGet)) {
    return { allowed: true, reason: "not_harness_product", job: null };
  }
  const job = parseHarnessJob(input.storedJob);
  if (!job) {
    return { allowed: false, reason: "harness_job_required", job: null };
  }
  if (input.continuation) {
    if (
      job.status === "ready" ||
      job.status === "in_flight" ||
      job.status === "done"
    ) {
      return { allowed: true, reason: "harness_job_continuation", job };
    }
    return { allowed: false, reason: "harness_job_required", job };
  }
  const bodyId = String(input.bodyJobId ?? "").trim();
  if (
    bodyId &&
    bodyId === job.id &&
    (job.status === "ready" || job.status === "in_flight")
  ) {
    return { allowed: true, reason: "harness_job_ok", job };
  }
  return { allowed: false, reason: "harness_job_required", job };
}

export function coldShouldClassifyText(
  productId: string | null | undefined,
  envGet?: (k: string) => string | undefined,
): boolean {
  return !isHarnessLockedProduct(productId, envGet);
}
