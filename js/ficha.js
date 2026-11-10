/**
 * ficha.js — FICHA PÚBLICA DE INMUEBLE PARA COLEGAS
 * ==================================================
 * URL:  https://ficha.miraleads.pro/?sheet=<ID_DEL_ESPEJO>&codigo=<ID_DEL_INMUEBLE>
 *       (también acepta ?id= en lugar de ?codigo=, que es lo que arma hoy el Panel)
 *
 * PRIVACIDAD (diseño por lista blanca):
 *   Solo se leen las columnas de CAMPOS_PERMITIDOS. Todo lo demás se ignora
 *   aunque llegue en la hoja Espejo. En particular NUNCA se leen ni se
 *   muestran: captación (Propio/Colega), link de ficha externa (CRM del colega),
 *   fecha de venta, ni nada de encargado / celular / notas / documentos / comisión.
 *   Si un día se agrega una columna nueva al Espejo, no aparece aquí hasta
 *   que alguien la agregue a propósito a esta lista.
 */

'use strict';

(function () {

  const CFG = window.FICHA_CONFIG || {};

  /* =============================================================
   * 1. LISTA BLANCA DE COLUMNAS
   * Cada clave se reconoce por su encabezado normalizado (sin tildes,
   * en minúscula). El primer encabezado que coincide gana.
   * ============================================================= */
  const CAMPOS_PERMITIDOS = {
    id:            h => h === 'id',
    tipo:          h => h === 'tipo',
    proyecto:      h => h.startsWith('proyecto') || h.startsWith('nombre'),
    barrio:        h => h.startsWith('barrio') || h.startsWith('zona'),
    ciudad:        h => h === 'ciudad',
    precio:        h => h.startsWith('precio'),
    canon:         h => h.startsWith('canon'),
    area:          h => h.startsWith('area'),
    habitaciones:  h => h.startsWith('habitacion'),
    banos:         h => h.startsWith('bano'),
    parqueadero:   h => h.startsWith('parqueadero'),
    piso:          h => h.includes('piso') && !h.includes('precio'),
    estrato:       h => h === 'estrato',
    administracion: h => h.startsWith('administracion') || h.startsWith('admon'),
    ascensor:      h => h.startsWith('ascensor'),
    estado:        h => h === 'estado',
    servicio:      h => h === 'servicio',
    credito:       h => h.includes('credito'),
    observaciones: h => h.startsWith('observacion'),
    fotos:         h => h.includes('foto'),
  };

  /* =============================================================
   * 2. UTILIDADES
   * ============================================================= */
  const $app = document.getElementById('app');

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  }

  function aNumero(v) {
    const limpio = String(v || '').replace(/[^\d]/g, '');
    return limpio ? parseInt(limpio, 10) : 0;
  }

  function pesos(n) { return '$' + Number(n).toLocaleString('es-CO'); }

  function param(nombre) { return new URLSearchParams(window.location.search).get(nombre) || ''; }

  /** Solo URLs https (evita javascript:, data:, etc.). */
  function urlSegura(u) {
    try { return new URL(u).protocol === 'https:' ? u : ''; } catch (e) { return ''; }
  }

  function esCasa(tipo) {
    const t = norm(tipo);
    return t === 'casa independiente' || t === 'casa en conjunto';
  }

  function formaPago(credito) {
    const c = norm(credito);
    if (!c) return '';
    if (c === 'si') return 'Aplica crédito';
    if (c === 'no') return 'Solo contado';
    if (c.includes('subsidio')) return 'Aplica subsidio';
    return 'Forma de pago por revisar';
  }

  /* Iconos (trazo, 24x24) */
  const IC = {
    cama:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 18V6"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/></svg>',
    bano:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2z"/><path d="M6 12V6a2 2 0 0 1 3.5-1.3"/><path d="M7 19l-1 2M17 19l1 2"/></svg>',
    area:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M4 20L20 4"/></svg>',
    pin:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
    share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3"/></svg>',
    cerrar:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  };

  /* =============================================================
   * 3. LECTURA DEL ESPEJO (Google Sheets API, hoja pública)
   * ============================================================= */
  class FichaError extends Error {
    constructor(titulo, detalle) { super(titulo); this.titulo = titulo; this.detalle = detalle; }
  }

  async function cargarInmueble(sheetId, codigo) {
    const key = CFG.API_KEY || '';
    if (!key || key.startsWith('PENDIENTE')) {
      throw new FichaError('Configuración incompleta', 'Falta la API key en js/config.js.');
    }

    const url = 'https://sheets.googleapis.com/v4/spreadsheets/' + encodeURIComponent(sheetId)
              + '/values/Portafolio?key=' + encodeURIComponent(key)
              + '&valueRenderOption=FORMATTED_VALUE';

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    let resp;
    try {
      resp = await fetch(url, { signal: ctrl.signal });
    } catch (e) {
      throw new FichaError('Sin conexión', 'No pudimos cargar la ficha. Revisa tu internet e intenta de nuevo.');
    } finally {
      clearTimeout(t);
    }

    if (resp.status === 404) throw new FichaError('Ficha no disponible', 'El enlace no es válido o el catálogo ya no está publicado.');
    if (resp.status === 429) throw new FichaError('Mucho tráfico', 'Intenta de nuevo en un minuto.');
    if (resp.status === 400 || resp.status === 403) throw new FichaError('Ficha no disponible', 'No se pudo leer el catálogo. Avisa a quien te compartió el enlace.');
    if (!resp.ok) throw new FichaError('Error al cargar', 'Intenta recargar la página (' + resp.status + ').');

    const data = await resp.json();
    const filas = data.values || [];
    if (filas.length < 2) throw new FichaError('Ficha no disponible', 'No encontramos este inmueble. Pudo haberse vendido o retirado.');

    // Mapa clave → índice de columna, solo para columnas de la lista blanca.
    const idx = {};
    filas[0].forEach((encabezado, i) => {
      const h = norm(encabezado);
      Object.keys(CAMPOS_PERMITIDOS).forEach(clave => {
        if (idx[clave] === undefined && CAMPOS_PERMITIDOS[clave](h)) idx[clave] = i;
      });
    });
    if (idx.id === undefined) throw new FichaError('Ficha no disponible', 'El catálogo no tiene el formato esperado.');

    const buscado = codigo.toUpperCase();
    const fila = filas.slice(1).find(f => String(f[idx.id] || '').trim().toUpperCase() === buscado);
    if (!fila) throw new FichaError('Inmueble no encontrado', 'Este inmueble pudo haberse vendido o retirado del catálogo.');

    const inm = {};
    Object.keys(idx).forEach(clave => { inm[clave] = String(fila[idx[clave]] || '').trim(); });

    inm.fotos = (inm.fotos || '').split(/[\n,]+/).map(u => urlSegura(u.trim())).filter(Boolean);
    return inm;
  }

  /* =============================================================
   * 4. RENDER
   * ============================================================= */
  function render(inm) {
    const precio = aNumero(inm.precio);
    const canon  = aNumero(inm.canon);

    let precioHtml;
    if (precio) {
      precioHtml = esc(pesos(precio))
        + (canon ? '<span class="precio-2">Arriendo ' + esc(pesos(canon)) + '/mes</span>' : '');
    } else if (canon) {
      precioHtml = esc(pesos(canon)) + '<small>/mes</small>';
    } else {
      precioHtml = 'Consultar';
    }

    const titulo = inm.proyecto || ((inm.tipo || 'Inmueble') + (inm.barrio ? ' en ' + inm.barrio : ''));
    const ubicacion = [inm.barrio, inm.ciudad || CFG.CIUDAD, CFG.PAIS].filter(Boolean).join(', ');
    const fotos = inm.fotos;
    const noDisponible = inm.estado && !/disponible/i.test(inm.estado) ? inm.estado : '';

    /* Hero + miniaturas */
    const slides = fotos.length
      ? fotos.map((f, i) => '<div class="hero-slide"><img src="' + esc(f) + '" alt="' + esc(titulo) + ' — foto ' + (i + 1)
          + '" referrerpolicy="no-referrer" decoding="async"' + (i ? ' loading="lazy"' : '') + '></div>').join('')
      : '<div class="hero-vacio">Sin fotos</div>';

    const MAX_THUMBS = 5;
    const miniaturas = fotos.length > 1 ? fotos.slice(0, MAX_THUMBS).map((f, i) => {
      const masFotos = fotos.length > MAX_THUMBS && i === MAX_THUMBS - 1;
      return '<button type="button" class="thumb" data-i="' + i + '" aria-label="Ver foto ' + (i + 1) + '"'
        + (i === 0 ? ' aria-current="true"' : '') + '>'
        + '<img src="' + esc(f) + '" alt="" referrerpolicy="no-referrer" loading="lazy">'
        + (masFotos ? '<span class="thumb-mas">+' + (fotos.length - MAX_THUMBS + 1) + '</span>' : '')
        + '</button>';
    }).join('') : '';

    /* Ficha técnica */
    const principales = [];
    if (inm.habitaciones && inm.habitaciones !== '0') principales.push([IC.cama, inm.habitaciones + ' Hab.']);
    if (inm.banos && inm.banos !== '0')               principales.push([IC.bano, inm.banos + ' Baños']);
    if (inm.area && inm.area !== '0')                 principales.push([IC.area, inm.area + ' m²']);

    const chips = [];
    if (inm.servicio) chips.push(inm.servicio);
    if (inm.estrato && inm.estrato !== '0') chips.push('Estrato ' + inm.estrato);
    if (inm.piso && inm.piso !== '0') chips.push((esCasa(inm.tipo) ? 'Niveles: ' : 'Piso ') + inm.piso);
    if (inm.parqueadero && !/^(0|no)/i.test(inm.parqueadero)) {
      chips.push(/^\d+$/.test(inm.parqueadero) ? 'Parqueaderos: ' + inm.parqueadero : 'Parqueadero ' + inm.parqueadero.toLowerCase());
    }
    if (tieneAscensor(inm)) chips.push('Ascensor');
    const admon = aNumero(inm.administracion);
    if (admon) chips.push('Administración ' + pesos(admon) + '/mes');
    const pago = formaPago(inm.credito);
    if (pago) chips.push(pago);

    $app.innerHTML =
      '<section class="hero" aria-label="Fotos del inmueble">'
      +   '<div class="hero-top">'
      +     '<a class="chip-marca" href="' + esc(CFG.MARCA_URL || '#') + '" target="_blank" rel="noopener"><i></i>' + esc(CFG.MARCA || '') + '</a>'
      +     '<button type="button" class="btn-circulo" id="btn-compartir-top" aria-label="Compartir ficha">' + IC.share + '</button>'
      +   '</div>'
      +   '<div class="hero-track" id="hero-track">' + slides + '</div>'
      +   (noDisponible ? '<span class="etiqueta-estado">' + esc(noDisponible) + '</span>' : '')
      +   (miniaturas ? '<div class="thumbs">' + miniaturas + '</div>' : '')
      + '</section>'

      + '<article class="cuerpo' + (miniaturas ? ' con-thumbs' : '') + '">'
      +   '<div class="fila-top">'
      +     (inm.tipo ? '<span class="tag">' + esc(inm.tipo) + '</span>' : '<span></span>')
      +     '<p class="precio">' + precioHtml + '</p>'
      +   '</div>'
      +   '<h1 class="titulo">' + esc(titulo) + '</h1>'
      +   (ubicacion ? '<p class="ubicacion">' + IC.pin + '<span>' + esc(ubicacion) + '</span></p>' : '')
      +   (principales.length
            ? '<div class="specs">' + principales.map(p => '<div class="spec">' + p[0] + '<span>' + esc(p[1]) + '</span></div>').join('') + '</div>'
            : '')
      +   (chips.length ? '<div class="chips">' + chips.map(c => '<span>' + esc(c) + '</span>').join('') + '</div>' : '')
      +   (inm.observaciones
            ? '<section class="seccion"><h2>Descripción</h2>'
              + '<p class="desc" id="desc">' + esc(inm.observaciones) + '</p>'
              + '<button type="button" class="leer-mas" id="leer-mas" hidden>Leer más…</button></section>'
            : '')
      +   '<p class="credito">Ficha generada con <a href="' + esc(CFG.MARCA_URL || '#') + '" target="_blank" rel="noopener">' + esc(CFG.MARCA || '') + '</a></p>'
      + '</article>'

      + '<div class="barra"><button type="button" class="btn-compartir" id="btn-compartir">' + IC.share + 'Compartir ficha</button></div>';

    // Pestaña del navegador (WhatsApp no lee esto: ver nota en index.html)
    document.title = titulo + ' · ' + (CFG.MARCA || 'Ficha');

    conectarEventos(inm, titulo, precioHtml);
  }

  /* =============================================================
   * 5. INTERACCIÓN
   * ============================================================= */
  /** Singular/plural simple: plural(2,'baño') → "2 baños". */
  function plural(n, palabra) { return n + ' ' + palabra + (Number(n) === 1 ? '' : 's'); }

  /** Link canónico de la ficha: sin parámetros ajenos (fbclid, utm…) y siempre con ?codigo=. */
  function linkCanonico() {
    const sheet  = param('sheet').trim();
    const codigo = (param('codigo') || param('id')).trim();
    return window.location.origin + '/?sheet=' + encodeURIComponent(sheet) + '&codigo=' + encodeURIComponent(codigo);
  }

  /**
   * Mensaje listo para pegar en WhatsApp. Solo usa datos públicos de la
   * lista blanca (nunca captación, link externo ni datos de contacto).
   * OJO: functions/_lib/inmueble.js arma el título de la vista previa con la
   * misma lógica; si cambias uno, cambia el otro.
   */
  /** Ascensor: solo se muestra si la hoja dice Sí (vacío o No = no se menciona). */
  function tieneAscensor(inm) {
    return /^s[ií]/i.test(norm(inm.ascensor));
  }

  function mensajeCompartir(inm) {
    const precio = aNumero(inm.precio);
    const canon  = aNumero(inm.canon);
    const srv = norm(inm.servicio);
    const enVenta = srv.includes('venta'), enArr = srv.includes('arriendo');
    const cuando = enVenta && enArr ? ' en venta y arriendo' : enArr ? ' en arriendo' : enVenta ? ' en venta' : '';

    const lineas = [];
    if (precio) lineas.push('Precio de venta: ' + pesos(precio));
    if (canon)  lineas.push((precio ? 'Precio de arriendo: ' : 'Canon de arriendo: ') + pesos(canon) + '/mes');
    if (inm.area && inm.area !== '0')                 lineas.push(inm.area + ' m²');
    if (inm.habitaciones && inm.habitaciones !== '0') lineas.push(plural(inm.habitaciones, 'alcoba'));
    if (inm.banos && inm.banos !== '0')               lineas.push(plural(inm.banos, 'baño'));
    if (inm.parqueadero && !/^(0|no)/i.test(inm.parqueadero)) {
      lineas.push(/^\d+$/.test(inm.parqueadero) ? plural(inm.parqueadero, 'parqueadero') : 'Parqueadero ' + inm.parqueadero.toLowerCase());
    }
    if (inm.estrato && inm.estrato !== '0') lineas.push('Estrato: ' + inm.estrato);
    if (tieneAscensor(inm)) lineas.push('Ascensor');
    const admon = aNumero(inm.administracion);
    if (admon) lineas.push('Administración: ' + pesos(admon) + '/mes');

    const lugar = [inm.barrio, inm.ciudad].filter(Boolean).join(', ');
    const titulo = (inm.tipo || 'Inmueble') + cuando + (lugar ? ' · ' + lugar : '');
    return '*' + titulo + '*\n'
      + lineas.map(l => '• ' + l).join('\n')
      + '\n• Más información y fotos:\n'
      + linkCanonico();
  }

  function conectarEventos(inm, titulo) {
    const fotos = inm.fotos;
    const track = document.getElementById('hero-track');

    // Miniaturas ↔ carrusel
    const thumbs = Array.from(document.querySelectorAll('.thumb'));
    let raf = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = Math.round(track.scrollLeft / track.clientWidth);
        thumbs.forEach(t => t.setAttribute('aria-current', String(Number(t.dataset.i) === i)));
      });
    }, { passive: true });

    thumbs.forEach(t => t.addEventListener('click', () => {
      const i = Number(t.dataset.i);
      const esUltimaConMas = t.querySelector('.thumb-mas');
      if (esUltimaConMas) { abrirVisor(fotos, i); return; }
      track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    }));

    // Tocar la foto grande abre el visor
    track.addEventListener('click', e => {
      if (e.target.tagName !== 'IMG') return;
      abrirVisor(fotos, Math.round(track.scrollLeft / track.clientWidth));
    });

    // Descripción con "Leer más"
    const desc = document.getElementById('desc');
    const btnMas = document.getElementById('leer-mas');
    if (desc && btnMas) {
      if (desc.scrollHeight > desc.clientHeight + 2) btnMas.hidden = false;
      btnMas.addEventListener('click', () => {
        const abierta = desc.classList.toggle('abierta');
        btnMas.textContent = abierta ? 'Leer menos' : 'Leer más…';
      });
    }

    // Compartir: el mensaje ya sale escrito (datos + link), listo para WhatsApp.
    const compartir = async () => {
      const mensaje = mensajeCompartir(inm);
      if (navigator.share) {
        // Solo "text": el link va dentro del mensaje, así queda al final y no duplicado.
        try { await navigator.share({ text: mensaje }); return; }
        catch (e) { if (e && e.name === 'AbortError') return; }
      }
      try { await navigator.clipboard.writeText(mensaje); aviso('Mensaje copiado. Pégalo en WhatsApp'); }
      catch (e) { aviso('No se pudo copiar. Copia el link desde la barra del navegador'); }
    };
    document.getElementById('btn-compartir').addEventListener('click', compartir);
    document.getElementById('btn-compartir-top').addEventListener('click', compartir);
  }

  /* ---- Visor de fotos a pantalla completa ---- */
  function abrirVisor(fotos, inicio) {
    if (!fotos.length) return;
    const visor = document.createElement('div');
    visor.className = 'visor';
    visor.setAttribute('role', 'dialog');
    visor.setAttribute('aria-label', 'Fotos del inmueble');
    visor.innerHTML =
      '<div class="visor-top"><span id="visor-cont"></span>'
      + '<button type="button" class="btn-circulo" id="visor-cerrar" aria-label="Cerrar">' + IC.cerrar + '</button></div>'
      + '<div class="visor-track" id="visor-track">'
      + fotos.map(f => '<div class="visor-slide"><img src="' + esc(f) + '" alt="" referrerpolicy="no-referrer"></div>').join('')
      + '</div>';
    document.body.appendChild(visor);
    document.body.style.overflow = 'hidden';

    const track = visor.querySelector('#visor-track');
    const cont  = visor.querySelector('#visor-cont');
    const actualizar = () => { cont.textContent = (Math.round(track.scrollLeft / track.clientWidth) + 1) + ' / ' + fotos.length; };
    track.scrollLeft = inicio * track.clientWidth;
    actualizar();
    track.addEventListener('scroll', actualizar, { passive: true });

    const cerrar = () => {
      visor.remove();
      document.body.style.overflow = '';
      document.removeEventListener('keydown', teclas);
    };
    const teclas = e => {
      if (e.key === 'Escape') cerrar();
      if (e.key === 'ArrowRight') track.scrollBy({ left: track.clientWidth, behavior: 'smooth' });
      if (e.key === 'ArrowLeft')  track.scrollBy({ left: -track.clientWidth, behavior: 'smooth' });
    };
    document.addEventListener('keydown', teclas);
    visor.querySelector('#visor-cerrar').addEventListener('click', cerrar);
  }

  function aviso(texto) {
    const el = document.createElement('div');
    el.className = 'aviso';
    el.textContent = texto;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2400);
  }

  /* =============================================================
   * 6. ARRANQUE
   * ============================================================= */
  function mostrarError(titulo, detalle) {
    $app.innerHTML = '<div class="estado"><div class="icono" aria-hidden="true">🏠</div><h1>'
      + esc(titulo) + '</h1><p>' + esc(detalle) + '</p></div>';
    document.title = titulo + ' · ' + (CFG.MARCA || 'Ficha');
  }

  function aplicarColores() {
    const r = document.documentElement.style;
    if (CFG.COLOR_PRIMARIO) r.setProperty('--primario', CFG.COLOR_PRIMARIO);
    if (CFG.COLOR_ACENTO)   r.setProperty('--acento', CFG.COLOR_ACENTO);
  }

  async function iniciar() {
    aplicarColores();

    const sheet  = param('sheet').trim();
    const codigo = (param('codigo') || param('id')).trim();

    // Validación de formato: IDs de Google y códigos tipo P0001 / MXZP-WWTX
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(sheet) || !/^[A-Za-z0-9_-]{1,40}$/.test(codigo)) {
      mostrarError('Enlace incompleto', 'Pídele a quien te compartió la ficha que te envíe el enlace de nuevo.');
      return;
    }

    try {
      render(await cargarInmueble(sheet, codigo));
    } catch (e) {
      if (e instanceof FichaError) mostrarError(e.titulo, e.detalle);
      else { console.error('[ficha]', e); mostrarError('Algo salió mal', 'Intenta recargar la página.'); }
    }
  }

  iniciar();

})();
