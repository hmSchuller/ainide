import { isNewerRelease, type VersionInfo } from "@ainide/shared";

export function UpdateBadge({ version }: { version?: VersionInfo }) {
  if (!version || !isNewerRelease(version.latest, version.current)) return null;
  const label = (
    <>
      <span className="update-pip" aria-hidden="true" />
      <span>ainide {version.latest} available</span>
      <span className="update-hint">{"· run “ainide update”, then restart"}</span>
    </>
  );
  if (version.notesUrl) {
    return (
      <a className="update-badge" href={version.notesUrl} target="_blank" rel="noreferrer">
        {label}
      </a>
    );
  }
  return <span className="update-badge">{label}</span>;
}
