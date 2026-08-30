// A direct, unmodified import of a Node core networking module -- the
// simplest violation category. Never invoked; only its import statement is
// statically scanned (see scan.test.ts).
import http from "node:http"

export function useHttp(): typeof http {
  return http
}
