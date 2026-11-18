// T237 · Genera las pantallas de las dos direcciones. Solo datos ficticios; sin red ni almacenamiento.
const I = {
  home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
  dumb: '<path d="M3 9v6M6 6v12M18 6v12M21 9v6M6 12h12"/>',
  list: '<path d="M6 3h12a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1zM9 8h6M9 12h6M9 16h4"/>',
  chart: '<path d="M4 4v16h16M8 15l4-5 3 3 4-6"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
  back: '<path d="M15 5l-7 7 7 7"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  check: '<path d="M5 12l5 5 9-10"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  disc: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>',
  flame: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  note: '<path d="M5 4h14v12l-5 5H5zM14 21v-5h5"/>',
  swap: '<path d="M7 7h12l-3-3M17 17H5l3 3"/>',
  fire: '<path d="M12 3c1 4 5 5 5 10a5 5 0 0 1-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3-1-5 1-9z"/>',
  share: '<path d="M12 3v12M8 7l4-4 4 4M5 13v7h14v-7"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  trophy:
    '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 13v4M8 21h8M10 17h4"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
  up: '<path d="M6 15l6-6 6 6"/>',
};
const ic = (n, s) =>
  `<svg class="ic" viewBox="0 0 24 24"${s ? ` style="width:${s}px;height:${s}px"` : ""}>${I[n]}</svg>`;
const tabs = (on) =>
  `<div class="tabbar">${[
    ["home", "Inicio"],
    ["dumb", "Entrenar"],
    ["list", "Historial"],
    ["chart", "Progreso"],
    ["user", "Cuenta"],
  ]
    .map(([i, l]) => `<div class="${l === on ? "on" : ""}">${ic(i)}${l}</div>`)
    .join("")}</div>`;

function home() {
  const days = [
    ["L", "done", "✓"],
    ["M", "", ""],
    ["M", "done", "✓"],
    ["J", "today", "12"],
    ["V", "plan", ""],
    ["S", "", ""],
    ["D", "", ""],
  ];
  return `<div class="scr">
    <div class="flex between"><div><div class="muted t-sm">Hola, Ana</div><div class="d" style="font-size:34px;line-height:1">Jueves 12</div></div><div class="avatar">A</div></div>
    <div class="week">${days.map(([d, c, t]) => `<div class="${c}">${d}<i>${t}</i></div>`).join("")}</div>
    <div class="card" style="padding:16px">
      <div class="flex between"><span class="cap-up">Hoy · Sesión A</span><span class="chip">Semana 1 de 2</span></div>
      <div class="d" style="font-size:44px;line-height:1;margin:8px 0 4px">Piernas</div>
      <div class="muted t-sm">52 min · 2 ejercicios · 4 series</div>
      <div class="flex" style="margin:12px 0 14px;gap:6px"><span class="chip">Cuádriceps</span><span class="chip">Glúteos</span><span class="chip">Espalda</span></div>
      <div class="btn pri" style="font-size:16px">Empezar ${ic("up", 18).replace("<svg", '<svg style="transform:rotate(90deg);width:18px;height:18px"')}</div>
    </div>
    <div class="flex" style="gap:10px">
      <div class="card" style="flex:1;padding:12px"><div class="cap-up">Racha</div><div class="num" style="font-size:28px;line-height:1.1">3 <span class="t-sm muted" style="font-weight:600">sem</span></div></div>
      <div class="card" style="flex:1;padding:12px"><div class="cap-up">Semana</div><div class="num" style="font-size:28px;line-height:1.1">1<span class="t-sm muted" style="font-weight:600"> / 2</span></div></div>
      <div class="card" style="flex:1;padding:12px"><div class="cap-up">Récords</div><div class="num" style="font-size:28px;line-height:1.1;color:var(--rec)">2</div></div>
    </div>
    <div class="card flex" style="align-items:flex-start;gap:12px">
      <div class="avatar" style="background:var(--accent);color:var(--on-accent)">C</div>
      <div style="flex:1"><div class="flex between"><b class="t-sm">Tu coach</b><span class="t-xs muted">Hace 2 h</span></div>
      <div class="t-sm muted" style="line-height:1.4;margin-top:2px">Buena sesión del martes. Sube 2,5 kg en sentadilla si las 8 reps salen limpias.</div></div>
      <i style="width:8px;height:8px;border-radius:50%;background:var(--accent);margin-top:6px"></i>
    </div>
  </div>${tabs("Inicio")}`;
}

function workout() {
  return `<div class="scr" style="gap:12px;padding-top:30px">
    <div class="flex between">
      <div class="flex">${ic("back")}<div><div class="d" style="font-size:22px;line-height:1">Piernas</div><div class="muted t-xs">Guardado</div></div></div>
      <div class="flex" style="gap:12px"><span class="num" style="font-size:24px">12:40</span><span class="muted">${ic("more")}</span><span class="btn pri sm" style="min-height:40px">Finalizar</span></div>
    </div>
    <div class="flex" style="gap:8px">
      <span class="chip on" style="flex:1;justify-content:space-between;padding:10px 12px">1 Sentadilla <b>1/2</b></span>
      <span class="chip" style="flex:1;justify-content:space-between;padding:10px 12px">2 Remo <b>0/2</b></span>
    </div>
    <div><div class="d" style="font-size:36px;line-height:1">Sentadilla</div>
    <div class="flex muted t-sm" style="margin-top:6px"><span class="chip ok">Ronda 2</span> Superserie con Remo · descanso 60 s</div></div>
    <div class="col" style="gap:4px">
      <div class="setrow head"><span>SERIE</span><span>ANTERIOR</span><span style="text-align:center">KG</span><span style="text-align:center">REPS</span><span></span></div>
      <div class="setrow done"><b class="num">1</b><span class="muted t-sm">55×8</span><div class="fld">57,5</div><div class="fld">8</div><div class="chk on">${ic("check", 18)}</div></div>
      <div class="setrow cur"><b class="num" style="color:var(--accent)">2</b><span class="muted t-sm">50×10</span><div class="fld pre">50</div><div class="fld focus"></div><div class="chk"></div></div>
      <div class="setrow"><b class="num muted">3</b><span class="muted t-sm">—</span><div class="fld pre">50</div><div class="fld"></div><div class="chk"></div></div>
      <div class="btn ghost" style="justify-content:flex-start;gap:6px;padding:0 8px">${ic("plus", 18)} Agregar serie</div>
    </div>
    <div class="flex" style="gap:8px">
      <div class="ibtn">${ic("disc")}Discos</div><div class="ibtn">${ic("flame")}Calentar</div><div class="ibtn">${ic("note")}Notas</div><div class="ibtn">${ic("swap")}Alternar</div>
    </div>
  </div>
  <div class="rest"><div class="ring" style="--p:62"><b>0:23</b></div>
    <div style="flex:1"><div class="cap-up">Descanso</div><div class="num" style="font-size:22px;line-height:1">0:37</div></div>
    <span class="btn sec sm">−15</span><span class="btn sec sm">+15</span><span class="btn pri sm">Saltar</span></div>`;
}

function result() {
  return `<div class="scr" style="gap:12px;padding-top:30px">
    <div class="flex between"><span class="muted">${ic("close")}</span><span class="muted">${ic("share")}</span></div>
    <div style="text-align:center;margin-top:2px">
      <div style="width:56px;height:56px;border-radius:50%;background:var(--accent);color:var(--on-accent);display:grid;place-items:center;margin:0 auto 8px">${ic("check", 30)}</div>
      <div class="d" style="font-size:38px;line-height:1">Entrenamiento listo</div>
      <div class="muted t-sm" style="margin-top:4px">Piernas · jue 12 nov</div>
    </div>
    <div class="flex" style="gap:8px">
      <div class="card" style="flex:1;text-align:center;padding:12px 6px"><div class="num" style="font-size:30px;line-height:1">52<span class="t-sm muted"> min</span></div><div class="cap-up" style="margin-top:4px">Duración</div></div>
      <div class="card" style="flex:1;text-align:center;padding:12px 6px"><div class="num" style="font-size:30px;line-height:1;letter-spacing:-0.04em">2.175<span class="t-sm muted"> kg</span></div><div class="cap-up" style="margin-top:4px">Volumen</div></div>
      <div class="card" style="flex:1;text-align:center;padding:12px 6px"><div class="num" style="font-size:30px;line-height:1">8</div><div class="cap-up" style="margin-top:4px">Series</div></div>
    </div>
    <div class="card" style="background:var(--rec-bg);border-color:transparent">
      <div class="flex" style="color:var(--rec);margin-bottom:8px">${ic("trophy", 20)}<b class="d" style="font-size:20px">2 récords nuevos</b></div>
      <div class="flex between t-sm" style="padding:4px 0"><span>Sentadilla · 1RM estimado</span><b class="num" style="color:var(--rec)">71 kg ▲ 3</b></div>
      <div class="flex between t-sm" style="padding:4px 0"><span>Sentadilla · volumen</span><b class="num" style="color:var(--rec)">2.175 kg ▲ 8 %</b></div>
    </div>
    <div class="flex between t-sm muted"><span>vs. sesión anterior</span><span class="chip ok">▲ 4,2 % volumen</span></div>
    <div><div class="cap-up" style="margin-bottom:8px">¿Qué tal estuvo? · esfuerzo</div>
    <div class="eff">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => `<i class="${n === 8 ? "on" : ""}">${n}</i>`).join("")}</div></div>
    <div style="margin-top:auto;padding-bottom:16px" class="col">
      <div class="btn pri" style="font-size:16px">Listo</div>
      <div class="btn ghost">Ver detalle del entrenamiento</div>
    </div>
  </div>`;
}

function progress() {
  const pts = [
    [20, 118],
    [75, 100],
    [130, 104],
    [185, 76],
    [240, 60],
    [292, 34],
  ];
  const path = pts.map((p, i) => (i ? "L" : "M") + p.join(" ")).join(" ");
  return `<div class="scr" style="gap:12px">
    <div class="flex between"><div class="d" style="font-size:34px;line-height:1">Progreso</div><span class="chip">Sentadilla ▾</span></div>
    <div class="flex" style="gap:6px"><span class="chip">4 sem</span><span class="chip">8 sem</span><span class="chip on">12 sem</span><span class="chip">Todo</span></div>
    <div class="card" style="padding:14px 14px 10px">
      <div class="flex between"><div><div class="cap-up">1RM estimado</div><div class="num" style="font-size:44px;line-height:1">71<span class="t-sm muted"> kg</span></div></div><span class="chip ok">▲ 8,2 %</span></div>
      <svg viewBox="0 0 320 150" style="width:100%;margin-top:6px">
        <defs><linearGradient id="g" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="var(--accent)" stop-opacity=".35"/><stop offset="1" stop-color="var(--accent)" stop-opacity="0"/></linearGradient></defs>
        ${[34, 64, 94, 124].map((y, i) => `<line x1="22" x2="316" y1="${y}" y2="${y}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="0" y="${y + 4}" font-size="9" fill="var(--muted)">${[75, 70, 65, 60][i]}</text>`).join("")}
        <path d="${path} L292 140 L20 140 Z" fill="url(#g)"/>
        <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round"/>
        ${pts.map((p, i) => `<circle cx="${p[0]}" cy="${p[1]}" r="${i === 5 ? 5.5 : 3}" fill="${i === 5 ? "var(--accent)" : "var(--surface)"}" stroke="var(--accent)" stroke-width="2"/>`).join("")}
        <g transform="translate(222 4)"><rect class="tooltip" width="84" height="30" rx="8"/><text x="10" y="13" font-size="9" fill="var(--muted)">12 nov</text><text x="10" y="25" font-size="12" font-weight="800" fill="var(--text)">71 kg</text></g>
        ${["ago", "sep", "oct", "nov"].map((m, i) => `<text x="${20 + i * 90}" y="150" font-size="9" fill="var(--muted)">${m}</text>`).join("")}
      </svg>
    </div>
    <div class="flex" style="gap:6px;overflow:hidden"><span class="chip">Peso</span><span class="chip on">1RM</span><span class="chip">Reps</span><span class="chip">Volumen</span><span class="chip">Series</span></div>
    <div class="card col" style="gap:8px">
      <div class="flex between"><span class="cap-up">Marcas</span><span class="chip rec">${ic("trophy", 14)} 2 nuevas</span></div>
      <div class="flex between t-sm"><span>Mejor serie</span><b class="num">57,5 kg × 8</b></div>
      <div class="flex between t-sm"><span>Mayor volumen</span><b class="num">2.175 kg</b></div>
    </div>
    <div class="col" style="gap:6px"><div class="cap-up">Músculos · esta semana</div>
      ${[
        ["Piernas", 78],
        ["Espalda", 46],
        ["Core", 22],
      ]
        .map(
          ([n, v]) =>
            `<div class="flex t-sm" style="gap:8px"><span style="width:58px">${n}</span><div class="bar" style="flex:1"><i style="width:${v}%"></i></div></div>`,
        )
        .join("")}
    </div>
  </div>${tabs("Progreso")}`;
}

const screens = [
  ["Hoy", home],
  ["Registro", workout],
  ["Resultado", result],
  ["Progreso", progress],
];
const phone = (p, theme, label, body) =>
  `<div class="phone" data-p="${p}" data-theme="${theme}"><div class="cap">${label} · ${theme === "dark" ? "OSCURO" : "CLARO"}</div>${body}</div>`;

function specimen(p, theme) {
  return phone(
    p,
    theme,
    "Componentes",
    `<div class="spec">
      <div class="cap-up">Roles de acción</div>
      <div class="btn pri">Primario · Empezar</div>
      <div class="btn sec">Secundario · Descargar</div>
      <div class="btn out">Contorno · Cambiar</div>
      <div class="btn ghost">Terciario · Ver historial</div>
      <div class="btn danger">Peligro · Eliminar entrenamiento</div>
      <div class="cap-up" style="margin-top:6px">Chips y estado</div>
      <div class="flex" style="flex-wrap:wrap;gap:6px"><span class="chip on">Activo</span><span class="chip">Neutro</span><span class="chip ok">Hecho</span><span class="chip rec">Récord</span></div>
      <div class="cap-up" style="margin-top:6px">Campo y serie</div>
      <div class="flex" style="gap:8px"><div class="fld pre" style="flex:1">50</div><div class="fld focus" style="flex:1"></div><div class="chk on">${ic("check", 18)}</div></div>
      <div class="cap-up" style="margin-top:6px">Tipografía</div>
      <div class="d" style="font-size:40px;line-height:1">Sentadilla</div>
      <div class="num" style="font-size:40px;line-height:1">57,5 kg × 8</div>
      <div class="t-sm muted">Texto de apoyo: ronda 2 · descanso 60 s</div>
    </div>`,
  );
}

const props = [
  {
    p: "a",
    tag: "Propuesta A",
    name: "Forja",
    pitch:
      "Atlética y directa. Negro cálido o hueso, un acento naranja de señal y cifras condensadas grandes. Se siente como una herramienta de gimnasio: poco texto, mucho número.",
    facts: [
      [
        "Tipografía",
        "Títulos y cifras en Barlow Condensed (mayúsculas, 700–800); texto en Inter. Cifras tabulares.",
      ],
      [
        "Color",
        "Acento naranja #FF5A1F (oscuro) / #E8480F (claro). Récord ámbar, hecho verde. Fondos cálidos.",
      ],
      ["Forma", "Radios 8–12 px, bordes finos, esquinas más duras. Sensación técnica."],
      ["Movimiento", "Respuestas secas (120–180 ms), háptica fuerte al marcar serie."],
      [
        "Riesgo",
        "Naranja evoca marcas de fitness muy usadas; condensada en mayúsculas cansa en textos largos (solo se usa en títulos y cifras).",
      ],
    ],
    sw: [
      ["Fondo", "#0C0C0B"],
      ["Superficie", "#171716"],
      ["Texto", "#F4F1EA"],
      ["Acento", "#FF5A1F"],
      ["Récord", "#FFC247"],
      ["Hecho", "#86D99A"],
    ],
  },
  {
    p: "b",
    tag: "Propuesta B",
    name: "Claridad",
    pitch:
      "Sobria y premium. Mantiene el azul de la app actual pero más cobalto, con tipografía geométrica redondeada y un lima eléctrico reservado para los récords. Calma técnica: el número es protagonista sin gritar.",
    facts: [
      [
        "Tipografía",
        "Manrope en todo (800 en títulos y cifras, 500–600 en texto). Cifras tabulares.",
      ],
      [
        "Color",
        "Acento cobalto #5B86FF (oscuro) / #2457E6 (claro). Récord lima #C4F24F, hecho verde menta. Fondos azul grafito.",
      ],
      ["Forma", "Radios 14–20 px y chips tipo píldora. Más suave y moderna."],
      [
        "Movimiento",
        "Transiciones más largas (200–280 ms), háptica suave; confeti sobrio solo en récords.",
      ],
      [
        "Riesgo",
        "Más parecida a la app actual: menos sensación de cambio; el lima exige cuidado de contraste en claro.",
      ],
    ],
    sw: [
      ["Fondo", "#0A0C11"],
      ["Superficie", "#131720"],
      ["Texto", "#EEF1F7"],
      ["Acento", "#5B86FF"],
      ["Récord", "#C4F24F"],
      ["Hecho", "#3DDC97"],
    ],
  },
];

document.getElementById("root").innerHTML = props
  .map(
    (pr) => `<section class="prop" id="${pr.p}">
  <div class="tag">${pr.tag}</div><h2>${pr.name}</h2>
  <p class="lead">${pr.pitch}</p>
  <div class="facts">${pr.facts.map(([k, v]) => `<div><b>${k}</b>${v}</div>`).join("")}</div>
  <div class="row"><h3>Paleta (oscuro)</h3><div class="sw">${pr.sw.map(([n, c]) => `<i style="background:${c};color:${["#F4F1EA", "#FFC247", "#86D99A", "#EEF1F7", "#C4F24F", "#3DDC97"].includes(c) ? "#111" : "#fff"}">${n}<br>${c}</i>`).join("")}</div></div>
  <div class="row"><h3>Oscuro</h3>${screens.map(([n, f]) => phone(pr.p, "dark", n, f())).join("")}${specimen(pr.p, "dark")}</div>
  <div class="row"><h3>Claro</h3>${screens.map(([n, f]) => phone(pr.p, "light", n, f())).join("")}${specimen(pr.p, "light")}</div>
</section>`,
  )
  .join("");
