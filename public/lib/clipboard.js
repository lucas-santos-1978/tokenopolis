// Copying to the clipboard, shared by the city and the climb.
//
// A browser only offers navigator.clipboard on a secure page (https or localhost). A panel served
// over plain http, as on an internal network, has none: text is then copied through a hidden text
// field and the old copy command, and images cannot be copied at all (they can still be downloaded).

// Copies `text`; resolves to true when it reached the clipboard.
export async function copyText(text) {
  try {
    if (window.isSecureContext && navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* refused (permission, focus): the text field below still has a chance */ }
  const field = document.createElement('textarea'), active = document.activeElement;
  field.value = text; field.setAttribute('readonly', ''); field.setAttribute('aria-hidden', 'true');
  // on screen but invisible (a field outside the page cannot be selected); 16px keeps iOS from zooming in
  Object.assign(field.style, { position: 'fixed', top: '0', left: '0', width: '1px', height: '1px', opacity: '0', fontSize: '16px', pointerEvents: 'none' });
  document.body.append(field);
  let ok = false;
  try { field.select(); field.setSelectionRange(0, text.length); ok = document.execCommand('copy'); } catch { ok = false; }
  field.remove();
  active?.focus?.({ preventScroll: true });
  return ok;
}

// Whether an image can go to the clipboard here (only on a secure page, in a browser that has ClipboardItem).
export const canCopyImages = () => window.isSecureContext && typeof ClipboardItem !== 'undefined' && !!navigator.clipboard?.write;
