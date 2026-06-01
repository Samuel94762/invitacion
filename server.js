const http = require("http");
const fs = require("fs");
const path = require("path");
const url = require("url");
const { MongoClient, ServerApiVersion } = require("mongodb");

const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || "";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "";
const PUBLIC_DIR = path.join(__dirname, "public");

if (!MONGO_URI) {
  console.error("ERROR: Define la variable de entorno MONGO_URI");
  process.exit(1);
}

// ── MongoDB ──────────────────────────────────────────────────────
const client = new MongoClient(MONGO_URI, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
});

let db, guests;

async function connectDB() {
  await client.connect();
  db = client.db("xv_sarahi");
  guests = db.collection("guests");
  console.log("  ✦  MongoDB conectado");
}

// ── Helpers ──────────────────────────────────────────────────────
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
        reject(new Error("JSON inválido"));
      }
    });
  });
}

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

// ── Server ───────────────────────────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method = req.method.toUpperCase();

  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET,POST",
      "Access-Control-Allow-Headers": "Content-Type",
    });
    return res.end();
  }

  // POST /api/rsvp — guardar confirmación
  if (pathname === "/api/rsvp" && method === "POST") {
    try {
      const body = await parseBody(req);
      const { name, mesa, status, msg } = body;

      if (!name || !status)
        return jsonResponse(res, 400, {
          ok: false,
          error: "Faltan campos requeridos.",
        });
      if (!["confirm", "decline", "pending"].includes(status))
        return jsonResponse(res, 400, { ok: false, error: "Estado inválido." });

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

      await guests.insertOne(entry);
      return jsonResponse(res, 200, { ok: true, entry });
    } catch (err) {
      return jsonResponse(res, 500, { ok: false, error: err.message });
    }
  }

  // GET /api/guests?pwd=XXX — obtener lista
  if (pathname === "/api/guests" && method === "GET") {
    if (parsed.query.pwd !== ADMIN_PASSWORD)
      return jsonResponse(res, 401, { ok: false, error: "No autorizado." });

    try {
      const list = await guests
        .find({}, { projection: { _id: 0 } })
        .sort({ date: 1 })
        .toArray();
      return jsonResponse(res, 200, { ok: true, guests: list });
    } catch (err) {
      return jsonResponse(res, 500, { ok: false, error: err.message });
    }
  }

  // /invitados → SPA routing
  if (pathname === "/invitados") {
    return serveFile(
      res,
      path.join(PUBLIC_DIR, "index.html"),
      "text/html; charset=utf-8",
    );
  }

  // Archivos estáticos desde /public
  let filePath = path.join(
    PUBLIC_DIR,
    pathname === "/" ? "index.html" : pathname,
  );
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end("Forbidden");
  }

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME[ext] || "application/octet-stream";
  serveFile(res, filePath, mime);
});

// ── Arranque ─────────────────────────────────────────────────────
connectDB()
  .then(() => {
    server.listen(PORT, () => {
      console.log(`  ✦  Servidor corriendo en http://localhost:${PORT}`);
      console.log(`  ✦  Invitados: http://localhost:${PORT}/invitados\n`);
    });
  })
  .catch((err) => {
    console.error("No se pudo conectar a MongoDB:", err.message);
    process.exit(1);
  });
