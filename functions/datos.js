/**
 * functions/datos.js — DATOS PÚBLICOS DE UNA FICHA (JSON)
 * =======================================================
 * Ruta: /datos?sheet=<ID_ESPEJO>&codigo=<ID_INMUEBLE>
 *
 * Lo usa el panel (panel.miraleads.pro) para llenar el formulario de un inmueble a partir
 * del link de una ficha de otro agente de Mira Leads.
 *
 * PRIVACIDAD: devuelve solo lo que la ficha pública ya muestra (CAMPOS_COMPLETOS):
 * nunca captación, link externo, encargado, celular, notas, documentos ni comisión.
 * Solo responde a pedidos desde el panel (CORS restringido a ese origen).
 */

import { buscarInmueble, parametrosValidos, CAMPOS_COMPLETOS } from './_lib/inmueble.js';

const ORIGEN_PANEL = 'https://panel.miraleads.pro';

function json(cuerpo, status) {
  return new Response(JSON.stringify(cuerpo), {
    status: status || 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Access-Control-Allow-Origin': ORIGEN_PANEL,
      'Vary': 'Origin',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const sheet  = (url.searchParams.get('sheet') || '').trim();
  const codigo = (url.searchParams.get('codigo') || url.searchParams.get('id') || '').trim();
  if (!parametrosValidos(sheet, codigo)) return json({ ok: false, error: 'Enlace inválido.' }, 400);

  const { inm, motivo } = await buscarInmueble(env, url.origin, sheet, codigo, CAMPOS_COMPLETOS);
  if (!inm) {
    const msg = motivo === 'no-encontrado'
      ? 'Ese inmueble ya no está en la ficha (pudo venderse o retirarse).'
      : 'No se pudo leer la ficha en este momento.';
    return json({ ok: false, error: msg }, motivo === 'no-encontrado' ? 404 : 502);
  }
  return json({ ok: true, datos: inm });
}
