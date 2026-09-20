'use strict';

'require form';
'require uci';
'require view';
'require view.telego.app-shell as appShell';

const maxDDDownlinkDelayUs = 1000000;

const PERFORMANCE_PROFILE_KEYS = [
	'num_event_loops',
	'prefer_ip',
	'idle_timeout',
	'max_write_buffer_mb',
	'dd_downlink_chunk',
	'dd_downlink_delay',
	'client_silence_close'
];

const PERFORMANCE_PROFILES = {
	'default': {
		num_event_loops: '0',
		prefer_ip: 'prefer-ipv4',
		idle_timeout: '5m',
		max_write_buffer_mb: '0',
		dd_downlink_chunk: '0',
		dd_downlink_delay: '0s',
		client_silence_close: '0s'
	},
	'mobile_dpi': {
		num_event_loops: '0',
		prefer_ip: 'prefer-ipv4',
		idle_timeout: '5m',
		max_write_buffer_mb: '0',
		dd_downlink_chunk: '1200',
		dd_downlink_delay: '2ms',
		client_silence_close: '0s'
	},
	'ios_recovery': {
		num_event_loops: '0',
		prefer_ip: 'prefer-ipv4',
		idle_timeout: '5m',
		max_write_buffer_mb: '0',
		dd_downlink_chunk: '0',
		dd_downlink_delay: '0s',
		client_silence_close: '10s'
	}
};

function performanceProfileLabel(profile) {
	switch (profile) {
	case 'default':
		return _('Default');
	case 'mobile_dpi':
		return _('Mobile DPI');
	case 'ios_recovery':
		return _('iOS Recovery');
	default:
		return _('Custom');
	}
}

function detectPerformanceProfile(values) {
	for (const name of ['default', 'mobile_dpi', 'ios_recovery']) {
		const profile = PERFORMANCE_PROFILES[name];
		let match = true;

		for (const key of PERFORMANCE_PROFILE_KEYS) {
			if (String(values[key] == null ? '' : values[key]) !== profile[key]) {
				match = false;
				break;
			}
		}

		if (match)
			return name;
	}

	return 'custom';
}

function readPerformanceUci() {
	const defaults = PERFORMANCE_PROFILES.default;
	const values = {};

	for (const key of PERFORMANCE_PROFILE_KEYS) {
		const value = uci.get('telego', 'performance', key);
		values[key] = value == null || value === '' ? defaults[key] : String(value);
	}

	return values;
}

function readPerformanceUi(section, sectionId) {
	const fallback = readPerformanceUci();
	const values = {};

	for (const key of PERFORMANCE_PROFILE_KEYS) {
		const widget = section.getUIElement(sectionId, key);
		const value = widget && widget.getValue ? widget.getValue() : fallback[key];
		values[key] = value == null || value === '' ? fallback[key] : String(value);
	}

	return values;
}

function applyPerformanceProfile(section, sectionId, profileName) {
	const profile = PERFORMANCE_PROFILES[profileName];
	if (!profile)
		return false;

	for (const key of PERFORMANCE_PROFILE_KEYS) {
		const widget = section.getUIElement(sectionId, key);
		if (!widget || !widget.setValue)
			continue;

		widget.setValue(profile[key]);
		if (widget.triggerValidation)
			widget.triggerValidation();
	}

	return true;
}

function parseDDDownlinkDelayUs(value) {
	value = String(value || '');
	if (value === '0s')
		return 0;

	const match = /^([1-9][0-9]*)(us|ms|s)$/.exec(value);
	if (!match)
		return null;

	const number = Number(match[1]);
	if (!Number.isSafeInteger(number))
		return null;

	const multiplier = match[2] === 'us' ? 1 : (match[2] === 'ms' ? 1000 : 1000000);
	const microseconds = number * multiplier;
	return Number.isSafeInteger(microseconds) && microseconds <= maxDDDownlinkDelayUs
		? microseconds
		: null;
}

function siblingFormValue(option, name, sectionId, fallback) {
	const sibling = L.toArray(option.map.lookupOption(name, sectionId))[0];
	if (!sibling)
		return fallback;

	const value = sibling.formvalue(sectionId);
	return value == null || value === '' ? fallback : value;
}

return view.extend({
	load: function () {
		return uci.load('telego');
	},

	render: function () {
		const middleEndEnabled = uci.get('telego', 'middle_end', 'enabled') === '1';
		const m = new form.Map(
			'telego',
			_('Runtime & Diagnostics'),
			_('Global runtime tuning and diagnostics remain here. Feature-specific advanced controls are now available in the Advanced tab of each service.')
		);

		let s = m.section(
			form.TypedSection,
			'performance',
			_('Performance'),
			_('Use a profile as a safe starting point, then adjust individual controls when needed. Applying a profile only changes this form; Save & Apply is still required.')
		);
		s.anonymous = true;
		s.addremove = false;

		const performanceSection = s;
		const profileStateBySection = {};
		const profileButtonsBySection = {};

		function updateProfileState(sectionId) {
			const state = profileStateBySection[sectionId];
			const buttons = profileButtonsBySection[sectionId] || {};
			const profile = detectPerformanceProfile(readPerformanceUi(performanceSection, sectionId));

			if (state) {
				state.textContent = performanceProfileLabel(profile);
				state.setAttribute('data-profile', profile);
			}

			for (const name of Object.keys(buttons)) {
				const active = name === profile;
				buttons[name].classList.toggle('active', active);
				buttons[name].setAttribute('aria-pressed', active ? 'true' : 'false');
			}
		}

		let o = s.option(
			form.DummyValue,
			'_profile',
			_('Performance Profile'),
			_('Profiles stage known combinations of the supported performance controls. Manual changes are preserved and are shown as Custom.')
		);
		o.renderWidget = function (sectionId) {
			const currentProfile = detectPerformanceProfile(readPerformanceUci());
			const state = E('span', {
				'id': 'telego-performance-profile-state',
				'class': 'telego-performance-profile-state',
				'data-profile': currentProfile,
				'aria-live': 'polite'
			}, performanceProfileLabel(currentProfile));
			const buttons = {};

			function profileButton(name, description) {
				const unavailable = middleEndEnabled && name === 'mobile_dpi';
				const button = E('button', {
					'id': 'telego-performance-profile-' + name.replace(/_/g, '-'),
					'type': 'button',
					'class': 'telego-performance-profile' + (currentProfile === name ? ' active' : ''),
					'aria-pressed': currentProfile === name ? 'true' : 'false',
					'disabled': unavailable ? 'disabled' : null,
					'title': unavailable
						? _('Mobile DPI profile is unavailable while Middle-End is enabled.')
						: '',
					'click': function (event) {
						if (event && event.preventDefault)
							event.preventDefault();
						if (unavailable)
							return;
						if (applyPerformanceProfile(performanceSection, sectionId, name))
							updateProfileState(sectionId);
					}
				}, [
					E('strong', {}, performanceProfileLabel(name)),
					E('span', {}, description)
				]);
				buttons[name] = button;
				return button;
			}

			profileStateBySection[sectionId] = state;
			profileButtonsBySection[sectionId] = buttons;

			return E('div', { 'class': 'telego-performance-profile-picker' }, [
				E('div', { 'class': 'telego-performance-profile-summary' }, [
					E('span', {}, _('Current profile:')),
					state
				]),
				E('div', { 'class': 'telego-performance-profile-grid' }, [
					profileButton(
						'default',
						_('Package defaults: automatic event loops, IPv4 preference, no DD shaping and no silence recovery timer.')
					),
					profileButton(
						'mobile_dpi',
						_('For restrictive mobile networks: DD downlink chunk 1200 bytes with 2ms pacing. Requires Middle-End to be disabled.')
					),
					profileButton(
						'ios_recovery',
						_('For diagnosing the iOS Updating stall: default transport settings with Client Silence Close set to 10s.')
					)
				]),
				E('p', { 'class': 'telego-performance-profile-note' },
					_('Profiles do not add a new runtime setting. They only stage values in the existing Performance fields below.'))
			]);
		};

		function trackCustomPerformance(option) {
			option.onchange = function (event, sectionId) {
				updateProfileState(sectionId);
			};
			return option;
		}

		o = trackCustomPerformance(s.option(form.Value, 'num_event_loops', _('Event Loops')));
		o.datatype = 'uinteger';
		o.default = '0';

		o = trackCustomPerformance(s.option(form.ListValue, 'prefer_ip', _('IP Preference')));
		o.value('prefer-ipv4', _('Prefer IPv4'));
		o.value('prefer-ipv6', _('Prefer IPv6'));
		o.value('only-ipv4', _('IPv4 only'));
		o.value('only-ipv6', _('IPv6 only'));
		o.default = 'prefer-ipv4';

		o = trackCustomPerformance(s.option(form.Value, 'idle_timeout', _('Idle Timeout')));
		o.datatype = 'string';
		o.default = '5m';

		o = trackCustomPerformance(s.option(form.Value, 'max_write_buffer_mb', _('Max Write Buffer (MB)')));
		o.datatype = 'uinteger';
		o.default = '0';

		o = trackCustomPerformance(s.option(form.Value, 'dd_downlink_chunk', _('DD Downlink Chunk (bytes)')));
		o.datatype = 'uinteger';
		o.default = '0';
		o.description = _('0 keeps the upstream raw-DD batching. For restrictive mobile networks, start with 1200 bytes together with a small DD downlink delay.');
		o.validate = function (section_id, value) {
			const number = Number(value);
			if (!(value === '0' || (Number.isInteger(number) && number >= 256 && number <= 65536)))
				return _('Use 0 or a value from 256 to 65536 bytes.');
			if (middleEndEnabled && number > 0)
				return _('DD Downlink Shaping is unavailable while Middle-End is enabled.');

			const delay = siblingFormValue(this, 'dd_downlink_delay', section_id, '0s');
			const delayUs = parseDDDownlinkDelayUs(delay);
			if (number === 0 && delayUs != null && delayUs > 0)
				return _('Set DD Downlink Delay to 0s before setting DD Downlink Chunk to 0.');

			return true;
		};

		o = trackCustomPerformance(s.option(form.Value, 'dd_downlink_delay', _('DD Downlink Delay')));
		o.datatype = 'string';
		o.default = '0s';
		o.description = _('Paces raw-DD proxy-to-client writes without blocking the event loop. 0s disables pacing; start with 2ms when testing mobile DPI degradation.');
		o.validate = function (section_id, value) {
			const delayUs = parseDDDownlinkDelayUs(value);
			if (delayUs == null)
				return _('Use 0s or a positive integer duration no greater than 1s, such as 500us, 2ms, or 1s.');
			if (middleEndEnabled && delayUs > 0)
				return _('DD Downlink Shaping is unavailable while Middle-End is enabled.');

			const chunk = Number(siblingFormValue(this, 'dd_downlink_chunk', section_id, '0'));
			if (delayUs > 0 && chunk === 0)
				return _('DD Downlink Delay requires a non-zero DD Downlink Chunk.');

			return true;
		};

		o = trackCustomPerformance(s.option(form.Value, 'client_silence_close', _('Client Silence Close')));
		o.datatype = 'string';
		o.default = '0s';
		o.description = _('0 disables this recovery timer; upstream suggests roughly 10–15s only when diagnosing the iOS Updating stall.');

		s = m.section(form.TypedSection, 'upstream', _('Upstream'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(
			form.Value,
			'socks5',
			_('SOCKS5 Proxy'),
			_('Optional SOCKS5 route for Telegram DC connections. Leave empty for direct routing.')
		);
		o.datatype = 'string';
		o.rmempty = true;

		s = m.section(form.TypedSection, 'metrics', _('Metrics'));
		s.anonymous = true;
		s.addremove = false;
		o = s.option(form.Value, 'bind_to', _('Metrics Address'));
		o.datatype = 'string';
		o.default = '127.0.0.1:9090';
		o.description = _('Keep metrics on a literal loopback address.');
		o = s.option(form.Value, 'path', _('Metrics Path'));
		o.datatype = 'string';
		o.default = '/metrics';
		o = s.option(form.Flag, 'diagnostics', _('Enable Diagnostics'));
		o.description = _('Private runtime diagnostics require a literal loopback metrics address.');
		o.default = '0';

		return m.render().then(function (node) {
			return appShell.wrap('diagnostics', node, {
				secondary: appShell.diagnosticsNav('runtime')
			});
		});
	}
});
