'use strict';

'require baseclass';

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
	activate: activate
});
