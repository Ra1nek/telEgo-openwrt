const assert = require('node:assert/strict');
const fs = require('node:fs');

const shell = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/app-shell.js', 'utf8');
const foundation = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/ui-foundation.js', 'utf8');
const config = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/config.js', 'utf8');
const advanced = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/advanced.js', 'utf8');
const nginx = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/nginx-files.js', 'utf8');
const css = fs.readFileSync('package/luci-app-telego/htdocs/css/telego.css', 'utf8');

// Top-level application controls are mixed navigation (buttons + links), not an
// ARIA tab widget. This avoids promising arrow-key tab behavior that does not
// exist across route changes.
assert.doesNotMatch(shell, /'role': 'tablist'/);
assert.doesNotMatch(shell, /'role': 'tab'/);
assert.match(shell, /attrs\['aria-controls'\] = section\.controls/);
assert.match(shell, /attrs\['aria-pressed'\] = selected \? 'true' : 'false'/);
assert.match(shell, /'aria-current'\] = selected \? 'page' : null/);
assert.match(shell, /removeAttribute\('aria-current'\)/);

// Overview/MTProxy panes must leave the accessibility tree when inactive.
assert.match(config, /configPane\.hidden = !mtproxy/);
assert.match(config, /statusPane\.hidden = mtproxy/);
assert.match(config, /'aria-labelledby': 'telego-app-nav-mtproxy'/);
assert.match(config, /'aria-labelledby': 'telego-app-nav-overview'/);

// The DD/EE selector is a real tablist, so it gets roving tabindex and
// Left/Right/Home/End keyboard support.
assert.match(config, /'role': 'tablist'/);
assert.match(config, /'role': 'tabpanel'/);
assert.match(config, /'keydown': handleModeKeydown/);
assert.match(config, /event\.key === 'ArrowLeft'/);
assert.match(config, /event\.key === 'ArrowRight'/);
assert.match(config, /event\.key === 'Home'/);
assert.match(config, /event\.key === 'End'/);
assert.match(config, /setAttribute\('tabindex', dd \? '0' : '-1'\)/);
assert.match(config, /aria-describedby': 'telego-proxy-session-note telego-proxy-endpoint-error'/);

// Dynamic status is not announced on every poll; only actionable error/status
// surfaces use live regions.
assert.match(config, /'aria-live': 'polite'/);
assert.match(advanced, /'aria-live': 'polite'/);

// Profile buttons expose persistent state without relying on color alone.
assert.match(advanced, /'aria-pressed': currentProfile === name \? 'true' : 'false'/);
assert.match(advanced, /buttons\[name\]\.setAttribute\('aria-pressed'/);

// Nginx inventory and editors remain usable without a mouse.
assert.match(nginx, /'class': 'telego-responsive-table'/);
assert.match(nginx, /'role': 'region'/);
assert.match(nginx, /'tabindex': '0'/);
assert.match(nginx, /'scope': 'col'/);
for (const id of [
	'telego-nginx-create-name',
	'telego-nginx-create-content',
	'telego-nginx-rename-name',
	'telego-nginx-edit-content'
])
	assert.match(nginx, new RegExp("'for': '" + id + "'"));

// Responsive acceptance contracts: contained overflow for data tables, large
// touch targets, progressively narrower layouts, visible keyboard focus, and
// reduced-motion support.
assert.match(css, /\.telego-responsive-table\s*\{/);
assert.match(css, /overflow-x:\s*auto/);
assert.match(css, /min-height:\s*44px/);
assert.match(css, /:focus-visible/);
assert.match(css, /@media screen and \(max-width: 640px\)/);
assert.match(css, /@media screen and \(max-width: 420px\)/);
assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
assert.match(css, /@media \(forced-colors: active\)/);
assert.match(css, /\.telego-secret-editor\s*\{/);
assert.match(css, /\.telego-connection-summary\s*\{[\s\S]*grid-template-columns:/);

// P6.1 foundation keeps the custom layer on native LuCI theme tokens and owns
// telEgo polling registrations as a namespace.
assert.match(css, /--telego-bg-primary:\s*var\(--background-color-high, Canvas\)/);
assert.match(css, /--telego-text-primary:\s*var\(--text-color-highest, CanvasText\)/);
assert.match(css, /--telego-primary-color:\s*var\(--primary-color-high, Highlight\)/);
assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}\b/, 'custom telEgo stylesheet must not carry its own hard-coded palette');
assert.match(shell, /uiFoundation\.resetPolls\('telego'\)/);
assert.match(shell, /Pending changes/);
assert.match(foundation, /document\.hidden/);
assert.match(foundation, /L\.Poll\.remove/);
assert.match(foundation, /pollers\[id\] === wrapped/, 'managed poll exposes a late-result generation guard');
assert.match(foundation, /uci\.changes\(\)/);
assert.match(foundation, /node\.textContent = safeText/);

console.log('LuCI P6.1 responsive/theme/foundation acceptance tests passed');
