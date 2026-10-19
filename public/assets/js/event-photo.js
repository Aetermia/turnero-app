/*
 * Event photo in the panel: compress in the browser (JPEG 0.85, longest edge
 * 1600 px, same as the Next.js version), preview, then upload. Without
 * JavaScript the form still posts the original file.
 */
(function () {
  var box = document.querySelector("[data-event-photo]");
  if (!box) return;
  var form = box.querySelector("[data-photo-form]");
  var input = box.querySelector("[data-photo-file]");
  var save = box.querySelector("[data-photo-save]");
  var errorBox = box.querySelector("[data-photo-error]");
  var preview = box.querySelector("[data-preview]");
  var current = box.querySelector("[data-current]");
  var unsaved = box.querySelector("[data-unsaved]");
  var csrf = form.querySelector('input[name="_csrf"]').value;
  var MAX_BYTES = Number(box.getAttribute("data-max-bytes")) || 8 * 1024 * 1024;
  var ALLOWED = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic"];
  var FAILED = "No pudimos subir la foto. Revisá tu conexión y probá de nuevo.";
  var prepared = null;

  function fail(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }

  function compress(file) {
    return new Promise(function (resolve, reject) {
      if (file.size < 1024 * 1024 && file.type === "image/jpeg") return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var w = img.width, h = img.height, max = 1600;
        if (w > max || h > max) {
          if (w > h) { h = Math.round((h * max) / w); w = max; } else { w = Math.round((w * max) / h); h = max; }
        }
        var canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        var ctx = canvas.getContext("2d");
        if (!ctx) { URL.revokeObjectURL(url); return reject(new Error("canvas")); }
        ctx.drawImage(img, 0, 0, w, h);
        canvas.toBlob(function (blob) {
          URL.revokeObjectURL(url);
          if (!blob) return reject(new Error("toBlob"));
          resolve(new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" }));
        }, "image/jpeg", 0.85);
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error("decode")); };
      img.src = url;
    });
  }

  input.addEventListener("change", function () {
    errorBox.hidden = true;
    prepared = null;
    var file = input.files && input.files[0];
    if (!file) return;
    if (ALLOWED.indexOf(file.type || (/\.hei[cf]$/i.test(file.name) ? "image/heic" : "")) === -1) {
      return fail("Formato no soportado. Permitidos: JPG, PNG, WEBP o HEIC.");
    }
    if (file.size > MAX_BYTES) return fail("La foto supera los 8MB.");
    save.disabled = true;
    save.textContent = "Preparando…";
    compress(file).catch(function () { return file; }).then(function (ready) {
      prepared = ready;
      preview.src = URL.createObjectURL(ready);
      preview.hidden = false;
      if (current) current.hidden = true;
      unsaved.hidden = false;
      save.disabled = false;
      save.textContent = "Guardar foto";
    });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    if (!prepared) return fail("Elegí una foto.");
    var data = new FormData();
    data.append("_csrf", csrf);
    data.append("photo", prepared, prepared.name);
    save.disabled = true;
    save.textContent = "Subiendo…";
    var xhr = new XMLHttpRequest();
    xhr.open("POST", form.action);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = 120000;
    xhr.onload = function () {
      var r = null;
      try { r = JSON.parse(xhr.responseText); } catch (e) { r = null; }
      if (xhr.status === 200 && r && r.ok) { window.location.reload(); return; }
      fail(r && r.error ? r.error : FAILED);
      save.disabled = false;
      save.textContent = "Guardar foto";
    };
    xhr.onerror = xhr.ontimeout = function () {
      fail(FAILED);
      save.disabled = false;
      save.textContent = "Guardar foto";
    };
    xhr.send(data);
  });
})();
