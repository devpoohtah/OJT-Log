// Inline SVG icons (no library, works offline, inherits the text color).

const svg = body =>
  `<svg class="icon" viewBox="0 0 24 24" width="20" height="20" fill="none" ` +
  `stroke="currentColor" stroke-width="1.8" stroke-linecap="round" ` +
  `stroke-linejoin="round" aria-hidden="true" focusable="false">${body}</svg>`;

export const ICONS = {
  tasks:    svg('<rect x="4" y="3" width="16" height="18" rx="2"/><path d="m8 9 1.5 1.5L12 8"/><path d="M14 9.5h3M8 15h9"/>'),
  add:      svg('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  history:  svg('<path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v4l3 2"/>'),
  clock:    svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>'),
  records:  svg('<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M3 9h18M8 2v4M16 2v4M8 14h3M8 17h6"/>'),
  logout:   svg('<path d="M10 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4"/><path d="m16 8 4 4-4 4M20 12H9"/>'),
  sun:      svg('<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>'),
  moon:     svg('<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>'),
  menu:     svg('<path d="M4 6h16M4 12h16M4 18h16"/>'),
  close:    svg('<path d="M6 6l12 12M18 6 6 18"/>'),
  collapse: svg('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/><path d="m15 9-3 3 3 3"/>'),
  eye:      svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  eyeOff:   svg('<path d="M3 3l18 18"/><path d="M10.6 5.1A10 10 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 4.2M6.6 6.6A17 17 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 4.4-1"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/>'),
  user:     svg('<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>'),
  settings: svg('<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>'),
  pdf:      svg('<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 14h6M9 17h4"/>')
};

// One button holding both icons; CSS shows the right one for the current theme
// (sun while dark, moon while light), so nothing needs re-rendering on toggle.
export function makeThemeButton({ label = false, className = "" } = {}) {
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = `theme-toggle ${className}`.trim();
  btn.setAttribute("aria-label", "Toggle light or dark mode");
  btn.title = "Toggle light / dark mode";
  btn.innerHTML =
    `<span class="icon-sun">${ICONS.sun}</span>` +
    `<span class="icon-moon">${ICONS.moon}</span>` +
    (label
      ? `<span class="nav-label"><span class="label-dark">Light mode</span>` +
        `<span class="label-light">Dark mode</span></span>`
      : "");
  btn.addEventListener("click", () => window.OJTTheme?.toggle());
  return btn;
}
