// Yave order server (one file). Vercel runs it for /api/orders and /api/admin/orders (see vercel.json).
//   POST   /api/orders          a customer places an order (cash on delivery)
//   GET    /api/admin/orders    list orders        (needs the admin password)
//   PATCH  /api/admin/orders    update an order    (needs the admin password)
//   DELETE /api/admin/orders    delete an order    (needs the admin password)
//   GET/PATCH /api/admin/customers   customer tags and notes (needs the admin password)
//   POST   /api/printlet/webhook     Printlet (or any service) reports a fulfilment update; needs PRINTLET_WEBHOOK_SECRET
// Setup: connect an Upstash Redis database to the Vercel project and set ADMIN_PASSWORD (8+ characters).

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const vm = require("vm");

/* ---------- helpers ---------- */

async function readBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return null; } }
    if (Buffer.isBuffer(req.body)) { try { return JSON.parse(req.body.toString("utf8")); } catch { return null; } }
    return req.body;
  }
  const chunks = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 100 * 1024) return null;
    chunks.push(c);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); } catch { return null; }
}

function send(res, status, obj) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(obj));
}

function clientIp(req) {
  const xf = String(req.headers["x-forwarded-for"] || "").split(",")[0].trim();
  return xf || (req.socket && req.socket.remoteAddress) || "unknown";
}

function clean(v, max) {
  return String(v == null ? "" : v).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* ---------- database (Upstash Redis over REST, no packages) ---------- */

const DB_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || "";
const DB_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || "";
const dbReady = () => Boolean(DB_URL && DB_TOKEN);

async function dbCall(p, body) {
  const r = await fetch(DB_URL.replace(/\/$/, "") + p, {
    method: "POST",
    headers: { Authorization: "Bearer " + DB_TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error("Database error " + r.status);
  return j;
}
async function cmd(...args) {
  const j = await dbCall("", args);
  if (j.error) throw new Error(j.error);
  return j.result;
}
async function pipeline(cmds) {
  const j = await dbCall("/pipeline", cmds);
  return j.map((x) => { if (x.error) throw new Error(x.error); return x.result; });
}
async function underLimit(key, max, windowSec) {
  const [n] = await pipeline([["INCR", key], ["EXPIRE", key, windowSec, "NX"]]);
  return n <= max;
}

/* ---------- catalog: prices come from products.js, never from the browser ---------- */

let catalogCache = null;
function catalog() {
  if (catalogCache) return catalogCache;
  const file = [path.join(process.cwd(), "products.js"), path.join(__dirname, "..", "products.js")].find((f) => fs.existsSync(f));
  if (!file) throw new Error("products.js not found");
  catalogCache = vm.runInNewContext(fs.readFileSync(file, "utf8") + "\n;({ PRODUCTS, CHARTS })", {}, { timeout: 1000 });
  return catalogCache;
}

let shippingCache = null;
function shipping() {
  if (shippingCache) return shippingCache;
  const file = [path.join(process.cwd(), "shipping.js"), path.join(__dirname, "..", "shipping.js")].find((f) => fs.existsSync(f));
  if (!file) throw new Error("shipping.js not found");
  shippingCache = vm.runInNewContext(fs.readFileSync(file, "utf8") + "\n;SHIPPING", {}, { timeout: 1000 });
  return shippingCache;
}

/* ---------- admin password ---------- */

function adminReady() { return (process.env.ADMIN_PASSWORD || "").length >= 8; }
function isAdmin(req) {
  const h = String(req.headers.authorization || "");
  const given = h.startsWith("Bearer ") ? h.slice(7) : "";
  const a = crypto.createHash("sha256").update(given).digest();
  const b = crypto.createHash("sha256").update(process.env.ADMIN_PASSWORD || "").digest();
  return adminReady() && crypto.timingSafeEqual(a, b);
}

/* ---------- POST /api/orders ---------- */

async function createOrder(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "Method not allowed." }); }
  if (!dbReady()) return send(res, 503, { error: "Ordering isn't available yet. Please try again soon." });

  const body = await readBody(req);
  if (!body || typeof body !== "object") return send(res, 400, { error: "Something went wrong. Please try again." });
  if (body.website) return send(res, 201, { id: "YAV-000000" });   // hidden field only bots fill in

  if (!(await underLimit("rl:order:" + clientIp(req), 6, 3600))) {
    return send(res, 429, { error: "Too many orders from this connection. Please try again later." });
  }

  const c = body.customer || {};
  const customer = {
    name: clean(c.name, 80),
    phone: String(c.phone || "").replace(/[^\d]/g, "").slice(0, 15),
    email: clean(c.email, 120),
    city: clean(c.city, 60),
    address: clean(c.address, 250),
    notes: clean(c.notes, 300),
  };
  if (customer.name.length < 2) return send(res, 400, { error: "Enter your full name." });
  if (customer.phone.length < 10) return send(res, 400, { error: "Enter a phone number we can call, at least 10 digits." });
  const gov = shipping().find((g) => g.name === customer.city);
  if (!gov) return send(res, 400, { error: "Choose your governorate." });
  if (customer.address.length < 5) return send(res, 400, { error: "Enter your full delivery address." });
  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) return send(res, 400, { error: "That email doesn't look right." });

  const { PRODUCTS, CHARTS } = catalog();
  if (!Array.isArray(body.items) || body.items.length < 1 || body.items.length > 20) return send(res, 400, { error: "Your cart is empty." });
  const items = [];
  for (const it of body.items) {
    const p = PRODUCTS.find((x) => x.id === it.id);
    if (!p) return send(res, 400, { error: "One of the items is no longer available. Please refresh your cart." });
    const chart = CHARTS[p.chart];
    const size = clean(it.size, 20);
    if (chart && !chart.sizes.some((s) => s.name === size)) return send(res, 400, { error: "Choose a size for " + p.name + "." });
    const qty = Math.floor(Number(it.qty));
    if (!(qty >= 1 && qty <= 10)) return send(res, 400, { error: "Quantity must be between 1 and 10." });
    items.push({ id: p.id, name: p.name, size: chart ? size : "", qty, price: p.price, sku: clean(p.printletSku, 60) });
  }
  const subtotal = items.reduce((n, i) => n + i.price * i.qty, 0);

  const createdAt = Date.now();
  let id = null;
  for (let tries = 0; tries < 5 && !id; tries++) {
    const candidate = "YAV-" + crypto.randomInt(100000, 1000000);
    const order = { id: candidate, createdAt, status: "pending", customer, items, subtotal, deliveryFee: gov.fee, adminNotes: "", printlet: null };
    if (await cmd("SET", "order:" + candidate, JSON.stringify(order), "NX")) {
      id = candidate;
      await cmd("ZADD", "orders", createdAt, id);
    }
  }
  if (!id) return send(res, 500, { error: "Couldn't save your order. Please try again." });
  return send(res, 201, { id });
}

/* ---------- /api/admin/orders ---------- */

const STATUSES = ["pending", "confirmed", "shipped", "completed", "cancelled"];
const PRINTLET_STATUSES = ["sent", "printing", "ready", "shipped", "delivered", "returned", "failed"];

async function adminOrders(req, res, url) {
  if (!dbReady() || !adminReady()) {
    return send(res, 503, { error: "The dashboard isn't set up yet. Add the database and ADMIN_PASSWORD in Vercel." });
  }
  if (!(await underLimit("rl:admin:" + clientIp(req), 120, 900))) return send(res, 429, { error: "Too many attempts. Wait a few minutes." });
  if (!isAdmin(req)) { await sleep(700); return send(res, 401, { error: "Wrong password." }); }

  if (req.method === "GET") {
    const ids = await cmd("ZRANGE", "orders", 0, 499, "REV");
    if (!ids.length) return send(res, 200, { orders: [] });
    const rows = await cmd("MGET", ...ids.map((i) => "order:" + i));
    const orders = rows.filter(Boolean).map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
    return send(res, 200, { orders });
  }

  if (req.method === "PATCH") {
    const b = (await readBody(req)) || {};
    const id = clean(b.id, 20);
    if (!/^YAV-\d{6}$/.test(id)) return send(res, 400, { error: "Bad order number." });
    const raw = await cmd("GET", "order:" + id);
    if (!raw) return send(res, 404, { error: "Order not found." });
    const order = JSON.parse(raw);
    if (b.status !== undefined) {
      if (!STATUSES.includes(b.status)) return send(res, 400, { error: "Bad status." });
      order.status = b.status;
    }
    if (b.deliveryFee !== undefined) {
      if (b.deliveryFee === null || b.deliveryFee === "") order.deliveryFee = null;
      else {
        const n = Number(b.deliveryFee);
        if (!(n >= 0 && n <= 10000)) return send(res, 400, { error: "Delivery fee must be a number." });
        order.deliveryFee = n;
      }
    }
    if (b.adminNotes !== undefined) order.adminNotes = String(b.adminNotes).slice(0, 1000);
    if (b.printlet !== undefined) {
      if (b.printlet === null) order.printlet = null;
      else {
        const pr = b.printlet || {};
        const prev = order.printlet || {};
        const st = clean(pr.status, 20);
        if (st && !PRINTLET_STATUSES.includes(st)) return send(res, 400, { error: "Bad Printlet status." });
        order.printlet = {
          orderId: pr.orderId !== undefined ? clean(pr.orderId, 60) : prev.orderId || "",
          status: st || prev.status || "sent",
          tracking: pr.tracking !== undefined ? clean(pr.tracking, 80) : prev.tracking || "",
          sentAt: prev.sentAt || Date.now(),
          updatedAt: Date.now(),
        };
      }
    }
    await cmd("SET", "order:" + id, JSON.stringify(order));
    return send(res, 200, { order });
  }

  if (req.method === "DELETE") {
    const id = clean(url.searchParams.get("id"), 20);
    if (!/^YAV-\d{6}$/.test(id)) return send(res, 400, { error: "Bad order number." });
    await pipeline([["DEL", "order:" + id], ["ZREM", "orders", id]]);
    return send(res, 200, { ok: true });
  }

  res.setHeader("Allow", "GET, PATCH, DELETE");
  return send(res, 405, { error: "Method not allowed." });
}

/* ---------- /api/admin/customers (tags + notes, keyed by phone) ---------- */

async function adminCustomers(req, res) {
  if (!dbReady() || !adminReady()) return send(res, 503, { error: "The dashboard isn't set up yet." });
  if (!(await underLimit("rl:admin:" + clientIp(req), 120, 900))) return send(res, 429, { error: "Too many attempts. Wait a few minutes." });
  if (!isAdmin(req)) { await sleep(700); return send(res, 401, { error: "Wrong password." }); }

  if (req.method === "GET") {
    const flat = (await cmd("HGETALL", "crm:customers")) || [];
    const profiles = {};
    for (let i = 0; i + 1 < flat.length; i += 2) { try { profiles[flat[i]] = JSON.parse(flat[i + 1]); } catch {} }
    return send(res, 200, { profiles });
  }
  if (req.method === "PATCH") {
    const b = (await readBody(req)) || {};
    const phone = String(b.phone || "").replace(/[^\d]/g, "").slice(0, 15);
    if (phone.length < 10) return send(res, 400, { error: "Bad phone number." });
    const raw = await cmd("HGET", "crm:customers", phone);
    const cur = raw ? JSON.parse(raw) : { tags: [], notes: "" };
    if (b.notes !== undefined) cur.notes = String(b.notes).slice(0, 1500);
    if (b.tags !== undefined) {
      if (!Array.isArray(b.tags)) return send(res, 400, { error: "Bad tags." });
      cur.tags = [...new Set(b.tags.map((t) => clean(t, 20).toLowerCase()).filter(Boolean))].slice(0, 8);
    }
    await cmd("HSET", "crm:customers", phone, JSON.stringify(cur));
    return send(res, 200, { phone, profile: cur });
  }
  res.setHeader("Allow", "GET, PATCH");
  return send(res, 405, { error: "Method not allowed." });
}

/* ---------- POST /api/printlet/webhook ----------
   Body (JSON): { "reference": "YAV-123456", "status": "printing", "tracking": "...", "orderId": "..." }
   Secret: header "x-webhook-secret" or "Authorization: Bearer <secret>", set PRINTLET_WEBHOOK_SECRET in Vercel.
   Printlet's own webhook format isn't public; this accepts a simple shape you can map to from any automation. */

async function printletWebhook(req, res) {
  const secret = process.env.PRINTLET_WEBHOOK_SECRET || "";
  if (secret.length < 12) return send(res, 503, { error: "Webhook not configured." });
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return send(res, 405, { error: "Method not allowed." }); }
  if (!dbReady()) return send(res, 503, { error: "Database not connected." });
  if (!(await underLimit("rl:hook:" + clientIp(req), 300, 900))) return send(res, 429, { error: "Too many requests." });
  const h = String(req.headers["x-webhook-secret"] || "") || String(req.headers.authorization || "").replace(/^Bearer /, "");
  const a = crypto.createHash("sha256").update(h).digest();
  const b2 = crypto.createHash("sha256").update(secret).digest();
  if (!crypto.timingSafeEqual(a, b2)) { await sleep(700); return send(res, 401, { error: "Bad secret." }); }

  const b = (await readBody(req)) || {};
  const id = clean(b.reference || b.ref || b.externalId, 20).toUpperCase();
  if (!/^YAV-\d{6}$/.test(id)) return send(res, 400, { error: "Unknown reference." });
  const raw = await cmd("GET", "order:" + id);
  if (!raw) return send(res, 404, { error: "Order not found." });
  const order = JSON.parse(raw);
  const prev = order.printlet || {};
  const st = clean(b.status, 20).toLowerCase();
  if (st && !PRINTLET_STATUSES.includes(st)) return send(res, 400, { error: "Unknown status." });
  order.printlet = {
    orderId: clean(b.orderId || b.printletOrderId, 60) || prev.orderId || "",
    status: st || prev.status || "sent",
    tracking: clean(b.tracking, 80) || prev.tracking || "",
    sentAt: prev.sentAt || Date.now(),
    updatedAt: Date.now(),
  };
  // keep the shop status in step with fulfilment
  if (order.printlet.status === "shipped" && ["pending", "confirmed"].includes(order.status)) order.status = "shipped";
  if (order.printlet.status === "delivered" && order.status !== "cancelled") order.status = "completed";
  await cmd("SET", "order:" + id, JSON.stringify(order));
  return send(res, 200, { ok: true });
}

/* ---------- entry point ---------- */

module.exports = async (req, res) => {
  try {
    const url = new URL(req.url, "http://localhost");
    const route = url.searchParams.get("r") || (url.pathname.endsWith("/admin/orders") ? "admin" : "orders");
    if (route === "admin") return await adminOrders(req, res, url);
    if (route === "customers") return await adminCustomers(req, res);
    if (route === "printlet") return await printletWebhook(req, res);
    return await createOrder(req, res);
  } catch (e) {
    return send(res, 500, { error: "Something went wrong. Please try again." });
  }
};
