function connect() {
	if (global.fixture.no_ubus)
		return null;
	return {
		call: function() {
			return { telego: { instances: { telego: { running: true, pid: 42 } } } };
		},
		disconnect: function() { global.disconnected = true; }
	};
}
export { connect };
