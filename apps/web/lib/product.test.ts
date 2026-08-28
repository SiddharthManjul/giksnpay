import { describe, expect, it } from "vitest";
import { PRODUCT_NAME } from "./product";

describe("product identity", () => {
  it("uses the canonical product name", () => {
    expect(PRODUCT_NAME).toBe("MindPay");
  });
});
