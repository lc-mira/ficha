/**
 * imagen.js — IMAGEN VERTICAL (1080×1920) PARA ESTADOS Y REDES
 * ============================================================
 * Dibuja la ficha en un <canvas> con el mismo lenguaje visual de la página y
 * devuelve un PNG. Recibe el MISMO objeto "vista" que usa la página
 * (js/ficha.js → construirVista), que solo contiene datos públicos.
 *
 * Diseño pensado para historias (WhatsApp, Instagram, Facebook):
 *  - La foto ocupa el borde superior: ahí la historia pone su barra de perfil.
 *  - Lo importante queda entre y≈250 y y≈1700 (zonas seguras).
 *  - El pie de marca va por encima de la barra de "Responder".
 *
 * La foto se pide a /foto (mismo dominio) para que el canvas no quede
 * "contaminado" por CORS y se pueda exportar. Si /foto no responde, la imagen
 * se genera igual, con un recuadro "Sin foto".
 */

'use strict';

window.FichaImagen = (function () {

  const W = 1080, H = 1920;
  const M = 48;                 // margen lateral
  const G = 26;                 // espacio entre bloques
  const FUENTE = "Poppins, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif";

  /* =============================================================
   * Utilidades de dibujo
   * ============================================================= */
  function ruta(ctx, x, y, w, h, r) {
    const [tl, tr, br, bl] = Array.isArray(r) ? r : [r, r, r, r];
    ctx.beginPath();
    ctx.moveTo(x + tl, y);
    ctx.lineTo(x + w - tr, y);     ctx.arcTo(x + w, y, x + w, y + tr, tr);
    ctx.lineTo(x + w, y + h - br); ctx.arcTo(x + w, y + h, x + w - br, y + h, br);
    ctx.lineTo(x + bl, y + h);     ctx.arcTo(x, y + h, x, y + h - bl, bl);
    ctx.lineTo(x, y + tl);         ctx.arcTo(x, y, x + tl, y, tl);
    ctx.closePath();
  }

  function conSombra(ctx, color, blur, dy, dibujar) {
    ctx.save();
    ctx.shadowColor = color; ctx.shadowBlur = blur; ctx.shadowOffsetY = dy;
    dibujar();
    ctx.restore();
  }

  function fijarFuente(ctx, size, peso, tracking) {
    ctx.font = peso + ' ' + size + 'px ' + FUENTE;
    if ('letterSpacing' in ctx) ctx.letterSpacing = (tracking || 0) + 'px';
  }

  function medir(ctx, t, size, peso, tracking) {
    fijarFuente(ctx, size, peso, tracking);
    const w = ctx.measureText(t).width;
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    return w;
  }

  function texto(ctx, t, x, y, o) {
    fijarFuente(ctx, o.size, o.peso || 400, o.tracking);
    ctx.fillStyle = o.color;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(t, x, y);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
  }

  function envolver(ctx, t, size, peso, tracking, maxW) {
    const lineas = []; let actual = '';
    t.split(/\s+/).forEach(p => {
      const prueba = actual ? actual + ' ' + p : p;
      if (!actual || medir(ctx, prueba, size, peso, tracking) <= maxW) actual = prueba;
      else { lineas.push(actual); actual = p; }
    });
    if (actual) lineas.push(actual);
    return lineas;
  }

  function cargarImagen(src) {
    return new Promise((ok, mal) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => mal(new Error('imagen no cargó'));
      i.src = src;
    });
  }

  async function cargarFoto(url) {
    if (!url) return null;
    try {
      const r = await fetch(url);
      if (!r.ok) return null;
      const u = URL.createObjectURL(await r.blob());
      try { return await cargarImagen(u); } finally { URL.revokeObjectURL(u); }
    } catch (e) { return null; }
  }

  async function cargarIcono(svg) {
    return cargarImagen('data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg));
  }

  function cubrir(ctx, img, x, y, w, h) {
    const k = Math.max(w / img.width, h / img.height);
    const dw = img.width * k, dh = img.height * k;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  }

  function rellenoAcento(ctx, c, x, y, w, h) {
    const g = ctx.createLinearGradient(x, y, x + w, y + h);
    g.addColorStop(0, c.oscuro); g.addColorStop(.55, c.acento); g.addColorStop(1, c.claro);
    return g;
  }

  function lineaFirma(ctx, c, cx, y, w) {
    const g = ctx.createLinearGradient(cx - w / 2, 0, cx + w / 2, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(.22, c.claro);
    g.addColorStop(.5, c.acento); g.addColorStop(.78, c.claro); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ruta(ctx, cx - w / 2, y, w, 4, 2); ctx.fill();
  }

  /** Marca "ojo" (mismo símbolo del pie de la página). */
  function dibujarOjo(ctx, c, cx, cy, r) {
    ctx.save();
    ctx.strokeStyle = c.acento; ctx.fillStyle = c.acento; ctx.lineWidth = r * .22;
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * .4, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  }

  /* =============================================================
   * Generación
   * @param {Object} v  vista pública (titulo, proyecto, ubicacion, precios, tarjetas, detalles, noDisponible)
   * @param {Object} o  { fotoUrl, colores:{acento,oscuro,claro,suave}, dominio, iconoSvg(nombre,color) }
   * @returns {Promise<Blob>} PNG
   * ============================================================= */
  async function generar(v, o) {
    const c = o.colores;

    // Tipografía: esperar a que Poppins esté lista (si no, se usa la del sistema).
    try {
      await Promise.all([400, 500, 600, 700].map(p => document.fonts.load(p + ' 32px Poppins')));
    } catch (e) { /* sigue con la fuente de respaldo */ }

    const foto = await cargarFoto(o.fotoUrl);

    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d');

    /* ---------- Medidas (de arriba hacia abajo, la foto absorbe lo que sobre) ---------- */
    const cardW = W - M * 2;

    // Título: hasta 2 líneas; baja el tamaño si no cabe.
    const titulo = (v.titulo || 'Inmueble').toUpperCase();
    let tSize = 54, tLineas = [];
    for (const s of [54, 48, 42, 36]) {
      tSize = s; tLineas = envolver(ctx, titulo, s, 600, s * .07, cardW - 130);
      if (tLineas.length <= 2) break;
    }
    const tLinea = Math.round(tSize * 1.28);
    // Posiciones dentro de la tarjeta del título (relativas a su borde superior).
    const base1   = 52 + Math.round(tSize * .95);                 // primera línea del título
    const baseUlt = base1 + (tLineas.length - 1) * tLinea;        // última línea del título
    const lineaY  = baseUlt + 28;                                  // línea degradada
    let cursor = lineaY + 4;
    const proyecY = v.proyecto  ? (cursor += 52) : 0;              // baseline del nombre del proyecto
    const ubicY   = v.ubicacion ? (cursor += (v.proyecto ? 50 : 52)) : 0;
    const tituloH = cursor + 46;
    const SOLAPE = 70;

    const precioH = 176;

    const tarjetas = v.tarjetas.slice(0, 3);
    const statsH = tarjetas.length ? 176 : 0;

    // Píldoras con lo demás: se llenan de izquierda a derecha, sin saltar de línea.
    const textosPildora = v.tarjetas.slice(3).map(t => t.pildora).concat(v.detalles.map(d => d.texto)).filter(Boolean);
    const pildoras = [];
    let usado = 0;
    textosPildora.forEach(t => {
      const w = medir(ctx, t, 28, 500, 0) + 60;
      const sig = usado + (pildoras.length ? 14 : 0) + w;
      if (sig <= cardW) { pildoras.push({ t, w }); usado = sig; }
    });
    // Las que no cupieron en la fila se pierden: la fila es de 3 datos secundarios como máximo.
    const pildorasH = pildoras.length ? 64 : 0;

    const pieH = 120;
    const apilado = (tituloH - SOLAPE) + G + precioH + (statsH ? G + statsH : 0) + (pildorasH ? G + pildorasH : 0) + G;
    const FOOTER_Y = 1780;
    let fotoH = FOOTER_Y - apilado;
    fotoH = Math.max(620, Math.min(1160, fotoH));
    const pieY = fotoH + apilado;

    /* ---------- Fondo ---------- */
    const fondo = ctx.createLinearGradient(0, 0, 0, H);
    fondo.addColorStop(0, '#f6f8fa'); fondo.addColorStop(1, '#e6ebf0');
    ctx.fillStyle = fondo; ctx.fillRect(0, 0, W, H);
    [[W + 40, 1100, 520, c.suave], [-80, 1500, 560, 'rgba(240,200,130,.18)']].forEach(([x, y, r, col]) => {
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, col); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    });

    /* ---------- Foto a sangre, con esquinas inferiores redondeadas ---------- */
    ctx.save();
    ruta(ctx, 0, 0, W, fotoH, [0, 0, 76, 76]); ctx.clip();
    if (foto) {
      cubrir(ctx, foto, 0, 0, W, fotoH);
    } else {
      ctx.fillStyle = '#d6dce3'; ctx.fillRect(0, 0, W, fotoH);
      texto(ctx, 'Sin foto', W / 2, fotoH / 2, { size: 40, color: '#98a1ae', align: 'center' });
    }
    const velo = ctx.createLinearGradient(0, 0, 0, 260);   // ayuda a leer la barra de la historia
    velo.addColorStop(0, 'rgba(10,14,18,.30)'); velo.addColorStop(1, 'rgba(10,14,18,0)');
    ctx.fillStyle = velo; ctx.fillRect(0, 0, W, 260);
    ctx.restore();

    if (v.noDisponible) {
      const t = v.noDisponible;
      const w = medir(ctx, t, 30, 600, 1) + 56;
      ctx.fillStyle = '#b4232a'; ruta(ctx, M, 290, w, 58, 29); ctx.fill();
      texto(ctx, t, M + 28, 330, { size: 30, peso: 600, color: '#fff', tracking: 1 });
    }

    /* ---------- Tarjeta del título (flota sobre el borde de la foto) ---------- */
    let y = fotoH - SOLAPE;
    conSombra(ctx, 'rgba(24,36,48,.20)', 50, 18, () => {
      ctx.fillStyle = '#fff'; ruta(ctx, M, y, cardW, tituloH, 52); ctx.fill();
    });
    tLineas.forEach((l, i) => {
      texto(ctx, l, W / 2, y + base1 + i * tLinea, { size: tSize, peso: 600, color: '#38404c', align: 'center', tracking: tSize * .07 });
    });
    lineaFirma(ctx, c, W / 2, y + lineaY, 240);
    if (v.proyecto) {
      const pr = v.proyecto.length > 40 ? v.proyecto.slice(0, 39) + '…' : v.proyecto;
      texto(ctx, pr, W / 2, y + proyecY, { size: 34, peso: 600, color: '#1d232c', align: 'center' });
    }
    if (v.ubicacion) {
      const ub = v.ubicacion.length > 44 ? v.ubicacion.slice(0, 43) + '…' : v.ubicacion;
      const ancho = medir(ctx, ub, 32, 400, 0);
      const x0 = W / 2 - (ancho + 44) / 2;                         // pin + texto, centrados juntos
      try {
        const pin = await cargarIcono(o.iconoSvg('pin', '#98a1ae'));
        ctx.drawImage(pin, x0, y + ubicY - 29, 34, 34);
      } catch (e) { /* sin ícono */ }
      texto(ctx, ub, x0 + 44, y + ubicY, { size: 32, color: '#5f6877' });
    }
    y += tituloH + G;

    /* ---------- Precio ---------- */
    conSombra(ctx, 'rgba(11,68,59,.30)', 40, 16, () => {
      ctx.fillStyle = rellenoAcento(ctx, c, M, y, cardW, precioH); ruta(ctx, M, y, cardW, precioH, 46); ctx.fill();
    });
    const nP = v.precios.length;
    v.precios.forEach((p, i) => {
      const colW = cardW / nP;
      const cx = M + colW * i + 48;
      if (i > 0) { ctx.fillStyle = 'rgba(255,255,255,.28)'; ctx.fillRect(M + colW * i, y + 36, 2, precioH - 72); }
      ctx.globalAlpha = .85;
      texto(ctx, p.etiqueta.toUpperCase(), cx, y + 58, { size: 24, peso: 500, color: '#fff', tracking: 3.4 });
      ctx.globalAlpha = 1;
      let size = nP > 1 ? 56 : 82;
      while (size > 34 && medir(ctx, p.valor, size, 700, -1) + (p.sufijo ? 90 : 0) > colW - 96) size -= 2;
      texto(ctx, p.valor, cx, y + 58 + 22 + size * .86, { size, peso: 700, color: '#fff', tracking: -1 });
      if (p.sufijo) {
        const vw = medir(ctx, p.valor, size, 700, -1);
        ctx.globalAlpha = .85;
        texto(ctx, p.sufijo, cx + vw + 8, y + 58 + 22 + size * .86, { size: Math.max(26, size * .38), peso: 500, color: '#fff' });
        ctx.globalAlpha = 1;
      }
    });
    y += precioH;

    /* ---------- Tres tarjetas de datos ---------- */
    if (statsH) {
      y += G;
      const n = tarjetas.length, gap = 24;
      const w = (cardW - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const t = tarjetas[i], x = M + i * (w + gap);
        conSombra(ctx, 'rgba(24,36,48,.12)', 34, 10, () => {
          ctx.fillStyle = '#fff'; ruta(ctx, x, y, w, statsH, 42); ctx.fill();
        });
        // círculo suave + ícono
        ctx.fillStyle = c.suave; ctx.beginPath(); ctx.arc(x + 28 + 31, y + 34 + 31, 31, 0, Math.PI * 2); ctx.fill();
        try {
          const ic = await cargarIcono(o.iconoSvg(t.icono, c.acento));
          ctx.drawImage(ic, x + 28 + 31 - 17, y + 34 + 31 - 17, 34, 34);
        } catch (e) { /* sin ícono */ }
        // etiqueta + valor a la derecha del círculo
        const tx = x + 28 + 62 + 18;
        texto(ctx, t.etiqueta, tx, y + 62, { size: 25, color: '#5f6877' });
        let size = 58;
        const unidad = t.unidad ? ' ' + t.unidad : '';
        while (size > 30 && medir(ctx, t.valor, size, 700, -1) + (unidad ? 40 : 0) > w - (tx - x) - 18) size -= 2;
        texto(ctx, t.valor, tx, y + 62 + 14 + size * .9, { size, peso: 700, color: '#1d232c', tracking: -1 });
        if (unidad) {
          const vw = medir(ctx, t.valor, size, 700, -1);
          texto(ctx, t.unidad, tx + vw + 6, y + 62 + 14 + size * .9, { size: 28, peso: 500, color: '#5f6877' });
        }
      }
      y += statsH;
    }

    /* ---------- Píldoras ---------- */
    if (pildorasH) {
      y += G;
      let x = M;
      pildoras.forEach(p => {
        ctx.fillStyle = c.suave; ruta(ctx, x, y, p.w, pildorasH, pildorasH / 2); ctx.fill();
        texto(ctx, p.t, x + p.w / 2, y + 42, { size: 28, peso: 500, color: c.acento, align: 'center' });
        x += p.w + 14;
      });
      y += pildorasH;
    }

    /* ---------- Pie de marca: banda hasta el borde inferior ---------- */
    const banda = ctx.createLinearGradient(0, pieY, 0, H);
    banda.addColorStop(0, '#eceff3'); banda.addColorStop(1, '#dfe4ea');
    ctx.fillStyle = banda; ctx.fillRect(0, pieY, W, H - pieY);
    ctx.fillStyle = '#dde2e8'; ctx.fillRect(0, pieY, W, 2);

    // Pie discreto: solo una línea pequeña y centrada, sin enlace.
    const t1 = 'Ficha creada con ', t2 = 'Mira Leads';
    const w1 = medir(ctx, t1, 22, 400, 0), w2 = medir(ctx, t2, 22, 600, 0);
    let x = (W - (30 + w1 + w2)) / 2;
    dibujarOjo(ctx, c, x + 10, pieY + 40, 10);
    x += 30;
    texto(ctx, t1, x, pieY + 48, { size: 22, peso: 400, color: '#7a8493' });
    texto(ctx, t2, x + w1, pieY + 48, { size: 22, peso: 600, color: '#7a8493' });

    return new Promise((ok, mal) => {
      canvas.toBlob(b => b ? ok(b) : mal(new Error('No se pudo crear la imagen')), 'image/png');
    });
  }

  return { generar };
})();
