const languageByExtension: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript", json: "json", css: "css", scss: "scss",
  html: "html", md: "markdown", py: "python", rs: "rust", go: "go", java: "java", sh: "shell", yml: "yaml", yaml: "yaml",
  swift: "swift", kt: "kotlin", kts: "kotlin",
};

export function language(path: string): string {
  const extension = path.split(".").pop()?.toLowerCase() ?? "";
  return languageByExtension[extension] ?? "plaintext";
}
