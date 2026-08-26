import type { ReviewScope } from "@ainide/shared";
import { useAppStore } from "../store";

interface ReviewSurfaceProps {
  scope: ReviewScope;
  onScopeChange: (scope: ReviewScope) => void;
  onStart: () => void;
}

export function ReviewSurface({ scope, onScopeChange, onStart }: ReviewSurfaceProps) {
  const review = useAppStore((state) => state.review);
  const git = useAppStore((state) => state.git);
  return <section className="review-surface">
    <header className="review-header"><div><p className="eyebrow">REVIEW CHANGES</p><strong>{git?.summary.filesChanged ?? 0} files changed</strong></div><div className="review-controls"><label htmlFor="review-scope">Scope</label><select id="review-scope" value={scope} onChange={(event) => onScopeChange(event.target.value as ReviewScope)}><option value="working-tree">Working tree</option><option value="staged">Staged</option><option value="last-commit">Last commit</option><option value="branch-vs-main">Branch vs main</option></select><button onClick={onStart}>Restart review</button></div></header>
    {review.url ? <iframe title="Difit review" src={review.url} /> : <div className="review-empty">
      <div className="review-icon">◒</div>
      <p className="eyebrow">REVIEW SURFACE</p>
      <h2>{review.loading ? "Starting review..." : "No review surface available"}</h2>
      <p className="muted">{review.message ?? (git?.isRepository ? "Difit did not return a review URL for this repository." : "Review requires a Git repository and Difit.")}</p>
      <div className="review-summary"><b>{git?.branch ?? "No branch"}</b><span>{git?.summary.filesChanged ?? 0} changed</span><span>+{git?.summary.insertions ?? 0} / −{git?.summary.deletions ?? 0}</span></div>
    </div>}
  </section>;
}
