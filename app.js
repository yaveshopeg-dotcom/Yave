function recommend(chart, heightCm, weightKg, fit) {
  const sizes = chart.sizes;
  const notes = [];
  let base = sizes.findIndex((s) => weightKg <= s.weight[1]);
  if (base === -1) base = sizes.length - 1;
  const s = sizes[base];

  if (weightKg < sizes[0].weight[0]) notes.push("Your weight is below this chart. " + sizes[0].name + " is the smallest size.");
  if (weightKg > sizes[sizes.length - 1].weight[1]) notes.push("Your weight is above this chart. " + sizes[sizes.length - 1].name + " is the largest size.");

  if (base < sizes.length - 1 && weightKg >= s.weight[1] - 2 && weightKg <= s.weight[1])
    notes.push("You're between " + s.name + " and " + sizes[base + 1].name + ". " + sizes[base + 1].name + " gives you more room.");
  if (base > 0 && weightKg <= s.weight[0] + 2 && weightKg > s.weight[0])
    notes.push("You're between " + sizes[base - 1].name + " and " + s.name + ". " + sizes[base - 1].name + " fits closer.");

  if (heightCm >= 185) notes.push("At your height the length will sit shorter on you. Size up if you want it longer.");
  if (heightCm <= 163) notes.push("At your height the length will sit longer on you.");

  let idx = base;
  if (fit === "snug") idx = Math.max(base - 1, 0);
  if (fit === "relaxed") idx = Math.min(base + 1, sizes.length - 1);
  return { idx, base, notes };
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function money(n) { return CURRENCY + " " + Number(n).toLocaleString("en-US"); }

/* ---------- Size guide popup (one popup, filled with the product's own chart) ---------- */

const MODAL_HTML = `
<div class="sg-box">
  <button class="sg-close" type="button" aria-label="Close size guide">&times;</button>
  <h2 id="sg-title">Size guide</h2>
  <p class="sg-sub" data-sg-sub></p>
  <div class="tablist" role="tablist" aria-label="Size guide">
    <button role="tab" id="sg-tab-chart" aria-selected="true" aria-controls="sg-panel-chart">Size chart</button>
    <button role="tab" id="sg-tab-rec" aria-selected="false" aria-controls="sg-panel-rec" tabindex="-1">Size recommendation</button>
  </div>

  <div role="tabpanel" id="sg-panel-chart" aria-labelledby="sg-tab-chart">
    <div class="tablewrap" data-sg-table></div>
    <p class="note">All measurements are in cm, taken flat with the garment laid out.</p>
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
let currentChart = null;

function selectTab(name) {
  dialog.querySelectorAll('[role="tab"]').forEach((t) => {
    const on = t.id === "sg-tab-" + name;
    t.setAttribute("aria-selected", String(on));
    t.tabIndex = on ? 0 : -1;
  });
  dialog.querySelectorAll('[role="tabpanel"]').forEach((p) => (p.hidden = p.id !== "sg-panel-" + name));
}

function fillChart(chart) {
  currentChart = chart;
  dialog.querySelector("[data-sg-sub]").textContent = chart.title || "";
  dialog.querySelector("[data-sg-table]").innerHTML =
    "<table><thead><tr><th scope=\"col\">Size</th>" +
    chart.columns.map((c) => '<th scope="col">' + esc(c) + "</th>").join("") +
    '<th scope="col">Avg. weight</th></tr></thead><tbody>' +
    chart.sizes.map((s) =>
      '<tr data-size="' + esc(s.name) + '"><th scope="row">' + esc(s.name) + "</th>" +
      s.measures.map((m) => "<td>" + m + " cm</td>").join("") +
      "<td>" + s.weight[0] + "–" + s.weight[1] + " kg</td></tr>"
    ).join("") + "</tbody></table>";
  const form = dialog.querySelector(".sg-form");
  form.reset();
  form.querySelector(".result").innerHTML = "";
}

function pickSize(name) {
  const input = document.querySelector('[data-size-picker] input[value="' + name + '"]');
  if (!input) return;
  input.checked = true;
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

function showResult(form) {
  const result = form.querySelector(".result");
  const chart = currentChart;
  const f = new FormData(form);
  const h = parseFloat(f.get("cm"));
  const w = parseFloat(f.get("kg"));
  if (!h || !w || h < 130 || h > 230 || w < 30 || w > 200) {
    result.innerHTML = '<p class="error">Enter your height in cm and your weight in kg.</p>';
    return;
  }
  const fit = f.get("fit");
  const r = recommend(chart, h, w, fit);
  const s = chart.sizes[r.idx];
  const fitLine = fit === "snug"
    ? "One size down from your base size (" + chart.sizes[r.base].name + ") for a snug fit."
    : fit === "relaxed"
      ? "One size up from your base size (" + chart.sizes[r.base].name + ") for a relaxed fit."
      : "Your base size for this cut.";
  const canPick = !!document.querySelector("[data-size-picker]");
  result.innerHTML =
    '<div class="size">' + esc(s.name) + "</div><p>" + fitLine + "</p>" +
    '<p class="meta">' + chart.columns.map((c, i) => esc(c) + " " + s.measures[i] + " cm").join(", ") + ".</p>" +
    r.notes.map((n) => '<p class="meta">' + esc(n) + "</p>").join("") +
    (canPick ? '<button class="btn use" type="button" data-use="' + esc(s.name) + '">Select size ' + esc(s.name) + "</button>" : "");
  dialog.querySelectorAll("[data-size]").forEach((tr) => tr.classList.toggle("hit", tr.dataset.size === s.name));
}

function buildDialog() {
  dialog = document.createElement("dialog");
  dialog.className = "sg";
  dialog.setAttribute("aria-labelledby", "sg-title");
  dialog.innerHTML = MODAL_HTML;
  document.body.appendChild(dialog);

  dialog.querySelector(".sg-close").addEventListener("click", () => dialog.close());
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

function openGuide(tab, chartId, trigger) {
  const chart = CHARTS[chartId];
  if (!chart) return;
  if (!dialog) buildDialog();
  lastTrigger = trigger || null;
  if (currentChart !== chart) fillChart(chart);
  selectTab(tab === "rec" ? "rec" : "chart");
  document.documentElement.classList.add("sg-open");
  if (!dialog.open) dialog.showModal();
}

/* ---------- Shop and product pages (built from products.js) ---------- */

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
    main.innerHTML = '<div class="band"><h2>Product not found</h2><p><a class="textlink" href="index.html">Back to the shop</a></p></div>';
    return;
  }
  document.title = p.name + " | Yave";
  const chart = CHARTS[p.chart];
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
    (chart
      ? '<div class="size-head"><span>Size</span><span class="size-links">' +
        '<button type="button" data-size-guide data-tab="chart" data-chart="' + esc(p.chart) + '">Size chart</button>' +
        '<button type="button" data-size-guide data-tab="rec" data-chart="' + esc(p.chart) + '">Size recommendation</button></span></div>' +
        '<div class="sizes" data-size-picker role="radiogroup" aria-label="Size">' +
        chart.sizes.map((s) => '<label class="pill"><input type="radio" name="size" value="' + esc(s.name) + '"><span>' + esc(s.name) + "</span></label>").join("") +
        "</div>" +
        '<p class="size-selected" data-size-selected role="status"></p>'
      : "") +
    '<button class="btn" type="button" disabled>Add to cart (store coming soon)</button></div>';

  main.querySelectorAll("[data-img]").forEach((b) => b.addEventListener("click", () => {
    document.getElementById("main-img").src = b.dataset.img;
  }));
  const picker = main.querySelector("[data-size-picker]");
  const out = main.querySelector("[data-size-selected]");
  if (picker) picker.addEventListener("change", () => {
    const v = picker.querySelector("input:checked");
    if (out && v) out.textContent = "Size " + v.value + " selected";
  });
}


/* ---------- Footer and legal pages ---------- */

const FOOTER_LINKS = [
  ["Terms", "legal.html?p=terms"],
  ["Privacy", "legal.html?p=privacy"],
  ["Refunds", "legal.html?p=refunds"],
  ["Cookies", "legal.html?p=cookies"],
];

function renderFooter(el) {
  const links = FOOTER_LINKS.slice();
  if (SITE.email) links.push(["Contact", "mailto:" + SITE.email]);
  if (SITE.instagram) links.push(["Instagram", SITE.instagram]);
  if (SITE.tiktok) links.push(["TikTok", SITE.tiktok]);
  el.innerHTML =
    '<a class="logo" href="index.html" aria-label="Yave home"><img src="logo.png" alt="yave" width="606" height="261"></a>' +
    '<nav class="foot-links" aria-label="Footer">' +
    links.map(([t, u]) => '<a href="' + esc(u) + '"' + (/^https?:/.test(u) ? ' target="_blank" rel="noopener"' : "") + ">" + t + "</a>").join("") +
    "</nav>" +
    '<p class="copy">&copy; ' + new Date().getFullYear() + " Yave</p>";
}

function renderLegal(main) {
  const key = new URLSearchParams(location.search).get("p");
  const page = LEGAL[key];
  if (!page) {
    main.innerHTML = '<h1>Page not found</h1><p><a class="textlink" href="index.html">Back to the shop</a></p>';
    return;
  }
  document.title = page.title + " | Yave";
  main.innerHTML = "<h1>" + page.title + '</h1><p class="updated">Last updated ' + LEGAL_UPDATED + "</p>" +
    page.body.replace(/\{\{EMAIL\}\}/g, SITE.email ? '<a href="mailto:' + esc(SITE.email) + '">' + esc(SITE.email) + "</a>" : "the email in our footer");
}

document.addEventListener("DOMContentLoaded", () => {
  const foot = document.querySelector("[data-footer]");
  if (foot) renderFooter(foot);
  const legalEl = document.querySelector("[data-legal]");
  if (legalEl) renderLegal(legalEl);

  const shop = document.querySelector("[data-shop]");
  if (shop) renderShop(shop);
  const prod = document.querySelector("[data-product]");
  if (prod) renderProduct(prod);

  document.addEventListener("click", (e) => {
    const t = e.target.closest("[data-size-guide]");
    if (!t) return;
    e.preventDefault();
    openGuide(t.dataset.tab, t.dataset.chart, t);
  });

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
