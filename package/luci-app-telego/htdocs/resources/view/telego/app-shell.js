'use strict';

'require baseclass';
'require view.telego.ui-foundation as uiFoundation';

const APP_SECTIONS = [
	{ id: 'overview', label: _('Overview'), path: 'configuration', hash: '#overview', controls: 'telego-status-pane' },
	{ id: 'mtproxy', label: _('MTProxy'), path: 'configuration', hash: '#mtproxy', controls: 'telego-config-pane' },
	{ id: 'web', label: _('WEB Ingress'), path: 'ingress' },
	{ id: 'diagnostics', label: _('Diagnostics'), path: 'advanced' }
];

function sectionHref(section) {
	return L.url('admin/services/telego/' + section.path) + (section.hash || '');
}

function AppTabs(active, onSelect) {
	return E('nav', {
		'class': 'telego-app-tabs',
		'aria-label': 'telEgo'
	}, APP_SECTIONS.map(function (section) {
		const selected = section.id === active;
		const attrs = {
			'id': 'telego-app-nav-' + section.id,
			'class': 'telego-app-tab' + (selected ? ' active' : ''),
			'data-telego-section': section.id
		};

		if (onSelect && section.controls) {
			attrs.type = 'button';
			attrs['data-telego-switch'] = '1';
			attrs['aria-controls'] = section.controls;
			attrs['aria-pressed'] = selected ? 'true' : 'false';
			attrs.click = function (event) {
				if (event && event.preventDefault)
					event.preventDefault();
				onSelect(section.id);
			};
			return E('button', attrs, section.label);
		}

		attrs.href = sectionHref(section);
		attrs['aria-current'] = selected ? 'page' : null;
		return E('a', attrs, section.label);
	}));
}

function activate(root, active) {
	if (!root)
		return;

	root.setAttribute('data-telego-section', active);
	const tabs = root.querySelectorAll('.telego-app-tab');

	for (let i = 0; i < tabs.length; i++) {
		const tab = tabs[i];
		const selected = tab.getAttribute('data-telego-section') === active;
		tab.classList.toggle('active', selected);

		if (tab.getAttribute('data-telego-switch') === '1') {
			tab.setAttribute('aria-pressed', selected ? 'true' : 'false');
			tab.removeAttribute('aria-current');
		}
		else {
			tab.removeAttribute('aria-pressed');
			if (selected)
				tab.setAttribute('aria-current', 'page');
			else
				tab.removeAttribute('aria-current');
		}
	}
}

function formatUpdatedAt(timestamp) {
	const date = new Date(Number(timestamp));
	if (isNaN(date.getTime()))
		return '';

	try {
		return date.toLocaleTimeString([], {
			hour: '2-digit',
			minute: '2-digit',
			second: '2-digit'
		});
	}
	catch (e) {
		return date.toTimeString().slice(0, 8);
	}
}

function AppHeader() {
	return E('header', { 'class': 'telego-app-header' }, [
		E('div', { 'class': 'telego-app-title' }, [
			E('h1', {}, 'telEgo')
		]),
		E('div', {
			'class': 'telego-app-meta'
		}, [
			E('span', {
				'id': 'telego-app-service',
				'class': 'telego-app-meta-item telego-app-service',
				'hidden': true
			}, [
				E('span', { 'class': 'telego-app-meta-label' }, _('Service') + ':'),
				E('strong', { 'id': 'telego-app-service-value' }, _('—'))
			]),
			E('time', {
				'id': 'telego-app-freshness',
				'class': 'telego-app-meta-item telego-app-freshness',
				'hidden': true
			}),
			E('span', {
				'id': 'telego-app-pending',
				'class': 'telego-app-meta-item telego-app-pending',
				'hidden': true
			})
		])
	]);
}

function updateHeader(root, state) {
	if (!root || !state)
		return;

	if (Object.prototype.hasOwnProperty.call(state, 'serviceText')) {
		const service = root.querySelector('#telego-app-service');
		const value = root.querySelector('#telego-app-service-value');
		if (service && value) {
			uiFoundation.setText(value, state.serviceText, _('—'));
			service.hidden = false;
			service.setAttribute('data-tone', state.serviceTone || 'neutral');
		}
	}

	const freshness = root.querySelector('#telego-app-freshness');
	if (freshness) {
		if (state.updatedAt) {
			const formatted = formatUpdatedAt(state.updatedAt);
			freshness.setAttribute('datetime', new Date(Number(state.updatedAt)).toISOString());
			freshness.setAttribute('data-updated-at', String(Number(state.updatedAt)));
			uiFoundation.setText(freshness, _('Updated') + ': ' + formatted);
			freshness.hidden = false;
		}

		if (Object.prototype.hasOwnProperty.call(state, 'stale')) {
			freshness.classList.toggle('is-stale', !!state.stale);
			freshness.setAttribute('data-stale', state.stale ? 'true' : 'false');

			if (state.stale) {
				const last = Number(freshness.getAttribute('data-updated-at') || 0);
				const formatted = last ? formatUpdatedAt(last) : '';
				uiFoundation.setText(
					freshness,
					formatted
						? _('Status stale') + ' · ' + _('Updated') + ': ' + formatted
						: _('Status stale')
				);
				freshness.hidden = false;
			}
		}
	}

	if (Object.prototype.hasOwnProperty.call(state, 'pendingChanges')) {
		const pending = root.querySelector('#telego-app-pending');
		if (pending) {
			const count = Number(state.pendingChanges) || 0;
			uiFoundation.setText(pending, _('Pending changes') + ': ' + count);
			pending.hidden = count <= 0;
		}
	}
}

function watchPendingChanges(root) {
	const packages = ['telego', 'nginx_telego'];

	function refresh(isCurrent) {
		return uiFoundation.pendingChanges(packages).then(function (count) {
			if (!isCurrent || isCurrent())
				updateHeader(root, { pendingChanges: count });
		});
	}

	refresh(function () { return true; });
	uiFoundation.addPoll('telego', 'pending-changes', refresh, 10);
}

function TelEgoApp(active, content, options) {
	options = options || {};

	uiFoundation.resetPolls('telego');

	const children = [
		E('link', {
			'rel': 'stylesheet',
			'href': L.resource('css/telego.css')
		}),
		AppHeader(),
		AppTabs(active, options.onSelect)
	];

	if (options.secondary)
		children.push(options.secondary);

	children.push(E('div', { 'class': 'telego-app-content' }, content));

	const root = E('div', {
		'class': 'telego-app',
		'data-telego-section': active
	}, children);

	watchPendingChanges(root);
	return root;
}

return baseclass.extend({
	wrap: TelEgoApp,
	activate: activate,
	updateHeader: updateHeader
});
