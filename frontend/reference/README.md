# Read-only original UI reference

Run the isolated Go review instance at port 3311, then `bun run reference`.
Open `http://127.0.0.1:3314/?page=preferences`.

Pages: `preferences`, `security`, `mapbox`, `site-general`, `site-visibility`,
`site-installation`, `site-danger`, `dashboard`, `new`, `login`, `setup`,
`activity`, `docs`, `error`, `analytics` (default).

Optional query parameters: `domain=example.com`, `theme=light|dark`,
`locale=zh-CN|en`, and the normal analytics period/filter query parameters.
The path can match the Go route, e.g. `/account?page=preferences`, when testing
header active state. Initial route redirects are intentionally omitted so
login/setup can be inspected without replacing the review database.

Snapshots retain original display DOM and import original components and CSS.
Explicitly removed business templates, integrations, health, Passkey and team
controls are excluded. The later compact gray footer and settings-side API
entry are deliberate exceptions. All `/api` writes are blocked by the dev
server before proxying; only reads reach the isolated Go instance. Forms are
for visual inspection, not editing. No original database services are used.
