#!/usr/bin/env node
/* eslint-disable no-console */

const http = require("http");
const fs = require("fs");
const path = require("path");

function parseIntOr(value, fallback) {
  const n = Number.parseInt(String(value || ""), 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseArgs(argv) {
  const out = {
    host: "127.0.0.1",
    port: 4173,
    dir: process.cwd(),
  };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = String(argv[i] || "").trim();
    if (!arg) continue;

    if ((arg === "--port" || arg === "-p") && argv[i + 1]) {
      out.port = parseIntOr(argv[i + 1], out.port);
      i += 1;
      continue;
    }

    if ((arg === "--host" || arg === "--bind") && argv[i + 1]) {
      out.host = String(argv[i + 1] || "").trim() || out.host;
      i += 1;
      continue;
    }

    if ((arg === "--dir" || arg === "-d") && argv[i + 1]) {
      out.dir = String(argv[i + 1] || "").trim() || out.dir;
      i += 1;
      continue;
    }
  }

  return out;
}

const MIME = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".txt", "text/plain; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".woff2", "font/woff2"],
  [".woff", "font/woff"],
  [".ttf", "font/ttf"],
]);

function contentTypeFor(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME.get(ext) || "application/octet-stream";
}

function safeResolve(rootDir, urlPath) {
  const rawPath = String(urlPath || "/");
  let decoded = rawPath;
  try {
    decoded = decodeURIComponent(rawPath);
  } catch (_) {
    decoded = rawPath;
  }

  // Trim leading slashes so path.resolve treats it as relative.
  let rel = decoded.replace(/^\/+/, "");
  if (!rel) rel = "index.html";
  if (rel.endsWith("/")) rel = rel + "index.html";

  const resolvedRoot = path.resolve(rootDir);
  const resolvedFile = path.resolve(resolvedRoot, rel);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : resolvedRoot + path.sep;
  if (!(resolvedFile === resolvedRoot || resolvedFile.startsWith(rootWithSep))) {
    return null;
  }
  return resolvedFile;
}

function send(res, status, headers, body) {
  res.writeHead(status, headers);
  res.end(body);
}

function main() {
  const opts = parseArgs(process.argv);
  const rootDir = path.resolve(opts.dir);

  const server = http.createServer((req, res) => {
    try {
      const host = String(req.headers.host || `${opts.host}:${opts.port}`);
      const url = new URL(String(req.url || "/"), `http://${host}`);

      const filePath = safeResolve(rootDir, url.pathname);
      if (!filePath) {
        send(
          res,
          400,
          { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" },
          "Bad request",
        );
        return;
      }

      fs.stat(filePath, (statErr, stat) => {
        if (statErr || !stat || !stat.isFile()) {
          // Minimal SPA fallback: if the request is a "route" (no file extension), serve index.html.
          const hasExt = path.extname(url.pathname || "").length > 0;
          if (!hasExt) {
            const indexPath = path.resolve(rootDir, "index.html");
            fs.readFile(indexPath, (idxErr, buf) => {
              if (idxErr) {
                send(res, 404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, "Not found");
                return;
              }
              send(
                res,
                200,
                { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
                buf,
              );
            });
            return;
          }

          send(res, 404, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, "Not found");
          return;
        }

        res.writeHead(200, {
          "content-type": contentTypeFor(filePath),
          "cache-control": "no-store",
        });
        fs.createReadStream(filePath).pipe(res);
      });
    } catch (_) {
      send(res, 500, { "content-type": "text/plain; charset=utf-8", "cache-control": "no-store" }, "Server error");
    }
  });

  server.listen(opts.port, opts.host, () => {
    console.log(`[static-server] serving ${rootDir} at http://${opts.host}:${opts.port}`);
  });

  const shutdown = () => {
    try {
      server.close(() => process.exit(0));
    } catch (_) {
      process.exit(0);
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

main();

