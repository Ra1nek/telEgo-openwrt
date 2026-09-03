--
-- Copyright (C) 2025-2026 Ra1nek <ra1nek@protonmail.com>
--
-- This is free software, licensed under the MIT License.
--

local uci = require "uci"
local json = require "luci.jsonc"

m = Map("telego", translate("telEgo MTProxy Server"), translate("High-performance Telegram proxy with TLS fronting and WEB protocol support."))

-- General Settings Section
s = m:section(TypedSection, "general", translate("General Settings"))
s.addremove = false

o = s:option(Value, "bind_to", translate("Bind Address"))
o.datatype = string
o.default = "0.0.0.0:443"
o.description = translate("Address and port to listen on (e.g., 0.0.0.0:443 or /run/telego/telego.sock)")

o = s:option(Value, "log_level", translate("Log Level"))
o:value("trace", translate("Trace"))
o:value("debug", translate("Debug"))
o:value("info", translate("Info"))
o:value("warn", translate("Warn"))
o:value("error", translate("Error"))
o.default = "info"
o.description = translate("Logging verbosity level")

-- Secrets Section
s = m:section(TypedSection, "secrets", translate("User Secrets"), translate("Generate secrets with: telego generate <hostname>"))
s.template = "telego/SecretList"
s.addremove = true
s.anonymous = true

function s.create(name, section)
	TypedSection.create(self, name, section)
end

-- TLS Fronting Section
s = m:section(TypedSection, "tls_fronting", translate("TLS Fronting Settings"))
s.addremove = false

o = s:option(Value, "mask_host", translate("Mask Host"))
o.datatype = string
o.default = "www.google.com"
o.description = translate("Hostname to impersonate for TLS fronting (must match secret hostname)")

-- WEB Proxy Section
s = m:section(TypedSection, "web_proxy", translate("WEB Proxy Settings"))
s.addremove = false

o = s:option(Flag, "enabled", translate("Enable WEB Proxy"))
o.default = "0"
o.description = translate("Enable native Telegram WEB proxy support")

o = s:option(Value, "carrier", translate("Carrier Mode"))
o:value("https-lanes", translate("HTTPS Lanes (HTTP/2)"))
o:value("websocket", translate("WebSocket (HTTP/1.1)"))
o.default = "https-lanes"
o.description = translate("Transport mode for WEB proxy")

-- Middle-End Section
s = m:section(TypedSection, "middle_end", translate("Middle-End Settings"))
s.addremove = false

o = s:option(Flag, "enabled", translate("Enable Middle-End"))
o.default = "0"
o.description = translate("Use Telegram Middle-End for authenticated connections (v0.6.0+)")

o = s:option(Value, "proxy_tag", translate("Proxy Tag"))
o.datatype = string
o.description = translate("Optional proxy tag issued by Telegram for ME authentication")

-- Performance Settings Section
s = m:section(TypedSection, "performance", translate("Performance Tuning"))
s.addremove = false

o = s:option(Value, "prefer_ip", translate("IP Preference"))
o:value("prefer-ipv4", translate("Prefer IPv4"))
o:value("prefer-ipv6", translate("Prefer IPv6"))
o:value("only-ipv4", translate("IPv4 Only"))
o:value("only-ipv6", translate("IPv6 Only"))
o.default = "prefer-ipv4"
o.description = translate("IP version preference for DC connections")

o = s:option(Value, "idle_timeout", translate("Connection Idle Timeout"))
o.default = "5m"
o.description = translate("Timeout for idle connections (e.g., 5m, 30s)")

o = s:option(Value, "num_event_loops", translate("Event Loops"))
o.datatype = "or(min(1,max(1,intval)),uint)">
o.default = "0"
o.description = translate("Number of event loops (0 = auto, uses all CPU cores)")

-- Upstream Settings Section
s = m:section(TypedSection, "upstream", translate("Upstream Settings"))
s.addremove = false

o = s:option(Value, "socks5", translate("SOCKS5 Proxy"))
o.datatype = string
o.description = translate("Route DC traffic through SOCKS5 proxy (e.g., 127.0.0.1:1080)")

-- Metrics Section
s = m:section(TypedSection, "metrics", translate("Prometheus Metrics"))
s.addremove = false

o = s:option(Flag, "enabled", translate("Enable Metrics"))
o.default = "0"
o.description = translate("Expose Prometheus metrics endpoint")

o = s:option(Value, "bind_to", translate("Metrics Bind Address"))
o.datatype = string
o.default = "127.0.0.1:9090"
o.description = translate("Address for metrics endpoint")

return m
