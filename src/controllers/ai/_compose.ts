/**
 * Backwards-compatibility strip for the proposal-context preamble that
 * `POST /ai/chat` used to weld onto the first user message before
 * forwarding to upstream Sidanclaw. That approach was retired in favour
 * of tool-based grounding (`get_proposal_details` etc.), but rows already
 * stored upstream still carry the preamble and would otherwise render as
 * the user's own bubble in the cgov chat UI.
 *
 * Recognised legacy format:
 *
 *     <context block>\n\n---\n\nUser question: <real user message>
 *
 * Once historical sessions age out (or are migrated upstream), this
 * helper and its caller in `getHistory.ts` can be deleted.
 */

const SEPARATOR = "\n\n---\n\nUser question: ";

export function stripContextPreamble(stored: string): string {
  if (typeof stored !== "string") return stored;
  const idx = stored.indexOf(SEPARATOR);
  if (idx === -1) return stored;
  return stored.slice(idx + SEPARATOR.length);
}
