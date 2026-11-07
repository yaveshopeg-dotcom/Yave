(function () {
  const $ = (s) => document.querySelector(s);
  const STATUSES = ["pending", "confirmed", "shipped", "completed", "cancelled"];
  const LABEL = { all: "All", pending: "Pending", confirmed: "Confirmed", shipped: "Shipped", completed: "Completed", cancelled: "Cancelled" };

  let pw = "";
  try { pw = sessionStorage.getItem("yave-admin") || ""; } catch (e) { pw = ""; }
  let orders = [];
  let filter = "all";
  let seen = null;       // order ids already seen, to flag new ones
  let timer = null;
  let lastJson = "";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const egp = (n) => Number(n).toLocaleString("en-US") + " EGP";
  const total = (o) => o.subtotal + (o.deliveryFee || 0);
  const when = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  function waLink(phone) {
    let d = String(phone).replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2);
    else if (d.startsWith("0")) d = "20" + d.slice(1);
    return "https://wa.me/" + d;
  }

  async function api(method, path, body) {
    const res = await fetch("/api/admin/orders" + (path || ""), {
      method,
      headers: Object.assign({ Authorization: "Bearer " + pw }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || "Something went wrong."); e.status = res.status; throw e; }
    return data;
  }

  function showApp(on) { $("#login").hidden = on; $("#app").hidden = !on; }

  async function load(auto) {
    try {
      const data = await api("GET");
      const json = JSON.stringify(data.orders);
      const fresh = seen ? data.orders.filter((o) => !seen.has(o.id)) : [];
      if (seen && fresh.length) {
        $("#banner").hidden = false;
        $("#banner").textContent = fresh.length === 1 ? "New order: " + fresh[0].id : fresh.length + " new orders";
        document.title = "(" + fresh.length + ") Orders | Yave";
      }
      seen = seen || new Set();
      const newIds = new Set(fresh.map((o) => o.id));
      data.orders.forEach((o) => seen.add(o.id));
      const busy = auto && document.activeElement && $("#list").contains(document.activeElement);
      if (json !== lastJson && !busy) {
        orders = data.orders;
        lastJson = json;
        render(newIds);
      }
      showApp(true);
    } catch (e) {
      if (e.status === 401 || e.status === 503) {
        stopTimer();
        showApp(false);
        $("#login-error").textContent = e.message;
        try { sessionStorage.removeItem("yave-admin"); } catch (x) { /* ignore */ }
      } else if (!auto) {
        $("#banner").hidden = false;
        $("#banner").textContent = e.message;
      }
    }
  }

  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function startTimer() { stopTimer(); timer = setInterval(() => load(true), 30000); }

  function matches(o, q) {
    if (!q) return true;
    const hay = [o.id, o.customer.name, o.customer.phone, o.customer.city].join(" ").toLowerCase();
    return hay.includes(q.toLowerCase());
  }

  function render(newIds) {
    newIds = newIds || new Set();
    const counts = { all: orders.length };
    STATUSES.forEach((s) => (counts[s] = orders.filter((o) => o.status === s).length));
    $("#s-pending").textContent = counts.pending;
    $("#s-progress").textContent = counts.confirmed + counts.shipped;
    $("#s-done").textContent = counts.completed;
    $("#s-sales").textContent = egp(orders.filter((o) => o.status === "completed").reduce((n, o) => n + total(o), 0));

    $("#chips").innerHTML = ["all"].concat(STATUSES).map((k) =>
      '<button class="chip" role="tab" data-f="' + k + '" aria-selected="' + (filter === k) + '">' + LABEL[k] + "<b>" + counts[k] + "</b></button>").join("");

    const q = $("#search").value.trim();
    const shown = orders.filter((o) => (filter === "all" || o.status === filter) && matches(o, q));
    $("#empty").hidden = shown.length > 0;
    $("#list").innerHTML = shown.map((o) => card(o, newIds.has(o.id))).join("");
  }

  function card(o, isNew) {
    const c = o.customer;
    const items = o.items.map((i) => esc(i.qty) + " x " + esc(i.name) + (i.size ? " (Size " + esc(i.size) + ")" : "") + " <span class=\"muted\">" + egp(i.price * i.qty) + "</span>").join("<br>");
    return '<article class="order' + (isNew ? " new" : "") + '" data-id="' + esc(o.id) + '">' +
      '<div class="o-head"><div><span class="o-id">' + esc(o.id) + '</span><span class="o-date">' + when(o.createdAt) + '</span></div><span class="badge ' + esc(o.status) + '">' + esc(o.status) + "</span></div>" +
      '<div class="o-who"><strong>' + esc(c.name) + "</strong><span>" + esc(c.phone) + '</span><button class="ghost" data-copy="' + esc(c.phone) + '">Copy</button><a href="' + waLink(c.phone) + '" target="_blank" rel="noopener">WhatsApp</a></div>' +
      '<div class="o-cols"><div><h3>Items</h3><p>' + items + '</p><p><strong>' + egp(total(o)) + '</strong>' +
        (o.deliveryFee == null ? ' <span class="muted">+ delivery fee to confirm</span>' : ' <span class="muted">incl. ' + egp(o.deliveryFee) + " delivery</span>") + "</p></div>" +
      "<div><h3>Deliver to</h3><p>" + esc(c.address) + "</p><p>" + esc(c.city) + "</p>" +
        (c.email ? '<p class="muted">' + esc(c.email) + "</p>" : "") + (c.notes ? '<p class="muted">Customer note: ' + esc(c.notes) + "</p>" : "") + "</div></div>" +
      '<div class="o-foot"><select data-status aria-label="Order status">' + STATUSES.map((s) => '<option value="' + s + '"' + (s === o.status ? " selected" : "") + ">" + LABEL[s] + "</option>").join("") + "</select></div>" +
      "<details><summary>Delivery fee, notes, delete</summary><div class=\"more\">" +
        '<label>Delivery fee (EGP)<input type="number" min="0" max="10000" data-fee value="' + (o.deliveryFee == null ? "" : esc(o.deliveryFee)) + '"></label>' +
        '<label>Your notes<textarea rows="2" maxlength="1000" data-notes>' + esc(o.adminNotes) + "</textarea></label>" +
        '<div class="row"><button class="ghost" data-save>Save</button><button class="ghost danger" data-del>Delete order</button></div>' +
      "</div></details></article>";
  }

  // Events
  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    pw = $("#pw").value;
    $("#login-error").textContent = "";
    try { sessionStorage.setItem("yave-admin", pw); } catch (x) { /* ignore */ }
    seen = null; lastJson = "";
    load(false).then(() => { if (!$("#app").hidden) startTimer(); });
  });
  $("#logout").addEventListener("click", () => {
    stopTimer(); pw = ""; orders = []; seen = null; lastJson = "";
    try { sessionStorage.removeItem("yave-admin"); } catch (x) { /* ignore */ }
    $("#pw").value = ""; showApp(false);
  });
  $("#refresh").addEventListener("click", () => { $("#banner").hidden = true; document.title = "Orders | Yave"; lastJson = ""; load(false); });
  $("#search").addEventListener("input", () => render());
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-f]");
    if (b) { filter = b.dataset.f; render(); }
  });

  $("#list").addEventListener("change", async (e) => {
    if (!e.target.matches("[data-status]")) return;
    const id = e.target.closest(".order").dataset.id;
    try {
      const { order } = await api("PATCH", "", { id, status: e.target.value });
      orders = orders.map((o) => (o.id === id ? order : o));
      lastJson = JSON.stringify(orders);
      render();
    } catch (ex) { $("#banner").hidden = false; $("#banner").textContent = ex.message; }
  });

  $("#list").addEventListener("click", async (e) => {
    const card = e.target.closest(".order");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.matches("[data-copy]")) {
      const v = e.target.dataset.copy;
      try { await navigator.clipboard.writeText(v); e.target.textContent = "Copied"; setTimeout(() => (e.target.textContent = "Copy"), 1200); } catch (x) { /* ignore */ }
    } else if (e.target.matches("[data-save]")) {
      try {
        const { order } = await api("PATCH", "", { id, deliveryFee: card.querySelector("[data-fee]").value, adminNotes: card.querySelector("[data-notes]").value });
        orders = orders.map((o) => (o.id === id ? order : o));
        lastJson = JSON.stringify(orders);
        e.target.textContent = "Saved";
        setTimeout(() => render(), 600);
      } catch (ex) { $("#banner").hidden = false; $("#banner").textContent = ex.message; }
    } else if (e.target.matches("[data-del]")) {
      if (!confirm("Delete order " + id + "? This can't be undone.")) return;
      try {
        await api("DELETE", "?id=" + encodeURIComponent(id));
        orders = orders.filter((o) => o.id !== id);
        lastJson = JSON.stringify(orders);
        render();
      } catch (ex) { $("#banner").hidden = false; $("#banner").textContent = ex.message; }
    }
  });

  function csvCell(v) {
    let s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;   // stop spreadsheet formulas
    return '"' + s.replace(/"/g, '""') + '"';
  }
  $("#export").addEventListener("click", () => {
    const head = ["Order", "Date", "Status", "Name", "Phone", "City", "Address", "Email", "Items", "Subtotal", "Delivery fee", "Total", "Customer note", "Your notes"];
    const rows = orders.map((o) => [o.id, new Date(o.createdAt).toISOString(), o.status, o.customer.name, o.customer.phone, o.customer.city, o.customer.address, o.customer.email,
      o.items.map((i) => i.qty + " x " + i.name + (i.size ? " (" + i.size + ")" : "")).join("; "), o.subtotal, o.deliveryFee == null ? "" : o.deliveryFee, total(o), o.customer.notes, o.adminNotes]);
    const csv = "﻿" + [head].concat(rows).map((r) => r.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = "yave-orders.csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  });

  if (pw) load(false).then(() => { if (!$("#app").hidden) startTimer(); });
})();
