# Competitive Landscape — Full-Stack Category Guide

Source: Saporo's Full-Stack Competitive Category Guide (sales enablement). Ten categories, every tool a prospect is likely to name, and the complementary-first framing for each.

## Blog-use rules (read first)

This guide was written for sales calls. The agents use it to position Saporo correctly and to keep competitors out of the article's authority slots. The rules below are binding, and `standards/quality-bar.md` → *Competitor handling* enforces them.

**Head-to-head vendors.** These companies and products compete with Saporo directly:

| Company | Head-to-head products | Scope of the ban |
|---|---|---|
| SpecterOps | BloodHound Enterprise, BloodHound (Community Edition), SharpHound, "BloodHound Hunter" | Whole company |
| Semperis | Lightning Intelligence, Directory Services Protector (DSP), Purple Knight, Forest Druid | Whole company |
| Silverfort | Silverfort platform | Whole company |
| XM Cyber | XM Cyber platform | Whole company |
| AuthMind | AuthMind platform | Whole company |
| Tenable | Tenable Identity Exposure | That product only; Tenable's CVE and vulnerability research stays citable |
| Microsoft | Microsoft Defender for Identity | That product only; Microsoft Learn documentation and Microsoft threat reports stay citable |
| CrowdStrike | Falcon Identity (Falcon Identity Protection / ITDR) | That product only; CrowdStrike threat reports stay citable |

For a head-to-head vendor (every whole-company row, and the named product for the product-only rows):

1. **Never the opening hook.** None of their figures, quotes or framings open the article or appear in the intro.
2. **Never a Key Takeaways stat.**
3. **Never the subject of an FAQ answer.** No FAQ question about their product or their research.
4. **Never cited as a source in the body**, even with disclosure ("SpecterOps, which sells BloodHound Enterprise, estimates…"), and even when no neutral source exists. If the only source for a claim is a head-to-head vendor, drop the claim or make the argument without that number. The same rule covers their blogs, research reports, executive bylines and interviews (a SpecterOps CTO quoted in a trade publication still counts as SpecterOps), and their docs.
5. **Named only factually.** Outside a vendor format (Tools Listicle, Alternatives, Comparison (Vendor) — see `standards/quality-bar.md` → *The vendor-format exception*), name each vendor at most once, inside a factual comparison ("posture tools such as BloodHound Enterprise and XM Cyber map attack paths; detection tools such as Silverfort alert on attacks in progress"). Acknowledge their work once at most, then make Saporo's case on its own terms. Don't cycle between compliments and criticism (`quality-bar.md` → *Hedge-Then-Praise Cycling*).

The audit enforces this table from `config/company.yaml` → `competitors.head_to_head`, which lists each vendor's domains and product names. If you change the table, change that list too.

**Complementary categories** (every other category below). You can name and cite these vendors normally. Frame them as layers that work alongside Saporo, and never say or imply that Saporo replaces them.

**Talk tracks are internal.** The quoted lines under each category are cold-call scripts. Never quote them, paraphrase them as dialogue, or address the reader as a prospect ("ask them…").

**Dated facts here steer, they don't source.** Examples: BloodHound Enterprise's AWS and MCP beta (July 28, 2026), and Google's close of the Wiz acquisition (March 11, 2026). Use them to keep claims current and to catch stale ones. Any public claim about a vendor still needs a public source in `research-notes.md`, and the source can't be a head-to-head vendor.

---

## The Saporo anchor

Saporo is a graph-native **Preemptive Identity Exposure Management (PIEM)** platform. It maps every possible way an attacker could move through your identity environment — across Active Directory, cloud directories, and machine identities — and tells you the smallest number of changes that would eliminate the most risk.

- **Preemptive** — finds and closes attack paths before an incident happens, not after.
- **Identity** — the attack surface is identity: Active Directory, Entra, AWS, Okta, and more.
- **Attack paths** — maps billions of potential paths. One fix can collapse millions of them.

Categories: ISPM / ITDR · IAM / IGA · PAM · AD Security · EDR / XDR · SIEM / SOAR · Cloud Security · Vuln / Exposure Mgmt · GRC / Compliance · Network / Zero Trust

---

## 01 — ISPM / ITDR (HEAD-TO-HEAD)

Identity Security Posture Management / Identity Threat Detection & Response — Saporo's home turf.

**Tools in this category:** BloodHound Enterprise, Semperis (Lightning Intelligence + DSP), Tenable Identity Exposure, Microsoft Defender for Identity, CrowdStrike Falcon Identity, Silverfort, XM Cyber, AuthMind

**What it does:** Two motions live here. Posture tools (BloodHound, Tenable Identity Exposure, XM Cyber, AuthMind) continuously map identity configurations and attack paths — Saporo's own turf. Detection & response tools (Semperis DSP, Microsoft Defender for Identity, CrowdStrike Falcon Identity, Silverfort) watch for attacks already in progress and alert or recover.

**How Saporo differs:** Vs. posture tools: Saporo's in-memory graph engine computes billions of attack paths in real time, with native ADCS/SMB/AWS/M365 coverage out of the box, Business-Impact safety checks before a fix is applied, and scheduled re-evaluation — not a point-in-time scan. BloodHound remains the closest technical match (respect the practitioner credibility, lead with chokepoint economics); as of a July 28, 2026 SpecterOps beta release, BloodHound Enterprise added AWS coverage and an MCP-based AI interface ("BloodHound Hunter") — both still request-access beta as of this guide's date, not GA. Vs. detection tools: those catch attacks in motion; Saporo works upstream, removing the path before there's anything to detect.

> Talk track (internal — never quote): "Same category as us — ask them: can it compute billions of paths in real time and tell you the handful of fixes that eliminate most of the risk? That's our home turf. If it's a detection tool like Semperis, Defender for Identity, or Silverfort, that's complementary — they catch what's already moving, we remove the path before anyone's on it."

## 02 — IAM / IGA (COMPLEMENTARY)

Identity & Access Management / Identity Governance & Administration.

**Tools in this category:** Microsoft Entra ID, Okta, Ping Identity / ForgeRock, SailPoint, Saviynt

**What it does:** IAM handles authentication and access — SSO, MFA, conditional access. IGA governs it — access certifications, provisioning, role management, compliance reporting. Both control identity access going forward, validated on a periodic review cycle.

**How Saporo differs:** SailPoint or Okta tell you who's allowed to do what. Saporo maps what an attacker could actually do with that access today, combined with everything else in the identity graph — including paths created by IAM/IGA settings, misconfigurations, and trust relationships. Saporo ingests Entra ID and Okta as data sources rather than replacing them.

> Talk track (internal — never quote): "SailPoint answers: does this person have the right access? Saporo answers: what could an attacker do if they compromised this account? Different questions, same identity program — Saporo often validates that the IAM/IGA investment is actually working."

## 03 — PAM (COMPLEMENTARY)

Privileged Access Management.

**Tools in this category:** CyberArk, BeyondTrust, Delinea

**What it does:** Vaults and rotates privileged credentials, manages sessions, and enforces least-privilege and just-in-time access for admin and service accounts — the accounts with the most damaging blast radius if compromised.

**How Saporo differs:** PAM controls the accounts you already know matter. Saporo maps the attack paths that lead to those accounts — including ones nobody has vaulted yet, chained privilege escalation, and stale service accounts PAM never sees. Strong co-sell story: Saporo finds and prioritizes the risk, PAM contains it.

> Talk track (internal — never quote): "CyberArk and BeyondTrust vault privileged accounts once you know which ones matter. Saporo shows the attack paths leading to those accounts, including the ones nobody's vaulted yet. We usually make a PAM program more effective, not redundant — ask what percentage of their Tier-0 paths route around PAM entirely."

## 04 — AD Security (COMPLEMENTARY)

Active Directory hardening, auditing, and recovery.

**Tools in this category:** Semperis (Purple Knight, Forest Druid), Netwrix / PingCastle, Quest Active Roles, ANSSI ORADAD

> Blog note: Semperis is head-to-head as a company (see the rules above), so Purple Knight and Forest Druid follow the head-to-head rules even though they sit in this category. Netwrix / PingCastle, Quest and ANSSI ORADAD are complementary.

**What it does:** A wide range, from free point-in-time AD health scores (PingCastle, Purple Knight, Forest Druid) to change auditing (Netwrix Change Auditor), AD operations and provisioning (Quest Active Roles), and full recovery platforms (Semperis Directory Services Protector).

**How Saporo differs:** Most of this category gives a snapshot or an operational view, not continuous, prioritized reduction. Saporo turns any of these into an ongoing program: scheduled re-evaluation, chokepoint prioritization, and hybrid coverage beyond AD — Entra, AWS, Okta, M365 — cutting audit prep from roughly 4–8 weeks to 3–5 days.

> Talk track (internal — never quote): "If they mention PingCastle or Purple Knight, meet them there — great free snapshots. The real question is a one-time score vs. ongoing, prioritized reduction of real reachability to Tier-0, across AD and the cloud identities connected to it."

## 05 — EDR / XDR (COMPLEMENTARY)

Endpoint Detection & Response / Extended Detection & Response.

**Tools in this category:** CrowdStrike Falcon, SentinelOne, Palo Alto Cortex XDR, Microsoft Defender for Endpoint

**What it does:** Monitors endpoints — laptops, servers, workstations — for suspicious behavior in real time and contains threats as they happen. (Identity-specific modules — Falcon Identity, Singularity Identity, Defender for Identity — are covered under ISPM/ITDR, where they actually compete.)

**How Saporo differs:** EDR/XDR watches for attacks in motion on the endpoint. Saporo works before an attack — closing identity paths so there's less for EDR to ever have to catch. Most customers run both; EDR catches what gets through, Saporo shrinks what's there to get through.

> Talk track (internal — never quote): "CrowdStrike and SentinelOne are excellent at catching threats already in motion — we're not trying to replace that. We work upstream on identity, removing attack paths before anyone gets the chance to move laterally in the first place."

## 06 — SIEM / SOAR (COMPLEMENTARY)

Security Information & Event Management / Security Orchestration, Automation & Response.

**Tools in this category:** Splunk, Microsoft Sentinel, IBM QRadar, Exabeam / LogRhythm

**What it does:** Aggregates and correlates log data across the environment to detect threats, then (SOAR) orchestrates automated response playbooks. Reactive and log-based — it needs something to have already happened, or at least been logged.

**How Saporo differs:** SIEM/SOAR tells you what already happened, from the logs. Saporo tells you what could happen — paths that exist whether or not anything's triggered an alert yet — and eliminates them proactively. Saporo findings can pipe straight into the SOC's existing queue.

> Talk track (internal — never quote): "Splunk, Sentinel, and QRadar tell you what happened. Saporo tells you what could happen and prevents it, upstream of any log entry. If they're SOC-mature with one of these already deployed, that's usually a sign they're ready for a proactive layer on top."

## 07 — Cloud Security (COMPLEMENTARY)

CSPM / CNAPP — cloud posture, workload protection & entitlements.

**Tools in this category:** Wiz (now part of Google Cloud), Orca Security, Palo Alto Prisma Cloud, Microsoft Defender for Cloud

**What it does:** Scans for cloud misconfigurations, protects workloads, and maps cloud entitlements (CIEM). Cloud-infrastructure-centric — these tools start from the cloud side in, not from the on-prem directory.

**How Saporo differs:** These tools are strong on cloud workload and entitlement risk. Saporo's depth is hybrid: the identity paths from on-prem AD into cloud that cloud-native tools don't model, since they don't start from the directory side. Worth knowing: Google closed its acquisition of Wiz on March 11, 2026 — Wiz kept its own brand, joined Google Cloud as a unit, and Google has publicly committed to continued multi-cloud support (AWS, Azure, Oracle Cloud), so don't assume a Wiz prospect is locked into GCP.

> Talk track (internal — never quote): "Wiz, Orca, and Prisma Cloud are strong on cloud workload and entitlement risk — that's real, and complementary. Saporo's depth is the hybrid attack path: how an on-prem AD account chains through to a cloud admin role. Different terrain, same mature stack."

## 08 — Vuln / Exposure Mgmt (COMPLEMENTARY)

Vulnerability Management / Exposure Management.

**Tools in this category:** Tenable (Nessus / Tenable One), Rapid7, Qualys VMDR, Microsoft Security Exposure Management, plus validation tools Pentera and Horizon3.ai

**What it does:** Scans for and prioritizes software vulnerabilities (CVEs) and infrastructure misconfigurations across endpoints, cloud workloads, and containers — nearly always already in the environment. Some (MSEM, Pentera, Horizon3.ai) extend into attack-path or exploit-validation territory, the closest overlap with Saporo in this category.

**How Saporo differs:** Vuln management answers what's patchable — CVEs and patch exposure. Saporo answers what identity misconfigurations create exploitable paths, the layer after a credential is stolen, regardless of patch state. MSEM is the closest overlap (Microsoft's own attack-path/CTEM graph), but it's Microsoft-estate-only and typically E5-gated; Saporo is vendor-neutral with real depth outside Microsoft (AD, AWS, Okta, ADCS). Validation tools (Pentera, Horizon3.ai) prove a specific path is exploitable by running it; Saporo maps all identity paths and the chokepoints that collapse the most — mature programs run both.

> Talk track (internal — never quote): "Tenable and Rapid7 are almost certainly already there — they focus on CVEs and patch exposure. Saporo focuses on identity misconfigurations and attack paths, the layer after a credential is stolen. Completely complementary."

## 09 — GRC / Compliance (COMPLEMENTARY)

Governance, Risk & Compliance — controls, evidence & audit workflow.

**Tools in this category:** Vanta, Drata, OneTrust, RSA Archer, ServiceNow GRC

**What it does:** Tracks compliance evidence, controls, policies, and audit workflows against frameworks like SOC 2, ISO 27001, HIPAA, and GDPR — from lightweight continuous-monitoring automation aimed at startups and mid-market (Vanta, Drata) to heavier enterprise risk and policy suites (RSA Archer, ServiceNow GRC, OneTrust).

**How Saporo differs:** These platforms manage the compliance program — policies, evidence, audit trail. Saporo is a source of the underlying technical evidence for that program: findings map to 700+ controls across CIS, ISO 27001, MITRE ATT&CK, NIST CSF, NIS2, PCI DSS, and more. Saporo doesn't replace the GRC platform, it feeds it.

> Talk track (internal — never quote): "Vanta, Drata, and Archer manage the compliance program itself — policies, evidence, audit trail. Saporo is a source of the technical evidence behind it — our findings map straight to CIS, ISO 27001, and MITRE ATT&CK, so they drop into whatever they're already using to track the audit."

## 10 — Network / Zero Trust (COMPLEMENTARY)

NGFW / SASE / ZTNA — network-layer segmentation & access.

**Tools in this category:** Zscaler, Palo Alto Networks (NGFW / Prisma Access / SASE), Fortinet, Cloudflare

**What it does:** Enforces zero trust at the network layer — proxying connections, applying policy, and segmenting to prevent lateral movement (ZTNA/SASE), or protecting the perimeter (NGFW).

**How Saporo differs:** Network zero-trust controls stop lateral movement at the wire. Saporo enforces zero trust at the identity layer — closing paths that exist in the identity graph no matter what the network allows through. An attacker who's already authenticated as a legitimate (or compromised) identity doesn't care about network segmentation the same way.

> Talk track (internal — never quote): "Zscaler and Palo Alto enforce zero trust at the network layer. Saporo enforces it at the identity layer — closing paths that exist in your identity graph no matter what the network allows. If zero trust is the initiative, identity is usually the gap."
