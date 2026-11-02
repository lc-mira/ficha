# ficha — Ficha pública de inmueble (Mira Leads)

Plantilla única y **pública** para todos los clientes de Mira Leads. Muestra un inmueble
para compartir con colegas, **sin datos del propietario ni del asesor que lo capta**.

    https://ficha.miraleads.pro/?sheet=<ID_DEL_ESPEJO>&codigo=<ID_DEL_INMUEBLE>

El repo no contiene nada de ningún cliente: el cliente llega en la URL.

## Cómo funciona

| Archivo | Qué hace |
|---|---|
| `index.html`, `css/ficha.css`, `js/ficha.js` | La ficha. Lee la hoja **Espejo** pública con la Google Sheets API. |
| `js/config.js` | API key (restringida por referrer a `ficha.miraleads.pro`), marca y colores. |
| `functions/index.js` | Cloudflare Pages Function. Reemplaza las etiquetas `og:` del HTML con las del inmueble para que WhatsApp muestre la vista previa. |
| `functions/foto.js` | Sirve la foto principal liviana (~800 px) desde nuestro dominio para la vista previa. |
| `functions/_lib/inmueble.js` | Lectura del Espejo en el servidor, textos de la vista previa y lista de hosts de foto permitidos. |
| `_routes.json` | Solo `/` y `/foto` ejecutan funciones; el resto son archivos estáticos. |

## Privacidad (lista blanca)

`js/ficha.js` y `functions/_lib/inmueble.js` leen **solo** las columnas que declaran en `CAMPOS`.
Nunca se leen ni se muestran: Captación, Link Ficha (CRM del colega), Fecha Venta, Encargado,
Celular, Notas Privadas, Documentos ni Comisión. Una columna nueva en el Espejo no aparece
hasta que se agrega a propósito a esas listas.

La vista previa tampoco usa "Observaciones" (texto libre).

## Mantener sincronizado

El título del mensaje de compartir (`mensajeCompartir` en `js/ficha.js`) y el de la vista previa
(`tituloVistaPrevia` en `functions/_lib/inmueble.js`) usan la misma lógica. Si cambias uno, cambia el otro.

## Despliegue

Cloudflare Pages conectado a este repo (rama `main`, sin comando de build). La función lee la API key
de `js/config.js`; opcionalmente se puede sobrescribir con la variable de entorno `API_KEY`.
Para depurar la vista previa: `curl -I "https://ficha.miraleads.pro/?sheet=...&codigo=..."` y revisar
el encabezado `X-Ficha-OG` (`ok`, `sin-parametros`, `sin-clave`, `hoja`, `formato`, `no-encontrado`, `error`).
