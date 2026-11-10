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
  administracion: h => h.startsWith('administracion') || h.startsWith('admon'),
  ascensor:     h => h.startsWith('ascensor'),
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
  inm.fotos = (inm.fotos || '').split(/[\n,]+/).map(u => u.trim()).filter(Boolean);
  return { inm };
}

/* ---------- texto de la vista previa ---------- */
/** OJO: js/ficha.js (mensajeCompartir) arma el título con la misma lógica. */
export function tituloVistaPrevia(inm) {
  const srv = norm(inm.servicio);
  const enVenta = srv.includes('venta'), enArr = srv.includes('arriendo');
  const cuando = enVenta && enArr ? ' en venta y arriendo' : enArr ? ' en arriendo' : enVenta ? ' en venta' : '';
  const lugar = [inm.barrio, inm.ciudad].filter(Boolean).join(', ');
  return (inm.tipo || 'Inmueble') + cuando + (lugar ? ' · ' + lugar : '');
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
  if (/^s[ií]/i.test(norm(inm.ascensor)))           partes.push('Ascensor');
  const admon = aNumero(inm.administracion);
  if (admon)                                        partes.push('Admón. ' + pesos(admon));
  return partes.join(' · ');
}

/* ---------- foto principal ---------- */
/**
 * Direcciones desde donde pedir una versión liviana (~800 px) de la foto.
 * WhatsApp descarta imágenes pesadas, y la foto original puede ser de 1600 px.
 * Devuelve [] si el host no está permitido.
 */
export function candidatosFoto(urlFoto) {
  let u;
  try { u = new URL(urlFoto); } catch (e) { return []; }
  if (u.protocol !== 'https:' || !HOSTS_FOTO.includes(u.hostname)) return [];

  const enRuta = u.pathname.match(/\/d\/([\w-]{10,})/);
  const id = enRuta ? enRuta[1] : u.searchParams.get('id');
  if (u.hostname === 'lh3.googleusercontent.com' && !/^\/d\//.test(u.pathname)) {
    return [urlFoto.replace(/=[swh]\d+[^/]*$/, '') + '=w800'];
  }
  if (id && /^[\w-]{10,}$/.test(id)) {
    return [
      'https://drive.google.com/thumbnail?id=' + id + '&sz=w800',
      'https://lh3.googleusercontent.com/d/' + id + '=w800',
      'https://drive.google.com/uc?export=view&id=' + id,
    ];
  }
  return [];
}
