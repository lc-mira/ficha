/**
 * functions/foto.js — FOTO PRINCIPAL LIVIANA PARA LA VISTA PREVIA
 * ===============================================================
 * Ruta: /foto?sheet=<ID_ESPEJO>&codigo=<ID_INMUEBLE>
 *
 * Es la imagen que anuncia og:image. Se sirve desde nuestro propio dominio
 * porque WhatsApp falla con los links de Drive o descarta fotos pesadas.
 *
 * Seguridad: NO recibe una URL. Busca la primera foto del inmueble en el Espejo
 * y solo la pide si es de Google Drive (HOSTS_FOTO), así no sirve de proxy abierto.
 */

import { buscarInmueble, parametrosValidos, candidatosFoto, ANCHOS_FOTO } from './_lib/inmueble.js';

const MAX_BYTES = 2500000; // WhatsApp ignora imágenes muy pesadas; la de 800 px pesa mucho menos

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  const sheet  = (url.searchParams.get('sheet') || '').trim();
  const codigo = (url.searchParams.get('codigo') || url.searchParams.get('id') || '').trim();
  if (!parametrosValidos(sheet, codigo)) return new Response('Enlace inválido', { status: 400 });

  // ?n= qué foto (0 = la principal), ?w= ancho en px. Valores raros → los de la vista previa.
  const n = /^\d{1,2}$/.test(url.searchParams.get('n') || '') ? Number(url.searchParams.get('n')) : 0;
  const pedido = Number(url.searchParams.get('w'));
  const ancho = ANCHOS_FOTO.includes(pedido) ? pedido : 800;

  const { inm } = await buscarInmueble(env, url.origin, sheet, codigo);
  if (!inm || !inm.fotos[n]) return new Response('Sin foto', { status: 404 });

  for (const candidata of candidatosFoto(inm.fotos[n], ancho)) {
    try {
      const r = await fetch(candidata, { redirect: 'follow', cf: { cacheTtl: 86400, cacheEverything: true } });
      const tipo = r.headers.get('content-type') || '';
      const peso = Number(r.headers.get('content-length') || 0);
      if (!r.ok || !/^image\//i.test(tipo) || peso > MAX_BYTES) continue;
      return new Response(r.body, {
        headers: {
          'Content-Type': tipo,
          'Cache-Control': 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch (e) { /* prueba la siguiente dirección */ }
  }
  return new Response('Foto no disponible', { status: 404 });
}
