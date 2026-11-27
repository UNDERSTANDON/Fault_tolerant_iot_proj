# Progress: Firebase delivery

**The isolated synthetic-test path is substantially implemented and verified, but production delivery is not complete.** The current status is in the `Firebase delivery spec`.

**Verified**

- The Firestore emulator smoke test passed, including write/readback, duplicate replay, outbox acknowledgement, and cleanup (`evidence`).
- A live test-project MQTT-to-Firestore run passed with readback, duplicate handling, and cleanup using a local MQTT test client (`evidence`).
- A fresh physical ESP32 run generated four synthetic events; read-only Firestore lookups verified all four exact event IDs and synthetic markers in the test project (`device evidence`).
- The bridge has a synthetic-only file outbox and delivery worker (`implementation`); firmware publishing is opt-in and disabled by default (`firmware`).
- `npm --prefix local_server test` passed: **16 tests, 0 failures**.
- `Firestore rules` deny client reads and writes. The server-side Admin SDK path uses IAM instead.

**Remaining**

- Production event producer/schema and production delivery are not implemented; current cloud flow is test-only.
- Verify live outage/recovery, IAM denial/throttling, and operational queue recovery/capacity. Some related behavior has unit tests, not live integration coverage.
- Settle production credential/IAM, retention, and overflow policies. A dashboard event feed is also absent.

**Bottom line:** The test path is progressing well, but production delivery should not yet be considered complete. AP+STA/GPIO work remains deferred. The spec, broker verifier, and Firebase evidence files are currently uncommitted. I made no repository changes during this review.
