'use strict';

'require baseclass';

const APP_SECTIONS = [
	{ id: 'overview', label: _('Overview'), path: 'configuration', hash: '#overview' },
	{ id: 'mtproxy', label: _('MTProxy'), path: 'configuration', hash: '#mtproxy' },
	{ id: 'web', label: _('WEB Ingress'), path: 'ingress' },
	{ id: 'diagnostics', label: _('Diagnostics'), path: 'advanced' }
];

function sectionHref(section) {
	return L.url('admin/services/telego/' + section.path) + (section.hash || '');
}

function AppTabs(active, onSelect) {
	return E('nav', {
		'class': 'telego-app-tabs',
		'role': 'tablist',
		'aria-label': 'telEgo'
	}, APP_SECTIONS.map(function (section) {
		const selected = section.id === active;
		const attrs = {
			'class': 'telego-app-tab' + (selected ? ' active' : ''),
			'data-telego-section': section.id,
			'role': 'tab',
			'aria-selected': selected ? 'true' : 'false'
		};

		if (onSelect && (section.id === 'overview' || section.id === 'mtproxy')) {
			attrs.type = 'button';
			attrs.click = function (event) {
				if (event && event.preventDefault)
					event.preventDefault();
				onSelect(section.id);
			};
			return E('button', attrs, section.label);
		}

		attrs.href = sectionHref(section);
		return E('a', attrs, section.label);
	}));
}

function activate(root, active) {
	if (!root)
		return;

	root.setAttribute('data-telego-section', active);
	L.toArray(root.querySelectorAll('.telego-app-tab')).forEach(function (tab) {
		const selected = tab.getAttribute('data-telego-section') === active;
		tab.classList.toggle('active', selected);
		tab.setAttribute('aria-selected', selected ? 'true' : 'false');
	});
}

function DiagnosticsNav(active) {
	const entries = [
		{ id: 'advanced', label: _('Advanced Settings'), href: L.url('admin/services/telego/advanced') },
		{ id: 'nginx-files', label: _('Nginx File Inventory'), href: L.url('admin/services/telego/nginx-files') }
	];

	return E('nav', {
		'class': 'telego-app-subtabs',
		'aria-label': _('Diagnostics')
	}, entries.map(function (entry) {
		const selected = entry.id === active;
		return E('a', {
			'class': 'telego-app-subtab' + (selected ? ' active' : ''),
			'href': entry.href,
			'aria-current': selected ? 'page' : null
		}, entry.label);
	}));
}

function TelEgoApp(active, content, options) {
	options = options || {};

	const children = [
		E('link', {
			'rel': 'stylesheet',
			'href': L.resource('css/telego.css')
		}),
		E('header', { 'class': 'telego-app-header' }, [
			E('h1', {}, 'telEgo')
		]),
		AppTabs(active, options.onSelect)
	];

	if (options.secondary)
		children.push(options.secondary);

	children.push(E('div', { 'class': 'telego-app-content' }, content));

	return E('div', {
		'class': 'telego-app',
		'data-telego-section': active
	}, children);
}

return baseclass.extend({
	wrap: TelEgoApp,
	activate: activate,
	diagnosticsNav: DiagnosticsNav
});
