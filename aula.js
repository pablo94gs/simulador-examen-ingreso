/* Aula virtual: práctica por capítulo y simulador de lecciones con el banco del libro.
   El contenido (aula/indice.js y aula/<id>.js) está cifrado con AES-GCM; la llave se deriva del código de acceso. */
(() => {
  "use strict";
  const $ = id => document.getElementById(id), cuerpo = $("aula-cuerpo");
  const LETRAS = "ABCDE", ANCHO = 915, HECHOS = "aula_hechos_v1", HISTL = "aula_lecciones_v1", SES = "aula_codigo_v1";
  let llave = null, LIBRO = null, lec = null, tic = null, vigia = null;
  const urls = new Map();
  const leer = (k, def) => { try { return JSON.parse(localStorage.getItem(k)) ?? def; } catch { return def; } };
  const guardar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const mmss = s => { s = Math.max(0, Math.round(s)); const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
    return (h ? h + ":" + String(m).padStart(2, "0") : m) + ":" + String(x).padStart(2, "0"); };

  // ---------- cifrado ----------
  // Los archivos del aula son .js que llaman a window.__aula(nombre, contenido): se cargan con <script>, que
  // funciona igual en la página publicada y abriendo index.html con doble clic.
  const espera = new Map();
  window.__aula = (nombre, texto) => { const f = espera.get(nombre); espera.delete(nombre); f?.(texto); };
  function traer(nombre) {
    return new Promise((ok, mal) => {
      const s = document.createElement("script");
      espera.set(nombre, ok);
      s.src = `aula/${nombre}.js`;
      s.onerror = () => { espera.delete(nombre); s.remove(); mal(new TypeError("no se pudo descargar " + nombre)); };
      s.onload = () => s.remove();
      document.head.append(s);
    });
  }
  const bytes = b64 => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  async function derivar(codigo) {
    const cfg = JSON.parse(await traer("llave"));
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(codigo), "PBKDF2", false, ["deriveKey"]);
    return crypto.subtle.deriveKey({ name: "PBKDF2", salt: bytes(cfg.sal), iterations: cfg.iter, hash: "SHA-256" },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
  }
  async function descifrar(nombre, k) {
    const b = bytes(await traer(nombre));
    return crypto.subtle.decrypt({ name: "AES-GCM", iv: b.subarray(0, 12) }, k, b.subarray(12));
  }
  /** Devuelve "" si el código abre el aula, o el mensaje de error. */
  async function abrirCon(codigo) {
    if (!window.crypto || !crypto.subtle) return "Este navegador no permite abrir el aula desde aquí. Entra por la página publicada en internet.";
    let k, datos;
    try { k = await derivar(codigo); datos = await descifrar("indice", k); }
    catch (e) { return e instanceof TypeError ? "No se pudo descargar el aula. Revisa tu conexión e inténtalo de nuevo." : "Código incorrecto."; }
    llave = k; LIBRO = JSON.parse(new TextDecoder().decode(datos));
    for (const c of LIBRO) {                       // los ejemplos anteriores al primer tema se agrupan en el primero
      const primero = c.secciones[0][0];
      for (const e of c.ejemplos) e.s ??= primero;
      for (const p of c.propuestos) p.s ??= primero;
    }
    try { sessionStorage.setItem(SES, codigo); } catch {}
    return "";
  }

  // ---------- imágenes cifradas ----------
  const img = (id, h, alt) => `<div class="lienzo"><img class="cif" data-a="${id}" width="${ANCHO}" height="${h}" alt="${esc(alt)}"></div>`;
  async function cargar(el) {
    const id = el.dataset.a;
    if (!id || el.dataset.ok) return;
    el.dataset.ok = "1";
    try {
      if (!urls.has(id)) urls.set(id, descifrar(id, llave).then(b => URL.createObjectURL(new Blob([b], { type: "image/webp" }))));
      el.src = await urls.get(id);
    } catch { urls.delete(id); delete el.dataset.ok; el.alt = "No se pudo cargar la imagen. Revisa tu conexión."; }
  }
  function activar() {
    vigia?.disconnect();
    vigia = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { cargar(e.target); vigia.unobserve(e.target); } }), { rootMargin: "500px" });
    cuerpo.querySelectorAll("img.cif").forEach(i => vigia.observe(i));
  }
  function pintar(html, titulo) {
    cuerpo.innerHTML = html; $("aula-tit").textContent = titulo || "Aula virtual";
    $("aula-reloj").hidden = $("aula-entregar").hidden = !(lec && !lec.fin);
    activar(); window.scrollTo(0, 0);
  }

  // ---------- datos ----------
  const cap = n => LIBRO.find(c => c.cap === n);
  const sirve = (it, soloOpcion) => soloOpcion ? !!it.r : !!(it.r || it.hr || it.hs);       // tiene con qué comprobarse
  const hechos = () => new Set(leer(HECHOS, []));
  const migas = partes => `<nav class="migas">${partes.map(([t, a]) => a ? `<button class="enlace" data-acc="${a}">${esc(t)}</button>` : `<b>${esc(t)}</b>`).join(" › ")}</nav>`;

  // ---------- inicio del aula ----------
  function portada() {
    lec = null; clearInterval(tic);
    const h = hechos();
    const tarjetas = LIBRO.map(c => {
      const total = c.ejemplos.length + c.propuestos.length, ok = [...c.ejemplos, ...c.propuestos].filter(x => h.has(x.id)).length;
      return `<button class="materia" data-acc="cap:${c.cap}"><div class="mini2">Capítulo ${c.cap}</div><h2>${esc(c.titulo)}</h2>
        <div class="temas">${c.secciones.length} temas · ${c.ejemplos.length} ejemplos resueltos · ${c.propuestos.length} ejercicios propuestos</div>
        <div class="pista"><i style="width:${ok / total * 100}%"></i></div><div class="ir">${ok ? `${ok} de ${total} hechos` : "Entrar"} →</div></button>`; }).join("");
    pintar(`<section class="seccion" style="margin-top:8px"><h3>Simulador de lecciones</h3>
        <div class="aviso"><span>Arma una lección con ejercicios al azar del libro: tú eliges los temas, cuántas preguntas y cuánto tiempo.</span>
        <button class="btn fuerte" data-acc="leccion">Armar una lección</button></div></section>
      <section class="seccion"><h3>Practicar por capítulo · Fundamentos de Matemáticas</h3><div class="materias">${tarjetas}</div></section>`);
  }

  function capitulo(n) {
    const c = cap(n), h = hechos();
    const filas = c.secciones.map(([k, t]) => {
      const ej = c.ejemplos.filter(x => x.s === k), pr = c.propuestos.filter(x => x.s === k), ok = [...ej, ...pr].filter(x => h.has(x.id)).length;
      return `<button class="fila-tema2" data-acc="tema:${n}:${k}"><b>${k}</b><span>${esc(t)}</span><small>${ej.length} ejemplos · ${pr.length} propuestos${ok ? ` · ${ok} hechos` : ""}</small></button>`; }).join("");
    pintar(migas([["Aula virtual", "portada"], [`Capítulo ${n}`]]) + `<h2 class="titulo">${esc(c.titulo)}</h2><div class="lista-temas">${filas}</div>`, `Capítulo ${n} · ${c.titulo}`);
  }

  function tarjeta(it, tipo, h) {
    const nombre = tipo === "e" ? `Ejemplo ${it.id.match(/^c(\d+)/)[1]}.${it.n}` : `Ejercicio ${it.n}`;
    let pie = "";
    if (tipo === "e") pie = it.hs ? `<details class="sol"><summary>Ver la solución del libro</summary>${img(it.id + "s", it.hs, "Solución del " + nombre)}</details>` : "";
    else if (it.r) pie = `<div class="opciones chicas" data-r="${it.r}">${[...LETRAS.slice(0, it.o || 5)].map(l => `<button class="opcion" data-l="${l}">${l.toLowerCase()})</button>`).join("")}</div><p class="veredicto" hidden></p>`;
    else if (it.hr) pie = `<details class="sol"><summary>Ver la respuesta del libro</summary><p class="origen">La respuesta de este ejercicio empieza en el número resaltado.</p>${img(it.id + "r", it.hr, "Respuesta del " + nombre)}</details>`;
    else pie = `<p class="origen">El libro no trae la respuesta de este ejercicio.</p>`;
    return `<article class="revision"><header><span class="num">${nombre}</span>${it.t ? `<span class="tema">${esc(it.t)}</span>` : ""}
      <label class="hecho"><input type="checkbox" data-hecho="${it.id}"${h.has(it.id) ? " checked" : ""}> Hecho</label></header>
      <div class="cuerpo">${img(it.id, it.h, nombre)}${pie}</div></article>`;
  }
  function tema(n, k, pest) {
    const c = cap(n), t = c.secciones.find(s => s[0] === k)[1], h = hechos();
    const ej = c.ejemplos.filter(x => x.s === k), pr = c.propuestos.filter(x => x.s === k);
    pest = pest || (ej.length ? "e" : "p");
    const lista = pest === "e" ? ej : pr;
    pintar(migas([["Aula virtual", "portada"], [`Capítulo ${n}`, `cap:${n}`], [k]]) + `<h2 class="titulo">${k} ${esc(t)}</h2>
      <div class="pestanas"><button class="btn${pest === "e" ? " fuerte" : ""}" data-acc="tema:${n}:${k}:e">Ejemplos resueltos (${ej.length})</button>
        <button class="btn${pest === "p" ? " fuerte" : ""}" data-acc="tema:${n}:${k}:p">Ejercicios propuestos (${pr.length})</button></div>
      ${lista.length ? lista.map(x => tarjeta(x, pest, h)).join("") : `<p class="origen">Este tema no tiene ${pest === "e" ? "ejemplos resueltos" : "ejercicios propuestos"} en el libro.</p>`}`, `${k} ${t}`);
  }

  // ---------- simulador de lecciones: configuración ----------
  function configurar() {
    lec = null; clearInterval(tic);
    const caps = LIBRO.map(c => `<details class="cap-sel"><summary><label><input type="checkbox" data-cap="${c.cap}"> <b>Capítulo ${c.cap}.</b> ${esc(c.titulo)}</label></summary>
      <div class="temas-sel">${c.secciones.map(([k, t]) => `<label><input type="checkbox" data-tema="${c.cap}:${k}"> ${k} ${esc(t)}</label>`).join("")}</div></details>`).join("");
    const hist = leer(HISTL, []);
    pintar(migas([["Aula virtual", "portada"], ["Simulador de lecciones"]]) + `<h2 class="titulo">Arma tu lección</h2>
      <div class="config"><section class="panel"><h3>1. Temas</h3>
          <p class="acciones" style="margin:0 0 10px"><button class="btn chico" data-acc="sel:todo">Marcar todo</button><button class="btn chico" data-acc="sel:nada">Quitar todo</button></p>${caps}</section>
        <section class="panel"><h3>2. Preguntas y tiempo</h3>
          <label class="campo">Cantidad de preguntas<input type="number" id="lec-n" min="1" max="100" value="10"></label>
          <label class="campo">Tiempo (minutos)<input type="number" id="lec-min" min="1" max="300" value="30"></label>
          <h3 style="margin-top:18px">3. De dónde salen</h3>
          <label class="casilla"><input type="checkbox" id="lec-prop" checked> Ejercicios propuestos</label>
          <label class="casilla"><input type="checkbox" id="lec-ejem" checked> Ejemplos resueltos (con la solución del libro)</label>
          <label class="casilla"><input type="checkbox" id="lec-opc"> Solo preguntas de opción múltiple (se califican solas)</label>
          <p class="origen" id="lec-disp"></p>
          <button class="btn fuerte" data-acc="empezar" id="lec-ir" style="width:100%;margin-top:6px">Empezar la lección</button>
          <p class="origen">Las preguntas de opción múltiple se califican solas. En las demás, al entregar ves la respuesta o la solución del libro y tú marcas si la tuviste bien.</p></section></div>
      ${hist.length ? `<section class="seccion"><h3>Tus últimas lecciones</h3><table class="intentos"><thead><tr><th>Fecha</th><th>Temas</th><th>Aciertos</th><th>Calificación</th><th>Tiempo</th></tr></thead><tbody>
        ${hist.slice(0, 8).map(i => `<tr><td>${new Date(i.f).toLocaleDateString("es", { day: "numeric", month: "short", year: "numeric" })}</td><td>${i.temas}</td><td>${i.a} de ${i.n}${i.p ? ` (${i.p} sin calificar)` : ""}</td><td><b>${Math.round(i.a / i.n * 100)}</b>/100</td><td>${mmss(i.t)}</td></tr>`).join("")}</tbody></table></section>` : ""}`, "Simulador de lecciones");
    disponibles();
  }
  function bolsa() {
    const temas = new Set([...cuerpo.querySelectorAll("[data-tema]:checked")].map(i => i.dataset.tema));
    const prop = $("lec-prop").checked, ejem = $("lec-ejem").checked, opc = $("lec-opc").checked, out = [];
    for (const c of LIBRO) {
      if (prop) for (const p of c.propuestos) if (temas.has(`${c.cap}:${p.s}`) && sirve(p, opc)) out.push({ ...p, cap: c.cap, tipo: "p" });
      if (ejem && !opc) for (const e of c.ejemplos) if (temas.has(`${c.cap}:${e.s}`) && e.hs) out.push({ ...e, cap: c.cap, tipo: "e" });
    }
    return { out, temas };
  }
  function disponibles() {
    if (!$("lec-disp")) return;
    const { out, temas } = bolsa();
    for (const c of cuerpo.querySelectorAll("[data-cap]")) {
      const hijos = [...c.closest("details").querySelectorAll("[data-tema]")], n = hijos.filter(h => h.checked).length;
      c.checked = n === hijos.length; c.indeterminate = n > 0 && n < hijos.length;
    }
    $("lec-disp").textContent = !temas.size ? "Elige al menos un tema." : `Con lo elegido hay ${out.length} pregunta${out.length === 1 ? "" : "s"} disponible${out.length === 1 ? "" : "s"}.`;
    $("lec-ir").disabled = !out.length;
  }
  function empezar() {
    const { out, temas } = bolsa();
    if (!out.length) return;
    for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
    const n = Math.max(1, Math.min(out.length, parseInt($("lec-n").value, 10) || 10)), min = Math.max(1, Math.min(300, parseInt($("lec-min").value, 10) || 30));
    lec = { ps: out.slice(0, n), resp: {}, nota: {}, propia: {}, inicio: Date.now(), dur: min * 60, fin: null, actual: 0, temas: temas.size };
    pregunta(); reloj(); clearInterval(tic); tic = setInterval(reloj, 500);
  }

  // ---------- lección en curso ----------
  const nombreDe = p => p.tipo === "e" ? `Ejemplo ${p.cap}.${p.n}` : `Capítulo ${p.cap} · ejercicio ${p.n}`;
  const temaDe = p => { const s = cap(p.cap).secciones.find(x => x[0] === p.s); return s ? `${s[0]} ${s[1]}` : ""; };
  const restante = () => lec.dur - (Date.now() - lec.inicio) / 1000;
  function reloj() {
    if (!lec || lec.fin) return;
    const r = restante();
    $("aula-reloj").textContent = mmss(r); $("aula-reloj").classList.toggle("poco", r <= 60);
    if (r <= 0) entregar(true);
  }
  function anotar() { const t = $("lec-texto"); if (t && lec && !lec.fin) { if (t.value.trim()) lec.nota[lec.actual] = t.value; else delete lec.nota[lec.actual]; } }
  function pregunta() {
    const i = lec.actual, p = lec.ps[i], N = lec.ps.length;
    const contestada = k => lec.resp[k] || lec.nota[k];
    const entrada = p.r
      ? `<div class="opciones" role="radiogroup" aria-label="Tu respuesta">${[...LETRAS.slice(0, p.o || 5)].map(l => `<button class="opcion" role="radio" data-resp="${l}" aria-checked="${lec.resp[i] === l}">${l.toLowerCase()})</button>`).join("")}</div>`
      : `<label class="campo" style="margin-top:16px">Tu respuesta (al entregar la comparas con la del libro)<textarea id="lec-texto" rows="3" placeholder="Escribe aquí tu resultado final">${esc(lec.nota[i] || "")}</textarea></label>`;
    pintar(`<div class="examen" style="padding:0"><section class="hoja"><div class="cab-preg"><span class="num">Pregunta ${i + 1} de ${N}</span><span class="tema">${esc(temaDe(p))}</span></div>
        ${img(p.id, p.h, "Enunciado de la pregunta " + (i + 1))}<p class="desliza">↔ Desliza la pregunta hacia los lados para verla completa.</p>${entrada}
        <div class="nav-preg"><button class="btn" data-acc="ir:${i - 1}"${i ? "" : " disabled"}>← Anterior</button><button class="btn fuerte" data-acc="${i === N - 1 ? "entregar" : "ir:" + (i + 1)}">${i === N - 1 ? "Revisar y entregar" : "Siguiente →"}</button></div></section>
      <aside class="lado"><div class="panel"><h3>Preguntas</h3><div class="mapa">${lec.ps.map((_, k) => `<button data-acc="ir:${k}" class="${contestada(k) ? "resp " : ""}${k === i ? "act" : ""}">${k + 1}</button>`).join("")}</div></div>
        <div class="panel"><h3>Avance</h3><b>${lec.ps.filter((_, k) => contestada(k)).length}</b> de ${N} respondidas</div></aside></div>`, "Lección");
  }
  function entregar(porTiempo) {
    if (!lec || lec.fin) return;
    anotar();
    if (!porTiempo) {
      const faltan = lec.ps.filter((_, k) => !(lec.resp[k] || lec.nota[k])).length;
      if (!confirm((faltan ? `Te faltan ${faltan} pregunta${faltan === 1 ? "" : "s"} por responder. ` : "") + "¿Entregar la lección? Ya no podrás cambiar tus respuestas.")) return;
    }
    clearInterval(tic);
    lec.fin = Math.min(Date.now(), lec.inicio + lec.dur * 1000); lec.porTiempo = !!porTiempo; lec.reg = Date.now();
    registrar(); resultado();
  }
  const estado = k => { const p = lec.ps[k]; return p.r ? (!lec.resp[k] ? "nada" : lec.resp[k] === p.r ? "ok" : "mal") : (lec.propia[k] || "pend"); };
  function registrar() {
    const N = lec.ps.length, es = lec.ps.map((_, k) => estado(k));
    const h = leer(HISTL, []).filter(x => x.id !== lec.reg);
    h.unshift({ id: lec.reg, f: lec.fin, temas: lec.temas, n: N, a: es.filter(e => e === "ok").length, p: es.filter(e => e === "pend").length, t: Math.round((lec.fin - lec.inicio) / 1000) });
    guardar(HISTL, h.slice(0, 30));
  }
  function cabecera() {
    const N = lec.ps.length, es = lec.ps.map((_, k) => estado(k)), ok = es.filter(e => e === "ok").length, pend = es.filter(e => e === "pend").length;
    return `<div class="grande"><span>${Math.round(ok / N * 100)}</span><small>/100</small></div>
      <div><h2>Lección terminada</h2><p>${ok} de ${N} respuestas correctas${lec.porTiempo ? " · se entregó al terminarse el tiempo" : ""} · tiempo usado ${mmss((lec.fin - lec.inicio) / 1000)}</p>
      <p>${pend ? `Te falta${pend === 1 ? "" : "n"} <b>${pend}</b> pregunta${pend === 1 ? "" : "s"} por calificar: compara tu respuesta con la del libro y marca si la tuviste bien.` : "Todas las preguntas están calificadas."}</p></div>`;
  }
  function resultado() {
    const tarjetas = lec.ps.map((p, k) => {
      const e = estado(k), sello = { ok: "✓ Correcta", mal: "✗ Incorrecta", nada: "— En blanco", pend: "Por calificar" }[e];
      let medio;
      if (p.r) medio = `<div class="letras">${[...LETRAS.slice(0, p.o || 5)].map(l => `<span class="${l === p.r ? "correcta" : l === lec.resp[k] ? "tuya-mal" : ""}">${l.toLowerCase()})</span>`).join("")}</div>`;
      else medio = `<p class="tuya"><b>Tu respuesta:</b> ${lec.nota[k] ? esc(lec.nota[k]) : "<i>no escribiste nada</i>"}</p>
        <details class="sol" open><summary>${p.tipo === "e" ? "Solución del libro" : "Respuesta del libro"}</summary>${p.tipo === "p" ? `<p class="origen">La respuesta empieza en el número resaltado.</p>` : ""}${img(p.id + (p.tipo === "e" ? "s" : "r"), p.tipo === "e" ? p.hs : p.hr, "Respuesta de la pregunta " + (k + 1))}</details>
        <div class="acciones" style="margin:14px 0 0"><button class="btn${e === "ok" ? " verde" : ""}" data-acc="propia:${k}:ok">✓ La tuve bien</button><button class="btn${e === "mal" ? " roja" : ""}" data-acc="propia:${k}:mal">✗ La tuve mal</button></div>`;
      return `<article class="revision ${e === "pend" ? "nada" : e}" id="lrev-${k}"><header><span class="num">${k + 1}</span><span class="sello">${sello}</span><span class="tema" style="margin-left:auto">${esc(nombreDe(p))} · ${esc(temaDe(p))}</span></header>
        <div class="cuerpo">${img(p.id, p.h, "Enunciado de la pregunta " + (k + 1))}${medio}</div></article>`; }).join("");
    const y = window.scrollY, primera = !cuerpo.querySelector("#lec-nota");
    pintar(`<section class="nota" id="lec-nota" style="margin-bottom:18px">${cabecera()}</section>
      <div class="acciones"><button class="btn fuerte" data-acc="leccion">Armar otra lección</button><button class="btn" data-acc="portada">Volver al aula</button></div>
      <h3 style="margin-bottom:12px">Revisión pregunta por pregunta</h3>${tarjetas}`, "Resultado de la lección");
    if (!primera) window.scrollTo(0, y);
  }

  // ---------- eventos ----------
  cuerpo.addEventListener("click", e => {
    const op = e.target.closest(".opciones.chicas .opcion");
    if (op) {                                       // práctica: comprobar una opción al instante
      const caja = op.parentElement, v = caja.nextElementSibling, bien = op.dataset.l === caja.dataset.r;
      caja.querySelectorAll(".opcion").forEach(b => b.classList.remove("bien", "mal"));
      op.classList.add(bien ? "bien" : "mal");
      v.hidden = false; v.className = "veredicto " + (bien ? "bien" : "mal");
      v.textContent = bien ? "✓ Correcto." : "✗ No es esa. Inténtalo otra vez.";
      return;
    }
    const r = e.target.closest("[data-resp]");
    if (r && lec && !lec.fin) { const i = lec.actual; if (lec.resp[i] === r.dataset.resp) delete lec.resp[i]; else lec.resp[i] = r.dataset.resp; pregunta(); return; }
    const b = e.target.closest("[data-acc]");
    if (!b) return;
    const [acc, a, c, d] = b.dataset.acc.split(":");
    if (acc === "portada") portada();
    else if (acc === "cap") capitulo(+a);
    else if (acc === "tema") tema(+a, c, d);
    else if (acc === "leccion") configurar();
    else if (acc === "sel") { cuerpo.querySelectorAll("[data-tema]").forEach(i => i.checked = a === "todo"); disponibles(); }
    else if (acc === "empezar") empezar();
    else if (acc === "ir") { anotar(); lec.actual = Math.max(0, Math.min(lec.ps.length - 1, +a)); pregunta(); }
    else if (acc === "entregar") entregar(false);
    else if (acc === "propia") { lec.propia[+a] = c; registrar(); resultado(); }
  });
  cuerpo.addEventListener("change", e => {
    const t = e.target;
    if (t.dataset.hecho) { const h = hechos(); t.checked ? h.add(t.dataset.hecho) : h.delete(t.dataset.hecho); guardar(HECHOS, [...h]); }
    else if (t.dataset.cap) { t.closest("details").querySelectorAll("[data-tema]").forEach(i => i.checked = t.checked); disponibles(); }
    else if (t.dataset.tema || ["lec-prop", "lec-ejem", "lec-opc"].includes(t.id)) disponibles();
  });
  cuerpo.addEventListener("input", e => { if (e.target.id === "lec-texto") anotar(); });
  $("aula-entregar").onclick = () => entregar(false);
  window.addEventListener("beforeunload", e => { if (lec && !lec.fin) { e.preventDefault(); e.returnValue = ""; } });

  // ---------- entrada desde la página principal ----------
  const dlg = $("dlg-codigo");
  async function probar(codigo) {
    $("codigo-si").disabled = true; $("codigo-error").hidden = true; $("codigo-si").textContent = "Abriendo…";
    const error = await abrirCon(codigo);
    $("codigo-si").disabled = false; $("codigo-si").textContent = "Entrar";
    if (error) { $("codigo-error").textContent = error; $("codigo-error").hidden = false; $("codigo").select(); return false; }
    if (dlg.open) dlg.close();
    window.SIM.ver("aula"); portada();
    return true;
  }
  $("form-codigo").addEventListener("submit", e => { e.preventDefault(); const c = $("codigo").value.trim(); if (c) probar(c); });
  $("codigo-no").onclick = () => dlg.close();
  window.AULA = {
    async entrar() {
      if (LIBRO) { window.SIM.ver("aula"); portada(); return; }
      let previo = null; try { previo = sessionStorage.getItem(SES); } catch {}
      if (previo && await probar(previo)) return;
      $("codigo").value = ""; $("codigo-error").hidden = true; dlg.showModal(); $("codigo").focus();
    },
    /** true si se puede salir (no hay lección en curso o el usuario confirma). */
    salir() {
      if (lec && !lec.fin && !confirm("¿Estás seguro de salir de la lección? Se perderán tus respuestas.")) return false;
      lec = null; clearInterval(tic); return true;
    },
  };
})();
