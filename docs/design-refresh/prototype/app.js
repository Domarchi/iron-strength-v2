// Interactive visual proposal only. No API, account access or persistent storage.
const query = new URLSearchParams(window.location.search);
const allowedViews = ["home", "workout", "routine"];
const allowedStates = ["ready", "active", "pending", "error"];
const state = {
  view: allowedViews.includes(query.get("view")) ? query.get("view") : "home",
  theme: query.get("theme") === "light" ? "light" : "dark",
  scenario: allowedStates.includes(query.get("state")) ? query.get("state") : "ready",
  started: query.get("state") === "active" || query.get("view") === "workout",
  exercise: 0,
  restEnd: 0,
  restTotal: 60,
  pausedSeconds: null,
  completed: [
    [false, false],
    [false, false],
  ],
  values: [
    [
      { weight: "55", reps: "8" },
      { weight: "50", reps: "10" },
    ],
    [
      { weight: "40", reps: "10" },
      { weight: "40", reps: "10" },
    ],
  ],
};
const exercises = ["Sentadilla", "Remo"];
const app = document.querySelector("#app");
const navigation = document.querySelector("#navigation");
const dialogRoot = document.querySelector("#dialog-root");
const iconPaths = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z"/>',
  barbell: '<path d="M3 8v8m4-11v14m10-14v14m4-11v8M7 12h10"/>',
  history: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 8h6M9 12h6M9 16h4"/>',
  chart: '<path d="M4 4v16h16M8 15l4-4 3 2 5-7"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  moon: '<path d="M20 14a8.5 8.5 0 0 1-10-10A8.5 8.5 0 1 0 20 14Z"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v4h16v-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};
function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] ?? iconPaths.barbell}</svg>`;
}
function doneCount() {
  return state.completed.flat().filter(Boolean).length;
}
function escape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function button(action, text, className = "", label = "") {
  return `<button type="button" data-action="${action}" class="${className}"${label ? ` aria-label="${label}"` : ""}>${text}</button>`;
}
function header(title, subtitle = "", finish = false) {
  return `<header class="compact-header">${button("home", icon("back"), "icon-button", "Volver a Inicio")}<div class="grow"><h1>${title}</h1>${subtitle ? `<p class="muted small number">${subtitle}</p>` : ""}</div>${finish ? button("finish", "Finalizar", "finish", "Revisar cierre") : button("routine-tools", icon("more"), "icon-button", "Opciones de rutina")}</header>`;
}
function home() {
  const queued = ["pending", "error"].includes(state.scenario);
  return `<header class="page-header"><div><p class="muted small">Sábado 24 de octubre</p><h1>Tu semana</h1></div>${button("account", "A", "avatar", "Abrir Cuenta")}</header>
    <section class="week-summary" aria-label="Avance semanal"><div class="section-title"><span class="muted small">Fuerza · semana 1 de 2</span><span class="number small">0 / 1</span></div><div class="week-track" aria-hidden="true"><span></span></div></section>
    ${queued ? `<section class="status-panel" ${state.scenario === "error" ? 'role="alert"' : 'aria-label="Envío pendiente"'}><h2>${state.scenario === "error" ? "No se pudo enviar" : "Pendiente de enviar"}</h2><p>Piernas · registro de demostración</p>${button("send", "Simular reintento", "text-button")}</section>` : ""}
    <section class="session-card" aria-label="Próximo entrenamiento"><div class="card-top"><span class="eyebrow">${state.started && !queued ? "En curso" : "Siguiente sesión"}</span><span class="session-letter">A</span></div><h2>Piernas</h2><p class="muted small">2 ejercicios · 4 series${state.started && !queued ? ` · ${doneCount()} realizadas` : ""}</p>${button(state.started && !queued ? "resume" : "routine", `${state.started && !queued ? "Retomar" : "Ver rutina"}${icon("arrow")}`, "primary", state.started && !queued ? "Retomar" : "Ver rutina")}</section>
    <section aria-label="Tu planificación"><div class="section-title"><h2>Tu planificación</h2></div>${button("routine", `${icon("barbell")}<span class="grow">Piernas<span class="muted">Sesión A · superserie</span></span>${icon("chevron")}`, "list-row", "Consultar Piernas")}</section>
    <section class="availability" aria-label="Disponibilidad local">${button("download", `${icon("download")}<span class="grow">Sin conexión<span class="muted">Descargar esta semana</span></span>${icon("chevron")}`, "list-row", "Ver descarga de demostración")}</section>`;
}
function routine() {
  return `${header("Rutina")}<section class="routine-title"><span class="eyebrow">Fuerza · sesión A</span><h1>Piernas</h1><p class="muted small">Semana 1 de 2</p></section><div class="routine-meta"><div><strong class="number">2</strong><span>ejercicios</span></div><div><strong class="number">4</strong><span>series</span></div><div><strong class="number">60 s</strong><span>entre rondas</span></div></div><section class="group-mark" aria-label="Superserie"><span class="eyebrow">Superserie · 2 rondas</span><div class="exercise-list">${exercises.map((name, index) => button(`exercise-info-${index}`, `<span class="exercise-symbol">${icon("barbell")}</span><span class="grow">${name}<span class="muted">${index === 0 ? "1 · 6–8 rep · 55 kg<br />2 · 8–10 rep · 50 kg" : "2 × 8–12 rep · 40 kg"}</span></span>${icon("chevron")}`, "list-row", `Ver indicaciones de ${name}`)).join("")}</div></section><div class="routine-primary">${button(state.started ? "resume" : "start", state.started ? "Retomar" : "Empezar entrenamiento", "primary")}</div><p class="routine-caption">Propuesta interactiva. No inicia un registro real.</p>`;
}
function workout() {
  const e = state.exercise;
  const name = exercises[e];
  const round = Math.min(...state.completed.map((sets) => sets.filter(Boolean).length)) + 1;
  return `${header("Piernas", `${doneCount()} de 4 series · sesión de prueba`, true)}<div class="superset-heading"><span class="eyebrow">Superserie A</span><span class="muted small">Ronda ${Math.min(round, 2)} / 2</span></div><nav class="exercise-index" aria-label="Ejercicios de la superserie">${exercises.map((exercise, i) => `<button type="button" data-action="focus-${i}" aria-current="${i === e}">${exercise}<span class="small number">${state.completed[i].filter(Boolean).length} / 2 series</span></button>`).join("")}</nav><section aria-label="Ejercicio actual"><div class="exercise-heading"><div><h2>${name}</h2><p class="muted small">${e === 0 ? "Objetivos por serie" : "Objetivo · 2 × 8–12 rep · 40 kg"}</p></div>${button("context", icon("more"), "icon-button", "Abrir contexto del ejercicio")}</div><div class="sets"><div class="set-grid set-labels" aria-hidden="true"><span>#</span><span>ANT.</span><span>KG</span><span>REPS</span><span>${icon("check")}</span></div>${state.values[e].map((value, i) => `<div class="set-grid set-row${state.completed[e][i] ? " is-done" : ""}"><span>${i + 1}</span><span class="reference">—</span><input type="text" inputmode="decimal" autocomplete="off" aria-label="Peso de ${name}, serie ${i + 1}" data-field="weight" data-set="${i}" value="${escape(value.weight)}" /><input type="text" inputmode="numeric" autocomplete="off" aria-label="Repeticiones de ${name}, serie ${i + 1}" data-field="reps" data-set="${i}" value="${escape(value.reps)}" /><label class="set-check"><input type="checkbox" data-set="${i}" aria-label="Completar serie ${i + 1} de ${name}" ${state.completed[e][i] ? "checked" : ""}/><span class="circle">${icon("check")}</span></label>${e === 0 ? `<span class="series-target">Objetivo · ${i === 0 ? "6–8 rep · 55 kg" : "8–10 rep · 50 kg"}</span>` : ""}</div>`).join("")}</div><p class="set-note">Sigue ${exercises[e === 0 ? 1 : 0]} · descanso al terminar la ronda</p></section>${state.restEnd || state.pausedSeconds !== null ? rest() : `<div class="rest"><div class="rest-head"><div><p class="small">Descanso de ronda</p><span class="muted small number">60 segundos</span></div>${button("rest-start", "Iniciar", "text-button")}</div></div>`}<div class="workout-footer">${button("add-set", "+ Agregar serie")}${button("context", "Historial y notas")}</div>`;
}
function rest() {
  return `<section class="rest" aria-label="Descanso"><div class="rest-head"><div><p class="small muted">${state.pausedSeconds !== null ? "Descanso pausado" : "Descanso"}</p><span class="rest-time" role="timer" aria-label="Tiempo restante"></span></div><div class="rest-buttons">${button("rest-less", "−15", "", "Restar 15 segundos")}${button("rest-more", "+15", "", "Agregar 15 segundos")}${button("rest-pause", state.pausedSeconds !== null ? "Seguir" : "Pausar")}</div></div><div class="rest-line" aria-hidden="true"><span id="rest-progress"></span></div></section>`;
}
function result() {
  return `${header("Resultado")}<section class="result-title"><div class="result-mark">${icon("check")}</div><h1>Resumen de prueba</h1><p class="muted">Piernas · ${doneCount()} series realizadas</p></section><p class="muted small">Envío simulado. Este resultado no se guardó ni se envió al coach.</p><div class="exercise-list">${exercises.map((name, i) => `<div class="list-row"><span class="grow"><strong>${name}</strong><span class="muted">${state.completed[i].filter(Boolean).length} de 2 series</span></span></div>`).join("")}</div><div class="routine-primary">${button("home", "Volver a mi semana", "primary")}${button("result-tools", "Más opciones", "text-button")}</div>`;
}
function render() {
  document.documentElement.dataset.theme = state.theme;
  document.querySelector("#theme-toggle").innerHTML = icon(state.theme === "dark" ? "sun" : "moon");
  document.querySelector("#scenario").value = state.scenario;
  app.dataset.view = state.view;
  app.innerHTML = ({ home, routine, workout, result }[state.view] ?? home)();
  navigation.innerHTML =
    state.view === "workout"
      ? ""
      : `<nav class="bottom-nav" aria-label="Navegación principal">${[
          ["home", "Inicio", "home"],
          ["routine", "Entrenar", "barbell"],
          ["history", "Historial", "history"],
          ["progress", "Progreso", "chart"],
          ["account", "Cuenta", "user"],
        ]
          .map(
            ([action, label, name]) =>
              `<button type="button" data-action="${action}"${state.view === action ? ' aria-current="page"' : ""}>${icon(name)}<span>${label}</span></button>`,
          )
          .join("")}</nav>`;
  document.querySelector("#comparison").href =
    `../comparison.html?view=${state.view === "result" ? "home" : state.view}&theme=${state.theme}`;
  updateTimer();
}
function go(view) {
  state.view = view;
  render();
  window.scrollTo({ top: 0, behavior: "instant" });
}
function updateTimer() {
  const timer = document.querySelector('[role="timer"]');
  if (!timer) return;
  const seconds =
    state.pausedSeconds ?? Math.max(0, Math.ceil((state.restEnd - Date.now()) / 1000));
  timer.textContent = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
  const progress = document.querySelector("#rest-progress");
  if (progress) progress.style.width = `${Math.min(100, (seconds / state.restTotal) * 100)}%`;
}
function startRest() {
  state.restEnd = Date.now() + 60_000;
  state.restTotal = 60;
  state.pausedSeconds = null;
}
function closeDialog() {
  const dialog = dialogRoot.querySelector("dialog");
  if (dialog) dialog.close();
}
function showDialog(title, content) {
  const opener = document.activeElement;
  dialogRoot.innerHTML = `<dialog aria-labelledby="dialog-title"><div class="dialog-header"><h2 id="dialog-title">${title}</h2>${button("close-dialog", icon("close"), "icon-button", "Cerrar panel")}</div>${content}</dialog>`;
  const dialog = dialogRoot.querySelector("dialog");
  dialog.addEventListener(
    "close",
    () => {
      dialogRoot.innerHTML = "";
      if (opener?.isConnected) opener.focus();
    },
    { once: true },
  );
  dialog.showModal();
}
function send() {
  closeDialog();
  state.started = false;
  state.scenario = "ready";
  go("result");
}
function act(action) {
  if (action === "home" || action === "routine") return go(action);
  if (action === "start" || action === "resume") {
    state.started = true;
    return go("workout");
  }
  if (action.startsWith("focus-")) {
    state.exercise = Number(action.at(-1));
    return render();
  }
  if (action.startsWith("exercise-info-"))
    return showDialog(
      exercises[Number(action.at(-1))],
      `<p>${action.endsWith("0") ? "Serie 1 · 6–8 rep · 55 kg<br />Serie 2 · 8–10 rep · 50 kg" : "2 × 8–12 rep · 40 kg"}</p><p class="muted small">Superserie A · 60 s al terminar la ronda</p>`,
    );
  if (action === "context")
    return showDialog(
      exercises[state.exercise],
      `<p class="muted small">${state.exercise === 0 ? "Objetivos por serie · 55 / 50 kg" : "Objetivo · 2 × 8–12 rep · 40 kg"}</p>${button("context-history", 'Historial<span class="muted">Últimas sesiones</span>', "list-row")}${button("context-notes", 'Indicaciones<span class="muted">Notas del coach</span>', "list-row")}${button("context-alternatives", `Alternativas<span class="muted">${state.exercise === 0 ? "Prensa" : "Sin alternativas"}</span>`, "list-row")}`,
    );
  if (action.startsWith("context-"))
    return showDialog(
      action === "context-history"
        ? "Historial"
        : action === "context-notes"
          ? "Indicaciones"
          : "Alternativas",
      `<p class="muted">${action === "context-history" ? "Sin entrenamientos anteriores." : action === "context-notes" ? "Sin indicaciones adicionales." : state.exercise === 0 ? "Prensa · 2 × 8–12 rep · 60 kg" : "Sin alternativas prescritas."}</p>`,
    );
  if (action === "close-dialog") return closeDialog();
  if (action === "rest-start") {
    startRest();
    return render();
  }
  if (action === "rest-pause") {
    if (state.pausedSeconds !== null) {
      state.restEnd = Date.now() + state.pausedSeconds * 1000;
      state.pausedSeconds = null;
    } else state.pausedSeconds = Math.max(0, Math.ceil((state.restEnd - Date.now()) / 1000));
    return render();
  }
  if (action === "rest-less" || action === "rest-more") {
    const delta = action === "rest-more" ? 15 : -15;
    if (state.pausedSeconds !== null)
      state.pausedSeconds = Math.max(0, state.pausedSeconds + delta);
    else state.restEnd = Math.max(Date.now(), state.restEnd + delta * 1000);
    state.restTotal = Math.max(
      state.restTotal,
      Math.ceil((state.restEnd - Date.now()) / 1000),
      state.pausedSeconds ?? 0,
    );
    return updateTimer();
  }
  if (action === "finish")
    return showDialog(
      "¿Terminar entrenamiento?",
      `<p class="number">${doneCount()} realizadas · ${4 - doneCount()} pendientes</p><p class="muted small">Puedes volver para completar las series que faltan.</p><label class="dialog-field">Nota opcional<textarea maxlength="500" placeholder="¿Cómo te sentiste?"></textarea></label>${button("send", "Simular envío", "primary")}${button("close-dialog", "Seguir entrenando", "secondary")}`,
    );
  if (action === "send") return send();
  if (action === "account")
    return showDialog(
      "Cuenta",
      `<p class="muted small">Apariencia de la propuesta</p>${button("appearance", "Cambiar claro / oscuro", "list-row")}<p class="muted small">Sin acceso a tu perfil. Esta vista no guarda preferencias.</p>`,
    );
  if (action === "appearance") {
    state.theme = state.theme === "dark" ? "light" : "dark";
    return render();
  }
  if (action === "download")
    return showDialog(
      "Entrenar sin conexión",
      '<p>La app conservará la descarga explícita de semanas y la sincronización.</p><p class="muted small">Este prototipo no descarga datos ni funciona como una copia offline de tu cuenta.</p>',
    );
  if (action === "history" || action === "progress")
    return showDialog(
      action === "history" ? "Historial" : "Progreso",
      '<p class="muted">El diseño detallado de esta pantalla corresponde a la siguiente entrega.</p><p class="muted small">La app mantendrá tus resultados reales.</p>',
    );
  return showDialog(
    action === "add-set" ? "Agregar serie" : "Opciones",
    '<p class="muted">Esta propuesta se centra en el diseño. Las herramientas completas se conservarán al implementarla.</p>',
  );
}
document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-action]");
  if (target) act(target.dataset.action);
});
app.addEventListener("input", (event) => {
  const field = event.target;
  if (field.dataset.field)
    state.values[state.exercise][Number(field.dataset.set)][field.dataset.field] = field.value;
});
app.addEventListener("change", (event) => {
  const field = event.target;
  if (field.type !== "checkbox") return;
  const series = Number(field.dataset.set);
  state.completed[state.exercise][series] = field.checked;
  if (field.checked) {
    const other = state.exercise === 0 ? 1 : 0;
    if (!state.completed[other][series]) state.exercise = other;
    else {
      startRest();
      state.exercise = 0;
    }
  }
  render();
});
document.querySelector("#theme-toggle").addEventListener("click", () => {
  state.theme = state.theme === "dark" ? "light" : "dark";
  render();
});
document.querySelector("#scenario").addEventListener("change", (event) => {
  state.scenario = event.target.value;
  state.started = state.scenario === "active";
  go("home");
});
render();
window.setInterval(updateTimer, 500);
