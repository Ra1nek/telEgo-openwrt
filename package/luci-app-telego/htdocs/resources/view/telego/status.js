'use strict';

'require rpc';
'require uci';
'require view';

const callServiceList = rpc.declare({
	object: 'service',
	method: 'list',
	params: ['name'],
	expect: { '': {} }
});

function getServiceStatus() {
	return L.resolveDefault(callServiceList('telego'), {}).then(function(result) {
		try {
			const service = result.telego;
			const instances = service.instances || {};
			return Object.keys(instances).some(function(name) {
				return instances[name].running === true;
			});
		} catch (e) {
			return false;
		}
	});
}

return view.extend({
	load: function() {
		return Promise.all([
			uci.load('telego'),
			getServiceStatus()
		]);
	},

	render: function(data) {
		const running = data[1];
		const enabled = uci.get('telego', 'general', 'enabled') === '1';
		const bind = uci.get('telego', 'general', 'bind_to') || '0.0.0.0:443';
		const webEnabled = uci.get('telego', 'web_proxy', 'enabled') === '1';
		const middleEndEnabled = uci.get('telego', 'middle_end', 'enabled') === '1';
		const metricsBind = uci.get('telego', 'metrics', 'bind_to') || '127.0.0.1:9090';

		const status = running ? _('Running') : (enabled ? _('Stopped') : _('Disabled'));
		const statusClass = running ? 'success' : (enabled ? 'warning' : 'muted');

		const m = new form.Map('telego', _('telEgo Status'));
		const s = m.section(form.TypedSection);
		s.anonymous = true;
		s.render = function() {
			return E('div', { 'class': 'telego-status' }, [
				E('h2', { 'class': 'telego-status-title' }, _('Service Status')),
				E('p', { 'class': 'telego-status-value ' + statusClass }, status),
				E('dl', { 'class': 'telego-status-list' }, [
					E('dt', {}, _('Autostart / Enabled')),
					E('dd', {}, enabled ? _('Enabled') : _('Disabled')),
					E('dt', {}, _('MTProxy Bind Address')),
					E('dd', {}, bind),
					E('dt', {}, _('WEB Proxy')),
					E('dd', {}, webEnabled ? _('Enabled') : _('Disabled')),
					E('dt', {}, _('Telegram Middle-End')),
					E('dd', {}, middleEndEnabled ? _('Enabled') : _('Disabled')),
					E('dt', {}, _('Prometheus Metrics')),
					E('dd', {}, metricsBind),
				]
				),
				E('p', { 'class': 'telego-status-note' }, _('Metrics remain bound to the router by default and are not fetched directly from the administrator browser.')),
				E('a', { 'class': 'btn cbi-button cbi-button-action', 'href': L.url('admin', 'services', 'telego_config') }, _('Open Configuration'))
			]);
		};

		return m.render();
	}
});
