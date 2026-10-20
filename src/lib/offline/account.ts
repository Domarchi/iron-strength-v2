let memoryAccount: string | null = null;
const KEY = "is:offline:active-user";
export function activeOfflineAccount(): string | null {
  try {
    const value = localStorage.getItem(KEY);
    memoryAccount = value;
    return value;
  } catch {
    return memoryAccount;
  }
}
export function setOfflineAccount(userId: string | null): boolean {
  try {
    if (userId) localStorage.setItem(KEY, userId);
    else localStorage.removeItem(KEY);
    memoryAccount = userId;
    window.dispatchEvent(new Event("offline-account"));
    return true;
  } catch {
    if (userId) {
      memoryAccount = userId;
      window.dispatchEvent(new Event("offline-account"));
    }
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
