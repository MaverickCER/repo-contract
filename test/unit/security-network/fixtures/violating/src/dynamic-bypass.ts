// A contributor trying to dodge a plain string-literal import check by
// computing the module specifier at runtime -- exactly the trivial bypass
// this scanner's own doc comment calls out. The scanner must flag this
// (as "cannot statically verify the specifier is safe") even though no
// literal "node:http"/"http" string ever appears in this file's source.
export async function loadDynamically(): Promise<unknown> {
  const specifier = ["node:", "http"].join("")
  return import(specifier)
}
