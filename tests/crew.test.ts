/**
 * A crew is the co-op campaign's door (Stage 49): an invite code naming a co-op room.
 *
 * The pure parts are pinned here — the room a code names round-trips, the page a crew travels to
 * carries the contract and its district, a code the alphabet cannot make is refused before any
 * network — and the two hosts' answer to "is there a crew with this code" is checked against a
 * real campaign room and a real (in-process) Durable Object.
 */
import { describe, expect, it } from "vitest";
import { CREW_PREFIX, crewCodeFromSocket, crewCodeOf, crewPageUrl, crewRoomName, crewSocket, isCrewRoom, newCrewCode, normaliseCrewCode, NO_SUCH_CREW } from "../shared/net/crew";
import { CODE_LENGTH, validInviteCode } from "../shared/net/private";
import { createCampaignRoom, crewInfo } from "../server/campaign-room";
import { MemoryAccountStore } from "../server/accounts";
import campaignWorker, { CampaignRoom } from "../server/campaign-worker";

describe("a crew code names a co-op room", () => {
  it("is made from the private rooms' alphabet, at their length, and round-trips through the room name", () => {
    const code = newCrewCode();
    expect(code).toHaveLength(CODE_LENGTH);
    expect(validInviteCode(code)).toBe(true);
    const room = crewRoomName(code);
    expect(room.startsWith(CREW_PREFIX)).toBe(true);
    expect(crewCodeOf(room)).toBe(code);
    expect(isCrewRoom(room)).toBe(true);
    expect(isCrewRoom("duo")).toBe(false);
    expect(isCrewRoom(CREW_PREFIX + "not-a-code")).toBe(false);
  });

  it("a typed code is trimmed and upper-cased, and one the alphabet cannot make is refused before any network", () => {
    expect(normaliseCrewCode("  abcdefgh ")).toBe("ABCDEFGH");
    expect(normaliseCrewCode("ABCDEFG")).toBeNull(); // too short
    expect(normaliseCrewCode("ABCDEFG0")).toBeNull(); // 0 and 1 and I and L and O are not in the alphabet
    expect(normaliseCrewCode("")).toBeNull();
  });

  it("the page a crew travels to carries the district, co-op mode, the contract and the room's socket, and keeps the shop", () => {
    const url = new URL(crewPageUrl("http://127.0.0.1:5173/?headless=1&explore=1&menu=1", { wsBase: "ws://h:1", code: "ABCDEFGH", mission: "m1_wake_unlisted", level: "lease_row", shop: "http://h:1" }));
    expect(url.searchParams.get("level")).toBe("lease_row");
    expect(url.searchParams.get("mode")).toBe("campaign");
    expect(url.searchParams.get("mission")).toBe("m1_wake_unlisted");
    expect(url.searchParams.get("shop")).toBe("http://h:1");
    expect(url.searchParams.get("headless")).toBe("1"); // the rest of the page's query survives
    expect(url.searchParams.get("explore")).toBeNull(); // a mode that would fight co-op does not
    expect(url.searchParams.get("net")).toBe(crewSocket("ws://h:1", "ABCDEFGH", "m1_wake_unlisted", "lease_row"));
    expect(crewCodeFromSocket(url.searchParams.get("net"))).toBe("ABCDEFGH");
    expect(crewCodeFromSocket("ws://h:1/campaign/duo?mission=x")).toBeNull();
    expect(crewCodeFromSocket("ws://h:1/room/neochina-lease_row")).toBeNull();
    expect(crewCodeFromSocket(null)).toBeNull();
  });
});

describe("a host answers for a crew", () => {
  it("a fresh crew room reports its contract, its district, nobody in it yet, and waiting", () => {
    const h = createCampaignRoom({ accounts: new MemoryAccountStore(), mission: "m1_wake_unlisted" });
    const info = crewInfo(h, "ABCDEFGH");
    expect(info).toEqual({ ok: true, code: "ABCDEFGH", mission: "m1_wake_unlisted", level: "lease_row", players: 0, status: "waiting" });
  });

  it("a malformed escape in the code is a bad code, not a thrown request (Stage 54)", async () => {
    const r = await campaignWorker.fetch(new Request("https://campaign/crew/%E0%A4%A"), {} as never);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ ok: false, reason: NO_SUCH_CREW });
    expect(normaliseCrewCode("%E0")).toBeNull();
  });

  it("the campaign Worker's room does not come into being because someone asked about it", async () => {
    const dO = new CampaignRoom({} as DurableObjectState, {} as never);
    const r = await (await dO.fetch(new Request("https://crew/info?code=ABCDEFGH"))).json();
    expect(r).toEqual({ ok: false, reason: NO_SUCH_CREW });
  });
});
