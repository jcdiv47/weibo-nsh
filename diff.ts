// What changed between two versions of a text, character by character (Chinese has no words to
// split on): the common start and end set aside, a longest common subsequence of the rest.
// Edits are usually a phrase here and there, so the middle stays small; a middle too large to
// compare cheaply shows as replaced whole.

export type Part = { kind: "same" | "added" | "removed"; text: string };

/** Cells of the comparison table past which the middle counts as replaced whole. */
const MAX_CELLS = 2_000_000;

export function diff(before: string, after: string): Part[] {
  const a = [...before];
  const b = [...after];
  let start = 0;
  while (start < a.length && start < b.length && a[start] === b[start]) start++;
  let endA = a.length;
  let endB = b.length;
  while (endA > start && endB > start && a[endA - 1] === b[endB - 1]) endA--, endB--;

  const parts: Part[] = [];
  const push = (kind: Part["kind"], text: string) => {
    if (!text) return;
    const last = parts[parts.length - 1];
    if (last?.kind === kind) last.text += text;
    else parts.push({ kind, text });
  };
  push("same", a.slice(0, start).join(""));

  const midA = a.slice(start, endA);
  const midB = b.slice(start, endB);
  const n = midA.length;
  const m = midB.length;
  if (n * m > MAX_CELLS) {
    push("removed", midA.join(""));
    push("added", midB.join(""));
  } else {
    // lcs[i * (m + 1) + j]: the longest common subsequence of midA[i..] and midB[j..].
    const lcs = new Uint32Array((n + 1) * (m + 1));
    for (let i = n - 1; i >= 0; i--) {
      for (let j = m - 1; j >= 0; j--) {
        lcs[i * (m + 1) + j] =
          midA[i] === midB[j]
            ? lcs[(i + 1) * (m + 1) + j + 1] + 1
            : Math.max(lcs[(i + 1) * (m + 1) + j], lcs[i * (m + 1) + j + 1]);
      }
    }
    let i = 0;
    let j = 0;
    while (i < n && j < m) {
      if (midA[i] === midB[j]) push("same", midA[i++]), j++;
      else if (lcs[(i + 1) * (m + 1) + j] >= lcs[i * (m + 1) + j + 1]) push("removed", midA[i++]);
      else push("added", midB[j++]);
    }
    push("removed", midA.slice(i).join(""));
    push("added", midB.slice(j).join(""));
  }

  push("same", a.slice(endA).join(""));
  return parts;
}
