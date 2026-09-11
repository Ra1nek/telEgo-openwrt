<h1 align="center">Domain and DNS</h1>

<p align="center"><strong>Domain registration, authoritative DNS, DDNS, and public hostnames for <code>telEgo-openwrt</code></strong></p>

<p align="center"><code>OpenWrt</code> · <code>WEB Proxy</code> · <code>MTProto/MTProxy</code> · <code>DDNS</code></p>

<p align="center"><a href="DOMAIN.md">Русский</a> · <a href="DOMAIN_EN.md"><strong>English</strong></a></p>

---

This guide covers the complete path from choosing a domain to a working DNS setup for `telEgo-openwrt` on an OpenWrt router. It is provider-neutral and applies to both international domain extensions and country-code TLDs.

In this project, a domain is primarily used for two purposes: giving the Telegram WEB Proxy a stable HTTPS hostname and providing a stable name for direct MTProto/MTProxy when the ISP assigns a public, routable but dynamic WAN address. If the WEB Proxy is published through a Tunnel, external HTTPS on port `443` terminates at the Tunnel provider's edge and does not require OpenWrt itself to bind or forward WAN TCP/443. For direct MTProto/MTProxy, DDNS can keep the hostname synchronized with a changing public WAN address.

> [!NOTE]
> This guide was reviewed on **September 11, 2026**. Domain pricing, payment methods, supported TLDs, and registry/registrar requirements change over time. Always verify current terms with the provider before registering a domain.

## Why `telEgo-openwrt` uses a domain

| Scenario | What the domain provides | Typical DNS mechanism | Important limitation |
|---|---|---|---|
| **WEB Proxy** | A stable HTTPS hostname | Tunnel or regular DNS record | With a Tunnel, OpenWrt WAN TCP/443 is not required |
| **Direct MTProto/MTProxy** | A stable name while the WAN IP changes | `A` / `AAAA` + DDNS | Direct inbound access requires a routable public IP |
| **DNS administration** | One place to manage service names | Authoritative DNS provider | Registrar and DNS provider can be different companies |

A typical naming layout looks like this:

```text
web.example.com  -> WEB Proxy
mt.example.com   -> direct MTProto/MTProxy
```

### WEB Proxy through a Tunnel

```text
Telegram client
      |
      | HTTPS :443
      v
Tunnel provider edge
      |
      | encrypted tunnel
      v
connector on OpenWrt
      |
      v
local WEB Proxy
```

In this design, users connect over the standard external HTTPS port `443`, but that port does not need to be opened or occupied on the OpenWrt WAN interface. This avoids a conflict with the router's own HTTPS interface or another local service.

### Direct MTProto/MTProxy

```text
Telegram client
      |
      v
mt.example.com
      |
      | A / AAAA
      v
public WAN IP of OpenWrt
      |
      v
direct MTProto/MTProxy
```

If the public WAN address is dynamic, a DDNS client updates the corresponding `A` or `AAAA` record whenever the address changes.

> [!IMPORTANT]
> DDNS only solves the problem of a **changing public IP address**. It does not solve port conflicts and it does not make CGNAT publicly reachable. Direct MTProto/MTProxy requires a routable public address from the ISP or another inbound-connectivity method. If WAN TCP/443 is already in use, the direct proxy must use another available port.

---

## Setup roadmap

| Stage | Result |
|---|---|
| **1. Choose a TLD** | You have a suitable domain extension |
| **2. Choose a registrar** | Pricing, renewal, payment, and ownership requirements are clear |
| **3. Register the domain** | The domain appears in the registrar control panel |
| **4. Choose a DNS provider** | You know where authoritative DNS records will be hosted |
| **5. Configure nameservers** | The domain is delegated to the selected DNS provider |
| **6. Verify DNS** | `NS`, `A`, and `AAAA` records resolve as expected |
| **7. Enable DDNS if needed** | DNS automatically follows a changing WAN address |
| **8. Enable DNSSEC** | DNS responses receive cryptographic validation |

---

## 1. What you need

For domain registration itself, you only need the domain and access to its management panel. Direct MTProto/MTProxy additionally requires a public WAN address or another way to provide inbound connectivity.

Examples:

```text
example.com
example.net
example.org
<your-domain>.ru
```

You do not need to buy web hosting, rent a VPS, or purchase a separate TLS certificate merely to register the domain.

After registration, you can create dedicated subdomains for individual services:

```text
web.example.com
mt.example.com
status.example.com
```

Choose the actual names to fit your deployment.

---

## 2. Choose a domain extension

The part after the final dot is the **TLD — Top-Level Domain**.

```text
example.com       -> .com
example.org       -> .org
<your-domain>.ru  -> .ru
```

There is no single best TLD. Consider:

- whether the name you want is available;
- the initial registration price;
- the normal renewal price;
- the rules of the chosen TLD;
- whether customers in your country are eligible to register it;
- available payment methods;
- how easy the domain is to manage;
- ownership or registrant-verification requirements.

Common international extensions such as `.com`, `.net`, and `.org` work well for many technical deployments. A country-code TLD can also be a good choice when its rules suit the domain owner.

> [!TIP]
> Do not choose a domain solely because the first year is inexpensive. For a long-running service, renewal terms, account recovery, and ownership control matter more than an introductory discount.

---

## 3. Choose a registrar

A **registrar** is the company through which a domain is registered, renewed, and transferred. It does not have to be the same company that provides DNS service.

Before paying, verify:

- support for the required TLD;
- eligibility from your country;
- an available payment method;
- first-period and normal renewal pricing;
- whether authoritative nameservers (`NS`) can be changed;
- DNSSEC support;
- MFA/2FA availability;
- a clear transfer-out procedure;
- identity or documentation requirements for the registrant.

### International registrars

For international TLDs, options include:

- Cloudflare Registrar;
- Namecheap;
- Porkbun;
- another ICANN-accredited registrar.

These are examples, not requirements for `telEgo-openwrt`. The right choice depends on your country, TLD, renewal cost, payment options, and account requirements.

Cloudflare Registrar, for example, supports more than 400 TLDs, but not every domain extension in existence. If the extension you want is not available in the registration search, it cannot be registered through Cloudflare Registrar.

### Country-code domains

Country-code TLDs can have registry-specific requirements, including:

- citizenship or residency;
- local presence or address;
- company registration;
- identity verification;
- special transfer rules;
- additional DNSSEC or contact-data requirements.

Review the corresponding registry rules before purchasing a country-code domain.

---

## 4. Notes for users in Russia

Users in Russia should verify **TLD availability** and **payment availability** separately.

An international registrar is not guaranteed to:

- offer `.ru`, `.рф`, or `.su`;
- provide every product to accounts registered in Russia;
- accept cards issued by Russian banks;
- support a payment method available to the user.

For Russian national domains, using a Russian registrar can therefore be operationally simpler while still hosting DNS with a separate provider if desired.

Registrars serving `.ru`, `.рф`, or `.su` include, for example:

- Timeweb;
- Reg.ru;
- RU-CENTER;
- another registrar accredited for the required zone.

### Identity verification for `.RU`, `.РФ`, and `.SU`

Starting **September 1, 2026**, management of `.RU`, `.РФ`, and `.SU` domains requires administrator identity verification through Russia's ESIA/Gosuslugi system.

Verification is required for significant operations including:

- registration;
- renewal;
- registrar transfer;
- administrator changes;
- administrator-data changes;
- delegation and authoritative nameserver changes.

For an individual, this normally requires a verified Gosuslugi account.

> [!IMPORTANT]
> If you plan to use `.ru`, `.рф`, or `.su`, complete the required verification **before changing DNS or nameservers**. Without it, the registrar may block domain-management operations.

If the requirements of a particular national TLD cannot be met, use another domain extension that is available to you.

---

## 5. General domain registration procedure

Registrar interfaces differ, but the workflow is usually the same.

1. Open the website of the registrar you want to use.
2. Create an account.
3. Enable MFA/2FA if available.
4. Open the domain search or registration page.
5. Enter the desired name and check availability.
6. Choose the TLD.
7. Enter the registrant or administrator information.
8. Complete identity verification if required by the registry.
9. Select the registration term.
10. Review both the first-period price and the normal renewal price.
11. Remove unnecessary extras. Hosting, website builders, paid email, and additional certificates can always be added later.
12. Complete payment.
13. Wait for the domain to appear in the registrar control panel.

After registration, verify the expiration date and review the Auto-Renew settings.

> [!TIP]
> For an infrastructure domain, store registrar details, recovery information, the renewal date, and the account-recovery procedure in a secure location from the beginning.

---

## 6. Example for Russia: `.ru` through Timeweb

The following walkthrough uses an anonymized placeholder:

```text
<your-domain>.ru
```

Timeweb menu labels may change slightly over time, but the workflow remains the same.

### Step 1. Create an account

Create a Timeweb account and confirm your contact details if required by the current onboarding process.

You do not need to purchase hosting or a VPS together with the domain.

### Step 2. Prepare the domain administrator

For `.ru`, `.рф`, and `.su`, open the domain administrator section and complete the required ESIA identity verification.

In the Timeweb panel:

**Домены и SSL → Администраторы**

Check the administrator details carefully. They must match the verified Gosuslugi identity data.

### Step 3. Find an available domain

Open:

**Домены и SSL → Купить домен**

Enter the domain you want:

```text
<your-domain>.ru
```

If it is already registered, choose another name.

### Step 4. Review the order

Before paying, verify:

- the exact domain name;
- the selected TLD;
- the domain administrator;
- the registration term;
- the registration price;
- the normal renewal price.

Additional hosting is not required for this guide.

### Step 5. Complete the purchase

Choose an available payment method and complete the order.

After the payment is processed, the domain will appear in the domain-management section. Registration and DNS-related changes may not become visible everywhere immediately.

### Step 6. Verify the result

Confirm that:

- the domain is registered to the intended administrator;
- the expiration date is correct;
- registrar-panel access works;
- Auto-Renew settings match your policy.

> [!NOTE]
> Domain registration is now complete. You can keep DNS at Timeweb or delegate it to another DNS provider.

---

## 7. DNS basics

A domain is delegated to **authoritative DNS servers**. At the registrar, this delegation is represented by nameservers (`NS`).

Example:

```text
ns1.dns-provider.example
ns2.dns-provider.example
```

DNS can be provided by:

- the registrar;
- a hosting provider;
- a dedicated DNS provider;
- Cloudflare;
- your own DNS infrastructure.

The registrar and DNS provider are separate roles. You can keep a domain registered with one company while hosting authoritative DNS somewhere else.

### DNS remains with the registrar

You do not need to change nameservers. Create the required DNS records in the registrar control panel.

```text
A       host.example.com       203.0.113.10
AAAA    host.example.com       2001:db8::10
CNAME   www.example.com        host.example.com
```

The `203.0.113.0/24` and `2001:db8::/32` ranges are documentation networks and are used here only as examples.

### A separate DNS provider is used

First add the domain to the selected DNS provider. It will provide the authoritative nameservers that must be configured at the registrar.

Then:

1. open domain management at the registrar;
2. find the nameserver / NS settings;
3. replace the current nameserver set with the one supplied by the new DNS provider;
4. save the change;
5. wait for delegation to propagate.

> [!WARNING]
> Use only the nameservers assigned to your own domain or account. Never copy nameservers from somebody else's guide or screenshot.

---

## 8. Verify DNS

Check authoritative nameservers:

```sh
nslookup -type=NS example.com
```

Check a specific hostname:

```sh
nslookup host.example.com
```

For IPv4 and IPv6, you can also query the records directly:

```sh
nslookup -type=A host.example.com
nslookup -type=AAAA host.example.com
```

Nameserver changes and DNS updates are not always immediate. Depending on the registrar, registry, and DNS caches, propagation can take anywhere from a few minutes to several hours.

> [!NOTE]
> Seeing the old nameservers immediately after a change does not necessarily indicate a problem. Allow time for delegation to propagate and check again.

---

## 9. Dynamic DNS for a changing WAN address

If OpenWrt receives a **public but dynamic** IP address, it is convenient to bind direct MTProto/MTProxy to a hostname and keep that hostname current through DDNS.

The flow is straightforward:

```text
ISP changes WAN IP
       |
       v
DDNS client on OpenWrt
       |
       | DNS provider API
       v
A / AAAA record is updated
       |
       v
mt.example.com points to the current WAN IP
```

For this design, the DNS provider should expose an API or a built-in Dynamic DNS mechanism. Cloudflare is one possible choice, but it is not the only one.

> [!IMPORTANT]
> A direct proxy record must point to a real routable WAN address. If the ISP uses CGNAT, DDNS can still update the hostname correctly, but inbound connectivity will remain unavailable.

---

## 10. DNSSEC

DNSSEC adds cryptographic validation to DNS responses and helps protect against forged DNS data.

If DNSSEC has not been enabled before, the safer sequence is:

1. finish configuring the DNS provider;
2. verify that the domain resolves correctly;
3. enable DNSSEC afterward.

If DNSSEC is already active and you are changing DNS providers, follow the migration procedure for both providers. An old DS record combined with new nameservers can make the domain fail for validating resolvers.

> [!WARNING]
> Do not change DNS providers while leaving an old active DS record in place unless you understand the exact DNSSEC migration procedure.

---

## 11. Protect the domain account

A domain is part of your infrastructure. Registrar access deserves the same level of protection as server or router access.

Recommended precautions:

- enable MFA/2FA;
- use a unique password;
- enable Registrar Lock where available;
- verify recovery email and phone details;
- configure Auto-Renew according to your policy;
- make sure the payment method will still work when renewal is due;
- store MFA recovery codes securely;
- enable DNSSEC after the DNS configuration is stable.

> [!CAUTION]
> Do not publish identity documents, ESIA/Gosuslugi information, payment details, recovery codes, or registrar session cookies.

---

## 12. Minimal example: Cloudflare DNS

Cloudflare is one possible DNS provider. Its authoritative DNS service is available on the Free plan, making it a practical option for this setup.

### Connect the domain

1. Register the domain with a suitable registrar.
2. Add the existing domain to Cloudflare Dashboard.
3. Review the DNS records Cloudflare discovers or imports.
4. Cloudflare will display two authoritative nameservers assigned to your zone.
5. Replace the current registrar nameservers with that pair.
6. Wait until the Cloudflare zone becomes **Active**.
7. Verify delegation:

```sh
nslookup -type=NS example.com
```

The response should contain the nameservers assigned specifically to your domain.

### Use Cloudflare as the DDNS provider

For direct MTProto/MTProxy behind a dynamic public IP, Cloudflare DNS can also serve as the DDNS backend. A client on OpenWrt or an external script detects the current WAN address and updates the selected hostname's `A` or `AAAA` record through the Cloudflare API.

```text
OpenWrt WAN IP
      |
      v
DDNS client
      |
      | Cloudflare API
      v
mt.example.com -> current public IP
```

The exact DDNS implementation depends on the OpenWrt package or script you choose and is separate from domain registration.

> [!NOTE]
> Cloudflare is shown here as an **example DNS/DDNS provider**, not as a required part of domain registration.

Cloudflare Tunnel, `cloudflared` installation, Published Application configuration, and WEB Proxy integration are documented separately in **[Cloudflare Tunnel on OpenWrt](CLOUDFLARE_EN.md)**.

---

## 13. Other DNS providers

Cloudflare is optional. DNS can remain with the registrar or be hosted by any other provider that meets your requirements.

When choosing a DNS provider, consider:

| Criterion | Why it matters |
|---|---|
| **Reliability** | The domain should resolve consistently from the Internet |
| **DNSSEC** | Protects the integrity of DNS responses |
| **API** | Enables automation and DDNS |
| **Dynamic DNS** | Keeps `A` / `AAAA` current when the WAN address changes |
| **Geographic availability** | The service must remain reachable from your region |
| **Account restrictions** | Product and payment availability may vary by country |
| **Cost** | Especially relevant for long-term use |

For `telEgo-openwrt`, the important requirement is not the DNS provider's brand. What matters is a correctly registered domain and full control over its DNS records.

---

## 14. References

### General

- ICANN accredited registrar list: https://www.icann.org/en/accredited-registrars

### Russia and national domains

- Timeweb — domain registration and renewal: https://timeweb.com/ru/docs/domeny/registraciya-i-prodlenie/registraciya-i-prodlenie-domena/
- Timeweb — ESIA identity verification: https://timeweb.com/ru/docs/domeny/identifikaciya-cherez-esia/
- Timeweb — DNS configuration: https://timeweb.com/ru/docs/domeny/resursnye-zapisi-domena-dns-zapisi/nastrojka-dns-zapisej/
- `.RU/.РФ` Coordination Center: https://cctld.ru/
- Reg.ru — nameserver configuration: https://help.reg.ru/support/dns-servery-i-nastroyka-zony/rabota-s-dns-serverami/kak-propisat-dns-dlya-domena-v-lichnom-kabinete-reg-ru

### International registrars and DNS

- Cloudflare Registrar: https://developers.cloudflare.com/registrar/
- Cloudflare Registrar supported TLDs: https://developers.cloudflare.com/registrar/top-level-domains/
- Cloudflare DNS Full setup: https://developers.cloudflare.com/dns/zone-setups/full-setup/setup/
- Cloudflare DNS FAQ: https://developers.cloudflare.com/dns/faq/
- Cloudflare API tokens: https://developers.cloudflare.com/fundamentals/api/get-started/create-token/
- Namecheap: https://www.namecheap.com/
- Porkbun: https://porkbun.com/

---

<p align="center"><strong>Next step:</strong> <a href="CLOUDFLARE_EN.md">Cloudflare Tunnel on OpenWrt</a> · <a href="README_EN.md">Back to documentation</a></p>
