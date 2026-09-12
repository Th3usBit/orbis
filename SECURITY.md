# Security Policy

## Scope

orbis is a static site plus a set of Python scripts. It has no backend, no
database, no user accounts, no cookies, no analytics and no telemetry. It
stores nothing about whoever opens it beyond a language preference in
`localStorage`.

That removes most of the usual attack surface, but not all of it. Things worth
reporting:

- Code execution or path traversal in `scripts/serve.py` (the local dev server).
- Injection through calendar data rendered into the DOM (event titles and
  country names come from third-party feeds and must never be trusted as HTML).
- A dependency-free claim that turns out to be false — anything executing
  unreviewed remote code at build or run time, or any request the page makes to
  a host other than its own origin.
- Supply-chain concerns with the third-party files under `vendor/` — three.js
  or a font arriving modified, or a bump that pulls in something it should not.

Not in scope: the accuracy, availability or licensing of upstream calendar data,
and anything you can only trigger by pointing the collector at a host you
control.

## Reporting

Report privately through GitHub Security Advisories:

**Security → Report a vulnerability** on the repository page.

That opens a private thread with the maintainers. Please do not open a public
issue for a vulnerability until it is fixed.

Expect an acknowledgement within a week. This is a spare-time project, so
please be patient with fixes — but do say if you plan to disclose publicly on a
deadline, and it will be respected.

## Supported versions

The `main` branch is the only supported version. There are no releases to
backport to.
