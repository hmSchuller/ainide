import { describe, expect, it } from "vitest";
import { language } from "./file-language";

describe("file language mapping", () => {
  it("maps Swift, Kotlin, and Kotlin script files", () => {
    expect(language("Sources/App.swift")).toBe("swift");
    expect(language("src/Main.kt")).toBe("kotlin");
    expect(language("build.gradle.kts")).toBe("kotlin");
  });

  it("normalizes uppercase extensions and falls back for unknown extensions", () => {
    expect(language("Sources/App.SWIFT")).toBe("swift");
    expect(language("build.KTS")).toBe("kotlin");
    expect(language("README.txt")).toBe("plaintext");
  });
});
