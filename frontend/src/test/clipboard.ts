/** Replaces `navigator.clipboard` in jsdom, which does not implement the Clipboard API. */
export function setClipboard(value: unknown): void {
  Object.defineProperty(navigator, 'clipboard', { value, configurable: true });
}
