// Yave order server (one file). Vercel runs it for /api/orders and /api/admin/orders (see vercel.json).
//   POST   /api/orders          a customer places an order (cash on delivery)
//   GET    /api/admin/orders    list orders        (needs the admin password)
//   PATCH  /api/admin/orders    update an order    (needs the admin password)
//   DELETE /api/admin/orders    delete an order    (needs the admin password)
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
