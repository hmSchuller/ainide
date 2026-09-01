export type LineDiffKind = "addition" | "modification" | "deletion";

export interface LineDiffRange {
  kind: LineDiffKind;
  startLine: number;
  endLine: number;
  anchorLine?: number;
}

type DiffOperation = "equal" | "insert" | "delete";

function linesOf(text: string): string[] {
  return text ? text.split(/\r\n|\n|\r/) : [];
}

/** Compare two texts and return changed ranges in the current buffer. */
export function diffLines(baseline: string, current: string): LineDiffRange[] {
  const baselineLines = linesOf(baseline);
  const currentLines = linesOf(current);
  const lcs: number[][] = Array.from({ length: baselineLines.length + 1 }, () => new Array<number>(currentLines.length + 1).fill(0));

  for (let baselineIndex = baselineLines.length - 1; baselineIndex >= 0; baselineIndex -= 1) {
    for (let currentIndex = currentLines.length - 1; currentIndex >= 0; currentIndex -= 1) {
      lcs[baselineIndex]![currentIndex] = baselineLines[baselineIndex] === currentLines[currentIndex]
        ? lcs[baselineIndex + 1]![currentIndex + 1]! + 1
        : Math.max(lcs[baselineIndex + 1]![currentIndex]!, lcs[baselineIndex]![currentIndex + 1]!);
    }
  }

  const operations: DiffOperation[] = [];
  let baselineIndex = 0;
  let currentIndex = 0;
  while (baselineIndex < baselineLines.length || currentIndex < currentLines.length) {
    if (baselineIndex < baselineLines.length && currentIndex < currentLines.length
      && baselineLines[baselineIndex] === currentLines[currentIndex]) {
      operations.push("equal");
      baselineIndex += 1;
      currentIndex += 1;
    } else if (baselineIndex < baselineLines.length
      && (currentIndex === currentLines.length || lcs[baselineIndex + 1]![currentIndex]! >= lcs[baselineIndex]![currentIndex + 1]!)) {
      // Prefer consuming the baseline on ties so repeated lines align consistently.
      operations.push("delete");
      baselineIndex += 1;
    } else {
      operations.push("insert");
      currentIndex += 1;
    }
  }

  const changes: LineDiffRange[] = [];
  currentIndex = 0;
  for (let operationIndex = 0; operationIndex < operations.length;) {
    const operation = operations[operationIndex];
    if (operation === "equal") {
      currentIndex += 1;
      operationIndex += 1;
      continue;
    }

    const startLine = currentIndex + 1;
    let inserted = 0;
    let deleted = 0;
    while (operationIndex < operations.length && operations[operationIndex] !== "equal") {
      if (operations[operationIndex] === "insert") {
        inserted += 1;
        currentIndex += 1;
      } else {
        deleted += 1;
      }
      operationIndex += 1;
    }

    if (inserted > 0 && deleted > 0) {
      changes.push({ kind: "modification", startLine, endLine: currentIndex });
    } else if (inserted > 0) {
      changes.push({ kind: "addition", startLine, endLine: currentIndex });
    } else {
      const anchorLine = Math.max(1, Math.min(startLine, currentLines.length));
      changes.push({ kind: "deletion", startLine: anchorLine, endLine: anchorLine, anchorLine });
    }
  }

  return changes;
}
