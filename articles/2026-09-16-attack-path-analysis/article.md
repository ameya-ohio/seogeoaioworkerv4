---
title: "Attack Path Analysis: Why Identity Is the Throughline"
slug: "attack-path-analysis"
author: "Ameya Deshmukh"
author_bio_url: ""  # (placeholder) no Saporo author bio page published yet; company.yaml author.bio_url is empty
publish_date: "2026-09-16"
modified_date: "2026-09-16"
meta_description: "Attack path analysis maps how identity relationships turn one foothold into a breach. Get the hop-by-hop chain, choke-point math, and what to fix first."
primary_keyword: "attack path analysis"
secondary_keywords:
  - "identity attack path"
  - "attack path management"
  - "attack path vs attack surface"
  - "attack path choke points"
  - "non-human identity attack paths"
canonical_url: "/resources/blog/attack-path-analysis"  # self-canonical, site-relative; Phase 5 resolves it against company.yaml blog.canonical_pattern (absolute form in meta.json)
hero_image: "header.png"
hero_image_alt: "Attack path analysis: why identity relationships are the throughline from foothold to breach — Saporo"
category: "Attack Path Management"
tags:
  - "attack path analysis"
  - "identity exposure"
  - "Active Directory"
  - "non-human identities"
  - "MITRE ATT&CK"
  - "choke points"
reading_time_minutes: 12
---

# Attack Path Analysis: Why Identity Is the Throughline

An organization with 10,000 identities has roughly 22 million potential attack paths running through it. That figure comes from Jared Atkinson, CTO of SpecterOps, writing in [Identity Week](https://identityweek.net/attack-path-management-why-identity-has-become-the-primary-security-battleground/) in February 2026, and his framing of the trend line is sharper than the number itself: "This growth is not linear. It is exponential."

The arithmetic works because attack paths are built out of relationships, and relationships multiply. Every group membership, every cached session, every permission one object holds over another adds an edge to a graph, and every new edge creates routes through every edge it touches.

**Attack path analysis** models an environment as a graph of relationships and traces the routes an attacker could traverse to reach a critical asset. The danger of any given path is set by the identity relationships it can cross, not by the number of vulnerabilities it starts from. Entry points change from year to year, while what turns a foothold into a breach rarely does.

## Key Takeaways

- Attack path analysis maps how vulnerabilities, misconfigurations, and identity permissions chain into a traversable route from an attacker's entry point to a high-value asset, rather than listing those weaknesses in isolation.
- SpecterOps CTO Jared Atkinson reported in February 2026 that organizations with 10,000 identities face 22 million potential attack paths, and described that growth as exponential rather than linear.
- Verizon's 2026 DBIR found that vulnerability exploitation caused 31% of breaches, overtaking stolen credentials as the top entry point for the first time in the report's 19-year history. Post-entry movement remains an identity-permissions problem.
- A choke point is a node where many attack paths converge, so removing one over-permissioned relationship can close hundreds of thousands of downstream routes in a single change.
- SpyCloud's September 2026 Identity Threat Report found compromised non-human identities (31%) are nearly twice as likely as phishing and social engineering (17%) to be an organization's primary breach entry point.

## What an attack path actually is

An attack path is a chained route of exploitable relationships between assets, not a single flaw. [Microsoft's Security Exposure Management documentation](https://learn.microsoft.com/en-us/security-exposure-management/work-attack-paths-overview) puts it in operational terms: attack paths "combine assets and techniques to show end-to-end paths that attackers can create to get from an entry point of an organization to critical assets." [Wikipedia's entry on attack path management](https://en.wikipedia.org/wiki/Attack_path_management) puts identity at the center, defining the discipline as the continuous discovery, mapping, and risk assessment of identity-based attack paths.

Three terms get conflated constantly, and the distinctions decide what you end up measuring.

An **attack surface** is the full inventory of points where an attacker could interact with your environment: exposed services, endpoints, accounts, APIs. An **attack vector** is the specific method used at one of those points, such as a phishing email or an unpatched CVE. An attack path is the ordered sequence that connects a vector at the edge to an asset you care about.

Vulnerability scanning and attack surface management both answer "how exposed am I?" by producing a list. Attack path analysis answers a harder question: given what this exposure connects to, what can an attacker actually reach?

A critical-severity CVE on a segmented print server with no onward permissions is a scanner's top finding and a graph's dead end. A medium-severity issue on a host holding a cached session for a nested group with rights over Active Directory is the reverse, and ranking by severity score alone inverts the two every time. We have written before on why [compliance is a starting point, not a measure of exploitability](https://www.saporo.io/resources/blog/compliance-is-a-starting-point-not-a-measure-of-exploitability), and the same failure mode governs CVSS-ordered remediation queues.

## Identity is the throughline, not one input among many

Identity relationships are what let a single foothold become a breach, whatever the attacker used to get in. [Palo Alto Networks' Unit 42](https://www.paloaltonetworks.com/blog/2026/02/unit-42-global-ir-report/) reported in its 2026 Global Incident Response Report that identity weaknesses played a material role in nearly 90% of the incidents its team worked.

Set that next to [Verizon's 2026 DBIR](https://www.verizon.com/about/news/breach-industry-wide-dbir-finds), which found that vulnerability exploitation accounted for 31% of breaches and surpassed stolen credentials as the single largest entry point for the first time in the report's 19-year history. Two reputable sources, two numbers pointing in different directions, and most vendor content resolves the tension by ignoring one of them.

They are measuring different moments. Verizon is counting how attackers get through the front door, and the answer in 2026 is increasingly unpatched software rather than a bought credential. Unit 42 is counting what showed up across the whole incident, including everything that happened after the door opened. An attacker who exploits an internet-facing CVE lands on one host with whatever privileges that service runs under. Reaching a domain controller, a data warehouse, or a signing key from there means authenticating as something with more rights, and that means using a credential, a token, a session, or a group membership.

Both statistics are correct, and the practical consequence is specific: patching changes which doors open, while identity structure determines how far anyone gets once one does. A model that treats identity as one telemetry feed alongside network and vulnerability data is modeling the corridor as if it were the door.

## One attack path, hop by hop

A realistic identity attack path reaches full domain compromise in four hops, and no single hop registers as a critical finding on its own. Each step below carries its MITRE ATT&CK technique identifier.

**Hop one, initial access (TA0001).** A phishing email (T1566) lands on a finance analyst's laptop. The analyst is a standard domain user with no administrative rights and nothing sensitive stored locally. On a severity-ranked report, this host is unremarkable.

**Hop two, credential access (TA0006).** The attacker, now authenticated as an ordinary domain user, queries Active Directory for accounts carrying a registered service principal name and requests a Kerberos service ticket for one of them (Kerberoasting, T1558.003). That ticket is encrypted with a key derived from the service account's password, so cracking it offline recovers the password itself. The account is a legacy application identity whose password was set during a 2021 migration and never rotated, so the crack succeeds in hours. No alert fires, because requesting a service ticket is ordinary Kerberos behavior.

**Hop three, privilege escalation (TA0004).** The service account belongs to a group called App-SQL-Operators, which during that same migration was nested inside Server-Admins. Server-Admins holds GenericAll rights over the domain object itself, which makes it **Tier 0**: the set of assets that can control the entire identity infrastructure, meaning domain controllers, domain admin accounts, and anything holding rights over them. Group nesting in Active Directory is transitive, so an account's effective permissions are the union of every ancestor group's. No administrator granted this service account domain-level rights; the nesting did it, and the account's own permission list still shows nothing unusual.

**Hop four, domain compromise.** GenericAll over the domain object includes the right to rewrite that object's access control list, so the attacker grants their own principal the two directory-replication permissions a domain controller uses to sync with its peers. With those in place, they request replication of the `krbtgt` account hash (DCSync, T1003.006) and use the recovered key to forge Kerberos tickets for any principal in the forest. Presenting those forged tickets is lateral movement (Pass the Ticket, T1550.003), and authentication has stopped working as a control at that point, because the attacker is the party issuing the tickets.

A vulnerability scanner records the phishable user, the stale password, and the group nesting as three separate items on three separate reports, while the graph that holds all three shows them as one route to the domain.

## What a choke point closes, in numbers

A **choke point** is a node or relationship where many distinct attack paths converge, so fixing it removes all of them at once. Microsoft's Security Exposure Management documentation treats the choke point as a first-class object for that reason, grouping converging paths so remediation effort can be aimed at the few nodes carrying most of them.

Microsoft, XM Cyber, and Tenable all explain the concept qualitatively. Here is the arithmetic, using the chain above.

Paths through a node multiply on both sides: count the routes in, count the routes onward, and the paths crossing that node are the product of the two. Suppose 400 accounts in the environment can reach App-SQL-Operators by some route, whether as direct members, through nested child groups, or via machines holding cached sessions for those accounts. On the other side, the Server-Admins nesting grants the group rights over 60 downstream objects, and each of those offers roughly 12 onward routes to a Tier 0 asset. That single nesting relationship carries 400 × 60 × 12 = 288,000 attack paths.

Removing App-SQL-Operators from Server-Admins is one line in one change ticket. It closes 288,000 routes without patching a CVE, rotating a password, or buying anything.

The same multiplication is why Atkinson's 22-million figure is credible. Path counts are products rather than sums, so adding identities grows exposure faster than any remediation list ordered by finding count can drain it. A quarter of a million routes never shows up on a severity report as a quarter of a million of anything; it shows up as one group membership nobody has reviewed since 2021.

## Non-human identities are already a bigger door than phishing

Compromised non-human identities are now the leading primary breach entry point, ahead of phishing. [SpyCloud's 2026 Identity Threat Report](https://www.globenewswire.com/news-release/2026/09/09/3358565/0/en/spycloud-2026-identity-threat-report-finds-non-human-identities-are-now-the-leading-path-into-the-enterprise.html), published on 9 September 2026, found that compromised NHIs accounted for 31% of primary entry points, nearly twice the 17% attributed to phishing and social engineering.

A **non-human identity** is any principal that authenticates without a person present: a service account, an API key, a CI/CD runner token, a workload identity, or an agentic AI worker. As graph nodes they behave differently from human accounts, and each difference makes them better intermediate hops.

Multi-factor authentication does not apply to them, because they authenticate with a static secret rather than an interactive login. Their credentials stay valid for years, since rotating a secret risks breaking a production dependency nobody has fully mapped. Most are over-permissioned from the day they were created, because the fastest route to a working integration is to grant more rights than the job needs and promise to trim them later. And because no HR system deprovisions a token, they outlive the projects and the people that created them.

The service account in the chain above is a textbook case. It was not phished, it had no MFA to bypass, its password predated the current rotation policy, and its effective privileges came from a group nesting rather than a deliberate grant. A model that enumerates human accounts and treats machine identities as an appendix will miss the hop that mattered.

## When bolt-on attack-path visibility stops being enough

A bolt-on attack-path module is sufficient when your paths are simple and stay inside one domain. If your critical assets live entirely in one cloud account and your identity model is a single IAM tenant, the attack-path view built into your CNAPP will show you most of what you need.

It stops being sufficient at the boundary. Real paths cross from on-prem Active Directory into Entra ID, from Entra ID into AWS through federated roles, and from there into SaaS applications through OAuth grants. Each product in that chain models only its own side, so the attacker crosses the boundary and the tooling does not.

| Dimension | Identity-first attack path platform | Bolt-on ASM or CNAPP module |
|---|---|---|
| Identity coverage breadth | Permissions, group nesting, sessions, and trusts modeled as first-class edges | Identity treated as one attribute on an asset record |
| Human and non-human identities | Both modeled as traversable nodes, with NHI credential lifetime and effective rights included | Human accounts enumerated; service accounts and tokens often partial |
| Analysis cadence | Continuous, recomputed as memberships and sessions change | Point-in-time, tied to scan or ingest schedule |
| Prioritization logic | Reachability, propagation potential, and impact to critical assets | Severity score, with path context as a visualization layer |
| Hybrid on-prem, cloud, and SaaS | One graph spanning all three | Strong in the native domain, thin outside it |

The dividing line is whether the tool produces one graph or several views. A visualization that renders paths inside each silo cannot rank a path that crosses two of them, because no component holds both halves. Our post on [the power of the security graph](https://www.saporo.io/resources/blog/the-power-of-the-security-graph) covers the modeling difference in more depth, and [Identity Is the New Attack Surface, But Most Graphs Are Blind](https://www.saporo.io/resources/blog/identity-is-the-new-attack-surface-but-most-graphs-are-blind) covers where graph coverage tends to break.

## Frequently Asked Questions

### How is attack path analysis different from vulnerability scanning?

Vulnerability scanning enumerates individual weaknesses and ranks them by severity score. Attack path analysis models how those weaknesses connect to identities, permissions, and assets, then ranks them by what an attacker could actually reach through them. In practice that means a scanner can rate an unreachable critical CVE above a medium-severity issue sitting on a route to a domain controller.

### What's the actual difference between an attack vector, an attack surface, and an attack path?

An attack surface is the full set of points where an attacker could interact with your environment. An attack vector is the specific method used at one of those points, such as a phishing email or an exploited CVE. An attack path is the ordered chain that connects a vector at the edge, through intermediate identities and assets, to a target worth reaching.

### What is a Tier 0 asset in Active Directory, and why does it matter for attack paths?

Tier 0 is the set of assets that control the identity infrastructure itself: domain controllers, domain admin accounts, the `krbtgt` account, and any object holding rights over them. It matters for attack paths because Tier 0 is the terminal node for most chains. Compromise anything in Tier 0 and the attacker can issue their own credentials, which makes every downstream control irrelevant.

### Is BloodHound safe to use if attackers use the same tool?

**BloodHound** is an open-source graph tool, maintained by SpecterOps, that maps privilege-escalation routes through Active Directory and Entra ID. It is explicitly dual-use, and that is the argument for running it rather than against it, because red teams and real attackers already enumerate the same routes. The security community's resolution is that defenders should run it first and monitor for unauthorized use of it, since declining to look does not remove the paths.

### Do I need to run attack path analysis continuously, or is a one-time assessment enough?

Continuously. Attack paths are created by routine operations: a new group nesting during a migration, a service account granted temporary rights that were never revoked, a cached admin session on a workstation. A point-in-time assessment is accurate on the day it runs and stale within weeks, because the graph changes every time someone is added to a group.

### How does attack path analysis fit into a CTEM program?

Attack path analysis supplies the prioritization step of Continuous Threat Exposure Management, the exposure-management framework Gartner introduced in 2022. It converts an inventory of discovered exposures into a ranked set of routes, and it defines what the validation step should test. Gartner's widely quoted breach-reduction figure for CTEM adopters was a 2022 strategic planning assumption, a forecast rather than a measured outcome, and no independent study has since confirmed it.

### Can attack path analysis cover on-prem Active Directory, cloud IAM, and Entra ID at the same time?

Yes, provided the model is one graph rather than several stitched views. Hybrid paths are the ones that matter most, because an on-prem account synchronized to Entra ID and federated into an AWS role crosses three trust boundaries that three separate tools each see half of. Real coverage means the identity relationships across Active Directory, Entra ID, cloud IAM, and SaaS all resolve as edges in the same model.

## Start with what an attacker can reach

Your attack surface tells you what is exposed. Attack path analysis tells you what an attacker could reach and connect once they are inside, and identity relationships are what make nearly every one of those connections possible, whatever opened the door. That distinction is testable: take any critical finding in your current queue and ask what it lets someone reach. If your tooling cannot answer, it is listing findings rather than modeling exposure.

If you want to see how reachability, propagation potential, and impact to critical assets work as a prioritization model, read the [Saporo product overview](https://www.saporo.io/product/overview).

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
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#primaryimage",
      "url": "https://www.saporo.io/images/blog/attack-path-analysis-hero.webp",
      "contentUrl": "https://www.saporo.io/images/blog/attack-path-analysis-hero.webp",
      "width": 1600,
      "height": 900,
      "caption": "Graph diagram of an identity attack path running from a phished laptop through a nested Active Directory group to a Tier 0 domain controller"
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#breadcrumbs",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home", "item": "https://www.saporo.io/" },
        { "@type": "ListItem", "position": 2, "name": "Blog", "item": "https://www.saporo.io/resources/blog" },
        { "@type": "ListItem", "position": 3, "name": "Attack Path Analysis: Why Identity Is the Throughline", "item": "https://www.saporo.io/resources/blog/attack-path-analysis" }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#webpage",
      "url": "https://www.saporo.io/resources/blog/attack-path-analysis",
      "name": "Attack Path Analysis: Why Identity Is the Throughline",
      "isPartOf": { "@id": "https://www.saporo.io/#website" },
      "primaryImageOfPage": { "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#primaryimage" },
      "breadcrumb": { "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#breadcrumbs" },
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": ["#key-takeaways", ".key-takeaways"]
      },
      "inLanguage": "en-us"
    },
    {
      "@type": "BlogPosting",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#article",
      "headline": "Attack Path Analysis: Why Identity Is the Throughline",
      "description": "Attack path analysis maps how identity relationships turn one foothold into a breach. Get the hop-by-hop chain, choke-point math, and what to fix first.",
      "author": { "@id": "https://www.saporo.io/about/ameya-deshmukh#person" },
      "publisher": { "@id": "https://www.saporo.io/#organization" },
      "datePublished": "2026-09-16",
      "dateModified": "2026-09-16",
      "image": { "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#primaryimage" },
      "mainEntityOfPage": { "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#webpage" },
      "keywords": "attack path analysis, identity attack path, attack path management, attack path vs attack surface, attack path choke points, non-human identity attack paths",
      "wordCount": 2791,
      "articleSection": "Attack Path Management",
      "inLanguage": "en-us",
      "mentions": [
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-mitre-attck",
          "name": "MITRE ATT&CK",
          "sameAs": "https://en.wikipedia.org/wiki/MITRE_ATT%26CK"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-active-directory",
          "name": "Active Directory",
          "sameAs": "https://en.wikipedia.org/wiki/Active_Directory"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-privilege-escalation",
          "name": "Privilege escalation",
          "sameAs": "https://en.wikipedia.org/wiki/Privilege_escalation"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-lateral-movement",
          "name": "Lateral movement (MITRE ATT&CK TA0008)",
          "sameAs": "https://attack.mitre.org/tactics/TA0008/"
        },
        {
          "@type": "Thing",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-attack-path-management",
          "name": "Attack path management",
          "sameAs": "https://en.wikipedia.org/wiki/Attack_path_management"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-palo-alto-networks",
          "name": "Palo Alto Networks",
          "sameAs": "https://en.wikipedia.org/wiki/Palo_Alto_Networks"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-verizon",
          "name": "Verizon",
          "sameAs": "https://en.wikipedia.org/wiki/Verizon"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-microsoft",
          "name": "Microsoft",
          "sameAs": "https://en.wikipedia.org/wiki/Microsoft"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-gartner",
          "name": "Gartner",
          "sameAs": "https://en.wikipedia.org/wiki/Gartner"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-specterops",
          "name": "SpecterOps",
          "sameAs": "https://specterops.io"
        },
        {
          "@type": "SoftwareApplication",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-bloodhound",
          "name": "BloodHound",
          "sameAs": "https://specterops.io"
        },
        {
          "@type": "Person",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-jared-atkinson",
          "name": "Jared Atkinson"
        },
        {
          "@type": "Organization",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#mention-spycloud",
          "name": "SpyCloud",
          "sameAs": "https://spycloud.com"
        },
        { "@id": "https://www.saporo.io/#organization" }
      ],
      "citation": [
        {
          "@type": "Article",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#citation-identityweek-atkinson-2026",
          "name": "Attack path management: Why identity has become the primary security battleground",
          "url": "https://identityweek.net/attack-path-management-why-identity-has-become-the-primary-security-battleground/",
          "author": "Jared Atkinson",
          "datePublished": "2026-02-17",
          "publisher": "Identity Week"
        },
        {
          "@type": "Report",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#citation-verizon-2026-dbir",
          "name": "Software Flaws Displace Stolen Credentials as Top Breach Entry Point, Verizon 2026 DBIR Finds",
          "url": "https://www.verizon.com/about/news/breach-industry-wide-dbir-finds",
          "author": "Verizon",
          "datePublished": "2026",
          "publisher": "Verizon"
        },
        {
          "@type": "Report",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#citation-spycloud-2026-identity-threat-report",
          "name": "SpyCloud 2026 Identity Threat Report Finds Non-Human Identities Are Now the Leading Path into the Enterprise",
          "url": "https://www.globenewswire.com/news-release/2026/09/09/3358565/0/en/spycloud-2026-identity-threat-report-finds-non-human-identities-are-now-the-leading-path-into-the-enterprise.html",
          "author": "SpyCloud",
          "datePublished": "2026-09-09",
          "publisher": "GlobeNewswire"
        },
        {
          "@type": "Report",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#citation-unit42-2026-global-ir-report",
          "name": "2026 Unit 42 Global Incident Response Report",
          "url": "https://www.paloaltonetworks.com/blog/2026/02/unit-42-global-ir-report/",
          "author": "Unit 42, Palo Alto Networks",
          "datePublished": "2026-02",
          "publisher": "Palo Alto Networks"
        },
        {
          "@type": "TechArticle",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#citation-microsoft-learn-attack-paths",
          "name": "Work with attack paths in Microsoft Security Exposure Management",
          "url": "https://learn.microsoft.com/en-us/security-exposure-management/work-attack-paths-overview",
          "author": "Microsoft",
          "datePublished": "2026-08-07",
          "publisher": "Microsoft"
        },
        {
          "@type": "CreativeWork",
          "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#citation-wikipedia-attack-path-management",
          "name": "Attack path management",
          "url": "https://en.wikipedia.org/wiki/Attack_path_management",
          "author": "Wikipedia contributors",
          "publisher": "Wikimedia Foundation"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "How is attack path analysis different from vulnerability scanning?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Vulnerability scanning enumerates individual weaknesses and ranks them by severity score. Attack path analysis models how those weaknesses connect to identities, permissions, and assets, then ranks them by what an attacker could actually reach through them. In practice that means a scanner can rate an unreachable critical CVE above a medium-severity issue sitting on a route to a domain controller."
          }
        },
        {
          "@type": "Question",
          "name": "What's the actual difference between an attack vector, an attack surface, and an attack path?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "An attack surface is the full set of points where an attacker could interact with your environment. An attack vector is the specific method used at one of those points, such as a phishing email or an exploited CVE. An attack path is the ordered chain that connects a vector at the edge, through intermediate identities and assets, to a target worth reaching."
          }
        },
        {
          "@type": "Question",
          "name": "What is a Tier 0 asset in Active Directory, and why does it matter for attack paths?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Tier 0 is the set of assets that control the identity infrastructure itself: domain controllers, domain admin accounts, the krbtgt account, and any object holding rights over them. It matters for attack paths because Tier 0 is the terminal node for most chains. Compromise anything in Tier 0 and the attacker can issue their own credentials, which makes every downstream control irrelevant."
          }
        },
        {
          "@type": "Question",
          "name": "Is BloodHound safe to use if attackers use the same tool?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "BloodHound is an open-source graph tool, maintained by SpecterOps, that maps privilege-escalation routes through Active Directory and Entra ID. It is explicitly dual-use, and that is the argument for running it rather than against it, because red teams and real attackers already enumerate the same routes. The security community's resolution is that defenders should run it first and monitor for unauthorized use of it, since declining to look does not remove the paths."
          }
        },
        {
          "@type": "Question",
          "name": "Do I need to run attack path analysis continuously, or is a one-time assessment enough?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Continuously. Attack paths are created by routine operations: a new group nesting during a migration, a service account granted temporary rights that were never revoked, a cached admin session on a workstation. A point-in-time assessment is accurate on the day it runs and stale within weeks, because the graph changes every time someone is added to a group."
          }
        },
        {
          "@type": "Question",
          "name": "How does attack path analysis fit into a CTEM program?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Attack path analysis supplies the prioritization step of Continuous Threat Exposure Management, the exposure-management framework Gartner introduced in 2022. It converts an inventory of discovered exposures into a ranked set of routes, and it defines what the validation step should test. Gartner's widely quoted breach-reduction figure for CTEM adopters was a 2022 strategic planning assumption, a forecast rather than a measured outcome, and no independent study has since confirmed it."
          }
        },
        {
          "@type": "Question",
          "name": "Can attack path analysis cover on-prem Active Directory, cloud IAM, and Entra ID at the same time?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Yes, provided the model is one graph rather than several stitched views. Hybrid paths are the ones that matter most, because an on-prem account synchronized to Entra ID and federated into an AWS role crosses three trust boundaries that three separate tools each see half of. Real coverage means the identity relationships across Active Directory, Entra ID, cloud IAM, and SaaS all resolve as edges in the same model."
          }
        }
      ]
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#term-attack-path-analysis",
      "name": "Attack path analysis",
      "description": "Attack path analysis models an environment as a graph of relationships and traces the routes an attacker could traverse to reach a critical asset, with the danger of any given path set by the identity relationships it can cross rather than the number of vulnerabilities it starts from."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#term-attack-surface",
      "name": "Attack surface",
      "description": "The full inventory of points where an attacker could interact with an environment: exposed services, endpoints, accounts, and APIs."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#term-attack-vector",
      "name": "Attack vector",
      "description": "The specific method used at a point on the attack surface, such as a phishing email or an unpatched CVE."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#term-tier-0",
      "name": "Tier 0",
      "description": "The set of assets that can control the entire identity infrastructure, meaning domain controllers, domain admin accounts, and anything holding rights over them."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#term-choke-point",
      "name": "Choke point",
      "description": "A node or relationship where many distinct attack paths converge, so fixing it removes all of them at once."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#term-non-human-identity",
      "name": "Non-human identity",
      "description": "Any principal that authenticates without a person present: a service account, an API key, a CI/CD runner token, a workload identity, or an agentic AI worker."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://www.saporo.io/resources/blog/attack-path-analysis#term-bloodhound",
      "name": "BloodHound",
      "description": "An open-source graph tool, maintained by SpecterOps, that maps privilege-escalation routes through Active Directory and Entra ID."
    }
  ]
}
```

<!--
EDIT SUMMARY
- Banned phrases removed: 0 new (seo_audit.py: "No banned phrases found"). Body carries zero em-dashes, zero en-dashes, zero exclamation marks, zero hedging vocabulary, zero AI-marketing or MBA slop terms. Prior pass had already cleared the list; this pass re-ran it after every rewrite below.
- Forbidden AI-slop patterns fixed: 3. (1) Two-beat verdict punch closing the lede ("Entry points change from year to year. What turns a foothold into a breach rarely does.") folded into one sustained sentence. (2) Repeated punchline cut: "Four hops, and none of them is a critical finding in isolation" restated the section's opening sentence four paragraphs later; the closing line now carries only the scanner-vs-graph contrast. (3) Two-beat punch in hop three ("Nobody granted this service account domain-level rights. The nesting did it") rejoined into one clause.
- Structural changes: hop three reordered so Tier 0 is defined at the point the term is first used rather than dropped mid-narrative; the 63-word closing sentence of the identity-throughline section split into two for cadence; the Wikipedia provenance clause in the definition section cut as padding.
- SEO checklist: 14/14 pass. Title 53 chars, meta 152 chars, slug 20 chars, one H1 carrying the primary keyword, primary keyword inside the first 100 words (audit-confirmed), 11 instances in 2,790 body words = 3.9 per 1,000 (2-4 band). External authoritative links: 6 (identityweek.net, learn.microsoft.com, en.wikipedia.org, paloaltonetworks.com, verizon.com, globenewswire.com), all research-verified. Internal links: 4, all resolving. Exceptions: (a) secondary keyword "attack path vs attack surface" appears as a semantic match (FAQ 2 and the attack-surface/vector/path section), not as the literal query string, since the literal form cannot be written into prose without stuffing; (b) canonical_url is written site-relative (see frontmatter note) so the D35 internal-link scanner does not read the article's own canonical as an unpublished sibling link, with the absolute self-canonical held in meta.json for Phase 5.
- GEO checklist: 12/12 pass. Seven definition-style bolded terms (attack path analysis, attack surface, attack vector, Tier 0, choke point, non-human identity, BloodHound). Named entities: 16 (Jared Atkinson, SpecterOps, Microsoft, Verizon, Palo Alto Networks, Unit 42, SpyCloud, Gartner, MITRE ATT&CK, BloodHound, Active Directory, Entra ID, AWS, XM Cyber, Tenable, Wikipedia). Every statistic carries a named source and a year. The wedge is intact and sharper: the worked 400 x 60 x 12 = 288,000 choke-point calculation and the Verizon/Unit 42 reconciliation, neither of which appears on any top-10 ranking page. Exception: author_bio_url empty, no Saporo author bio page exists (company.yaml author.bio_url is blank); Person authority carries via schema sameAs to LinkedIn in Phase 5.
- AIO checklist: 9/9 pass. Body H2s all declarative per house style (D33); the seven question-shaped headings live only in the FAQ. Five-row comparison table for identity-first vs bolt-on. Key Takeaways = 5 standalone speakable bullets. FAQ answers 3-4 sentences each, no preamble. Co-citation hygiene: every remaining external domain is a primary source or a domain the research phase identified as already cited by AI engines on this topic.
- Fact-check: 4 unverified body citations removed (D34 gate) and 1 fabricated quote corrected. (1-3) The three attack.mitre.org links (framework index, T1558.003, T1003.006) are not in the research-verified source set; the hyperlinks are gone and the technique identifiers remain as plain-text ATT&CK labels, which is what the MITRE ATT&CK mention in the research notes supports. (4) The specterops.io BloodHound product link is not in the verified set; the FAQ now opens with a plain-text definition of BloodHound as the SpecterOps-maintained open-source AD/Entra ID graph tool, which the research notes' Key Entities and Debates sections both support. (5) The choke-point section quoted Microsoft as defining a choke point as a node "where multiple attack paths flow or intersect on the way to a critical asset"; that wording is not in research-notes.md, so the quotation marks are removed and the sentence now paraphrases only what the notes attribute to Microsoft. (6) The CTEM answer called Gartner's framework "five-stage"; the notes support the 2022 date and the framework name but not the stage count, so the count is gone and the Gartner breach-reduction figure stays framed as an unvalidated 2022 forecast. All remaining statistics (Atkinson 22M and the verbatim "This growth is not linear. It is exponential."; Verizon 31% / first time in 19 years; Unit 42 nearly 90%; SpyCloud 31% vs 17%; the Microsoft attack-path definition quote; the Wikipedia definition) trace to research-notes.md and sit in the machine-verified URL set. 0 claims escalated to Phase 1.
- Internal links (D35): 1 removed. The article's own canonical, https-prefixed in frontmatter, was being read by the link checker as a hyperlink to an unpublished sibling; canonical_url is now site-relative with the resolution rule noted inline, and meta.json keeps the absolute form. The three live blog links (compliance-is-a-starting-point, the-power-of-the-security-graph, identity-is-the-new-attack-surface) and the product overview link all resolve. The outline's requested "CISO's Pragmatic Lens on Identity Blast Radius" link stays dropped: the page 404s.
- Final word count: 2,790 body (2,071 prose + 159 Key Takeaways + 560 FAQ). The Strategist's 1,900-word target covers body prose only: its own section budget (intro 150 + six sections 1,750 + closing 100) sums to 2,000 and excludes the Key Takeaways block and seven-question FAQ it separately mandated. Prose-only is +9% on 1,900, inside the ±15% band, after this pass trimmed the definition section and the throughline section.
- Final reading time: 12 min (2,790 words at ~235 wpm).
-->
