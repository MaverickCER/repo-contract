/** What `notify` calls when nobody asked to be told. */
function ignore(): void {
  // Nobody asked to be told.
}

/**
 * Tells a reporting hook (`onEvidence`, `onVerdict`) something, without letting the hook change what a run does: a hook
 * that throws is ignored, and so is an `async` hook whose promise rejects (left alone, it would be an unhandled
 * rejection, which ends a Node process). Its return value is never read, and it is not waited for.
 * @param hook - the hook the caller of `runRepoContract` passed, if any.
 * @param args - what to tell it.
 */
export function notify<TArgs extends readonly unknown[]>(
  hook: (...args: TArgs) => unknown = ignore,
  ...args: TArgs
): void {
  try {
    void Promise.resolve(hook(...args)).catch(ignore)
  } catch {
    // A reporting hook must never change what a run does.
  }
}
