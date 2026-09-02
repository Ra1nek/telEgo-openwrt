# telEgo Configuration Reference

Configuration file location: /etc/config/telego

All settings can be modified via LuCI interface at Services → Telegram MTProxy (telEgo).

================================================================================
SECTION: [general] - General Settings
================================================================================

ad_tag = ""
  Type: string
  Default: ""
  Description: Sponsorship/advertisement tag for supporting the service.
               Optional, leave empty if not sponsoring.

use_middle_proxy = true
  Type: boolean
  Default: true
  Description: Route traffic through Telegram Middle-End servers.
               Recommended for most users. Disable only if you have white IP.

================================================================================
SECTION: [general.modes] - Protocol Modes
================================================================================

classic = false
  Type: boolean
  Default: false
  Description: Enable classic MTProxy mode (no encryption). Not recommended.

secure = false  
  Type: boolean
  Default: false
  Description: Enable secure mode with dd prefix for obfuscation.

tls = true
  Type: boolean
  Default: true
  Description: Enable TLS/FakeTLS mode with ee prefix. Recommended for most users.

================================================================================
SECTION: [server] - Server Configuration
================================================================================

port = 443
  Type: integer
  Default: 443
  Range: 1-65535
  Description: Public port for MTProxy connections. Use 443 for best compatibility.

protocol = "tcp"
  Type: string
  Default: "tcp"
  Options: "tcp", "udp"
  Description: Transport protocol. TCP recommended for most use cases.

================================================================================
SECTION: [censorship] - Anti-Censorship Settings
================================================================================

tls_domain = "google.com"
  Type: string
  Default: "google.com"
  Description: Domain used for FakeTLS masking. Traffic appears as HTTPS to this domain.
               Use popular domains like google.com, facebook.com, cloudflare.com

================================================================================
SECTION: [web-proxy] - WEB Proxy Configuration (New 2026 Standard)
================================================================================

enabled = false
  Type: boolean
  Default: false
  Description: Enable WEB Proxy support. Requires Nginx TLS fronting configuration.

carrier = "https-lanes"
  Type: string
  Default: "https-lanes"
  Options: "https", "websocket", "websocket-lanes", "https-lanes"
  Description: Transport carrier for WEB Proxy:
    - https: Sequential fetch + long polling (simplest)
    - websocket: Single multiplexed WebSocket connection
    - websocket-lanes: Separate WebSocket per Telegram stream
    - https-lanes: Separate HTTPS channel per stream (recommended)

bind-to = "127.0.0.1:8080"
  Type: string
  Default: "127.0.0.1:8080"
  Description: Internal listener address for WEB Proxy. Never expose to internet!

backend = "127.0.0.1:443"
  Type: string
  Default: "127.0.0.1:443"
  Description: Backend MTProxy address that receives decrypted traffic from WEB layer.

hostname = ""
  Type: string
  Default: ""
  Description: Public hostname for WEB Proxy (e.g., proxy.example.com).
               Required for generating WEB Proxy links.

trusted-proxy-cidrs = ["127.0.0.1"]
  Type: array of strings
  Default: ["127.0.0.1"]
  Description: CIDR ranges trusted to reverse proxy traffic (Nginx addresses).

================================================================================
SECTION: [secrets] - User Secrets Management
================================================================================

Format: username = "32_hex_characters"

Example:
alice = "0123456789abcdef0123456789abcdef"
bob = "fedcba9876543210fedcba9876543210"

Notes:
- Secret must be exactly 32 lowercase hexadecimal characters (0-9, a-f)
- Username can be any string without spaces or special characters
- Generate secrets using: openssl rand -hex 16
- Or use the "Generate" button in LuCI interface

================================================================================
SECTION: [server.api] - Management API Configuration
================================================================================

enabled = true
  Type: boolean
  Default: true
  Description: Enable REST API for management and monitoring.

listen = "127.0.0.1:9091"
  Type: string
  Default: "127.0.0.1:9091"
  Description: API listener address. Keep on loopback for security!

whitelist = ["127.0.0.1/32"]
  Type: array of strings
  Default: ["127.0.0.1/32"]
  Description: IP addresses/CIDR ranges allowed to access API.
               Format: "IP" or "CIDR" (e.g., "192.168.1.0/24")

================================================================================
SECTION: [logging] - Logging Configuration
================================================================================

level = "info"
  Type: string
  Default: "info"
  Options: "debug", "info", "warn", "error"
  Description: Log verbosity level. Use debug for troubleshooting.

format = "json"
  Type: string
  Default: "json"
  Options: "text", "json"
  Description: Log output format. JSON recommended for log aggregation systems.

================================================================================
GENERATED LINKS FORMAT
================================================================================

After configuration, telEgo generates these proxy links:

MTProxy Classic Link:
https://t.me/proxy?server=YOUR_HOSTNAME&port=443&secret=YOUR_SECRET

MTProxy Secure (dd) Link:
tg://proxy?server=YOUR_HOSTNAME&port=443&secret=ddYOUR_SECRET

WEB Proxy Link (requires enabled=true in [web-proxy]):
https://t.me/webproxy?server=YOUR_HOSTNAME&secret=YOUR_SECRET

Replace YOUR_HOSTNAME with your domain and YOUR_SECRET with generated secret.

================================================================================
TROUBLESHOOTING TIPS
================================================================================

1. Connection refused on port 443:
   - Check firewall rules allow incoming TCP on port 443
   - Verify telEgo is running: /etc/init.d/telego status

2. WEB Proxy not working:
   - Ensure [web-proxy].enabled = true
   - Verify Nginx configuration in /etc/nginx/conf.d/telego.conf
   - Check TLS certificate is valid and renewed

3. High latency or timeouts:
   - Try different tls_domain values
   - Enable use_middle_proxy if disabled
   - Check network connectivity to Telegram DCs

4. API not accessible:
   - Verify [server.api].enabled = true
   - Add your IP to [server.api].whitelist
   - Default listen is 127.0.0.1 (localhost only)
