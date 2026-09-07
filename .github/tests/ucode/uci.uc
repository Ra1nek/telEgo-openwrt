function cursor() {
	return {
		load: function() {},
		get: function(config, section, option) {
			return global.fixture[option];
		}
	};
}
export { cursor };
