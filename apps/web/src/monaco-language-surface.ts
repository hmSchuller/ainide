import type { Monaco } from "@monaco-editor/react";

let configured = false;

export function configureMonacoLanguageSurface(monaco: Monaco): void {
  if (configured) return;

  const { typescript } = monaco.languages;
  const diagnosticsOptions = {
    noSemanticValidation: true,
    noSyntaxValidation: false,
    noSuggestionDiagnostics: true,
  };
  const modeConfiguration = {
    completionItems: false,
    hovers: false,
    definitions: false,
    references: false,
    rename: false,
    signatureHelp: false,
    codeActions: false,
    inlayHints: false,
    diagnostics: true,
  };
  const compilerOptions = {
    allowNonTsExtensions: true,
    experimentalDecorators: true,
    jsx: typescript.JsxEmit.Preserve,
    target: typescript.ScriptTarget.Latest,
  };

  typescript.typescriptDefaults.setCompilerOptions(compilerOptions);
  typescript.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  typescript.typescriptDefaults.setModeConfiguration(modeConfiguration);

  typescript.javascriptDefaults.setCompilerOptions({ ...compilerOptions, allowJs: true });
  typescript.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions);
  typescript.javascriptDefaults.setModeConfiguration(modeConfiguration);

  configured = true;
}
