import type { Monaco } from "@monaco-editor/react";
import { describe, expect, it, vi } from "vitest";
import { configureMonacoLanguageSurface } from "./monaco-language-surface";

interface DefaultsSpy {
  setCompilerOptions: ReturnType<typeof vi.fn>;
  setDiagnosticsOptions: ReturnType<typeof vi.fn>;
  setModeConfiguration: ReturnType<typeof vi.fn>;
}

function defaults(): DefaultsSpy {
  return {
    setCompilerOptions: vi.fn(),
    setDiagnosticsOptions: vi.fn(),
    setModeConfiguration: vi.fn(),
  };
}

function fakeMonaco() {
  const typescriptDefaults = defaults();
  const javascriptDefaults = defaults();
  const jsonDefaults = defaults();
  const cssDefaults = defaults();
  const monaco = {
    languages: {
      typescript: {
        JsxEmit: { Preserve: 1 },
        ScriptTarget: { Latest: 99 },
        typescriptDefaults,
        javascriptDefaults,
      },
      json: { jsonDefaults },
      css: { cssDefaults },
    },
  } as unknown as Monaco;
  return { monaco, typescriptDefaults, javascriptDefaults, jsonDefaults, cssDefaults };
}

describe("Monaco language surface", () => {
  it("configures TypeScript and JavaScript for syntax-only editing", () => {
    const { monaco, typescriptDefaults, javascriptDefaults, jsonDefaults, cssDefaults } = fakeMonaco();

    configureMonacoLanguageSurface(monaco);

    for (const defaults of [typescriptDefaults, javascriptDefaults]) {
      expect(defaults.setDiagnosticsOptions).toHaveBeenCalledWith({
        noSemanticValidation: true,
        noSyntaxValidation: false,
        noSuggestionDiagnostics: true,
      });
      expect(defaults.setModeConfiguration).toHaveBeenCalledWith({
        completionItems: false,
        hovers: false,
        definitions: false,
        references: false,
        rename: false,
        signatureHelp: false,
        codeActions: false,
        inlayHints: false,
        diagnostics: true,
      });
    }
    expect(typescriptDefaults.setCompilerOptions).toHaveBeenCalledWith({
      allowNonTsExtensions: true,
      experimentalDecorators: true,
      jsx: 1,
      target: 99,
    });
    expect(javascriptDefaults.setCompilerOptions).toHaveBeenCalledWith({
      allowNonTsExtensions: true,
      experimentalDecorators: true,
      jsx: 1,
      target: 99,
      allowJs: true,
    });
    expect(jsonDefaults.setCompilerOptions).not.toHaveBeenCalled();
    expect(jsonDefaults.setDiagnosticsOptions).not.toHaveBeenCalled();
    expect(cssDefaults.setCompilerOptions).not.toHaveBeenCalled();
    expect(cssDefaults.setDiagnosticsOptions).not.toHaveBeenCalled();

    const secondaryPane = fakeMonaco();
    configureMonacoLanguageSurface(secondaryPane.monaco);
    expect(secondaryPane.typescriptDefaults.setCompilerOptions).not.toHaveBeenCalled();
    expect(secondaryPane.javascriptDefaults.setCompilerOptions).not.toHaveBeenCalled();
  });
});
