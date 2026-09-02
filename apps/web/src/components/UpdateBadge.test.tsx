import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { UpdateBadge } from "./UpdateBadge";

describe("UpdateBadge", () => {
  it("renders nothing when no version is known (failed or disabled check)", () => {
    expect(renderToStaticMarkup(<UpdateBadge version={undefined} />)).toBe("");
  });

  it("renders nothing when already up to date", () => {
    expect(renderToStaticMarkup(<UpdateBadge version={{ current: "v1.0.0", latest: "v1.0.0" }} />)).toBe("");
  });

  it("renders nothing when the local version is newer", () => {
    expect(renderToStaticMarkup(<UpdateBadge version={{ current: "v2.0.0", latest: "v1.0.0" }} />)).toBe("");
  });

  it("shows the available version, release-notes link, and the update hint when a newer release exists", () => {
    const markup = renderToStaticMarkup(
      <UpdateBadge version={{ current: "v1.0.0", latest: "v2.0.0", notesUrl: "https://github.com/hmSchuller/ainide/releases/tag/v2.0.0" }} />,
    );
    expect(markup).toContain("v2.0.0");
    expect(markup).toContain("https://github.com/hmSchuller/ainide/releases/tag/v2.0.0");
    expect(markup).toContain("ainide update");
    expect(markup).toContain('target="_blank"');
  });

  it("still shows the version and hint when no release-notes url is available", () => {
    const markup = renderToStaticMarkup(<UpdateBadge version={{ current: "v1.0.0", latest: "v2.0.0" }} />);
    expect(markup).toContain("v2.0.0");
    expect(markup).toContain("ainide update");
  });
});
