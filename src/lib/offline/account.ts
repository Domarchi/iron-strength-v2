const KEY = "is:offline:active-user";
export function activeOfflineAccount(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
export function setOfflineAccount(userId: string | null): boolean {
  try {
    if (userId) localStorage.setItem(KEY, userId);
    else localStorage.removeItem(KEY);
    window.dispatchEvent(new Event("offline-account"));
    return true;
  } catch {
    return false;
  }
}
export function subscribeOfflineAccount(notify: () => void) {
  window.addEventListener("storage", notify);
  window.addEventListener("offline-account", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener("offline-account", notify);
  };
}
