const { app, BrowserWindow, shell } = require("electron");
const { createReadStream, promises: fs } = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function staticDirectory() {
  return app.isPackaged
    ? path.join(process.resourcesPath, "app-static")
    : path.join(__dirname, "..", "dist");
}

async function startLocalServer() {
  const root = staticDirectory();
  const indexFile = path.join(root, "index.html");
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      const decodedPath = decodeURIComponent(url.pathname);
      const requested = path.resolve(root, `.${decodedPath}`);
      let filePath = requested.startsWith(`${root}${path.sep}`) ? requested : indexFile;
      const stat = await fs.stat(filePath).catch(() => null);
      if (!stat?.isFile()) filePath = indexFile;
      const fileStat = await fs.stat(filePath);
      response.writeHead(200, {
        "Content-Type": MIME_TYPES[path.extname(filePath).toLowerCase()] || "application/octet-stream",
        "Content-Length": fileStat.size,
        "Cache-Control": "no-cache",
      });
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("No se ha podido abrir PDF Maestro.");
    }
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    // Puerto fijo: mantiene estable el origen y, con él, IndexedDB y los proyectos guardados.
    server.listen(41731, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No local port available");
  return { server, url: `http://127.0.0.1:${address.port}` };
}

let localServer;

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  const local = await startLocalServer();
  localServer = local.server;
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 960,
    minHeight: 680,
    title: "PDF Maestro",
    backgroundColor: "#f7f5f2",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(local.url)) void shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event, url) => {
    if (!url.startsWith(local.url)) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });
  await window.loadURL(local.url);
});

app.on("window-all-closed", () => app.quit());
app.on("before-quit", () => localServer?.close());
