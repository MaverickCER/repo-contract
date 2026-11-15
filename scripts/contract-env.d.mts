/** The subset of `env` a check of this repository's contract receives (see contract-env.mjs). */
export function scopedEnv(env: NodeJS.ProcessEnv): Record<string, string>
