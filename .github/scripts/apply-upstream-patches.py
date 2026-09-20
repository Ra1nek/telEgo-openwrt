#!/usr/bin/env python3
"""Apply the small OpenWrt-only delta to the pinned upstream telEgo source."""
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[2]
MAIN = ROOT / "telego-src" / "cmd" / "telego" / "main.go"
FAKETLS_TEST = ROOT / "telego-src" / "pkg" / "transport" / "faketls" / "handshake_test.go"
text = MAIN.read_text(encoding="utf-8")

replacements = [
    (
        '''\t\tlog.Info().\n\t\t\tStr("name", s.Name).\n\t\t\tStr("ee_link", eeLink).\n\t\t\tStr("dd_link", ddLink).\n\t\t\tMsg("Telegram proxy links")''',
        '''\t\tfmt.Fprintf(os.Stdout, "name=%s\\nee_link=%s\\ndd_link=%s\\n", s.Name, eeLink, ddLink)''',
    ),
    (
        '''\t\tlog.Info().\n\t\t\tStr("name", profile.Name()).\n\t\t\tStr("mode", profile.Mode().String()).\n\t\t\tStr("tg_link", links.Telegram).\n\t\t\tStr("https_link", links.HTTPS).\n\t\t\tMsg("Telegram WEB proxy links")''',
        '''\t\tfmt.Fprintf(os.Stdout, "name=%s\\nmode=%s\\ntg_link=%s\\nhttps_link=%s\\n", profile.Name(), profile.Mode().String(), links.Telegram, links.HTTPS)''',
    ),
    (
        '''\tlog.Info().\n\t\tStr("secret", keyHex).\n\t\tStr("ee_link", "tg://proxy?server=YOUR_IP&port=443&secret="+eeSecret).\n\t\tStr("dd_link", "tg://proxy?server=YOUR_IP&port=443&secret="+ddSecret).\n\t\tMsg("generated secret (use ee for FakeTLS, dd for raw)")''',
        '''\tfmt.Fprintf(os.Stdout, "secret=%s\\nee_link=tg://proxy?server=YOUR_IP&port=443&secret=%s\\ndd_link=tg://proxy?server=YOUR_IP&port=443&secret=%s\\n", keyHex, eeSecret, ddSecret)''',
    ),
]

for old, new in replacements:
    if old not in text:
        raise SystemExit(f"expected pinned upstream block not found: {old[:60]!r}")
    text = text.replace(old, new, 1)

MAIN.write_text(text, encoding="utf-8")


# The pinned upstream ALPN test searched the entire binary response for the
# first random 0x0010 byte pair. ServerRandom/X25519 bytes can contain that pair
# by chance, causing a false negative before the real ALPN extension is reached.
# Patch only the test: production ServerHello generation is unchanged.
test_text = FAKETLS_TEST.read_text(encoding="utf-8")
old_alpn_test = r'''// TestBuildServerHello_WithALPN tests that ALPN is echoed in ServerHello.
func TestBuildServerHello_WithALPN(t *testing.T) {
	secret := make([]byte, 16)
	rand.Read(secret)

	clientHello := &ClientHello{
		SessionID:   make([]byte, 32),
		CipherSuite: 0x1301,
		ALPN:        []string{"h2", "http/1.1"},
	}
	rand.Read(clientHello.SessionID)
	rand.Read(clientHello.Random[:])

	response, err := BuildServerHello(secret, clientHello)
	if err != nil {
		t.Fatalf("BuildServerHello failed: %v", err)
	}

	// Response should contain ALPN extension (0x00 0x10)
	// Find it in the ServerHello portion
	found := false
	for i := 0; i < len(response)-1; i++ {
		if response[i] == 0x00 && response[i+1] == 0x10 {
			// Check if "h2" follows (the selected protocol)
			for j := i + 2; j < len(response)-2 && j < i+20; j++ {
				if response[j] == 'h' && response[j+1] == '2' {
					found = true
					break
				}
			}
			break
		}
	}

	if !found {
		t.Error("ALPN extension with 'h2' not found in ServerHello")
	}
}
'''
new_alpn_test = r'''// TestBuildServerHello_WithALPN tests that ALPN is echoed in ServerHello.
func TestBuildServerHello_WithALPN(t *testing.T) {
	secret := make([]byte, 16)
	rand.Read(secret)

	clientHello := &ClientHello{
		SessionID:   make([]byte, 32),
		CipherSuite: 0x1301,
		ALPN:        []string{"h2", "http/1.1"},
	}
	rand.Read(clientHello.SessionID)
	rand.Read(clientHello.Random[:])

	response, err := BuildServerHello(secret, clientHello)
	if err != nil {
		t.Fatalf("BuildServerHello failed: %v", err)
	}

	// Parse the first TLS record and the ServerHello extension block instead of
	// scanning random/key-share bytes for a coincidental 0x0010 byte pair.
	if len(response) < 5 || response[0] != RecordTypeHandshake {
		t.Fatalf("invalid ServerHello TLS record")
	}
	recordLen := int(binary.BigEndian.Uint16(response[3:5]))
	if 5+recordLen > len(response) {
		t.Fatalf("truncated ServerHello TLS record")
	}
	hello := response[5 : 5+recordLen]
	if len(hello) < 4+2+32+1 || hello[0] != 0x02 {
		t.Fatalf("invalid ServerHello handshake")
	}

	offset := 4 + 2 + 32
	sessionIDLen := int(hello[offset])
	offset += 1 + sessionIDLen
	if offset+2+1+2 > len(hello) {
		t.Fatalf("truncated ServerHello body")
	}
	offset += 2 // cipher suite
	offset++    // compression method

	extensionsLen := int(binary.BigEndian.Uint16(hello[offset : offset+2]))
	offset += 2
	extensionsEnd := offset + extensionsLen
	if extensionsEnd > len(hello) {
		t.Fatalf("truncated ServerHello extensions")
	}

	for offset+4 <= extensionsEnd {
		extType := binary.BigEndian.Uint16(hello[offset : offset+2])
		extLen := int(binary.BigEndian.Uint16(hello[offset+2 : offset+4]))
		offset += 4
		if offset+extLen > extensionsEnd {
			t.Fatalf("truncated ServerHello extension")
		}

		if extType == 0x0010 {
			ext := hello[offset : offset+extLen]
			if len(ext) < 3 {
				t.Fatalf("malformed ALPN extension")
			}
			listLen := int(binary.BigEndian.Uint16(ext[:2]))
			if listLen+2 != len(ext) {
				t.Fatalf("malformed ALPN protocol list")
			}
			protoLen := int(ext[2])
			if 3+protoLen > len(ext) {
				t.Fatalf("truncated ALPN protocol")
			}
			if got := string(ext[3 : 3+protoLen]); got != "h2" {
				t.Fatalf("selected ALPN = %q, want h2", got)
			}
			return
		}

		offset += extLen
	}

	t.Error("ALPN extension not found in ServerHello")
}
'''
if old_alpn_test not in test_text:
    raise SystemExit("expected pinned upstream ALPN test block not found")
FAKETLS_TEST.write_text(test_text.replace(old_alpn_test, new_alpn_test, 1), encoding="utf-8")


# Apply maintained OpenWrt-only Go deltas after the small in-script compatibility fixes.
for patch in sorted((ROOT / "patches").glob("*.patch")):
    subprocess.run(["git", "apply", "--check", str(patch)], cwd=ROOT / "telego-src", check=True)
    subprocess.run(["git", "apply", str(patch)], cwd=ROOT / "telego-src", check=True)
