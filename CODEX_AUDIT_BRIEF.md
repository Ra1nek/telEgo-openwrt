# Codex Audit Brief — telEgo OpenWrt

## Purpose

Perform an **independent, evidence-based audit** of the current `develop` branch of `Ra1nek/telEgo-openwrt`.

Do **not** assume that previous design or implementation decisions are correct just because they are documented here. Treat this document as intent/context only. The repository code, tests, generated runtime config, OpenWrt/LuCI contracts and upstream telEgo v0.6.5 behavior are the source of truth.

The primary goal is to answer:

> Are the recent DD transport, status UI, link-generator, optional TLS Fronting and Advanced UI changes correct, safe, backward-compatible, testable and release-ready?

Do not modify code until the audit report is complete.

---

## Repository / audit snapshot

Repository:

`Ra1nek/telEgo-openwrt`

Target branch:

`develop`

Code snapshot to audit:

`b1c74c97d4b87726d7813a8b36b8cb046e6681a2`

Baseline before this change set:

`334eeec76f11d30434ef3ae1e0ba40d41b75fc08`

Audit range:

`334eeec76f11d30434ef3ae1e0ba40d41b75fc08...b1c74c97d4b87726d7813a8b36b8cb046e6681a2`

The commit which adds this document is documentation-only and is not part of the implementation under review.

Current package releases at the audited snapshot:

- `telego-pkg 0.6.5-r4`
- `luci-app-telego 0.6.5-r10`
- `luci-i18n-telego-ru 0.6.5-r7`
- `nginx-telego 0.6.5-r8`

At handoff creation time, `Lint and Static Quality` and `CodeQL Security Analysis` were green for the code snapshot, while the full `Build telEgo Packages` workflow was still in progress. Re-check current CI yourself; do not rely on this snapshot.

---

## Commit sequence in scope

1. `852869a3a09f2c9641fb4a29806bcd6f488b00c5`  
   `feat(dd): add paced downstream shaping for restrictive networks`

2. `89d9fc60102cfd1f0422d0ecd2bd32d7fbe8af5d`  
   `fix(dd): make shaping patch CI-clean`

3. `4756f41b548c50b31fbd81c6daafd3b6e1de1bd0`  
   `fix(dd): preserve relay hard-limit before pacing`

4. `186dbb242964ff79a69d638e06c9155f0d5bdd87`  
   `refactor(ui): hide disabled runtime status groups`

5. `63f385cb8bcb612e2f0a42f36d65cd2c47dd1646`  
   `fix(ui): scope status polling to rendered view`

6. `fc59400b22bed7480c95e5d46093b6977f32b820`  
   `test(ui): cover disabled optional runtime values`

7. `d7a915976d55d2300f052bfa5621c699b59b8147`  
   `feat(ui): add per-user DD and EE link generator`

8. `b15f21230f9a5b9aeff2dca25fdeccf16466f6dd`  
   `feat(tls): make TLS Fronting optional for DD-only mode`

9. `0ae9ff0e72f5fa9fec7259c4a99b0bef5c4ea3f2`  
   `test(tls): fix optional fronting assertions`

10. `e722dc8e73b7bdb63a386366fe49b604405a3d25`  
    `test(tls): fix optional fronting assertions`

11. `60a95d1083420ee133a8ce78027f3e1ba18cd82c`  
    `refactor(ui): move expert runtime controls to Advanced Settings`

12. `90b3d91493b044b648d9626716f00d0025baa513`  
    `fix(ui): pass user section id to link generator`

13. `b1c74c97d4b87726d7813a8b36b8cb046e6681a2`  
    `fix(ui): keep EE link tab enabled with TLS fronting`

---

## Architectural path that must be audited end-to-end

Audit the full configuration/runtime pipeline, not isolated files:

```
LuCI UI
  ↓
UCI (/etc/config/telego, /etc/config/nginx_telego)
  ↓
OpenWrt init/render helpers
  ↓
/var/etc/telego.toml and generated Nginx configuration
  ↓
patched telEgo v0.6.5
  ↓
runtime behavior
```

Also audit:

```
LuCI status page
  ↓
rpcd ucode status backend
  ↓
metrics/runtime state
  ↓
conditional UI rendering
```

and:

```
per-user base secret
  ↓
browser-only link derivation
  ↓
DD / EE secret
  ↓
tg://proxy link
```

---

# Change area A — DD downstream shaping

## Intent

The project observed a mobile-network failure mode where raw DD/Obfuscated2 could pass short Telegram control/text traffic while sustained downstream media degraded badly.

The implemented experiment adds optional raw-DD proxy→client shaping to the pinned telEgo v0.6.5 source.

Relevant repository patch:

`patches/0001-dd-downlink-shaping.patch`

New config keys:

```toml
[performance]
dd-downlink-chunk = 0
dd-downlink-delay = "0s"
```

Defaults must preserve upstream behavior.

Expected semantics:

- `chunk=0`, `delay=0s` => upstream/raw behavior.
- nonzero chunk limits each DD downstream relay write.
- nonzero delay spaces DD downstream writes.
- pacing must be non-blocking; no `sleep()` in a gnet event loop.
- EE behavior must not change.
- client→proxy traffic must not be shaped by these fields.
- relay/OOM/backpressure hard limits must remain enforced before pacing.
- `dd-downlink-delay > 0` without a nonzero chunk must be rejected.

Manual router testing outside the repository indicated that `1200 / 5ms` produced a visibly paced downstream stream and avoided >1200-byte TCP payloads in that particular capture. Treat that as field evidence, not proof of correctness.

## Audit questions

- Is `time.AfterFunc + Wake()` safe for gnet lifecycle, close races and high connection counts?
- Can timers fire after connection reuse or after stale context state?
- Can `ddWakeScheduled` create starvation, missed wakes or duplicate wake races?
- Does pacing allow inbound DC buffering to exceed intended limits?
- Is the hard-limit check placed correctly relative to the pacing deadline?
- Does cipher state advance only for bytes actually committed downstream?
- Is traffic accounting correct?
- Are timers / atomics necessary and sufficient?
- Is `1200` treated as a write cap only, without falsely guaranteeing TCP packet boundaries?
- Are config bounds correct and documented?
- Is this patch maintainable across future upstream telEgo upgrades?

---

# P1 — Conditional Status

## Intent

Optional runtime sections must not clutter the Status view when the corresponding feature is disabled.

Expected behavior:

- WEB Proxy runtime group is hidden if `web_enabled=false`.
- Middle-End runtime group is hidden if `middleend_enabled=false`.
- optional groups are hidden before the first successful RPC response to prevent flash-of-empty-state.
- polling can transition enabled → disabled → enabled without page reload.
- hidden stale numeric values should not remain semantically active.
- RPC schema remains stable; backend can still return numeric zero values.

Relevant files include:

- `package/luci-app-telego/htdocs/resources/view/telego/config.js`
- `package/luci-app-telego/root/usr/share/rpcd/ucode/telego`
- `.github/tests/luci-config.cjs`

## Audit questions

- Does `hidden` behave correctly in actual LuCI/browser DOM?
- Is polling scoped to the rendered root and safe across navigation/unmount/remount?
- Can repeated visits register duplicate polling callbacks?
- Are disabled groups hidden accessibly and semantically, not just visually?
- Is stale-state handling correct when metrics disappear or RPC fails?
- Does the test DOM accurately model relevant browser behavior?

---

# P2 — DD / EE Link Generator

## Intent

A user stores one base 32-hex secret. DD and EE/FakeTLS client secrets are derived locally in the browser.

Expected formulas from upstream telEgo v0.6.5:

```
DD = "dd" + 32-hex-base-secret

EE = "ee" + 32-hex-base-secret + hex(UTF-8(mask_host))
```

Telegram link:

```
tg://proxy?server=<public_host>&port=<public_port>&secret=<derived_secret>
```

No new RPC is required for secret derivation. The browser should not send the secret to an external QR/link service.

New metadata:

- `general.public_host`
- `general.public_port`

These are link-generation metadata only and must not change the listener.

If `public_port` is empty, the generator may derive the port from `general.bind_to`.

Relevant files:

- `package/luci-app-telego/htdocs/resources/view/telego/config.js`
- `.github/tests/luci-config.cjs`

## Known bugs already found and fixed

Two real-router/browser bugs were discovered after initial implementation:

1. LuCI `form.Button.onclick` uses `(event, section_id)`; the original code treated the first argument as `section_id`, producing modal titles such as `[object PointerEvent]` and failing to load the user secret. Fixed in `90b3d914...`.

2. HTML boolean attributes treat the presence of `disabled` as disabled even if its textual value is false. The code originally emitted `disabled: false`, leaving EE disabled. It was changed to LuCI/browser-safe null-or-`disabled` semantics in `b1c74c97...`.

Also verify that the GridSection Links button uses the correct `editable` behavior.

## Audit questions

- Verify DD and EE derivation against actual upstream telEgo v0.6.5 code.
- Verify UTF-8 → hex behavior for IDN / non-ASCII hostnames and whether such hosts should be normalized/punycode first.
- Verify IPv4, IPv6 and hostname URL encoding.
- Verify public endpoint validation and whether bracketed IPv6 is handled.
- Verify `listenPort()` parsing for IPv6 bind strings.
- Verify secret values never leak to logs, notifications, telemetry or third-party calls.
- Verify clipboard fallback works under LuCI CSP/browser constraints.
- Verify modal state and tab state across repeated opens.
- Verify link generation against unsaved form edits vs persisted UCI values: decide which behavior is intended and whether current behavior is surprising.
- Verify accessibility, keyboard navigation and mobile layout.

---

# P3 — Optional TLS Fronting / DD-only mode

## Intent

TLS Fronting must be a real optional feature, not merely hidden fields.

New UCI/TOML concept:

```
config tls_fronting 'tls_fronting'
    option enabled '1'
```

Expected compatibility rule:

- if the option is absent on an existing installation, behavior remains historically enabled.
- explicit `enabled=0` activates DD-only behavior.

Core patch:

`patches/0002-optional-tls-fronting.patch`

Expected DD-only semantics:

- `mask-host` is not required.
- raw DD remains functional.
- incoming EE/TLS is rejected before FakeTLS processing.
- real certificate / ServerHello fetchers are not activated.
- TLS splice/fallback is not activated.
- DRS / Split TLS are not active.
- clock-sync URL is irrelevant.
- generated runtime TLS block should reduce to the explicit disabled state rather than activating stale stored values.
- stored UCI TLS values may remain preserved for later re-enable.

Native Shared-Port requires TLS Fronting and must reject the invalid combination at multiple boundaries:

- LuCI validation.
- `nginx-telego-render`.
- `/etc/init.d/telego`.

## Audit questions

- Is pointer-bool backward compatibility in upstream config parsing correct?
- Does any upstream initialization still assume a non-empty mask host before the new guard applies?
- Are certificate/ServerHello fetchers truly not instantiated or invoked?
- Is EE rejection early enough and resource-safe?
- Does unknown raw traffic accidentally enter TLS splice paths when TLS Fronting is disabled?
- Are `Secret.Host` / `RawHex` empty values safe for DD paths?
- Can any command such as link-printing, diagnostics or config validation panic/behave incorrectly with DD-only secrets?
- Does disabling TLS Fronting create stale runtime state in a long-running process, or is restart mandatory and correctly enforced?
- Do all Native Shared-Port entry paths reject TLS OFF, including manual UCI edits and service reload order?
- Does Cloudflare / Direct HTTPS remain independent where intended?

---

# P4 — Advanced Settings refactor

## Current implementation

The current branch contains a dedicated:

`package/luci-app-telego/htdocs/resources/view/telego/advanced.js`

and menu entry:

`Advanced Settings`

The intention was to remove rare/expert options from the main Configuration page while preserving all UCI semantics.

Main Configuration should retain only core service controls, while the Advanced page contains:

- MTProxy PROXY protocol / limits / handshake / clock sync.
- TLS certificate/splice/SNI/DRS/Split TLS.
- WEB Proxy trusted CIDRs/backend/event loops.
- Middle-End SOCKS/NAT/artifact/queue limits.
- Performance.
- Upstream SOCKS5.
- Metrics/diagnostics.

Feature-aware behavior should avoid showing irrelevant controls when TLS Fronting, WEB Proxy or Middle-End is disabled.

## Important UX status

This P4 implementation is technically current, but it is **not considered the final desired UX**.

After real visual review, the dedicated global Advanced page was judged too dense and intimidating.

Do not confuse:

- "is P4 technically correct and safe?"
with
- "is P4 the desired final information architecture?"

Both should be evaluated separately.

## Audit questions

- Did moving fields change save/apply semantics?
- Are any UCI options now inaccessible under legitimate configurations?
- Are options duplicated across Configuration / Advanced / WEB Ingress?
- Are hidden options preserved correctly?
- Do field validators remain identical after the move?
- Does `advanced.js` correctly handle missing `nginx_telego` package/config?
- Does feature-aware rendering cause values to become impossible to edit when a feature is temporarily disabled?
- Are advanced fields that Native Shared-Port manages automatically clearly distinguished from administrator-owned fields?
- Is the page mobile/responsive?
- Do menu ordering, translations and ACL dependencies remain correct?

---

# P5 concept — NOT implemented yet

The next proposed UI direction is inspired by the information architecture of:

`ushan0v/forkop`

Reference repository:

https://github.com/ushan0v/forkop

Do not assume P5 exists in code.

The intended direction is:

- replace the global Advanced page with contextual progressive disclosure.
- use a unified application shell / internal tabs.
- keep expert settings attached to the feature they affect.
- use compact entity rows and modal details.
- add a polished Connection Card for DD/EE with local QR generation.
- move Nginx files / metrics / diagnostics away from the everyday configuration path.

Proposed high-level navigation:

```
[ Overview ] [ MTProxy ] [ WEB Ingress ] [ Diagnostics ]
```

Within MTProxy:

```
MTProxy card
  └─ Advanced disclosure

Users grid
  └─ Connection modal
      ├─ DD / Raw
      ├─ EE / FakeTLS
      ├─ local QR
      ├─ copy link
      └─ open Telegram

TLS Fronting card
  └─ Advanced disclosure

WEB Proxy card
  └─ Advanced disclosure

Middle-End card
  └─ Advanced disclosure
```

The audit should comment on whether this direction is architecturally sound and whether the current P1–P4 code should be reshaped before further UI work.

Useful forkop implementation areas to inspect:

- LuCI tabbed application shell.
- server GridSection.
- server information modal.
- QR generation and local rendering.
- responsive modal styles.
- separation between everyday actions and details.

Do not copy forkop code blindly; evaluate compatibility, licensing, maintainability and LuCI conventions first.

---

# Native Shared-Port / WEB ingress invariants

This area has had earlier production hardening and must not regress.

Expected Native Shared-Port topology conceptually:

```
public :443
  ↓
telEgo
  ├─ authenticated MTProxy
  └─ normal TLS splice
       ↓
     Nginx private listener
       ↓
     telEgo WEB backend
```

Current managed contract includes fixed/private topology assumptions and PROXY protocol usage.

Audit interactions among:

- `package/luci-app-telego/htdocs/resources/view/telego/ingress.js`
- `package/nginx-telego/files/usr/libexec/nginx-telego-render`
- `package/nginx-telego/files/usr/libexec/nginx-telego-platform`
- `package/nginx-telego/files/usr/libexec/nginx-telego-firewall`
- `package/telego-pkg/files/init.d/telego`

Verify that P3/P4 did not weaken previous Direct HTTPS / Shared-Port / Cloudflare validation.

---

# Middle-End

Middle-End is server→Telegram topology, not client→server masking.

Audit that UI copy and implementation do not imply that Middle-End can solve client-side mobile DPI ingress failures.

When Middle-End is disabled:

- runtime status group should disappear.
- advanced runtime controls should not clutter the main page.
- backend schema may remain stable.

When enabled, existing upstream prerequisites and resource semantics must remain correct.

---

# Security / privacy requirements

Audit explicitly for:

- base secrets rendered unnecessarily in HTML.
- secrets exposed in table text, logs, console, telemetry or RPC beyond what is required.
- generated `tg://` links leaking to third parties.
- clipboard and QR implementation behavior.
- unsafe DOM injection / XSS from usernames, hostnames, URLs or server-provided strings.
- shell injection in UCI→TOML renderers.
- TOML quoting/escaping correctness.
- hostname / IP validation gaps.
- privilege boundary issues in rpcd ucode.
- accidental exposure of metrics or diagnostics off loopback.
- invalid PROXY protocol trust configuration.
- unsafe fallback/splice targets.
- package upgrade paths that overwrite administrator-owned state.

Never include real user secrets in the audit report.

---

# Backward compatibility / upgrade audit

Test or reason through at least these upgrade states:

1. Existing install before `tls_fronting.enabled` exists.
2. Existing install with EE configuration and mask host.
3. Existing DD-only user after setting TLS Fronting OFF.
4. Existing Native Shared-Port install.
5. Existing Direct HTTPS install.
6. Existing Cloudflare ingress install.
7. Existing custom advanced values before P4 moves their UI location.
8. Upgrade from older package revisions where UCI default files are not automatically re-created.
9. Fresh install from current packages.
10. Package reinstall / reconcile behavior.

Pay special attention to the difference between:

- default config shipped in APK,
- existing `/etc/config/telego`,
- UCI migration/reconcile behavior,
- generated `/var/etc/telego.toml`.

---

# LuCI correctness checklist

Do not rely only on custom smoke mocks.

Verify against actual LuCI API contracts where possible:

- `form.Button.onclick(event, section_id)`.
- `GridSection` editable/action behavior.
- boolean HTML attributes: `disabled`, `hidden`, etc.
- `depends()` semantics.
- `datatype` behavior.
- `ui.showModal()` lifecycle.
- event handler binding.
- polling lifecycle and duplicate registration.
- DOM/root scoping.
- accessibility / keyboard behavior.
- mobile width behavior.
- browser Clipboard API fallback.
- CSP compatibility.

The recent PointerEvent and `disabled=false` bugs are evidence that mocks can pass while real LuCI/browser behavior is wrong. Look for similar assumptions elsewhere.

---

# Test quality audit

Review whether current tests detect behavior rather than merely implementation shape.

Important tests include:

- `.github/tests/luci-config.cjs`
- `.github/tests/luci-advanced.cjs`
- `.github/tests/luci-ingress.cjs`
- `.github/tests/luci-nginx-files.cjs`
- `.github/tests/telego-config-render.sh`
- `.github/tests/nginx-telego.sh`
- upstream-patched Go tests added through `patches/*.patch`

Identify mocks that are weaker than real LuCI/browser/OpenWrt behavior.

Recommend targeted browser-level or integration coverage where it would have caught real bugs.

---

# CI / packaging audit

Verify:

- source patches are applied in deterministic order.
- `git apply --check` fails loudly on upstream drift.
- Go formatting, vet and tests cover all patched files.
- package release increments match actual changed packages.
- no package revision was bumped unnecessarily or omitted.
- OpenWrt APK matrix/smoke tests still cover current 25.12.x targets.
- path filters cause relevant workflows to run when patch/test/UI files change.
- installer/update logic selects the expected package revisions.
- fresh install and upgrade do not mix new LuCI with old daemon behavior in an unsafe way.

---

# Recommended audit process

## Phase 1 — Read-only architecture review

1. Read the audit range diff.
2. Read current `develop` files, not only commit diffs.
3. Read pinned upstream telEgo v0.6.5 code touched by `patches/0001` and `0002`.
4. Read actual OpenWrt LuCI APIs used by the modified UI.
5. Trace configuration end-to-end.
6. Inspect current CI and failed historical runs where relevant.
7. Do not change code.

## Phase 2 — Reproduction / targeted tests

Where practical, reproduce suspicious behavior with:

- existing unit/smoke tests,
- minimal focused tests,
- shell render tests,
- Go tests,
- actual LuCI contract inspection.

Do not add permanent fixes yet.

## Phase 3 — Report

Produce the full report before making changes.

## Phase 4 — Fixes only after approval

If explicitly asked to fix findings:

- Critical and Major first.
- one logical concern per commit where practical.
- preserve backward compatibility.
- add a regression test for every fixed defect.
- run all relevant CI.
- report residual risks.

---

# Required report format

Start with an executive summary, then use a finding table.

For every finding include:

- **Severity:** Critical / Major / Minor / Note.
- **Area:** DD, P1, P2, P3, P4, ingress, packaging, tests, security, UX.
- **File and line(s).**
- **Observed behavior.**
- **Why it is a problem.**
- **Reproduction or reasoning.**
- **Exact remediation.**
- **Regression test required.**

Then provide four explicit sections:

## What is correct

List implementation choices that are well-founded and should remain.

## Must fix before release

Only actual release blockers / Major or Critical issues.

## Can wait

Non-blocking improvements.

## P5 readiness

Assess whether the codebase is ready for the proposed unified professional UI, and identify refactors that should happen before starting it.

Do not invent a finding to fill a category. If there are no Critical issues, say so.

---

# Severity guide

**Critical**  
Security exposure, remote breakage, data loss, service cannot start, invalid upgrade that broadly breaks production, or a fundamental protocol correctness issue.

**Major**  
A real feature does not work as intended, important configuration is silently ignored, common upgrade path breaks, UI produces invalid runtime state, significant resource/lifecycle defect, or tests give false confidence about a release-critical path.

**Minor**  
Edge case, confusing UX, incomplete validation, maintainability problem without immediate runtime breakage.

**Note**  
Observation, cleanup or future design suggestion.

---

# Non-goals

Do not:

- redesign upstream telEgo unrelated to these changes.
- replace OpenWrt conventions simply because another framework would be easier.
- remove Native Shared-Port, Direct HTTPS, Cloudflare, Middle-End or EE solely to simplify the audit.
- assume the next P5 UI has already been approved for implementation.
- expose or copy real secrets from screenshots, logs or existing router data.

---

# Final instruction

Be adversarial toward assumptions, not toward the code authors.

The desired result is not "CI is green". The desired result is confidence that:

- the implementation matches upstream protocol behavior,
- OpenWrt upgrades remain safe,
- LuCI works in a real browser,
- optional features are genuinely optional,
- DD shaping is lifecycle-safe,
- the link generator is correct and private,
- ingress modes cannot enter contradictory states,
- tests would catch the kinds of real defects already discovered,
- and the project is in a clean state before P5 UI work begins.
