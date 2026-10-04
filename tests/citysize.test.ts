/**
 * A district's grid is its own (Stage 692): LEASE ROW is five blocks by five, 174 m across, and the
 * docks and the depot are still three by three.
 *
 * Two promises are held here. The first is that nothing about a 3×3 district moved: every value the
 * generator derives from the size now comes from the spec's half-size instead of one constant, and a
 * 3×3 district must come out byte for byte what it was. The hashes below were taken on the generator
 * as it stood before the grid was a property (commit 451a761), for all three districts as they were
 * then, and LEASE ROW's old 3×3 spec is kept here so its old level can still be built and compared.
 * Stage 946 re-pinned DEADLETTER DOCKS only: the cold store is in that level. Stage 952 re-pinned
 * it again: the south pier is in that level. Stage 955 re-pinned it again: the east quay is in
 * that level. Stage 956 re-pinned it again: the north slip is in that level. Stage 947 re-pinned
 * REPO DEPOT only: the impound is
 * in that level. Stage 953 re-pinned it again: the west apron is in that level. Stage 954
 * re-pinned it again: the east ramp is in that level. Stage 959 re-pinned it again: the south bay
 * is in that level. Stage 960 re-pinned it again: the north crest is in that level. Stage 972
 * re-pinned it again: the north hoist is in that level. Stage 961
 * re-pinned DEADLETTER DOCKS again: the west wharf is in that level. Stage 966
 * re-pinned it again: the north keel is in that level. Stage 968
 * re-pinned it again: the south cleat is in that level. Stage 969
 * re-pinned it again: the east bollard is in that level. Stage 973
 * re-pinned it again: the west bitt is in that level. Stage 983
 * re-pinned it again: the north fender is in that level. Stage 984
 * re-pinned it again: the north stem is in that level. Stage 982
 * re-pinned REPO DEPOT again: the west skid is in that level. Stage 987
 * re-pinned REPO DEPOT again: the north winch is in that level. Stage 998
 * re-pinned REPO DEPOT again: the north cradle is in that level. Stage 1030
 * re-pinned REPO DEPOT again: the north deadeye is in that level. Stage 1034
 * re-pinned REPO DEPOT again: the south gudgeon is in that level. Stage 1038
 * re-pinned REPO DEPOT again: the south tiller is in that level. Stage 1042
 * re-pinned REPO DEPOT again: the east shackle is in that level. Stage 1046
 * re-pinned REPO DEPOT again: the east swivel is in that level. Stage 1050
 * re-pinned REPO DEPOT again: the east fid is in that level. Stage 1054
 * re-pinned REPO DEPOT again: the east kevel is in that level. Stage 1058
 * re-pinned REPO DEPOT again: the west coak is in that level. Stage 1062
 * re-pinned REPO DEPOT again: the west gammon is in that level. Stage 1066
 * re-pinned REPO DEPOT again: the west whelp is in that level. Stage 1070
 * re-pinned REPO DEPOT again: the west swifter is in that level. Stage 1074
 * re-pinned REPO DEPOT again: the west lizard is in that level. Stage 1031
 * re-pinned DEADLETTER DOCKS again: the south pintle is in that level. Stage 1035
 * re-pinned DEADLETTER DOCKS again: the south lanyard is in that level. Stage 1039
 * re-pinned DEADLETTER DOCKS again: the east bobstay is in that level. Stage 1043
 * re-pinned DEADLETTER DOCKS again: the east throat is in that level. Stage 1047
 * re-pinned DEADLETTER DOCKS again: the east knight is in that level. Stage 1051
 * re-pinned DEADLETTER DOCKS again: the east keelson is in that level. Stage 1055
 * re-pinned DEADLETTER DOCKS again: the west cathead is in that level. Stage 1059
 * re-pinned DEADLETTER DOCKS again: the west futtock is in that level. Stage 1063
 * re-pinned DEADLETTER DOCKS again: the west bumkin is in that level. Stage 1067
 * re-pinned DEADLETTER DOCKS again: the west martingale is in that level. Stage 1071
 * re-pinned DEADLETTER DOCKS again: the west rode is in that level. Stage 999
 * re-pinned DEADLETTER DOCKS again: the south gunwale is in that level. LEASE ROW's
 * old 3×3 stays on the pre-grid bytes.
 *
 * The second is that the 5×5 district plays: every node reachable from every spawn, everything the
 * sim sends over the wire well inside what a position can carry, the claims and safe zones on
 * ground a Blank can reach, the wasps over streets and not through buildings.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import { CITY_HALF, DISTRICT_SPECS, districtById, districtGrid, districtHalf, generateDistrict, type DistrictSpec } from "../shared/sim/city";
import { levelById } from "../shared/sim/level";
import { buildNav, cellOf, reachableFrom, walkable } from "../shared/sim/nav";
import { capsuleFree } from "../shared/sim/collision";
import { MOVE } from "../shared/sim/constants";
import { MISSIONS, type Objective } from "../shared/campaign/missions";
import { resolveSpot } from "../shared/campaign/runtime";
import { SIGN_ATLAS_SLOTS } from "../client/render/city";

const hash = (spec: DistrictSpec): string => createHash("sha256").update(JSON.stringify(generateDistrict(spec))).digest("hex");

/** LEASE ROW as it was before Stage 692: three blocks by three, three wasps, one mech. */
const LEASE_ROW_3X3: DistrictSpec = {
  ...districtById("lease_row")!,
  grid: 3,
  blocks: ["tower", "split", "court", "market", "plaza", "split", "court", "tower", "market"],
  mechs: 1,
  wasps: 3,
  pedestrians: 110,
};

/** sha256 of JSON.stringify(generateDistrict(spec)), taken on the generator before the grid was a property */
const BEFORE: Record<string, string> = {
  lease_row: "186a6e9ef13e31116cc79fc7f20305dfef6ee77c6bf8f10c581e460ceb8a5c43",
  deadletter_docks: "9552cae19d3d26499f6b5b52f93b294bb02c79dd26b74c9f89e0c29bb9b1746d",
  repo_depot: "11ea845b42e65c3a0f4348a6eae63a3231a6daa657f880de6cef8a50f40ad69d",
};

/** Docks after Stage 946 opened the north warehouse. Sealing the south pier puts this hash back. */
const DOCKS_COLD = "9fbfdacea66b13b474838d46baba9fd853531edc829ccd84f27773e807628df9";

/** Docks after Stage 952 opened the south-west wall. Sealing the east quay puts this hash back. */
const DOCKS_BERTH = "9923ed58bcfde59906b477616970b516b199edfa4c43398d62522480889d992a";

/** Docks after Stage 955 opened the east wall. Sealing the north slip puts this hash back. */
const DOCKS_QUAY = "e1d69b5777f6b047abbdf361a7b17367944dab699f709de295189eeeef9e2f44";

/** Docks after Stage 956 opened the north wall. Sealing the west wharf puts this hash back. */
const DOCKS_SLIP = "c234d02d3b1380193683dd885277323b3f6d50b93373658900dc51b5f9839e23";

/** Docks after Stage 961 opened the west wall. Sealing the north keel puts this hash back. */
const DOCKS_WHARF = "ab4fe5439a106f86b19353b3d3e8be84d66bcda4c4c6d0ae1f2632dcd2ebbe29";

/** Docks after Stage 966 opened the north-east wall. Sealing the south cleat puts this hash back. */
const DOCKS_KEEL = "4445c9db5396f2e842f42ccf0cc0ed6af75f3d5c4ea23e1940d1058bec16e9c2";

/** Docks after Stage 968 opened the south-east wall. Sealing the east bollard puts this hash back. */
const DOCKS_CLEAT = "0df3a03e15dc633e3902fcbfe11a41b70d53c8c3e7edec6c2c13d202e636a2e4";

/** Docks after Stage 969 opened the south run of the east wall. Sealing the west bitt puts this hash back. */
const DOCKS_BOLLARD = "89b26f1fa8722ed29d6786df4c1a071b0aa41b67128c59e10b10f033bcadb60a";

/** Docks after Stage 973 opened the north run of the west wall. Sealing the north fender puts this hash back. */
const DOCKS_BITT = "b842eac686aa6db295c7460626a50487f9da8727d84df39dd5428a0bcca82f29";

/** Docks after Stage 983 opened the slab between the north-east gate and the keel. Sealing the north stem puts this hash back. */
const DOCKS_FENDER = "1f2a06f9cb342c3ba89244b2b1830f2122a377b8c30b2be183b1183a88ceb32f";

/** Docks after Stage 984 opened the west end of the north wall, past the slip. Sealing the north hawse puts this hash back. */
const DOCKS_STEM = "8cfc2e798a1d36fe7197c6e468d219d974a95fafda95ffb725f2e224c390bbf4";

/** Docks after Stage 991 opened the slab between the north-west gate and the slip. Sealing the north transom puts this hash back. */
const DOCKS_HAWSE = "6d299c4181e77baaa34fb4ffd7426eb94379316f2356bbf9af686151266c647b";

/** Docks after Stage 995 opened the slab between the fender and the keel. Sealing the south gunwale puts this hash back. */
const DOCKS_TRANSOM = "ce653d224e6b7ec6a1f329393d406a6faa597a3208c4a43cc284d0faf0bfa071";

/** Docks after Stage 999 opened the slab between the south-east gate and the cleat. Sealing the south strake puts this hash back. */
const DOCKS_GUNWALE = "878e4ebfc5ae138c611b6fd92cd6c516d4cb5db2f0cfb846ae41aa0e02c6652d";

/** Docks after Stage 1003 opened the slab between the south pier and the south-west gate. Sealing the south garboard puts this hash back. */
const DOCKS_STRAKE = "53b952cfeac7913c8b0c0d749a30a2f5ab8cf78fc97656d3daeed263d302ff2a";

/** Docks after Stage 1007 opened the slab between the south gunwale and the south cleat. Sealing the east fairlead puts this hash back. */
const DOCKS_GARBOARD = "51639e55e4abc3a4889e3f8246b5b7adc8a0d5df5448e97cdd81e7db6f84a0bb";

/** Docks after Stage 1011 opened the slab between the east bollard and the south-east gate. Sealing the east bulwark puts this hash back. */
const DOCKS_FAIRLEAD = "67db383a82356e2edc6429057ab3063d01131ecddcb427f009ba3ae66db403d3";

/** Docks after Stage 1015 opened the slab between the east quay and the north-east gate. Sealing the west painter puts this hash back. */
const DOCKS_BULWARK = "992307078929f6e5a35db28824e23aa519f29e5f796ece0ff4e4cbf022443590";

/** Docks after Stage 1019 opened the slab between the west wharf and the south-west gate. Sealing the west fluke puts this hash back. */
const DOCKS_PAINTER = "462cc4a6058863a115aa1463aa2ab24679e140a040bc03b0c1c65a7b5eea6ad4";

/** Docks after Stage 1023 opened the slab between the west bitt and the north-west gate. Sealing the north thimble puts this hash back. */
const DOCKS_FLUKE = "bc87d52ca8ec9d96d59c612bd8d9f81e986a00f474a5d6a11a8c4ca5b350ea96";

/** Docks after Stage 1027 opened the slab between the north stem and the north slip. Sealing the south pintle puts this hash back. */
const DOCKS_THIMBLE = "15f3246e939565a629a11dd669dfc4a1c778244020e93f6af60b60b793fff751";

/** Docks after Stage 1031 opened the west end of the south wall, past the pier. Sealing the south lanyard puts this hash back. */
const DOCKS_PINTLE = "b5edeb5067c3d7e605075e2b31efb8ec61bf711af42e167f75530c1c94cbb51a";

/** Docks after Stage 1035 opened the slab between the south pintle and the south pier. Sealing the east bobstay puts this hash back. */
const DOCKS_LANYARD = "63e4f2fc1a5389e3687f09a9e1f8fb73d9388f10dec68d7b30e25855469a61ea";

/** Docks after Stage 1039 opened the north end of the east wall, past the quay. Sealing the east throat puts this hash back. */
const DOCKS_BOBSTAY = "cb90c1af0635a6017bbbb2c5b25b635f59cbf8dee88fb2101477de50c95ee0fb";

/** Docks after Stage 1043 opened the slab between the east bobstay and the east quay. Sealing the east knight puts this hash back. */
const DOCKS_THROAT = "d90014dcba137d28850e405c0df9007c57f69e3fbbc9811b2478ea0c342d5483";

/** Docks after Stage 1047 opened the south end of the east wall, past the bollard. Sealing the east keelson puts this hash back. */
const DOCKS_KNIGHT = "f1e59b79112d70e25d7c692de97e7eb0be9a992208ed192771148d240cd5dd1a";

/** Docks after Stage 1051 opened the slab between the east knight and the east bollard. Sealing the west cathead puts this hash back. */
const DOCKS_KEELSON = "ee57567a9ee01abfc1d304562148044119eccf42f2195d14b16b001837ea4fe1";

/** Docks after Stage 1055 opened the north end of the west wall, past the bitt. Sealing the west futtock puts this hash back. */
const DOCKS_CATHEAD = "5cd3ea7d1c19c1c85feadbe0336695ced96cc573568d60792f25495b8bdadd1c";

/** Docks after Stage 1059 opened the slab between the west cathead and the west bitt. Sealing the west bumkin puts this hash back. */
const DOCKS_FUTTOCK = "ab0a06b8ad255a77fc0bbf159723c48df7acd57f61babbc306b750abe267a75b";

/** Docks after Stage 1063 opened the south end of the west wall, past the wharf. Sealing the west martingale puts this hash back. */
const DOCKS_BUMKIN = "65d300dbf398a2eb08067a45735a7d37910f0ec7d6425e3a4e386b788dd89196";

/** Docks after Stage 1067 opened the slab between the west bumkin and the west wharf. Sealing the west rode puts this hash back. */
const DOCKS_MARTINGALE = "f2cd99511e64bd6f3b846d0cce3516932827cb8402eff9f4184bd9c9c3015816";

/** Docks after Stage 1071 opened the slab between the west fluke and the west bitt. The martingale bytes stay in DOCKS_MARTINGALE. */
const DOCKS_RODE = "48009129133f60f4bb17e60a8f2b41c714c9c06a7475380b8ece6c8b3727ae35";

/** Depot after Stage 947 opened the south-east warehouse. Sealing the west apron puts this hash back. */
const DEPOT_IMPOUND = "ebd06ce8d2adab07319dd6c770657c56626cd3e14d745f6391e9e830acded6da";

/** Depot after Stage 953 opened the west wall. Sealing the east ramp puts this hash back. */
const DEPOT_APRON = "8649dcfc8056d19c1b39ef460cf1a9ac6d167a49c68570694b1b753369b557b1";

/** Depot after Stage 954 opened the east wall. Sealing the south bay puts this hash back. */
const DEPOT_RAMP = "179d0aaba7b73e0802d4b03833efb238893d9c90177e9d3207d57c22c209ad5b";

/** Depot after Stage 959 opened the south wall. Sealing the north crest puts this hash back. */
const DEPOT_BAY = "dd855c44f5502260163a68e3ccc81bbe74cff6a33105847febe7a8365a1a2117";

/** Depot after Stage 960 opened the north-west wall. Sealing the north hoist puts this hash back. */
const DEPOT_CREST = "4cf5a6ba1d6b53d530500cdf2c5d17b3ef73f03bd5ba7c732f2edf08c3e47454";

/** Depot after Stage 972 opened the north-east wall. Sealing the east jack puts this hash back. */
const DEPOT_HOIST = "a1576f39f98de6f0ef8e3e1cc2de24d94b3389a1195d186c3864bee609bad005";

/** Depot after Stage 976 opened the south run of the east wall. Sealing the south chock puts this hash back. */
const DEPOT_JACK = "4b28867aafe6028e09ea01ed04de6c9fe234805f74e7720d7287f502575ab3e2";

/** Depot after Stage 981 opened the east run of the south wall. Sealing the west skid puts this hash back. */
const DEPOT_CHOCK = "8f31b361e7de69bb25cc15e6c040666f3067ea0da630f19b39deb245011d7981";

/** Depot after Stage 982 opened the north run of the west wall. Sealing the north winch puts this hash back. */
const DEPOT_SKID = "1c3dbd8c967746c6d7c9c87c32d89544322c069bf99192e000ab2e49b64b494e";

/** Depot after Stage 987 opened the west end of the north wall, past the crest. Sealing the north dolly puts this hash back. */
const DEPOT_WINCH = "bafbb0414aa32891a8cebd66a1f86a6ff93de7e1b831626b3bb4f297d89e1419";

/** Depot after Stage 990 opened the slab between the north-east gate and the hoist. Sealing the north bolster puts this hash back. */
const DEPOT_DOLLY = "080fde14d8767f0dcf816a1e0fc819014de425eca18b8c9d52d604edecd6a6ad";

/** Depot after Stage 994 opened the slab between the north-west gate and the crest. Sealing the north cradle puts this hash back. */
const DEPOT_BOLSTER = "ee0473ce9da39433b161bec6e9dad45a6212067715993e291574c9ecc7512788";

/** Depot after Stage 998 opened the slab between the dolly and the hoist. Sealing the south derrick puts this hash back. */
const DEPOT_CRADLE = "c8687ddd47cf3442c91e5e488e583ced20d3954286ba2d5024ce428e0fcb0e08";

/** Depot after Stage 1002 opened the slab between the south-east gate and the chock. Sealing the south davit puts this hash back. */
const DEPOT_DERRICK = "64a2f8fd5400adc2f0a8a4bfd26f3751df4383ae5854548a0cfdf68c6a47eabc";

/** Depot after Stage 1006 opened the slab between the south bay and the south-west gate. Sealing the south capstan puts this hash back. */
const DEPOT_DAVIT = "489ee7d8686e2569afb74643881ecff7c447d88200247f0b11e2e271ec8e226a";

/** Depot after Stage 1010 opened the slab between the south derrick and the south chock. Sealing the east windlass puts this hash back. */
const DEPOT_CAPSTAN = "09245be1da68e8e55d47ed1134c4fb44c3d382d2f6ddcba25131b689ce63f4a0";

/** Depot after Stage 1014 opened the slab between the east jack and the south-east gate. Sealing the east pawl puts this hash back. */
const DEPOT_WINDLASS = "00c328fa73be77ea63b1b3b66c867dc789cf3cde851c66bd9a1dc3556258dfc7";

/** Depot after Stage 1018 opened the slab between the east ramp and the north-east gate. Sealing the west clevis puts this hash back. */
const DEPOT_PAWL = "e30bd455be6320c16be8b99f9ec338ab7074cce470732361d4da482764b10d7f";

/** Depot after Stage 1022 opened the slab between the west apron and the south-west gate. Sealing the west becket puts this hash back. */
const DEPOT_CLEVIS = "aa924fa5fad224a012e3568b8ac69007c39c6aea222b862867d0d0dfe21540d6";

/** Depot after Stage 1026 opened the slab between the west skid and the north-west gate. Sealing the north deadeye puts this hash back. */
const DEPOT_BECKET = "db905f7342b927115a8c261f3aae2d84e3b6b2f4e42255417f4374cfa9cc0c76";

/** Depot after Stage 1030 opened the slab between the north winch and the north crest. Sealing the south gudgeon puts this hash back. */
const DEPOT_DEADEYE = "de74f766420d41922f537f128814f8f393f6b0c40e0a8d779da42bfd52b4e66d";

/** Depot after Stage 1034 opened the west end of the south wall, past the bay. Sealing the south tiller puts this hash back. */
const DEPOT_GUDGEON = "31e844bae2a9f1512bb3bbfaa5c931ee28e4cb1962a31eff42148811c736e636";

/** Depot after Stage 1038 opened the slab between the south gudgeon and the south bay. Sealing the east shackle puts this hash back. */
const DEPOT_TILLER = "84ef82fdb8bc9216eaaa97311530f62c85e16610261e10b1b801562a7738523f";

/** Depot after Stage 1042 opened the north end of the east wall, past the ramp. Sealing the east swivel puts this hash back. */
const DEPOT_SHACKLE = "b51b77ca539d8a0b52824215062979d833ba86a28df37b5f5a960008a5f3d50d";

/** Depot after Stage 1046 opened the slab between the east shackle and the east ramp. Sealing the east fid puts this hash back. */
const DEPOT_SWIVEL = "b47a9e10689da8734bf09a8e2c8e23c3d1b83dce6458e4010a7c15a4a4200e0e";

/** Depot after Stage 1050 opened the south end of the east wall, past the jack. Sealing the east kevel puts this hash back. */
const DEPOT_FID = "a16c0509f183959252787e595d5dc5b79bf035e848529f36ecb796fa5b2aa213";

/** Depot after Stage 1054 opened the slab between the east fid and the east jack. Sealing the west coak puts this hash back. */
const DEPOT_KEVEL = "99f5d6ee03f262e7a4679a0095eff2c07f99dbaaab60d48e2faa9f6f5e3aaf80";

/** Depot after Stage 1058 opened the north end of the west wall, past the skid. Sealing the west gammon puts this hash back. */
const DEPOT_COAK = "1ad12ec1124e79823b08e76296d411ab84d6c0fd1f82b2efa929fff061acf3f2";

/** Depot after Stage 1062 opened the slab between the west coak and the west skid. Sealing the west whelp puts this hash back. */
const DEPOT_GAMMON = "592182e1bd9e7ee5a3fb9fa80cdc7fea68256f2fc1d5676a67ae07467d7b199c";

/** Depot after Stage 1066 opened the south end of the west wall, past the apron. Sealing the west swifter puts this hash back. */
const DEPOT_WHELP = "7362ae4af3b9decbaa6f641f705963c4a076043fdeee53c9b3aa84fec014b3fb";

/** Depot after Stage 1070 opened the slab between the west whelp and the west apron. Sealing the west lizard puts this hash back. */
const DEPOT_SWIFTER = "dd36a94604b48110fe271b6ca522f0f99896c49ef8022b51538d887261c0862c";

/** Depot after Stage 1074 opened the slab between the west becket and the west skid. The swifter bytes stay in DEPOT_SWIFTER. */
const DEPOT_LIZARD = "9956109530955da297ff66ac5f9fc3e8ea3263c721b0a605de8d795dd8762424";

/** What a position can be sent at: i16 at 1 cm is ±327.67 m (shared/net/protocol.ts); everything networked stays inside this. */
const NET_LIMIT = 300;

const lease = () => generateDistrict(districtById("lease_row")!);

describe("a 3×3 district is the level it always was", () => {
  it("REPO DEPOT is still that 3×3 level, plus the impound, the west apron, the east ramp, the south bay, the north crest, the north hoist, the east jack, the south chock, the west skid, the north winch, the north dolly, the north bolster, the north cradle, the south derrick, the south davit, the south capstan, the east windlass, the east pawl, the west clevis, the west becket, the north deadeye, the south gudgeon, the south tiller, the east shackle, the east swivel, the east fid, the east kevel, the west coak, the west gammon, the west whelp, the west swifter, and the west lizard (Stage 1074)", () => {
    const spec = districtById("repo_depot")!;
    expect(districtGrid(spec)).toBe(3);
    expect(hash(spec)).toBe(DEPOT_LIZARD);
    expect(generateDistrict(spec).impound?.line).toMatch(/IMPOUND/);
    expect(generateDistrict(spec).apron?.line).toMatch(/WEST APRON/);
    expect(generateDistrict(spec).ramp?.line).toMatch(/EAST RAMP/);
    expect(generateDistrict(spec).bay?.line).toMatch(/SOUTH BAY/);
    expect(generateDistrict(spec).crest?.line).toMatch(/NORTH CREST/);
    expect(generateDistrict(spec).hoist?.line).toMatch(/NORTH HOIST/);
    expect(generateDistrict(spec).jack?.line).toMatch(/EAST JACK/);
    expect(generateDistrict(spec).chock?.line).toMatch(/SOUTH CHOCK/);
    expect(generateDistrict(spec).skid?.line).toMatch(/WEST SKID/);
    expect(generateDistrict(spec).winch?.line).toMatch(/NORTH WINCH/);
    expect(generateDistrict(spec).dolly?.line).toMatch(/NORTH DOLLY/);
    expect(generateDistrict(spec).bolster?.line).toMatch(/NORTH BOLSTER/);
    expect(generateDistrict(spec).cradle?.line).toMatch(/NORTH CRADLE/);
    expect(generateDistrict(spec).derrick?.line).toMatch(/SOUTH DERRICK/);
    expect(generateDistrict(spec).davit?.line).toMatch(/SOUTH DAVIT/);
    expect(generateDistrict(spec).capstan?.line).toMatch(/SOUTH CAPSTAN/);
    expect(generateDistrict(spec).windlass?.line).toMatch(/EAST WINDLASS/);
    expect(generateDistrict(spec).pawl?.line).toMatch(/EAST PAWL/);
    expect(generateDistrict(spec).clevis?.line).toMatch(/WEST CLEVIS/);
    expect(generateDistrict(spec).becket?.line).toMatch(/WEST BECKET/);
    expect(generateDistrict(spec).deadeye?.line).toMatch(/NORTH DEADEYE/);
    expect(generateDistrict(spec).gudgeon?.line).toMatch(/SOUTH GUDGEON/);
    expect(generateDistrict(spec).tiller?.line).toMatch(/SOUTH TILLER/);
    expect(generateDistrict(spec).shackle?.line).toMatch(/EAST SHACKLE/);
    expect(generateDistrict(spec).swivel?.line).toMatch(/EAST SWIVEL/);
    expect(generateDistrict(spec).fid?.line).toMatch(/EAST FID/);
    expect(generateDistrict(spec).kevel?.line).toMatch(/EAST KEVEL/);
    expect(generateDistrict(spec).coak?.line).toMatch(/WEST COAK/);
    expect(generateDistrict(spec).gammon?.line).toMatch(/WEST GAMMON/);
    expect(generateDistrict(spec).whelp?.line).toMatch(/WEST WHELP/);
    expect(generateDistrict(spec).swifter?.line).toMatch(/WEST SWIFTER/);
    expect(generateDistrict(spec).lizard?.line).toMatch(/WEST LIZARD/);
    // the pin is not the sealed wall: closing the lizard would put the swifter hash back
    expect(DEPOT_LIZARD).not.toBe(DEPOT_SWIFTER);
    expect(DEPOT_SWIFTER).not.toBe(DEPOT_WHELP);
    expect(DEPOT_WHELP).not.toBe(DEPOT_GAMMON);
    expect(DEPOT_GAMMON).not.toBe(DEPOT_COAK);
    expect(DEPOT_COAK).not.toBe(DEPOT_KEVEL);
    expect(DEPOT_KEVEL).not.toBe(DEPOT_FID);
    expect(DEPOT_FID).not.toBe(DEPOT_SWIVEL);
    expect(DEPOT_SWIVEL).not.toBe(DEPOT_SHACKLE);
    expect(DEPOT_SHACKLE).not.toBe(DEPOT_TILLER);
    expect(DEPOT_TILLER).not.toBe(DEPOT_GUDGEON);
    expect(DEPOT_GUDGEON).not.toBe(DEPOT_DEADEYE);
    expect(DEPOT_DEADEYE).not.toBe(DEPOT_BECKET);
    expect(DEPOT_BECKET).not.toBe(DEPOT_CLEVIS);
    expect(DEPOT_CLEVIS).not.toBe(DEPOT_PAWL);
    expect(DEPOT_PAWL).not.toBe(DEPOT_WINDLASS);
    expect(DEPOT_WINDLASS).not.toBe(DEPOT_CAPSTAN);
    expect(DEPOT_CAPSTAN).not.toBe(DEPOT_DAVIT);
    expect(DEPOT_DAVIT).not.toBe(DEPOT_DERRICK);
    expect(DEPOT_DERRICK).not.toBe(DEPOT_CRADLE);
    expect(DEPOT_CRADLE).not.toBe(DEPOT_BOLSTER);
    expect(DEPOT_BOLSTER).not.toBe(DEPOT_DOLLY);
    expect(DEPOT_DOLLY).not.toBe(DEPOT_WINCH);
    expect(DEPOT_WINCH).not.toBe(DEPOT_SKID);
    expect(DEPOT_SKID).not.toBe(DEPOT_CHOCK);
    expect(DEPOT_CHOCK).not.toBe(DEPOT_JACK);
    expect(DEPOT_JACK).not.toBe(DEPOT_HOIST);
    expect(DEPOT_HOIST).not.toBe(DEPOT_CREST);
    expect(DEPOT_CREST).not.toBe(DEPOT_BAY);
    expect(DEPOT_BAY).not.toBe(DEPOT_RAMP);
    expect(DEPOT_IMPOUND).not.toBe(BEFORE["repo_depot"]);
  });

  it("DEADLETTER DOCKS is still that 3×3 level, plus the cold store, the south pier, the east quay, the north slip, the west wharf, the north keel, the south cleat, the east bollard, the west bitt, the north fender, the north stem, the north hawse, the north transom, the south gunwale, the south strake, the south garboard, the east fairlead, the east bulwark, the west painter, the west fluke, the north thimble, the south pintle, the south lanyard, the east bobstay, the east throat, the east knight, the east keelson, the west cathead, the west futtock, the west bumkin, the west martingale, and the west rode (Stage 1071)", () => {
    const spec = districtById("deadletter_docks")!;
    expect(districtGrid(spec)).toBe(3);
    expect(hash(spec)).toBe(DOCKS_RODE);
    expect(generateDistrict(spec).cold?.line).toMatch(/COLD STORE/);
    expect(generateDistrict(spec).berth?.line).toMatch(/SOUTH PIER/);
    expect(generateDistrict(spec).quay?.line).toMatch(/EAST QUAY/);
    expect(generateDistrict(spec).slip?.line).toMatch(/NORTH SLIP/);
    expect(generateDistrict(spec).wharf?.line).toMatch(/WEST WHARF/);
    expect(generateDistrict(spec).keel?.line).toMatch(/NORTH KEEL/);
    expect(generateDistrict(spec).cleat?.line).toMatch(/SOUTH CLEAT/);
    expect(generateDistrict(spec).bollard?.line).toMatch(/EAST BOLLARD/);
    expect(generateDistrict(spec).bitt?.line).toMatch(/WEST BITT/);
    expect(generateDistrict(spec).fender?.line).toMatch(/NORTH FENDER/);
    expect(generateDistrict(spec).stem?.line).toMatch(/NORTH STEM/);
    expect(generateDistrict(spec).hawse?.line).toMatch(/NORTH HAWSE/);
    expect(generateDistrict(spec).transom?.line).toMatch(/NORTH TRANSOM/);
    expect(generateDistrict(spec).gunwale?.line).toMatch(/SOUTH GUNWALE/);
    expect(generateDistrict(spec).strake?.line).toMatch(/SOUTH STRAKE/);
    expect(generateDistrict(spec).garboard?.line).toMatch(/SOUTH GARBOARD/);
    expect(generateDistrict(spec).fairlead?.line).toMatch(/EAST FAIRLEAD/);
    expect(generateDistrict(spec).bulwark?.line).toMatch(/EAST BULWARK/);
    expect(generateDistrict(spec).painter?.line).toMatch(/WEST PAINTER/);
    expect(generateDistrict(spec).fluke?.line).toMatch(/WEST FLUKE/);
    expect(generateDistrict(spec).thimble?.line).toMatch(/NORTH THIMBLE/);
    expect(generateDistrict(spec).pintle?.line).toMatch(/SOUTH PINTLE/);
    expect(generateDistrict(spec).lanyard?.line).toMatch(/SOUTH LANYARD/);
    expect(generateDistrict(spec).bobstay?.line).toMatch(/EAST BOBSTAY/);
    expect(generateDistrict(spec).throat?.line).toMatch(/EAST THROAT/);
    expect(generateDistrict(spec).knight?.line).toMatch(/EAST KNIGHT/);
    expect(generateDistrict(spec).keelson?.line).toMatch(/EAST KEELSON/);
    expect(generateDistrict(spec).cathead?.line).toMatch(/WEST CATHEAD/);
    expect(generateDistrict(spec).futtock?.line).toMatch(/WEST FUTTOCK/);
    expect(generateDistrict(spec).bumkin?.line).toMatch(/WEST BUMKIN/);
    expect(generateDistrict(spec).martingale?.line).toMatch(/WEST MARTINGALE/);
    expect(generateDistrict(spec).rode?.line).toMatch(/WEST RODE/);
    // the pin is not the sealed wall: closing the rode would put the martingale hash back
    expect(DOCKS_RODE).not.toBe(DOCKS_MARTINGALE);
    expect(DOCKS_MARTINGALE).not.toBe(DOCKS_BUMKIN);
    expect(DOCKS_BUMKIN).not.toBe(DOCKS_FUTTOCK);
    expect(DOCKS_FUTTOCK).not.toBe(DOCKS_CATHEAD);
    expect(DOCKS_CATHEAD).not.toBe(DOCKS_KEELSON);
    expect(DOCKS_KEELSON).not.toBe(DOCKS_KNIGHT);
    expect(DOCKS_KNIGHT).not.toBe(DOCKS_THROAT);
    expect(DOCKS_THROAT).not.toBe(DOCKS_BOBSTAY);
    expect(DOCKS_BOBSTAY).not.toBe(DOCKS_LANYARD);
    expect(DOCKS_LANYARD).not.toBe(DOCKS_PINTLE);
    expect(DOCKS_PINTLE).not.toBe(DOCKS_THIMBLE);
    expect(DOCKS_THIMBLE).not.toBe(DOCKS_FLUKE);
    expect(DOCKS_FLUKE).not.toBe(DOCKS_PAINTER);
    expect(DOCKS_PAINTER).not.toBe(DOCKS_BULWARK);
    expect(DOCKS_BULWARK).not.toBe(DOCKS_FAIRLEAD);
    expect(DOCKS_FAIRLEAD).not.toBe(DOCKS_GARBOARD);
    expect(DOCKS_GARBOARD).not.toBe(DOCKS_STRAKE);
    expect(DOCKS_STRAKE).not.toBe(DOCKS_GUNWALE);
    expect(DOCKS_GUNWALE).not.toBe(DOCKS_TRANSOM);
    expect(DOCKS_TRANSOM).not.toBe(DOCKS_HAWSE);
    expect(DOCKS_HAWSE).not.toBe(DOCKS_STEM);
    expect(DOCKS_STEM).not.toBe(DOCKS_FENDER);
    expect(DOCKS_FENDER).not.toBe(DOCKS_BITT);
    expect(DOCKS_BITT).not.toBe(DOCKS_BOLLARD);
    expect(DOCKS_BOLLARD).not.toBe(DOCKS_CLEAT);
    expect(DOCKS_CLEAT).not.toBe(DOCKS_KEEL);
    expect(DOCKS_KEEL).not.toBe(DOCKS_WHARF);
    expect(DOCKS_WHARF).not.toBe(DOCKS_SLIP);
    expect(DOCKS_SLIP).not.toBe(DOCKS_QUAY);
    expect(DOCKS_COLD).not.toBe(BEFORE["deadletter_docks"]);
  });

  it("LEASE ROW's old 3×3 spec still builds its old level, byte for byte", () => {
    expect(hash(LEASE_ROW_3X3)).toBe(BEFORE["lease_row"]);
  });

  it("a 3×3 spec with the grid written out builds the same level as one that leaves it to the default", () => {
    const docks = districtById("deadletter_docks")!;
    expect(hash({ ...docks, grid: 3 })).toBe(hash(docks));
  });

  it("the half-size: 54 m for three blocks, 87 m for five, and CITY_HALF is still the 3×3 value", () => {
    expect(CITY_HALF).toBe(54);
    expect(districtHalf({ grid: 3 })).toBe(54);
    expect(districtHalf({})).toBe(54);
    expect(districtHalf({ grid: 5 })).toBe(87);
    for (const spec of DISTRICT_SPECS) expect(generateDistrict(spec).bounds, spec.id).toBe(districtHalf(spec));
  });
});

describe("LEASE ROW is five blocks by five", () => {
  it("is the one 5×5 district: 25 blocks, the plaza in the centre, the old nine in the middle", () => {
    const spec = districtById("lease_row")!;
    expect(districtGrid(spec)).toBe(5);
    expect(spec.blocks).toHaveLength(25);
    expect(spec.blocks[12]).toBe("plaza");
    expect(spec.blocks.filter((b) => b === "plaza")).toHaveLength(1);
    // the centre nine, row by row, are the 3×3 LEASE ROW's own: the contracts' blocks did not move
    const centre = [1, 2, 3].flatMap((bz) => [1, 2, 3].map((bx) => spec.blocks[bz * 5 + bx]));
    expect(centre).toEqual(LEASE_ROW_3X3.blocks);
    expect(DISTRICT_SPECS.filter((d) => districtGrid(d) === 5).map((d) => d.id)).toEqual(["lease_row"]);
  });

  it("the wake's five nodes stand exactly where the 3×3 district put them, under the same labels", () => {
    const small = generateDistrict(LEASE_ROW_3X3);
    const big = lease();
    expect(big.nodes.map((n) => [n.label, n.pos.x, n.pos.z, n.links])).toEqual(small.nodes.map((n) => [n.label, n.pos.x, n.pos.z, n.links]));
    expect(big.nodes.find((n) => n.label === "A")!.pos).toEqual({ x: 0, y: 0, z: 0 });
  });

  it("is larger: 174 m across, more blocks, more to walk", () => {
    const small = generateDistrict(LEASE_ROW_3X3);
    const big = lease();
    expect(big.bounds).toBe(87);
    expect(big.walks!.length).toBe(26); // a loop per block and the perimeter
    expect(small.walks!.length).toBe(10);
    expect(big.boxes.length).toBeGreaterThan(small.boxes.length);
    expect(big.wasps.length).toBe(5);
    expect(big.mechs.length).toBe(2);
    // the spawns stand in the perimeter street, 4.5 m inside the facade, as they do in a 3×3 district
    for (const s of big.spawns) expect(Math.max(Math.abs(s.pos.x), Math.abs(s.pos.z))).toBe(87 - 4.5);
  });

  it("every spawn reaches every node, every claim and both safe zones at street level", () => {
    const L = lease();
    const nav = buildNav(L);
    const reach = reachableFrom(nav, L.spawns[0]!.pos);
    const on = (x: number, z: number, what: string) => {
      const c = cellOf(nav, x, z);
      expect(walkable(nav, c.i, c.j), `${what} (${x}, ${z}) stands on walkable ground`).toBe(true);
      expect(reach.has(c.j * nav.w + c.i), `${what} (${x}, ${z}) is reachable from the first spawn`).toBe(true);
    };
    for (const s of L.spawns) on(s.pos.x, s.pos.z, "spawn");
    for (const n of L.nodes) on(n.pos.x, n.pos.z, `node ${n.label}`);
    for (const cl of L.claims!) on(cl.pos.x, cl.pos.z, `claim worth ${cl.value}`);
    for (const z of L.zones!) on(z.pos.x, z.pos.z, `safe zone ${z.label}`);
  });

  it("spawns, nodes, claims and zones stand clear of every box", () => {
    const L = lease();
    const free = (x: number, z: number) => capsuleFree({ x, y: 0.03, z }, MOVE.capsuleRadius, MOVE.standHeight, L.boxes);
    for (const s of L.spawns) expect(free(s.pos.x, s.pos.z), `spawn ${s.pos.x},${s.pos.z}`).toBe(true);
    for (const n of L.nodes) expect(free(n.pos.x, n.pos.z), `node ${n.label}`).toBe(true);
    for (const c of L.claims!) expect(free(c.pos.x, c.pos.z), `claim ${c.pos.x},${c.pos.z}`).toBe(true);
    for (const z of L.zones!) expect(free(z.pos.x, z.pos.z), `zone ${z.label}`).toBe(true);
  });

  it("everything the sim sends stays inside the district, and the district inside what a position can carry", () => {
    for (const spec of DISTRICT_SPECS) {
      const L = generateDistrict(spec);
      const H = L.bounds!;
      const pts: [string, { x: number; z: number }][] = [
        ...L.spawns.map((s) => ["spawn", s.pos] as [string, { x: number; z: number }]),
        ...L.nodes.map((n) => [`node ${n.label}`, n.pos] as [string, { x: number; z: number }]),
        ...L.claims!.map((c) => ["claim", c.pos] as [string, { x: number; z: number }]),
        ...L.zones!.map((z) => [`zone ${z.label}`, z.pos] as [string, { x: number; z: number }]),
        ...L.wasps.flatMap((w) => w.waypoints.map((p) => ["wasp waypoint", p] as [string, { x: number; z: number }])),
        ...L.mechs.flatMap((m) => m.path.map((p) => ["mech path", p] as [string, { x: number; z: number }])),
      ];
      for (const [what, p] of pts) expect(Math.max(Math.abs(p.x), Math.abs(p.z)), `${spec.id} ${what} (${p.x}, ${p.z}) inside the facades at ${H}`).toBeLessThan(H);
      expect(H).toBeLessThan(NET_LIMIT);
      // a grenade can land anywhere on the slab: its edge is inside the limit too
      const floor = L.boxes.find((b) => b.tag === "floor")!;
      expect(Math.max(-floor.min.x, floor.max.x, -floor.min.z, floor.max.z), `${spec.id} floor slab`).toBeLessThanOrEqual(254);
      expect(254).toBeLessThan(NET_LIMIT);
    }
  });

  it("THE RUN: more claims over the larger ground, worth more the deeper they lie, none in a safe zone", () => {
    const small = generateDistrict(LEASE_ROW_3X3);
    const L = lease();
    expect(small.claims).toHaveLength(11);
    expect(L.claims).toHaveLength(27);
    expect(L.zones!.map((z) => [z.label, z.pos.x, z.pos.z])).toEqual([["WEST GATE", -82.5, 16.5], ["EAST GATE", 82.5, 16.5]]);
    const depth = (p: { x: number; z: number }) => Math.min(...L.zones!.map((z) => Math.hypot(p.x - z.pos.x, p.z - z.pos.z)));
    const sorted = [...L.claims!].sort((a, b) => depth(a.pos) - depth(b.pos));
    for (let i = 1; i < sorted.length; i++) expect(sorted[i]!.value).toBeGreaterThanOrEqual(sorted[i - 1]!.value);
    for (const c of L.claims!) {
      expect(c.value).toBeGreaterThanOrEqual(1);
      expect(c.value).toBeLessThanOrEqual(5);
      for (const z of L.zones!) expect(Math.hypot(c.pos.x - z.pos.x, c.pos.z - z.pos.z)).toBeGreaterThan(z.radius + 2);
    }
    // values spread over the depth rather than capping a third of the way in: 2 near a gate, 5 at the far ring
    expect(Math.min(...L.claims!.map((c) => c.value))).toBe(2);
    expect(Math.max(...L.claims!.map((c) => c.value))).toBe(5);
    expect(L.claims!.filter((c) => c.value === 5).every((c) => Math.max(Math.abs(c.pos.x), Math.abs(c.pos.z)) > 33)).toBe(true);
    // and every quadrant of the outer ring carries one
    for (const [sx, sz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]] as const) {
      expect(L.claims!.some((c) => Math.sign(c.pos.x) === sx && Math.sign(c.pos.z) === sz && Math.max(Math.abs(c.pos.x), Math.abs(c.pos.z)) > 33), `quadrant ${sx},${sz}`).toBe(true);
    }
  });

  it("the wasps fly the streets: every leg of every patrol runs along a street's centreline", () => {
    const L = lease();
    const H = L.bounds!;
    const centrelines = Array.from({ length: 6 }, (_, k) => -H + 4.5 + k * 33); // the perimeter and the four inner streets
    expect(centrelines).toEqual([-82.5, -49.5, -16.5, 16.5, 49.5, 82.5]);
    const onStreet = (v: number) => centrelines.some((c) => Math.abs(v - c) < 1e-9);
    for (const w of L.wasps) {
      const pts = w.waypoints;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i]!;
        const b = pts[(i + 1) % pts.length]!;
        const alongX = Math.abs(a.z - b.z) < 1e-9 && onStreet(a.z);
        const alongZ = Math.abs(a.x - b.x) < 1e-9 && onStreet(a.x);
        expect(alongX || alongZ, `leg (${a.x}, ${a.z}) → (${b.x}, ${b.z})`).toBe(true);
      }
    }
  });

  it("the monorail's posts stand on sidewalks, never in the road of a crossing street", () => {
    const L = lease();
    const H = L.bounds!;
    const roads = Array.from({ length: 4 }, (_, k) => -H + 4.5 + (k + 1) * 33);
    for (const p of L.boxes.filter((b) => b.tag === "post")) {
      const x = (p.min.x + p.max.x) / 2;
      for (const r of roads) expect(Math.abs(x - r), `post at x ${x} vs the road at ${r}`).toBeGreaterThan(3);
    }
  });

  it("the generator refuses a spec whose blocks do not fill its grid, or whose centre is not the plaza", () => {
    const spec = districtById("lease_row")!;
    expect(() => generateDistrict({ ...spec, blocks: spec.blocks.slice(0, 9) })).toThrow(/9 blocks for a 5×5 grid/);
    const moved = [...spec.blocks];
    moved[12] = "tower";
    moved[6] = "plaza";
    expect(() => generateDistrict({ ...spec, blocks: moved })).toThrow(/centre block is tower/);
  });

  it("every district's signs fit the one atlas the renderer draws them from", () => {
    for (const spec of DISTRICT_SPECS) expect((generateDistrict(spec).signs ?? []).length, spec.id).toBeLessThanOrEqual(SIGN_ATLAS_SLOTS);
    expect((lease().signs ?? []).length).toBeGreaterThan((generateDistrict(LEASE_ROW_3X3).signs ?? []).length);
  });
});

describe("BLIND THE MODEL's two outer lattice posts are placed from the nodes", () => {
  const m5 = MISSIONS.find((m) => m.id === "m5_blind_the_model")!;
  const destroy = m5.objectives.find((o) => o.kind === "destroy") as Extract<Objective, { kind: "destroy" }>;

  it("they are the two courtyards they always were, on the 3×3 LEASE ROW and on the 5×5 one", () => {
    const placed = destroy.spots.filter((s) => "past" in s);
    expect(placed).toHaveLength(2);
    for (const L of [generateDistrict(LEASE_ROW_3X3), levelById("lease_row")]) {
      expect(placed.map((s) => resolveSpot(L, s)).map((p) => [p.x, p.z])).toEqual([[32, -32], [-34, 34]]);
    }
    // and in the 5×5 district each lies in the court block diagonally past its node, as it did at 3×3
    const spec = districtById("lease_row")!;
    const cellAt = (x: number) => Math.floor((x + 87 - 9 + 4.5) / 33);
    for (const p of placed.map((s) => resolveSpot(levelById("lease_row"), s))) expect(spec.blocks[cellAt(p.z) * 5 + cellAt(p.x)], `(${p.x}, ${p.z})`).toBe("court");
  });
});
