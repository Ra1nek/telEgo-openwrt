function cursor() {
	return {
		load: function() {},
		get: function(config, section, option) {
			if (section == 'metrics')
				return global.fixture[option];
			if (section == 'web_proxy') {
				if (option == 'enabled') return global.fixture.web_enabled;
				if (option == 'carrier') return global.fixture.web_carrier;
			}
			if (section == 'middle_end' && option == 'enabled')
				return global.fixture.middleend_enabled;
			return null;
		}
	};
}
export { cursor };
