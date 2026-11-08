(function () {
  const $ = (s, r) => (r || document).querySelector(s);
  const STATUSES = ["pending", "confirmed", "shipped", "completed", "cancelled"];
  const PL_STATUSES = ["sent", "printing", "ready", "shipped", "delivered", "returned", "failed"];
  const PL_DONE = ["delivered", "returned", "failed"];
  const TAGS = ["vip", "wholesale", "friend", "problem"];

  let pw = "";
  try { pw = sessionStorage.getItem("yave-admin") || ""; } catch (e) { pw = ""; }
  let orders = [], profiles = {};
  let tab = "overview", filter = "all", query = "", custQuery = "", custOpen = "";
  let seen = null, newIds = new Set(), openOrders = new Set(), timer = null, lastJson = "";

  const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const egp = (n) => Number(n || 0).toLocaleString("en-US") + " EGP";
  const total = (o) => o.subtotal + (o.deliveryFee || 0);
  const when = (t) => new Date(t).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
  const day = (t) => new Date(t).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
  const cap = (s) => s.charAt(0).toUpperCase() + s.slice(1);
  const badge = (s, extra) => '<span class="badge ' + esc(s) + '">' + esc(cap(s)) + (extra || "") + "</span>";
  function waLink(phone) {
    let d = String(phone).replace(/\D/g, "");
    if (d.startsWith("00")) d = d.slice(2); else if (d.startsWith("0")) d = "20" + d.slice(1);
    return "https://wa.me/" + d;
  }
  const itemsText = (o) => o.items.map((i) => i.qty + " x " + i.name + (i.size ? " (" + i.size + ")" : "")).join(", ");

  async function api(kind, method, body, qs) {
    const res = await fetch("/api/admin/" + kind + (qs || ""), {
      method,
      headers: Object.assign({ Authorization: "Bearer " + pw }, body ? { "Content-Type": "application/json" } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { const e = new Error(data.error || ("The server answered with error " + res.status + ". It may not be deployed yet.")); e.status = res.status; throw e; }
    return data;
  }

  function banner(msg) { const b = $("#banner"); b.hidden = !msg; b.textContent = msg || ""; }
  function showApp(on) { $("#login").hidden = on; $("#app").hidden = !on; }

  /* ---------- data ---------- */

  async function load(auto) {
    try {
      const [o, c] = await Promise.all([api("orders", "GET"), api("customers", "GET").catch(() => ({ profiles: profiles }))]);
      const fresh = seen ? o.orders.filter((x) => !seen.has(x.id)) : [];
      if (fresh.length) {
        banner(fresh.length === 1 ? "New order: " + fresh[0].id : fresh.length + " new orders");
        document.title = "(" + fresh.length + ") Dashboard | Yave";
        fresh.forEach((x) => newIds.add(x.id));
      }
      seen = seen || new Set();
      o.orders.forEach((x) => seen.add(x.id));
      const json = JSON.stringify([o.orders, c.profiles]);
      const typing = auto && document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName) && document.activeElement.id !== "pw";
      if (json !== lastJson && !typing) { orders = o.orders; profiles = c.profiles || {}; lastJson = json; render(); }
      showApp(true);
    } catch (e) {
      if (e.status === 401 || e.status === 503) {
        stopTimer(); showApp(false);
        $("#login-error").textContent = e.message;
        try { sessionStorage.removeItem("yave-admin"); } catch (x) {}
      } else if (!auto) {
        if ($("#app").hidden) $("#login-error").textContent = e.message || "Couldn't reach the server.";
        else banner(e.message);
      }
    }
  }
  function stopTimer() { if (timer) clearInterval(timer); timer = null; }
  function startTimer() { stopTimer(); timer = setInterval(() => load(true), 30000); }

  async function patchOrder(id, patch) {
    try {
      const { order } = await api("orders", "PATCH", Object.assign({ id }, patch));
      orders = orders.map((o) => (o.id === id ? order : o));
      lastJson = JSON.stringify([orders, profiles]);
      render();
    } catch (e) { banner(e.message); }
  }
  async function patchCustomer(phone, patch) {
    try {
      const { profile } = await api("customers", "PATCH", Object.assign({ phone }, patch));
      profiles[phone] = profile;
      lastJson = JSON.stringify([orders, profiles]);
      render();
    } catch (e) { banner(e.message); }
  }

  /* ---------- customers (built from orders) ---------- */

  function customers() {
    const map = {};
    orders.forEach((o) => {
      const k = o.customer.phone;
      const c = map[k] || (map[k] = { phone: k, name: o.customer.name, email: "", city: "", address: "", orders: [], first: o.createdAt, last: 0 });
      c.orders.push(o);
      if (o.createdAt >= c.last) { c.last = o.createdAt; c.name = o.customer.name; c.city = o.customer.city; c.address = o.customer.address; c.email = o.customer.email || c.email; }
      if (o.createdAt < c.first) c.first = o.createdAt;
    });
    return Object.values(map).map((c) => {
      const live = c.orders.filter((o) => o.status !== "cancelled");
      c.count = live.length;
      c.spent = c.orders.filter((o) => o.status === "completed").reduce((n, o) => n + total(o), 0);
      c.pending = live.filter((o) => o.status !== "completed").reduce((n, o) => n + total(o), 0);
      c.cancelled = c.orders.length - live.length;
      c.profile = profiles[c.phone] || { tags: [], notes: "" };
      return c;
    }).sort((a, b) => b.last - a.last);
  }

  /* ---------- views ---------- */

  function viewOverview() {
    const by = (s) => orders.filter((o) => o.status === s);
    const cs = customers();
    const repeat = cs.filter((c) => c.count >= 2).length;
    const sales = by("completed").reduce((n, o) => n + total(o), 0);
    const open = orders.filter((o) => ["pending", "confirmed", "shipped"].includes(o.status)).reduce((n, o) => n + total(o), 0);
    const toSend = orders.filter((o) => o.status === "confirmed" && !o.printlet).length;
    const atPl = orders.filter((o) => o.printlet && !PL_DONE.includes(o.printlet.status) && !["cancelled", "completed"].includes(o.status)).length;
    const tally = {};
    orders.filter((o) => o.status !== "cancelled").forEach((o) => o.items.forEach((i) => { tally[i.name] = (tally[i.name] || 0) + i.qty; }));
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1]).slice(0, 5);
    const recent = orders.slice(0, 5);
    return `
      <div class="head"><div><h1>Overview</h1><p class="sub">Orders, customers and fulfilment at a glance.</p></div></div>
      <div class="stats">
        <div class="stat"><span>Needs confirming</span><strong>${by("pending").length}</strong></div>
        <div class="stat"><span>To send to Printlet</span><strong>${toSend}</strong></div>
        <div class="stat"><span>In production / delivery</span><strong>${atPl}</strong></div>
        <div class="stat"><span>Sales completed</span><strong>${egp(sales)}</strong></div>
        <div class="stat"><span>Cash still to collect</span><strong>${egp(open)}</strong></div>
        <div class="stat"><span>Customers</span><strong>${cs.length}</strong></div>
        <div class="stat"><span>Repeat customers</span><strong>${repeat}</strong></div>
      </div>
      <div class="grid2">
        <div class="card"><h2>Order pipeline</h2>
          <div class="pipe">${STATUSES.map((s) => `<div><strong>${by(s).length}</strong><span>${cap(s)}</span></div>`).join("")}</div>
        </div>
        <div class="card"><h2>Best sellers</h2>
          ${top.length ? `<ul class="lines">${top.map(([n, q]) => `<li><span>${esc(n)}</span><strong>${q}</strong></li>`).join("")}</ul>` : '<p class="empty">Nothing sold yet.</p>'}
        </div>
        <div class="card"><h2>Latest orders</h2>
          ${recent.length ? `<ul class="lines">${recent.map((o) => `<li><span><strong>${esc(o.id)}</strong> ${esc(o.customer.name)}</span>${badge(o.status)}</li>`).join("")}</ul>` : '<p class="empty">No orders yet. New orders appear here.</p>'}
        </div>
      </div>`;
  }

  function plBlock(o) {
    const p = o.printlet;
    return `<div class="pl-box" data-order="${esc(o.id)}">
      <strong>Printlet</strong>
      ${p ? `<p class="note">${badge(p.status)} ${p.orderId ? "Printlet order " + esc(p.orderId) + ". " : ""}Updated ${when(p.updatedAt)}</p>` : '<p class="note">Not sent to Printlet yet.</p>'}
      <div class="row">
        <label>Printlet order no.<input data-f="pl-id" value="${esc(p ? p.orderId : "")}" placeholder="Optional"></label>
        <label>Status<select data-f="pl-status">${PL_STATUSES.map((s) => `<option value="${s}"${p && p.status === s ? " selected" : ""}>${cap(s)}</option>`).join("")}</select></label>
        <label>Tracking<input data-f="pl-track" value="${esc(p ? p.tracking : "")}" placeholder="Tracking number"></label>
      </div>
      <div class="row"><button class="mini solid" type="button" data-act="pl-save">${p ? "Save Printlet update" : "Mark as sent to Printlet"}</button>${p ? '<button class="mini" type="button" data-act="pl-clear">Remove link</button>' : ""}</div>
    </div>`;
  }

  function orderCard(o) {
    const c = o.customer;
    const k = profiles[c.phone];
    return `<details class="order${newIds.has(o.id) ? " isnew" : ""}" data-order="${esc(o.id)}"${openOrders.has(o.id) ? " open" : ""}>
      <summary><span class="id">${esc(o.id)}</span><span>${esc(c.name)}<br><span class="who">${esc(c.city)}</span></span><span class="when who">${when(o.createdAt)}</span><span>${badge(o.status)}<br><strong>${egp(total(o))}</strong></span></summary>
      <div class="body">
        <div class="cols">
          <div><h4>Customer</h4><p><strong>${esc(c.name)}</strong> ${k && k.tags.length ? k.tags.map((t) => `<span class="badge tag">${esc(t)}</span>`).join(" ") : ""}</p>
            <p><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a> &middot; <a href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a></p>
            ${c.email ? `<p>${esc(c.email)}</p>` : ""}<p>${esc(c.address)}, ${esc(c.city)}</p>${c.notes ? `<p class="note">Customer note: ${esc(c.notes)}</p>` : ""}</div>
          <div><h4>Items</h4><ul class="lines">${o.items.map((i) => `<li><span>${i.qty} x ${esc(i.name)}${i.size ? " (" + esc(i.size) + ")" : ""}</span><span>${egp(i.price * i.qty)}</span></li>`).join("")}
            <li><span>Delivery</span><span>${o.deliveryFee == null ? "not set" : egp(o.deliveryFee)}</span></li><li><strong>Cash to collect</strong><strong>${egp(total(o))}</strong></li></ul></div>
        </div>
        <div class="row" data-order="${esc(o.id)}">
          <label>Status<select data-f="status">${STATUSES.map((s) => `<option value="${s}"${o.status === s ? " selected" : ""}>${cap(s)}</option>`).join("")}</select></label>
          <label>Delivery fee (EGP)<input data-f="fee" type="number" min="0" value="${o.deliveryFee == null ? "" : o.deliveryFee}"></label>
          <label>Internal note<input data-f="notes" value="${esc(o.adminNotes)}" maxlength="1000"></label>
          <button class="mini solid" type="button" data-act="save-order">Save</button>
        </div>
        ${plBlock(o)}
        <div class="row"><button class="mini danger" type="button" data-act="delete" data-order="${esc(o.id)}">Delete order</button></div>
      </div>
    </details>`;
  }

  function viewOrders() {
    const q = query.trim().toLowerCase();
    const list = orders.filter((o) => (filter === "all" || o.status === filter) &&
      (!q || [o.id, o.customer.name, o.customer.phone, o.customer.city].join(" ").toLowerCase().includes(q)));
    const n = (s) => (s === "all" ? orders.length : orders.filter((o) => o.status === s).length);
    return `
      <div class="head"><div><h1>Orders</h1><p class="sub">Open an order to confirm it, set delivery and track it at Printlet.</p></div>
        <button class="ghost" type="button" data-act="export-orders">Export CSV</button></div>
      <div class="chips">${["all"].concat(STATUSES).map((s) => `<button class="chip${filter === s ? " on" : ""}" type="button" data-filter="${s}">${cap(s)} ${n(s)}</button>`).join("")}</div>
      <label class="search"><span>Search name, phone, order number or city</span><input id="q" type="search" value="${esc(query)}" autocomplete="off"></label>
      ${list.length ? list.map(orderCard).join("") : '<p class="empty">No orders here yet. New orders appear on this page.</p>'}`;
  }

  function viewCustomers() {
    const q = custQuery.trim().toLowerCase();
    const cs = customers().filter((c) => !q || [c.name, c.phone, c.city, c.profile.tags.join(" ")].join(" ").toLowerCase().includes(q));
    const open = custOpen && customers().find((c) => c.phone === custOpen);
    return `
      <div class="head"><div><h1>Customers</h1><p class="sub">Everyone who ordered, grouped by phone number.</p></div>
        <button class="ghost" type="button" data-act="export-customers">Export CSV</button></div>
      <label class="search"><span>Search name, phone, city or tag</span><input id="cq" type="search" value="${esc(custQuery)}" autocomplete="off"></label>
      <div class="card tablewrap">${cs.length ? `<table><thead><tr><th>Customer</th><th>City</th><th class="num">Orders</th><th class="num">Spent</th><th>Last order</th><th>Tags</th></tr></thead><tbody>
        ${cs.map((c) => `<tr class="click" tabindex="0" data-cust="${esc(c.phone)}"><td><strong>${esc(c.name)}</strong><br><span class="note">${esc(c.phone)}</span></td><td>${esc(c.city)}</td><td class="num">${c.count}${c.count >= 2 ? ' <span class="badge new">Repeat</span>' : ""}</td><td class="num">${egp(c.spent)}</td><td>${day(c.last)}</td><td>${c.profile.tags.map((t) => `<span class="badge tag">${esc(t)}</span>`).join(" ")}</td></tr>`).join("")}
        </tbody></table>` : '<p class="empty">No customers yet. They appear after the first order.</p>'}</div>
      ${open ? customerPanel(open) : ""}`;
  }

  function customerPanel(c) {
    return `<div class="scrim" data-act="close-cust"></div>
      <aside class="detail" data-phone="${esc(c.phone)}" role="dialog" aria-label="Customer ${esc(c.name)}">
        <div class="head" style="margin:0"><div><h2>${esc(c.name)}</h2><p class="sub">${esc(c.city)} &middot; customer since ${day(c.first)}</p></div><button class="mini" type="button" data-act="close-cust">Close</button></div>
        <p><a href="tel:${esc(c.phone)}">${esc(c.phone)}</a> &middot; <a href="${waLink(c.phone)}" target="_blank" rel="noopener">WhatsApp</a>${c.email ? " &middot; " + esc(c.email) : ""}<br>${esc(c.address)}</p>
        <div class="stats" style="margin:0"><div class="stat"><span>Orders</span><strong>${c.count}</strong></div><div class="stat"><span>Spent</span><strong>${egp(c.spent)}</strong></div></div>
        <div><h3>Tags</h3><div class="chips" style="margin-top:8px">${TAGS.map((t) => `<button type="button" class="chip${c.profile.tags.includes(t) ? " on" : ""}" data-tag="${t}">${cap(t)}</button>`).join("")}</div></div>
        <label>Private notes<textarea data-f="cnotes" maxlength="1500">${esc(c.profile.notes)}</textarea></label>
        <div class="row"><button class="mini solid" type="button" data-act="save-cust">Save notes</button></div>
        <div><h3>Order history</h3><ul class="lines">${c.orders.map((o) => `<li><span><strong>${esc(o.id)}</strong> ${day(o.createdAt)}<br><span class="note">${esc(itemsText(o))}</span></span><span>${badge(o.status)}<br>${egp(total(o))}</span></li>`).join("")}</ul></div>
      </aside>`;
  }

  function viewPrintlet() {
    const queue = orders.filter((o) => o.status === "confirmed" && !o.printlet);
    const active = orders.filter((o) => o.printlet && !PL_DONE.includes(o.printlet.status) && !["cancelled", "completed"].includes(o.status));
    const done = orders.filter((o) => o.printlet && (PL_DONE.includes(o.printlet.status) || o.status === "completed")).slice(0, 10);
    const base = location.origin;
    return `
      <div class="head"><div><h1>Printlet</h1><p class="sub">Send confirmed orders to Printlet, then track them until they are delivered.</p></div>
        <button class="ghost" type="button" data-act="export-printlet">Export queue for Printlet (CSV)</button></div>

      <div class="card" style="margin-bottom:16px"><h2>1. Ready to send (${queue.length})</h2>
        <p class="sub">Confirm an order in the Orders tab and it shows up here. Copy the details into Printlet, then mark it as sent.</p>
        ${queue.length ? queue.map((o) => `<div class="pl-box" data-order="${esc(o.id)}" style="margin-top:12px">
          <div class="row" style="justify-content:space-between"><strong>${esc(o.id)} &middot; ${esc(o.customer.name)}</strong><span>${egp(total(o))} cash on delivery</span></div>
          <p class="note" style="color:var(--ink)">${esc(itemsText(o))}<br>${esc(o.customer.phone)} &middot; ${esc(o.customer.address)}, ${esc(o.customer.city)}</p>
          <div class="row"><label>Printlet order no. (optional)<input data-f="pl-id" placeholder="Paste after you create it"></label>
            <button class="mini" type="button" data-act="pl-copy">Copy details</button>
            <button class="mini solid" type="button" data-act="pl-send">Mark as sent</button></div></div>`).join("") : '<p class="empty">Nothing waiting. Confirmed orders appear here.</p>'}
      </div>

      <div class="card" style="margin-bottom:16px"><h2>2. At Printlet (${active.length})</h2>
        <div class="tablewrap">${active.length ? `<table><thead><tr><th>Order</th><th>Printlet</th><th>Status</th><th>Tracking</th><th></th></tr></thead><tbody>
          ${active.map((o) => `<tr data-order="${esc(o.id)}"><td><strong>${esc(o.id)}</strong><br><span class="note">${esc(o.customer.name)}</span></td>
            <td><input data-f="pl-id" value="${esc(o.printlet.orderId)}" aria-label="Printlet order number"></td>
            <td><select data-f="pl-status" aria-label="Printlet status">${PL_STATUSES.map((s) => `<option value="${s}"${o.printlet.status === s ? " selected" : ""}>${cap(s)}</option>`).join("")}</select></td>
            <td><input data-f="pl-track" value="${esc(o.printlet.tracking)}" aria-label="Tracking number"></td>
            <td><button class="mini solid" type="button" data-act="pl-save-row">Save</button></td></tr>`).join("")}</tbody></table>` : '<p class="empty">No orders in production.</p>'}</div>
      </div>

      ${done.length ? `<div class="card" style="margin-bottom:16px"><h2>Recently finished</h2><ul class="lines">${done.map((o) => `<li><span><strong>${esc(o.id)}</strong> ${esc(o.customer.name)}</span>${badge(o.printlet.status)}</li>`).join("")}</ul></div>` : ""}

      <div class="card"><h2>3. Automatic updates (webhook)</h2>
        <p class="sub">When Printlet, or an automation tool you use, can call a web address, point it here and statuses update on their own. Printlet has not published an open API, so ask their support whether webhooks are available for your account.</p>
        <ol class="steps">
          <li>In Vercel, add the environment variable <strong>PRINTLET_WEBHOOK_SECRET</strong> (12+ characters) and redeploy.</li>
          <li>Send a POST request to the address below with the header <strong>x-webhook-secret</strong>.</li>
        </ol>
        <pre class="code">POST ${esc(base)}/api/printlet/webhook
x-webhook-secret: your-secret

{ "reference": "YAV-123456",
  "status": "shipped",
  "tracking": "EG123456789",
  "orderId": "PL-5581" }</pre>
        <p class="note">Statuses: ${PL_STATUSES.join(", ")}. "shipped" and "delivered" also move the shop order to Shipped and Completed.</p>
      </div>`;
  }

  function render() {
    const views = { overview: viewOverview, orders: viewOrders, customers: viewCustomers, printlet: viewPrintlet };
    Object.keys(views).forEach((t) => {
      const el = $("#view-" + t);
      el.hidden = t !== tab;
      el.innerHTML = t === tab ? views[t]() : "";
    });
    document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("on", b.dataset.tab === tab));
    const qi = $("#q"); if (qi && document.activeElement === document.body && query) { /* keep focus out */ }
  }

  /* ---------- exports ---------- */

  function csvCell(v) {
    let s = String(v == null ? "" : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }
  function download(name, rows) {
    const csv = "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }
  const stamp = () => new Date().toISOString().slice(0, 10);

  function exportOrders() {
    const rows = [["Order", "Date", "Status", "Name", "Phone", "City", "Address", "Items", "Subtotal", "Delivery", "Total", "Printlet status", "Printlet order", "Tracking", "Note"]];
    orders.forEach((o) => rows.push([o.id, new Date(o.createdAt).toISOString(), o.status, o.customer.name, o.customer.phone, o.customer.city, o.customer.address, itemsText(o), o.subtotal, o.deliveryFee == null ? "" : o.deliveryFee, total(o), o.printlet ? o.printlet.status : "", o.printlet ? o.printlet.orderId : "", o.printlet ? o.printlet.tracking : "", o.adminNotes]));
    download("yave-orders-" + stamp() + ".csv", rows);
  }
  function exportCustomers() {
    const rows = [["Name", "Phone", "Email", "City", "Address", "Orders", "Spent", "First order", "Last order", "Tags", "Notes"]];
    customers().forEach((c) => rows.push([c.name, c.phone, c.email, c.city, c.address, c.count, c.spent, new Date(c.first).toISOString(), new Date(c.last).toISOString(), c.profile.tags.join(" "), c.profile.notes]));
    download("yave-customers-" + stamp() + ".csv", rows);
  }
  function exportPrintlet() {
    const rows = [["Reference", "Recipient", "Phone", "City", "Address", "Product", "Printlet SKU", "Size", "Qty", "Cash to collect (EGP)", "Notes"]];
    orders.filter((o) => o.status === "confirmed" && !o.printlet).forEach((o) => {
      const cod = total(o);
      o.items.forEach((i, n) => rows.push([o.id, o.customer.name, o.customer.phone, o.customer.city, o.customer.address, i.name, i.sku || "", i.size, i.qty, n === 0 ? cod : 0, o.customer.notes || ""]));
    });
    if (rows.length === 1) { banner("Nothing to export. Confirm an order first."); return; }
    download("yave-printlet-queue-" + stamp() + ".csv", rows);
  }
  function printletText(o) {
    const c = o.customer;
    return ["Reference: " + o.id, "Name: " + c.name, "Phone: " + c.phone, "City: " + c.city, "Address: " + c.address,
      "Items: " + itemsText(o), "Cash to collect: " + total(o) + " EGP", c.notes ? "Notes: " + c.notes : ""].filter(Boolean).join("\n");
  }
  async function copy(text) {
    try { await navigator.clipboard.writeText(text); banner("Copied. Paste it into Printlet."); }
    catch (e) { window.prompt("Copy this text:", text); }
  }

  /* ---------- events ---------- */

  const val = (root, f) => { const el = root.querySelector('[data-f="' + f + '"]'); return el ? el.value : ""; };

  document.addEventListener("click", async (e) => {
    const t = e.target.closest("button, tr[data-cust]");
    if (!t) return;
    if (t.dataset.tab) { tab = t.dataset.tab; custOpen = ""; document.title = "Dashboard | Yave"; banner(""); render(); return; }
    if (t.dataset.filter) { filter = t.dataset.filter; render(); return; }
    if (t.dataset.cust) { custOpen = t.dataset.cust; render(); return; }
    if (t.dataset.tag) {
      const p = $(".detail").dataset.phone;
      const cur = (profiles[p] && profiles[p].tags) || [];
      patchCustomer(p, { tags: cur.includes(t.dataset.tag) ? cur.filter((x) => x !== t.dataset.tag) : cur.concat(t.dataset.tag) });
      return;
    }
    const act = t.dataset.act;
    if (!act) return;
    const scope = t.closest("[data-order]");
    const id = scope && scope.dataset.order;
    switch (act) {
      case "close-cust": custOpen = ""; render(); break;
      case "save-cust": { const d = $(".detail"); patchCustomer(d.dataset.phone, { notes: val(d, "cnotes") }); break; }
      case "export-orders": exportOrders(); break;
      case "export-customers": exportCustomers(); break;
      case "export-printlet": exportPrintlet(); break;
      case "save-order": {
        const r = t.closest(".row");
        patchOrder(id, { status: val(r, "status"), deliveryFee: val(r, "fee"), adminNotes: val(r, "notes") });
        break;
      }
      case "delete":
        if (confirm("Delete order " + id + "? This can't be undone.")) {
          try { await api("orders", "DELETE", null, "?id=" + encodeURIComponent(id)); orders = orders.filter((o) => o.id !== id); lastJson = JSON.stringify([orders, profiles]); render(); }
          catch (err) { banner(err.message); }
        }
        break;
      case "pl-save": { const b = t.closest(".pl-box"); patchOrder(id, { printlet: { orderId: val(b, "pl-id"), status: val(b, "pl-status"), tracking: val(b, "pl-track") } }); break; }
      case "pl-save-row": { const r = t.closest("tr"); patchOrder(id, { printlet: { orderId: val(r, "pl-id"), status: val(r, "pl-status"), tracking: val(r, "pl-track") } }); break; }
      case "pl-clear": patchOrder(id, { printlet: null }); break;
      case "pl-copy": copy(printletText(orders.find((o) => o.id === id))); break;
      case "pl-send": { const b = t.closest(".pl-box"); patchOrder(id, { printlet: { orderId: val(b, "pl-id"), status: "sent" } }); break; }
    }
  });

  document.addEventListener("toggle", (e) => {
    const d = e.target;
    if (d.matches && d.matches("details.order")) { if (d.open) openOrders.add(d.dataset.order); else openOrders.delete(d.dataset.order); }
  }, true);

  document.addEventListener("input", (e) => {
    if (e.target.id === "q") { query = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#q"); n.focus(); n.setSelectionRange(pos, pos); }
    if (e.target.id === "cq") { custQuery = e.target.value; const pos = e.target.selectionStart; render(); const n = $("#cq"); n.focus(); n.setSelectionRange(pos, pos); }
  });
  document.addEventListener("keydown", (e) => {
    if ((e.key === "Enter" || e.key === " ") && e.target.matches && e.target.matches("tr[data-cust]")) { e.preventDefault(); custOpen = e.target.dataset.cust; render(); }
    if (e.key === "Escape" && custOpen) { custOpen = ""; render(); }
  });

  $("#login-form").addEventListener("submit", (e) => {
    e.preventDefault();
    pw = $("#pw").value;
    $("#login-error").textContent = "";
    try { sessionStorage.setItem("yave-admin", pw); } catch (x) {}
    load(false).then(() => { if (!$("#app").hidden) startTimer(); });
  });
  $("#refresh").addEventListener("click", () => { banner(""); document.title = "Dashboard | Yave"; newIds = new Set(); load(false); });
  $("#logout").addEventListener("click", () => {
    stopTimer(); pw = ""; orders = []; profiles = {}; seen = null; lastJson = "";
    try { sessionStorage.removeItem("yave-admin"); } catch (x) {}
    showApp(false); $("#pw").value = "";
  });

  if (pw) load(false).then(() => { if (!$("#app").hidden) startTimer(); });
})();
