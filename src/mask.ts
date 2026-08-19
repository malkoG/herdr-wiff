/**
 * Replaces every occurrence of a secret with a fixed placeholder before text reaches a
 * notification, log, or error message. Call this on any wiff/gh output that ran with a token in
 * its env — stderr from a failed `forge pull`/`forge push` can otherwise echo it back verbatim.
 */
export function maskSecret(text: string, secret: string | undefined): string {
  if (!secret) return text;
  return text.split(secret).join("***");
}
