# Security Policy

## Supported Versions

Only the latest published version of `twelvelabs-mcp-server` receives security
updates. Older versions on npm are immutable and will not be patched — upgrade
to the latest release.

## Reporting a Vulnerability

If you believe you have found a security vulnerability in this project, please
report it privately rather than opening a public issue.

- **Preferred:** open a private advisory via GitHub Security Advisories on the
  [repository](https://github.com/micro-JAY/twelvelabs-mcp-server/security/advisories/new).
- **Alternative:** email the maintainer (see `author` in `package.json` for the
  contact org; route through the GitHub profile linked in the repo).

Please include:

- A description of the issue and the impact you believe it has.
- Steps to reproduce, or a minimal proof-of-concept.
- The version of `twelvelabs-mcp-server` affected.
- Any suggested mitigation if you have one.

## Disclosure Process

- We aim to acknowledge new reports within **3 business days**.
- Once a fix is ready, we publish a patched version to npm and credit the
  reporter in the release notes (unless anonymity is requested).
- We follow a **90-day** coordinated disclosure window from initial report.

## Scope

In scope:

- Vulnerabilities in this package's own code (`src/`) — input validation
  bypass, path traversal, credential leakage, prompt injection that elevates
  privileges beyond what an MCP tool call should expose.
- Issues in how this package handles the `ELEVENLABS_API_KEY` or webhook URLs.

Out of scope:

- Issues in the upstream ElevenLabs API itself — report those to
  [ElevenLabs](https://elevenlabs.io).
- Vulnerabilities in transitive dependencies that have a published advisory
  and a fix available via `npm audit fix` — please open a normal PR or issue
  for those.
