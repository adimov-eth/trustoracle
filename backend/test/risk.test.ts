import { expect, test, describe } from "bun:test";
import {
  riskLevelFromNumber,
  riskLevelToNumber,
  parseRiskLevelInput,
  parseRiskLevelNumber
} from "../src/lib/risk";

describe("Risk Level Utilities", () => {
  describe("riskLevelFromNumber", () => {
    test("converts 0 to UNKNOWN", () => {
      expect(riskLevelFromNumber(0)).toBe("UNKNOWN");
    });

    test("converts 1 to GREEN", () => {
      expect(riskLevelFromNumber(1)).toBe("GREEN");
    });

    test("converts 2 to YELLOW", () => {
      expect(riskLevelFromNumber(2)).toBe("YELLOW");
    });

    test("converts 3 to RED", () => {
      expect(riskLevelFromNumber(3)).toBe("RED");
    });

    test("converts invalid numbers to UNKNOWN", () => {
      expect(riskLevelFromNumber(4)).toBe("UNKNOWN");
      expect(riskLevelFromNumber(-1)).toBe("UNKNOWN");
      expect(riskLevelFromNumber(100)).toBe("UNKNOWN");
    });
  });

  describe("riskLevelToNumber", () => {
    test("converts UNKNOWN to 0", () => {
      expect(riskLevelToNumber("UNKNOWN")).toBe(0);
    });

    test("converts GREEN to 1", () => {
      expect(riskLevelToNumber("GREEN")).toBe(1);
    });

    test("converts YELLOW to 2", () => {
      expect(riskLevelToNumber("YELLOW")).toBe(2);
    });

    test("converts RED to 3", () => {
      expect(riskLevelToNumber("RED")).toBe(3);
    });
  });

  describe("parseRiskLevelInput", () => {
    test("parses number inputs", () => {
      expect(parseRiskLevelInput(0)).toBe("UNKNOWN");
      expect(parseRiskLevelInput(1)).toBe("GREEN");
      expect(parseRiskLevelInput(2)).toBe("YELLOW");
      expect(parseRiskLevelInput(3)).toBe("RED");
    });

    test("parses string number inputs", () => {
      expect(parseRiskLevelInput("0")).toBe("UNKNOWN");
      expect(parseRiskLevelInput("1")).toBe("GREEN");
      expect(parseRiskLevelInput("2")).toBe("YELLOW");
      expect(parseRiskLevelInput("3")).toBe("RED");
    });

    test("parses string name inputs (case insensitive)", () => {
      expect(parseRiskLevelInput("GREEN")).toBe("GREEN");
      expect(parseRiskLevelInput("green")).toBe("GREEN");
      expect(parseRiskLevelInput("Green")).toBe("GREEN");
      expect(parseRiskLevelInput("YELLOW")).toBe("YELLOW");
      expect(parseRiskLevelInput("RED")).toBe("RED");
      expect(parseRiskLevelInput("UNKNOWN")).toBe("UNKNOWN");
    });

    test("handles whitespace", () => {
      expect(parseRiskLevelInput("  GREEN  ")).toBe("GREEN");
      expect(parseRiskLevelInput(" 1 ")).toBe("GREEN");
    });

    test("returns null for invalid inputs", () => {
      expect(parseRiskLevelInput(4)).toBeNull();
      expect(parseRiskLevelInput(-1)).toBeNull();
      expect(parseRiskLevelInput("INVALID")).toBeNull();
      expect(parseRiskLevelInput("")).toBeNull();
      expect(parseRiskLevelInput(null)).toBeNull();
      expect(parseRiskLevelInput(undefined)).toBeNull();
      expect(parseRiskLevelInput({})).toBeNull();
    });
  });

  describe("parseRiskLevelNumber", () => {
    test("returns number for valid inputs", () => {
      expect(parseRiskLevelNumber("GREEN")).toBe(1);
      expect(parseRiskLevelNumber(2)).toBe(2);
      expect(parseRiskLevelNumber("red")).toBe(3);
    });

    test("returns null for invalid inputs", () => {
      expect(parseRiskLevelNumber("INVALID")).toBeNull();
      expect(parseRiskLevelNumber(99)).toBeNull();
    });
  });
});
