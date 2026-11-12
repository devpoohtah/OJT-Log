// One place for how dates are shown across the app: "Nov 11, 2026".
// Dates are stored as "YYYY-MM-DD" strings; they are only formatted for display.

export const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                             "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const WEEKDAYS_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function parseYmd(str) {
  const [y, m, d] = String(str).split("-").map(Number);
  return new Date(y, m - 1, d);
}

const valid = str => /^\d{4}-\d{2}-\d{2}$/.test(str || "");

// "Nov 11, 2026"
export function formatDate(str) {
  if (!valid(str)) return str || "";
  const d = parseYmd(str);
  return `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// "Fri, Nov 13, 2026"
export function formatDateWithWeekday(input) {
  const d = typeof input === "string" ? parseYmd(input) : input;
  return `${WEEKDAYS_SHORT[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

// "Nov 2026" from "2026-11" or "2026-11-05"
export function formatMonthYear(str) {
  const [y, m] = String(str).split("-").map(Number);
  if (!y || !m) return "";
  return `${MONTHS_SHORT[m - 1]} ${y}`;
}

// Browsers draw <input type="date"> / <input type="month"> themselves, in the
// device's own format (e.g. 09/11/2026), and a website can't change that.
// So show the app's format in small text right under each picker.
export function addDateHints(root = document) {
  root.querySelectorAll('input[type="date"], input[type="month"]').forEach(input => {
    if (input.dataset.hint) return;
    input.dataset.hint = "1";

    const hint = document.createElement("small");
    hint.className = "date-hint";
    input.insertAdjacentElement("afterend", hint);

    const update = () => {
      hint.textContent = !input.value ? ""
        : input.type === "month" ? formatMonthYear(input.value)
        : formatDate(input.value);
    };

    input.addEventListener("input", update);
    input.addEventListener("change", update);

    // Forms fill these fields from code (edit modals, defaults) and reset them, and
    // neither fires an input event. Catch both so the hint is never stale.
    const own = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value");
    Object.defineProperty(input, "value", {
      configurable: true,
      get() { return own.get.call(this); },
      set(v) { own.set.call(this, v); update(); }
    });
    input.form?.addEventListener("reset", () => setTimeout(update));

    update();
  });
}
