const assert = require('node:assert/strict');
const fs = require('node:fs');

class Element {
	constructor(tag, attrs = {}, children = []) {
		this.tag = tag; this.attrs = attrs; this.style = {};
		this.children = Array.isArray(children) ? children : [children];
		this.classList = { add() {}, remove() {} };
	}
	querySelector(selector) {
		if (selector === '#' + this.attrs.id) return this;
		for (const child of this.children) {
			const found = child?.querySelector?.(selector);
			if (found) return found;
		}
		return null;
	}
}

async function check(initialStatus) {
	const options = [];
	let poll;
	let reply = initialStatus;
	class Map {
		section(kind, section) {
			return { option(type, name) {
				const option = {
					section, name, value() {},
					depends(field, value) { this.dependency = [field, value]; }
				};
				options.push(option);
				return option;
			} };
		}
		render() { return Promise.resolve(new Element('form')); }
	}
	const view = new Function('form', 'rpc', 'uci', 'view', 'E', '_', 'L', 'document',
		fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/config.js', 'utf8'))(
		{ Map }, { declare: () => () => reply ? Promise.resolve(reply) : Promise.reject(new Error('rpcd unavailable')) },
		{ load: async () => {}, get: () => '1' }, { extend: x => x },
		(tag, attrs, children) => new Element(tag, attrs, children), x => x,
		{ resolveDefault: (p, fallback) => p.catch(() => fallback), Poll: { add: fn => { poll = fn; } } },
		{ querySelector: () => null }
	);
	const root = await view.render();
	assert.ok(root.querySelector('#telego-config-pane'), 'configuration renders even without rpcd');
	const hostname = options.find(o => o.section === 'web_proxy' && o.name === 'hostname');
	assert.deepEqual(hostname.dependency, ['enabled', '1']);
	assert.equal(hostname.rmempty, false);
	assert.equal(hostname.retain, true);
	if (initialStatus) {
		assert.equal(root.querySelector('#telego-status-pid').textContent, '42');
		assert.equal(root.querySelector('#telego-status-error').textContent, '');
	} else {
		assert.equal(root.querySelector('#telego-status-error').textContent, 'Unable to read telEgo status.');
	}
	assert.equal(typeof poll, 'function');
	await poll(); // RPC failures must not reject the polling callback.
}

(async () => {
	await check(null);
	await check({ running: true, pid: 42, uptime: 100, connections: 3, ips_active: 2, ips_blocked: 0, rx_bytes: 100, tx_bytes: 200 });
	console.log('LuCI configuration tests passed');
})().catch(error => { console.error(error); process.exit(1); });
