/** Fields of an Instagram `status: "fail"` body that tell a rate limit apart from an ordinary error. */
export type FailBody = { message?: unknown; spam?: unknown; feedback_title?: unknown };

/**
 * True only for Instagram's real "slow down" answers: `feedback_required` (action block),
 * `checkpoint_required` (verification challenge), "Please wait a few minutes", or a body flagged `spam`.
 * Other failures, like a missing post or a private account, must not trigger the cooldown.
 */
export function isRateLimited(body: FailBody | null | undefined): boolean {
  if (!body) return false;
  if (body.spam === true) return true;
  const msg = typeof body.message === 'string' ? body.message : '';
  return /^(feedback_required|checkpoint_required|challenge_required)$/i.test(msg.trim()) || /please wait a few minutes/i.test(msg);
}

/** True when Instagram sent a request to its "verify it's you" or suspended-account page instead of answering. */
export function isChallengeUrl(url: string): boolean {
  try {
    return /^\/(challenge|accounts\/suspended)\//.test(new URL(url).pathname);
  } catch {
    return false;
  }
}
