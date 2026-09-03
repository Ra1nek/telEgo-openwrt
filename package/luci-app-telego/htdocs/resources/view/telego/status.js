// telEgo Status Controller for LuCI
// OpenWrt 25.12 Client-Side Rendering
'use strict';
const view = require('ui').view;
return view.extend({
	render: function() {
		const E = L.ui.E;
		
		// Main container
		const root = E('div', {'class': 'telego-status-container'}, [
			// Header with service status
			E('div', {'class': 'status-header'}, [
				E('h1', {}, [L.text_('telEgo Status')]),
				E('span', {'id': 'service-status-indicator', 'class': 'status-indicator stopped'}, []),
				E('span', {'id': 'service-status-text', 'class': 'status-text'}, [L.text_('Checking...')])
			]),
			
			// Status cards grid
			E('div', {'class': 'status-cards'}, [
				// Service Info Card
				E('div', {'class': 'status-card'}, [
					E('div', {'class': 'card-icon'}, [L.text_('🚀')]),
					E('div', {'class': 'card-content'}, [
						E('h3', {}, [L.text_('Service Info')]),
						E('ul', {'id': 'service-info-list'}, [])
					])
				]),
				
				// Traffic Stats Card
				E('div', {'class': 'status-card'}, [
					E('div', {'class': 'card-icon'}, [L.text_('📊')]),
					E('div', {'class': 'card-content'}, [
						E('h3', {}, [L.text_('Traffic Statistics')]),
						E('ul', {'id': 'traffic-stats-list'}, [])
					])
				]),
				
				// Connections Card
				E('div', {'class': 'status-card'}, [
					E('div', {'class': 'card-icon'}, [L.text_('🔗')]),
					E('div', {'class': 'card-content'}, [
						E('h3', {}, [L.text_('Connections')]),
						E('ul', {'id': 'connections-list'}, [])
					])
				]),
				
				// System Resources Card
				E('div', {'class': 'status-card'}, [
					E('div', {'class': 'card-icon'}, [L.text_('💻')]),
					E('div', {'class': 'card-content'}, [
						E('h3', {}, [L.text_('System Resources')]),
						E('ul', {'id': 'system-resources-list'}, [])
					])
				])
			]),
			
			// Action buttons
			E('div', {'class': 'action-buttons'}, [
				E('button', {'class': 'btn btn-action', 'onclick': "location.href='/cgi-bin/luci/admin_services/telego/config'"}, 
					[L.text_('Go to Configuration')])
			]),
			
			// Logs section (optional)
			E('div', {'class': 'logs-section'}, [
				E('h2', {}, [L.text_('Recent Logs')]),
				E('pre', {'id': 'logs-content', 'class': 'logs-pre'}, [])
			])
		]);

		// Store root element for updates
		this.rootElement = root;
		
		// Initial status update
		setTimeout(() => this.updateStatus(), 100);
		
		return root;
	},

	updateStatus: function() {
		const self = this;
		
		// Check service status via rpc
		L.rpc('service', 'list', { name: 'telego' }).then(function(result) {
			const services = result.services || [];
			const telegoService = services.find(s => s.name === 'telego');
			
			if (telegoService && telegoService.running) {
				self.updateStatusIndicator('running', L.text_('Running'), '#4caf50');
				self.fetchMetrics();
			} else {
				self.updateStatusIndicator('stopped', L.text_('Stopped'), '#f44336');
				self.clearStats();
			}
		}).catch(function(err) {
			self.updateStatusIndicator('error', L.text_('Error'), '#ff9800');
		});
		
		// Fetch metrics if service is running
		this.fetchMetrics();
	},

	updateStatusIndicator: function(state, text, color) {
		const indicator = document.getElementById('service-status-indicator');
		const statusText = document.getElementById('service-status-text');
		
		if (indicator) {
			indicator.className = 'status-indicator ' + state;
			indicator.style.backgroundColor = color;
		}
		if (statusText) {
			statusText.textContent = text;
		}
	},

	fetchMetrics: function() {
		const self = this;
		
		// Fetch Prometheus metrics from telego endpoint
		fetch('http://127.0.0.1:9090/metrics')
			.then(response => response.text())
			.then(metricsText => {
				const metrics = self.parseMetrics(metricsText);
				self.displayMetrics(metrics);
			})
			.catch(err => {
				// Metrics not available, show default stats
				this.showDefaultStats();
			});
	},

	parseMetrics: function(metricsText) {
		const lines = metricsText.split('\n');
		const metrics = {};
		
		lines.forEach(line => {
			if (line.startsWith('#') || !line.includes(':')) return;
			const parts = line.split(':');
			if (parts.length >= 2) {
				const key = parts[0].trim();
				const value = parts.slice(1).join(':').trim().replace(/"/g, '');
				metrics[key] = value;
			}
		});
		
		return metrics;
	},

	displayMetrics: function(metrics) {
		// Update Service Info
		this.updateList('service-info-list', [
			['Version:', metrics['telego_version'] || '0.6.0'],
			['Uptime:', metrics['telego_uptime_seconds'] ? this.formatUptime(metrics['telego_uptime_seconds']) : '-'],
			['Middle-End:', metrics['telego_middleend_enabled'] === 'true' ? 'Enabled' : 'Disabled']
		]);

		// Update Traffic Stats
		this.updateList('traffic-stats-list', [
			['Bytes In:', this.formatBytes(metrics['telego_bytes_in'])],
			['Bytes Out:', this.formatBytes(metrics['telego_bytes_out'])],
			['Total Requests:', metrics['telego_requests_total'] || '0']
		]);

		// Update Connections
		this.updateList('connections-list', [
			['Active Clients:', metrics['telego_clients_active'] || '0'],
			['MTProto Sessions:', metrics['telego_sessions_mtproto'] || '0'],
			['WEB Proxy Users:', metrics['telego_users_webproxy'] || '0']
		]);

		// Update System Resources
		this.updateList('system-resources-list', [
			['Memory RSS:', this.formatBytes(metrics['process_resident_memory_bytes'])],
			['CPU Usage:', metrics['process_cpu_seconds_total'] ? 'N/A' : '-']
		]);
	},

	updateList: function(elementId, items) {
		const list = document.getElementById(elementId);
		if (!list) return;
		
		list.innerHTML = '';
		items.forEach(item => {
			const li = document.createElement('li');
			li.textContent = item[0] + ' ' + item[1];
			list.appendChild(li);
		});
	},

	formatBytes: function(bytes) {
		if (!bytes || bytes === 0) return '0 B';
		const units = ['B', 'KB', 'MB', 'GB', 'TB'];
		const unitIndex = Math.floor(Math.log(bytes) / Math.log(1024));
		return parseFloat((bytes / Math.pow(1024, unitIndex)).toFixed(2)) + ' ' + units[unitIndex];
	},

	formatUptime: function(seconds) {
		const days = Math.floor(seconds / 86400);
		const hours = Math.floor((seconds % 86400) / 3600);
		const minutes = Math.floor((seconds % 3600) / 60);
		
		if (days > 0) return days + 'd ' + hours + 'h';
		if (hours > 0) return hours + 'h ' + minutes + 'm';
		return minutes + 'm';
	},

	clearStats: function() {
		this.updateList('service-info-list', [['Status:', 'Stopped']]);
		this.updateList('traffic-stats-list', [['Bytes In:', '-'], ['Bytes Out:', '-']]);
		this.updateList('connections-list', [['Active Clients:', '0']]);
		this.updateList('system-resources-list', [['Memory RSS:', '-']]);
	},

	showDefaultStats: function() {
		this.updateList('service-info-list', [
			['Version:', '0.6.0'],
			['Uptime:', '-'],
			['Middle-End:', 'Disabled']
		]);
		this.updateList('traffic-stats-list', [['Bytes In:', '-'], ['Bytes Out:', '-']]);
		this.updateList('connections-list', [['Active Clients:', '0']]);
		this.updateList('system-resources-list', [['Memory RSS:', '-']]);
	}
});