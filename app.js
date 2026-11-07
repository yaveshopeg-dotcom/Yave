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

/* ---------- Size guide popup ---------- */

const MODAL_HTML = `
<div class="sg-box">
  <button class="sg-close" type="button" aria-label="Close size guide">&times;</button>
  <h2 id="sg-title">Size guide</h2>
  <div class="tablist" role="tablist" aria-label="Size guide">
    <button role="tab" id="sg-tab-chart" aria-selected="true" aria-controls="sg-panel-chart">Size chart</button>
    <button role="tab" id="sg-tab-rec" aria-selected="false" aria-controls="sg-panel-rec" tabindex="-1">Size recommendation</button>
  </div>

  <div role="tabpanel" id="sg-panel-chart" aria-labelledby="sg-tab-chart">
    <div class="tablewrap">
      <table>
        <thead><tr><th scope="col">Size</th><th scope="col">Width</th><th scope="col">Length</th><th scope="col">Avg. weight</th></tr></thead>
        <tbody>${SIZES.map((s) =>
          `<tr data-size="${s.name}"><th scope="row">${s.name}</th><td>${s.width} cm</td><td>${s.length} cm</td><td>${s.weight[0]}–${s.weight[1]} kg</td></tr>`
        ).join("")}</tbody>
      </table>
    </div>
    <p class="note">All garment measurements are in cm, taken flat. Width is across the chest, length is from the top of the shoulder to the hem.</p>
  </div>

  <div role="tabpanel" id="sg-panel-rec" aria-labelledby="sg-tab-rec" hidden>
    <form class="sg-form" novalidate>
      <h3>Find your size</h3>
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
    </form>
  </div>
</div>`;

let dialog = null;
let lastTrigger = null;

function selectTab(name) {
  const tabs = dialog.querySelectorAll('[role="tab"]');
  const panels = dialog.querySelectorAll('[role="tabpanel"]');
  tabs.forEach((t) => {
    const on = t.id === "sg-tab-" + name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  panels.forEach((p) => (p.hidden = p.id !== "sg-panel-" + name));
}

function pickSize(name) {
  const input = document.querySelector('[data-size-picker] input[value="' + name + '"]');
  if (!input) return;
  input.checked = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function showResult(form) {
  const result = form.querySelector(".result");
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
  const canPick = !!document.querySelector("[data-size-picker]");
  result.innerHTML =
    '<div class="size">' + s.name + "</div><p>" + fitLine + "</p>" +
    '<p class="meta">Width ' + s.width + " cm, length " + s.length + " cm.</p>" +
    r.notes.map((n) => '<p class="meta">' + n + "</p>").join("") +
    (canPick ? '<button class="btn use" type="button" data-use="' + s.name + '">Select size ' + s.name + "</button>" : "");
  dialog.querySelectorAll("[data-size]").forEach((tr) => tr.classList.toggle("hit", tr.dataset.size === s.name));
}

function buildDialog() {
  dialog = document.createElement("dialog");
  dialog.className = "sg";
  dialog.setAttribute("aria-labelledby", "sg-title");
  dialog.innerHTML = MODAL_HTML;
  document.body.appendChild(dialog);

  dialog.querySelector(".sg-close").addEventListener("click", () => dialog.close());
  // Click on the dark backdrop closes it.
  dialog.addEventListener("click", (e) => { if (e.target === dialog) dialog.close(); });
  dialog.addEventListener("close", () => {
    document.documentElement.classList.remove("sg-open");
    if (lastTrigger) lastTrigger.focus();
  });

  const tabs = dialog.querySelectorAll('[role="tab"]');
  tabs.forEach((t, i) => {
    t.addEventListener("click", () => selectTab(t.id.replace("sg-tab-", "")));
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      const next = tabs[(i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length];
      selectTab(next.id.replace("sg-tab-", ""));
      next.focus();
    });
  });

  const form = dialog.querySelector(".sg-form");
  form.addEventListener("submit", (e) => { e.preventDefault(); showResult(form); });
  form.addEventListener("click", (e) => {
    const b = e.target.closest("[data-use]");
    if (!b) return;
    pickSize(b.dataset.use);
    dialog.close();
  });
}

function openGuide(tab, trigger) {
  if (!dialog) buildDialog();
  lastTrigger = trigger || null;
  selectTab(tab === "rec" ? "rec" : "chart");
  document.documentElement.classList.add("sg-open");
  if (!dialog.open) dialog.showModal();
}

/* ---------- Product size picker (used on product pages) ---------- */

function initSizePicker(el) {
  el.innerHTML = SIZES.map((s) =>
    `<label class="pill"><input type="radio" name="size" value="${s.name}"><span>${s.name}</span></label>`
  ).join("");
  const out = document.querySelector("[data-size-selected]");
  el.addEventListener("change", () => {
    const v = el.querySelector("input:checked");
    if (out && v) out.textContent = "Size " + v.value + " selected";
  });
}


/* ---------- Shop and product pages (built from products.js) ---------- */

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) { return CURRENCY + " " + Number(n).toLocaleString("en-US"); }

function renderShop(grid) {
  const empty = document.querySelector("[data-empty]");
  if (!PRODUCTS.length) {
    if (empty) empty.hidden = false;
    return;
  }
  grid.innerHTML = PRODUCTS.map((p) =>
    '<a class="card" href="product.html?p=' + encodeURIComponent(p.id) + '">' +
    '<div class="card-img">' + (p.images && p.images[0] ? '<img src="' + esc(p.images[0]) + '" alt="' + esc(p.name) + '" loading="lazy">' : "") + "</div>" +
    "<h3>" + esc(p.name) + "</h3><p>" + money(p.price) + "</p></a>"
  ).join("");
}

function renderProduct(main) {
  const id = new URLSearchParams(location.search).get("p");
  const p = PRODUCTS.find((x) => x.id === id);
  if (!p) {
    main.className = "";
    main.innerHTML = '<div class="band"><h2>Product not found</h2><p><a class="textlink" href="index.html#shop">Back to the shop</a></p></div>';
    return;
  }
  document.title = p.name + " | Yave";
  const imgs = p.images || [];
  main.innerHTML =
    '<div class="gallery"><div class="product-img">' +
      (imgs[0] ? '<img id="main-img" src="' + esc(imgs[0]) + '" alt="' + esc(p.name) + '">' : "") + "</div>" +
      (imgs.length > 1 ? '<div class="thumbs">' + imgs.map((s, i) =>
        '<button type="button" data-img="' + esc(s) + '" aria-label="Photo ' + (i + 1) + '"><img src="' + esc(s) + '" alt=""></button>').join("") + "</div>" : "") +
    "</div>" +
    "<div><h1>" + esc(p.name) + "</h1>" +
    '<p class="price">' + money(p.price) + "</p>" +
    (p.description ? '<p class="desc">' + esc(p.description) + "</p>" : "") +
    '<div class="size-head"><span>Size</span><span class="size-links">' +
      '<button type="button" data-size-guide data-tab="chart">Size chart</button>' +
      '<button type="button" data-size-guide data-tab="rec">Size recommendation</button></span></div>' +
    '<div class="sizes" data-size-picker role="radiogroup" aria-label="Size"></div>' +
    '<p class="size-selected" data-size-selected role="status"></p>' +
    '<button class="btn" type="button" disabled>Add to cart (store coming soon)</button></div>';
  main.querySelectorAll("[data-img]").forEach((b) => b.addEventListener("click", () => {
    document.getElementById("main-img").src = b.dataset.img;
  }));
}

document.addEventListener("DOMContentLoaded", () => {
  const shop = document.querySelector("[data-shop]");
  if (shop) renderShop(shop);
  const prod = document.querySelector("[data-product]");
  if (prod) renderProduct(prod);

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-size-guide]");
    if (!t) return;
    e.preventDefault();
    openGuide(t.dataset.tab, t);
  });

  document.querySelectorAll("[data-size-picker]").forEach(initSizePicker);

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
