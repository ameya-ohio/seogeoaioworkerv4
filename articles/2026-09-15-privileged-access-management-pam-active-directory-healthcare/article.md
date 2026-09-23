---
title: "Privileged Access Management in Healthcare: The Tier 0 Gap"
slug: "privileged-access-management-pam-active-directory-healthcare"
author: "Ameya Deshmukh"
author_bio_url: ""  # (placeholder) no Saporo author bio page published yet; company.yaml author.bio_url is empty
publish_date: "2026-09-15"
modified_date: "2026-09-16"
meta_description: "Privileged access management in healthcare protects the credentials you know about. Here is why Tier 0 in hybrid AD/Azure stays reachable, and how to close it."
primary_keyword: "privileged access management healthcare"
secondary_keywords:
  - "PAM for hospitals"
  - "tier 0 active directory healthcare"
  - "privileged access management Active Directory hybrid"
  - "admin account isolation Active Directory"
  - "zero trust identity architecture hybrid AD Azure"
  - "cost of identity breach healthcare"
canonical_url: "/resources/blog/privileged-access-management-pam-active-directory-healthcare"  # self-canonical, site-relative; Phase 5 resolves it against company.yaml blog.canonical_pattern (absolute form in meta.json)
hero_image: "header.png"
hero_image_width: 2400
hero_image_height: 1200
hero_image_alt: "Article header card reading 'Privileged Access Management in Healthcare: The Tier 0 Gap' beneath an Identity Security label, on a Saporo-branded background."
category: "Identity Security"
tags:
  - "Privileged Access Management"
  - "Active Directory"
  - "Healthcare"
  - "Tier 0"
  - "Hybrid Identity"
  - "Zero Trust"
reading_time_minutes: 9
---

# Privileged Access Management in Healthcare: The Tier 0 Gap

On February 12, 2024, someone signed into a Change Healthcare Citrix portal with a stolen credential. The portal had no multi-factor authentication. That was the entire opening move, as UnitedHealth Group CEO Andrew Witty described it in written testimony to the House Energy and Commerce Committee on May 1, 2024.

That attack is the canonical argument for privileged access management. Healthcare security teams are finally funding it, and the standard controls would have stopped this one: vault the credential, enforce MFA on every remote-access path, rotate on a schedule, record the session. This work is necessary, and it is not the failure mode this article is about.

The incidents worth studying are the ones where the PAM program was deployed, the audit passed, and an attacker reached the domain controllers anyway. Vaulting a credential controls where it is stored, not what it can reach.

## Key Takeaways

- Privileged access management controls who holds a privileged credential. Identity exposure management maps what that credential can actually reach.
- Tier 0 in a hybrid hospital environment includes domain controllers, ADFS, Entra Connect, certificate authorities, and backup infrastructure, not only accounts labeled "admin".
- A PAM session host placed below the tier it manages becomes a bridge into Tier 0, a pattern Microsoft documented in April 2026.
- Standing privileged access is the path most PAM programs never surface, because it accrues to accounts nobody ever classified as privileged. Netwrix found in 2026 that 76% of organizations do not fully govern or monitor non-human identities.
- Healthcare data breaches averaged $7.42 million in 2025 and have been the costliest of any industry for 14 consecutive years, per HIPAA Journal on IBM research.

## PAM and identity exposure management answer different questions

**Privileged access management** is the discipline of controlling, vaulting, monitoring, and time-bounding the accounts that carry elevated rights. Identity exposure management asks a different question. Given every permission, group nesting, and trust relationship in the environment right now, what can each identity actually reach?

The first question has a static answer a policy can enforce. The second changes every time someone adds a group membership, stands up a service account, or grants an application consent in Microsoft Entra ID.

A vault enforces where a credential lives. Reachability analysis shows whether that credential can be retrieved along a path nobody modeled, which is what [Saporo's platform](https://www.saporo.io/product/overview) maps continuously.

## Tier 0 in a hospital is larger than the domain controllers

**Tier 0** is the set of assets carrying direct or indirect administrative control over identity infrastructure. Compromise one and an attacker effectively owns the directory. [Microsoft's PAM environment tier model](https://learn.microsoft.com/en-us/microsoft-identity-manager/pam/tier-model-for-partitioning-administrative-privileges), updated in March 2026, defines it for on-premises Active Directory. The newer [Enterprise Access Model](https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-access-model), updated in May 2026, describes Tier 0 expanding to become the control plane across on-premises and cloud.

That set is larger than most hospital inventories admit. Alongside the domain controllers sit ADFS servers, Entra Connect sync servers, the internal PKI, backup systems holding domain controller images, and management servers that can push code to any of them.

A certificate authority qualifies because an attacker holding it can mint an authentication certificate for a domain admin. A backup server qualifies because a domain controller backup contains the NTDS.dit database and every credential hash in the forest. Neither appears in a group-membership inventory.

The [joint advisory on detecting and mitigating Active Directory compromises](https://www.cisa.gov/resources-tools/resources/detecting-and-mitigating-active-directory-compromises), published by Australia's ACSC with CISA and the NSA and revised in September 2026, catalogs the 17 most common AD compromise techniques. Most are ways of reaching this set indirectly.

## A compliant PAM deployment can still leave Tier 0 open

PAM fails architecturally when the PAM infrastructure sits below the tier it administers. [Microsoft's Defender Experts team](https://techcommunity.microsoft.com/blog/microsoft-defender-experts/when-the-shield-becomes-the-sword-how-misconfigured-pam-bridges-the-tiering-mode/4509392) states the rule that placement breaks: "The security assurance of the target is only as good as the security assurance of the intermediary." A PAM server that brokers sessions into a domain controller is an intermediary to Tier 0, so it holds Tier 0's value while carrying whatever defenses its own tier gets.

Microsoft Defender Experts published the worked example in April 2026, under the title "When the shield becomes the sword." A threat actor compromises a Tier 2 workstation through phishing, then uses a lower-tier misconfiguration to reach a Tier 1 administrator with full control over the PAM session host. Because that host sits inside the Tier 1 boundary, its operating system belongs to the attacker, who then waits for a Tier 0 admin to open a session and extracts the credential material the operating system processes for it. Microsoft's Detection and Response Team reports one engagement running from a compromised helpdesk workstation to full domain compromise in under four hours.

Microsoft's summary is blunt: "A PAM server in the wrong tier isn't a hardened barrier; it's a trusted bridge with a gold-plated sign." Nothing in that chain involves a cracked password or an unvaulted secret. The vault, the rotation schedule, and the session recorder all worked. What failed was placement, which is the difference between [measuring compliance and measuring exploitability](https://www.saporo.io/resources/blog/compliance-is-a-starting-point-not-a-measure-of-exploitability).

## Standing privilege is the attack path attackers actually use

**Standing privileged access** is any permission an identity holds continuously, whether or not it is in use or the account is labeled privileged. The dangerous one is rarely the account with "admin" in its name; it is the account three group memberships away from one.

Finding it is a graph problem rather than a title problem. A group nesting chain, control delegation set on an OU by an administrator who has since left, and an Entra ID role assignment granting password reset over a synced admin are each defensible alone, and the chain they form is not. An inventory sorted by privilege level rates all three low risk.

Machines make it worse. A **non-human identity** is any account that authenticates without a person behind it: service accounts, medical-device machine accounts, API keys, EHR integration credentials. These cannot answer an MFA prompt or absorb an unannounced rotation without breaking a clinical workflow, so they accumulate permanent exemptions. The [Netwrix 2026 Data and Identity Security Report](https://netwrix.com/en/resources/news/netwrix-2026-data-and-identity-security-report-ai-adoption-outpacing-ai-readiness-driving-a-4x-breach-gap/), drawn from 2,317 practitioners across 1,889 organizations, found that 76% of organizations do not fully govern or monitor non-human identities.

Saporo built its graph for this, connecting identities, permissions, and misconfigurations across AD, Entra ID, AWS, GCP, M365, and SaaS into the paths that reach a critical asset, ranked by reachability rather than nominal privilege. Across deployments that has meant 5.9 million attack paths identified and remediated and a 64% reduction in critical misconfigurations. Most identity graphs [stay blind to those paths](https://www.saporo.io/resources/blog/identity-is-the-new-attack-surface-but-most-graphs-are-blind).

## Admin account isolation still starts with the on-prem tier model

Admin account isolation means a Tier 0 credential is never used to sign in to a Tier 1 or Tier 2 asset, including for a five-minute troubleshooting session. Microsoft's PAM environment tier model enforces this with logon restrictions: deny interactive, batch, service, and remote-desktop logon rights for Tier 0 accounts on every lower-tier system, applied by GPO and audited continuously.

The mechanism matters. When a domain admin signs in to a clinical workstation, their credential material lands in that machine's memory, where an attacker already holding local admin reads it out and gains a valid Tier 0 ticket. No cracking is required; the credential was handed to them.

Isolation costs real money. Every administrator needs a separate account per tier, and Tier 0 accounts need **privileged access workstations**, hardened devices used for administrative work and nothing else, to sign in from. Most health systems have bought the PAM tool and skipped the workstations.

## Identity governance and passwordless MFA close the human half of the gap

Access reviews, least-privilege enforcement, and time-bound elevation handle what the vault does not touch: how many people hold privilege at all, and for how long. Phishing-resistant passwordless MFA (FIDO2 keys, certificate-based authentication, Windows Hello for Business) closes the credential-theft path into those accounts. Change Healthcare is the counter-example, where a stolen credential worked on an internet-facing portal because no second factor stood in the way, and the breach exposed the data of roughly [100 million people](https://www.healthcaredive.com/news/change-healthcare-data-breach-affects-100-million/723493/).

This is where a healthcare PAM program should start, and none of it reaches a service account with delegation rights over a domain controller, because no person sits in that authentication loop to prompt.

## Zero trust for hybrid identity means verifying the path, not the login alone

A **zero trust identity architecture** for hybrid AD and Azure means no implicit trust between on-premises tiers and cloud administrative roles, and every privileged request is evaluated against current reachability rather than a role assignment made months ago.

Microsoft's Enterprise Access Model exists because the legacy tier model was scoped to a single on-premises forest, while hospitals run on-premises AD for EHR and medical-device authentication, Entra ID for cloud apps, and a sync server bridging them.

That sync server is where most zero trust programs break. Entra Connect holds synchronization credentials with elevated rights on both sides, and conditional access lets the sync path through because it is infrastructure rather than a user session. Verifying the login is not verifying the path, and the path is what an attacker traverses.

## Healthcare pays for an identity breach in months as well as dollars

A healthcare data breach cost an average of $7.42 million in 2025 and took 279 days to identify and contain, five weeks longer than the global average lifecycle. Healthcare has been the costliest breached industry for 14 consecutive years, according to [HIPAA Journal's reporting on IBM's annual breach-cost research](https://www.hipaajournal.com/average-cost-of-a-healthcare-data-breach-2025/).

Nine months of attacker access is long enough for one ungoverned service account to become the entire incident. The dollar figure is what the finance committee asks about; the timeline decides whether the answer is $7 million or weeks of ambulance diversion. Cutting the number of reachable paths to Tier 0 is what shortens it.

## Frequently Asked Questions

### What counts as a Tier 0 asset in a hospital's Active Directory environment beyond the domain controllers?

Any system that can grant or forge administrative control over the directory. That includes ADFS servers, Entra Connect sync servers, internal certificate authorities, backup systems holding domain controller images or the NTDS.dit database, and virtualization hosts. PAM infrastructure that retrieves Tier 0 credentials belongs on the list too.

### How does HIPAA's Security Rule actually map to specific PAM controls?

The access control standard maps to unique user identification and role-based least privilege, person or entity authentication to MFA on privileged accounts, audit controls to session recording, and information access management to periodic access reviews. Emergency access procedure calls for vaulted break-glass credentials. HIPAA specifies outcomes rather than architecture, so a compliant program can still leave a Tier 0 path open.

### Can PAM protect medical devices and service accounts that cannot use MFA or be rotated on a schedule?

Partly. Vaulting and session brokering work for interactive vendor access to a device management console, but not for a machine account authenticating continuously to an EHR interface. Those identities need scoping instead: remove unneeded rights, constrain delegation, restrict which hosts the account can authenticate to, and monitor what it can reach. Most health systems have no inventory of these accounts, so that is where the work starts.

### Is a PAM tool ever a security risk to the environment it is supposed to protect?

Yes, when it is placed below the tier it administers. Microsoft Defender Experts documented an April 2026 case where a PAM session host managing Tier 0 credentials sat in Tier 1, and an attacker who reached a Tier 1 admin account took the host and its credentials with it. A system that can retrieve Tier 0 secrets is a Tier 0 asset, and deploying it anywhere else creates the bridge it was bought to prevent.

### What is the real ROI case for a PAM investment in a hospital's budget cycle?

The defensible version rests on breach lifecycle rather than breach probability. Healthcare breaches take an average of 279 days to identify and contain, and cost scales with dwell time, so controls that shorten an attacker's operating window produce measurable return. As of 2026, cyber-insurance underwriting and board reporting ask for privileged access coverage explicitly, which makes a PAM program a premium input rather than a pure cost line.

## Map the path, not the control

A PAM deployment that passes every audit is not a PAM deployment that closes every path to Tier 0. The audit counts controls implemented; the gap is counted in how many identities can still reach a domain controller, a certificate authority, or a backup server through however many hops nobody has drawn.

You already know the audit passed. The more useful exercise is seeing your AD and Entra ID estate modeled the way an attacker sees it, every path to Tier 0 counted and ranked.

[See your paths to Tier 0 mapped](https://www.saporo.io/product/overview) and book a walkthrough of your environment with Saporo.

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
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#primaryimage",
      "url": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare/header.png",
      "contentUrl": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare/header.png",
      "width": 2400,
      "height": 1200,
      "caption": "Article header card reading 'PAM for Healthcare Active Directory: The Tier 0 Gap' beneath an Identity Security label, on a Saporo-branded background."
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#breadcrumbs",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.saporo.io/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.saporo.io/resources/blog" },
        { "@type": "ListItem", "position": 3, "name": "Privileged Access Management in Healthcare: The Tier 0 Gap", "item": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare" }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#webpage",
      "url": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare",
      "name": "Privileged Access Management in Healthcare: The Tier 0 Gap",
      "isPartOf": { "@id": "https://www.saporo.io/#website" },
      "primaryImageOfPage": { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#primaryimage" },
      "breadcrumb": { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#breadcrumbs" },
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": ["#key-takeaways", ".key-takeaways"]
      },
      "inLanguage": "en-us"
    },
    {
      "@type": "BlogPosting",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#article",
      "headline": "Privileged Access Management in Healthcare: The Tier 0 Gap",
      "description": "Privileged access management in healthcare protects the credentials you know about. Here is why Tier 0 in hybrid AD/Azure stays reachable, and how to close it.",
      "author": { "@id": "https://www.saporo.io/about/ameya-deshmukh#person" },
      "publisher": { "@id": "https://www.saporo.io/#organization" },
      "datePublished": "2026-09-15",
      "dateModified": "2026-09-16",
      "image": { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#primaryimage" },
      "mainEntityOfPage": { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#webpage" },
      "keywords": "privileged access management healthcare, PAM for hospitals, tier 0 active directory healthcare, privileged access management Active Directory hybrid, admin account isolation Active Directory, zero trust identity architecture hybrid AD Azure, cost of identity breach healthcare",
      "wordCount": 1999,
      "articleSection": "Identity Security",
      "inLanguage": "en-us",
      "mentions": [
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-active-directory" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-domain-controller" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-microsoft" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-microsoft-entra-id" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-microsoft-defender-for-identity" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-privileged-access-management" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-zero-trust-security-model" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-hipaa" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-ransomware" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-change-healthcare" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-unitedhealth-group" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-andrew-witty" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-cisa" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-nsa" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-netwrix" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-ibm" }
      ],
      "citation": [
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-hipaa-journal-2025" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-ms-learn-tier-model" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-ms-learn-enterprise-access-model" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-cisa-ad-compromises" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-ms-defender-experts-pam-bridge" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-netwrix-2026-report" },
        { "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-healthcaredive-100m" }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What counts as a Tier 0 asset in a hospital's Active Directory environment beyond the domain controllers?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Any system that can grant or forge administrative control over the directory. That includes ADFS servers, Entra Connect sync servers, internal certificate authorities, backup systems holding domain controller images or the NTDS.dit database, and virtualization hosts. PAM infrastructure that retrieves Tier 0 credentials belongs on the list too."
          }
        },
        {
          "@type": "Question",
          "name": "How does HIPAA's Security Rule actually map to specific PAM controls?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The access control standard maps to unique user identification and role-based least privilege, person or entity authentication to MFA on privileged accounts, audit controls to session recording, and information access management to periodic access reviews. Emergency access procedure calls for vaulted break-glass credentials. HIPAA specifies outcomes rather than architecture, so a compliant program can still leave a Tier 0 path open."
          }
        },
        {
          "@type": "Question",
          "name": "Can PAM protect medical devices and service accounts that cannot use MFA or be rotated on a schedule?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Partly. Vaulting and session brokering work for interactive vendor access to a device management console, but not for a machine account authenticating continuously to an EHR interface. Those identities need scoping instead: remove unneeded rights, constrain delegation, restrict which hosts the account can authenticate to, and monitor what it can reach. Most health systems have no inventory of these accounts, so that is where the work starts."
          }
        },
        {
          "@type": "Question",
          "name": "Is a PAM tool ever a security risk to the environment it is supposed to protect?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, when it is placed below the tier it administers. Microsoft Defender Experts documented an April 2026 case where a PAM session host managing Tier 0 credentials sat in Tier 1, and an attacker who reached a Tier 1 admin account took the host and its credentials with it. A system that can retrieve Tier 0 secrets is a Tier 0 asset, and deploying it anywhere else creates the bridge it was bought to prevent."
          }
        },
        {
          "@type": "Question",
          "name": "What is the real ROI case for a PAM investment in a hospital's budget cycle?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "The defensible version rests on breach lifecycle rather than breach probability. Healthcare breaches take an average of 279 days to identify and contain, and cost scales with dwell time, so controls that shorten an attacker's operating window produce measurable return. As of 2026, cyber-insurance underwriting and board reporting ask for privileged access coverage explicitly, which makes a PAM program a premium input rather than a pure cost line."
          }
        }
      ]
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#term-privileged-access-management",
      "name": "Privileged access management",
      "description": "The discipline of controlling, vaulting, monitoring, and time-bounding the accounts that carry elevated rights."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#term-tier-0",
      "name": "Tier 0",
      "description": "The set of assets carrying direct or indirect administrative control over identity infrastructure. Compromise one and an attacker effectively owns the directory."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#term-standing-privileged-access",
      "name": "Standing privileged access",
      "description": "Any permission an identity holds continuously, whether or not it is in use or the account is labeled privileged."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#term-non-human-identity",
      "name": "Non-human identity",
      "description": "Any account that authenticates without a person behind it: service accounts, medical-device machine accounts, API keys, EHR integration credentials."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#term-zero-trust-identity-architecture",
      "name": "Zero trust identity architecture",
      "description": "For hybrid AD and Azure, no implicit trust between on-premises tiers and cloud administrative roles, with every privileged request evaluated against current reachability rather than a role assignment made months ago."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#term-privileged-access-workstations",
      "name": "Privileged access workstations",
      "description": "Hardened devices used for administrative work and nothing else, used by Tier 0 accounts to sign in."
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-active-directory",
      "name": "Active Directory",
      "sameAs": "https://en.wikipedia.org/wiki/Active_Directory"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-domain-controller",
      "name": "Domain controller",
      "sameAs": "https://en.wikipedia.org/wiki/Domain_controller"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-microsoft",
      "name": "Microsoft",
      "sameAs": "https://en.wikipedia.org/wiki/Microsoft"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-microsoft-entra-id",
      "name": "Microsoft Entra ID",
      "sameAs": "https://learn.microsoft.com/en-us/entra/fundamentals/whatis"
    },
    {
      "@type": "SoftwareApplication",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-microsoft-defender-for-identity",
      "name": "Microsoft Defender for Identity",
      "sameAs": "https://learn.microsoft.com/en-us/defender-for-identity/what-is"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-privileged-access-management",
      "name": "Privileged access management",
      "sameAs": "https://en.wikipedia.org/wiki/Privileged_access_management"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-zero-trust-security-model",
      "name": "Zero trust security model",
      "sameAs": "https://en.wikipedia.org/wiki/Zero_trust_security_model"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-hipaa",
      "name": "HIPAA",
      "sameAs": "https://en.wikipedia.org/wiki/Health_Insurance_Portability_and_Accountability_Act"
    },
    {
      "@type": "Thing",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-ransomware",
      "name": "Ransomware",
      "sameAs": "https://en.wikipedia.org/wiki/Ransomware"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-change-healthcare",
      "name": "Change Healthcare",
      "sameAs": "https://en.wikipedia.org/wiki/Change_Healthcare"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-unitedhealth-group",
      "name": "UnitedHealth Group",
      "sameAs": "https://en.wikipedia.org/wiki/UnitedHealth_Group"
    },
    {
      "@type": "Person",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-andrew-witty",
      "name": "Andrew Witty",
      "sameAs": "https://en.wikipedia.org/wiki/Andrew_Witty"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-cisa",
      "name": "CISA",
      "sameAs": "https://en.wikipedia.org/wiki/Cybersecurity_and_Infrastructure_Security_Agency"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-nsa",
      "name": "NSA",
      "sameAs": "https://en.wikipedia.org/wiki/National_Security_Agency"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-netwrix",
      "name": "Netwrix",
      "sameAs": "https://netwrix.com/"
    },
    {
      "@type": "Organization",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#mention-ibm",
      "name": "IBM",
      "sameAs": "https://en.wikipedia.org/wiki/IBM"
    },
    {
      "@type": "NewsArticle",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-hipaa-journal-2025",
      "name": "Average Cost of a Healthcare Data Breach Falls to $7.42 Million",
      "url": "https://www.hipaajournal.com/average-cost-of-a-healthcare-data-breach-2025/",
      "author": "Steve Alder",
      "datePublished": "2025",
      "publisher": "HIPAA Journal"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-ms-learn-tier-model",
      "name": "PAM environment tier model",
      "url": "https://learn.microsoft.com/en-us/microsoft-identity-manager/pam/tier-model-for-partitioning-administrative-privileges",
      "author": "Microsoft",
      "datePublished": "2025-04-08",
      "publisher": "Microsoft"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-ms-learn-enterprise-access-model",
      "name": "Securing privileged access: Enterprise access model",
      "url": "https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-access-model",
      "author": "Microsoft",
      "datePublished": "2026-05-06",
      "publisher": "Microsoft"
    },
    {
      "@type": "Report",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-cisa-ad-compromises",
      "name": "Detecting and Mitigating Active Directory Compromises",
      "url": "https://www.cisa.gov/resources-tools/resources/detecting-and-mitigating-active-directory-compromises",
      "author": "Australian Signals Directorate's ACSC, in cooperation with CISA and NSA",
      "datePublished": "2026-09-15",
      "publisher": "Cybersecurity and Infrastructure Security Agency (CISA)"
    },
    {
      "@type": "CreativeWork",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-ms-defender-experts-pam-bridge",
      "name": "When the shield becomes the sword: How misconfigured PAM bridges the tiering model",
      "url": "https://techcommunity.microsoft.com/blog/microsoft-defender-experts/when-the-shield-becomes-the-sword-how-misconfigured-pam-bridges-the-tiering-mode/4509392",
      "author": "Microsoft Defender Experts",
      "datePublished": "2026-04-09",
      "publisher": "Microsoft Tech Community"
    },
    {
      "@type": "Report",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-netwrix-2026-report",
      "name": "Netwrix 2026 Data and Identity Security Report",
      "url": "https://netwrix.com/en/resources/news/netwrix-2026-data-and-identity-security-report-ai-adoption-outpacing-ai-readiness-driving-a-4x-breach-gap/",
      "author": "Netwrix",
      "datePublished": "2026-06-10",
      "publisher": "Netwrix"
    },
    {
      "@type": "NewsArticle",
      "@id": "https://www.saporo.io/resources/blog/privileged-access-management-pam-active-directory-healthcare#citation-healthcaredive-100m",
      "name": "Change Healthcare data breach officially affects 100M",
      "url": "https://www.healthcaredive.com/news/change-healthcare-data-breach-affects-100-million/723493/",
      "datePublished": "2024-10-24",
      "publisher": "Healthcare Dive"
    }
  ]
}
```
<!--
EDIT SUMMARY (Phase 4 - Editor, re-run 2026-09-16)

GATE FEEDBACK - all four machine-checked failures fixed:
1. author_bio_url held a linkedin.com URL. The D34 body-citation scanner reads the
   whole file, frontmatter included, so that URL registered as an unverified body
   citation. It is now an empty string with an inline "(placeholder)" note; no Saporo
   author bio page exists and company.yaml author.bio_url is blank. Person authority
   still carries via schema sameAs in Phase 5, which reads company.yaml, not the
   article.
2. TechTarget's Change Healthcare/Citrix story is not in the research-verified URL
   set (the source failed live verification on a different attributed claim, which
   disqualifies the whole URL). The hyperlink is removed. The claim survives because
   it is now attributed in prose to the primary source the notes name: Andrew Witty's
   written testimony to the House Energy and Commerce Committee, May 1, 2024. Per the
   quality bar's "don't paraphrase a paraphrase" rule, primary attribution is the
   preferred form anyway.
3. The Microsoft Learn "privileged-access-devices" page is not in the verified set
   (the verified Microsoft Learn URLs are the PAM environment tier model and the
   Enterprise Access Model). Hyperlink removed; privileged access workstations are
   now a bolded plain-text definition instead.
4. canonical_url was absolute, so the D35 link checker read the article's own
   canonical as a hyperlink to an unpublished sibling. It is now written
   site-relative with the resolution rule noted inline; meta.json keeps the absolute
   self-canonical for Phase 5.
   Every remaining URL in the file was re-checked against the verified set: 7 external
   links across 6 domains (Microsoft Learn x2, Microsoft Tech Community x2, CISA,
   Netwrix, Healthcare Dive, HIPAA Journal), all research-verified; 3 unique internal
   links (product overview, compliance-is-a-starting-point, identity-is-the-new-attack-
   surface), all previously confirmed live. The brief's planned hub and the two sibling
   spokes are unpublished and are not linked or mentioned as links.

- Banned phrases removed: 0 remaining. seo_audit.py reports "No banned phrases found"
  against standards/banned-phrases.txt plus company.yaml voice.banned_phrases (empty
  for Saporo). Judgment-call sweep also clean: 0 em-dashes, 0 en-dashes, 0 exclamation
  marks, 0 instances of leverage/utilize/navigate/delve, no hedging vocabulary, no
  AI-marketing or MBA slop terms.
- Forbidden AI-slop patterns fixed this pass: 5.
  1. Antithetical inversion in Key Takeaway 4 ("Standing privileged access, not the
     named admin account, is...") rewritten as a causal sentence, with the Netwrix
     figure year-stamped to 2026.
  2. Non-sequitur / assertion chaining in the PAM-vs-exposure section: the Microsoft
     "golden rule of intermediaries" quote sat next to a vault sentence it did not
     explain. The quote moved to the placement section, where it states the rule the
     misplacement actually breaks and is followed by the mechanism.
  3. Assertion chaining in the placement section opener: "the tool inherits the trust
     without inheriting the hardening" restated the preceding claim; replaced with the
     intermediary mechanism (a server that brokers sessions into a domain controller
     is an intermediary to Tier 0).
  4. Fragment punch closing the MFA section ("No person sits in that loop to prompt.")
     folded into one sentence that carries the reason.
  5. Padding opener cut ("Read the 279 days as the operative number.").
- Repeated punchline trimmed: "vaulting controls storage, not reach" was stated three
  times (intro, Key Takeaways, section 1). The intro now states it once, in one
  sentence.
- Structural changes: 1 H1, 11 H2s, 5 H3s (FAQ only), no skipped levels. Body H2s all
  declarative; questions confined to the FAQ (D33, house voice). The 54-word closing
  thesis sentence split into two. Paragraphs all 1-4 sentences.
- SEO checklist: 14/14 pass. Title 58 chars; meta description 159 chars; slug 60 chars;
  one H1 carrying the primary keyword; primary keyword lands at word ~70 of the body as
  natural prose, not a stuffed lede (D32); 4 instances in 1,999 prose words = 2.0 per
  1,000, inside the 2-4 band. Exception: the secondary keyword "PAM for hospitals"
  appears semantically (hospital-scoped PAM discussion throughout, "a hospital's budget
  cycle", "hospitals run on-premises AD") but never as the literal string, which cannot
  be written into prose without stuffing. Word count 1,999 prose words: inside the
  brief's 1,400-2,000 band (D31) and +11% on the Strategist's 1,800 target, within the
  +/-15% tolerance.
- GEO checklist: 11/12 pass. Answer-first declarative sentence under every H2. Six
  definition-style bolded terms (privileged access management, Tier 0, standing
  privileged access, non-human identity, zero trust identity architecture, privileged
  access workstations), each under 25 words. 19 named entities. Every statistic carries
  a named source and a year. Freshness: publish_date and modified_date populated, every
  time-bound claim year-stamped (Feb 2024, May 2024, 2025, 2026, March 2026, April 2026,
  May 2026, September 2026). Exception: author_bio_url is empty because no Saporo author
  bio page exists (see gate fix 1).
- AIO checklist: 8/9 pass. Key Takeaways is the speakable target: 5 standalone bullets.
  FAQ answers are 3-4 sentences each with no preamble. Co-citation hygiene holds: every
  external domain is Microsoft Learn, Microsoft Tech Community, CISA, Netwrix, HIPAA
  Journal or Healthcare Dive, which research identified as the neighborhood AI engines
  already cite for AD-tiering and healthcare-breach-cost queries. Exception: no
  comparison table. The Strategist's outline explicitly specifies the PAM vs identity
  exposure management contrast as "two questions answered differently, not a
  vendor-feature table", and the AIO checklist routes deeper conceptual contrasts to
  prose. The list-structure requirement is met by the Key Takeaways block.
- Fact-check: every load-bearing claim re-fetched and checked against the live page
  this pass.
  VERIFIED on the Microsoft Tech Community post: the golden-rule quote ("The security
  assurance of the target is only as good as the security assurance of the
  intermediary"), the closing quote in full including "with a gold-plated sign", the
  Tier 2 -> Tier 1 admin -> PAM host -> Tier 0 chain, and the DART engagement that ran
  from a compromised helpdesk workstation to full domain compromise in under four hours.
  VERIFIED on the Netwrix release: 76% of organizations do not fully govern or monitor
  non-human identities; 2,317 professionals across 1,889 organizations; published
  June 10, 2026.
  VERIFIED on the CISA page: revision date September 15, 2026, 17 most common AD
  compromise techniques, developed by Australia's ASD ACSC with CISA and NSA.
  VERIFIED on Healthcare Dive: roughly 100 million people, largest healthcare breach
  reported to federal regulators.
  VERIFIED previously and unchanged on HIPAA Journal: $7.42M average 2025 healthcare
  breach cost, 279 days to identify and contain, five weeks longer than the global
  average, costliest industry 14 years running.
  CORRECTED (source over-reach): "The joint ACSC/CISA/NSA advisory recommends the same
  shape" was cut. The cited CISA page describes the guide's scope but does not state a
  privileged-access-workstation recommendation, and a claim may not lean on a source
  beyond what that page says.
  CORRECTED (precision): credential theft on the PAM host now reads "extracts the
  credential material the operating system processes for it", matching the source,
  which describes credential material processed by the OS becoming accessible rather
  than a memory read. "Microsoft's incident response team" is now "Microsoft's
  Detection and Response Team", the team the source names.
  CORRECTED (undated claim): the FAQ's cyber-insurance line now reads "As of 2026".
  Saporo's 5.9M attack paths and 64% misconfiguration-reduction figures trace to
  context/sales/value-props.md and are attributed to Saporo in prose.
  The TechTarget/Semperis "77% ransomware" figure, flagged in research-notes.md as
  failing live verification, is absent and remains unused. 0 [NEEDS RESEARCH]
  escalations.
- Verification: seo_audit.py -> 20 pass / 0 warn / 1 fail. The single FAIL is the
  missing json-ld fence, which is Phase 5 (Schema Builder) work and is exempt from the
  edit gate.
- Final word count: 1,999 prose words (2,182 including headings)
- Final reading time: 9 min
-->
