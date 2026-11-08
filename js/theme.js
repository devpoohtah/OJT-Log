// Loaded as a plain <script> in <head> on every page so the theme is applied
// before the first paint (no light flash in dark mode).
(function () {
  var root = document.documentElement;
  var theme = null;

  try { theme = localStorage.getItem("ojt-theme"); } catch (e) {}

  if (theme !== "light" && theme !== "dark") {
    theme = window.matchMedia && matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark" : "light";
  }
  root.setAttribute("data-theme", theme);

  try {
    if (localStorage.getItem("ojt-sidebar") === "collapsed") {
      root.classList.add("sidebar-collapsed");
    }
  } catch (e) {}

  window.OJTTheme = {
    toggle: function () {
      var next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      try { localStorage.setItem("ojt-theme", next); } catch (e) {}
      return next;
    }
  };
})();
