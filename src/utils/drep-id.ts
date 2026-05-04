import { bech32 } from "bech32";

/**
 * Normalize any accepted DRep identifier to its CIP-129 bech32 form
 * (the form stored in our `Drep` table and returned by Koios).
 *
 * Two on-chain identifier conventions exist for the same DRep:
 * - **CIP-129** — 29-byte payload: 1-byte header + 28-byte credential hash.
 *   Header high nibble = 0x2 (DRep), low nibble = 0x2 (key) / 0x3 (script).
 *   Bech32 with HRP "drep". Examples: `drep1y…` (key), `drep1u…` (script).
 * - **CIP-105** — 28-byte raw credential hash, bech32 with HRP `drep`
 *   (always a key hash; scripts use `drep_script`). Older form still
 *   produced by some tooling and frequently emitted by LLMs.
 *
 * Returns:
 * - the canonical CIP-129 string for the same hash bytes when input is a
 *   recognised CIP-105 key hash, or
 * - the input unchanged when it already is CIP-129 or any other form
 *   (raw hex, unknown HRP, garbage) — let the caller's existence check
 *   fail naturally rather than guess.
 *
 * Defensive: never throws. Bech32 decode failures fall back to the
 * input string so a malformed id still surfaces as a clean 404 rather
 * than a 500.
 */
export function normalizeDrepIdToCip129(input: string): string {
  if (typeof input !== "string" || input.length === 0) return input;

  let decoded;
  try {
    decoded = bech32.decode(input.toLowerCase(), 256);
  } catch {
    return input;
  }

  // Only HRP `drep` (key hash). `drep_script` script-hash inputs we
  // pass through — converting them needs the 0x23 header and we don't
  // currently see those produced by upstreams; keep this narrow until
  // we do.
  if (decoded.prefix !== "drep") return input;

  const bytes = bech32.fromWords(decoded.words);

  // Already CIP-129: 29 bytes, first byte is the DRep header (0x22 key,
  // 0x23 script). Pass through untouched — re-encoding would round-trip
  // identically but the no-op is cheaper and preserves the caller's
  // exact string.
  if (bytes.length === 29 && (bytes[0] === 0x22 || bytes[0] === 0x23)) {
    return input;
  }

  // CIP-105 key hash (28 raw bytes). Prepend the DRep+key header byte
  // (0x22) and re-encode under the same `drep` HRP.
  if (bytes.length === 28) {
    const cip129 = [0x22, ...bytes];
    try {
      return bech32.encode("drep", bech32.toWords(cip129), 256);
    } catch {
      return input;
    }
  }

  return input;
}
