import { describe, expect, it } from "vitest";
import { merchant } from "./index";

describe("SignalWorks health", () => {
  it("returns an explicit service status", async () => {
    const response = await merchant.request("/health", undefined, { ENVIRONMENT: "test" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "signalworks",
      status: "ok",
    });
  });
});
