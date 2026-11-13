/**
 * _lib/inmueble.js — LECTURA DEL ESPEJO EN EL SERVIDOR (Cloudflare Pages Functions)
 * =================================================================================
 * Lo usan functions/index.js (etiquetas de la vista previa) y functions/foto.js
 * (foto principal liviana). Corre en el borde de Cloudflare, no en el navegador.
 *
 * PRIVACIDAD: igual que js/ficha.js, solo se leen las columnas de CAMPOS.
 * Nunca captación, link externo, encargado, celular, notas, documentos ni comisión.
 * La vista previa tampoco usa "Observaciones" (texto libre): solo datos fijos.
 *
 * La carpeta empieza con "_" y este archivo no exporta onRequest*, así que
 * Cloudflare NO lo publica como ruta.
 */

const CAMPOS = {
  id:           h => h === 'id',
  tipo:         h => h === 'tipo',
  barrio:       h => h.startsWith('barrio') || h.startsWith('zona'),
  ciudad:       h => h === 'ciudad',
  precio:       h => h.startsWith('precio'),
  canon:        h => h.startsWith('canon'),
  area:         h => h.startsWith('area'),
  habitaciones: h => h.startsWith('habitacion'),
  banos:        h => h.startsWith('bano'),
  estrato:      h => h === 'estrato',
  servicio:     h => h === 'servicio',
  fotos:        h => h.includes('foto'),
};

/** Solo se aceptan fotos de estos hosts (evita que /foto sea un proxy abierto). */
const HOSTS_FOTO = ['drive.google.com', 'lh3.googleusercontent.com', 'drive.usercontent.google.com'];

const REFERER_POR_DEFECTO = 'https://ficha.miraleads.pro/';

/* ---------- utilidades ---------- */
export function norm(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
}
export function aNumero(v) {
  const limpio = String(v || '').replace(/[^\d]/g, '');
  return limpio ? parseInt(limpio, 10) : 0;
}
export function pesos(n) { return '$' + Number(n).toLocaleString('es-CO'); }

/** Mismas reglas que valida js/ficha.js en el navegador. */
export function parametrosValidos(sheet, codigo) {
  return /^[A-Za-z0-9_-]{20,80}$/.test(sheet) && /^[A-Za-z0-9_-]{1,40}$/.test(codigo);
}

/* ---------- API key ---------- */
/**
 * La clave sale de js/config.js (una sola fuente de verdad) o, si existe, de la
 * variable de entorno API_KEY de Cloudflare. Es la misma clave restringida por
 * referrer que usa el navegador, por eso las llamadas del servidor llevan el
 * encabezado Referer de la ficha.
 */
async function obtenerApiKey(env, origin) {
  if (env.API_KEY) return env.API_KEY;
  try {
    const r = await env.ASSETS.fetch(new URL('/js/config.js', origin));
    const m = (await r.text()).match(/API_KEY:\s*'([^']+)'/);
    if (m && !m[1].startsWith('PENDIENTE')) return m[1];
  } catch (e) { /* sin clave: la vista previa queda genérica */ }
  return '';
}

/* ---------- lectura ---------- */
/**
 * @returns {Promise<{inm?: object, motivo?: string}>}
 *   motivo: 'sin-clave' | 'hoja' | 'formato' | 'no-encontrado'
 */
export async function buscarInmueble(env, origin, sheet, codigo) {
  const key = await obtenerApiKey(env, origin);
  if (!key) return { motivo: 'sin-clave' };

  const base = env.SHEETS_BASE || 'https://sheets.googleapis.com';
  const url = base + '/v4/spreadsheets/' + encodeURIComponent(sheet)
            + '/values/Portafolio?key=' + encodeURIComponent(key)
            + '&valueRenderOption=FORMATTED_VALUE';

  let resp;
  try {
    resp = await fetch(url, {
      headers: { Referer: env.REFERER || REFERER_POR_DEFECTO },
      cf: { cacheTtl: 60, cacheEverything: true },
    });
  } catch (e) { return { motivo: 'hoja' }; }
  if (!resp.ok) return { motivo: 'hoja' };

  const data = await resp.json();
  const filas = data.values || [];
  if (filas.length < 2) return { motivo: 'no-encontrado' };

  const idx = {};
  filas[0].forEach((encabezado, i) => {
    const h = norm(encabezado);
    Object.keys(CAMPOS).forEach(clave => {
      if (idx[clave] === undefined && CAMPOS[clave](h)) idx[clave] = i;
    });
  });
  if (idx.id === undefined) return { motivo: 'formato' };

  const buscado = codigo.toUpperCase();
  const fila = filas.slice(1).find(f => String(f[idx.id] || '').trim().toUpperCase() === buscado);
  if (!fila) return { motivo: 'no-encontrado' };

  const inm = {};
  Object.keys(idx).forEach(clave => { inm[clave] = String(fila[idx[clave]] || '').trim(); });
  // Mismo criterio que js/ficha.js (solo https): así el índice ?n= de /foto coincide con el del navegador.
  inm.fotos = (inm.fotos || '').split(/[\n,]+/).map(u => u.trim()).filter(u => /^https:\/\//i.test(u));
  return { inm };
}

/* ---------- texto de la vista previa ---------- */
/**
 * "Barrio, Ciudad" sin repetir la ciudad si el barrio ya la trae (ej. "Ciudad Córdoba, Cali")
 * y sin inventar una ciudad por defecto (hay inmuebles en Cali, Palmira, Jamundí…).
 * OJO: js/ficha.js (ubicacionTexto) usa la misma lógica.
 */
export function ubicacionTexto(inm) {
  const partes = [];
  if (inm.barrio) partes.push(inm.barrio);
  if (inm.ciudad && !norm(inm.barrio).includes(norm(inm.ciudad))) partes.push(inm.ciudad);
  return partes.join(', ');
}

/** OJO: js/ficha.js (mensajeCompartir) arma el título con la misma lógica. */
export function tituloVistaPrevia(inm) {
  const srv = norm(inm.servicio);
  const enVenta = srv.includes('venta'), enArr = srv.includes('arriendo');
  const cuando = enVenta && enArr ? ' en venta y arriendo' : enArr ? ' en arriendo' : enVenta ? ' en venta' : '';
  const donde = ubicacionTexto(inm);
  return (inm.tipo || 'Inmueble') + cuando + (donde ? ' · ' + donde : '');
}

export function descripcionVistaPrevia(inm) {
  const precio = aNumero(inm.precio);
  const canon  = aNumero(inm.canon);
  const partes = [];
  if (precio) partes.push(pesos(precio));
  else if (canon) partes.push(pesos(canon) + '/mes');
  if (inm.area && inm.area !== '0')                 partes.push(inm.area + ' m²');
  if (inm.habitaciones && inm.habitaciones !== '0') partes.push(inm.habitaciones + (Number(inm.habitaciones) === 1 ? ' alcoba' : ' alcobas'));
  if (inm.banos && inm.banos !== '0')               partes.push(inm.banos + (Number(inm.banos) === 1 ? ' baño' : ' baños'));
  if (inm.estrato && inm.estrato !== '0')           partes.push('Estrato ' + inm.estrato);
  return partes.join(' · ');
}

/* ---------- foto principal ---------- */
/** Anchos permitidos para /foto?w= (800 = vista previa de WhatsApp; 1600 = imagen para estados). */
export const ANCHOS_FOTO = [800, 1200, 1600];

/**
 * Direcciones desde donde pedir una versión liviana de la foto.
 * WhatsApp descarta imágenes pesadas, y la foto original puede ser muy grande.
 * Devuelve [] si el host no está permitido.
 * @param {string} urlFoto
 * @param {number} [ancho=800] uno de ANCHOS_FOTO
 */
export function candidatosFoto(urlFoto, ancho) {
  const w = ANCHOS_FOTO.includes(ancho) ? ancho : 800;
  let u;
  try { u = new URL(urlFoto); } catch (e) { return []; }
  if (u.protocol !== 'https:' || !HOSTS_FOTO.includes(u.hostname)) return [];

  const enRuta = u.pathname.match(/\/d\/([\w-]{10,})/);
  const id = enRuta ? enRuta[1] : u.searchParams.get('id');
  if (u.hostname === 'lh3.googleusercontent.com' && !/^\/d\//.test(u.pathname)) {
    return [urlFoto.replace(/=[swh]\d+[^/]*$/, '') + '=w' + w];
  }
  if (id && /^[\w-]{10,}$/.test(id)) {
    return [
      'https://drive.google.com/thumbnail?id=' + id + '&sz=w' + w,
      'https://lh3.googleusercontent.com/d/' + id + '=w' + w,
      'https://drive.google.com/uc?export=view&id=' + id,
    ];
  }
  return [];
}
