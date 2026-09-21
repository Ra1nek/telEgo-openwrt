const assert = require('node:assert/strict');
const fs = require('node:fs');

const source = fs.readFileSync('package/luci-app-telego/htdocs/resources/view/telego/ui-foundation.js', 'utf8');

function BaseClass() {}
BaseClass.extend = function (properties) {
	function Constructor() {}
	Object.assign(Constructor.prototype, properties);
	return Constructor;
};

const added = [];
const removed = [];
const documentObject = { hidden: false };
const L = {
	resolveDefault: (promise, fallback) => Promise.resolve(promise).catch(() => fallback),
	Poll: {
		add: (fn, interval) => { added.push({ fn, interval }); return true; },
		remove: fn => { removed.push(fn); return true; }
	}
};
const uci = {
	changes: () => Promise.resolve({
		telego: [['set', 'telego', 'general', 'enabled', '1']],
		nginx_telego: [
			['set', 'nginx_telego', 'shared', 'enabled', '1'],
			['set', 'nginx_telego', 'shared', 'hostname', 'web.example.com']
		],
		network: [['set', 'network', 'lan', 'proto', 'static']]
	})
};

const FoundationClass = new Function('baseclass', 'uci', 'L', 'document', source)(
	BaseClass, uci, L, documentObject
);
assert.equal(typeof FoundationClass, 'function');
const foundation = new FoundationClass();

(async () => {
	assert.equal(foundation.safeText(null, '—'), '—');
	assert.equal(foundation.safeText('', 'fallback'), 'fallback');
	assert.equal(foundation.safeText(0, 'fallback'), '0');

	const node = { textContent: 'old' };
	foundation.setText(node, '<b>unsafe</b>');
	assert.equal(node.textContent, '<b>unsafe</b>', 'safe text helper must assign textContent, not HTML');

	assert.equal(foundation.countPendingChanges({
		telego: [1, 2],
		nginx_telego: [3],
		network: [4, 5]
	}, ['telego', 'nginx_telego']), 3);
	assert.equal(await foundation.pendingChanges(['telego', 'nginx_telego']), 3);

	let calls = 0;
	let firstIsCurrent = null;
	const first = foundation.addPoll('telego', 'runtime', isCurrent => {
		firstIsCurrent = isCurrent;
		calls++;
	}, 5);
	assert.equal(added.length, 1);
	assert.equal(added[0].interval, 5);
	await first();
	assert.equal(calls, 1);

	documentObject.hidden = true;
	await first();
	assert.equal(calls, 1, 'hidden documents pause managed polling by default');

	documentObject.hidden = false;
	const second = foundation.addPoll('telego', 'runtime', () => { calls += 10; }, 5);
	assert.equal(removed[0], first, 'same poll key replaces the previous task');
	assert.equal(firstIsCurrent(), false, 'replaced poll generation becomes stale for late-result guards');
	assert.equal(added.length, 2);
	await second();
	assert.equal(calls, 11);

	foundation.addPoll('telego', 'infrastructure', () => {}, 30);
	foundation.addPoll('other', 'unrelated', () => {}, 30);
	const removalsBeforeReset = removed.length;
	foundation.resetPolls('telego');
	assert.equal(removed.length, removalsBeforeReset + 2, 'namespace reset removes only registered telEgo tasks');

	console.log('LuCI P6.1 UI foundation tests passed');
})().catch(error => { console.error(error); process.exit(1); });
