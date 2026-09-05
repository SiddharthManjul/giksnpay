import { SIGNALWORKS_MCP_TOOL_NAMES } from "@mindpay/contracts";
import type { Miniflare } from "miniflare";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createMerchantApp, type MerchantBindings } from "./index";
import { createSignalWorksTestDatabase } from "./test-database";

describe("SignalWorks remote MCP surface", () => {
  let bindings: MerchantBindings;
  let miniflare: Miniflare;
  const app = createMerchantApp();

  beforeAll(async () => {
    const testDatabase = await createSignalWorksTestDatabase(
      `signalworks-mcp-${crypto.randomUUID()}`,
    );
    miniflare = testDatabase.miniflare;
    bindings = {
      DB: testDatabase.database,
      ENVIRONMENT: "test",
      SIGNALWORKS_KEY_ENCRYPTION_KEY: "A".repeat(43),
      SIGNALWORKS_MACHINE_AUTH_TOKEN: "mindpay_test_machine_token_0000000001",
    };
  });

  afterAll(async () => miniflare.dispose());

  it("discovers exactly the two redemption tools and status tool through MCP", async () => {
    const response = await rpc({ id: 1, jsonrpc: "2.0", method: "tools/list", params: {} });
    expect(response.status).toBe(200);
    const body = parseMcpResponse(await response.text()) as {
      readonly result?: { readonly tools?: readonly { readonly name?: string }[] };
    };
    expect(body.result?.tools?.map((tool) => tool.name).sort()).toEqual(
      [...SIGNALWORKS_MCP_TOOL_NAMES].sort(),
    );
  });

  it("rejects an untrusted Host before the protocol handler", async () => {
    const response = await rpc(
      { id: 2, jsonrpc: "2.0", method: "tools/list", params: {} },
      "attacker.example.com",
    );
    expect(response.status).toBe(403);
  });

  function rpc(body: Readonly<Record<string, unknown>>, host = "merchant-demo.example.com") {
    return Promise.resolve(
      app.request(
        "https://merchant-demo.example.com/mcp",
        {
          body: JSON.stringify(body),
          headers: {
            Accept: "application/json, text/event-stream",
            "Content-Type": "application/json",
            Host: host,
          },
          method: "POST",
        },
        bindings,
      ),
    );
  }
});

function parseMcpResponse(body: string): unknown {
  if (body.trimStart().startsWith("{")) return JSON.parse(body) as unknown;
  const data = body
    .split("\n")
    .find((line) => line.startsWith("data: "))
    ?.slice("data: ".length);
  if (data === undefined) throw new Error("MCP response did not contain a JSON result");
  return JSON.parse(data) as unknown;
}
