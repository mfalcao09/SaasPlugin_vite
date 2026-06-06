const DEMO_KEY = "gymboss_demo_mode";

export function isDemoMode() {
  return localStorage.getItem(DEMO_KEY) !== "false";
}

export function setDemoMode(value) {
  localStorage.setItem(DEMO_KEY, value ? "true" : "false");
}

export function toggleDemoMode() {
  const current = isDemoMode();
  setDemoMode(!current);
  return !current;
}