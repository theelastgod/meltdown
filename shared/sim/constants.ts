/**
 * Simulation tunables. Every number here is shared by client prediction and the
 * authoritative server (Stage 2). Units: metres, seconds, radians.
 */
export const SIM_HZ = 60;
export const SIM_DT = 1 / SIM_HZ;
/** Max ticks the client loop will catch up in one frame before it drops time (0.5 s; a tick costs ~0.02 ms, so hitches are absorbed, not dropped). */
export const MAX_CATCHUP_TICKS = 30;

export const MOVE = {
  walkSpeed: 5.2,
  sprintSpeed: 7.2,
  crouchSpeed: 2.6,
  groundAccel: 64,
  /** exponential friction coefficient when no input on ground (1/s) */
  groundFriction: 9,
  airAccel: 14,
  gravity: 22,
  jumpVel: 7.4,
  jumpBuffer: 0.1,
  coyoteTime: 0.08,
  terminalVel: 42,

  capsuleRadius: 0.4,
  standHeight: 1.8,
  lowHeight: 1.15,
  eyeStand: 1.62,
  eyeLow: 0.9,
  stepHeight: 0.4,
  groundProbe: 0.08,

  /** Slide: momentum-preserving. Enter from a sprint, boost, decay, exit keeps velocity. */
  slideEntrySpeed: 5.6,
  slideBoost: 2.2,
  slideMaxSpeed: 10.5,
  slideFriction: 3.4,
  slideMinTime: 0.25,
  slideExitSpeed: 3.0,
  slideSteerRate: 1.6,
  slideCooldown: 0.45,
  /** Above-sprint momentum decays toward sprint speed at this rate once standing. */
  momentumDecay: 4.5,
  slideJumpVel: 6.9,

  /** Mantle: grab a ledge whose top is within [min,max] above the feet and pull up. */
  mantleMinHeight: 0.45,
  mantleMaxHeight: 1.7,
  mantleReach: 0.55,
  mantleTime: 0.34,
  mantleExitSpeed: 2.5,
} as const;

/** Stage 1 weapon stub: Lease-Breaker rifle (hitscan workhorse). Full manifest arrives in Stage 6. */
export const LEASE_BREAKER = {
  id: "lease_breaker",
  name: "LEASE-BREAKER",
  rpm: 500,
  damage: 16,
  headMult: 1.5,
  legMult: 0.85,
  magSize: 30,
  reloadTime: 1.9,
  range: 120,
  /** Visual view-kick per shot (radians), recovered exponentially. Full recoil model in Stage 4. */
  kickPitch: 0.0055,
  kickYaw: 0.0018,
  kickRecover: 12,
} as const;

export const PLAYER_MAX_HEALTH = 100;
export const DUMMY_MAX_HEALTH = 100;
export const DUMMY_RESPAWN_SECONDS = 2.5;
