'use strict';

'require baseclass';
'require uci';

const pollers = {};

function pollId(namespace, key) {
	return String(namespace || 'telego') + ':' + String(key || 'default');
}

function resetPolls(namespace) {
	const prefix = String(namespace || 'telego') + ':';

	for (const id of Object.keys(pollers)) {
		if (!id.startsWith(prefix))
			continue;

		L.Poll.remove(pollers[id]);
		delete pollers[id];
	}
}

function addPoll(namespace, key, task, interval, options) {
	if (typeof(task) !== 'function')
		throw new TypeError('poll task must be a function');

	options = options || {};
	const id = pollId(namespace, key);

	if (pollers[id])
		L.Poll.remove(pollers[id]);

	const wrapped = function () {
		if (options.pauseWhenHidden !== false &&
		    typeof(document) !== 'undefined' && document.hidden)
			return Promise.resolve();

		if (typeof(options.active) === 'function' && !options.active())
			return Promise.resolve();

		return Promise.resolve().then(function () {
			return task(function () {
				return pollers[id] === wrapped;
			});
		});
	};

	pollers[id] = wrapped;
	L.Poll.add(wrapped, interval);
	return wrapped;
}

function removePoll(namespace, key) {
	const id = pollId(namespace, key);
	if (!pollers[id])
		return false;

	const removed = L.Poll.remove(pollers[id]);
	delete pollers[id];
	return removed;
}

function safeText(value, fallback) {
	if (value === null || value === undefined || value === '')
		return fallback === undefined ? '' : String(fallback);

	return String(value);
}

function setText(node, value, fallback) {
	if (node)
		node.textContent = safeText(value, fallback);
	return node;
}

function countPendingChanges(changes, packages) {
	if (!changes || typeof(changes) !== 'object')
		return 0;

	const names = Array.isArray(packages) && packages.length
		? packages
		: Object.keys(changes);
	let count = 0;

	for (const name of names) {
		const entries = changes[name];
		if (Array.isArray(entries))
			count += entries.length;
	}

	return count;
}

function pendingChanges(packages) {
	return L.resolveDefault(uci.changes(), {}).then(function (changes) {
		return countPendingChanges(changes, packages);
	});
}

return baseclass.extend({
	addPoll: addPoll,
	removePoll: removePoll,
	resetPolls: resetPolls,
	safeText: safeText,
	setText: setText,
	countPendingChanges: countPendingChanges,
	pendingChanges: pendingChanges
});
