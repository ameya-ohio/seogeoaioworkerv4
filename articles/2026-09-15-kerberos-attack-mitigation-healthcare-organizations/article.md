---
title: "Kerberos Attack Mitigation in Healthcare: One Attack Path"
slug: "kerberos-attack-mitigation-healthcare-organizations"
author: "Ameya Deshmukh"
author_bio_url: ""  # (placeholder) no Saporo author bio page published yet; config/company.yaml author.bio_url is empty
publish_date: "2026-09-15"
modified_date: "2026-09-21"
meta_description: "Kerberos attack mitigation for hospitals: Kerberoasting, golden tickets, pass-the-ticket and delegation abuse form one attack path. See what to fix first."
primary_keyword: "kerberos attack mitigation"
secondary_keywords:
  - "kerberoasting healthcare"
  - "golden ticket attack mitigation"
  - "pass-the-hash vs pass-the-ticket"
  - "kerberos delegation attacks"
  - "credential guard vs defender credential guard"
  - "RC4 kerberos deprecation healthcare"
canonical_url: "/resources/blog/kerberos-attack-mitigation-healthcare-organizations"  # self-canonical, site-relative; Phase 5 resolves it against company.yaml blog.canonical_pattern (absolute form in meta.json)
hero_image: "header.png"
hero_image_width: 2400
hero_image_height: 1200
hero_image_alt: "Article header card reading 'Kerberos Attack Mitigation in Healthcare: One Attack Path' beneath an Identity Security label, on a Saporo-branded background."
category: "Identity Security"
tags:
  - "Kerberos"
  - "Active Directory"
  - "Healthcare"
  - "Attack Paths"
  - "Hybrid Identity"
  - "Credential Theft"
reading_time_minutes: 9
---

# Kerberos Attack Mitigation in Healthcare: One Attack Path

In May 2024, ransomware operators shut down clinical operations across Ascension after a contractor clicked a malicious link found through a Bing search. The attackers then used Kerberoasting, which [Senator Ron Wyden's September 2025 letter to the FTC](https://www.wyden.senate.gov/news/press-releases/wyden-calls-for-ftc-investigation-of-microsoft-for-enabling-ascension-hospital-ransomware-hack-with-insecure-software) describes as exploiting "an insecure encryption technology from the 1980s known as 'RC4' that is still supported by Microsoft software in its default configuration." The HHS Office for Civil Rights breach portal [put the count at 5,599,699 people](https://www.hipaajournal.com/ascension-cyberattack-2024/) in December 2024.

The standard advice on Kerberos attack mitigation is correct. Force AES instead of RC4, give service accounts long random passwords, watch Event ID 4769, restrict delegation, turn on Credential Guard. All of it existed in 2024.

What it leaves out is sequence, which is what carried an unremarkable service account to the center of a health system.

## Key Takeaways

- Kerberoasting, golden ticket forgery, pass-the-ticket, and delegation abuse are four stages of one intrusion, not four independent fixes.
- Since July 2026, Active Directory domain controllers no longer issue RC4 Kerberos tickets by default, under Microsoft's CVE-2026-20833 rollout.
- Re-enabling RC4 for a legacy clinical device is a HIPAA technical-safeguards exception, not a compatibility setting.
- A kerberoastable service account is dangerous in proportion to what its delegation rights let it reach, not to its privilege label.
- Golden ticket remediation takes two consecutive KRBTGT password resets, because Active Directory still honors the previous password after a single reset.

## Four Kerberos attacks add up to one attack path

Kerberoasting, golden ticket forgery, pass-the-ticket, and delegation abuse are stages of a single intrusion. Kerberoasting supplies the first working credential, delegation rights decide how far it travels, pass-the-ticket keeps it usable after a password rotation, and a forged golden ticket makes the access survive remediation.

CISA documented that sequence in [advisory AA23-349A](https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-349a), published December 2023 on an assessment run that January at a healthcare organization. The team "used Impacket's GetUserSPNs tool to request Ticket-Granting Service (TGS) tickets for all accounts with SPN set," found three with domain administrator privileges, and cracked the one with a weak password offline. Every step used Kerberos exactly as designed.

<!-- INTERNAL LINK PLACEHOLDER: pillar, "Preemptive Identity Security: A Guide to Closing Identity Attack Paths Before They're Exploited". Not yet published (saporo.io/resources/blog/preemptive-identity-security-guide returns 404 as of 2026-09-21); link from this paragraph once live (D35). -->

## Kerberoasting exploits a weak service-account password wrapped in legacy encryption

**Kerberoasting** is requesting a Kerberos service ticket for any account with a Service Principal Name, then cracking that ticket's encrypted password hash offline. Any authenticated domain user can run it against any service account without touching the service.

Detection is hard because the request is ordinary Kerberos traffic, identical to a clinician's workstation opening an EHR client. Rafael Alfaro March and Rodrigo Munoz of NCC Group note in [*Defending Your Directory*](https://www.nccgroup.com/research/defending-your-directory-an-expert-guide-to-combating-kerberoasting-in-active-directory/) that Event ID 4769 "is often noisy in respect of logging which is why it's often not logged," and that attacking tools request tickets with encryption type 0x17, RC4-HMAC. Read that encryption type alongside per-account behavior, such as one account requesting dozens of SPNs in minutes.

Forcing AES raises the cost of cracking rather than removing it, since an AES ticket protecting a vendor password chosen a decade ago still falls. What reduces exposure is the set MITRE ATT&CK lists under [T1558.003](https://attack.mitre.org/techniques/T1558/003/): AES encryption rather than RC4 (M1041), service-account passwords of "ideally 25+ characters" (M1027), and keeping service accounts out of Domain Administrators (M1026). **Group Managed Service Accounts (gMSA)** are the structural version, because Active Directory generates and rotates the password itself, at a length no cracking run recovers.

## A golden ticket outlives a single password reset

**A golden ticket attack** forges a Kerberos Ticket-Granting Ticket using the stolen password hash of the KRBTGT account, letting the attacker issue valid tickets for any user in the domain. KRBTGT is the account whose key signs every TGT in Active Directory, so an attacker holding that hash has stopped authenticating and started issuing credentials.

Active Directory keeps a KRBTGT password history of two, so tickets signed with the previous key still validate, and [Semperis's golden ticket guidance](https://www.semperis.com/blog/how-to-defend-against-golden-ticket-attacks/) prescribes changing the password "twice in a row to address Kerberos' ability to recall the last two passwords." One reset only moves the stolen key into that previous slot.

Prevention sits earlier on the path than remediation. The KRBTGT hash comes only off a domain controller or out of directory replication rights, so the steps worth closing are the ones that carry an attacker there.

## Pass-the-hash and pass-the-ticket move through a hospital network differently

**Pass-the-hash** replays a stolen password hash to authenticate as its owner without knowing the password. **Pass-the-ticket** replays an already-issued Kerberos ticket directly, skipping the hash-to-ticket step. The distinction is operational: rotating the password defeats the first technique and does nothing to the second.

| | Pass-the-hash | Pass-the-ticket |
|---|---|---|
| What the attacker steals | An NTLM password hash | An issued Kerberos TGT or service ticket |
| Where it comes from | LSASS memory, the SAM database, or a credential dump | LSASS memory or an exported ticket cache |
| What ends the access | Rotating the password invalidates the hash | Only the ticket's own lifetime expiring |
| What the defender controls | Password policy and rotation cadence | Ticket lifetime policy and memory isolation |

A vendor engineer's troubleshooting session left a ticket cached in memory on a radiology workstation, and an attacker who takes that machine replays it against the PACS archive as the integration account.

Credential Guard ends that step. Microsoft Learn's [Credential Guard overview](https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/) states that it "uses Virtualization-based security (VBS) to isolate secrets so that only privileged system software can access them," naming *pass the hash* and *pass the ticket* among the attacks those secrets enable.

## Delegation abuse turns one compromised server into domain-wide reach

Kerberos delegation lets a server authenticate to a second service on behalf of a user, in three forms. **Unconstrained delegation** lets that server impersonate the user to any service in the domain. **Constrained delegation** limits impersonation to a defined service list. **Resource-based constrained delegation** lets the target resource decide who may impersonate users to it.

Unconstrained delegation is the one a hospital should treat as an emergency. [Sean Metcalf of Trimarc Security](https://www.trimarcsecurity.com/hub-post/active-directory-security-risk-101-kerberos-unconstrained-delegation-or-how-compromise-of-a-singl-1) documents that when a user authenticates to such a server, "the server opens the TGS and places the user's TGT into LSASS for later use," where "the Domain Admin's authentication (TGT) ticket can be extracted and re-used." The attacker ends up holding a valid ticket rather than a hash, so no cracking is needed.

A lab-integration server sits in a VLAN reachable from any clinical workstation, configured with unconstrained delegation years ago because a vendor's installer asked for it. A domain administrator connects during a maintenance window, and every workstation on that floor is one hop from Tier 0.

## Mitigation holds up only when it covers both on-premises AD and Entra ID

On-premises Kerberos telemetry does not reach Entra ID, so a hospital running hybrid identity has to correlate two evidence sources. [Microsoft's RC4 detection and remediation guidance](https://learn.microsoft.com/en-us/windows-server/security/kerberos/detect-remediate-rc4-kerberos) points to Event IDs 4768 and 4769, the `msDS-SupportedEncryptionTypes` attribute, and the open-source `Get-KerbEncryptionUsage.ps1` script, none of which surfaces in an Entra ID sign-in log. An attacker who compromises a synced on-premises account moves into Microsoft 365 unobserved.

The RC4 deadline has already passed. [Microsoft's retirement](https://techcommunity.microsoft.com/discussions/microsoft-security/kerberos-and-the-end-of-rc4-protocol-hardening-and-preparing-for-cve%E2%80%912026%E2%80%9120833/4502262) ran in three phases under CVE-2026-20833: audit-only logging in January 2026, AES-only enforcement in April 2026, and a July 2026 phase that removed "audit mode and rollback options." RC4 now works only if explicitly configured, which Microsoft calls "a practice that is strongly discouraged."

The older PACS units, lab middleware, and imaging modalities that only ever spoke RC4 either stopped authenticating this year or run on an administrator-configured exception, which is a HIPAA §164.312 technical-safeguards decision needing a named owner, a compensating control, and an expiration date.

Correlating the two sides is where an attack path graph earns its place. Saporo connects on-premises AD Kerberos exposure and Entra ID hybrid-identity risk in one graph, ranked by [reachability, propagation potential, and impact to critical assets](https://www.saporo.io/product/overview) and [scored against the ANSSI, CIS, ISO, and MITRE frameworks](https://www.saporo.io/about/company), so a Kerberoasting path (ATT&CK T1558.003) and a golden ticket path (T1558.001) come out ordered by where they end.

<!-- INTERNAL LINK PLACEHOLDERS: sibling spokes "Privileged access management for AD/hybrid healthcare environments" and "What are identity-based attacks in healthcare IT" belong in this paragraph. Both return 404 on saporo.io as of 2026-09-21, so they are omitted rather than linked (D35). -->

## Credential Guard and Defender Credential Guard are the same feature

Credential Guard and Windows Defender Credential Guard are the same Windows feature under two eras of Microsoft branding, so a hospital deploys one control, not two.

**Credential Guard** protects NTLM password hashes and Kerberos Ticket-Granting Tickets with virtualization-based security, so malware running with administrative privileges "can't extract secrets that are protected by VBS." Its coverage stops short of Tier 0: Microsoft states it "doesn't provide protections for the Active Directory database or the Security Accounts Manager (SAM)" and adds no security on domain controllers, where the KRBTGT hash lives.

The deployment constraint is hardware. Credential Guard requires virtualization-based security and Secure Boot, and turns on by default only on domain-joined, non-domain-controller systems running Windows 11 22H2 or Windows Server 2025. A vendor-locked ultrasound cart on a frozen Windows image will not qualify, and network isolation is the answer.

## Frequently Asked Questions

### Why do you have to reset the KRBTGT password twice after a golden ticket attack, not only once?

Active Directory keeps a KRBTGT password history of two, so tickets signed with the previous key still validate. A single reset pushes the stolen key into that previous slot, where it keeps validating forged tickets. Semperis's golden ticket guidance prescribes changing the password twice in a row for exactly that reason.

### Is it safe to re-enable RC4 for a legacy clinical device that can't support AES, and what does that do to HIPAA compliance?

Microsoft calls explicit RC4 configuration "a practice that is strongly discouraged," and since July 2026 that is the only way RC4 functions. Treat it as a documented, time-boxed exception under the HIPAA Security Rule's technical safeguards at §164.312, with a named owner, network isolation, and an expiration date.

### Are Group Managed Service Accounts (gMSA) practical for vendor-managed EHR, PACS, or lab-middleware systems?

Not universally, and the constraint is the vendor rather than the technology. gMSA requires the application to retrieve its password from Active Directory at runtime, which clinical applications with hardcoded credentials cannot do. Adopt gMSA where it works, put the rest on long random passwords with AES, and renegotiate at contract renewal.

### Which delegation type, unconstrained, constrained, or resource-based constrained, should a hospital worry about most?

Unconstrained delegation, by a wide margin. A server configured for it receives a full copy of the TGT of every user who authenticates to it, domain administrators included, so compromising it yields reusable tickets for all of them. The other two forms limit impersonation scope; unconstrained delegation reachable from clinical workstations is what to find first.

### How do you find kerberoastable accounts in your own Active Directory before an attacker does?

Enumerate every account with a `servicePrincipalName` set, which is the query an attacker runs, then rank them by what each one reaches through group memberships, delegation rights, and the systems it authenticates to. Check `msDS-SupportedEncryptionTypes` on each to confirm AES support, and run Microsoft's `Get-KerbEncryptionUsage.ps1` script to catch accounts still on RC4.

### Do hospitals need to deploy both Credential Guard and Windows Defender Credential Guard?

No. They are one feature under two generations of Microsoft naming, and Microsoft Learn now uses only "Credential Guard." Enable it once on systems meeting the virtualization-based security and Secure Boot prerequisites. The real work is finding the clinical devices that cannot.

## Where Kerberos attack mitigation should actually start

A control inventory tells you which Kerberos settings are missing. An attack path tells you which missing setting carries an attacker to a domain controller and which sits on a segment nothing can reach. A hospital security team has hours, and only the second answer says where to spend them.

To see that ordering on your own domain, Saporo ranks every Kerberos exposure by [what the compromised credential would reach next](https://www.saporo.io/product/overview).

```json-ld
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/#organization",
      "name": "Saporo",
      "url": "https://www.saporo.io",
      "description": "Saporo delivers Preemptive Identity Exposure Management (PIEM), continuously discovering, prioritizing, and reducing identity exposure across hybrid environments for human and non-human identities.",
      "logo": {
        "@type": "ImageObject",
        "url": "https://framerusercontent.com/images/eUkXw1GQzL6QlpIts0hsShXBGN4.png",
        "width": 180,
        "height": 180
      },
      "sameAs": [
        "https://www.linkedin.com/company/saporo-cybersecurity"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://www.saporo.io/#website",
      "url": "https://www.saporo.io",
      "name": "Saporo",
      "publisher": { "@id": "https://www.saporo.io/#organization" },
      "inLanguage": "en-us"
    },
    {
      "@type": "Person",
      "@id": "https://www.saporo.io/about/ameya-deshmukh#person",
      "name": "Ameya Deshmukh",
      "url": "https://www.saporo.io/about/ameya-deshmukh",
      "jobTitle": "Head of Content & Marketing",
      "worksFor": { "@id": "https://www.saporo.io/#organization" },
      "sameAs": [
        "https://www.linkedin.com/in/ameyadeshmukh/"
      ]
    },
    {
      "@type": "ImageObject",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#primaryimage",
      "url": "https://www.saporo.io/images/blog/kerberos-attack-mitigation-healthcare-organizations-hero.png",
      "contentUrl": "https://www.saporo.io/images/blog/kerberos-attack-mitigation-healthcare-organizations-hero.png",
      "width": 2400,
      "height": 1200,
      "caption": "Article header card reading 'Kerberos Attack Mitigation in Healthcare: One Attack Path' beneath an Identity Security label, on a Saporo-branded background."
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#breadcrumbs",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.saporo.io/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.saporo.io/resources/blog" },
        { "@type": "ListItem", "position": 3, "name": "Kerberos Attack Mitigation in Healthcare: One Attack Path", "item": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations" }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#webpage",
      "url": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations",
      "name": "Kerberos Attack Mitigation in Healthcare: One Attack Path",
      "isPartOf": { "@id": "https://www.saporo.io/#website" },
      "primaryImageOfPage": { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#primaryimage" },
      "breadcrumb": { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#breadcrumbs" },
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": ["#key-takeaways", ".key-takeaways"]
      },
      "inLanguage": "en-us"
    },
    {
      "@type": "BlogPosting",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#article",
      "headline": "Kerberos Attack Mitigation in Healthcare: One Attack Path",
      "description": "Kerberos attack mitigation for hospitals: Kerberoasting, golden tickets, pass-the-ticket and delegation abuse form one attack path. See what to fix first.",
      "author": { "@id": "https://www.saporo.io/about/ameya-deshmukh#person" },
      "publisher": { "@id": "https://www.saporo.io/#organization" },
      "datePublished": "2026-09-15",
      "dateModified": "2026-09-21",
      "image": { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#primaryimage" },
      "mainEntityOfPage": { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#webpage" },
      "keywords": "kerberos attack mitigation, kerberoasting healthcare, golden ticket attack mitigation, pass-the-hash vs pass-the-ticket, kerberos delegation attacks, credential guard vs defender credential guard, RC4 kerberos deprecation healthcare",
      "wordCount": 1999,
      "articleSection": "Identity Security",
      "inLanguage": "en-us",
      "mentions": [
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-kerberos-protocol" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-active-directory" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-pass-the-hash" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-rc4" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-aes" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-credential-guard" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-mimikatz" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-mitre-attck" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-cisa" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-microsoft" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-ascension" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-hhs-ocr" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-ron-wyden" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-microsoft-entra-id" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-gmsa" },
        { "@id": "https://www.saporo.io/#organization" }
      ],
      "citation": [
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-wyden-ftc-letter" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-hipaa-journal-ascension" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-cisa-aa23-349a" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-nccgroup-defending-your-directory" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-mitre-attck-t1558-003" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-semperis-golden-ticket" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-microsoft-learn-credential-guard" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-trimarc-unconstrained-delegation" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-microsoft-learn-rc4-detect-remediate" },
        { "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-microsoft-techcommunity-rc4-retirement" }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Why do you have to reset the KRBTGT password twice after a golden ticket attack, not only once?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Active Directory keeps a KRBTGT password history of two, so tickets signed with the previous key still validate. A single reset pushes the stolen key into that previous slot, where it keeps validating forged tickets. Semperis's golden ticket guidance prescribes changing the password twice in a row for exactly that reason."
          }
        },
        {
          "@type": "Question",
          "name": "Is it safe to re-enable RC4 for a legacy clinical device that can't support AES, and what does that do to HIPAA compliance?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Microsoft calls explicit RC4 configuration \"a practice that is strongly discouraged,\" and since July 2026 that is the only way RC4 functions. Treat it as a documented, time-boxed exception under the HIPAA Security Rule's technical safeguards at §164.312, with a named owner, network isolation, and an expiration date."
          }
        },
        {
          "@type": "Question",
          "name": "Are Group Managed Service Accounts (gMSA) practical for vendor-managed EHR, PACS, or lab-middleware systems?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Not universally, and the constraint is the vendor rather than the technology. gMSA requires the application to retrieve its password from Active Directory at runtime, which clinical applications with hardcoded credentials cannot do. Adopt gMSA where it works, put the rest on long random passwords with AES, and renegotiate at contract renewal."
          }
        },
        {
          "@type": "Question",
          "name": "Which delegation type, unconstrained, constrained, or resource-based constrained, should a hospital worry about most?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Unconstrained delegation, by a wide margin. A server configured for it receives a full copy of the TGT of every user who authenticates to it, domain administrators included, so compromising it yields reusable tickets for all of them. The other two forms limit impersonation scope; unconstrained delegation reachable from clinical workstations is what to find first."
          }
        },
        {
          "@type": "Question",
          "name": "How do you find kerberoastable accounts in your own Active Directory before an attacker does?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Enumerate every account with a servicePrincipalName set, which is the query an attacker runs, then rank them by what each one reaches through group memberships, delegation rights, and the systems it authenticates to. Check msDS-SupportedEncryptionTypes on each to confirm AES support, and run Microsoft's Get-KerbEncryptionUsage.ps1 script to catch accounts still on RC4."
          }
        },
        {
          "@type": "Question",
          "name": "Do hospitals need to deploy both Credential Guard and Windows Defender Credential Guard?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "No. They are one feature under two generations of Microsoft naming, and Microsoft Learn now uses only \"Credential Guard.\" Enable it once on systems meeting the virtualization-based security and Secure Boot prerequisites. The real work is finding the clinical devices that cannot."
          }
        }
      ]
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-kerberoasting",
      "name": "Kerberoasting",
      "description": "Requesting a Kerberos service ticket for any account with a Service Principal Name, then cracking that ticket's encrypted password hash offline."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-gmsa",
      "name": "Group Managed Service Accounts (gMSA)",
      "description": "The structural fix for weak service-account passwords: Active Directory generates and rotates the password itself, at a length no cracking run recovers."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-golden-ticket-attack",
      "name": "Golden ticket attack",
      "description": "Forging a Kerberos Ticket-Granting Ticket using the stolen password hash of the KRBTGT account, letting the attacker issue valid tickets for any user in the domain."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-pass-the-hash",
      "name": "Pass-the-hash",
      "description": "Replaying a stolen password hash to authenticate as its owner without knowing the password."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-pass-the-ticket",
      "name": "Pass-the-ticket",
      "description": "Replaying an already-issued Kerberos ticket directly, skipping the hash-to-ticket step."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-unconstrained-delegation",
      "name": "Unconstrained delegation",
      "description": "A form of Kerberos delegation that lets the receiving server impersonate the user to any service in the domain."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-constrained-delegation",
      "name": "Constrained delegation",
      "description": "A form of Kerberos delegation that limits impersonation to a defined service list."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-resource-based-constrained-delegation",
      "name": "Resource-based constrained delegation",
      "description": "A form of Kerberos delegation that lets the target resource decide who may impersonate users to it."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#term-credential-guard",
      "name": "Credential Guard",
      "description": "A Microsoft feature that protects NTLM password hashes and Kerberos Ticket-Granting Tickets with virtualization-based security, so malware running with administrative privileges can't extract secrets protected by VBS."
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-kerberos-protocol",
      "name": "Kerberos (protocol)",
      "sameAs": "https://en.wikipedia.org/wiki/Kerberos_(protocol)"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-active-directory",
      "name": "Active Directory",
      "sameAs": "https://en.wikipedia.org/wiki/Active_Directory"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-pass-the-hash",
      "name": "Pass the hash",
      "sameAs": "https://en.wikipedia.org/wiki/Pass_the_hash"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-rc4",
      "name": "RC4",
      "sameAs": "https://en.wikipedia.org/wiki/RC4"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-aes",
      "name": "Advanced Encryption Standard (AES)",
      "sameAs": "https://en.wikipedia.org/wiki/Advanced_Encryption_Standard"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-credential-guard",
      "name": "Credential Guard",
      "sameAs": "https://en.wikipedia.org/wiki/Credential_Guard"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-mimikatz",
      "name": "Mimikatz",
      "sameAs": "https://en.wikipedia.org/wiki/Mimikatz"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-mitre-attck",
      "name": "MITRE ATT&CK",
      "sameAs": "https://en.wikipedia.org/wiki/MITRE_ATT%26CK"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-cisa",
      "name": "Cybersecurity and Infrastructure Security Agency (CISA)",
      "sameAs": "https://en.wikipedia.org/wiki/Cybersecurity_and_Infrastructure_Security_Agency"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-microsoft",
      "name": "Microsoft",
      "sameAs": "https://en.wikipedia.org/wiki/Microsoft"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-ascension",
      "name": "Ascension (healthcare system)",
      "sameAs": "https://en.wikipedia.org/wiki/Ascension_(healthcare_system)"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-hhs-ocr",
      "name": "U.S. Department of Health and Human Services Office for Civil Rights",
      "sameAs": "https://en.wikipedia.org/wiki/Office_for_Civil_Rights"
    },
    {
      "@type": "Person",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-ron-wyden",
      "name": "Ron Wyden",
      "sameAs": "https://en.wikipedia.org/wiki/Ron_Wyden"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-microsoft-entra-id",
      "name": "Microsoft Entra ID",
      "sameAs": "https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#mention-gmsa",
      "name": "Group Managed Service Accounts (gMSA)",
      "sameAs": "https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/group-managed-service-accounts/group-managed-service-accounts-overview"
    },
    {
      "@type": "NewsArticle",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-wyden-ftc-letter",
      "name": "Wyden Calls for FTC Investigation of Microsoft for Enabling Ascension Hospital Ransomware Hack with Insecure Software",
      "url": "https://www.wyden.senate.gov/news/press-releases/wyden-calls-for-ftc-investigation-of-microsoft-for-enabling-ascension-hospital-ransomware-hack-with-insecure-software",
      "author": "Office of Senator Ron Wyden",
      "datePublished": "2025-09-10",
      "publisher": "Office of Senator Ron Wyden"
    },
    {
      "@type": "NewsArticle",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-hipaa-journal-ascension",
      "name": "Ascension Ransomware Attack Affects 5.6 Million Patients",
      "url": "https://www.hipaajournal.com/ascension-cyberattack-2024/",
      "author": "Steve Alder",
      "datePublished": "2024-12-20",
      "publisher": "HIPAA Journal"
    },
    {
      "@type": "Report",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-cisa-aa23-349a",
      "name": "Cybersecurity Advisory AA23-349A: #StopRansomware — CISA and Partners Release Advisory on RVA Conducted at a Healthcare and Public Health Sector Organization",
      "url": "https://www.cisa.gov/news-events/cybersecurity-advisories/aa23-349a",
      "author": "Cybersecurity and Infrastructure Security Agency (CISA)",
      "datePublished": "2023-12-15",
      "publisher": "Cybersecurity and Infrastructure Security Agency (CISA)"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-nccgroup-defending-your-directory",
      "name": "Defending Your Directory: An Expert Guide to Combating Kerberoasting in Active Directory",
      "url": "https://www.nccgroup.com/research/defending-your-directory-an-expert-guide-to-combating-kerberoasting-in-active-directory/",
      "author": "Rafael Alfaro March and Rodrigo Munoz",
      "publisher": "NCC Group"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-mitre-attck-t1558-003",
      "name": "Steal or Forge Kerberos Tickets: Kerberoasting (T1558.003)",
      "url": "https://attack.mitre.org/techniques/T1558/003/",
      "author": "MITRE Corporation",
      "publisher": "MITRE Corporation"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-semperis-golden-ticket",
      "name": "How to Defend Against Golden Ticket Attacks: AD Security 101",
      "url": "https://www.semperis.com/blog/how-to-defend-against-golden-ticket-attacks/",
      "author": "Semperis",
      "publisher": "Semperis"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-microsoft-learn-credential-guard",
      "name": "Credential Guard overview",
      "url": "https://learn.microsoft.com/en-us/windows/security/identity-protection/credential-guard/",
      "author": "Microsoft",
      "datePublished": "2026-04-27",
      "publisher": "Microsoft"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-trimarc-unconstrained-delegation",
      "name": "Active Directory Security Risk #101: Kerberos Unconstrained Delegation (or, How Compromise of a Single Server Can Lead to Complete AD Domain Compromise)",
      "url": "https://www.trimarcsecurity.com/hub-post/active-directory-security-risk-101-kerberos-unconstrained-delegation-or-how-compromise-of-a-singl-1",
      "author": "Sean Metcalf",
      "datePublished": "2024-07-01",
      "publisher": "Trimarc Security"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-microsoft-learn-rc4-detect-remediate",
      "name": "Detect and Remediate RC4 Usage in Kerberos",
      "url": "https://learn.microsoft.com/en-us/windows-server/security/kerberos/detect-remediate-rc4-kerberos",
      "author": "Microsoft",
      "datePublished": "2026-04-13",
      "publisher": "Microsoft"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/kerberos-attack-mitigation-healthcare-organizations#citation-microsoft-techcommunity-rc4-retirement",
      "name": "Kerberos and the End of RC4: Protocol Hardening and Preparing for CVE-2026-20833",
      "url": "https://techcommunity.microsoft.com/discussions/microsoft-security/kerberos-and-the-end-of-rc4-protocol-hardening-and-preparing-for-cve%E2%80%912026%E2%80%9120833/4502262",
      "author": "Microsoft",
      "datePublished": "2026-01",
      "publisher": "Microsoft"
    }
  ]
}
```

<!--
EDIT SUMMARY
- Banned phrases removed: 0 machine-list hits (standards/banned-phrases.txt clean; scripts/seo_audit.py "No banned phrases found"). Judgment-call sweep also clean: 0 em-dashes, 0 exclamation marks, 0 hits across leverage/utilize/navigate/robust/seamless/cutting-edge/transformative/unlock/supercharge/paradigm/mission-critical/best practices/holistic and the hedging set (perhaps/arguably/somewhat/to be fair). Structural slop cut this pass: (1) dramatic echo repetition "sequence, and sequence is what carried" in the thesis pivot, rewritten; (2) one-line antithetical closer "A kerberoastable service account is dangerous in proportion to what its delegation rights and group memberships let it reach, not to the privilege label printed on it." deleted from the Kerberoasting section as a duplicate of Key Takeaway 4 (this was outline Sound Bite 1; the takeaway bullet preserves it verbatim as the speakable surface, so the body instance was the redundant one); (3) verdict-punch fragment "Its coverage stops short of Tier 0." folded into the sentence that gives the mechanism; (4) "Remediation behaves unlike any other credential compromise as a result." cut, since the H2 already carries it; (5) repeated punchlines reduced from 3x to 2x on three claims: the July 2026 RC4 enforcement date, the HIPAA §164.312 exception, and "rotating the password does nothing to a stolen ticket."
- Structural changes: 10 body H2s, all declarative; questions confined to the 6 FAQ H3s (D33). One H1, no skipped heading levels. Key Takeaways (5 bullets) sits directly under the lede as the speakable target. Answer-first sentence verified under every H2. Comparison table (pass-the-hash vs pass-the-ticket, 4 dimensions) retained as the article's list/table structure. Two hospital vignettes de-parallelized ("In a radiology reading room, ..." / "In a hospital estate, ..." both opened with the same construction); the delegation vignette keeps its full shape, the pass-the-ticket one is compressed to a single sentence.
- SEO checklist: 15/16 pass. Title 57 chars, meta description 154 chars, slug 51 chars, one H1, primary keyword at words ~93-95 of the body (placed in "The standard advice on Kerberos attack mitigation is correct.", not forced into the lede, per D32), 3 primary-keyword uses in 1,999 words. 10 external authoritative links (senate.gov, cisa.gov, attack.mitre.org, 3x learn.microsoft.com/techcommunity.microsoft.com, nccgroup.com, trimarcsecurity.com, semperis.com, hipaajournal.com), all HTTP 200 on 2026-09-21. 3 internal links (2x /product/overview, 1x /about/company), all HTTP 200. Canonical URL, hero image with descriptive alt, and all frontmatter fields populated. Exception: json-ld fence absent, which is Phase 5's job.
- GEO checklist: 7/8 pass. Direct factual answer in the first sentence under every H2. 5+ quotable standalone sentences. Definition-style bolded sentences for Kerberoasting, golden ticket attack, pass-the-hash, pass-the-ticket, all three delegation forms, gMSA and Credential Guard. 20+ named entities. publish_date and modified_date populated, year stamps on every time-bound claim. Original insight (four techniques as one sequenced attack path through a hybrid AD/Entra ID hospital estate) intact and sharpened, not softened. Exception: author_bio_url is empty with a documented (placeholder) marker, because config/company.yaml author.bio_url is empty and no Saporo bio page exists to link.
- AIO checklist: 6/6 pass. FAQ H3s carry the question-shaped surface; one comparison table; FAQ answers are clean 3-sentence Q/A with no preamble; Key Takeaways is the speakable target; every external link goes to a domain AI engines already cite for this topic.
- Fact-check: all 12 body citations re-fetched and verified against live source text on 2026-09-21. GATE FIX: the previous draft cited https://learn.microsoft.com/.../ad-forest-recovery-reset-the-krbtgt-password for the claim that KRBTGT resets must be 10 hours apart. That URL is not in research-notes.md's verified source list (D34), so the citation and the 10-hour timing claim were removed rather than re-pointed at another URL. The Semperis source (verified source #10) was re-fetched to check whether it supports the timing; it does not, stating only that you should change the password "twice in a row to address Kerberos' ability to recall the last two passwords." The double-reset claim therefore stands on Semperis alone in all three places it appeared (Key Takeaway 5, the golden ticket section, FAQ 1), the 10-hour interval is gone from all three, and the paragraph it anchored was rewritten to cover prevention (the KRBTGT hash comes only off a domain controller or out of directory replication rights) instead of remediation timing. Re-verified verbatim this pass: Wyden's RC4/1980s quote and the contractor/Bing/malicious-link initial access; HIPAA Journal's 5,599,699 figure and the December 19, 2024 OCR portal update; CISA AA23-349A's GetUserSPNs quote, December 15 2023 publication and January 2023 assessment; NCC Group's Event ID 4769 and 0x17 RC4-HMAC quotes and both author names; MITRE T1558.003's M1041/M1027/M1026 and the "ideally 25+ characters" wording; Metcalf's two unconstrained-delegation quotes; Microsoft's January/April/July 2026 RC4 phases and the "strongly discouraged" quote; Credential Guard's VBS quote, the SAM/AD-database coverage limit, and the VBS + Secure Boot requirements with Windows 11 22H2 / Windows Server 2025 default enablement. Nothing escalated to Phase 1; no claim needed [NEEDS RESEARCH].
- Internal links (D35): unchanged from the prior pass and re-confirmed. The pillar and two sibling spokes named in outline.md still return HTTP 404 on saporo.io as of 2026-09-21, so they stay as HTML-comment placeholders rather than hyperlinks.
- Word count: trimmed 2,209 to 1,999 to bring the article inside the spoke brief's 1,400-2,000 band, which overrides the SERP target under D31 (the prior pass sat at 2,209, above the brief ceiling). Cuts came from triple-stated claims, duplicated body/FAQ mechanics, and the Saporo product paragraph; no source, definition, entity or section was removed to make the number.
- Final word count: 1999 (prose; excludes frontmatter, HTML comments and link URLs)
- Final reading time: 9 min
-->
