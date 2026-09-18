/**
 * What a trigger pull is called (Stage 94): the alt that is a different round gets a different
 * voice; the alt that is a stance keeps the gun's own.
 */
import { describe, expect, it } from "vitest";
import { altChangesVoice, shotVoice, toggleCue } from "../client/voice";
import { WEAPON_LIST } from "../shared/weapons/manifest";

describe("what a trigger pull is called", () => {
  it("gives the choked slug, the quickshot and the sticky a voice of their own", () => {
    expect(shotVoice("repo_hammer", true)).toBe("repo_hammer_slug");
    expect(shotVoice("longwave", true)).toBe("longwave_quickshot");
    expect(shotVoice("phage", true)).toBe("phage_sticky");
    for (const w of ["repo_hammer", "longwave", "phage"]) expect(shotVoice(w, true)).not.toBe(shotVoice(w, false));
  });

  it("keeps the primary's voice when the alt is a stance, not a round", () => {
    for (const w of WEAPON_LIST) {
      const stance = w.alt.kind === "ads" || w.alt.kind === "brace" || w.alt.kind === "lunge";
      if (stance) {
        expect(shotVoice(w.id, true)).toBe(w.id);
        expect(altChangesVoice(w.id)).toBe(false);
      }
    }
  });

  it("agrees with the manifest about which alts are a different round", () => {
    for (const w of WEAPON_LIST) {
      const round = w.alt.kind === "slug" || w.alt.kind === "quickshot" || w.alt.kind === "sticky";
      expect(altChangesVoice(w.id)).toBe(round);
    }
  });

  it("names the toggle by which way it went", () => {
    expect(toggleCue(true)).toBe("alt_on");
    expect(toggleCue(false)).toBe("alt_off");
  });
});
