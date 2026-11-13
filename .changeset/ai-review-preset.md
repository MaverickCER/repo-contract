---
"repo-contract": minor
---

`repo-contract/presets` gains `aiReview(options)`, an AI review check, with the `AiReviewOptions`, `AiReviewReply` and `AiReviewFinding` types. It was example code in `examples/demo`; it is now a published preset, Experimental like the rest of the catalog.

- **What is called.** `agent` is your reviewer's command line. The prompt goes at `{prompt}` or as the last argument. `prompt` replaces the default text, or `{ file }` hands the agent a prompt file's path. `files` lists the files to review. `label`, `timeoutMs` (default 10 minutes) and `cwd` are options too.
- **Credentials.** `credentials` takes variables by name and value and passes them through the check's `env`, so they work when the runner sets `inheritEnv: false`. A value never enters the command line, and every reason shows it as `[redacted]`. A credential with no value turns a `pass` into a `warn`.
- **Reading the reply.** The preset parses the whole output as JSON, then the text from its first `{` to its last `}`. When neither gives the `{ findings: [{ rule, file, line, severity, score, reason }], summary: { score } }` shape, it judges `fallback` instead and lists the problems. The default fallback is one `warn` finding, "the reviewer's output could not be parsed", so an unreadable reply never passes silently.
- **Policy.** An `error` finding at or above `errorThreshold` (default `0.8`) fails. Other `warn` and `error` findings, and the default fallback, warn. Only `info` findings pass. Each reason lists the findings with their confidence.
- `repo-contract init` never adds `aiReview`. It lists it under "Not detected", because it needs your agent's command.
- The `examples/demo` AI check now imports the preset. CI replays one more recorded reply, JSON wrapped in prose and a code fence, to prove the first-`{`-to-last-`}` recovery.
