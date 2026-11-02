/**
 * functions/index.js — VISTA PREVIA DE WHATSAPP PARA CADA INMUEBLE
 * ================================================================
 * Ruta: /   (Cloudflare Pages Function)
 *
 * WhatsApp, Facebook, etc. NO ejecutan JavaScript: leen las etiquetas og: que
 * trae el HTML. Como index.html es el mismo para todos los inmuebles, aquí
 * (antes de entregarlo) se reemplazan por las del inmueble de ?sheet=&codigo=.
 *
 * Si algo falla (sin clave, inmueble no encontrado, Google caído…) se entrega
 * index.html tal cual, con la vista previa genérica. La página nunca se rompe.
 * El encabezado X-Ficha-OG dice qué pasó (ok | sin-parametros | sin-clave | …).
 */

import {
  buscarInmueble, parametrosValidos,
  tituloVistaPrevia, descripcionVistaPrevia, candidatosFoto,
} from './_lib/inmueble.js';

const MARCA = 'Mira Leads';

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function marcar(respuesta, estado) {
  const r = new Response(respuesta.body, respuesta);
  r.headers.set('X-Ficha-OG', estado);
  return r;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // index.html estático (Cloudflare Pages lo sirve por el binding ASSETS).
  const original = await env.ASSETS.fetch(request);

  const sheet  = (url.searchParams.get('sheet') || '').trim();
  const codigo = (url.searchParams.get('codigo') || url.searchParams.get('id') || '').trim();
  if (!parametrosValidos(sheet, codigo)) return marcar(original, 'sin-parametros');

  try {
    const { inm, motivo } = await buscarInmueble(env, url.origin, sheet, codigo);
    if (!inm) return marcar(original, motivo || 'no-encontrado');

    const titulo = tituloVistaPrevia(inm);
    const desc   = descripcionVistaPrevia(inm);
    const canon  = url.origin + '/?sheet=' + encodeURIComponent(sheet) + '&codigo=' + encodeURIComponent(codigo);

    // La imagen solo se anuncia si se puede servir (host permitido).
    const hayFoto = inm.fotos.length > 0 && candidatosFoto(inm.fotos[0]).length > 0;
    const imagen  = url.origin + '/foto?sheet=' + encodeURIComponent(sheet) + '&codigo=' + encodeURIComponent(codigo);

    const tags = [
      '<meta property="og:type" content="website">',
      '<meta property="og:site_name" content="' + esc(MARCA) + '">',
      '<meta property="og:locale" content="es_CO">',
      '<meta property="og:title" content="' + esc(titulo) + '">',
      desc ? '<meta property="og:description" content="' + esc(desc) + '">' : '',
      '<meta property="og:url" content="' + esc(canon) + '">',
      hayFoto ? '<meta property="og:image" content="' + esc(imagen) + '">' : '',
      hayFoto ? '<meta property="og:image:alt" content="' + esc(titulo) + '">' : '',
      '<meta name="twitter:card" content="' + (hayFoto ? 'summary_large_image' : 'summary') + '">',
      desc ? '<meta name="description" content="' + esc(desc) + '">' : '',
    ].join('\n  ');

    const reescrita = new HTMLRewriter()
      .on('meta[property^="og:"], meta[name^="twitter:"], meta[name="description"]', {
        element(el) { el.remove(); },
      })
      .on('title', { element(el) { el.setInnerContent(titulo + ' · ' + MARCA); } })
      .on('head', { element(el) { el.append('\n  ' + tags + '\n', { html: true }); } })
      .transform(original);

    const salida = new Response(reescrita.body, reescrita);
    salida.headers.set('X-Ficha-OG', 'ok');
    salida.headers.set('Cache-Control', 'public, max-age=120');
    return salida;
  } catch (e) {
    return marcar(original, 'error');
  }
}
