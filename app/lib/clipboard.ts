// A fulfilled promise must mean that one of the copy methods really succeeded.
// Browsers can reject clipboard access even on HTTPS (focus/user activation).
export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch { /* Try the legacy method, but check its boolean result as well. */ }

  if (typeof document === "undefined") return false;
  const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.readOnly = true;
  textarea.tabIndex = -1;
  textarea.style.cssText = "position:fixed;top:0;left:0;opacity:0;pointer-events:none;font-size:16px";
  textarea.setAttribute("aria-label", "복사할 텍스트");
  try {
    document.body.appendChild(textarea);
    textarea.focus({ preventScroll: true });
    textarea.select();
    textarea.setSelectionRange(0, value.length);
    return document.execCommand("copy") === true;
  } catch {
    return false;
  } finally {
    textarea.remove();
    if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
  }
}
