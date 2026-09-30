# Stage 715

A dialogue shot stands 0.72 m in front of the face, 0.08 m below it, at 28° field of view. The forward is `yawDir`. A Three.js camera placed on that shot has a view direction within a dot of 0.99 of the face.

Setting the stand to 3 m failed `tests/faceshot.test.ts` once (`expected 3.00 to be less than 1`).

The Deacon's look height is 1.66 × 1.06. Marrow's is 1.6 × 0.93. Those are the hood centres in `client/render/figures.ts`.
