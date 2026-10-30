/**
 * config.js — CONFIGURACIÓN DE LA FICHA COMPARTIDA
 * ================================================
 * Este repo es PÚBLICO y lo usan todos los clientes de Mira Leads.
 * Por eso aquí NO va nada de un cliente en particular: el cliente
 * llega en la URL (?sheet=ID_DEL_ESPEJO&codigo=P0001).
 *
 * API_KEY:
 *   - Una sola clave de Google (Sheets API) para toda la ficha.
 *   - Es visible en el navegador, como en cualquier sitio estático, así que
 *     DEBE estar restringida en Google Cloud Console:
 *       · Restricción de aplicación: sitios web (HTTP referrers) → https://ficha.miraleads.pro/*
 *       · Restricción de API: solo "Google Sheets API"
 *   - Sin esas restricciones, cualquiera podría copiarla y gastar tu cuota.
 */
window.FICHA_CONFIG = {
  API_KEY: 'AIzaSyC-0QPRPjfeksjRDD8bU2oswr8lwGZg_S4',

  MARCA:     'Mira Leads',
  MARCA_URL: 'https://miraleads.pro',

  CIUDAD: 'Cali',
  PAIS:   'Colombia',

  COLOR_PRIMARIO: '#0f5b4f',
  COLOR_ACENTO:   '#e7f2ef',
};
