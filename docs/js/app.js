/* StoryMap Tocancipá. Sitio estático: todas las rutas salen de data/config.json y de los catálogos en data/. */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const enc = p => String(p).split('/').map(encodeURIComponent).join('/');
const norm = s => String(s).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
const fmt = n => Number(n).toLocaleString('es-CO', { maximumFractionDigits: 0 });
async function getJSON(url) {
  try { const r = await fetch(url); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  catch (e) { console.warn('No se pudo cargar', url, e.message); return null; }
}
/* Mapas base gratuitos y sin clave (CARTO ya exige clave). */
const ATTR_OSM = '© <a href="https://www.openstreetmap.org/copyright">colaboradores de OpenStreetMap</a>';
const ATTR_ESRI = 'Tiles © Esri';
const FONDOS = {
  calles:   { nombre: 'Calles y vías (OpenStreetMap)', url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', attr: ATTR_OSM, maxZoom: 19, clase: 'fondo-suave' },
  gris:     { nombre: 'Gris claro (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}', ref: 'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}', attr: ATTR_ESRI + ', HERE, Garmin, © OpenStreetMap', maxZoom: 19, nativo: 16 },
  satelite: { nombre: 'Satélite (Esri)', url: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', attr: ATTR_ESRI + ', Maxar, Earthstar Geographics', maxZoom: 19, nativo: 18 },
  relieve:  { nombre: 'Relieve (OpenTopoMap)', url: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', attr: ATTR_OSM + ', SRTM | © <a href="https://opentopomap.org">OpenTopoMap</a> (CC-BY-SA)', maxZoom: 17 },
  neutro:   { nombre: 'Fondo neutro (sin mapa)', vacio: true }
};
const FONDO_INICIAL = 'calles';
function crearFondo(k) {
  const f = FONDOS[k];
  if (f.vacio) return L.layerGroup();
  const base = L.tileLayer(f.url, { attribution: f.attr, maxZoom: f.maxZoom, maxNativeZoom: f.nativo || f.maxZoom, className: f.clase || '' });
  if (!f.ref) return base;
  return L.layerGroup([base, L.tileLayer(f.ref, { maxZoom: f.maxZoom, maxNativeZoom: f.nativo || f.maxZoom })]);
}
/* Pone el fondo inicial y el selector de fondos. */
function ponerFondos(map, conSelector) {
  const capas = {}, etiquetas = {};
  Object.keys(FONDOS).forEach(k => { capas[k] = crearFondo(k); etiquetas[FONDOS[k].nombre] = capas[k]; });
  let actual = FONDO_INICIAL;
  capas[actual].addTo(map);
  if (conSelector) L.control.layers(etiquetas, null, { position: 'topright', collapsed: true }).addTo(map);
  return {
    capas,
    cambiar(k) { if (!capas[k] || k === actual) return; map.removeLayer(capas[actual]); capas[k].addTo(map); actual = k; },
    claveDe(l) { return Object.keys(capas).find(k => capas[k] === l); },
    actual() { return actual; },
    fijar(k) { actual = k; }
  };
}
const REDUCIR = matchMedia('(prefers-reduced-motion: reduce)').matches;
let CFG = null, BOUNDS_JSON = null;
const iniciado = {};
const banda = (tab, t, txt) => `<div class="banda" style="background-image:url('${enc(CFG.bandas[tab])}')"><h2>${esc(t)}</h2><p>${esc(txt)}</p></div>`;

/* ---------- coordenadas de las imágenes (capas/limites_png.json) ---------- */
function numsDeep(x, out = []) {
  if (typeof x === 'number') out.push(x);
  else if (Array.isArray(x)) x.forEach(v => numsDeep(v, out));
  else if (x && typeof x === 'object') Object.values(x).forEach(v => numsDeep(v, out));
  return out;
}
function parseBounds(v) {
  if (v && typeof v === 'object' && !Array.isArray(v)) {
    const k = Object.fromEntries(Object.entries(v).map(([a, b]) => [a.toLowerCase(), b]));
    const g = (...ns) => { for (const n of ns) if (typeof k[n] === 'number') return k[n]; };
    const w = g('west', 'oeste', 'minx', 'xmin', 'left'), s = g('south', 'sur', 'miny', 'ymin', 'bottom'),
          e = g('east', 'este', 'maxx', 'xmax', 'right'), n = g('north', 'norte', 'maxy', 'ymax', 'top');
    if ([w, s, e, n].every(x => typeof x === 'number')) return [[s, w], [n, e]];
  }
  const nums = numsDeep(v).filter(Number.isFinite);
  const lats = nums.filter(x => x >= -5 && x <= 14), lons = nums.filter(x => x >= -80 && x <= -66);
  if (lats.length < 2 || lons.length < 2) return null;
  return [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]];
}
function deepFind(obj, id, depth = 0) {
  if (!obj || typeof obj !== 'object' || depth > 4) return null;
  if (Array.isArray(obj)) { for (const it of obj) if (it && typeof it === 'object' && Object.values(it).some(v => typeof v === 'string' && norm(v).includes(id))) return it; return null; }
  const keys = Object.keys(obj);
  const exacto = keys.find(k => norm(k.replace(/\.[a-z]+$/i, '')) === id); if (exacto) return obj[exacto];
  const parcial = keys.find(k => norm(k).includes(id)); if (parcial) return obj[parcial];
  for (const k of keys) { const r = deepFind(obj[k], id, depth + 1); if (r) return r; }
  return null;
}
function boundsDe(id) {
  if (!BOUNDS_JSON) return null;
  const hit = deepFind(BOUNDS_JSON, id); const b = hit && parseBounds(hit);
  return b || parseBounds(BOUNDS_JSON);
}
const capaPorId = id => CFG.capas_raster.find(c => c.id === id);
const urlPng = c => enc(c.png || (CFG.rutas.capas + c.id + '.png'));
const nombreCapa = c => c.tipo === 'cambio' ? 'Cambio de cobertura 1977 a 2025' : 'Cobertura de la tierra ' + c.anio;
const COB = () => CFG.capas_raster.filter(c => c.tipo === 'cobertura');

/* ---------- pestañas ---------- */
const TABS = ['inicio', 'geovisor', 'cartografia', 'sitios', 'galeria', 'normatividad', 'arte', 'metodologia'];
function mostrar(tab) {
  if (!TABS.includes(tab)) tab = 'inicio';
  $$('#pestanas [role=tab]').forEach(b => { const on = b.dataset.tab === tab; b.setAttribute('aria-selected', on); b.tabIndex = on ? 0 : -1; b.classList.toggle('on', on); });
  TABS.forEach(t => { $('#tab-' + t).hidden = t !== tab; });
  if (location.hash !== '#' + tab) history.replaceState(null, '', '#' + tab);
  if (!iniciado[tab]) { iniciado[tab] = true; ({ inicio: initInicio, geovisor: initGeovisor, cartografia: initCartografia, sitios: initSitios, galeria: initGaleria, normatividad: initNormatividad, arte: initArte, metodologia: initMetodologia })[tab](); }
  else if (tab === 'geovisor') setTimeout(() => { mapA && mapA.invalidateSize(); mapB && mapB.invalidateSize(); }, 50);
  else if (tab === 'sitios') setTimeout(() => mapS && mapS.invalidateSize(), 50);
  if (tab !== 'inicio') pararHero(); else arrancarHero();
  window.scrollTo(0, 0);
}
function irAlVisor(id) { mostrar('geovisor'); setTimeout(() => seleccionarCapa(id), 120); }

/* ---------- INICIO ---------- */
let heroTimer = null, tlTimer = null, heroPausado = false, heroIdx = 0, tlIdx = 0;
function arrancarHero() {
  pararHero();
  if (REDUCIR || heroPausado || !$('.hero-fondo')) return;
  const sl = $$('.hero-fondo .s'), im = $$('.tl-marco img');
  heroTimer = setInterval(() => { sl[heroIdx].classList.remove('v'); heroIdx = (heroIdx + 1) % sl.length; sl[heroIdx].classList.add('v'); }, 7000);
  tlTimer = setInterval(() => verTl((tlIdx + 1) % im.length), 2600);
}
function pararHero() { clearInterval(heroTimer); clearInterval(tlTimer); }
function verTl(i) {
  const im = $$('.tl-marco img'), c = COB(); if (!im.length) return;
  im[tlIdx].classList.remove('v'); tlIdx = i; im[i].classList.add('v');
  $('#tl-anio').textContent = c[i].anio; $('#tl-sensor').textContent = c[i].sensor + ', ' + c[i].resolucion;
}
function initInicio() {
  const A = CFG.areas_ha, cob = COB();
  const tot = A.anios.map((_, i) => A.clases.reduce((s, c) => s + c.valores[i], 0));
  const caps = [
    { anio: '1943', hist: true, tipo: 'Documento histórico', titulo: 'Cartografía histórica', texto: 'Documento cartográfico anterior a la primera imagen de satélite. Sirve de contexto: no es una cobertura clasificada.', btn: ['Ver en cartografía temática', () => mostrar('cartografia')], img: 'mapas/cartografia_historica_1943_t.webp' },
    ...cob.map((c, i) => ({ anio: String(c.anio), tipo: 'Dato cartográfico', titulo: c.sensor + ', ' + c.resolucion,
      texto: A.clases.map(k => k.nombre + ' ' + fmt(k.valores[i]) + ' ha').join('; ') + '.' + (c.anio === 2025 ? ' Cifras de la versión a 30 m, comparable con las demás fechas.' : ''),
      fecha: c.fecha, btn: ['Ver en el geovisor', () => irAlVisor(c.id)], img: c.png || CFG.rutas.capas + c.id + '.png' }))
  ];
  const acc = [['geovisor', 'Geovisor', 'La cobertura de la tierra en cuatro fechas', 'img/fondos/hero4.webp'], ['cartografia', 'Cartografía temática', 'Los mapas del municipio', CFG.bandas.cartografia], ['sitios', 'Territorio y sitios sagrados', 'Lugares y relatos', CFG.bandas.sitios], ['galeria', 'Galería de campo', 'Fotografías de la salida', CFG.bandas.galeria], ['normatividad', 'Normatividad', 'Normas y planes', CFG.bandas.normatividad], ['arte', 'Estado del arte', 'Antecedentes académicos', CFG.bandas.arte], ['metodologia', 'Metodología', 'Cómo se hizo', 'img/fondos/hero1.webp']];
  $('#tab-inicio').innerHTML = `
  <div class="hero">
    <div class="hero-fondo" aria-hidden="true">${CFG.hero.map((f, i) => `<div class="s${i === 0 ? ' v' : ''}" style="background-image:url('${enc(f)}')"></div>`).join('')}</div>
    <div class="hero-in">
      <div>
        <h1><span class="l"><span>De la labranza</span></span> <span class="l"><span>a la expansión:</span></span> <span class="l sub"><span>La Transformación Territorial de Tocancipá</span></span></h1>
        <p class="lead">Cómo cambió la cobertura del suelo del municipio entre 1977 y 2025, vista en cuatro imágenes de satélite.</p>
        <div class="acciones"><button class="btn oro" id="ir-visor">Abrir el geovisor</button><button class="btn claro" id="ir-metod">Cómo se hizo</button></div>
      </div>
      <div class="tl" aria-label="Cobertura de la tierra de Tocancipá en las cuatro fechas">
        <div class="tl-marco">${cob.map((c, i) => `<img src="${urlPng(c)}" alt="Cobertura de la tierra de Tocancipá en ${c.anio}" class="${i === 0 ? 'v' : ''}">`).join('')}</div>
        <div class="tl-anio"><b id="tl-anio">${cob[0].anio}</b><span id="tl-sensor">${esc(cob[0].sensor + ', ' + cob[0].resolucion)}</span></div>
        <ul class="leyenda">${CFG.clases_cobertura.map(k => `<li><span class="sw" style="background:${k.color}"></span>${esc(k.nombre)}</li>`).join('')}</ul>
      </div>
    </div>
    <button class="pausa-hero" id="pausa-hero" aria-pressed="false">Pausar animación</button>
  </div>
  <section class="composicion"><div class="sec-in">
    <div class="comp-tit"><h2>La tierra en cuatro fechas</h2><p>Entre 1977 y 2025 la vegetación natural perdió cerca de 1.924 ha (−52 %), mientras la zona urbana y la industrial/minera crecieron.</p></div>
    <div class="tiras" id="tiras">${A.anios.map((a, i) => `<div class="tira"><b>${a}</b><div class="b" role="img" aria-label="${a}: ${A.clases.map(c => c.nombre + ' ' + fmt(c.valores[i]) + ' hectáreas').join(', ')}">${A.clases.map(c => c.valores[i] ? `<span style="--w:${(c.valores[i] / tot[i] * 100).toFixed(2)}%;background:${c.color}" title="${esc(c.nombre)}: ${fmt(c.valores[i])} ha"></span>` : '').join('')}</div></div>`).join('')}</div>
    <ul class="leyenda fila">${A.clases.map(c => `<li><span class="sw" style="background:${c.color}"></span>${esc(c.nombre)}</li>`).join('')}</ul>
    <div class="cifras">${A.clases.map(c => `<div style="--c:${c.color}"><strong>${esc(c.cambio.split(' ')[0])} ha${c.cambio.includes('(') ? ' ' + esc(c.cambio.slice(c.cambio.indexOf('('))) : ''}</strong><span>${esc(c.nombre)}, 1977 a 2025</span></div>`).join('')}</div>
    <p class="nota-peq">Cada barra suma el área clasificada de su año. Las cifras de 2025 son de la versión a 30 m, comparable con las demás fechas.</p>
  </div></section>
  <section class="sec-in">
    <h2>Línea de tiempo</h2>
    <p>El relato histórico general comprende el periodo 1970 a 2025. El geovisor usa solo las fechas con datos cartográficos verificados: 1977, 2000, 2015 y 2025. Lo anterior se presenta como contexto documental.</p>
    <ol class="capitulos">${caps.map((c, i) => `<li class="cap"><div class="cap-mapa${c.hist ? ' hist' : ''}"><img src="${enc(c.img)}" alt="${c.hist ? 'Cartografía histórica de 1943' : 'Cobertura de la tierra en ' + c.anio}" loading="lazy"></div><div><span class="anio">${c.anio}</span><h3>${esc(c.titulo)}</h3><p class="tipo">${esc(c.tipo)}${c.fecha ? ', imagen del ' + esc(c.fecha) : ''}</p><p>${esc(c.texto)}</p><button class="sec" data-c="${i}">${esc(c.btn[0])}</button></div></li>`).join('')}</ol>
  </section>
  <section class="composicion"><div class="sec-in"><h2>Qué encontrarás</h2><div class="accesos">${acc.map(a => `<button class="acc" data-go="${a[0]}" style="background-image:url('${enc(a[3])}')"><strong>${esc(a[1])}</strong><span>${esc(a[2])}</span></button>`).join('')}</div></div></section>`;
  $('#ir-visor').onclick = () => mostrar('geovisor'); $('#ir-metod').onclick = () => mostrar('metodologia');
  $$('#tab-inicio .cap button').forEach(b => b.onclick = caps[b.dataset.c].btn[1]);
  $$('#tab-inicio .acc').forEach(b => b.onclick = () => mostrar(b.dataset.go));
  $('#pausa-hero').onclick = e => { heroPausado = !heroPausado; e.target.setAttribute('aria-pressed', heroPausado); e.target.textContent = heroPausado ? 'Reanudar animación' : 'Pausar animación'; heroPausado ? pararHero() : arrancarHero(); };
  const tiras = $('#tiras');
  if ('IntersectionObserver' in window) new IntersectionObserver((en, ob) => { if (en[0].isIntersecting) { tiras.classList.add('in'); ob.disconnect(); } }, { threshold: .3 }).observe(tiras); else tiras.classList.add('in');
  arrancarHero();
}

/* ---------- GEOVISOR ---------- */
let fondosA = null, fondosB = null, mapA, mapB, modo = 'linea', capaA = null, capaB = null, ovA = null, ovB = null, reproduciendo = null, AREAS_VER = null;
const vec = {};
const ORDEN = () => COB().map(c => c.id);
function estado(msg, tipo) { const e = $('#gv-estado'); e.textContent = msg || ''; e.className = 'estado' + (msg ? ' ver ' + (tipo || '') : ''); }

async function initGeovisor() {
  $('#acerca-texto').textContent = `Este visor muestra cómo cambió la cobertura del suelo en el municipio de Tocancipá entre 1977 y 2025. Las coberturas se obtuvieron clasificando imágenes de satélite de cuatro fechas (7 de enero de 1977, 31 de marzo de 2000, 4 de enero de 2015 y 22 de enero de 2025) en cuatro clases: vegetación natural, cultivos y pastos, zona urbana y zona industrial/minera. Es un insumo del trabajo de grado sobre conflictos territoriales del pueblo Muisca en Tocancipá, de la ${CFG.institucion}.`;
  $('#btn-acerca').onclick = () => $('#dlg-acerca').showModal();
  $('#acerca-cerrar').onclick = () => $('#dlg-acerca').close();
  pintarAreas();
  if (typeof L === 'undefined') { estado('No se pudo cargar la librería de mapas (Leaflet). Revisa la conexión a internet.', 'error'); return; }
  mapA = L.map('mapa-a').setView(CFG.centro, CFG.zoom);
  fondosA = ponerFondos(mapA, true);
  mapA.on('baselayerchange', (e) => { const k = fondosA.claveDe(e.layer); if (k) { fondosA.fijar(k); if (fondosB) fondosB.cambiar(k); } });
  L.control.scale({ imperial: false }).addTo(mapA);
  BOUNDS_JSON = await getJSON(CFG.rutas.limites_png);
  if (!BOUNDS_JSON) estado(`No se encontró ${CFG.rutas.limites_png} (coordenadas de las imágenes).`, 'error');
  AREAS_VER = await getJSON(CFG.rutas.areas_vereda);

  const ids = CFG.capas_raster.map(c => c.id);
  for (const s of [$('#sel-a'), $('#sel-b')]) s.innerHTML = ids.map(i => `<option value="${i}">${esc(nombreCapa(capaPorId(i)))}</option>`).join('');
  $('#sel-a').value = 'cobertura_1977'; $('#sel-b').value = 'cobertura_2025';
  $('#sel-a').onchange = () => ponerCapa('A', $('#sel-a').value); $('#sel-b').onchange = () => ponerCapa('B', $('#sel-b').value);
  $('#modo-linea').onclick = () => cambiarModo('linea'); $('#modo-comparar').onclick = () => cambiarModo('comparar');
  $('#opacidad').oninput = e => { [ovA, ovB].forEach(o => o && o.setOpacity(+e.target.value)); };

  const ord = ORDEN();
  $('#t-slider').max = ord.length - 1;
  $('#t-marcas').innerHTML = ord.map((id, i) => `<button type="button" data-i="${i}">${capaPorId(id).anio}</button>`).join('');
  $$('#t-marcas button').forEach(b => b.onclick = () => irIndice(+b.dataset.i));
  $('#t-slider').oninput = e => irIndice(+e.target.value);
  $('#t-ant').onclick = () => irIndice(indiceActual() - 1); $('#t-sig').onclick = () => irIndice(indiceActual() + 1);
  $('#t-play').onclick = alternarReproduccion;
  $('#t-cambio').onclick = () => seleccionarCapa(capaA === 'cambio_1977_2025' ? ord[0] : 'cambio_1977_2025');
  initVectores();
  seleccionarCapa('cobertura_1977');
}
const indiceActual = () => Math.max(0, ORDEN().indexOf(capaA));
function irIndice(i) { const o = ORDEN(); if (i < 0) i = o.length - 1; if (i >= o.length) i = 0; seleccionarCapa(o[i]); }
function seleccionarCapa(id) { if (!mapA) return; if (modo === 'comparar') { $('#sel-a').value = id; } ponerCapa('A', id); }
function alternarReproduccion() {
  const b = $('#t-play');
  if (reproduciendo) { clearInterval(reproduciendo); reproduciendo = null; b.textContent = 'Reproducir'; return; }
  if (modo === 'comparar') cambiarModo('linea');
  if (capaA === 'cambio_1977_2025') seleccionarCapa(ORDEN()[0]);
  b.textContent = 'Pausar';
  reproduciendo = setInterval(() => irIndice(indiceActual() + 1), 3000);
}
function detener() { if (reproduciendo) alternarReproduccion(); }

const VACIO = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const encTpl = p => String(p).split('/').map(x => x.replace(/[^{}a-zA-Z0-9._~-]/g, ch => encodeURIComponent(ch))).join('/');
function ponerCapa(lado, id) {
  const c = capaPorId(id); if (!c) return;
  const mapa = lado === 'A' ? mapA : mapB; if (!mapa) return;
  if (lado === 'A') capaA = id; else capaB = id;
  const vieja = lado === 'A' ? ovA : ovB; if (vieja) mapa.removeLayer(vieja);
  if (lado === 'A') ovA = null; else ovB = null;
  actualizarPanel();
  const poner = ov => { if (lado === 'A') ovA = ov; else ovB = ov; };
  const vigente = () => (lado === 'A' ? capaA : capaB) === id;
  if (c.teselas) {
    let bien = 0, mal = 0; estado('Cargando ' + nombreCapa(c) + '…', 'carga');
    const tl = L.tileLayer(encTpl(c.teselas), { opacity: +$('#opacidad').value, className: 'capa-raster', minZoom: c.minzoom || 0, maxZoom: 19, maxNativeZoom: c.maxzoom || 19, tms: !!c.tms, errorTileUrl: VACIO });
    tl.on('tileload', () => { bien++; if (vigente()) estado(''); });
    tl.on('tileerror', () => { mal++; if (vigente() && !bien && mal >= 4) estado(`No cargan las teselas de ${nombreCapa(c)}.`, 'error'); });
    tl.addTo(mapa); poner(tl); return;
  }
  const b = boundsDe(id);
  if (!b) { estado(`Sin coordenadas para la imagen "${id}" en ${CFG.rutas.limites_png}.`, 'error'); return; }
  estado('Cargando ' + nombreCapa(c) + '…', 'carga');
  const img = new Image();
  img.onload = () => { if (!vigente()) return; poner(L.imageOverlay(urlPng(c), b, { opacity: +$('#opacidad').value, className: 'capa-raster', interactive: false, alt: nombreCapa(c) }).addTo(mapa)); estado(''); };
  img.onerror = () => estado(`No se pudo cargar la imagen de ${nombreCapa(c)} (${urlPng(c)}). Revisa que el archivo exista; GitHub Pages distingue mayúsculas.`, 'error');
  img.src = urlPng(c);
}

function leyendaHTML(ids) {
  const tipos = [...new Set(ids.map(i => capaPorId(i).tipo))];
  return tipos.map(t => {
    const items = t === 'cambio' ? CFG.clases_cambio : CFG.clases_cobertura;
    const extra = t === 'cambio' ? '<li><span class="sw vacio"></span>Sin cambio</li>' : '';
    return `<p class="leg-t">${t === 'cambio' ? 'Cambio 1977 a 2025' : 'Cobertura de la tierra'}</p><ul class="leyenda">${items.map(k => `<li><span class="sw" style="background:${k.color}"></span>${esc(k.nombre)}</li>`).join('')}${extra}</ul>`;
  }).join('');
}
function fichaHTML(c) {
  const f = [['Fecha', c.fecha], ['Sensor', c.sensor], ['Resolución', c.resolucion], ['Composición', c.compuesto], ['Procesamiento', c.nivel], ['Unidad mínima de mapeo', c.umm], ['Nota', c.nota]].filter(x => x[1]);
  return `<h3 class="ficha-t">${esc(nombreCapa(c))}</h3>` + f.map(([k, v]) => `<dt>${k}</dt><dd>${esc(v)}</dd>`).join('');
}
function actualizarPanel() {
  const ids = (modo === 'comparar' ? [capaA, capaB] : [capaA]).filter(Boolean); if (!ids.length) return;
  $('#gv-titulo-capa').textContent = ids.map(i => nombreCapa(capaPorId(i))).join(' y ');
  $('#gv-leyenda').innerHTML = leyendaHTML(ids);
  $('#gv-ficha').innerHTML = ids.map(i => fichaHTML(capaPorId(i))).join('');
  const idx = ORDEN().indexOf(capaA);
  if (idx >= 0) $('#t-slider').value = idx;
  $$('#t-marcas button').forEach((b, i) => b.classList.toggle('on', i === idx));
  $('#t-cambio').setAttribute('aria-pressed', capaA === 'cambio_1977_2025'); $('#t-cambio').classList.toggle('on', capaA === 'cambio_1977_2025');
  $('#etq-a').textContent = capaA ? nombreCapa(capaPorId(capaA)) : ''; $('#etq-b').textContent = capaB ? nombreCapa(capaPorId(capaB)) : '';
  resaltarFila(idx >= 0 ? CFG.areas_ha.anios[idx] : null);
}
function cambiarModo(m) {
  if (m === modo) return;
  modo = m; detener();
  $('#modo-linea').classList.toggle('activo', m === 'linea'); $('#modo-comparar').classList.toggle('activo', m === 'comparar');
  $('#modo-linea').setAttribute('aria-pressed', m === 'linea'); $('#modo-comparar').setAttribute('aria-pressed', m === 'comparar');
  $('#caja-comparar').hidden = m !== 'comparar'; $('#gv-tiempo').hidden = m === 'comparar';
  $('#etq-a').hidden = $('#etq-b').hidden = m !== 'comparar';
  $('#gv-mapas').classList.toggle('dos', m === 'comparar'); $('#mapa-b').hidden = m !== 'comparar';
  if (m === 'comparar') {
    if (!mapB) {
      mapB = L.map('mapa-b', { zoomControl: false }).setView(mapA.getCenter(), mapA.getZoom());
      fondosB = ponerFondos(mapB, false);
      fondosB.cambiar(fondosA.actual());
      let bloqueo = false;
      const espejo = (o, d) => () => { if (bloqueo) return; bloqueo = true; d.setView(o.getCenter(), o.getZoom(), { animate: false }); bloqueo = false; };
      mapA.on('move', espejo(mapA, mapB)); mapB.on('move', espejo(mapB, mapA));
      for (const id in vec) if (vec[id].on) añadirVec(id);
    }
    mapB.invalidateSize(); mapA.invalidateSize(); mapB.setView(mapA.getCenter(), mapA.getZoom(), { animate: false });
    if (capaA === 'cambio_1977_2025' && $('#sel-b').value === 'cambio_1977_2025') $('#sel-b').value = 'cobertura_2025';
    $('#sel-a').value = capaA; ponerCapa('B', $('#sel-b').value); actualizarPanel();
  } else {
    if (ovB && mapB) { mapB.removeLayer(ovB); ovB = null; }
    capaB = null; setTimeout(() => mapA.invalidateSize(), 50); actualizarPanel();
  }
}

/* capas vectoriales de referencia */
function initVectores() {
  const lista = CFG.capas_vector, vis = lista.filter(v => v.publicar), ocu = lista.filter(v => !v.publicar);
  $('#gv-vectores').innerHTML = vis.map(v => `<label class="chk"><input type="checkbox" data-v="${v.id}" ${v.activa ? 'checked' : ''}><span class="sw trazo" style="border-color:${v.color};width:1.4rem"></span><span>${esc(v.nombre)}<small>${esc(v.descripcion)} Fuente: ${esc(v.fuente)}.${v.id === 'division_veredal' ? ' Toca una vereda para ver sus hectáreas por clase.' : ''}</small></span></label>`).join('') +
    (ocu.length ? `<details class="ocultas"><summary>Capas aún no publicadas</summary>${ocu.map(v => `<p><strong>${esc(v.nombre)}.</strong> ${esc(v.motivo_oculta || '')}</p>`).join('')}</details>` : '');
  vis.forEach(v => { vec[v.id] = { cfg: v, on: false, data: null }; });
  $$('#gv-vectores input').forEach(i => i.onchange = () => alternarVec(i.dataset.v, i.checked));
  vis.filter(v => v.activa).forEach(v => alternarVec(v.id, true));
}
async function alternarVec(id, on) {
  const v = vec[id]; v.on = on;
  if (!on) { if (v.A) mapA.removeLayer(v.A); if (v.B && mapB) mapB.removeLayer(v.B); return; }
  if (!v.data) {
    estado('Cargando ' + v.cfg.nombre + '…', 'carga');
    v.data = await getJSON(CFG.rutas.vectores + enc(v.cfg.archivo));
    estado(v.data ? '' : `No se pudo cargar la capa «${v.cfg.nombre}».`, v.data ? '' : 'error');
    if (!v.data) return;
  }
  añadirVec(id);
  if (id === 'limite_municipal' && v.A) { try { mapA.fitBounds(v.A.getBounds(), { padding: [10, 10] }); } catch (e) {} }
}
function popupVereda(nombre) {
  const d = AREAS_VER && AREAS_VER[String(nombre).toUpperCase()]; if (!d) return `<div class="vmini"><h4>${esc(nombre)}</h4><p>Sin cifras de área para esta vereda.</p></div>`;
  const anios = [['1977', '1977'], ['2000', '2000'], ['2015', '2015'], ['2025_30m', '2025 (30 m)']];
  return `<div class="vmini"><h4>${esc(nombre)}</h4>${anios.map(([k, et]) => { const y = d[k]; if (!y) return ''; const tot = Object.values(y).reduce((a, b) => a + b, 0) || 1;
    return `<div class="f"><span>${et}</span><div class="b">${CFG.clases_cobertura.map(c => (y[c.codigo] || 0) > 0 ? `<span style="width:${(y[c.codigo] / tot * 100).toFixed(1)}%;background:${c.color}" title="${esc(c.nombre)}: ${fmt(y[c.codigo])} ha"></span>` : '').join('')}</div></div>`; }).join('')}
    <p class="nota-peq">Hectáreas por clase (pasa el cursor sobre cada tramo). Cifras del archivo areas_por_vereda.</p></div>`;
}
function popupProps(p) {
  const claves = Object.keys(p || {}).filter(k => !/cedula|matricula|shape_|objectid|fid_|_id$/i.test(k)).slice(0, 8);
  return claves.length ? '<dl class="pp">' + claves.map(k => `<dt>${esc(k)}</dt><dd>${esc(p[k])}</dd>`).join('') + '</dl>' : '';
}
function añadirVec(id) {
  const v = vec[id]; if (!v.data) return;
  const lim = id === 'limite_municipal';
  const estilo = { color: v.cfg.color, weight: lim ? 3 : 1.6, fill: !lim, fillOpacity: lim ? 0 : .05 };
  const mk = () => L.geoJSON(v.data, { style: estilo, onEachFeature: (f, l) => {
    if (lim) return;
    if (id === 'division_veredal') l.bindPopup(popupVereda(f.properties && f.properties.VER_NOMBRE), { maxWidth: 340 });
    else { const h = popupProps(f.properties); if (h) l.bindPopup(`<strong>${esc(v.cfg.nombre)}</strong>${h}`); } } });
  if (v.A) mapA.removeLayer(v.A); v.A = mk().addTo(mapA);
  if (mapB) { if (v.B) mapB.removeLayer(v.B); v.B = mk().addTo(mapB); }
}

/* gráfico y tabla de áreas (cifras de la ficha técnica; no se calcula nada) */
function pintarAreas() {
  const D = CFG.areas_ha, tot = D.anios.map((_, i) => D.clases.reduce((s, c) => s + c.valores[i], 0));
  $('#graf-areas').innerHTML = D.anios.map((a, i) => `<div class="barra-fila" data-anio="${a}"><span class="barra-anio">${a}${a === 2025 ? ' (30 m)' : ''}</span><div class="barra" role="img" aria-label="${a}: ${D.clases.map(c => c.nombre + ' ' + fmt(c.valores[i]) + ' hectáreas').join(', ')}">${D.clases.map(c => c.valores[i] ? `<span style="width:${c.valores[i] / tot[i] * 100}%;background:${c.color}" title="${esc(c.nombre)}: ${fmt(c.valores[i])} ha"></span>` : '').join('')}</div></div>`).join('') +
    `<ul class="leyenda fila">${D.clases.map(c => `<li><span class="sw" style="background:${c.color}"></span>${esc(c.nombre)}</li>`).join('')}</ul>`;
  $('#tabla-areas').innerHTML = `<table><caption class="solo-lector">Área por clase y año, en hectáreas</caption><thead><tr><th>Clase</th>${D.anios.map(a => `<th data-anio="${a}">${a}${a === 2025 ? ' (30 m)' : ''}</th>`).join('')}<th>Cambio 1977 a 2025</th></tr></thead><tbody>${D.clases.map(c => `<tr><th scope="row"><span class="sw" style="background:${c.color}"></span>${esc(c.nombre)}</th>${c.valores.map((x, i) => `<td data-anio="${D.anios[i]}">${fmt(x)}</td>`).join('')}<td>${esc(c.cambio)}</td></tr>`).join('')}</tbody></table>
  <p class="nota-peq">De 2015 a 2025 crecen la zona urbana (+36 ha, +17,7 %) y la industrial/minera (+69 ha, +18,3 %). La vegetación natural (+2 ha) y los cultivos y pastos (+10 ha) se mantienen estables dentro del margen del método.</p>`;
  $('#fuente-areas').textContent = 'Fuente: ' + D.fuente + '.';
}
function resaltarFila(anio) { $$('#tabla-areas [data-anio], #graf-areas [data-anio]').forEach(e => e.classList.toggle('actual', anio != null && +e.dataset.anio === anio)); }

/* ---------- CARTOGRAFÍA TEMÁTICA ---------- */
async function initCartografia() {
  const el = $('#tab-cartografia');
  const lista = await getJSON('data/cartografia.json');
  if (!lista || !lista.length) { el.innerHTML = banda('cartografia', 'Cartografía temática', 'Mapas del municipio.') + '<div class="cuerpo"><p class="estado ver error">No se pudo cargar data/cartografia.json.</p></div>'; return; }
  const temas = [...new Set(lista.map(m => m.tema))].sort();
  el.innerHTML = banda('cartografia', 'Cartografía temática', `${lista.length} mapas del municipio: ambiente, uso del suelo, división administrativa y cartografía histórica.`) +
  `<div class="cuerpo"><div class="filtros"><label>Buscar un mapa <input type="search" id="c-q"></label></div><div class="chips" id="c-chips"></div><div class="rejilla" id="c-rej"></div></div>`;
  let tema = '';
  const chips = () => { $('#c-chips').innerHTML = ['', ...temas].map(t => `<button data-t="${esc(t)}" class="${t === tema ? 'on' : ''}" aria-pressed="${t === tema}">${t ? esc(t) : 'Todos'}</button>`).join(''); $$('#c-chips button').forEach(b => b.onclick = () => { tema = b.dataset.t; chips(); pinta(); }); };
  const pinta = () => {
    const q = norm($('#c-q').value), f = lista.filter(m => (!tema || m.tema === tema) && (!q || norm(m.titulo).includes(q)));
    $('#c-rej').innerHTML = f.length ? f.map(m => `<article class="mapa-it"><button class="mini" aria-label="Ver ampliado: ${esc(m.titulo)}"><img src="${enc(m.miniatura || m.imagen)}" alt="Vista previa de ${esc(m.titulo)}" loading="lazy"><span class="sin-img" hidden>Vista previa no disponible</span></button>
      <h3>${esc(m.titulo)}</h3><p class="nota-peq">${esc(m.tema)}</p>${m.descripcion ? `<p>${esc(m.descripcion)}</p>` : ''}
      <p class="nota-peq">${m.georreferenciado === true ? 'Mapa georreferenciado.' : m.georreferenciado === false ? 'Documento cartográfico, no georreferenciado.' : 'Documento cartográfico.'}${m.fuente ? ' Fuente: ' + esc(m.fuente) + '.' : ''}</p>
      <p><a class="btn sec" href="${enc(m.imagen)}" target="_blank" rel="noopener">Abrir completo</a></p></article>`).join('') : '<p>No hay mapas con ese filtro.</p>';
    $$('#c-rej .mapa-it').forEach((art, i) => { const m = f[i], im = $('img', art); im.onerror = () => { im.hidden = true; $('.sin-img', art).hidden = false; }; $('.mini', art).onclick = () => abrirFoto([{ src: m.imagen, pie: m.titulo }], 0); });
  };
  $('#c-q').oninput = pinta; chips(); pinta();
}

/* ---------- SITIOS SAGRADOS ---------- */
let mapS = null;
async function initSitios() {
  const el = $('#tab-sitios');
  el.innerHTML = banda('sitios', 'Territorio y sitios sagrados', 'Lugares sagrados del territorio de Tocancipá y los relatos que los acompañan.') + `<div class="cuerpo"><div id="s-aviso"></div><div class="sitios-layout"><ul id="s-lista" class="lista-sitios"></ul><div id="mapa-s" aria-label="Mapa de sitios sagrados"></div></div><div id="s-ficha"></div></div>`;
  const gj = await getJSON(CFG.rutas.sitios);
  if (!gj || !gj.features || !gj.features.length) { $('#s-aviso').innerHTML = '<p class="estado ver error">Aún no hay sitios cargados.</p>'; return; }
  const hayMapa = typeof L !== 'undefined';
  if (hayMapa) {
    mapS = L.map('mapa-s').setView(CFG.centro, CFG.zoom);
    ponerFondos(mapS, true);
    const lim = await getJSON(CFG.rutas.vectores + enc(CFG.capas_vector[0].archivo));
    if (lim) { const g = L.geoJSON(lim, { style: { color: '#14322c', weight: 3, fill: false } }).addTo(mapS); try { mapS.fitBounds(g.getBounds(), { padding: [10, 10] }); } catch (e) {} }
  } else $('#mapa-s').innerHTML = '<p class="sin-img">No se pudo cargar la librería de mapas.</p>';
  const ft = gj.features, zonas = [], lista = $('#s-lista'); let sinMapa = 0;
  ft.forEach((f, i) => {
    const p = f.properties || {}, c = f.geometry && f.geometry.coordinates && p.coordenada_publicable !== false ? f.geometry.coordinates : null;
    if (!c) sinMapa++;
    const li = document.createElement('li'); li.innerHTML = `<button data-i="${i}">${esc(p.nombre)}${c ? '' : '<small>Ubicación no publicada</small>'}</button>`; lista.appendChild(li);
    if (c && hayMapa) { const z = L.circle([c[1], c[0]], { radius: CFG.radio_zona_m, color: '#8a6420', weight: 2, fillColor: '#c8963e', fillOpacity: .3 }).addTo(mapS); z.bindTooltip(esc(p.nombre)); z.on('click', () => sel(i)); zonas[i] = z; }
    li.firstChild.onclick = () => sel(i);
  });
  function sel(i) {
    const p = ft[i].properties, c = ft[i].geometry && ft[i].geometry.coordinates && p.coordenada_publicable !== false ? ft[i].geometry.coordinates : null;
    $$('#s-lista button').forEach(b => b.classList.toggle('on', +b.dataset.i === i));
    if (c && mapS) mapS.setView([c[1], c[0]], Math.max(mapS.getZoom(), 15));
    $('#s-ficha').innerHTML = `<article class="ficha-sitio">${p.imagen ? `<img src="${enc(p.imagen)}" alt="${esc(p.nombre)}" onerror="this.remove()">` : '<div></div>'}<div><h3>${esc(p.nombre)}</h3>${p.descripcion ? `<p>${esc(p.descripcion)}</p>` : ''}${p.significado ? `<p><strong>Significado cultural:</strong> ${esc(p.significado)}</p>` : ''}<p class="nota-peq">${c ? 'Ubicación aproximada: la zona marcada en el mapa tiene un radio de ' + CFG.radio_zona_m + ' m.' : 'La ubicación de este sitio no se muestra en el mapa.'}${p.fuente ? ' Fuente: ' + esc(p.fuente) + '.' : ''}${p.credito ? ' Crédito: ' + esc(p.credito) + '.' : ''}</p></div></article>`;
    $('#s-ficha').scrollIntoView({ behavior: REDUCIR ? 'auto' : 'smooth', block: 'nearest' });
  }
  $('#s-aviso').innerHTML = `<p class="aviso">Por respeto al territorio, los sitios se muestran como una zona aproximada y no como un punto exacto.${sinMapa ? ` ${sinMapa} de ${ft.length} sitios aparecen solo en la lista.` : ''} Elige uno para leer su relato.</p>`;
}

/* ---------- GALERÍA ---------- */
async function initGaleria() {
  const el = $('#tab-galeria');
  const todo = await getJSON('data/galeria.json');
  const lista = (todo || []).filter(x => x.publicar !== false);
  if (!lista.length) { el.innerHTML = banda('galeria', 'Galería de campo', 'Registro fotográfico de la salida de campo.') + '<div class="cuerpo"><p class="estado ver error">No se pudo cargar data/galeria.json.</p></div>'; return; }
  const piePor = x => [x.titulo, x.lugar, x.fecha, x.descripcion, x.credito ? 'Crédito: ' + x.credito : ''].filter(Boolean).join(', ');
  el.innerHTML = banda('galeria', 'Galería de campo', `${lista.length} fotografías de la salida de campo. Toca una para ampliarla.`) + `<div class="cuerpo"><div class="muro" id="g-muro">${lista.map((x, i) => `<button data-i="${i}" aria-label="Ampliar ${esc(x.titulo)}"><img src="${enc(x.miniatura || x.imagen)}" alt="${esc(x.descripcion || x.titulo)}" loading="lazy"></button>`).join('')}</div></div>`;
  $$('#g-muro button').forEach(b => { const im = $('img', b); im.onerror = () => { b.classList.add('rota'); b.textContent = 'Imagen no disponible'; }; b.onclick = () => abrirFoto(lista.map(x => ({ src: x.imagen, pie: piePor(x) })), +b.dataset.i); });
}
let fotos = [], fi = 0;
function abrirFoto(arr, i) { fotos = arr; fi = i; mostrarFoto(); const d = $('#dlg-foto'); if (!d.open) d.showModal(); }
function mostrarFoto() {
  const f = fotos[fi], im = $('#foto-img'), u = enc(f.src);
  im.onerror = () => { $('#foto-pie').textContent = 'No se pudo cargar la imagen.'; };
  im.alt = f.pie; im.src = u; $('#foto-pie').textContent = f.pie + (fotos.length > 1 ? ` (${fi + 1} de ${fotos.length})` : '');
  $('#foto-abrir').href = u; $('#foto-desc').href = u;
  $('#foto-ant').hidden = $('#foto-sig').hidden = fotos.length < 2;
}

/* ---------- NORMATIVIDAD ---------- */
async function initNormatividad() {
  const el = $('#tab-normatividad');
  const lista = await getJSON('data/normatividad.json');
  if (!lista) { el.innerHTML = banda('normatividad', 'Normatividad', 'Documentos de apoyo.') + '<div class="cuerpo"><p class="estado ver error">No se pudo cargar data/normatividad.json.</p></div>'; return; }
  const temas = [...new Set(lista.map(x => x.tema))].sort(); let tema = '';
  el.innerHTML = banda('normatividad', 'Normatividad', 'Normas, planes y documentos de apoyo sobre territorio, tierras y pueblos indígenas. La vigencia de cada instrumento está por verificar.') + `<div class="cuerpo"><div class="filtros"><label>Buscar <input type="search" id="n-q"></label></div><div class="chips" id="n-chips"></div><div class="filas" id="n-lis"></div></div>`;
  const chips = () => { $('#n-chips').innerHTML = ['', ...temas].map(t => `<button data-t="${esc(t)}" class="${t === tema ? 'on' : ''}" aria-pressed="${t === tema}">${t ? esc(t) : 'Todos'}</button>`).join(''); $$('#n-chips button').forEach(b => b.onclick = () => { tema = b.dataset.t; chips(); pinta(); }); };
  const pinta = () => {
    const q = norm($('#n-q').value), f = lista.filter(x => (!tema || x.tema === tema) && (!q || norm(x.titulo + ' ' + (x.descripcion || '') + ' ' + (x.entidad || '')).includes(q)));
    $('#n-lis').innerHTML = f.length ? f.map(x => `<article class="fila"><div><h3>${esc(x.titulo)}</h3>${x.descripcion ? `<p>${esc(x.descripcion)}</p>` : ''}${x.vigencia ? `<span class="vig">${esc(x.vigencia)}</span>` : ''}</div>
      <div class="meta"><p>${esc(x.tipo)}</p>${x.entidad ? `<p>${esc(x.entidad)}</p>` : ''}${x.anio ? `<p>${esc(x.anio)}</p>` : ''}<p>${esc(x.tema)}</p></div>
      <div class="acc2">${x.publicar_pdf ? `<a class="btn sec" href="${enc(x.pdf)}" target="_blank" rel="noopener">Ver PDF</a><a class="btn sec" href="${enc(x.pdf)}" download>Descargar</a>` : `<span class="nota-peq">${esc(x.nota_publicacion || 'No disponible para descarga pública.')}</span>`}</div></article>`).join('') : '<p>No hay documentos con ese filtro.</p>';
  };
  $('#n-q').oninput = pinta; chips(); pinta();
}

/* ---------- ESTADO DEL ARTE ---------- */
async function initArte() {
  const el = $('#tab-arte');
  const lista = await getJSON('data/estado_del_arte.json');
  if (!lista) { el.innerHTML = banda('arte', 'Estado del arte', 'Antecedentes académicos.') + '<div class="cuerpo"><p class="estado ver error">No se pudo cargar data/estado_del_arte.json.</p></div>'; return; }
  el.innerHTML = banda('arte', 'Estado del arte', 'Antecedentes académicos de la investigación. Se listan como referencias; los textos completos pertenecen a sus autores.') + `<div class="cuerpo"><div class="filas">${lista.map(x => `<article class="fila"><div><h3>${esc(x.titulo)}</h3>${x.autor ? `<p>${esc(x.autor)}</p>` : ''}${x.relacion ? `<p><strong>Relación con la investigación:</strong> ${esc(x.relacion)}</p>` : ''}</div><div class="meta">${x.anio ? `<p>${esc(x.anio)}</p>` : ''}${x.fuente ? `<p>${esc(x.fuente)}</p>` : ''}${x.tema ? `<p>${esc(x.tema)}</p>` : ''}</div><div></div></article>`).join('')}</div></div>`;
}

/* ---------- METODOLOGÍA (texto de la ficha técnica) ---------- */
function initMetodologia() {
  const R = [['1977', '7 de enero de 1977', 'Landsat 1 MSS', '60 m', 'B7 - B5 - B4'], ['2000', '31 de marzo de 2000', 'Landsat 5 TM', '30 m', 'B4 - B3 - B2'], ['2015', '4 de enero de 2015', 'Landsat 8 OLI', '30 m', 'B5 - B4 - B3'], ['2025', '22 de enero de 2025', 'Sentinel-2 MSI, nivel L2A', '10 m', 'B08 - B04 - B03']];
  const pasos = ['Se construyó el compuesto en falso color de cada imagen y se recortó al límite municipal.', 'Se aplicó una clasificación k-means con 10 clústeres, igual en las cuatro fechas.', 'Se aplicó un filtro sieve de 10 píxeles (conectividad 8) para eliminar parches aislados.', 'Los clústeres se reclasificaron en cuatro clases. Cada clúster se verificó con la herramienta Identificar sobre imagen satelital de referencia (Google Satellite) y conocimiento del territorio. Los números de clúster son independientes en cada año y no se comparan entre fechas.', 'En 2015 y 2025 se corrigieron manualmente, con el complemento Serval de QGIS, las zonas donde la clasificación automática confundía coberturas.', 'En 1977 los clústeres correspondientes a nubes se asignaron a Cultivos y pastos, porque bajo ellas hay cultivos.', 'Para comparar 2025 con 2000 y 2015 se generó una versión de 2025 a 30 m, asignando a cada píxel la clase dominante y aplicando el mismo filtro sieve.'];
  const lim = ['<strong>Resolución distinta.</strong> Los píxeles miden 60, 30, 30 y 10 m. Con el mismo sieve de 10 píxeles, la unidad mínima de mapeo es de unas 3,6 ha en 1977, 0,9 ha en 2000 y 2015, y 0,1 ha en 2025. Por eso el cambio 2015-2025 se calculó con la versión de 2025 a 30 m.', '<strong>Estacionalidad.</strong> Tres imágenes son de enero (época seca) y la de 2000 es de finales de marzo, cuando suele comenzar la primera temporada de lluvias.', '<strong>1977.</strong> A 60 m no se detectó zona industrial/minera, y las nubes de la imagen se asignaron a Cultivos y pastos. En el mapa de cambio 1977-2025, toda la zona industrial/minera de 2025 aparece como nueva.', '<strong>Confusión entre clases.</strong> El k-means no separa bien la zona urbana de la industrial (techos y concreto) ni la vegetación de los pastos densos. Entre 2015 y 2025 el cambio neto de la vegetación natural es pequeño frente a lo que se intercambia con Cultivos y pastos, así que se interpreta como estabilidad dentro del margen del método.', '<strong>Clasificaciones independientes.</strong> Cada fecha tiene su propio k-means y su propia tabla de reclasificación.'];
  $('#tab-metodologia').innerHTML = banda('metodologia', 'Metodología', 'Cómo se procesaron las imágenes de satélite y qué límites tienen los resultados.') + `<div class="cuerpo"><div class="metod">
  <p>Los mapas de cobertura de la tierra del municipio de Tocancipá para 1977, 2000, 2015 y 2025 usan la misma leyenda de cuatro clases y el mismo método, de modo que los cambios entre años sean comparables. El área de estudio es el límite municipal de Tocancipá (Cundinamarca), y los mapas sirven de insumo al trabajo de grado sobre conflictos territoriales de la comunidad indígena muisca.</p>
  <h3>Imágenes utilizadas</h3><div class="tabla-scroll"><table><thead><tr><th>Año</th><th>Fecha de la imagen</th><th>Sensor</th><th>Resolución</th><th>Composición (R-G-B)</th></tr></thead><tbody>${R.map(r => `<tr>${r.map(c => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
  <p>En todas las fechas la composición es en falso color: infrarrojo cercano en el canal rojo, rojo en el verde y verde en el azul. Las imágenes Sentinel-2 L2A y la Landsat de 2015 (L2SP) ya vienen corregidas atmosféricamente; las de 1977 y 2000 (L1TP) no, por lo que sus valores espectrales no son directamente comparables con los de las otras fechas. Se verificó el nivel de procesamiento de las imágenes Landsat en los archivos MTL: nivel 1 (L1TP) en 1977 y 2000, y nivel 2 (L2SP) en 2015.</p>
  <h3>Método</h3><p>Cada fecha se clasificó de forma no supervisada y luego se verificó a mano contra la realidad del territorio.</p><ol class="pasos">${pasos.map(p => `<li>${esc(p)}</li>`).join('')}</ol>
  <h3>Clases y colores</h3><div class="dos-col"><div><p class="leg-t">Cobertura (1977, 2000, 2015 y 2025)</p><ul class="leyenda">${CFG.clases_cobertura.map(k => `<li><span class="sw" style="background:${k.color}"></span>${k.codigo}. ${esc(k.nombre)} <code>${k.color}</code></li>`).join('')}</ul></div><div><p class="leg-t">Cambio 1977 a 2025</p><ul class="leyenda">${CFG.clases_cambio.map(k => `<li><span class="sw" style="background:${k.color}"></span>${k.codigo}. ${esc(k.nombre)} <code>${k.color}</code></li>`).join('')}</ul></div></div>
  <h3>Resultados principales</h3><p>Entre 1977 y 2025 la vegetación natural perdió cerca de 1.924 ha (−52 %), mientras la zona urbana y la industrial/minera crecieron. En el mapa de cambio 1977-2025 las categorías son excluyentes: un píxel que pasó de vegetación a zona urbana o industrial/minera cuenta como zona nueva y no como pérdida de vegetación. Por eso la pérdida del mapa (1.907 ha) es menor que la caída neta de la tabla (1.924 ha). Las cifras de área están en el <a href="#geovisor" data-go="geovisor">geovisor</a>.</p>
  <h3>Limitaciones</h3><ul>${lim.map(l => `<li>${l}</li>`).join('')}</ul>
  <h3>Fuentes y sistemas de coordenadas</h3><ul><li>Sentinel-2: producto S2C_MSIL2A_20250122T152721_N0511_R025_T18NXL, descargado de Copernicus.</li><li>Landsat (1977, 2000 y 2015): descargadas de USGS EarthExplorer, Collection 2. 1977 y 2000: nivel 1 (L1TP, Tier 2); 2015: nivel 2 (L2SP, reflectancia de superficie, Tier 1).</li><li>Modelo de ocupación: Acuerdo 09 de 2010 (POT), suministrado por la Secretaría de Planeación de Tocancipá.</li><li>Predial: suministrado por la Secretaría de Planeación de Tocancipá.</li><li>Límite municipal, división veredal y polígono minero (Resolución 2001-2016): suministrados por la Secretaría de Planeación de Tocancipá.</li></ul>
  <p>Las capas listas para web están en EPSG:4326 (WGS 84); los GeoTIFF conservan su sistema de coordenadas original.</p>
  <h3>Responsables</h3><p>Elaboración: Alejandra Segura Villarreal y Gabriela Mateus Munévar, ${esc(CFG.institucion)}.</p></div></div>`;
  $$('#tab-metodologia [data-go]').forEach(a => a.onclick = e => { e.preventDefault(); mostrar(a.dataset.go); });
}

/* ---------- arranque ---------- */
async function arrancar() {
  CFG = await getJSON('data/config.json');
  if (!CFG) { document.body.insertAdjacentHTML('afterbegin', '<p class="estado ver error">No se pudo cargar data/config.json. Si abriste index.html con doble clic, usa un servidor local (python -m http.server) o la dirección de GitHub Pages.</p>'); return; }
  document.title = CFG.titulo;
  const tabs = $$('#pestanas [role=tab]');
  tabs.forEach((b, i) => { b.onclick = () => mostrar(b.dataset.tab); b.onkeydown = e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { const n = tabs[(i + d + tabs.length) % tabs.length]; n.focus(); mostrar(n.dataset.tab); } }; });
  $('#foto-cerrar').onclick = () => $('#dlg-foto').close();
  $('#foto-ant').onclick = () => { fi = (fi - 1 + fotos.length) % fotos.length; mostrarFoto(); };
  $('#foto-sig').onclick = () => { fi = (fi + 1) % fotos.length; mostrarFoto(); };
  $('#dlg-foto').addEventListener('keydown', e => { if (e.key === 'ArrowLeft') $('#foto-ant').click(); if (e.key === 'ArrowRight') $('#foto-sig').click(); });
  window.addEventListener('hashchange', () => mostrar(location.hash.slice(1)));
  mostrar(location.hash.slice(1) || 'inicio');
}
arrancar();
})();
