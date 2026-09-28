# Stage 709 — district arrival art

Deadletter Docks and Repo Depot were still opening on their contract illustrations. Both now have their own 960×411 JPEG under `public/districts/`.

Generated with Higgsfield Soul Location, 21:9. Originals are 2560×1072. Each was center-cropped to 2504×1072 and resampled to 960×411 JPEG at quality 80. Mission banners were not replaced.

| District | Bytes | SHA-256 |
| --- | ---: | --- |
| Deadletter Docks | 44566 | `61e2757686b75425c2bcfac8cbf8c2378d90ffcf6e88b10f309fa4a254ef5e8a` |
| Repo Depot | 54858 | `b6e19e40e02534b409590ff1aeab8eb925df87f77d9214682ff38899b450e84e` |

A first Repo Depot result included readable fence labels and was not shipped. The shipped yard has no lettering. Pointing `LEVEL_ART.deadletter_docks` back at the mission banner failed `tests/loading.test.ts` once; the district path was restored.
