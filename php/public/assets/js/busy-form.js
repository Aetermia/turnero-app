/* Disables a form's submit button while it is being sent (no double posts). */
(function () {
  document.querySelectorAll("[data-busy-form]").forEach(function (form) {
    form.addEventListener("submit", function () {
      var button = form.querySelector("[data-busy-label]");
      if (!button) return;
      button.disabled = true;
      button.textContent = button.getAttribute("data-busy-label");
    });
  });
})();
