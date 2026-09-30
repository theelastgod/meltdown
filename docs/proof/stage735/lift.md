# Stage 735 — both walls lift the lens

When the flat distance from the face is under 0.22 m, `lensLift` is the rest of that circle plus `FACE_DIP` (0.08 m). The shot normally sits that dip under the face, so adding it back puts the lens above the cloth. A flat distance that already clears the hood, within a millionth of a metre, lifts nothing.

Both sides solid, player 0.25 m in front of the Deacon. The stand is 0.1375 m and the side-step is zero. Without a lift the lens is 0.16 m from the face. With it, the distance is 0.22 m and the camera is above the ordinary dip. An open room at the same range still sits `FACE_DIP` under the face, because the side-step already clears the hood.

Mutation: `lensLift` returned 0. `tests/faceshot.test.ts` failed once: expected 0.16 to be greater than or equal to 0.22.

Restored.
