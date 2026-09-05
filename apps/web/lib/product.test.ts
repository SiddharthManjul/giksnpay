import { describe, expect, it } from "vitest";
import { API_ORIGIN } from "./api";
import { PRODUCT_NAME } from "./product";

describe("product identity", () => {
  it("uses the canonical product name", () => {
    expect(PRODUCT_NAME).toBe("MindPay");
  });

  it("keeps the local browser and Gateway on the same hostname", () => {
    expect(API_ORIGIN).toBe("http://localhost:8787");
  });
});
