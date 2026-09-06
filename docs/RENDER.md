# MELTDOWN — the frame budget

**Scope.** What the renderer costs per frame, and what it leaves behind. Reviewed at commit
`d7a6439`, fixed in Stage 21. `npm run probe:frame` runs the checks.

**Status.** One finding, in eight places. It is the kind that never shows up as a bug report,
because a leaked GPU buffer renders nothing and throws nothing — it accumulates until the tab is
slow, and that gets blamed on browsers.

---

## 1. What was already measured

Draw calls and triangles have been budgeted since Stage 9 (`probe:city`: ≤ 180 calls and ≤ 200k
triangles per district; ≤ 230 and ≤ 260k with city life). The sim was measured for this review and
is healthy:

| | |
| --- | ---: |
| a full 12-player room, one tick | **429 µs** — 2.6% of a core at 60 Hz |
| the client's own prediction, one tick | **46 µs** |
| retained heap after GC, per tick | **51 bytes** |

The first measurement of that was wrong and worth recording: it reported 5.3 KB retained a tick and
looked like a serious leak. The harness had never called `drainEvents()`, which the room and the
client both do every tick, so the finding was the harness's own event backlog. A measurement that
does not do what the caller does is measuring itself.

## 2. The finding: the renderer never released what it removed — HIGH

Removing an `Object3D` from a scene does not free its GPU buffers. Three.js releases them only on
`geometry.dispose()` and `material.dispose()`, and nothing in the scene graph reminds you. So the
natural way to write it —

```ts
this.scene.remove(e.group);
this.entities.delete(id);
```

— leaks every time, and the renderer did exactly this in **eight** places:

| What | Leaked per event |
| --- | --- |
| Impact sparks | a `SphereGeometry` + material **per shot that hits the world** |
| Tracers | a `BufferGeometry` + material per shot (disposed, but re-created every shot) |
| Wake flip rings | a `RingGeometry` + material per node flip |
| Projectiles | a `SphereGeometry` per grenade |
| Wasp drones, mechs, gas clouds | a whole subtree each |
| Run claims | a material per claim picked up |
| **Remote players** | a 256×56 `CanvasTexture` + the body, per player who ever joins |

The worst two are the sparks and the remote players. A 600 RPM rifle hitting geometry leaks ten
buffers a second per shooter; a room that has seen fifty players over an evening is holding fifty
name-tag textures for people who left.

## 3. The fix

### 3.1 One helper, used everywhere

`client/render/dispose.ts`. `release(obj)` removes it from its parent and disposes every geometry,
material and texture in its subtree. All eight sites call it, so there is one place to be right
rather than eight places to remember.

Some resources are deliberately shared — one octahedron for every claim, one material per
projectile kind — and disposing those with the first object that dies would break every one after
it. They are marked once at the point they are created (`markShared`), and `release` walks past
them. That keeps the knowledge where it belongs: with the thing that is shared, not with each of
its users.

### 3.2 Tracers and sparks are pools, not allocations

`client/render/vfx.ts`. Disposing correctly would have fixed the leak and left the churn: a fresh
geometry and material per shot, created and destroyed 120 ms later, ten times a second per shooter.

So neither is created after startup. Every tracer is two vertices in one `LineSegments` and every
spark is one instance of an `InstancedMesh`, both written in place:

- **one draw call each**, for all of them, however fast anyone is firing;
- **no allocation in the frame path** — a shot writes six floats;
- **no leak is possible**, because there is nothing to forget to dispose.

They are ring buffers of 64. When they fill, the oldest effect is overwritten — the right failure
for a visual effect, and the wrong one for anything that matters.

## 4. What the probe measures, and what that number actually means

`probe/stage21.ts`. Getting this check right took three attempts, and the reason is worth writing
down because it is a trap in the metric rather than in the code.

**`info.memory.geometries` counts what the renderer has *initialised*, not what exists.** A geometry
registers the first time it is rendered. So the count rises whenever anything new enters the
frustum — the tram crossing, a pedestrian rounding a corner, or simply turning the camera. Three
versions of this check asserted the count was flat:

1. the first called warm-up registration a leak;
2. the second turned the camera between the baseline and the measurement, and called *that* a leak;
3. the third held the camera still but ran in a living district, where the crowd never stops
   bringing new geometry into view — on software GL at two frames a second, it never settles at all.

The metric is sound; "flat" was the wrong invariant. What the defect actually was is **per shot**:
every world hit left one geometry behind, so N shots left N geometries. So the probe measures the
rate against a control:

1. **Idle drift** in a static level, as the control — a handful of registrations over six seconds,
   not a stream.
2. **Growth per shot** through twelve seconds of sustained fire. Pre-fix this was about 1.0 per
   shot; the pools make it indistinguishable from doing nothing (< 0.1), and the texture count must
   not move at all.
3. **Draw calls added while effects are in flight.** Pre-fix every live tracer and spark was its own
   `Line` or `Mesh` — one call apiece. Now the whole pool is one call, and hidden entirely when
   nothing is in flight, so an idle frame costs nothing: the budget does not get worse in the common
   case to get better in the rare one.
4. **The frame-time tail.** A mean fps hides what players feel. Software GL makes absolute timings
   meaningless, so the budget is on the shape: the worst frame in a window must be within 4× the
   median, idle and under fire. A GC pause is a spike whatever the renderer.

   That check earned its keep immediately. With the pools in and the leak fixed, it still failed
   under fire at **5.5×** — one 567 ms frame in sixty, on the first shot. The pools are hidden when
   empty, so their two materials had never been rendered, and the first shot compiled two shader
   programs mid-frame. A one-off stutter at exactly the moment a duel starts is worse than a
   steady cost. `renderer.compile(scene, camera)` at startup, with the pools shown for that one
   call, took the worst frame under fire to **123 ms, 1.2×** — the same as idle.

What it does not check is absolute frame time, because SwiftShader cannot tell you anything about a
real GPU. That number needs a machine with one, and it is the honest gap in this document.

## 5. Still open

1. **Absolute frame time on real hardware.** Everything above is platform-independent by necessity.
   A pass on a mid-range laptop and a phone is the missing measurement.
2. **The city's own draw calls.** Stage 9's budget is generous — 180 calls — and the crowd, the
   signage and the dressing are separate meshes rather than instanced. Instancing them is the next
   real win, and it is a bigger change than this one.
3. **Texture memory.** The count is checked; the bytes are not. A canvas atlas for the name tags
   would replace one texture per player with one for the room.
