/*
 * Receipt upload (R4): built for a phone on a shaky connection.
 *  - photos are compressed in the browser before uploading (canvas, JPEG 0.8,
 *    longest edge 1600 px), so a 5 MB camera shot becomes a few hundred KB;
 *  - a PDF is sent as-is (it cannot go through the canvas);
 *  - an image the browser cannot decode (HEIC outside Safari) is sent as-is
 *    too: it already passed the type and size checks;
 *  - when the upload fails the person sees a plain message and a visible
 *    "Reintentar" button; nothing is lost and they can try again.
 * Without JavaScript the form still works as a plain multipart upload.
 */
(function () {
  var form = document.querySelector("[data-receipt-upload]");
  if (!form) return;

  var UPLOAD_FAILED_MESSAGE =
    "No pudimos subir el comprobante. Revisá tu conexión y tocá «Reintentar».";
  var ALLOWED = [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "application/pdf",
  ];
  var MAX_BYTES = Number(form.getAttribute("data-max-bytes")) || 8 * 1024 * 1024;
  var MAX_DIMENSION = 1600;
  var JPEG_QUALITY = 0.8;

  var input = form.querySelector("[data-file]");
  var button = form.querySelector("[data-upload-button]");
  var errorBox = form.querySelector("[data-upload-error]");
  var preview = form.querySelector("[data-preview]");
  var pdfName = form.querySelector("[data-pdf-name]");
  var csrf = form.querySelector('input[name="_csrf"]').value;
  var prepared = null;

  function showError(message) {
    errorBox.textContent = message;
    errorBox.hidden = false;
  }
  function clearError() {
    errorBox.textContent = "";
    errorBox.hidden = true;
  }
  function setIdle(label) {
    button.disabled = false;
    button.textContent = label;
  }

  function isPdf(file) {
    return file.type === "application/pdf";
  }

  function typeOf(file) {
    if (file.type) return file.type;
    // Some phones leave the type empty for HEIC photos.
    return /\.hei[cf]$/i.test(file.name) ? "image/heic" : "";
  }

  function compress(file) {
    return new Promise(function (resolve, reject) {
      if (isPdf(file)) return resolve(file);
      if (file.size < 1024 * 1024 && file.type === "image/jpeg") return resolve(file);
      var url = URL.createObjectURL(file);
      var img = new Image();
      img.onload = function () {
        var width = img.width;
        var height = img.height;
        if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
          if (width > height) {
            height = Math.round((height * MAX_DIMENSION) / width);
            width = MAX_DIMENSION;
          } else {
            width = Math.round((width * MAX_DIMENSION) / height);
            height = MAX_DIMENSION;
          }
        }
        var canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        var ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          return reject(new Error("canvas"));
        }
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          function (blob) {
            URL.revokeObjectURL(url);
            if (!blob) return reject(new Error("toBlob"));
            var name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
            resolve(new File([blob], name, { type: "image/jpeg", lastModified: Date.now() }));
          },
          "image/jpeg",
          JPEG_QUALITY
        );
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        reject(new Error("decode"));
      };
      img.src = url;
    });
  }

  input.addEventListener("change", function () {
    clearError();
    prepared = null;
    preview.hidden = true;
    pdfName.hidden = true;
    var file = input.files && input.files[0];
    if (!file) return;

    // Compressing a big photo takes a moment on a phone: keep the button
    // disabled meanwhile, so a quick tap cannot send nothing.
    button.hidden = false;
    button.disabled = true;
    button.textContent = "Preparando...";

    if (ALLOWED.indexOf(typeOf(file)) === -1) {
      showError("Formato no soportado. Permitidos: JPG, PNG, WEBP, HEIC o PDF");
      setIdle("Subir comprobante");
      return;
    }
    if (file.size > MAX_BYTES) {
      showError("El archivo supera los 8MB");
      setIdle("Subir comprobante");
      return;
    }

    compress(file)
      .catch(function () {
        return file; // the browser cannot decode it: send the original
      })
      .then(function (ready) {
        prepared = ready;
        if (isPdf(ready)) {
          pdfName.textContent = "PDF seleccionado: " + ready.name;
          pdfName.hidden = false;
        } else if (ready.type !== "image/heic") {
          preview.src = URL.createObjectURL(ready);
          preview.hidden = false;
        }
        button.hidden = false;
        setIdle("Subir comprobante");
      });
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearError();
    if (!prepared) {
      showError("Elegí el comprobante para subir");
      return;
    }

    var data = new FormData();
    data.append("_csrf", csrf);
    data.append("receipt", prepared, prepared.name);

    button.disabled = true;
    button.textContent = "Subiendo...";

    var xhr = new XMLHttpRequest();
    xhr.open("POST", form.action);
    xhr.setRequestHeader("Accept", "application/json");
    xhr.timeout = 120000;
    xhr.onload = function () {
      var response = null;
      try {
        response = JSON.parse(xhr.responseText);
      } catch (e) {
        response = null;
      }
      if (xhr.status === 200 && response && response.ok) {
        // The server stored the receipt: reload to show the transfer form.
        window.location.reload();
        return;
      }
      showError(response && response.error ? response.error : UPLOAD_FAILED_MESSAGE);
      setIdle("Reintentar");
    };
    xhr.onerror = xhr.ontimeout = function () {
      showError(UPLOAD_FAILED_MESSAGE);
      setIdle("Reintentar");
    };
    xhr.send(data);
  });

  var confirmForm = document.querySelector("[data-confirm-form]");
  if (confirmForm) {
    confirmForm.addEventListener("submit", function () {
      var confirmButton = confirmForm.querySelector("[data-confirm-button]");
      confirmButton.disabled = true;
      confirmButton.textContent = "Confirmando...";
    });
  }
})();
