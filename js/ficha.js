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
 *
 * ESTRUCTURA
 *   1. Lista blanca y utilidades
 *   2. Lectura del Espejo
 *   3. construirVista(): datos ya listos para mostrar (los usan la página
 *      Y la imagen de js/imagen.js, así nunca se contradicen)
 *   4. Render de la página
 *   5. Interacción (galería, compartir, imagen)
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
    id:             h => h === 'id',
    tipo:           h => h === 'tipo',
    proyecto:       h => h.startsWith('proyecto') || h.startsWith('nombre'),
    barrio:         h => h.startsWith('barrio') || h.startsWith('zona'),
    ciudad:         h => h === 'ciudad',
    precio:         h => h.startsWith('precio'),
    canon:          h => h.startsWith('canon'),
    area:           h => h.startsWith('area'),
    habitaciones:   h => h.startsWith('habitacion'),
    banos:          h => h.startsWith('bano'),
    parqueadero:    h => h.startsWith('parqueadero'),
    piso:           h => h.includes('piso') && !h.includes('precio'),
    estrato:        h => h === 'estrato',
    estado:         h => h === 'estado',
    servicio:       h => h === 'servicio',
    credito:        h => h.includes('credito'),
    administracion: h => h.startsWith('administracion'),
    ascensor:       h => h === 'ascensor',
    observaciones:  h => h.startsWith('observacion'),
    fotos:          h => h.includes('foto'),
  };

  /* ---------- utilidades ---------- */
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

  /** Hay dato útil: no vacío y no "0". */
  function hayNum(v) { return !!v && !/^0+([.,]0+)?$/.test(String(v).trim()); }

  function esCasa(tipo) {
    const t = norm(tipo);
    return t === 'casa independiente' || t === 'casa en conjunto';
  }

  function esSi(v) { return ['si', 'true', '1', 'con ascensor'].includes(norm(v)); }

  function formaPago(credito) {
    const c = norm(credito);
    if (!c) return '';
    if (c === 'si') return 'Aplica crédito';
    if (c === 'no') return 'Solo contado';
    if (c.includes('subsidio')) return 'Aplica subsidio';
    return 'Forma de pago por revisar';
  }

  /** Singular/plural simple: plural(2,'baño') → "2 baños". */
  function plural(n, palabra) { return n + ' ' + palabra + (Number(n) === 1 ? '' : 's'); }

  /**
   * "Barrio, Ciudad" sin repetir la ciudad si el barrio ya la trae (ej. "Ciudad Córdoba, Cali")
   * y sin inventar una ciudad por defecto (hay inmuebles en Cali, Palmira, Jamundí…).
   * OJO: functions/_lib/inmueble.js (ubicacionTexto) usa la misma lógica.
   */
  function ubicacionTexto(inm) {
    const partes = [];
    if (inm.barrio) partes.push(inm.barrio);
    if (inm.ciudad && !norm(inm.barrio).includes(norm(inm.ciudad))) partes.push(inm.ciudad);
    return partes.join(', ');
  }

  /* ---------- colores: un solo acento, el resto se deriva ---------- */
  function hexARgb(hex) {
    let h = String(hex || '').trim().replace('#', '');
    if (h.length === 3) h = h.split('').map(x => x + x).join('');
    if (!/^[0-9a-f]{6}$/i.test(h)) return null;
    return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16));
  }
  /** Mezcla "hex" con "con" (otro hex); pct = cuánto de "con" (0–1). */
  function mezclar(hex, con, pct) {
    const a = hexARgb(hex), b = hexARgb(con);
    return '#' + a.map((x, i) => Math.round(x * (1 - pct) + b[i] * pct).toString(16).padStart(2, '0')).join('');
  }
  const COLORES = { acento: '#0f5b4f', oscuro: '#0b443b', claro: '#578c84', suave: '#e7efed' };

  function aplicarColores() {
    if (!hexARgb(CFG.COLOR_PRIMARIO)) return;
    COLORES.acento = CFG.COLOR_PRIMARIO;
    COLORES.oscuro = mezclar(COLORES.acento, '#000000', .25);
    COLORES.claro  = mezclar(COLORES.acento, '#ffffff', .30);
    COLORES.suave  = mezclar(COLORES.acento, '#ffffff', .90);
    const r = document.documentElement.style;
    r.setProperty('--acento', COLORES.acento);
    r.setProperty('--acento-oscuro', COLORES.oscuro);
    r.setProperty('--acento-claro', COLORES.claro);
    r.setProperty('--acento-suave', COLORES.suave);
  }

  /* ---------- íconos (trazo, 24×24) ---------- */
  const IC_RUTAS = {
    area:    '<path d="M4 9V4h5"/><path d="M20 15v5h-5"/><path d="M4 4l6 6"/><path d="M20 20l-6-6"/>',
    cama:    '<path d="M3 18V6"/><path d="M3 14h18v4"/><path d="M21 14v-2a3 3 0 0 0-3-3h-7v5"/><circle cx="7" cy="11" r="1.6"/>',
    bano:    '<path d="M4 12h16v2a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5v-2z"/><path d="M6 12V6a2 2 0 0 1 3.5-1.3"/><path d="M7 19l-1 2M17 19l1 2"/>',
    carro:   '<path d="M5 16v-5l1.6-4a2 2 0 0 1 1.9-1.3h7a2 2 0 0 1 1.9 1.3L19 11v5"/><rect x="3.5" y="11" width="17" height="5.5" rx="1.5"/><path d="M6 16.5V19M18 16.5V19"/><circle cx="7.5" cy="13.7" r=".7"/><circle cx="16.5" cy="13.7" r=".7"/>',
    estrato: '<path d="M12 4l8 4-8 4-8-4 8-4z"/><path d="M4 12l8 4 8-4"/><path d="M4 16l8 4 8-4"/>',
    piso:    '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M9 8h2M13 8h2M9 12h2M13 12h2M10.5 20.5v-3.5h3v3.5"/>',
    admin:   '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v10"/><path d="M14.7 9.4c-.5-.8-1.5-1.2-2.7-1.2-1.6 0-2.6.8-2.6 1.9 0 2.7 5.3 1.3 5.3 4 0 1.2-1.1 2-2.8 2-1.3 0-2.3-.5-2.9-1.3"/>',
    ascensor:'<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M12 3.5v17"/><path d="M8.5 10l1.5-2 1.5 2"/><path d="M12.5 14l1.5 2 1.5-2"/>',
    credito: '<rect x="3" y="6" width="18" height="12" rx="2"/><path d="M3 10h18M7 15h4"/>',
    pin:     '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>',
    share:   '<circle cx="18" cy="5" r="2.6"/><circle cx="6" cy="12" r="2.6"/><circle cx="18" cy="19" r="2.6"/><path d="M8.3 10.8l7.4-4.3M8.3 13.2l7.4 4.3"/>',
    cerrar:  '<path d="M6 6l12 12M18 6L6 18"/>',
    imagen:  '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.6"/><path d="M4 17l5-4.5 3.5 3L15 13l5 4.5"/>',
    piscina: '<path d="M8 4v10M15 4v10"/><path d="M8 7h7M8 10.5h7"/><path d="M3 17c1.5 0 1.5 1.2 3 1.2S7.5 17 9 17s1.5 1.2 3 1.2 1.5-1.2 3-1.2 1.5 1.2 3 1.2 1.5-1.2 3-1.2"/>',
    gimnasio: '<path d="M6.5 8v8M17.5 8v8M3.5 10v4M20.5 10v4M6.5 12h11"/>',
    bbq: '<path d="M4 11h16a8 8 0 0 1-16 0z"/><path d="M8 20l1.5-4M16 20l-1.5-4"/><path d="M9 3c-1 1.3 1 2 0 3.5M13 3c-1 1.3 1 2 0 3.5"/>',
    social: '<circle cx="8" cy="8" r="2.5"/><circle cx="16" cy="8" r="2.5"/><path d="M3.5 19c0-3 2-5 4.5-5s4.5 2 4.5 5"/><path d="M12 19c0-3 1.7-5 4-5s4.5 2 4.5 5"/>',
    juegos: '<circle cx="12" cy="12" r="8.5"/><path d="M12 3.5c3 3 3 14 0 17M3.5 12c3-3 14-3 17 0"/>',
    vigilancia: '<path d="M12 3l7 3v5c0 4.6-3 8-7 10-4-2-7-5.4-7-10V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 10"/>',
    cerrado: '<rect x="5" y="10.5" width="14" height="10" rx="2"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5"/>',
    verde: '<circle cx="12" cy="9" r="5.5"/><path d="M12 14.5V21M9.5 21h5"/>',
    balcon: '<path d="M7 11V5h10v6"/><path d="M4 11h16"/><path d="M5 11v8M9.5 11v8M14.5 11v8M19 11v8"/><path d="M4 19h16"/>',
    terraza: '<path d="M3.5 12a8.5 8.5 0 0 1 17 0z"/><path d="M12 12v8"/><path d="M12 20h-2.5"/>',
    cocina: '<path d="M5 10h14v7a3 3 0 0 1-3 3H8a3 3 0 0 1-3-3v-7z"/><path d="M3 10h18M9 6c-.8-1 .8-1.5 0-2.5M13 6c-.8-1 .8-1.5 0-2.5"/>',
    patio: '<path d="M12 21v-8"/><path d="M12 13c0-4 2.5-6 6-6 0 4-2 6-6 6z"/><path d="M12 15c0-3-2-5-5-5 0 3 1.8 5 5 5z"/>',
    vista: '<path d="M3 19l6-10 4 6 2.5-4L21 19H3z"/><circle cx="17" cy="6" r="1.6"/>',
    closet: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M12 3.5v17M9.5 12v2M14.5 12v2"/>',
    estudio: '<path d="M4 5.5c3-1 5.5-.8 8 1 2.5-1.8 5-2 8-1v13c-3-1-5.5-.8-8 1-2.5-1.8-5-2-8-1v-13z"/><path d="M12 6.5v13"/>',
    gas: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.3 1.5 1 2 1.8 2.3C11 8 11 5.5 12 3z"/>',
    deposito: '<path d="M3.5 8l8.5-4.5L20.5 8v8.5L12 21l-8.5-4.5V8z"/><path d="M3.5 8L12 12.5 20.5 8M12 12.5V21"/>',
    lavanderia: '<rect x="4.5" y="3.5" width="15" height="17" rx="2"/><circle cx="12" cy="13" r="4"/><path d="M8 7h.01M11 7h.01"/>',
    amoblado: '<path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3"/><path d="M3.5 11a1.5 1.5 0 0 1 3 0v3h11v-3a1.5 1.5 0 0 1 3 0v6h-17v-6z"/><path d="M6 17v2M18 17v2"/>',
    mascota: '<circle cx="7" cy="10" r="1.7"/><circle cx="11" cy="6.5" r="1.7"/><circle cx="15.5" cy="7" r="1.7"/><circle cx="18.5" cy="11" r="1.7"/><path d="M8 17c0-3 2-5 4-5s5 2 4.5 5c-.4 2-2 2-4.5 1-2.5 1-4.5 1-4-1z"/>',
    bajar:   '<path d="M12 4v11"/><path d="M7.5 11l4.5 4.5 4.5-4.5"/><path d="M4.5 19.5h15"/>',
  };
  /** SVG en línea (hereda el color con currentColor). */
  function ico(nombre) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'
      + (IC_RUTAS[nombre] || '') + '</svg>';
  }
  /** SVG suelto con color fijo, para dibujarlo en el canvas de js/imagen.js. */
  function iconoSvg(nombre, color) {
    return '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 24 24" fill="none" stroke="' + color
      + '" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' + (IC_RUTAS[nombre] || '') + '</svg>';
  }
  const OJO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3.6" fill="currentColor" stroke="none"/></svg>';


  /* =============================================================
   * Comodidades detectadas en la descripción (palabras clave).
   * El orden es la prioridad: si hay muchas, salen primero las primeras.
   * Para agregar una: ícono en IC_RUTAS + una línea aquí.
   * ============================================================= */
  const COMODIDADES = [
    ['piscina',    'Piscina',            /\b(piscina|pisc|zona humeda|turco|sauna)\b/],
    ['gimnasio',   'Gimnasio',           /\b(gimnasio|gym|zona de ejercicio)\b/],
    ['vigilancia', null,                 /\b(vigilancia|porteria|seguridad|celaduria|portero)\b/],
    ['balcon',     'Balcón',             /\bbalcon(es)?\b/],
    ['ascensor',   'Con ascensor',       /\b(ascensor(es)?|elevador)\b/],
    ['bbq',        'Zona BBQ',           /\b(bbq|b\.b\.q|asadero|zona de asados|parrilla)\b/],
    ['social',     'Salón social',       /\b(salon(es)? social(es)?|salon(es)? comunal(es)?|zona social)\b/],
    ['juegos',     'Zona infantil',      /\b(juegos infantiles|zona infantil|parque infantil|zona de juegos|ludoteca)\b/],
    ['terraza',    'Terraza',            /\bterraza(s)?\b/],
    ['cocina',     'Cocina integral',    /\bcocina (semi)?integral\b|\bcocina abierta\b/],
    ['vista',      'Buena vista',        /\b(vista|panoramic[oa])\b/],
    ['cerrado',    'Conjunto cerrado',   /\b(conjunto|unidad|urbanizacion) cerrad[oa]\b/],
    ['verde',      'Zonas verdes',       /\b(zonas? verdes?|jardines|parques?(?! infantil))\b/],
    ['patio',      'Patio',              /\bpatio\b(?! de ropas)/],
    ['closet',     'Closets',            /\b(closets?|vestier|armarios? empotrados?)\b/],
    ['estudio',    'Estudio',            /\b(cuarto|sala|zona) de estudio\b|\bestudio\b(?! de)/],
    ['gas',        'Gas natural',        /\bgas (natural|domiciliario)\b/],
    ['deposito',   'Depósito',           /\b(deposito|cuarto util)\b/],
    ['lavanderia', 'Zona de ropas',      /\b(lavanderia|zona de ropas|zona de lavado|patio de ropas)\b/],
    ['amoblado',   'Amoblado',           /\b(amoblad[oa]|amueblad[oa])\b/],
    ['mascota',    'Mascotas permitidas',/\b(mascotas|pet ?friendly)\b/],
  ];
  const NEGACION = /\b(sin|no tiene|no cuenta con|no hay|no incluye|carece de|no se permiten?|no permite|no acepta)\b/;

  /** Detecta comodidades en la descripción, ignorando las negadas ("sin piscina"). */
  function comodidadesDeTexto(texto) {
    const t = norm(texto || '');
    if (!t) return [];
    const out = [];
    COMODIDADES.forEach(([icono, etiqueta, re]) => {
      const g = new RegExp(re.source, 'g');
      let m, ok = false;
      while ((m = g.exec(t))) {
        // Solo se mira la frase corta anterior (hasta coma, punto, "con" o "pero").
        let previo = t.slice(Math.max(0, m.index - 40), m.index);
        previo = previo.split(/[.,;:\n]|\bcon\b|\bpero\b/).pop();
        if (!NEGACION.test(previo)) { ok = true; break; }
      }
      if (!ok) return;
      let texto2 = etiqueta;
      if (icono === 'vigilancia') texto2 = /(vigilancia|porteria|seguridad|celaduria)[^.,;]{0,20}(24|veinticuatro)/.test(t) ? 'Vigilancia 24 h' : 'Vigilancia';
      out.push({ icono, texto: texto2, com: true });
    });
    return out;
  }

  /* =============================================================
   * 2. LECTURA DEL ESPEJO (Google Sheets API, hoja pública)
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
   * 3. VISTA: los datos ya listos para mostrar
   * ============================================================= */
  function construirVista(inm) {
    const precio = aNumero(inm.precio);
    const canon  = aNumero(inm.canon);
    const srv = norm(inm.servicio);
    const enVenta = srv.includes('venta'), enArr = srv.includes('arriendo');
    const cuando = enVenta && enArr ? ' en venta y arriendo' : enArr ? ' en arriendo' : enVenta ? ' en venta' : '';

    // Precios: venta, arriendo o ambos
    const precios = [];
    if (precio) precios.push({ etiqueta: canon ? 'Venta' : 'Precio de venta', valor: pesos(precio), sufijo: '' });
    if (canon)  precios.push({ etiqueta: precio ? 'Arriendo' : 'Canon de arriendo', valor: pesos(canon), sufijo: '/mes' });
    if (!precios.length) precios.push({ etiqueta: 'Precio', valor: 'Consultar', sufijo: '' });

    // Tarjetas de datos (la página las desliza; la imagen usa las 3 primeras)
    const tarjetas = [];
    if (hayNum(inm.area))         tarjetas.push({ icono: 'area',  etiqueta: 'Área',     valor: inm.area, unidad: 'm²' });
    if (hayNum(inm.habitaciones)) tarjetas.push({ icono: 'cama',  etiqueta: 'Alcobas',  valor: inm.habitaciones });
    if (hayNum(inm.banos))        tarjetas.push({ icono: 'bano',  etiqueta: 'Baños',    valor: inm.banos });
    if (inm.parqueadero && !/^(0|no)/i.test(inm.parqueadero)) {
      const num = /^\d+$/.test(inm.parqueadero);
      tarjetas.push({
        icono: 'carro', etiqueta: 'Parqueadero', valor: inm.parqueadero,
        pildora: num ? plural(inm.parqueadero, 'parqueadero') : 'Parqueadero ' + inm.parqueadero.toLowerCase(),
      });
    }
    if (hayNum(inm.estrato)) tarjetas.push({ icono: 'estrato', etiqueta: 'Estrato', valor: inm.estrato, pildora: 'Estrato ' + inm.estrato });
    if (hayNum(inm.piso)) {
      const casa = esCasa(inm.tipo);
      tarjetas.push({ icono: 'piso', etiqueta: casa ? 'Niveles' : 'Piso', valor: inm.piso, pildora: (casa ? 'Niveles: ' : 'Piso ') + inm.piso });
    }
    const admin = aNumero(inm.administracion);
    if (admin) tarjetas.push({ icono: 'admin', etiqueta: 'Administración', valor: pesos(admin), unidad: '/mes', pildora: 'Administración ' + pesos(admin) + '/mes' });

    // Detalles cualitativos (círculos con ícono)
    const detalles = [];
    const pago = formaPago(inm.credito);
    if (pago) detalles.push({ icono: 'credito', texto: pago });
    if (esSi(inm.ascensor)) detalles.push({ icono: 'ascensor', texto: 'Con ascensor' });
    // Comodidades que aparecen en la descripción (sin repetir lo que ya hay; máximo 8 en total)
    comodidadesDeTexto(inm.observaciones).forEach(c => {
      if (detalles.length < 8 && !detalles.some(d => d.icono === c.icono)) detalles.push(c);
    });

    return {
      titulo: (inm.tipo || 'Inmueble') + cuando,
      proyecto: inm.proyecto || '',
      ubicacion: ubicacionTexto(inm),
      precios, tarjetas, detalles,
      descripcion: inm.observaciones || '',
      noDisponible: inm.estado && !/disponible/i.test(inm.estado) ? inm.estado : '',
    };
  }

  /* =============================================================
   * 4. RENDER
   * ============================================================= */
  function render(inm) {
    const v = construirVista(inm);
    const fotos = inm.fotos;

    /* Galería: foto principal deslizable + miniaturas */
    const slides = fotos.length
      ? fotos.map((f, i) => '<div class="hero-slide"><img src="' + esc(f) + '" alt="' + esc(v.titulo) + ' — foto ' + (i + 1)
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

    /* Precio */
    const precioHtml = '<section class="precio-card' + (v.precios.length > 1 ? ' dos' : '') + '" aria-label="Precio">'
      + v.precios.map(p => '<div class="precio-col"><p class="precio-etq">' + esc(p.etiqueta) + '</p>'
        + '<p class="precio-val">' + esc(p.valor) + (p.sufijo ? '<small>' + esc(p.sufijo) + '</small>' : '') + '</p></div>').join('')
      + '</section>';

    /* Tarjetas deslizables */
    const tarjetasHtml = v.tarjetas.length
      ? '<section class="tarjetas" aria-label="Datos del inmueble"><div class="tarjetas-track">'
        + v.tarjetas.map(t => '<div class="tarjeta"><span class="ico">' + ico(t.icono) + '</span>'
          + '<span class="tarjeta-etq">' + esc(t.etiqueta) + '</span>'
          + '<span class="tarjeta-val' + (String(t.valor).length > 7 ? ' largo' : '') + '">' + esc(t.valor)
          + (t.unidad ? '<small>' + esc(t.unidad) + '</small>' : '') + '</span></div>').join('')
        + '</div></section>'
      : '';

    /* Descripción + detalles */
    const detallesHtml = v.detalles.length
      ? '<div class="detalles' + (v.descripcion ? '' : ' solo') + '">'
        + v.detalles.map(d => '<div class="detalle"><span class="ico">' + ico(d.icono) + '</span><span>' + esc(d.texto) + '</span></div>').join('')
        + '</div>'
      : '';
    const cardHtml = (v.descripcion || v.detalles.length)
      ? '<section class="card">'
        + '<h2 class="sec-titulo">' + (v.descripcion ? 'Descripción' : 'Detalles') + '</h2><div class="cab-linea"></div>'
        + (v.descripcion
            ? '<p class="desc" id="desc">' + esc(v.descripcion) + '</p><button type="button" class="leer-mas" id="leer-mas" hidden>Leer más…</button>'
            : '')
        + detallesHtml
        + '</section>'
      : '';

    const dominio = (() => { try { return new URL(CFG.MARCA_URL).host; } catch (e) { return 'miraleads.pro'; } })();

    $app.innerHTML =
      '<header class="cab">'
      +   '<button type="button" class="btn-circulo cab-share" id="btn-compartir-top" aria-label="Compartir ficha">' + ico('share') + '</button>'
      +   '<h1 class="titulo">' + esc(v.titulo) + '</h1>'
      +   '<div class="cab-linea"></div>'
      +   (v.proyecto ? '<p class="proyecto">' + esc(v.proyecto) + '</p>' : '')
      +   (v.ubicacion ? '<p class="ubicacion">' + ico('pin') + '<span>' + esc(v.ubicacion) + '</span></p>' : '')
      + '</header>'

      + '<section class="galeria' + (miniaturas ? ' con-thumbs' : '') + '" aria-label="Fotos del inmueble">'
      +   '<div class="hero">'
      +     '<div class="hero-track" id="hero-track">' + slides + '</div>'
      +     (fotos.length > 1 ? '<span class="contador" id="contador">1 / ' + fotos.length + '</span>' : '')
      +     (v.noDisponible ? '<span class="etiqueta-estado">' + esc(v.noDisponible) + '</span>' : '')
      +   '</div>'
      +   (miniaturas ? '<div class="thumbs">' + miniaturas + '</div>' : '')
      + '</section>'

      + precioHtml
      + tarjetasHtml
      + cardHtml

      + '<footer class="pie">'
      +   '<div><span class="pie-kicker">Ficha creada con</span>'
      +     '<div class="marca">' + OJO + '<b>mira</b><span>leads</span></div></div>'
      +   '<a class="pie-cta" href="' + esc(CFG.MARCA_URL || '#') + '" target="_blank" rel="noopener">Conoce Mira Leads</a>'
      + '</footer>'

      + '<div class="barra">'
      +   '<button type="button" class="btn-compartir" id="btn-compartir">' + ico('share') + 'Compartir ficha</button>'
      +   (window.FichaImagen
            ? '<button type="button" class="btn-imagen" id="btn-imagen" aria-label="Crear imagen para estados y redes">'
              + ico('imagen') + '<span>Imagen</span></button>'
            : '')
      + '</div>';

    // Pestaña del navegador (WhatsApp no lee esto: lo hace functions/index.js)
    document.title = v.titulo + (v.ubicacion ? ' · ' + v.ubicacion : '') + ' · ' + (CFG.MARCA || 'Ficha');

    conectarEventos(inm, v);
  }

  /* =============================================================
   * 5. INTERACCIÓN
   * ============================================================= */

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
  function mensajeCompartir(inm) {
    const precio = aNumero(inm.precio);
    const canon  = aNumero(inm.canon);
    const srv = norm(inm.servicio);
    const enVenta = srv.includes('venta'), enArr = srv.includes('arriendo');
    const cuando = enVenta && enArr ? ' en venta y arriendo' : enArr ? ' en arriendo' : enVenta ? ' en venta' : '';

    const lineas = [];
    if (precio) lineas.push('Precio de venta: ' + pesos(precio));
    if (canon)  lineas.push((precio ? 'Precio de arriendo: ' : 'Canon de arriendo: ') + pesos(canon) + '/mes');
    if (hayNum(inm.area))         lineas.push(inm.area + ' m²');
    if (hayNum(inm.habitaciones)) lineas.push(plural(inm.habitaciones, 'alcoba'));
    if (hayNum(inm.banos))        lineas.push(plural(inm.banos, 'baño'));
    if (inm.parqueadero && !/^(0|no)/i.test(inm.parqueadero)) {
      lineas.push(/^\d+$/.test(inm.parqueadero) ? plural(inm.parqueadero, 'parqueadero') : 'Parqueadero ' + inm.parqueadero.toLowerCase());
    }
    if (hayNum(inm.estrato)) lineas.push('Estrato: ' + inm.estrato);

    const donde = ubicacionTexto(inm);
    const titulo = (inm.tipo || 'Inmueble') + cuando + (donde ? ' · ' + donde : '');
    return '*' + titulo + '*\n'
      + lineas.map(l => '• ' + l).join('\n')
      + '\n• Más información y fotos:\n'
      + linkCanonico();
  }

  function conectarEventos(inm, v) {
    const fotos = inm.fotos;
    const track = document.getElementById('hero-track');
    const indiceActual = () => Math.max(0, Math.round(track.scrollLeft / (track.clientWidth || 1)));

    // Miniaturas y contador ↔ carrusel
    const thumbs = Array.from(document.querySelectorAll('.thumb'));
    const contador = document.getElementById('contador');
    let raf = 0;
    track.addEventListener('scroll', () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const i = indiceActual();
        thumbs.forEach(t => t.setAttribute('aria-current', String(Number(t.dataset.i) === i)));
        if (contador) contador.textContent = (i + 1) + ' / ' + fotos.length;
      });
    }, { passive: true });

    thumbs.forEach(t => t.addEventListener('click', () => {
      const i = Number(t.dataset.i);
      if (t.querySelector('.thumb-mas')) { abrirVisor(fotos, i); return; }
      track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' });
    }));

    // Tocar la foto grande abre el visor
    track.addEventListener('click', e => {
      if (e.target.tagName !== 'IMG') return;
      abrirVisor(fotos, indiceActual());
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

    // Imagen para estados y redes
    const btnImagen = document.getElementById('btn-imagen');
    if (btnImagen) btnImagen.addEventListener('click', () => crearImagen(inm, v, fotos.length ? indiceActual() : -1, btnImagen));
  }

  /* ---- Imagen vertical para estados y redes ---- */
  async function crearImagen(inm, v, indiceFoto, boton) {
    const etiqueta = boton.querySelector('span');
    const textoOriginal = etiqueta.textContent;
    boton.disabled = true; etiqueta.textContent = 'Creando…';
    try {
      const sheet  = param('sheet').trim();
      const codigo = (param('codigo') || param('id')).trim();
      // Misma foto que se está viendo, en mayor resolución, desde nuestro propio dominio.
      const fotoUrl = indiceFoto >= 0
        ? '/foto?sheet=' + encodeURIComponent(sheet) + '&codigo=' + encodeURIComponent(codigo) + '&n=' + indiceFoto + '&w=1600'
        : '';
      const dominio = (() => { try { return new URL(CFG.MARCA_URL).host; } catch (e) { return 'miraleads.pro'; } })();
      const blob = await window.FichaImagen.generar(v, { fotoUrl, colores: COLORES, dominio, iconoSvg });
      mostrarImagen(blob, inm);
    } catch (e) {
      console.error('[ficha] imagen:', e);
      aviso('No se pudo crear la imagen. Intenta de nuevo');
    } finally {
      boton.disabled = false; etiqueta.textContent = textoOriginal;
    }
  }

  function mostrarImagen(blob, inm) {
    const codigo = (param('codigo') || param('id')).trim() || 'inmueble';
    const nombre = 'ficha-' + codigo.toLowerCase().replace(/[^a-z0-9_-]/g, '') + '.png';
    const archivo = new File([blob], nombre, { type: 'image/png' });
    const urlObj = URL.createObjectURL(blob);
    const puedeCompartir = !!(navigator.canShare && navigator.canShare({ files: [archivo] }));

    const modal = document.createElement('div');
    modal.className = 'modal-img';
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-label', 'Imagen para estados y redes');
    modal.innerHTML =
      '<button type="button" class="btn-circulo modal-img-cerrar" aria-label="Cerrar">' + ico('cerrar') + '</button>'
      + '<img src="' + urlObj + '" alt="Vista previa de la imagen">'
      + '<p class="modal-img-nota">Al compartir, la imagen va con el texto y el enlace de la ficha. Si la guardas, usa «Copiar enlace» para pegarlo junto a la imagen.</p>'
      + '<div class="modal-img-acciones">'
      +   (puedeCompartir ? '<button type="button" class="primario" id="img-compartir">' + ico('share') + 'Compartir</button>' : '')
      +   '<button type="button" id="img-enlace">' + ico('share') + 'Copiar enlace</button>'
      +   '<button type="button" id="img-guardar">' + ico('bajar') + 'Guardar imagen</button>'
      + '</div>';
    document.body.appendChild(modal);
    document.body.style.overflow = 'hidden';

    const cerrar = () => {
      modal.remove(); URL.revokeObjectURL(urlObj);
      document.body.style.overflow = '';
      document.removeEventListener('keydown', teclas);
    };
    const teclas = e => { if (e.key === 'Escape') cerrar(); };
    document.addEventListener('keydown', teclas);
    modal.querySelector('.modal-img-cerrar').addEventListener('click', cerrar);
    modal.addEventListener('click', e => { if (e.target === modal) cerrar(); });

    modal.querySelector('#img-guardar').addEventListener('click', () => {
      const a = document.createElement('a');
      a.href = urlObj; a.download = nombre;
      document.body.appendChild(a); a.click(); a.remove();
      aviso('Imagen guardada');
    });
    modal.querySelector('#img-enlace').addEventListener('click', async () => {
      const txt = mensajeCompartir(inm);
      try { await navigator.clipboard.writeText(txt); aviso('Texto con enlace copiado'); }
      catch (e) { aviso('No se pudo copiar'); }
    });
    const btnCompartir = modal.querySelector('#img-compartir');
    if (btnCompartir) btnCompartir.addEventListener('click', async () => {
      try { await navigator.share({ files: [archivo], text: mensajeCompartir(inm) }); }
      catch (e) { if (!e || e.name !== 'AbortError') aviso('No se pudo compartir. Prueba con "Guardar imagen"'); }
    });
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
      + '<button type="button" class="btn-circulo" id="visor-cerrar" aria-label="Cerrar">' + ico('cerrar') + '</button></div>'
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
