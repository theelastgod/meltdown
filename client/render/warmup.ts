/**
 * Keeping a pooled effect drawn until its shader is really compiled (Stage 158).
 *
 * The tracer and spark pools are hidden while empty, which is right — two draw calls of degenerate
 * geometry are two draw calls — and it is why the first trigger pull of a session cost a quarter of
 * a second. Three.js compiles a material's program the first time the object is drawn, so a pool
 * nothing has drawn yet has no program, and the shot that makes it visible pays for one.
 *
 * The renderer's constructor already warms the scene: it shows both pools and calls `compile`. That
 * did not help, and the cache keys say exactly why. The two programs compiled on the first shot
 * differ from two the warm-up had already built by one field of the key — `1,7` against `1,6`, the
 * scene's point-light count. The warm-up runs while the lights are still being built, so the
 * programs it compiles are for a scene the game never draws, and the real ones are compiled on the
 * frame that first needs them. The comment above that `compile` call warns about this exact trap
 * for a different field of the same key, the output colour space, and fixes it by binding the
 * buffer the scene is drawn into. The lights are one field over.
 *
 * So rather than compile earlier against a guess at the final state, the pools stay drawn for the
 * first frames of real rendering, where the state is whatever the game actually draws with. The
 * geometry is degenerate then — zero-length segments and instances scaled to nothing — so the
 * frames cost two draw calls of nothing and show nothing, at load, where a frame is already slow.
 */

/**
 * How many drawn frames a pool is held visible for.
 *
 * One was measured to be enough: with a single warm frame the first burst of a session compiles no
 * program and its worst frame is 79 ms against a 61 ms median. Two is margin, for a driver that
 * creates the program on the frame the object is drawn and links it on first use — the 308 ms frame
 * measured was the one *after* the frame that made the program, which is what that would look like,
 * though this runner does not need the second frame to avoid it. The margin is two draw calls of
 * degenerate geometry on one more frame at load, so it is bought rather than argued about.
 */
export const WARM_FRAMES = 2;

/** Whether a pool is drawn this frame: because it has something to show, or because it is warming. */
export function drawPool(live: boolean, framesLeft: number): boolean {
  return live || framesLeft > 0;
}

/** The warm counter after one drawn frame. Never below zero, so it cannot start warming again. */
export function warmStep(framesLeft: number): number {
  return framesLeft > 0 ? framesLeft - 1 : 0;
}
