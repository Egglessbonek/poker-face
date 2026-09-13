import { describe, expect, it } from "vitest";
import { FEATURED_MODEL_IDS, groupCatalogByProvider, modelSpeed, OPENROUTER_ID, TIERS, tierOf, type CatalogModel } from "@/lib/llm/models";

describe("tiers", () => {
  it("offers a casual and a pro table", () => {
    expect(TIERS.map((tier) => tier.id)).toEqual(["casual", "pro"]);
    for (const tier of TIERS) {
      expect(tier.label).toBeTruthy();
      expect(tier.blurb).toBeTruthy();
    }
  });

  it("lists well-formed OpenRouter ids and puts no model in two tiers", () => {
    const seen = new Set<string>();
    for (const tier of TIERS) {
      for (const id of tier.modelIds) {
        expect(id).toMatch(OPENROUTER_ID);
        expect(seen.has(id)).toBe(false);
        seen.add(id);
      }
    }
  });

  it("seats regulars first, so presets land on the picker's shortcuts", () => {
    for (const tier of TIERS) {
      for (const id of tier.modelIds.slice(0, 3)) expect(FEATURED_MODEL_IDS).toContain(id);
    }
  });

  it("tierOf answers for tier members and nobody else", () => {
    expect(tierOf("google/gemini-3.8-flash")).toBe("casual");
    expect(tierOf("qwen/qwen3.8-flash")).toBe("casual");
    expect(tierOf("anthropic/claude-sonnet-5")).toBe("pro");
    expect(tierOf("moonshotai/kimi-k2.6")).toBe("pro");
    expect(tierOf("mistralai/mistral-large")).toBeUndefined();
    expect(tierOf("")).toBeUndefined();
  });

  it("describes configured model tiers as product-speed labels", () => {
    expect(modelSpeed("google/gemini-3.8-flash")).toBe("Fast");
    expect(modelSpeed("anthropic/claude-sonnet-5")).toBe("Deliberate");
    expect(modelSpeed("mistralai/mistral-large")).toBe("Standard");
  });

  it("groups the catalog alphabetically by provider and model without mutating it", () => {
    const model = (id: string, name: string, vendor: string): CatalogModel => ({ id, name, vendor, contextLength: 0, promptPerM: 0, completionPerM: 0 });
    const catalog = [model("z/two", "Zulu", "Zeta"), model("a/two", "Beta", "Alpha"), model("a/one", "Able", "Alpha")];

    expect(groupCatalogByProvider(catalog).map((group) => [group.provider, group.models.map((entry) => entry.name)])).toEqual([
      ["Alpha", ["Able", "Beta"]],
      ["Zeta", ["Zulu"]],
    ]);
    expect(catalog.map((entry) => entry.name)).toEqual(["Zulu", "Beta", "Able"]);
  });
});
