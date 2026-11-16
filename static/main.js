// ---------------------------------------------------------------------------
// Edit these two lists to change the rollout section.
// Each video is expected at videos/<dataset id>_<method id>.mp4,
// e.g. videos/ball_gt.mp4, videos/ball_ours.mp4, videos/mug_sgnn.mp4
// ---------------------------------------------------------------------------
const DATASETS = [
  { id: "ball",   label: "Ball-plate",  note: "[Ball-plate: one line on what to watch for.]" },
  { id: "bullet", label: "Bullet",      note: "[Bullet: one line on what to watch for.]" },
  { id: "mug",    label: "Mug drop",    note: "[Mug drop: one line on what to watch for.]" },
  { id: "bottle", label: "Bottle shot", note: "[Bottle shot: one line on what to watch for.]" },
  { id: "crack",  label: "Crack",       note: "[Crack: one line on what to watch for.]" },
];
const METHODS = [
  { id: "gt",     label: "Ground truth",     row: "main" },
  { id: "ours",   label: "Neural-PD (ours)", row: "main", ours: true },
  { id: "intnet", label: "InteractionNet",   row: "baseline" },
  { id: "3dgsim", label: "3DGSIM",           row: "baseline" },
  { id: "sgnn",   label: "SGNN",             row: "baseline" },
];
// ---------------------------------------------------------------------------

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// A slot shows a placeholder until its video file is found, then swaps in the video.
function fillSlot(slot) {
  const src = slot.dataset.src;
  const ph = document.createElement("div");
  ph.className = "ph";
  ph.innerHTML = "<b></b><span>placeholder</span>";
  ph.querySelector("b").textContent = src.replace(/^videos\//, "");
  slot.appendChild(ph);

  fetch(src, { method: "HEAD" })
    .then((r) => {
      if (!r.ok) return;
      const v = document.createElement("video");
      // Muted + playsinline as attributes: browsers only allow autoplay for muted video.
      v.muted = true;
      v.setAttribute("muted", "");
      v.setAttribute("playsinline", "");
      v.loop = true;
      v.preload = "auto";
      v.setAttribute("aria-label", slot.dataset.label || src);
      if (reduceMotion) {
        v.controls = true; // no motion unless the visitor presses play
      } else {
        v.setAttribute("autoplay", "");
        v.addEventListener("canplay", () => {
          // Only play when visible: hidden dataset panels stay paused.
          if (!slot.closest("[hidden]")) v.play().catch(() => {});
        }, { once: true });
      }
      v.src = src;
      ph.replaceWith(v);
    })
    .catch(() => {});
}

function figure(src, label, cls) {
  const f = document.createElement("figure");
  const s = document.createElement("div");
  s.className = "slot";
  s.dataset.src = src;
  s.dataset.label = label;
  const c = document.createElement("figcaption");
  c.textContent = label;
  if (cls) c.className = cls;
  f.append(s, c);
  return f;
}

function videosIn(el) { return Array.from(el.querySelectorAll("video")); }

function restart(el) {
  const vs = videosIn(el);
  vs.forEach((v) => { v.currentTime = 0; });
  if (!reduceMotion) vs.forEach((v) => v.play().catch(() => {}));
}

// Build the dataset tabs and panels.
function buildRollouts() {
  const tabs = document.querySelector(".tabs");
  const panels = document.querySelector(".panels");

  DATASETS.forEach((d, i) => {
    const tab = document.createElement("button");
    tab.className = "tab";
    tab.type = "button";
    tab.role = "tab";
    tab.id = "tab-" + d.id;
    tab.textContent = d.label;
    tab.setAttribute("aria-selected", i === 0 ? "true" : "false");
    tab.setAttribute("aria-controls", "panel-" + d.id);
    tabs.appendChild(tab);

    const panel = document.createElement("div");
    panel.className = "panel";
    panel.id = "panel-" + d.id;
    panel.setAttribute("role", "tabpanel");
    panel.setAttribute("aria-labelledby", tab.id);
    if (i !== 0) panel.hidden = true;

    const note = document.createElement("p");
    note.className = "note";
    note.textContent = d.note;

    const main = document.createElement("div");
    main.className = "grid two";
    const base = document.createElement("div");
    base.className = "grid three";
    METHODS.forEach((m) => {
      const fig = figure("videos/" + d.id + "_" + m.id + ".mp4", m.label, m.ours ? "ours" : "");
      (m.row === "main" ? main : base).appendChild(fig);
    });

    const bar = document.createElement("div");
    bar.className = "bar";
    const again = document.createElement("button");
    again.className = "ghost";
    again.type = "button";
    again.textContent = "Restart all";
    again.addEventListener("click", () => restart(panel));
    bar.appendChild(again);

    panel.append(note, main, base, bar);
    panels.appendChild(panel);

    tab.addEventListener("click", () => {
      tabs.querySelectorAll(".tab").forEach((t) => t.setAttribute("aria-selected", "false"));
      tab.setAttribute("aria-selected", "true");
      panels.querySelectorAll(".panel").forEach((p) => {
        if (p !== panel) { p.hidden = true; videosIn(p).forEach((v) => v.pause()); }
      });
      panel.hidden = false;
      panel.classList.remove("swap");
      void panel.offsetWidth; // replay the fade
      panel.classList.add("swap");
      restart(panel);
    });
  });

  // Arrow keys move between tabs
  tabs.addEventListener("keydown", (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    const all = Array.from(tabs.querySelectorAll(".tab"));
    const i = all.indexOf(document.activeElement);
    if (i < 0) return;
    const next = all[(i + (e.key === "ArrowRight" ? 1 : all.length - 1)) % all.length];
    next.focus();
    next.click();
  });
}

// Comparison slider: the top video is clipped at the slider position.
function buildCompare() {
  const box = document.querySelector(".compare");
  if (!box) return;
  const range = box.querySelector('input[type="range"]');
  range.addEventListener("input", () => box.style.setProperty("--split", range.value + "%"));

  // Keep the two videos in step once both exist.
  setInterval(() => {
    const vs = videosIn(box);
    if (vs.length === 2 && Math.abs(vs[0].currentTime - vs[1].currentTime) > 0.08) {
      vs[1].currentTime = vs[0].currentTime;
    }
  }, 500);
}

// Sections fade in as they scroll into view.
function reveal() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window) || reduceMotion) {
    items.forEach((el) => el.classList.add("shown"));
    return;
  }
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      if (e.isIntersecting) { e.target.classList.add("shown"); io.unobserve(e.target); }
    });
  }, { rootMargin: "0px 0px -10% 0px" });
  items.forEach((el) => io.observe(el));
}

buildRollouts();
buildCompare();
document.querySelectorAll(".slot").forEach(fillSlot);
reveal();
