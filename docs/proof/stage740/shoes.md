# Stage 740 — shoes

A crowd of 4, seed 3. Shoe instance colour r < 0.15 (`0x14110e`). Arm instance colour r = 1.

Mutation: delete `paintCitizenLimbs(this.limbs, count)` in `client/render/life.ts`. `tests/character.test.ts` "a shoe is darker than the coat it hangs under" failed once (`InstancedMesh.getColorAt` on a null instance colour). The call was put back.
