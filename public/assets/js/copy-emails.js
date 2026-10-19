/*
 * "Copiar mails": copies the emails of the list on screen (only clients with
 * marketing consent), comma separated, ready to paste into the recipients
 * field of a mail client. type="button" matters: it lives inside the search
 * form and must not submit it.
 */
(function () {
  var button = document.querySelector("[data-copy-emails]");
  if (!button) return;
  var emails = JSON.parse(button.getAttribute("data-copy-emails") || "[]");
  var timer = null;

  function feedback(label) {
    button.textContent = label;
    clearTimeout(timer);
    timer = setTimeout(function () {
      button.textContent = "Copiar mails";
    }, 2000);
  }

  button.addEventListener("click", function () {
    if (!navigator.clipboard) {
      feedback("No se pudo copiar");
      return;
    }
    navigator.clipboard.writeText(emails.join(", ")).then(
      function () {
        feedback("Mails copiados");
      },
      function () {
        feedback("No se pudo copiar");
      }
    );
  });
})();
