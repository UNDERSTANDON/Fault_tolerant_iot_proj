# Plan: Stage 3 — Local User Accounts and Browser Sessions

## Status

Implementation approved by user.

Current implementation provides local admin bootstrap, HttpOnly sessions, and
administrator-only visitor account creation and disablement. Visitor dashboard
access is limited to connection diagnostics. Password recovery and at-rest
encryption are not implemented. The first-created administrator remains the
sole administrator; later records with an admin role are restored to visitor,
and active sessions use the latest stored role. First-admin provisioning is
performed locally with `npm run setup:admin`; HTTP bootstrap is disabled.

Secured few UI evidences in [./log_evidence/Local_user_and_session].

Human review: LGTM but might need a bit more audit.

## Goal

Replace the dashboard's mock browser-only account flow with a local
browser-to-server authentication and settings flow. Support one system
administrator account and administrator-created visitor accounts. Preserve an
authenticated browser session across page refreshes without asking the user
to paste the bridge token again.

This stage does not depend on GPIO placement and does not implement sensor
sampling, actuator commands, or hardware behavior.

## Current behavior and boundaries

- `main/web_hoster/web/react_app/src/hooks/useAuth.js` authenticates against
  the local server with an HttpOnly session cookie; it does not persist users
  or credentials in browser storage.
- `main/web_hoster/web/react_app/src/hooks/useSmartHome.js` opens the
  connectivity-test WSS channel using the browser's session cookie.
- `local_server/lan_broker_bridge.mjs` validates the cookie-backed session
  for browser HTTP/WSS requests and uses broker credentials only for its
  server-to-broker connection.
- The dashboard fetches the signed-in user's theme preference after login and
  refresh. The API accepts only the supported `light` or `dark` theme field;
  the dashboard does not yet expose a preference-editing control.
- The former `BRIDGE_BROWSER_TOKEN` setup is obsolete. The broker initializer
  no longer creates it, and LAN configuration removes any stale entry from
  the ignored broker credentials file.
- Browser `localStorage`, JavaScript memory, URLs, and frontend build
  variables are not suitable storage locations for reusable bridge or broker
  credentials.
- The browser must not receive the existing shared bridge token. The local
  service should authenticate browser HTTP/WSS requests using the user's
  server-side session and use broker credentials only for its server-to-broker
  connection.

## Scope

### Included

- Server-side local account storage and authentication.
- Exactly one system administrator account, provisioned from a host-local
  terminal; no public or LAN administrator sign-up.
- Administrator ability to create, disable, and manage visitor accounts.
- Visitor access to the dashboard's currently supported read-only
  connectivity-test view.
- Authenticated browser-to-local-server communication over HTTPS/WSS.
- Session-only browser authentication that survives page refreshes and is
  invalidated on logout or server-side revocation.
- Per-user, non-secret preferences fetched after login through an authenticated
  settings endpoint.
- Server-side persistence of account records and local service configuration
  in the laptop's application-data directory.
- Clear user-facing login, logout, session-expiration, unauthorized, and
  server-unavailable behavior.
- Tests for authentication, role authorization, session lifecycle, settings
  access, and secret non-disclosure.

### Deferred

- GPIO mapping, sensors, actuators, device control, safety behavior, and
  production telemetry.
- Internet-facing accounts, remote access, cloud identity providers, and
  multi-site identity management.
- Storing bridge tokens in browser `localStorage`, `sessionStorage`, cookies,
  URLs, or frontend environment variables.
- Claims that local accounts provide strong protection against a person with
  administrator access to the laptop.
- Public self-service visitor registration unless separately approved.

## Proposed account and permission model

- **System administrator:** one account, created through a local first-run
  setup flow. The administrator can create, disable, and manage visitor
  accounts.
- **Visitor:** created by the administrator, can sign in and view the
  read-only connectivity-test status. A visitor cannot create accounts,
  change server configuration, or issue device commands.
- The current mock credentials and mock user records must not be migrated as
  trusted accounts. Remove the demo sign-in path once the replacement is
  verified; require fresh local administrator bootstrap.
- Store only the minimum user profile required (for example, unique username,
  password hash, role, enabled state, and creation metadata). Never persist
  plaintext account passwords.

## Proposed storage and session model

- Store account records and local service configuration under a dedicated
  application-data directory outside the repository. Restrict filesystem
  access to the current OS user where supported.
- Hash passwords with a dedicated password-hashing algorithm and per-password
  salts; use a maintained implementation and parameters suitable for the
  supported runtime.
- Replace `BRIDGE_BROWSER_TOKEN` authentication with a browser session
  validated by the Node service. The browser does not need to fetch or retain
  a shared bridge token.
- Keep broker connection credentials server-side in local configuration;
  never return them in user settings or expose them to frontend code.
- Authenticate browser requests with an unpredictable server-side session
  identifier in a `Secure`, `HttpOnly`, appropriately `SameSite` cookie.
  Rotate the session identifier after login and invalidate it on logout,
  account disablement, password change, or administrator revocation.
- Use a browser-session cookie without a persistent `Max-Age` or `Expires`
  attribute so a page refresh retains the session without storing a token in
  JavaScript. Browser session restore may preserve the cookie; server-side
  expiration still limits session lifetime.
- On page load, request session status; after login or refresh with a valid
  session, GET the current user's non-secret profile/preferences. Never
  provide an endpoint that returns session secrets or broker credentials.
- Authenticate the browser's WSS handshake using the same session cookie and
  enforce the same account/role checks as HTTP endpoints. The Node service
  maintains the broker connection independently of page refreshes.
- Protect state-changing endpoints against cross-site request forgery, enforce
  exact allowed origins, validate inputs, limit login attempts, and avoid
  logging passwords, session identifiers, cookies, or bridge tokens.
- Use HTTPS/WSS and validate certificates. Do not weaken TLS verification to
  make local development easier.

## Implementation and verification steps

1. **Confirm setup and recovery boundaries**
   - First-admin setup is resolved as a host-local command that prompts for
     credentials without echoing the password. There is no HTTP bootstrap
     endpoint; the command refuses to overwrite an existing account file.
   - Specify how an administrator recovers access if the password is lost,
     without silently resetting credentials or exposing existing secrets.
   - Confirm the exact OS application-data paths, permissions, backup, and
     deletion behavior. Never place secrets in the repository.
   - Decide whether the local data file needs platform encryption in addition
     to filesystem permissions; document portability and backup implications.

2. **Implement server-side accounts**
   - Add account persistence and host-local administrator provisioning.
   - Implement password hashing, login, logout, session rotation/expiry,
     visitor creation/disablement, and authorization checks.
   - Ensure there can be only one active system administrator account.
   - Reject unauthenticated, disabled-account, invalid-role, malformed, and
     unauthorized requests explicitly.

3. **Implement authenticated settings and bridge use**
   - Add authenticated endpoints for retrieving and updating only
     non-secret user-scoped preferences and the public profile.
   - Replace shared browser-token authentication on the bridge with the
     authenticated server-side session. Validate the session on browser WSS
     connections; do not send a reusable token from the browser.
   - Keep broker credentials in server-side local configuration. Never
     return them in an API response.
   - Enforce administrator-only visitor management.
   - Keep broker credentials distinct from browser account credentials and
     bridge/browser session credentials.

4. **Integrate the dashboard**
   - Replace mock login and browser `localStorage` user/session handling with
     the server's login/logout/session APIs.
   - On page load, ask the server whether the session is authenticated; after
     authentication, fetch that user's non-secret settings.
   - Preserve login across refresh using the HttpOnly session cookie; do not
     expose session or bridge tokens to JavaScript.
   - Show session expiry, authentication failure, and service-unavailable
     states without falling back to simulated success.
   - Keep visitor functionality read-only and clearly label test messages as
     connectivity-test data.

5. **Security and behavior tests**
   - Verify first-admin provisioning is host-local, refuses to overwrite an
     existing account file, and does not use a committed/default password.
   - Verify password hashes, role separation, visitor disablement, and
     administrator-only actions.
   - Verify login rotates the session, refresh retains the same valid session,
     logout invalidates it, and server-side revocation prevents further use.
   - Verify browser settings responses never contain bridge or broker
     credentials, and secrets are absent from bundles, URLs, logs, and
     browser storage.
   - Verify unauthenticated and cross-origin state-changing requests are
     rejected; test CSRF protection, origin validation, rate limiting, and
     secure cookie flags over HTTPS.
   - Verify the server maintains broker connectivity and the user remains
     authenticated across refresh without pasting a bridge token.
   - Verify no visitor operation can publish MQTT messages or control devices.

   **Automated verification completed**

   Run `cd local_server; npm test`. The auth integration suite verifies
   host-local first-admin provisioning, disabled HTTP bootstrap, refusal to
   overwrite existing account files, fail-closed handling of malformed
   account storage, and password hashing;
   administrator-only user management; forced visitor role; visitor
   disablement and session revocation; session rotation, refresh continuity,
   expiry, and logout; settings and log secret non-disclosure; exact-origin
   CORS/CSRF checks; login rate limiting; and read-only HTTP/WSS access.
   HTTPS tests generate a temporary local certificate and verify `Secure`,
   `HttpOnly`, and `SameSite` session-cookie attributes without disabling
   client certificate validation; login cookies have no persistent lifetime
   attribute. Tests also cover safe settings-field validation and ensure
   health responses omit local filesystem paths. The tests use isolated
   temporary app-data directories and do not read or modify the real account
   store.

   Browser source and built-asset inspection found no `localStorage` or
   `sessionStorage` access. The shared dashboard browser was checked for
   query-string secrets and browser storage entries; the HTTPS integration
   test verifies the session cookie is HttpOnly and Secure. The dashboard
   fetches the authenticated user's settings after session restoration or
   sign-in and surfaces settings-load failures. Preference editing remains
   outside the current dashboard UI.

   **Not established by the automated auth suite:** live MQTT broker
   connectivity/recovery and end-to-end phone refresh while attached to the
   configured hotspot. Run the existing LAN stability test against the
   restarted bridge and real broker to verify those deployment-specific
   checks. The account model does not provide password recovery or encrypted
   account-file storage.

6. **Review and stop**
   - Record the tested setup, account recovery procedure, storage location and
     protections, session lifetime behavior, permissions, and remaining
     limitations without recording credentials.
   - Stop for user review and a separate safe commit. Do not proceed to GPIO,
     sensors, actuators, or device commands in this stage.

## Acceptance criteria

- No default or public administrator credentials are shipped.
- Exactly one system administrator can be bootstrapped and visitor accounts
  are created and managed by that administrator.
- User passwords are not stored in plaintext.
- A page refresh preserves the authenticated session without prompting for
  the bridge token again.
- The shared browser bridge token is no longer required or sent to the
  browser; browser HTTP/WSS access is authorized using the server-side user
  session.
- Broker credentials remain server-side and are never returned to the browser
  or stored in browser-accessible storage.
- The browser can fetch only the authenticated user's allowed, non-secret
  settings.
- Visitor users are read-only and cannot manage users, change bridge
  credentials, or issue device commands.
- Logout and server-side session revocation invalidate access.
- HTTPS/WSS, secure cookie flags, origin checks, CSRF defenses, and explicit
  failure handling are verified.
- No sensor, GPIO, actuator, or safety behavior is presented as implemented.
- The user reviews and independently commits Stage 3 after acceptance.

## Decisions and open questions for implementation review

- “Until the page closes” is approximated by a browser-session cookie with
  server-side six-hour expiration. Browser restore behavior may retain session
  cookies, and a cookie cannot reliably express “expire as soon as this one
  tab closes.”
- Administrator setup is host-local. Password recovery remains unresolved;
  no reset operation is exposed.
- Confirm which non-secret preferences are user-specific and which service
  configuration is system-wide. Broker credentials remain system-level and
  server-only.
- Confirm whether at-rest encryption is required beyond OS-user file
  permissions and how backup/restore should work.
- TLS trust distribution to test phones/browsers remains an operational
  limitation and must not be bypassed silently.
