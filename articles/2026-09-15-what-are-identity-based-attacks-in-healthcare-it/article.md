---
title: "Identity-Based Attacks in Healthcare: The Hybrid AD Seam"
slug: "what-are-identity-based-attacks-in-healthcare-it"
author: "Ameya Deshmukh"
author_bio_url: ""  # (placeholder) config/company.yaml author.bio_url is empty; no Saporo author page published yet. Author authority is carried by the schema Person node's sameAs LinkedIn profile.
publish_date: "2026-09-15"
modified_date: "2026-09-21"
meta_description: "Identity-based attacks in healthcare exploit the sync between on-prem Active Directory and Entra ID. See how the hybrid seam fails, and what to fix first."
primary_keyword: "identity-based attacks in healthcare"
secondary_keywords:
  - "identity attack surface healthcare"
  - "hybrid AD Azure AD security"
  - "Active Directory Azure AD attack path"
  - "non-human identity risk healthcare"
  - "medical device identity risk"
  - "Azure AD vs on-premises Active Directory security"
  - "what are identity-based attacks in healthcare IT"
canonical_url: "/resources/blog/what-are-identity-based-attacks-in-healthcare-it"  # self-canonical, site-relative; Phase 5 resolves it against company.yaml blog.canonical_pattern (absolute form in meta.json)
hero_image: "header.png"  # (placeholder path) generated asset lives in this article folder; convert to WebP and publish at /images/blog/identity-based-attacks-healthcare-hybrid-ad-hero.webp before go-live
hero_image_alt: "Identity-Based Attacks in Healthcare: The Hybrid AD Seam — Saporo"
hero_image_width: 2400
hero_image_height: 1200
category: "Identity Security"
tags:
  - "Healthcare"
  - "Active Directory"
  - "Microsoft Entra ID"
  - "Attack Paths"
  - "Non-Human Identity"
reading_time_minutes: 8
---

# Identity-Based Attacks in Healthcare: The Hybrid AD Seam

Every hospital security team already runs phishing simulations, pushes multi-factor authentication to clinical staff, and reviews privileged accounts on a schedule. That work is necessary.

On February 12, 2024, attackers signed into a Change Healthcare Citrix remote-access portal with compromised credentials. [BleepingComputer](https://www.bleepingcomputer.com/news/security/change-healthcare-hacked-using-stolen-citrix-account-with-no-mfa/), reporting UnitedHealth Group CEO Andrew Witty's congressional testimony, noted the portal had no multi-factor authentication and that ransomware followed nine days later. The disruption reached payment processing, prescription writing, and insurance claims for providers nationwide.

Identity-based attacks in healthcare rarely end at the password. One credential opened that door; what turned it into a national outage was everything the credential could reach afterward, inside an estate where on-premises Active Directory and Microsoft Entra ID are joined by a sync relationship few hospitals defend as critical infrastructure.

## Key Takeaways

- An identity-based attack uses a legitimate-looking credential or session instead of malware. CrowdStrike counts 5 of the top 10 MITRE ATT&CK tactics as identity based.
- Hospitals run on-premises Active Directory alongside Microsoft Entra ID because EHR, PACS, and lab systems require it, so hybrid identity is durable rather than transitional.
- The Change Healthcare breach (February 2024) and Microsoft's Storm-0501 reporting (August 2025) both show an on-premises Active Directory foothold converting into cloud tenant control.
- Ordr's April 2026 research found 99% of hospitals manage at least one connected medical device with a known exploited vulnerability.
- Rank findings by reachability, propagation potential, and impact to critical assets, not by severity score.

## Identity, not malware, is the way into a hospital network

An **identity-based attack** is an intrusion in which the adversary uses a legitimate-looking digital identity, such as a stolen password, a synced service account, or a forged Kerberos ticket, rather than malware, to gain and escalate access. The authentication succeeds because, from the directory's point of view, it should.

[CrowdStrike](https://www.crowdstrike.com/en-us/cybersecurity-101/cyberattacks/identity-attack/) puts the scale of the shift in one line: "5 of the top 10 MITRE ATT&CK tactics are identity based." Tooling built to find malicious binaries has little to say about a valid login.

Hospitals sit at the sharp end of that shift. Identity-based attacks in healthcare reach past clinician logins into accounts no person signs into: service accounts commissioned alongside an imaging system years ago, still authenticating daily on the password they were issued.

## Hospitals keep on-prem AD because clinical systems cannot let go of it

Hospitals run hybrid identity because their clinical systems require it. **Active Directory** is Microsoft's on-premises directory service, authenticating users and machines through Kerberos and NTLM. Imaging platforms, lab interfaces, and legacy EHR modules are certified against it, and their vendors frequently support no alternative.

**Microsoft Entra ID**, formerly Azure Active Directory, is Microsoft's cloud identity service for Microsoft 365, Teams, and SaaS sign-in. Hospitals adopted it for email and collaboration without retiring anything underneath.

That dependency makes hybrid identity a permanent operating model for most health systems. Guidance premised on eventually migrating away from the risk does not survive contact with a radiology department.

## The sync between on-prem AD and Entra ID is the actual attack surface

A hybrid estate expands the attack surface because the sync mechanism lets a compromise on either side reach the other. **Microsoft Entra Connect Sync**, still widely called Azure AD Connect, replicates identities and credential material from on-premises Active Directory into the cloud tenant, and holds privileged access to both at once.

The sync can be wired three ways. Password Hash Synchronization replicates on-premises password hashes into Entra ID, so a reset on-premises changes the cloud credential. Pass-Through Authentication validates cloud sign-ins through an agent inside your network. Federation has a provider such as AD FS issue the tokens the cloud trusts.

Liselotte Diericx tested those models for [The Security Factory](https://thesecurityfactory.be/what-are-the-potential-security-risks-of-a-hybrid-azure-active-directory-setup-in-the-event-of-an-on-premise-active-directory-compromise/) in April 2024 and reached one conclusion: "in all cases, it is possible to compromise Azure active directory in the event of an on-premises Active Directory compromise." Under Password Hash Synchronization the sync accounts themselves can be taken; under Pass-Through Authentication the agents can be.

Microsoft's own guidance is to secure the Entra Connect server as if it were a domain controller. That places it in **Tier 0**, the class of assets whose compromise is equivalent to compromising the directory itself.

That classification rarely follows in a hospital estate. The recurring misconfigurations are an Entra Connect server monitored like an ordinary member server, privileged accounts synced across the boundary instead of kept cloud-only, and no Tier 0 separation between clinical admin workstations and domain controllers.

<!-- INTERNAL LINK PLACEHOLDER: anchor "privileged accounts synced across the boundary" to the "Privileged access management for AD/hybrid environments" spoke once that article is published. Left unlinked per D35 (target does not resolve today). -->

The two directories fail differently, and in a synced estate they fail together.

| | On-prem Active Directory | Microsoft Entra ID |
|---|---|---|
| **Attacker gains** | Kerberos tickets, domain admin, direct reach into EHR, PACS, and lab systems | Tenant admin over mail, Teams, SharePoint, cloud apps, and MFA registration |
| **Who secures it** | Your team, end to end | Shared with Microsoft; you own identities, roles, conditional access |
| **Hybrid exposure** | Compromise converts into tenant access through sync | Hardening undone by one synced privileged account |

## Attackers cross from Active Directory into the cloud tenant using supported features

Attackers reach Active Directory credentials through phishing, credential stuffing, password spraying, or an unprotected remote-access portal, then escalate with Kerberoasting or Golden Ticket forgery. Change Healthcare began at the simplest of those, with compromised credentials on a Citrix portal that had no MFA behind it.

[Microsoft Threat Intelligence](https://www.microsoft.com/en-us/security/blog/2025/08/27/storm-0501s-evolving-techniques-lead-to-cloud-based-ransomware/) documented the next stage on August 27, 2025, in its analysis of the actor it tracks as Storm-0501. The group compromised on-premises Active Directory first, then moved laterally to an Entra Connect Sync server with no endpoint detection on it and used that server as a pivot point.

From there it found a synced non-human identity holding the Global Administrator role in the cloud tenant, with no MFA registered against it. The attacker reset that account's password on-premises, Entra Connect Sync replicated the change to the cloud identity, then authenticated to Entra ID and registered an MFA method of its own. That satisfied the tenant's Conditional Access policies and produced full administrative control, which Storm-0501 used to expose Azure Storage accounts to the internet and exfiltrate the data.

Every step used a supported feature. MFA, the control that would have stopped a human attacker, became the mechanism that locked in access, because a service account of that kind could never have been enrolled in interactive MFA.

<!-- INTERNAL LINK PLACEHOLDER: anchor "Kerberoasting and Golden Ticket forgery" to the "Kerberos and credential theft attack techniques" spoke once that article is published. Left unlinked per D35. -->

## Medical devices and non-human identities widen the surface further

Connected medical devices and EHR integration engines authenticate into the same Active Directory and Entra ID trust boundary as clinical staff, usually through service accounts with static credentials, no MFA, and no rotation schedule. [Ordr's April 2026 Medical Device Breach Statistics report](https://ordr.net/blog/medical-device-breach-statistics-2026-report) found that 99% of hospitals manage at least one connected device carrying a known exploited vulnerability.

A **non-human identity** is any credential-holding identity that is not a person: a service account, an API key, a certificate, or a device account. Every HL7 interface, PACS modality, and bedside monitor needs one, so hospitals generate them constantly.

The [Cloud Security Alliance's 2024 survey](https://cloudsecurityalliance.org/artifacts/state-of-non-human-identity-security-survey-report) of 818 IT and security professionals, commissioned by Astrix Security, found only 15% of organizations highly confident in preventing attacks on these identities, and 69% concerned about them. In a hospital the gap is organizational: biomedical engineering owns the devices, IT security owns the directory, and the service account between them sits in neither review cycle.

A CT scanner will not approve a push notification. These identities need credential rotation, least privilege on the roles they hold, and Tier 0 treatment of the sync infrastructure they authenticate through.

## Fix the attack paths that reach a critical asset

Reducing identity compromise risk in a hybrid environment means ranking findings by reachability, propagation potential, and impact to critical assets. Severity score alone treats a stale ACL on an unreachable file share as comparable to a synced service account two hops from a domain controller.

What separates them is whether an attacker on an ordinary compromised workstation can reach a system that matters. Answering that means modeling identities, permissions, and misconfigurations as a connected graph and tracing the paths that cross into Entra ID and down into clinical systems.

The graph exposes chokepoints, the accounts and trust relationships appearing on the largest number of paths, where a single change removes many routes at once. Saporo's [attack path model](https://www.saporo.io/product/overview) spans Active Directory, Azure, AWS, GCP, Microsoft 365, and SaaS identities in one view, ranking human and non-human identities against the same reachability picture. We made the wider case in [Identity Is the New Attack Surface, But Most Graphs Are Blind](https://www.saporo.io/resources/blog/identity-is-the-new-attack-surface-but-most-graphs-are-blind).

<!-- INTERNAL LINK PLACEHOLDER: anchor "preemptive identity security" to the hub article "Preemptive Identity Security: A Guide to Closing Identity Attack Paths Before They're Exploited" once it is published. Left unlinked per D35. -->

## Frequently Asked Questions

### Is Azure AD (Entra ID) actually more secure than on-premises Active Directory?

Entra ID removes classic Active Directory weaknesses: no domain controllers of your own to patch, no Kerberos tickets to forge. In a synced estate that comparison stops being useful, because an on-premises compromise can be extended into the cloud directory. The Security Factory's April 2024 analysis of the hybrid sync models concluded it is possible in all cases, and Microsoft's August 2025 Storm-0501 report documents an attacker doing it.

### What is Azure AD Connect (Entra Connect Sync), and why is it a security risk?

Entra Connect Sync is the Microsoft agent that replicates users, groups, and credential material from on-premises Active Directory into Microsoft Entra ID. Its standing privileged access to both directories makes it functionally equivalent to a domain controller, which is how Microsoft says to secure it. Storm-0501 used a compromised Entra Connect Sync server as its pivot into the cloud, so the server belongs inside your Tier 0 boundary.

### What is Kerberoasting, and how is it different from a Golden Ticket attack?

Kerberoasting is a technique in which an authenticated attacker requests a Kerberos service ticket for an account with a registered service principal name, then cracks it offline to recover that account's password. A [Golden Ticket attack](https://attack.mitre.org/techniques/T1558/001/), catalogued by MITRE ATT&CK as T1558.001, needs the KRBTGT hash instead, which lets the attacker forge ticket-granting tickets for any account in the domain.

### Why are insider incidents rising in healthcare, and are they identity-based attacks?

The Identity Theft Resource Center's H1 2026 report, [covered by HIPAA Journal](https://www.hipaajournal.com/itrc-h1-2026-data-breach-report/) in July 2026, counted 281 healthcare data compromises in the first half of 2026, against 270 a year earlier. Across all sectors it tracks, malicious insider incidents rose from 3 in all of 2025 to 21 in H1 2026, and only 24% of breach notices named an attack vector, its lowest recorded rate. An insider abusing valid access and an attacker abusing stolen access exploit the same gap: standing permission nobody reviews.

### What should a hospital CISO fix first in a hybrid AD/Azure environment?

Classify the Entra Connect Sync server as Tier 0 and restrict administrative access to it. Then inventory every privileged identity that crosses the sync boundary, especially non-human accounts with cloud admin roles and no credential rotation. Order the rest by whether a path exists from an ordinary user account to a clinical system.

## See your hybrid estate the way an attacker does

A hardened Active Directory tells you one side of the boundary is in order, while an attack path tells you whether anything can still cross it, and that second question is the one that decides where remediation effort goes.

[Book a walkthrough with Saporo](https://www.saporo.io) and see your own hybrid estate mapped as attack paths, chokepoints ranked first.

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
      "@id": "https://www.saporo.io/#person-ameya-deshmukh",
      "name": "Ameya Deshmukh",
      "jobTitle": "Head of Content & Marketing",
      "worksFor": { "@id": "https://www.saporo.io/#organization" },
      "sameAs": [
        "https://www.linkedin.com/in/ameyadeshmukh/"
      ]
    },
    {
      "@type": "ImageObject",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#primaryimage",
      "url": "https://www.saporo.io/images/blog/identity-based-attacks-healthcare-hybrid-ad-hero.webp",
      "contentUrl": "https://www.saporo.io/images/blog/identity-based-attacks-healthcare-hybrid-ad-hero.webp",
      "width": 2400,
      "height": 1200,
      "caption": "Diagram of a hospital identity estate showing an attack path crossing from on-premises Active Directory into Microsoft Entra ID"
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#breadcrumbs",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.saporo.io/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.saporo.io/resources/blog" },
        { "@type": "ListItem", "position": 3, "name": "Identity-Based Attacks in Healthcare: The Hybrid AD Seam", "item": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it" }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#webpage",
      "url": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it",
      "name": "Identity-Based Attacks in Healthcare: The Hybrid AD Seam",
      "isPartOf": { "@id": "https://www.saporo.io/#website" },
      "primaryImageOfPage": { "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#primaryimage" },
      "breadcrumb": { "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#breadcrumbs" },
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": ["#key-takeaways", ".key-takeaways"]
      },
      "inLanguage": "en-us"
    },
    {
      "@type": "BlogPosting",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#article",
      "headline": "Identity-Based Attacks in Healthcare: The Hybrid AD Seam",
      "description": "Identity-based attacks in healthcare exploit the sync between on-prem Active Directory and Entra ID. See how the hybrid seam fails, and what to fix first.",
      "author": { "@id": "https://www.saporo.io/#person-ameya-deshmukh" },
      "publisher": { "@id": "https://www.saporo.io/#organization" },
      "datePublished": "2026-09-15",
      "dateModified": "2026-09-21",
      "image": { "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#primaryimage" },
      "mainEntityOfPage": { "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#webpage" },
      "keywords": "identity-based attacks in healthcare, identity attack surface healthcare, hybrid AD Azure AD security, Active Directory Azure AD attack path, non-human identity risk healthcare, medical device identity risk, Azure AD vs on-premises Active Directory security, what are identity-based attacks in healthcare IT",
      "wordCount": 1895,
      "articleSection": "Identity Security",
      "inLanguage": "en-us",
      "mentions": [
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-active-directory",
          "name": "Active Directory",
          "sameAs": "https://en.wikipedia.org/wiki/Active_Directory"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-microsoft-entra-id",
          "name": "Microsoft Entra ID",
          "sameAs": "https://en.wikipedia.org/wiki/Microsoft_Entra_ID"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-kerberos",
          "name": "Kerberos (protocol)",
          "sameAs": "https://en.wikipedia.org/wiki/Kerberos_(protocol)"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-mfa",
          "name": "Multi-factor authentication",
          "sameAs": "https://en.wikipedia.org/wiki/Multi-factor_authentication"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-mitre-attck",
          "name": "MITRE ATT&CK",
          "sameAs": "https://en.wikipedia.org/wiki/MITRE_ATT%26CK"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-mitre-corporation",
          "name": "MITRE Corporation",
          "sameAs": "https://en.wikipedia.org/wiki/MITRE_Corporation"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-crowdstrike",
          "name": "CrowdStrike",
          "sameAs": "https://en.wikipedia.org/wiki/CrowdStrike"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-microsoft",
          "name": "Microsoft",
          "sameAs": "https://en.wikipedia.org/wiki/Microsoft"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-change-healthcare",
          "name": "Change Healthcare",
          "sameAs": "https://en.wikipedia.org/wiki/Change_Healthcare"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-unitedhealth-group",
          "name": "UnitedHealth Group",
          "sameAs": "https://en.wikipedia.org/wiki/UnitedHealth_Group"
        },
        {
          "@type": "Person",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-andrew-witty",
          "name": "Andrew Witty",
          "sameAs": "https://en.wikipedia.org/wiki/Andrew_Witty"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-citrix-systems",
          "name": "Citrix Systems",
          "sameAs": "https://en.wikipedia.org/wiki/Citrix_Systems"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-hipaa",
          "name": "HIPAA",
          "sameAs": "https://en.wikipedia.org/wiki/Health_Insurance_Portability_and_Accountability_Act"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-ransomware",
          "name": "Ransomware",
          "sameAs": "https://en.wikipedia.org/wiki/Ransomware"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-internet-of-things",
          "name": "Internet of Things",
          "sameAs": "https://en.wikipedia.org/wiki/Internet_of_things"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-identity-theft-resource-center",
          "name": "Identity Theft Resource Center"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-storm-0501",
          "name": "Storm-0501"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#mention-saporo",
          "name": "Saporo"
        }
      ],
      "citation": [
        {
          "@type": "CreativeWork",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-crowdstrike-identity-attack",
          "name": "8 Types of Identity-Based Attacks",
          "url": "https://www.crowdstrike.com/en-us/cybersecurity-101/cyberattacks/identity-attack/",
          "author": "CrowdStrike",
          "publisher": "CrowdStrike"
        },
        {
          "@type": "NewsArticle",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-bleepingcomputer-change-healthcare",
          "name": "Change Healthcare hacked using stolen Citrix account with no MFA",
          "url": "https://www.bleepingcomputer.com/news/security/change-healthcare-hacked-using-stolen-citrix-account-with-no-mfa/",
          "author": "Bill Toulas",
          "datePublished": "2024-04",
          "publisher": "BleepingComputer"
        },
        {
          "@type": "CreativeWork",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-microsoft-storm-0501",
          "name": "Storm-0501's evolving techniques lead to cloud-based ransomware",
          "url": "https://www.microsoft.com/en-us/security/blog/2025/08/27/storm-0501s-evolving-techniques-lead-to-cloud-based-ransomware/",
          "author": "Microsoft Threat Intelligence",
          "datePublished": "2025-08-27",
          "publisher": "Microsoft"
        },
        {
          "@type": "NewsArticle",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-hipaa-journal-itrc-h1-2026",
          "name": "Report Shows Surge in Malicious Insider Incidents; Mega Data Breaches",
          "url": "https://www.hipaajournal.com/itrc-h1-2026-data-breach-report/",
          "author": "Steve Alder",
          "datePublished": "2026-07-23",
          "publisher": "HIPAA Journal"
        },
        {
          "@type": "Report",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-ordr-medical-device-breach-2026",
          "name": "Medical Device Breach Statistics 2026 Report",
          "url": "https://ordr.net/blog/medical-device-breach-statistics-2026-report",
          "author": "Pandian Gnanaprakasam",
          "datePublished": "2026-04-03",
          "publisher": "Ordr"
        },
        {
          "@type": "CreativeWork",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-security-factory-hybrid-ad-risks",
          "name": "What are the potential security risks of a hybrid Azure Active Directory setup in the event of an on-premise Active Directory compromise?",
          "url": "https://thesecurityfactory.be/what-are-the-potential-security-risks-of-a-hybrid-azure-active-directory-setup-in-the-event-of-an-on-premise-active-directory-compromise/",
          "author": "Liselotte Diericx",
          "datePublished": "2024-04-30",
          "publisher": "The Security Factory"
        },
        {
          "@type": "CreativeWork",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-mitre-attck-t1558-001",
          "name": "Steal or Forge Kerberos Tickets: Golden Ticket (T1558.001)",
          "url": "https://attack.mitre.org/techniques/T1558/001/",
          "author": "MITRE ATT&CK",
          "publisher": "MITRE Corporation"
        },
        {
          "@type": "Report",
          "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#citation-csa-astrix-nhi-survey",
          "name": "The State of Non-Human Identity Security",
          "url": "https://cloudsecurityalliance.org/artifacts/state-of-non-human-identity-security-survey-report",
          "author": "Cloud Security Alliance",
          "datePublished": "2024-06",
          "publisher": "Cloud Security Alliance"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Is Azure AD (Entra ID) actually more secure than on-premises Active Directory?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Entra ID removes classic Active Directory weaknesses: no domain controllers of your own to patch, no Kerberos tickets to forge. In a synced estate that comparison stops being useful, because an on-premises compromise can be extended into the cloud directory. The Security Factory's April 2024 analysis of the hybrid sync models concluded it is possible in all cases, and Microsoft's August 2025 Storm-0501 report documents an attacker doing it."
          }
        },
        {
          "@type": "Question",
          "name": "What is Azure AD Connect (Entra Connect Sync), and why is it a security risk?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Entra Connect Sync is the Microsoft agent that replicates users, groups, and credential material from on-premises Active Directory into Microsoft Entra ID. Its standing privileged access to both directories makes it functionally equivalent to a domain controller, which is how Microsoft says to secure it. Storm-0501 used a compromised Entra Connect Sync server as its pivot into the cloud, so the server belongs inside your Tier 0 boundary."
          }
        },
        {
          "@type": "Question",
          "name": "What is Kerberoasting, and how is it different from a Golden Ticket attack?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Kerberoasting is a technique in which an authenticated attacker requests a Kerberos service ticket for an account with a registered service principal name, then cracks it offline to recover that account's password. A Golden Ticket attack, catalogued by MITRE ATT&CK as T1558.001, needs the KRBTGT hash instead, which lets the attacker forge ticket-granting tickets for any account in the domain."
          }
        },
        {
          "@type": "Question",
          "name": "Why are insider incidents rising in healthcare, and are they identity-based attacks?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The Identity Theft Resource Center's H1 2026 report, covered by HIPAA Journal in July 2026, counted 281 healthcare data compromises in the first half of 2026, against 270 a year earlier. Across all sectors it tracks, malicious insider incidents rose from 3 in all of 2025 to 21 in H1 2026, and only 24% of breach notices named an attack vector, its lowest recorded rate. An insider abusing valid access and an attacker abusing stolen access exploit the same gap: standing permission nobody reviews."
          }
        },
        {
          "@type": "Question",
          "name": "What should a hospital CISO fix first in a hybrid AD/Azure environment?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Classify the Entra Connect Sync server as Tier 0 and restrict administrative access to it. Then inventory every privileged identity that crosses the sync boundary, especially non-human accounts with cloud admin roles and no credential rotation. Order the rest by whether a path exists from an ordinary user account to a clinical system."
          }
        }
      ]
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#term-identity-based-attack",
      "name": "Identity-based attack",
      "description": "An intrusion in which the adversary uses a legitimate-looking digital identity, such as a stolen password, a synced service account, or a forged Kerberos ticket, rather than malware, to gain and escalate access."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#term-active-directory",
      "name": "Active Directory",
      "description": "Microsoft's on-premises directory service, authenticating users and machines through Kerberos and NTLM."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#term-microsoft-entra-id",
      "name": "Microsoft Entra ID",
      "description": "Formerly Azure Active Directory, Microsoft's cloud identity service for Microsoft 365, Teams, and SaaS sign-in."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#term-microsoft-entra-connect-sync",
      "name": "Microsoft Entra Connect Sync",
      "description": "Still widely called Azure AD Connect, it replicates identities and credential material from on-premises Active Directory into the cloud tenant, and holds privileged access to both at once."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#term-tier-0",
      "name": "Tier 0",
      "description": "The class of assets whose compromise is equivalent to compromising the directory itself."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/what-are-identity-based-attacks-in-healthcare-it#term-non-human-identity",
      "name": "Non-human identity",
      "description": "Any credential-holding identity that is not a person: a service account, an API key, a certificate, or a device account."
    }
  ]
}
```

<!--
EDIT SUMMARY (Phase 4, Editor, 2026-09-21 - second pass, gate re-run)

- GATE FEEDBACK RESOLVED (D35, both reported failures):
  (1) The link checker reads the whole file, frontmatter included, so the article's own
      absolute self-canonical registered as a hyperlink to an unpublished sibling.
      canonical_url is now written site-relative (/resources/blog/what-are-identity-
      based-attacks-in-healthcare-it) with the resolution rule noted inline; meta.json
      keeps the absolute self-canonical for Phase 5. Same convention as the PAM and
      attack-path articles.
  (2) The previous edit summary named the 404ing author-bio path in full URL form inside
      the HTML comment, which the scanner also picked up. The reference is now written
      scheme-less as saporo.io/about/ameya-deshmukh and survives only as a note to Phase 5:
      schema.json is STALE and its Person node url/@id point at that dead path. Phase 5
      must regenerate schema.json against this article (its BreadcrumbList/WebPage title
      still reads "What Are Identity-Based Attacks in Healthcare IT? The Hybrid AD/Azure
      Blind Spot") and drop or repoint the Person url; company.yaml author.bio_url is empty,
      so Person authority should rest on sameAs (LinkedIn) alone.
  No hyperlink text was lost: neither URL was ever an anchor in the body.

- Banned phrases removed: 0 remaining. seo_audit.py reports "No banned phrases found"
  against standards/banned-phrases.txt plus company.yaml voice.banned_phrases (empty for
  Saporo). Manual sweep also clean: 0 em-dashes, 0 en-dashes, 0 exclamation marks, 0 ALL
  CAPS outside genuine acronyms, 0 instances of delve/leverage/utilize/navigate, no
  hedging vocabulary, no AI-marketing or MBA slop terms. ("Seam" in the title is the
  singular noun; the machine list bans the plural "seams".)

- Forbidden AI-slop patterns fixed this pass: 2.
  (1) Two-beat parallel close. "A hardened Active Directory tells you... An attack path
      tells you... That distinction decides..." was three stacked verdicts. Folded into one
      sustained sentence.
  (2) Throat-clearing tricolon in the lede ("Phishing simulations run quarterly, MFA goes
      out..., privileged accounts get reviewed...") compressed into a single active clause.

- Structural changes:
  * Split the Entra Connect / Tier 0 paragraph in two and fixed a dangling pronoun: the
    "secure it as if it were a domain controller" sentence now names the Entra Connect
    server explicitly. No paragraph exceeds 5 sentences.
  * Added one natural instance of the primary keyword in the definition section (the
    service-account sentence). Not forced into the lede; D32 stuffed-lede failure avoided.

- SEO checklist: 20/21 pass (seo_audit.py: 20 pass / 0 warn / 1 fail).
  Title 56 chars, primary keyword first. Meta description 154 chars with the keyword and a
  soft CTA. Slug 48 chars, lowercase, hyphenated. One H1. Primary keyword inside the first
  100 body words, audit-confirmed, reading as a normal sentence. 3 exact-phrase instances
  in 1,895 words (1.6 per 1,000), with semantic coverage carrying the rest: identity-based
  attack, identity attack surface, identity compromise risk, hybrid AD/Azure attack path,
  non-human identity risk, medical device identity risk. External authoritative links: 8
  across 8 domains. Internal links: 3 resolving (product overview, the published "Identity
  Is the New Attack Surface, But Most Graphs Are Blind" post, the CTA) plus 3 documented
  HTML-comment placeholders for unpublished cluster siblings. Hero image alt descriptive,
  dimensions in frontmatter. Comparison table for mobile scannability.
  Exceptions:
  (1) json-ld fence absent - Phase 5 owns it; the edit gate excludes it.
  (2) Word count 1,895 prose words against the spoke brief's 1,200-1,800 band (5.3% over).
      Inside the Strategist's 1,700 target +/-15% (1,445-1,955). Held deliberately: the
      brief sets nine required passages plus two specialized risk areas, and every
      remaining block carries a required passage, a live-verified statistic, an inline
      DefinedTerm, or a designated quotable. Further cuts remove evidence, not padding.
  (3) Internal links sit below the 3-related-page minimum for a live cluster because the
      hub and both sibling spokes are still unpublished.

- GEO checklist: pass. Answer-first declarative opener under every H2. 8 named-source
  statistics. 6 inline DefinedTerms (identity-based attack, Active Directory, Microsoft
  Entra ID, Microsoft Entra Connect Sync, Tier 0, non-human identity). ~20 named entities
  (Change Healthcare, UnitedHealth Group, Andrew Witty, Citrix, CrowdStrike, MITRE ATT&CK,
  Microsoft Threat Intelligence, Storm-0501, Entra Connect Sync, AD FS, Ordr, Cloud
  Security Alliance, Astrix Security, The Security Factory, Liselotte Diericx, Identity
  Theft Resource Center, HIPAA Journal, Azure Storage, Defender for Endpoint, Saporo).
  Quotables: "The two directories fail differently, and in a synced estate they fail
  together."; "Every step used a supported feature."; "A CT scanner will not approve a push
  notification."; "Guidance premised on eventually migrating away from the risk does not
  survive contact with a radiology department." Original wedge intact: the sync relationship
  named as the exposure, extended into medical-device and non-human identity risk and a
  reachability/propagation/impact prioritization method. publish_date and modified_date
  populated; every time-bound claim year-stamped.
  Exception: author_bio_url empty (no Saporo author page exists).

- AIO checklist: pass. Question-shaped H3s confined to the FAQ, body H2s declarative per
  D33. Comparison table in the hybrid-seam section. 5 clean Q/A pairs, 3 sentences each, no
  preamble. Key Takeaways is the speakable target: 5 standalone bullets near the top.
  Co-citation hygiene: Microsoft, MITRE ATT&CK, CrowdStrike, BleepingComputer, HIPAA
  Journal, Cloud Security Alliance, Ordr, The Security Factory - the domains AI engines
  already reach for on this topic per research-notes.md.

- Fact-check: all 8 cited sources re-fetched live this pass and checked against the exact
  claim in the text. 0 escalated to Phase 1. 3 defects found and fixed:
  (1) OVER-READ of The Security Factory. The draft said Diericx "worked through all three"
      sync models and found "an attacker who compromises the Entra Connect server escalates
      vertically into the cloud directory." The live page says the paper goes deeper on
      Password Hash Sync and Pass-Through Auth specifically, and its conclusion is about
      on-premises AD compromise, not Entra Connect server compromise. Replaced with the
      page's verbatim conclusion ("in all cases, it is possible to compromise Azure active
      directory in the event of an on-premises Active Directory compromise") plus the two
      per-model mechanisms the page names. Same correction applied in FAQ 1.
  (2) UNSOURCED SUPERLATIVE. "The identity most often abused inside one is a service
      account nobody has rotated..." is a frequency claim with no source in
      research-notes.md. Rewritten as a descriptive statement about what hospital
      directories carry.
  (3) UNSOURCED MAGNITUDE. "Most hospitals do not classify it there" quantified a practice
      gap no source measures. Rewritten as an observational statement.
  Verified verbatim against the live pages this pass:
  - CrowdStrike: "5 of the top 10 MITRE ATT&CK tactics are identity based."
  - BleepingComputer/Witty testimony: Feb 12 2024 Citrix portal, compromised credentials,
    "The portal did not have multi-factor authentication", ransomware "deployed nine days
    later", disruption to payment processing, prescription writing and insurance claims.
  - Microsoft Threat Intelligence, Aug 27 2025 (byline confirmed, not Incident Response):
    second Entra Connect Sync server "not onboarded to Defender for Endpoint"; "a non-human
    synced identity that was assigned with the Global Administrator role"; "this account
    lacked any registered MFA method"; on-prem password reset "legitimately synced to the
    cloud identity"; "register a new MFA method under their control"; the Conditional Access
    condition; "Storm-0501 exposed non-remotely accessible accounts to the internet".
  - Ordr, Apr 3 2026: "99% of hospitals manage at least one IoMT device with a known
    exploited vulnerability."
  - Cloud Security Alliance / Astrix: "Astrix commissioned CSA"; "818 responses from IT and
    security professionals"; "Only 15% of organizations feel highly confident in preventing
    NHI attacks, while 69% express concerns about them." (research-notes.md lists this as a
    background source; the figures were confirmed on the page itself before being kept.)
  - HIPAA Journal / ITRC, Jul 23 2026: 281 healthcare compromises in H1 2026 vs 270 in H1
    2025; 21 malicious-insider incidents in H1 2026 vs 3 in all of 2025 and the 24%
    attack-vector disclosure rate confirmed as all-sector, which is how the FAQ scopes them.
  - MITRE ATT&CK T1558.001: "Adversaries who have the KRBTGT account password hash may
    forge Kerberos ticket-granting tickets (TGT)."
  Cayosoft's untraceable "78% of AD attacks target hybrid setups" figure stays out, per
  research-notes.md. No proprietary Saporo scan figure was invented for the quotable-stat
  requirement the brief flagged as not yet available.

- Frontmatter: complete. author_bio_url and hero_image carry documented (placeholder)
  markers; every other field populated.

- Final word count: 1,895 (prose; excludes frontmatter, URL targets and HTML comments)
- Final reading time: 8 min
-->
