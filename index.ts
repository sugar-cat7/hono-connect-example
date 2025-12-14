import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createSecureServer } from "node:http2";
import { readFileSync } from "node:fs";
import type { ConnectRouter } from "@connectrpc/connect";
import { create } from "@bufbuild/protobuf";
import type { Http2Bindings, HttpBindings } from "@hono/node-server";
import {
  ElizaService,
  SayResponseSchema,
  type SayRequest,
} from "./gen/connectrpc/eliza/v1/eliza_pb";
import {
  honoConnectMiddleware,
  createHonoContextKey,
} from "./lib/middleware";
import { requestId, type RequestIdVariables } from "hono/request-id";

export type HonoEnv = {
  Bindings: HttpBindings | Http2Bindings;
} & RequestIdVariables;

const honoContextKey = createHonoContextKey<HonoEnv>();

const app = new Hono<HonoEnv>();
app.use("*", requestId());

// Connect RPC
app.use(
  "/connectrpc*",
  honoConnectMiddleware({
    honoContextKey,
    routes(router: ConnectRouter) {
      router.service(ElizaService, {
        say(req: SayRequest, ctx) {
          const honoCtx = ctx.values.get(honoContextKey);
          const reqId = honoCtx?.get("requestId");
          console.log("Request ID from Hono:", reqId);

          return create(SayResponseSchema, {
            sentence: `You said: "${req.sentence}" (requestId: ${reqId})`,
          });
        },
      });
    },
  })
);

app.get("/", (c) => {
  return c.text("Hello Hono with Connect RPC over HTTP/2!");
});

app.get("/api/users", (c) => { return c.json({ users: [{ id: 1, name: "John Doe" }, { id: 2, name: "Jane Doe" }] }); });

serve(
  {
    fetch: app.fetch,
    port: 3000,
    createServer: createSecureServer,
    serverOptions: {
        key: readFileSync("certs/server.key"),
        cert: readFileSync("certs/server.crt"),
        allowHTTP1: true,
    },
  },
  (info) => {
    console.log(`HTTP/2 Server is running on https://localhost:${info.port}`);
    console.log(
      `Connect RPC endpoint: https://localhost:${info.port}/connectrpc.eliza.v1.ElizaService/Say`
    );
    console.log("\nTest with curl:");
    console.log(
      `curl -k --http2 -X POST https://localhost:${info.port}/connectrpc.eliza.v1.ElizaService/Say -H "Content-Type: application/json" -d '{"sentence": "Hello!"}'`
    );
    console.log("\nTest with grpcurl:");
    console.log(
      `grpcurl -insecure -protoset eliza.protoset -d '{"sentence":"Hello!"}' localhost:${info.port} connectrpc.eliza.v1.ElizaService/Say`
    );
  }
);
