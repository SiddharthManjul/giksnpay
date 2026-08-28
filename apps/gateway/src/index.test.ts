import { describe, expect, it } from "vitest";
import { gateway } from "./index";

describe("gateway health", () => {
  it("returns an explicit service status", async () => {
    const response = await gateway.request("/health", undefined, { ENVIRONMENT: "test" });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      service: "mindpay-gateway",
      status: "ok",
    });
  });
});
