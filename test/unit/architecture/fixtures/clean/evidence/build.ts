// Fixture only -- deliberately shaped like the real src/evidence -> src/execution
// import the layering rules explicitly permit (evidence/ may read execution/'s
// result types), so test/unit/architecture/rules.test.ts can prove
// .dependency-cruiser.cjs's rules do NOT flag a legitimate import (a true
// negative -- an overly-broad rule would wrongly reject this).
import { run } from "../execution/run.js"

export function build(): string {
  return run()
}
