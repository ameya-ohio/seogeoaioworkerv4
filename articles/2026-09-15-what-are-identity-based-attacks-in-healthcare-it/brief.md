# Spoke Brief: Hybrid AD/Azure Identity: Why Healthcare's Attack Surface Is Bigger Than You Think

> Produced by the Topic & Cluster Generator. This brief is a first-class input
> to the Strategist: its H2 outline (phrased in sub-query vocabulary), answer-first
> passage requirements, evidence requirements, and length band take precedence over
> the SERP-median word-count rule (decision D31).

- **Theme:** Hybrid AD/Azure identity attack surface in healthcare
- **Primary query target (D32):** identity-based attacks in healthcare (alternates: identity attack surface healthcare, hybrid AD Azure security) — a natural query, to be used naturally; never contort a sentence to fit it
- **Primary persona:** CISO / security architect at a hospital or health system running hybrid on-prem AD + Azure AD
- **Buying stage:** problem-aware to solution-aware
- **Priority score:** 36/45
- **Length band:** 1200–1800 words (Theme has high breadth (8 stable sub-queries plus two folded-in sections spanning definition, comparison, mechanism, and two specialized risk areas) and a buried gap status, requiring enough passage depth to fully displace the page currently covering this ground superficially — but the sub-query set doesn't warrant a 2,000+ word ultimate-guide treatment; each H2 should stand alone at answer-first depth rather than accumulate length.)
- **Schema:** Article

## Representative sub-queries (shape passages, never titles or keywords)

- what are identity-based attacks in healthcare IT
- identity-based attack prevention Active Directory Azure
- reduce identity compromise risk hybrid AD environment
- on-premises Active Directory security threats healthcare
- Azure AD attack surface hospital network
- identity attack risk management on-prem cloud
- how do attackers compromise Active Directory credentials
- Azure AD vs on-prem Active Directory security

## Required passages (D33 — coverage contract, NOT the outline)

Each item below must be answered somewhere in the article as an extractable
passage. The Strategist owns the narrative structure and the (declarative)
headings — these are requirements to satisfy, not sections to transcribe.

- What are identity-based attacks in healthcare IT?
- Why are hospitals still running on-prem Active Directory alongside Azure AD?
- How does a hybrid AD/Azure environment expand attack surface compared to pure cloud identity?
- What are the most common misconfigurations connecting on-prem AD to Azure AD in healthcare?
- How do attackers compromise Active Directory credentials?
- Azure AD vs on-prem Active Directory: which carries more security risk?
- What identity risk do medical devices and EHR systems introduce?
- What is non-human identity risk in a hospital environment?
- How do you reduce identity compromise risk in a hybrid AD environment?

**Answer-first requirement:** the first 40–60 words of each required passage
must answer its question on their own — no "as mentioned above". Each passage
must survive extraction on its own.

## Evidence required

**Proprietary (from company knowledge):**

- Saporo's graph-powered attack path model, applied to a hybrid AD/Azure AD environment, to illustrate how on-prem AD misconfigurations chain into Azure AD privilege escalation (per product/overview: 'connects identities, permissions, and misconfigurations into exploitable attack paths')
- Saporo's prioritization method — reachability, propagation potential, impact to critical assets — applied as the framework for triaging which hybrid AD/Azure misconfigurations to fix first
- Saporo's unified visibility claim (AD, Azure, AWS, GCP, M365, SaaS identities) used to explain why point solutions miss the on-prem-to-cloud identity bridge
- Saporo's human + non-human identity coverage, applied directly to the medical-device and EHR service-account use case

**External statistics (source URLs required — never fabricate):**

- Statistic on the percentage of healthcare organizations still running hybrid on-prem AD + Azure AD (vs. cloud-only identity) — needed to substantiate the 'why hospitals still run hybrid AD' section.
- Statistic or named incident on ransomware/breach cases in healthcare that originated from on-prem AD compromise and pivoted to cloud (Azure AD) resources — needed for the attack-path narrative.
- Data point on the volume or growth of connected medical devices (IoMT) per hospital and their typical identity/authentication posture (e.g., service accounts, no MFA) — needed for the medical-device section.
- Statistic on the average number of non-human identities (service accounts, API keys, device identities) relative to human identities in enterprise/healthcare environments — needed for the non-human identity section.
- Industry data on the average time-to-detect or dwell time for identity-based attacks in healthcare specifically — needed to frame urgency in the attacker-compromise section.

**Quotable stat candidate:** REQUIREMENT — not yet available: Saporo should generate a proprietary figure from its own attack-path graph analysis (e.g., 'the average number of exploitable attack paths connecting on-prem AD to Azure AD found per hybrid healthcare environment scanned' or 'the percentage of scanned healthcare identity environments where a non-human identity was found to be a chokepoint in a critical attack path'). This does not exist in current company context and must be sourced from real Saporo scan/customer data before publication — do not publish this section with a placeholder number.

## Differentiation angle

Most identity-security content treats on-prem AD and Azure AD as two separate hardening checklists — AD hygiene tips in one article, Azure AD conditional access tips in another. This piece instead names the seam between them as the actual exposure: it's not on-prem AD risk plus Azure AD risk, it's the misconfigured trust relationships, synced privileged accounts, and non-human identities that let an attacker walk from one to the other. It applies Saporo's attack-path/graph framing (reachability, propagation, impact) specifically to the hybrid healthcare estate, and extends it into two angles generic identity-security content rarely covers for this vertical: medical device/EHR identity exposure and non-human identity risk (service accounts tied to imaging systems, integration engines, and device authentication) — both buried or absent in typical hospital IT security guides.

## Internal links

- Hub: Preemptive Identity Security: A Guide to Closing Identity Attack Paths Before They're Exploited
- Sibling spoke: Privileged access management for AD/hybrid environments
- Sibling spoke: Kerberos and credential theft attack techniques
