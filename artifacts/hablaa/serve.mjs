import { createServer } from "node:http";
import { Buffer } from "node:buffer";
import startServer from "./dist/server/server.js";

const rawPort = process.env.PORT ?? "3000";
const port = Number(rawPort);

if (!Number.isInteger(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

function requestUrl(req) {
  const forwardedHost = req.headers["x-forwarded-host"] ?? req.headers.host ?? "localhost";
  const forwardedProto = req.headers["x-forwarded-proto"] ?? "http";
  const host = String(forwardedHost).split(",")[0].trim();
  const protocol = String(forwardedProto).split(",")[0].trim();
  return new URL(req.url ?? "/", `${protocol}://${host}`);
}

async function toWebRequest(req) {
  const headers = new Headers();
  for (const [name, value] of Object.entries(req.headers)) {
    if (Array.isArray(value)) headers.set(name, value.join(", "));
    else if (value !== undefined) headers.set(name, value);
  }

  const method = req.method ?? "GET";
  const init = { method, headers };
  if (method !== "GET" && method !== "HEAD") {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    init.body = Buffer.concat(chunks);
  }

  return new Request(requestUrl(req), init);
}

const server = createServer(async (req, res) => {
  try {
    const request = await toWebRequest(req);
    const response = await startServer.fetch(request, process.env, {});

    response.headers.forEach((value, name) => {
      if (name.toLowerCase() !== "set-cookie") res.setHeader(name, value);
    });
    const cookies = response.headers.getSetCookie?.();
    if (cookies?.length) res.setHeader("set-cookie", cookies);
    res.statusCode = response.status;

    if (req.method === "HEAD" || !response.body) {
      res.end();
      return;
    }

    const reader = response.body.getReader();
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!res.write(Buffer.from(value))) {
        await new Promise((resolve) => res.once("drain", resolve));
      }
    }
    res.end();
  } catch (error) {
    console.error("Hablaa request failed:", error);
    if (res.headersSent) {
      res.destroy(error);
    } else {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Internal server error");
    }
  }
});

server.listen(port, "0.0.0.0", () => {
  console.log(`Hablaa server listening on port ${port}`);
});