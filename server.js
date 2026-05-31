const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");

const PORT = process.env.PORT || 3000;
const GUESTS_FILE = path.join(__dirname, "guests.json");
const PUBLIC_DIR = path.join(__dirname, "public");

// ── Helpers ────────────────────────────────────────────────────────
function readGuests() {
  try {
    if (!fs.existsSync(GUESTS_FILE)) return [];
    return JSON.parse(fs.readFileSync(GUESTS_FILE, "utf8"));
  } catch {
    return [];
  }
}

function writeGuests(arr) {
  fs.writeFileSync(GUESTS_FILE, JSON.stringify(arr, null, 2), "utf8");
}

function serveFile(res, filePath, contentType) {
  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

function jsonResponse(res, status, obj) {
  res.writeHead(status, {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  res.end(JSON.stringify(obj));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

// ── Mime types ────────────────────────────────────────────────────
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".ico": "image/x-icon",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
};

// ── Server ────────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method.toUpperCase();

  // CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // ── API: POST /api/rsvp  ───────────────────────────────────────
  if (pathname === "/api/rsvp" && method === "POST") {
    try {
      const body = await parseBody(req);
      const { name, mesa, status, msg } = body;

      if (!name || !status) {
        return jsonResponse(res, 400, {
          ok: false,
          error: "Faltan campos requeridos.",
        });
      }
      if (!["confirm", "decline", "pending"].includes(status)) {
        return jsonResponse(res, 400, { ok: false, error: "Estado inválido." });
      }

      const guests = readGuests();
      const entry = {
        id: Date.now(),
        name: String(name).trim().substring(0, 120),
        mesa: String(mesa || "—")
          .trim()
          .substring(0, 120),
        status,
        msg: String(msg || "")
          .trim()
          .substring(0, 300),
        date: new Date().toISOString(),
      };
      guests.push(entry);
      writeGuests(guests);

      return jsonResponse(res, 200, { ok: true, entry });
    } catch (err) {
      return jsonResponse(res, 500, { ok: false, error: err.message });
    }
  }

  // ── API: GET /api/guests?pwd=XXX  ─────────────────────────────
  if (pathname === "/api/guests" && method === "GET") {
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "sarahi2026p";
    if (parsed.query.pwd !== ADMIN_PASSWORD) {
      return jsonResponse(res, 401, { ok: false, error: "No autorizado." });
    }
    return jsonResponse(res, 200, { ok: true, guests: readGuests() });
  }

  // ── Static files ───────────────────────────────────────────────
  // /invitados → serve index.html (client-side routing)
  if (pathname === "/invitados") {
    return serveFile(
      res,
      path.join(PUBLIC_DIR, "index.html"),
      "text/html; charset=utf-8",
    );
  }

  // Default: serve from /public
  let filePath = path.join(
    PUBLIC_DIR,
    pathname === "/" ? "index.html" : pathname,
  );
  // Security: block path traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  serveFile(res, filePath, mime);
});

server.listen(PORT, () => {
  console.log(`\n  ✦  Servidor XV Años corriendo en http://localhost:${PORT}`);
  console.log(`  ✦  Lista de invitados: http://localhost:${PORT}/invitados\n`);
});
