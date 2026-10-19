/*
 * Booking form, step 1. Progressive enhancement only: the form works without
 * JavaScript, and the server validates everything again.
 *  - shows the "Contanos cuál" box only when the answer is "Sí" (and makes it
 *    required then);
 *  - disables the button while sending, so a double tap does not post twice.
 */
(function () {
  var form = document.querySelector("[data-reservation-form]");
  if (!form) return;

  var box = form.querySelector("[data-condition-box]");
  var textarea = form.querySelector("#healthCondition");
  var radios = form.querySelectorAll('input[name="hasHealthCondition"]');

  function sync() {
    var yes = form.querySelector('input[name="hasHealthCondition"][value="yes"]');
    var show = yes && yes.checked;
    box.hidden = !show;
    textarea.required = !!show;
  }
  radios.forEach(function (radio) {
    radio.addEventListener("change", sync);
  });
  sync();

  form.addEventListener("submit", function () {
    var button = form.querySelector("[data-submit]");
    button.disabled = true;
    button.textContent = "Enviando…";
  });
})();
