import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const manifestUrl = new URL(
  "../tasks/GO-LIVE-AGENT-MANIFEST.json",
  import.meta.url,
);
const manifestPath = fileURLToPath(manifestUrl);
const errors = [];

function check(condition, message) {
  if (!condition) errors.push(message);
}

let manifest;
try {
  manifest = JSON.parse(readFileSync(manifestUrl, "utf8"));
} catch (error) {
  console.error(`FAIL: cannot parse ${manifestPath}`);
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

check(manifest.version === 1, "version must be 1");
check(
  manifest.base?.branch === "origin/main",
  "base.branch must be origin/main",
);
check(
  /^[0-9a-f]{7}([0-9a-f]{33})?$/.test(manifest.base?.planningSha ?? ""),
  "base.planningSha must be a 7- or 40-character Git SHA",
);
check(
  manifest.defaults?.maxIterations === 2,
  "defaults.maxIterations must be 2",
);
check(
  Number.isInteger(manifest.defaults?.evidenceMaxAgeMinutes) &&
    manifest.defaults.evidenceMaxAgeMinutes > 0,
  "defaults.evidenceMaxAgeMinutes must be a positive integer",
);
check(
  manifest.defaults?.requireFreshBaseBeforeVerify === true,
  "fresh-base verification must be required",
);
check(
  manifest.defaults?.requireDistinctExecutorVerifierReviewer === true,
  "role separation must be required",
);

const roleNames = new Set(Object.keys(manifest.roles ?? {}));
const lifecycleStates = new Set(manifest.lifecycle?.states ?? []);
const dynamicActors = new Set([
  "stage.roles.executor",
  "stage.roles.verifier",
  "stage.roles.reviewer",
  "stage.roles.approver",
]);

check(roleNames.size >= 6, "at least six named roles are required");
check(lifecycleStates.has("backlog"), "lifecycle must include backlog");
check(lifecycleStates.has("done"), "lifecycle must include done");
check(lifecycleStates.has("escalated"), "lifecycle must include escalated");

for (const transition of manifest.lifecycle?.transitions ?? []) {
  check(
    lifecycleStates.has(transition.from),
    `transition has unknown from state: ${transition.from}`,
  );
  check(
    lifecycleStates.has(transition.to),
    `transition has unknown to state: ${transition.to}`,
  );
  check(
    roleNames.has(transition.actor) || dynamicActors.has(transition.actor),
    `transition has unknown actor: ${transition.actor}`,
  );
  check(
    typeof transition.guard === "string" && transition.guard.length > 0,
    `transition ${transition.from}->${transition.to} needs a guard`,
  );
}

const stages = manifest.stages ?? [];
const stageById = new Map(stages.map((stage) => [stage.id, stage]));
const stageIds = new Set(stages.map((stage) => stage.id));
check(stages.length === 10, "manifest must define exactly stages E0-E9");
check(stageIds.size === stages.length, "stage IDs must be unique");

const terminalStates = new Set(["done", "escalated"]);
for (const state of lifecycleStates) {
  const hasIncoming = (manifest.lifecycle?.transitions ?? []).some(
    (transition) => transition.to === state,
  );
  const hasOutgoing = (manifest.lifecycle?.transitions ?? []).some(
    (transition) => transition.from === state,
  );
  if (state !== "backlog") {
    check(hasIncoming, `lifecycle state ${state} has no incoming transition`);
  }
  if (!terminalStates.has(state)) {
    check(hasOutgoing, `lifecycle state ${state} has no outgoing transition`);
  }
}

for (const expectedId of Array.from({ length: 10 }, (_, index) => `E${index}`)) {
  check(stageIds.has(expectedId), `missing stage ${expectedId}`);
}

for (const stage of stages) {
  const prefix = stage.id ?? "<missing-id>";

  check(
    stage.id === "E0"
      ? stage.initialState === "delivered"
      : stage.initialState === "backlog",
    `${prefix}: initialState must be delivered for E0 and backlog otherwise`,
  );
  check(
    Array.isArray(stage.dependsOn),
    `${prefix}: dependsOn must be an array`,
  );
  for (const dependency of stage.dependsOn ?? []) {
    check(stageIds.has(dependency), `${prefix}: unknown dependency ${dependency}`);
    check(dependency !== stage.id, `${prefix}: cannot depend on itself`);
  }

  check(
    stage.pr?.base === "origin/main",
    `${prefix}: PR base must be origin/main`,
  );
  check(
    typeof stage.pr?.title === "string" && stage.pr.title.length > 0,
    `${prefix}: PR title is required`,
  );

  const roles = stage.roles ?? {};
  for (const role of ["executor", "verifier", "reviewer", "approver"]) {
    check(
      roleNames.has(roles[role]),
      `${prefix}: unknown ${role} role ${roles[role]}`,
    );
  }
  check(
    new Set([roles.executor, roles.verifier, roles.reviewer]).size === 3,
    `${prefix}: executor, verifier and reviewer must be distinct`,
  );

  check(
    Array.isArray(stage.resources) && stage.resources.length > 0,
    `${prefix}: at least one claimed resource is required`,
  );
  check(
    Array.isArray(stage.deliverables) && stage.deliverables.length > 0,
    `${prefix}: at least one deliverable is required`,
  );
  check(
    Array.isArray(stage.acceptance) && stage.acceptance.length > 0,
    `${prefix}: at least one acceptance criterion is required`,
  );

  const criterionIds = new Set();
  for (const criterion of stage.acceptance ?? []) {
    check(
      typeof criterion.id === "string" && criterion.id.length > 0,
      `${prefix}: acceptance criterion needs an ID`,
    );
    check(
      !criterionIds.has(criterion.id),
      `${prefix}: duplicate acceptance ID ${criterion.id}`,
    );
    criterionIds.add(criterion.id);
    check(
      criterion.binary === true,
      `${prefix}/${criterion.id}: criterion must be binary`,
    );
    check(
      typeof criterion.assertion === "string" &&
        criterion.assertion.length > 0,
      `${prefix}/${criterion.id}: assertion is required`,
    );
    check(
      typeof criterion.evidence === "string" && criterion.evidence.length > 0,
      `${prefix}/${criterion.id}: evidence is required`,
    );
  }

  check(
    typeof stage.rollback?.trigger === "string" &&
      stage.rollback.trigger.length > 0,
    `${prefix}: rollback trigger is required`,
  );
  check(
    typeof stage.rollback?.action === "string" &&
      stage.rollback.action.length > 0,
    `${prefix}: rollback action is required`,
  );

  if (roles.approver === "Marcelo") {
    check(stage.humanGate != null, `${prefix}: Marcelo approval needs humanGate`);
    check(
      stage.humanGate?.approver === "Marcelo",
      `${prefix}: humanGate approver must be Marcelo`,
    );
    check(
      typeof stage.humanGate?.requiredBefore === "string" &&
        stage.humanGate.requiredBefore.length > 0,
      `${prefix}: humanGate.requiredBefore is required`,
    );
    check(
      typeof stage.humanGate?.action === "string" &&
        stage.humanGate.action.length > 0,
      `${prefix}: humanGate.action is required`,
    );
  }
}

function visit(stageId, visiting, visited) {
  if (visited.has(stageId)) return;
  if (visiting.has(stageId)) {
    errors.push(`dependency cycle detected at ${stageId}`);
    return;
  }

  visiting.add(stageId);
  const stage = stageById.get(stageId);
  for (const dependency of stage?.dependsOn ?? []) {
    visit(dependency, visiting, visited);
  }
  visiting.delete(stageId);
  visited.add(stageId);
}

const visited = new Set();
for (const stageId of stageIds) {
  visit(stageId, new Set(), visited);
}

const reverseDependencies = new Map(
  stages.map((stage) => [stage.id, []]),
);
for (const stage of stages) {
  for (const dependency of stage.dependsOn ?? []) {
    reverseDependencies.get(dependency)?.push(stage.id);
  }
}

function reachesFinal(stageId, seen = new Set()) {
  if (stageId === "E9") return true;
  if (seen.has(stageId)) return false;
  seen.add(stageId);
  return (reverseDependencies.get(stageId) ?? []).some((dependent) =>
    reachesFinal(dependent, seen)
  );
}

for (const stageId of stageIds) {
  check(reachesFinal(stageId), `${stageId}: no dependency path reaches E9`);
}

check(
  Array.isArray(manifest.globalStopCriteria) &&
    manifest.globalStopCriteria.length >= 5,
  "at least five global stop criteria are required",
);

if (errors.length > 0) {
  console.error(
    `FAIL: ${errors.length} manifest validation error${
      errors.length === 1 ? "" : "s"
    }`,
  );
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

const acceptanceCount = stages.reduce(
  (total, stage) => total + stage.acceptance.length,
  0,
);
const humanGateCount = stages.filter((stage) => stage.humanGate).length;
console.log(
  `PASS: ${stages.length} stages, ${acceptanceCount} binary criteria, ` +
    `${humanGateCount} human gates, acyclic DAG, all paths reach E9`,
);
