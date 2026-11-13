// Loaded as a plain <script> in <head> on every page so the theme is applied
// before the first paint (no light flash in dark mode, no flash of the old color).
//
// Two independent settings:
//   data-theme  = "light" | "dark"          (per device, localStorage "ojt-theme")
//   data-color  = a color theme id          (saved in Firestore, cached in localStorage "ojt-color")
// Classic Blue is the default color theme and is shown as no data-color attribute at all.
(function () {
  var root = document.documentElement;
  var theme = null;

  // swatch = [signature color, soft color] shown in the picker
  var COLORS = [
    { id: "classic",  name: "Classic Blue",   swatch: ["#2563EB", "#BFDBFE"] },
    { id: "lavender", name: "Lavender Dream", swatch: ["#8B70C9", "#C9B8EA"] },
    { id: "cherry",   name: "Cherry Cream",   swatch: ["#9E3D50", "#D98A91"] },
    { id: "sage",     name: "Sage Garden",    swatch: ["#718C70", "#B5C9A8"] },
    { id: "rose",     name: "Rose Blush",     swatch: ["#C77991", "#E6AFC0"] },
    { id: "peach",    name: "Peach Blossom",  swatch: ["#D98270", "#F1B9A5"] }
  ];

  function validColor(id) {
    return COLORS.some(function (c) { return c.id === id; });
  }

  try { theme = localStorage.getItem("ojt-theme"); } catch (e) {}

  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }
  root.setAttribute("data-theme", theme);

  function applyColor(id) {
    if (!validColor(id) || id === "classic") root.removeAttribute("data-color");
    else root.setAttribute("data-color", id);
  }

  function currentColor() {
    return root.getAttribute("data-color") || "classic";
  }

  var color = null;
  try { color = localStorage.getItem("ojt-color"); } catch (e) {}
  applyColor(color);

  try {
    if (localStorage.getItem("ojt-sidebar") === "collapsed") {
      root.classList.add("sidebar-collapsed");
    }
  } catch (e) {}

  window.OJTTheme = {
    COLORS: COLORS,

    toggle: function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("ojt-theme", next); } catch (e) {}
      return next;
    },

    getColor: currentColor,

    // Shows a color theme right away, without saving it (used for the live preview).
    previewColor: applyColor,

    // Shows a color theme and keeps it in this device's cache.
    setColor: function (id) {
      if (!validColor(id)) id = "classic";
      applyColor(id);
      try { localStorage.setItem("ojt-color", id); } catch (e) {}
      return id;
    },

    isValidColor: validColor
  };
})();
