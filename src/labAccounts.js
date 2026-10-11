import { newLabSessionId } from "./iamApi";

const ACCOUNTS_KEY = "nafath-lab-accounts-v1";

/**
 * In-tab account switcher. Several Nafath users can be logged in at once in the
 * SAME tab. Each account owns its own gateway session id (its own cookie/token
 * jar on the gateway) plus its own wizard step, session, and username. The
 * active account is the one currently shown in the phone UI. State is kept in
 * localStorage so it persists across tabs, reloads, and browser restarts; it is
 * only dropped when an account is logged out explicitly. (Note: the gateway's
 * cookie jars live in memory, so after a gateway restart saved accounts may need
 * to log in again even though they remain in the switcher.)
 *
 * @typedef {{
 *   accountId: string,
 *   labSessionId: string,
 *   session: ({ transId: string, token: string, id: number }) | null,
 *   wizardStep: string,
 *   username: string,
 *   loggedInAt: string | null,
 * }} AccountRecord
 *
 * @typedef {{
 *   order: string[],
 *   byId: Record<string, AccountRecord>,
 *   activeId: string | null,
 * }} AccountsState
 */

function accountStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function newAccountId() {
  try {
    return `acc-${crypto.randomUUID()}`;
  } catch {
    return `acc-${Math.random().toString(36).slice(2)}-${Date.now()}`;
  }
}

/** @returns {AccountRecord} */
export function createAccount() {
  return {
    accountId: newAccountId(),
    labSessionId: newLabSessionId(),
    session: null,
    wizardStep: "welcome",
    username: "",
    loggedInAt: null,
  };
}

/** @returns {AccountsState} */
export function emptyAccounts() {
  return { order: [], byId: {}, activeId: null };
}

/** @returns {AccountsState} */
export function loadAccounts() {
  const store = accountStore();
  if (!store) return emptyAccounts();
  try {
    const raw = store.getItem(ACCOUNTS_KEY);
    if (!raw) return emptyAccounts();
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.order) || typeof parsed.byId !== "object") {
      return emptyAccounts();
    }
    return {
      order: parsed.order.filter((id) => parsed.byId[id]),
      byId: parsed.byId,
      activeId: parsed.byId[parsed.activeId] ? parsed.activeId : parsed.order[0] ?? null,
    };
  } catch {
    return emptyAccounts();
  }
}

/** @param {AccountsState} state */
export function saveAccounts(state) {
  const store = accountStore();
  if (!store) return;
  try {
    store.setItem(ACCOUNTS_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked — ignore in lab */
  }
}

/**
 * Load accounts, seeding one fresh account when none exist yet so the UI always
 * has an active account to render.
 * @returns {AccountsState}
 */
export function initAccounts() {
  const reg = loadAccounts();
  if (reg.order.length && reg.activeId && reg.byId[reg.activeId]) return reg;
  const acc = createAccount();
  const next = { order: [acc.accountId], byId: { [acc.accountId]: acc }, activeId: acc.accountId };
  saveAccounts(next);
  return next;
}

/** Short human label for an account chip. */
export function accountLabel(rec, index) {
  const name = (rec?.username || "").trim();
  if (name) return name;
  if (rec?.session?.token) return `User ${index + 1}`;
  return `New login ${index + 1}`;
}

/** Build the ordered list the switcher renders. */
export function accountSummaries(reg) {
  return reg.order.map((id, index) => {
    const rec = reg.byId[id];
    return {
      accountId: id,
      label: accountLabel(rec, index),
      loggedIn: Boolean(rec?.session?.token),
      wizardStep: rec?.wizardStep ?? "welcome",
    };
  });
}
