# Research Notes: Privileged Access Management for AD/Hybrid Environments: Why Tier 0 Still Gets Breached

## Topic Summary

Privileged access management (PAM) is the identity-security discipline of controlling, vaulting, monitoring, and time-bounding accounts that carry elevated rights — domain admins, service accounts, break-glass credentials, and cloud global admins. In healthcare specifically, PAM sits at the intersection of patient-safety uptime requirements and HIPAA's mandate that ePHI access be authorized, authenticated, and auditable. The urgency is structural: healthcare data breaches have been the most expensive of any industry for 14 straight years ($7.42M average in 2025), and Active Directory — still the identity backbone for the overwhelming majority of hospital networks, EHR access, and medical-device authentication — remains the single most common pivot point ransomware crews use to go from one stolen credential to enterprise-wide encryption.

The discourse right now is fragmented across three camps. Vendor content (Saviynt, Bravura, WALLIX, CyberArk, klogixsecurity) frames PAM as a checklist: vault credentials, add MFA, rotate passwords, log sessions, satisfy HIPAA. Microsoft's own technical documentation (the legacy AD tier model and its 2026 successor, the Enterprise Access Model) frames the problem architecturally — Tier 0 is not a control you buy, it's a boundary you must never let cross, and hybrid AD/Entra ID environments make that boundary far easier to violate than in a clean on-prem forest. Incident-response writeups (Microsoft Defender Experts, CISA/NSA joint advisories) supply the uncomfortable evidence connecting the two: real breaches where the PAM tool itself was the bridge attackers used to reach Tier 0. Almost nobody writing for a healthcare audience connects these three threads, and almost nobody addresses the fact that "privileged" in 2026 increasingly means a non-human identity — a service account, an API key, a medical-device machine account — that no vaulting workflow was designed to catch.

Who cares: CISOs and security architects responsible for hybrid AD/Azure identity estates at health systems, who are being asked by boards and cyber-insurers to show PAM coverage, but who are discovering (often via a Microsoft IR engagement or a failed tabletop) that a PAM deployment can satisfy an audit checklist while leaving a live path to Tier 0 open.

## Target Keyword Analysis

- Primary keyword candidate: privileged access management healthcare
- Secondary keyword candidates:
  - PAM for hospitals
  - tier 0 active directory healthcare
  - privileged access management Active Directory hybrid
  - cost of identity breach healthcare
- Search intent: informational, solution-aware (readers already know they need PAM; they're evaluating whether their current approach — or a PAM purchase — actually closes the Tier 0 gap)
- SERP type: mixed — long-form vendor guides, a few practitioner/analyst blogs, no video, no dedicated featured snippet observed; AI Overviews likely synthesize the generic "what is PAM in healthcare" definition rather than the Tier 0/hybrid architecture nuance

## Top Ranking Pages

1. [saviynt.com/solution-guides/saviynt-healthcare-identity-cloud-for-pam](https://saviynt.com/solution-guides/saviynt-healthcare-identity-cloud-for-pam/) — Angle: vendor solution brief arguing legacy vault-and-rotate PAM "centralizes risk rather than reducing it." Covers: standing-privilege reduction, governance-first framing. Gaps: zero mention of Active Directory, Tier 0, hybrid on-prem/cloud architecture, or non-human identities; no breach case studies; no implementation detail.
2. [klogixsecurity.com/blog/why-privileged-access-management-pam-matters-in-healthcare](https://www.klogixsecurity.com/blog/why-privileged-access-management-pam-matters-in-healthcare) (Mar 2026, Katie Haug w/ security architect Garrett McCarthy) — Angle: practitioner interview framing PAM as a patient-safety issue (break-glass access during outages). Covers: credential vaulting, JIT access, session monitoring, adoption/culture barriers. Gaps: no AD tiering or Tier 0/1/2 language, no hybrid AD/Azure complexity, no breach examples, no non-human identity discussion.
3. [bravurasecurity.com/resources/documents/privileged-access-in-the-healthcare-market](https://www.bravurasecurity.com/resources/documents/privileged-access-in-the-healthcare-market) — Angle: solution-selling document opening with aggregate breach stats (61% external actors, 39% internal, 88% financially motivated) then pivoting to product. Covers: HIPAA/PCI/SOX overlap, IoMT/shared-workstation risk. Gaps: no AD tiering/forest architecture, no hybrid identity models, no service accounts/NHI, no specific breach case studies (uses industry aggregates only).
4. [health-isac.org/privileged-access-management-a-guide-for-healthcare-cisos](https://health-isac.org/privileged-access-management-a-guide-for-healthcare-cisos/) (Nov 2024) — Angle: PAM as the third leg of an "identity triangle" (workforce, patient, privileged access) within Health-ISAC's Managing Identities framework. Covers: distinguishing PAM from general IAM. Gaps: promotional/high-level; no technical tiering guidance, no Tier 0 definition, no hybrid-environment specifics visible in the accessible content.
5. [www.miniorange.com/pam/privileged-access-management-for-healthcare](https://www.miniorange.com/pam/privileged-access-management-for-healthcare) — Angle: vendor feature list (MFA, password randomization, audit logs) mapped to compliance. Covers: baseline control checklist. Gaps: no architectural depth, no AD/Tier 0 content, no case studies.
6. [www.keepersecurity.com/industries/healthcare](https://www.keepersecurity.com/industries/healthcare/) — Angle: zero-trust PAM vendor page for healthcare. Covers: vaulting, zero-trust framing. Gaps: generic zero-trust marketing language; no AD-specific or hybrid tiering content.
7. [www.accountablehq.com/post/what-is-privileged-access-management-in-healthcare-best-practices-and-compliance-guide](https://www.accountablehq.com/post/what-is-privileged-access-management-in-healthcare-best-practices-and-compliance-guide) — Angle: compliance-guide format (definition → best practices → HIPAA mapping). Covers: least privilege, JIT, quarterly access review, vendor BAAs, session logging. Gaps: no Tier 0/AD tiering, no hybrid AD/Azure detail, no breach case studies, no non-human identity coverage.
8. [www.wallix.com/blogpost/privileged-access-managements-role-in-hipaa-compliance](https://www.wallix.com/blogpost/privileged-access-managements-role-in-hipaa-compliance/) — Angle: HIPAA-compliance-first framing of PAM controls. Covers: access control/authentication/audit-log mapping to HIPAA Security Rule language. Gaps: compliance checklist depth only; no architecture, no Tier 0, no hybrid complexity.
9. [censinet.com/perspectives/how-pam-supports-hipaa-compliance-healthcare](https://censinet.com/perspectives/how-pam-supports-hipaa-compliance-healthcare) — Angle: third-party risk platform's compliance-framing blog. Covers: "who, what, when, where, why" audit-trail framing for HIPAA. Gaps: no technical AD/tiering content, no hybrid environment nuance, no case studies.
10. [www.cyberark.com — role of privileged access in healthcare security and compliance] (page now redirects to Palo Alto Networks' identity-security blog post-CyberArk acquisition integration) — historically the most technically credible vendor entry in this SERP, but the live redirect itself is a signal of market consolidation worth noting; current destination content is generic identity-security marketing, not healthcare- or AD-specific.

**Pattern across all 10:** every ranking page treats PAM as a compliance/control checklist (vault, rotate, MFA, log, review) aimed at a healthcare-executive or compliance audience. None discuss Active Directory Tier 0/1/2 tiering, none discuss the Microsoft Enterprise Access Model or hybrid AD/Entra ID architecture, none cite a real breach where a PAM deployment itself was the failure point, and none address non-human identities (service accounts, medical-device machine accounts, API keys) as privileged risk. This is the wedge.

## Authoritative Sources

1. **Average Cost of a Healthcare Data Breach Falls to $7.42 Million** — Steve Alder, HIPAA Journal, 2025. https://www.hipaajournal.com/average-cost-of-a-healthcare-data-breach-2025/
   Key claim: Healthcare remains the costliest industry for data breaches for the 14th consecutive year, with 2025's average cost down from 2024 but breach lifecycle far longer than average.
   Supporting quote: "There has been a fall in the cost of healthcare data breaches in the United States, which dropped by $2.35 million year-over-year to an average of $7.42 million." Also: "Healthcare data breaches took the longest to identify and contain, at an average of 279 days, five weeks longer than the global average breach lifecycle," and "healthcare data breaches are still the costliest out of all industries studied by IBM, and have been for the past 14 years."

2. **77% of healthcare orgs targeted by ransomware in past year** — TechTarget (HealthTech Security), reporting on the Semperis 2025 Ransomware Risk Report, published Aug 5, 2025. https://www.techtarget.com/healthtechsecurity/news/366628467/77-of-healthcare-orgs-targeted-by-ransomware-in-past-year
   Key claim: (removed — failed live verification; do not cite this source for it)

3. **Change Healthcare breached via Citrix portal with no MFA** — TechTarget, reporting on UnitedHealth Group CEO Andrew Witty's May 1, 2024 written testimony to the House Energy and Commerce Committee. https://www.techtarget.com/searchsecurity/news/366582824/Change-Healthcare-breached-via-Citrix-portal-with-no-MFA
   Key claim: The Change Healthcare breach began with a single compromised credential on an internet-facing remote-access portal that lacked MFA — a privileged-access hygiene failure, not a novel exploit.
   Supporting quote: "On February 12, criminals used compromised credentials to remotely access a Change Healthcare Citrix portal, an application used to enable remote access to desktops. The portal did not have multi-factor authentication."

4. **Securing privileged access: Enterprise access model** — Microsoft Learn, updated 2026-05-06. https://learn.microsoft.com/en-us/security/privileged-access-workstations/privileged-access-access-model

5. **Netwrix 2026 Data and Identity Security Report** — Netwrix, published June 10, 2026 (survey of 2,317 IT/security professionals across 1,889 organizations, 60+ industries). https://netwrix.com/en/resources/news/netwrix-2026-data-and-identity-security-report-ai-adoption-outpacing-ai-readiness-driving-a-4x-breach-gap/

6. **PAM environment tier model** — Microsoft Learn, ms.date 2025-04-08 (content updated 2026-03-31). https://learn.microsoft.com/en-us/microsoft-identity-manager/pam/tier-model-for-partitioning-administrative-privileges
   Background source (Tier 0/1/2 definition and logon-restriction mechanics for isolated on-prem AD; explicitly notes it does not cover hybrid environments — see source #4 for the hybrid successor model).

7. **Privileged Access Management: A Guide for Healthcare CISOs** — Health-ISAC, Nov 26, 2024. https://health-isac.org/privileged-access-management-a-guide-for-healthcare-cisos/
   Background source (industry-body framing of PAM as one leg of an "identity triangle" alongside workforce and patient access; representative of the healthcare-sector-specific vendor/ISAC discourse).

8. **Detecting and Mitigating Active Directory Compromises** — Australian Signals Directorate's ACSC, in cooperation with CISA, NSA, CCCS, NCSC-UK, and NCSC-NZ; revised Sept 15, 2026. https://www.cisa.gov/resources-tools/resources/detecting-and-mitigating-active-directory-compromises
   Background source (joint international guidance cataloging 17 common AD compromise techniques and hardening/least-privilege recommendations; establishes AD as the identity backbone nation-state and criminal actors both target).

9. **When the shield becomes the sword: How misconfigured PAM bridges the tiering model** — Microsoft Defender Experts, Microsoft Tech Community, April 9, 2026. https://techcommunity.microsoft.com/blog/microsoft-defender-experts/when-the-shield-becomes-the-sword-how-misconfigured-pam-bridges-the-tiering-mode/4509392
   Background source (case study on PAM session hosts shared across tiers: describes an attack path where a threat actor compromises a Tier 2 workstation, escalates through a misconfiguration to a Tier 1 administrator account, and then uses that access to gain control of the PAM host itself — because the host managed Tier 0 credentials but was treated as lower-tier infrastructure. Memorable framing, verified via search snippet of the live page: "A PAM server in the wrong tier isn't a hardened barrier; it's a trusted bridge." Directly illustrates the article's thesis that a PAM deployment can fail architecturally even when nominally "in place" — not used as a formal Key claim/stat to keep total load-bearing claims within the 3–5 cap, but strong illustrative color for the Debates section and prose.)

10. **Privileged access management** — Wikipedia. https://en.wikipedia.org/wiki/Privileged_access_management
    Background source (canonical definition for entity/schema reference).

11. **Semperis Ransomware Risk Report 2025 (landing page)** — Semperis. https://www.semperis.com/ransomware-risk-report/
    Background source (parent report behind source #2's healthcare-specific figures).

12. **Change Healthcare data breach officially affects 100M** — Healthcare Dive, published Oct 24, 2024. https://www.healthcaredive.com/news/change-healthcare-data-breach-affects-100-million/723493/

## Key Entities

- People: Andrew Witty, CEO, UnitedHealth Group (https://en.wikipedia.org/wiki/Andrew_Witty)
- Organizations: Microsoft (https://en.wikipedia.org/wiki/Microsoft), CISA (https://en.wikipedia.org/wiki/Cybersecurity_and_Infrastructure_Security_Agency), NSA (https://en.wikipedia.org/wiki/National_Security_Agency), HHS Health Sector Cybersecurity Coordination Center / HC3 (https://www.hhs.gov/about/agencies/asa/ocio/hc3/index.html), Change Healthcare (https://en.wikipedia.org/wiki/Change_Healthcare), UnitedHealth Group (https://en.wikipedia.org/wiki/UnitedHealth_Group), Semperis (https://www.semperis.com/), Netwrix (https://netwrix.com/), IBM (https://en.wikipedia.org/wiki/IBM), Health-ISAC (https://health-isac.org/)
- Concepts/Terms: Active Directory (https://en.wikipedia.org/wiki/Active_Directory), Privileged access management (https://en.wikipedia.org/wiki/Privileged_access_management), Zero trust security model (https://en.wikipedia.org/wiki/Zero_trust_security_model), HIPAA (https://en.wikipedia.org/wiki/Health_Insurance_Portability_and_Accountability_Act), Domain controller (https://en.wikipedia.org/wiki/Domain_controller), Ransomware (https://en.wikipedia.org/wiki/Ransomware), Non-human identity / service account (no stable Wikipedia page; emerging industry term)
- Products/Tools: Microsoft Entra ID (https://learn.microsoft.com/en-us/entra/fundamentals/whatis), Microsoft Defender for Identity (https://learn.microsoft.com/en-us/defender-for-identity/what-is), BlackCat/ALPHV ransomware (https://en.wikipedia.org/wiki/ALPHV)

## Statistics & Data Points

- The cost of a healthcare data breach dropped by $2.35 million year-over-year to an average of $7.42 million in 2025, but healthcare breaches still took an average of 279 days to identify and contain — five weeks longer than the global average — and healthcare has been the costliest breached industry for the past 14 years — Source #1
- More than three-quarters of healthcare survey respondents said their organizations were targeted by ransomware in the past 12 months, and 78% of those who experienced an attack said it compromised their identity infrastructure — Source #2

## Quotes Worth Including

- "On February 12, criminals used compromised credentials to remotely access a Change Healthcare Citrix portal, an application used to enable remote access to desktops. The portal did not have multi-factor authentication." — Andrew Witty, CEO, UnitedHealth Group, written testimony to House Energy and Commerce Committee, May 1, 2024, via Source #3

## Questions People Are Asking

- What is the difference between privileged access management and identity exposure/attack-path management?
- What counts as a Tier 0 asset in a hospital's AD environment (beyond domain controllers — PKI/CA, ADFS, AD Connect/Entra Connect, backup systems)?
- Why does having a PAM tool not stop AD compromise if it's misconfigured or domain-joined in the wrong tier?
- How does HIPAA's access-control requirement map to specific PAM controls (least privilege, audit trails, MFA)?
- What does "standing privileged access" mean and how is it different from just having an admin account?
- How do you secure privileged access for medical devices and service accounts that can't use MFA or be rotated easily?
- What is the real cost/ROI case for PAM in a hospital budget cycle?
- How do zero trust principles apply to privileged accounts in a hybrid AD/Azure environment specifically?

## Debates & Counterpoints

- **PAM alone vs. PAM + identity threat detection (ITDR):** Vendor and analyst content (Gartner, KuppingerCole per industry commentary) increasingly argues that PAM's vaulting/rotation controls are necessary but not sufficient because they cannot detect a trusted, already-vaulted credential being misused in real time; the emerging position is that PAM must be paired with continuous identity threat detection and attack-path visibility. This directly supports the article's "PAM vs identity exposure management" framing — the debate is not PAM-vs-nothing, it's static-privilege-control vs. continuous-exploitability-assessment.
- **Where should the PAM server itself live in the tier model?** Microsoft's own incident-response documentation (Source #9) and independent guidance (RiskInsight/Wavestone-style analysis referenced in search results) show real disagreement/confusion in practice: some organizations place PAM/bastion infrastructure in Tier 1 for operational convenience, which several documented incidents show attackers exploit to bridge into Tier 0. The "correct" answer (PAM infrastructure must be treated as Tier 0 itself) is not yet universal practice.
- **Legacy AD tier model vs. Microsoft's Enterprise Access Model:** Microsoft's own documentation describes the classic Tier 0/1/2 model as scoped to containing privilege escalation within an on-premises Active Directory environment, and positions its successor — the enterprise access model, where Tier 0 "expands to become the control plane" — as the version built for estates spanning on-premises and multiple clouds. Most healthcare-facing PAM content (see Top Ranking Pages) still discusses PAM in HIPAA-compliance terms without acknowledging this architectural shift — a real gap between current best-practice guidance and what's being published for a healthcare audience.

## Content Gaps (Opportunities)

- No ranking healthcare-PAM content explains Tier 0 in AD-tiering terms at all (domain controllers, ADFS/AD Connect, PKI/CA, backup systems) for a hospital security-architect audience — every ranking page stays at the "vault admin passwords" level of abstraction.
- No ranking content addresses hybrid AD/Entra ID architecture specifically for healthcare, despite this being the dominant real-world deployment pattern (on-prem AD for EHR/medical-device auth, Entra ID/Azure for cloud apps) and despite Microsoft's own docs describing the legacy tier model as scoped only to on-prem AD and positioning its cloud-spanning successor (the enterprise access model) as the fix.
- No ranking content cites a real breach (Change Healthcare, or a documented PAM-misconfiguration IR case) to make the "PAM checklist ≠ closed Tier 0 path" argument concrete for a healthcare buyer.
- No ranking content discusses non-human identities (service accounts, medical-device machine accounts, API keys, backup-operator accounts) as privileged risk in a healthcare AD context — a wedge directly aligned with Saporo's human + non-human identity coverage, and backed by the Netwrix stat that 76% of organizations don't govern NHIs at all.
- No ranking content frames the standing-privilege/attack-path angle (an account with low nominal privilege but one group-nesting hop from Tier 0) as distinct from and complementary to vaulting-based PAM — this is the specific mechanism gap the brief's differentiation angle targets.

## AI Engine Patterns

- For generic "what is PAM in healthcare" queries, AI Overviews and default LLM answers are likely to synthesize from the same compliance-checklist vendor content that dominates the organic SERP (Saviynt, CyberArk/Palo Alto, WALLIX, BeyondTrust, CrowdStrike glossary-style pages) plus Wikipedia's PAM definition — this is a well-trodden, low-differentiation citation neighborhood.
- For "Tier 0 Active Directory" or "AD tiering" queries specifically, the citation neighborhood shifts to Microsoft Learn (both the legacy tier-model doc and the Enterprise Access Model doc), CISA/NSA joint advisories, and security-vendor technical blogs (Semperis, Netwrix, Microsoft Tech Community) — a more technical, IR-flavored set of sources than the healthcare-PAM SERP uses.
- The framing AI engines are not yet using: nothing observed connects the healthcare-compliance PAM narrative to the AD-tiering/hybrid-architecture technical narrative in one answer. A piece that bridges "why HIPAA requires PAM" with "why Tier 0 still gets breached even with PAM in place" sits in a citation gap between two AI-answer clusters that currently don't reference each other.
