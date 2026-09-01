import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { ProjectAgentSettings } from "@ainide/shared";
import { ProjectAgentSettingsDialog } from "./ProjectAgentSettingsDialog";

const settings: ProjectAgentSettings = {
  all: [
    { id: "cursor", label: "Cursor" },
    { id: "opencode", label: "OpenCode" },
    { id: "gemini", label: "Gemini" },
  ],
  disabled: ["gemini"],
};

const props = {
  settings,
  loading: false,
  onRetry: () => undefined,
  onToggle: () => undefined,
  onClose: () => undefined,
};

describe("ProjectAgentSettingsDialog", () => {
  it("lists every configured agent and reflects the active project's disabled set", () => {
    const markup = renderToStaticMarkup(<ProjectAgentSettingsDialog {...props} />);
    expect(markup).toContain("Cursor");
    expect(markup).toContain("OpenCode");
    expect(markup).toContain("Gemini");
    expect(markup.match(/Disabled for this project/g)?.length).toBe(1);
    expect(markup.match(/Available in this project/g)?.length).toBe(2);
  });

  it("updates which agents are disabled when the set changes", () => {
    const markup = renderToStaticMarkup(<ProjectAgentSettingsDialog {...props} settings={{ ...settings, disabled: ["cursor", "gemini"] }} />);
    expect(markup.match(/Disabled for this project/g)?.length).toBe(2);
    expect(markup.match(/Available in this project/g)?.length).toBe(1);
  });

  it("shows a configured-empty state when no agents exist", () => {
    const markup = renderToStaticMarkup(<ProjectAgentSettingsDialog {...props} settings={{ all: [], disabled: [] }} />);
    expect(markup).toContain("No ACP providers configured");
  });
});
