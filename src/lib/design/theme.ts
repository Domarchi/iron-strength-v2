export const THEME_KEY = "is:theme:v1";
export type ThemePreference = "light" | "dark" | "system";
export function normalizeThemePreference(value: unknown): ThemePreference {
  return value === "light" || value === "dark" ? value : "system";
}
export function persistThemePreference(
  storage: Pick<Storage, "getItem" | "setItem">,
  value: ThemePreference,
): boolean {
  try {
    storage.setItem(THEME_KEY, value);
    return storage.getItem(THEME_KEY) === value;
  } catch {
    return false;
  }
}
// Antes de hidratar: un valor inválido o almacenamiento bloqueado conserva el modo del sistema.
export const THEME_SCRIPT = `(function(){var k='is:theme:v1',p='system',m=window.matchMedia('(prefers-color-scheme: dark)');function n(v){return v==='dark'||v==='light'?v:'system'}try{p=n(localStorage.getItem(k))}catch(e){}function a(){var d=p==='dark'||(p==='system'&&m.matches),h=document.documentElement;h.classList.toggle('dark',d);h.dataset.themePreference=p;h.style.colorScheme=d?'dark':'light';document.querySelectorAll('meta[name="theme-color"]').forEach(function(t){t.content=location.pathname.indexOf('/workout/')===0?'#071627':d?'#0c0c0b':'#f6f3ec';t.removeAttribute('media')});window.dispatchEvent(new Event('iron-theme-applied'))}m.addEventListener('change',a);window.addEventListener('storage',function(e){if(e.key===k){p=n(e.newValue);a()}});window.addEventListener('iron-theme-preference',function(e){p=n(e.detail);a()});window.addEventListener('iron-theme-route',a);a()})();`;
