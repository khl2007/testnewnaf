const STORAGE_KEY = "nafath-lab-wizard-v1";

/**
 * Per-tab persistence. We use sessionStorage (not localStorage) so each browser
 * tab is an independent logged-in user: its own wizard step, session, and token.
 * This matches the per-tab X-Lab-Session-Id in iamApi.js and the gateway's
 * per-session cookie/token isolation, so multiple accounts can be logged in at
 * once, one per tab. State survives a reload of the same tab and is cleared on
 * logout or when the tab closes.
 */
function labStore() {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** @typedef {{ transId: string, token: string, id: number }} IamSession */

/**
 * @typedef {{
 *   session: IamSession | null,
 *   wizardStep: string,
 *   username: string,
 *   loggedInAt: string | null,
 * }} LabAuthState
 */

/** @returns {LabAuthState | null} */
export function loadLabAuth() {
  const store = labStore();
  if (!store) return null;
  try {
    const raw = store.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** @param {LabAuthState} state */
export function saveLabAuth(state) {
  const store = labStore();
  if (!store) return;
  try {
    store.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — ignore in lab */
  }
}

export function clearLabAuth() {
  const store = labStore();
  if (!store) return;
  store.removeItem(STORAGE_KEY);
}

export const WIZARD_STEPS = ["welcome", "login", "otp", "pin", "face", "requests"];

export function stepIndex(step) {
  const i = WIZARD_STEPS.indexOf(step);
  return i >= 0 ? i : 0;
}

/** Map IAM activation step to wizard step after a successful call. */
export function wizardStepFromActivation(iamStep, activationActionName) {
  if (iamStep === "Otp") return "otp";
  if (activationActionName === "Retry") {
    if (iamStep === "Pin") return "pin";
    if (iamStep === "Face") return "face";
    return "otp";
  }
  if (activationActionName === "Active" || iamStep === "Done") return "requests";
  if (iamStep === "Pin") return "pin";
  if (iamStep === "Face") return "face";
  return null;
}
