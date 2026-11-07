// Yave size data (all garment measurements in cm, flat).
// Source: Premium oversized crewneck chart. Swap these numbers if you change blanks or supplier.
const SIZES = [
  { name: "S",   width: 56, length: 69, weight: [50, 65] },
  { name: "M",   width: 58, length: 70, weight: [65, 75] },
  { name: "L",   width: 62, length: 73, weight: [75, 85] },
  { name: "XL",  width: 64, length: 74, weight: [85, 95] },
  { name: "2XL", width: 66, length: 76, weight: [95, 105] },
];

function baseIndex(kg) {
  for (let i = 0; i < SIZES.length; i++) if (kg <= SIZES[i].weight[1]) return i;
  return SIZES.length - 1;
}

function recommend(heightCm, weightKg, fit) {
  const notes = [];
  const base = baseIndex(weightKg);
  const s = SIZES[base];

  if (weightKg < SIZES[0].weight[0]) notes.push("Your weight is below our chart. S is our smallest size.");
  if (weightKg > SIZES[SIZES.length - 1].weight[1]) notes.push("Your weight is above our chart. 2XL is our largest size.");

  if (base < SIZES.length - 1 && weightKg >= s.weight[1] - 2 && weightKg <= s.weight[1])
    notes.push("You're between " + s.name + " and " + SIZES[base + 1].name + ". " + SIZES[base + 1].name + " gives you more room.");
  if (base > 0 && weightKg <= s.weight[0] + 2 && weightKg > s.weight[0])
    notes.push("You're between " + SIZES[base - 1].name + " and " + s.name + ". " + SIZES[base - 1].name + " fits closer.");

  if (heightCm >= 185) notes.push("At your height the length will sit shorter on you. Size up if you want it longer.");
  if (heightCm <= 163) notes.push("At your height the length will sit longer on you.");

  let idx = base;
  if (fit === "snug") idx = Math.max(base - 1, 0);
  if (fit === "relaxed") idx = Math.min(base + 1, SIZES.length - 1);
  return { idx, base, notes };
}

const FINDER_HTML = `
  <h2>Find your size</h2>
  <div class="row">
    <label>Height
      <span class="unit-input"><input name="cm" type="number" inputmode="numeric" min="130" max="230" placeholder="175"><em>cm</em></span>
    </label>
    <label>Weight
      <span class="unit-input"><input name="kg" type="number" inputmode="numeric" min="30" max="200" placeholder="75"><em>kg</em></span>
    </label>
  </div>
  <fieldset>
    <legend>How do you like it to fit?</legend>
    <label class="pill"><input type="radio" name="fit" value="snug"><span>Snug</span></label>
    <label class="pill"><input type="radio" name="fit" value="true" checked><span>True to size</span></label>
    <label class="pill"><input type="radio" name="fit" value="relaxed"><span>Relaxed</span></label>
  </fieldset>
  <button class="btn" type="submit">Find my size</button>
  <div class="result" aria-live="polite"></div>
`;

function chartHTML() {
  return `
  <div class="tablewrap">
    <table>
      <thead><tr><th scope="col">Size</th><th scope="col">Width</th><th scope="col">Length</th><th scope="col">Avg. weight</th></tr></thead>
      <tbody>${SIZES.map((s) =>
        `<tr data-size="${s.name}"><th scope="row">${s.name}</th><td>${s.width} cm</td><td>${s.length} cm</td><td>${s.weight[0]}–${s.weight[1]} kg</td></tr>`
      ).join("")}</tbody>
    </table>
  </div>
  <p class="note">All garment measurements are in cm, taken flat. Width is across the chest, length is from the top of the shoulder to the hem.</p>`;
}

function initFinder(form) {
  form.innerHTML = FINDER_HTML;
  const result = form.querySelector(".result");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const f = new FormData(form);
    const h = parseFloat(f.get("cm"));
    const w = parseFloat(f.get("kg"));
    if (!h || !w || h < 130 || h > 230 || w < 30 || w > 200) {
      result.innerHTML = '<p class="error">Enter your height in cm and your weight in kg.</p>';
      return;
    }
    const fit = f.get("fit");
    const r = recommend(h, w, fit);
    const s = SIZES[r.idx];
    const fitLine = fit === "snug"
      ? "One size down from your base size (" + SIZES[r.base].name + ") for a snug fit."
      : fit === "relaxed"
        ? "One size up from your base size (" + SIZES[r.base].name + ") for a relaxed fit."
        : "Your base size for this cut.";
    result.innerHTML =
      '<div class="size">' + s.name + "</div><p>" + fitLine + "</p>" +
      '<p class="meta">Width ' + s.width + " cm, length " + s.length + " cm.</p>" +
      r.notes.map((n) => '<p class="meta">' + n + "</p>").join("");
    document.querySelectorAll("[data-size]").forEach((tr) => tr.classList.toggle("hit", tr.dataset.size === s.name));
  });
}

function initTabs(root) {
  const tabs = root.querySelectorAll('[role="tab"]');
  const panels = root.querySelectorAll('[role="tabpanel"]');
  const select = (tab) => {
    tabs.forEach((t) => {
      const on = t === tab;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    panels.forEach((p) => (p.hidden = p.id !== tab.getAttribute("aria-controls")));
  };
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => select(t));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      select(next);
      next.focus();
    });
  });
}

document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("form.finder").forEach(initFinder);
  document.querySelectorAll("[data-chart]").forEach((el) => (el.innerHTML = chartHTML()));
  document.querySelectorAll(".tabs").forEach(initTabs);

  const year = document.getElementById("year");
  if (year) year.textContent = new Date().getFullYear();

  // Waitlist: needs a real Formspree ID (or any form endpoint) in the form's action.
  const wl = document.getElementById("waitlist");
  if (wl) {
    const note = document.getElementById("waitlist-note");
    wl.addEventListener("submit", async (e) => {
      e.preventDefault();
      if (wl.action.includes("YOUR_FORM_ID")) {
        note.textContent = "The waitlist isn't connected yet.";
        return;
      }
      try {
        const res = await fetch(wl.action, { method: "POST", body: new FormData(wl), headers: { Accept: "application/json" } });
        if (!res.ok) throw new Error();
        wl.reset();
        note.textContent = "You're on the list.";
      } catch {
        note.textContent = "That didn't send. Check your connection and try again.";
      }
    });
  }
});
