import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { WebSocketServer } from "ws";
import { config } from "dotenv";
import { ContextSchema, LiveSession } from "./session";
import { AgentHub, AgentError } from "./agent-hub";
import { openAIProvider } from "./provider";
import { understandingReasoningEffort } from "./understanding-agent";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
config({ path: resolve(root, ".env"), quiet: true });
const port = Number(process.env.CANVAS_PORT ?? 5191);
const host = `127.0.0.1:${port}`;
const origin = `http://${host}`;
const token = randomBytes(32).toString("hex");
const agents = new AgentHub();
const authorizedToken = (supplied: string) => Buffer.byteLength(supplied) === Buffer.byteLength(token) && timingSafeEqual(Buffer.from(supplied), Buffer.from(token));
const mime: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".json": "application/json",
  ".png": "image/png",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};
let ready = false;
let vite: import("vite").ViteDevServer | null = null;
const server = createServer(async (req, res) => {
  if (req.headers.host !== host) {
    res.writeHead(403).end("Invalid host");
    return;
  }
  if (!ready) {res.writeHead(503, {"Retry-After":"1"}).end("Sprig is starting.");return;}
  res.setHeader("X-Content-Type-Options", "nosniff");
  const path = new URL(req.url ?? "/", origin).pathname;
  if (path.startsWith("/api/agent")) {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    if ((req.headers.origin && req.headers.origin !== origin) || !authorizedToken((req.headers.authorization ?? "").replace(/^Bearer /, ""))) {
      res.writeHead(403).end(JSON.stringify({error:"Local agent authorization required."})); return;
    }
    try {
      if (req.method === "GET" && path === "/api/agent/boards") {res.end(JSON.stringify({boards:agents.list()})); return;}
      const match = path.match(/^\/api\/agent\/boards\/([a-zA-Z0-9-]+)(\/actions)?$/);
      if (!match) throw new AgentError(404, "Unknown agent endpoint.");
      if (req.method === "GET" && !match[2]) {res.end(JSON.stringify(agents.read(match[1]))); return;}
      if (req.method !== "POST" || !match[2]) throw new AgentError(405, "Use GET to read a board or POST actions to edit it.");
      if (!req.headers["content-type"]?.startsWith("application/json")) throw new AgentError(415, "Use application/json.");
      const chunks: Buffer[] = []; let length = 0;
      for await (const chunk of req) {length += chunk.length; if (length > 100000) throw new AgentError(413, "Agent request exceeds 100 KB."); chunks.push(chunk);}
      const result = await agents.apply(match[1], JSON.parse(Buffer.concat(chunks).toString("utf8")));
      res.end(JSON.stringify(result));
    } catch (err) {res.writeHead(err instanceof AgentError ? err.status : 400).end(JSON.stringify({error:err instanceof Error ? err.message : "Invalid agent action"}));}
    return;
  }
  if (path === "/api/bootstrap") {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        token,
        configured: !!process.env.OPENAI_API_KEY,
        debugProtocol: 1,
        reasoningEffort: understandingReasoningEffort(),
        models: {
          transcription: "gpt-live-transcribe",
          interpretation: /^gpt-[a-z0-9.-]{1,80}$/.test(
            process.env.CANVAS_MODEL ?? "gpt-5.6-luna",
          )
            ? (process.env.CANVAS_MODEL ?? "gpt-5.6-luna")
            : "custom model",
        },
      }),
    );
    return;
  }
  if (path.startsWith("/api/")) {
    res.writeHead(404).end();
    return;
  }
  if (vite) {
    vite.middlewares(req, res);
    return;
  }
  try {
    const dist = resolve(root, "dist");
    let file = resolve(dist, "." + decodeURIComponent(path));
    if (!file.startsWith(dist + sep) && file !== dist) {
      res.writeHead(403).end();
      return;
    }
    if (!extname(file)) file = resolve(dist, "index.html");
    res.setHeader(
      "Content-Type",
      mime[extname(file)] ?? "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch {
    res.writeHead(404).end("Not found");
  }
});
// Claim the port before Vite writes its shared dependency cache. A duplicate
// dev command must fail here, without invalidating the already-running app.
await new Promise<void>((resolve, reject) => {
  server.once("error", reject);
  server.listen(port, "127.0.0.1", () => {server.off("error", reject);resolve();});
});
vite =
  process.env.NODE_ENV === "production" || process.argv.includes("--production")
    ? null
    : await (
        await import("vite")
      ).createServer({
        root,
        cacheDir: resolve(root, "node_modules", `.vite-${port}`),
        server: { middlewareMode: true, ws: { server } },
        appType: "spa",
      });
const wss = new WebSocketServer({ noServer: true, maxPayload: 12500000 });
const control = new WebSocketServer({noServer:true, maxPayload:12500000});
control.on("connection", socket => {
  let id: string | null = null;
  const startup = setTimeout(() => {if (!id) socket.close();}, 10000);
  socket.on("message", data => {
    try {
      const message = JSON.parse(data.toString());
      if (message.type === "register" && !id) {
        id = agents.connect(ContextSchema.parse(message.context), value => {if (socket.readyState === 1) socket.send(JSON.stringify(value));});
        clearTimeout(startup); socket.send(JSON.stringify({type:"registered",id}));
      } else if (message.type === "context" && id) agents.update(id, ContextSchema.parse(message.context));
      else if (message.type === "ack" && id && typeof message.requestId === "string" && typeof message.applied === "boolean")
        agents.acknowledge(id, message.requestId, message.applied, ContextSchema.parse(message.context), typeof message.error === "string" ? message.error.slice(0,1000) : undefined);
      else socket.close(1008, "Invalid control message");
    } catch {socket.close(1008, "Invalid control message");}
  });
  socket.on("close", () => {clearTimeout(startup); if (id) agents.disconnect(id);});
  socket.on("error", () => {socket.close();});
});
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url ?? "/", origin);
  if (url.pathname !== "/api/live" && url.pathname !== "/api/control") return;
  const supplied = url.searchParams.get("token") ?? "";
  const authorized = authorizedToken(supplied);
  if (
    req.headers.host !== host ||
    req.headers.origin !== origin ||
    !authorized
  ) {
    socket.write("HTTP/1.1 403 Forbidden\r\n\r\n");
    socket.destroy();
    return;
  }
  const target = url.pathname === "/api/control" ? control : wss;
  target.handleUpgrade(req, socket, head, (ws) => target.emit("connection", ws, req));
});
wss.on("connection", (socket) => {
  let session: LiveSession | null = null;
  const send = (event: unknown) => {
    if (socket.readyState === 1) socket.send(JSON.stringify(event));
  };
  const startup = setTimeout(() => {
    if (!session) socket.close();
  }, 10000);
  socket.on("message", (data, binary) => {
    try {
      if (binary) {
        session?.audio(Buffer.from(data as Buffer));
        return;
      }
      const message = JSON.parse(data.toString());
      switch (message.type) {
        case "start":
          if (session) throw new Error("Already started");
          if (!process.env.OPENAI_API_KEY) {
            send({
              type: "status",
              state: "error",
              message:
                "Add OPENAI_API_KEY to apps/canvas/.env, then restart the local app.",
            });
            socket.close();
            return;
          }
          session = new LiveSession(
            ContextSchema.parse(message.context),
            openAIProvider(
              process.env.OPENAI_API_KEY,
              process.env.CANVAS_MODEL ?? "gpt-5.6-luna",
            ),
            send,
          );
          if (
            message.input !== undefined &&
            message.input !== "microphone" &&
            message.input !== "text"
          )
            throw new Error("Invalid input mode");
          if (message.resumeTranscript !== undefined) {
            if (typeof message.resumeTranscript !== "string" || message.resumeTranscript.length > 24000) throw new Error("Invalid resume transcript");
            session.resumeTranscript(message.resumeTranscript);
          }
          session.start(message.input ?? "microphone");
          clearTimeout(startup);
          break;
        case "settings":
          session?.configure(message.settings);
          break;
        case "process_now":
          session?.processNow();
          break;
        case "debug_text":
          session?.testText(message.text);
          break;
        case "context":
          session?.update(ContextSchema.parse(message.context));
          break;
        case "ack":
          if (
            typeof message.id !== "string" ||
            typeof message.applied !== "boolean"
          )
            throw new Error("Bad acknowledgement");
          session?.acknowledge(message.id, message.applied);
          break;
        case "stop":
          session?.close();
          socket.close();
          break;
        default:
          throw new Error("Unknown message");
      }
    } catch {
      send({
        type: "status",
        state: "error",
        message: "The session received an invalid update. Your board is safe.",
      });
      session?.close();
      socket.close();
    }
  });
  socket.on("close", () => {
    clearTimeout(startup);
    session?.close();
  });
  socket.on("error", () => {
    clearTimeout(startup);
    session?.close();
  });
});
ready = true;
console.log(`Sprig is ready at ${origin}`);
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => {
    for (const socket of wss.clients) socket.close();
    wss.close();
    for (const socket of control.clients) socket.close();
    control.close();
    server.close();
    void vite?.close().then(() => process.exit(0));
  });
