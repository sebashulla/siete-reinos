export const events = new EventTarget();
export function emit<T>(name: string, detail: T): void { events.dispatchEvent(new CustomEvent(name, { detail })); }
export function listen<T>(name: string, callback: (detail: T) => void): void {
  events.addEventListener(name, event => callback((event as CustomEvent<T>).detail));
}
export const uiState = { modal: false, minimap: true, damageNumbers: true };
