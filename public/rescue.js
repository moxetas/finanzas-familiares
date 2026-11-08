/*
 * Rescate (JavaScript sencillo, sin módulos): si la app no arranca en 10 segundos,
 * enseña qué ha fallado y deja «Reparar la app» (quita la copia guardada de la app,
 * no tus datos) y «Copiar diagnóstico» para enviarlo a quien te ayuda.
 */
(function () {
  var errors = [];
  window.addEventListener('error', function (e) {
    errors.push((e.message || 'error') + (e.filename ? ' · ' + String(e.filename).split('/').pop() + ':' + (e.lineno || '') : ''));
  });
  window.addEventListener('unhandledrejection', function (e) {
    var r = e.reason;
    errors.push('promesa: ' + (r && (r.name ? r.name + ': ' : '') + (r && r.message ? r.message : String(r))));
  });

  function diag() {
    var sw = navigator.serviceWorker && navigator.serviceWorker.controller ? 'sí' : 'no';
    return [
      'Finanzas familiares · diagnóstico',
      'Fecha: ' + new Date().toISOString(),
      'Navegador: ' + navigator.userAgent,
      'Instalada: ' + ((window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || navigator.standalone ? 'sí' : 'no'),
      'Service worker activo: ' + sw,
      'IndexedDB: ' + (typeof indexedDB !== 'undefined' ? 'existe' : 'no existe'),
      'Errores: ' + (errors.length ? '\n- ' + errors.join('\n- ') : 'ninguno'),
    ].join('\n');
  }

  function repair() {
    var tasks = [];
    if (navigator.serviceWorker && navigator.serviceWorker.getRegistrations) {
      tasks.push(navigator.serviceWorker.getRegistrations().then(function (regs) {
        return Promise.all(regs.map(function (r) { return r.unregister(); }));
      }));
    }
    if (window.caches && caches.keys) {
      tasks.push(caches.keys().then(function (keys) {
        return Promise.all(keys.filter(function (k) { return k.indexOf('finanzas-familiares-') === 0; }).map(function (k) { return caches.delete(k); }));
      }));
    }
    Promise.all(tasks).then(done, done);
    function done() { location.reload(); }
  }

  function copy() {
    var text = diag();
    if (navigator.share) navigator.share({ text: text }).catch(function () {});
    else if (navigator.clipboard) navigator.clipboard.writeText(text).catch(function () {});
  }

  function button(label, primary, fn) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn ' + (primary ? 'btn-primary' : 'btn-secondary');
    b.textContent = label;
    b.addEventListener('click', fn);
    return b;
  }

  /** Lo usa también la app cuando no puede abrir los datos. */
  window.__rescate = { diag: diag, repair: repair, copy: copy, errors: errors };

  setTimeout(function () {
    if (document.querySelector('.topbar')) return; // la app ha arrancado
    var box = document.querySelector('#app .boot');
    if (!box || box.querySelector('.rescue')) return;
    var wrap = document.createElement('div');
    wrap.className = 'rescue';
    var p = document.createElement('p');
    p.className = 'boot-hint';
    p.textContent = 'La app no termina de arrancar. «Reparar la app» vuelve a descargarla sin tocar tus datos. Si sigue igual, toca «Copiar diagnóstico» y envíalo.';
    var pre = document.createElement('pre');
    pre.className = 'rescue-diag';
    pre.textContent = errors.length ? errors.join('\n') : '';
    wrap.appendChild(p);
    if (errors.length) wrap.appendChild(pre);
    wrap.appendChild(button('Reparar la app', true, repair));
    wrap.appendChild(button('Copiar diagnóstico', false, copy));
    box.appendChild(wrap);
  }, 10000);
})();
