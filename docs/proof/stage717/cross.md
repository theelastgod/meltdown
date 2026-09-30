# Stage 717 — a second face fades over the first

`platePass`:

- no next plate → `off`
- same plate → `hold`
- a plate after another plate → `cross`
- a plate after nothing → `zoom`

Deacon then Marrow is a cross. The same Deacon plate holds.

The plate is two layers. The incoming one fades from opacity 0 to 1 while it zooms from 1.05 to 1.85. On a cross the layer underneath keeps its `in` class. On a first zoom it does not.

Mutation: a change of face returned `zoom`. `tests/faceplate.test.ts` failed once: expected 'zoom' to be 'cross'.

Restored. A change of face returns `cross`.
