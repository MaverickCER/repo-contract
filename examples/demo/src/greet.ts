// Deliberately imperfect, on purpose: this file is what the three checks in
// ../repo-contract.config.ts actually evaluate. Two things about it are
// intentional, not accidental bugs:
//
// 1. The single-quoted string below is valid TypeScript but not
//    Prettier-formatted (Prettier's default is double quotes) -- this is what
//    makes the `format` check fail.
// 2. The `console.log` call is exactly what this demo's own
//    ../eslint.config.ts flags as `no-console: "warn"` -- this is what makes
//    the `lint` check warn, not fail.
//
// Nothing here is broken. `greet()` type-checks cleanly and does exactly what
// it says -- that's what makes the `typecheck` check pass.
export function greet(name: string): string {
  console.log('Greeting', name)
  return `Hello, ${name}!`
}
