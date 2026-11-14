export function showToast(message: string): void {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('is-visible');
  window.setTimeout(() => toast.classList.remove('is-visible'), 2200);
}

// モーダルを開いている間は、後ろの画面がスクロールしないように固定する（iOS Safari でも効くよう position: fixed で止める）
let lockedScrollY = 0;

function syncScrollLock(): void {
  const body = document.body;
  const anyOpen = document.querySelector('.dialog-overlay.is-open') !== null;
  const locked = body.classList.contains('is-scroll-locked');
  if (anyOpen && !locked) {
    lockedScrollY = window.scrollY;
    body.style.top = `-${lockedScrollY}px`;
    body.classList.add('is-scroll-locked');
  } else if (!anyOpen && locked) {
    body.classList.remove('is-scroll-locked');
    body.style.top = '';
    window.scrollTo(0, lockedScrollY);
  }
}

export function openOverlay(overlay: HTMLElement): void {
  overlay.classList.add('is-open');
  syncScrollLock();
}

export function closeOverlay(overlay: HTMLElement): void {
  if (!overlay.classList.contains('is-open')) return;
  overlay.classList.remove('is-open');
  syncScrollLock();
}

/** ユーザー入力テキストを安全に表示するための要素を作る（innerHTML不使用） */
export function textEl(tag: string, className: string, text: string): HTMLElement {
  const el = document.createElement(tag);
  if (className) el.className = className;
  el.textContent = text;
  return el;
}

/** 開発者定義の固定SVG文字列のみを受け取るアイコン要素（ユーザー入力は渡さないこと） */
export function iconEl(svg: string, className = 'inline-icon'): HTMLElement {
  const span = document.createElement('span');
  span.className = className;
  span.innerHTML = svg;
  return span;
}

export function button(label: string, className: string, onClick: () => void): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = className;
  b.textContent = label;
  b.addEventListener('click', onClick);
  return b;
}
