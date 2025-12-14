import type { JsonValue } from "@bufbuild/protobuf";
import {
  createConnectRouter,
  Code,
  ConnectError,
  createContextKey,
  createContextValues,
} from "@connectrpc/connect";
import type {
  ConnectRouter,
  ConnectRouterOptions,
} from "@connectrpc/connect";
import type { UniversalHandler } from "@connectrpc/connect/protocol";
import {
  compressionBrotli,
  compressionGzip,
  universalRequestFromNodeRequest,
  universalResponseToNodeResponse,
} from "@connectrpc/connect-node";
import { createMiddleware } from "hono/factory";
import type { Context, Env } from "hono";
import type { Http2Bindings, HttpBindings } from "@hono/node-server";

type NodeServerBindings = Http2Bindings | HttpBindings;

/**
 * @example
 * ```ts
 * type MyEnv = { Bindings: Http2Bindings } & RequestIdVariables;
 * const honoContextKey = createHonoContextKey<MyEnv>();
 * ```
 */
export function createHonoContextKey<E extends Env>() {
  return createContextKey<Context<E> | undefined>(undefined);
}

interface HonoConnectMiddlewareOptions<E extends Env & { Bindings: NodeServerBindings }> extends ConnectRouterOptions {
  /**
   * Route definitions. We recommend the following pattern:
   *
   * Create a file `connect.ts` with a default export such as this:
   *
   * ```ts
   * import {ConnectRouter} from "@connectrpc/connect";
   *
   * export default (router: ConnectRouter) => {
   *   router.service(ElizaService, {});
   * }
   * ```
   *
   * Then pass this function here.
   */
  routes: (router: ConnectRouter) => void;

  /**
   * Serve all handlers under this prefix. For example, the prefix "/something"
   * will serve the RPC foo.FooService/Bar under "/something/foo.FooService/Bar".
   * Note that many gRPC client implementations do not allow for prefixes.
   */
  requestPathPrefix?: string;

  /**
   * Context key to store the Hono context.
   * Create one using `createHonoContextKey<YourEnv>()`.
   */
  honoContextKey: ReturnType<typeof createHonoContextKey<E>>;
}

/**
 * Adds your Connect RPCs to a Hono server.
 */
export function honoConnectMiddleware<E extends Env & { Bindings: NodeServerBindings }>(
  options: HonoConnectMiddlewareOptions<E>
) {
  if (options.acceptCompression === undefined) {
    options.acceptCompression = [compressionGzip, compressionBrotli];
  }
  const router = createConnectRouter(options);
  options.routes(router);
  const prefix = options.requestPathPrefix ?? "";
  const paths = new Map<string, UniversalHandler>();
  for (const uHandler of router.handlers) {
    paths.set(prefix + uHandler.requestPath, uHandler);
  }

  return createMiddleware<E>(async (c, next) => {
    // Strip the query parameter when matching paths.
    const uHandler = paths.get(c.req.path);
    if (!uHandler) {
      return next();
    }
    const { incoming, outgoing } = c.env;
    const uReq = universalRequestFromNodeRequest(
      incoming,
      outgoing,
      getPreparsedBody(c),
      createContextValues().set(options.honoContextKey, c)
    );
    try {
      const uRes = await uHandler(uReq);
      await universalResponseToNodeResponse(uRes, outgoing);
    } catch (reason) {
      if (ConnectError.from(reason).code == Code.Aborted) {
        return;
      }
      // eslint-disable-next-line no-console
      console.error(
        `handler for rpc ${uHandler.method.name} of ${uHandler.service.typeName} failed`,
        reason
      );
    }
  });
}

/**
 * Get a pre-parsed JSON value from the request object, or undefined if
 * there is none.
 *
 * This supports body-parser style middleware that may have already parsed
 * the request body.
 */
function getPreparsedBody<E extends Env>(c: Context<E>): JsonValue | undefined {
  // Check if body was already parsed by another middleware
  const body = (c.req.raw as unknown as { body?: JsonValue }).body;
  // We intentionally treat null as not set.
  if (body === null || body === undefined) {
    return undefined;
  }
  return body;
}
