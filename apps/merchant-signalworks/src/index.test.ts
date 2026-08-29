import { describe, expect, it } from "vitest";
import { merchant } from "./index";

const bindings = {
  DB: {} as D1Database,
  ENVIRONMENT: "test",
  SIGNALWORKS_KEY_ENCRYPTION_KEY: "A".repeat(43),
};

describe("SignalWorks health", () => {
  it("returns an explicit service status", async () => {
    const response = await merchant.request("/health", undefined, bindings);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "signalworks",
      status: "ok",
    });
  });
});
