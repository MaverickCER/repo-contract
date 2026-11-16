import { describe, it } from "vitest"

describe("R3 entries from exports", () => {
  it.todo("maps . to src/index.ts")
  it.todo("maps ./x to src/x/index.ts when it exists, else src/x.ts")
  it.todo("uses sources over the convention, as env-cap's . -> src/runtime/index.ts")
  it.todo("names each entry by its built file under dist, nested names included")
  it.todo("skips JSON and ./package.json targets")
  it.todo("reads a string exports and a conditions object alike")
  it.todo("returns . alone from main when exports is absent")
  it.todo("honours srcDir")
})
