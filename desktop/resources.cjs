"use strict";

const path = require("node:path");
const fs = require("node:fs/promises");

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".txt": "text/plain; charset=utf-8",
  ".strats": "application/octet-stream"
};

const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline' data:",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "worker-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-src 'none'",
  "form-action 'none'"
].join("; ");

function resolveResource(root, address) {
  const url = new URL(address);
  if (url.protocol !== "stratscope:" || url.host !== "viewer" || url.username || url.password) {
    throw new Error("Unknown application resource origin");
  }
  const pathname = decodeURIComponent(url.pathname);
  if (/[\\\0:]/.test(pathname)) throw new Error("Invalid resource path");
  const filename = path.resolve(root, "." + (pathname === "/" ? "/index.html" : pathname));
  const relative = path.relative(root, filename);
  if (!relative || relative === ".." || relative.startsWith(".." + path.sep) || path.isAbsolute(relative)) {
    throw new Error("Resource is outside the application");
  }
  return filename;
}

function createResourceHandler(root) {
  return async (request) => {
    if (!["GET", "HEAD"].includes(request.method)) return new Response("Method not allowed", {status: 405});
    let filename;
    try {
      filename = resolveResource(root, request.url);
    } catch {
      return new Response("Invalid resource", {status: 400});
    }
    try {
      const bytes = await fs.readFile(filename);
      return new Response(request.method === "HEAD" ? null : bytes, {
        headers: {
          "Content-Type": MIME_TYPES[path.extname(filename)] || "application/octet-stream",
          "Content-Length": String(bytes.byteLength),
          "Content-Security-Policy": CONTENT_SECURITY_POLICY,
          "X-Content-Type-Options": "nosniff",
          "Cache-Control": "no-cache"
        }
      });
    } catch {
      return new Response("Resource not found", {status: 404});
    }
  };
}

module.exports = {createResourceHandler, resolveResource, CONTENT_SECURITY_POLICY};
