import { describe, expect, it } from "vitest";
import { holdFor } from "./import.js";
import { formatBySlug } from "../formats.js";
import { testFormats } from "../__testutil__/formats.js";

const f = (slug: string) => formatBySlug(testFormats(), slug);

describe("plan item holds (D51)", () => {
  it("never holds an ordinary editorial format", () => {
    expect(holdFor(f("deep-dive"), "x")).toBeUndefined();
    expect(holdFor(f("comparison-concept"), "x")).toBeUndefined();
  });

  it("holds vendor formats for a hand send and sign-off", () => {
    for (const s of ["tools-listicle", "alternatives", "comparison-vendor"]) {
      expect(holdFor(f(s), "x")?.kind).toBe("signoff");
    }
  });

  it("holds product-fact formats until their fact sheet exists", () => {
    const held = holdFor(f("integration-page"), "entra-id-integration");
    expect(held).toMatchObject({ kind: "fact_sheet", requires: "context/product/integration-page/entra-id-integration.md" });
    expect(holdFor(f("integration-page"), "entra-id-integration", (p) => p === held?.requires)).toBeUndefined();
    expect(holdFor(f("original-research"), "index-2026")?.kind).toBe("dataset");
  });

  it("marks offer pages as never produced", () => {
    expect(holdFor(f("offer-landing-page"), "x")?.kind).toBe("not_producible");
  });
});
