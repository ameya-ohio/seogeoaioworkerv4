# Spoke Brief: Kerberos Attack Techniques in Healthcare Active Directory: Kerberoasting, Golden Tickets, and Delegation Abuse

> Produced by the Topic & Cluster Generator. This brief is a first-class input
> to the Strategist: its H2 outline (phrased in sub-query vocabulary), answer-first
> passage requirements, evidence requirements, and length band take precedence over
> the SERP-median word-count rule (decision D31).

- **Theme:** Kerberos and credential theft attack techniques
- **Primary query target (D32):** kerberos attack mitigation (alternates: kerberos attacks healthcare, kerberoasting defense) — a natural query, to be used naturally; never contort a sentence to fit it
- **Primary persona:** CISO / security architect responsible for a hybrid on-prem AD + Azure identity estate in a healthcare organization
- **Buying stage:** problem-aware to solution-aware — understands Kerberos-based credential theft is a named risk in audits/incident reports, evaluating whether existing AD tooling can detect and prioritize these paths before exploitation
- **Priority score:** 30/45
- **Length band:** 1400–2000 words (Theme breadth is high — it spans four distinct attack techniques (Kerberoasting, golden ticket, pass-the-hash/pass-the-ticket, delegation abuse) plus a detection/mitigation comparison across on-prem and Azure, and a Credential Guard product comparison. Each requires passage-level depth (mechanism, detection signal, mitigation) rather than a single shared explanation, pushing above the 800–1,200 floor toward the top of the default band.)
- **Schema:** Article

## Representative sub-queries (shape passages, never titles or keywords)

- Kerberos attack mitigation healthcare organizations
- Active Directory Kerberos attack mitigation techniques
- pass-the-hash vs pass-the-ticket attack hospital environment
- Kerberos delegation attacks healthcare networks
- credential theft detection Active Directory Azure
- Kerberoasting attack prevention healthcare Active Directory
- pass-the-hash mitigation on-prem AD environment
- credential guard vs. Defender Credential Guard hospital deployment

## Required passages (D33 — coverage contract, NOT the outline)

Each item below must be answered somewhere in the article as an extractable
passage. The Strategist owns the narrative structure and the (declarative)
headings — these are requirements to satisfy, not sections to transcribe.

- How does Kerberoasting work and why is it hard to detect before credentials are cracked offline?
- What is a golden ticket attack and why is it so hard to remediate once it happens?
- Pass-the-hash vs pass-the-ticket: what's the difference in a hospital environment?
- What Kerberos delegation attacks look like on a healthcare network
- Active Directory Kerberos attack mitigation techniques that hold up in hybrid healthcare environments
- How credential theft detection differs between on-prem Active Directory and Azure AD
- Kerberoasting attack prevention in healthcare Active Directory: what actually reduces exposure
- Pass-the-hash mitigation in an on-prem AD environment: patching vs. path-based defense
- Credential Guard vs. Defender Credential Guard: what a hospital deployment needs to know

**Answer-first requirement:** the first 40–60 words of each required passage
must answer its question on their own — no "as mentioned above". Each passage
must survive extraction on its own.

## Evidence required

**Proprietary (from company knowledge):**

- Saporo's graph-powered attack path intelligence connects identities, permissions, and misconfigurations to reveal Kerberos-exploitable paths (e.g., kerberoastable service accounts with excessive privilege) from an adversary's perspective, prioritized by reachability, propagation potential, and impact to critical assets — per https://www.saporo.io/product/overview
- Saporo's contextual risk scoring is validated against ANSSI, CIS, ISO, and MITRE frameworks, which can be applied to frame Kerberoasting and golden ticket paths against MITRE ATT&CK techniques (T1558.001/.003) — per https://www.saporo.io/about/company
- Saporo covers unified visibility across hybrid environments including on-prem Active Directory and Azure, positioning it to correlate on-prem Kerberos exposure with Azure AD hybrid identity risk in one graph — per https://www.saporo.io/product/overview

**External statistics (source URLs required — never fabricate):**

- Cite a recent industry or vendor statistic on the prevalence of Kerberoasting or golden ticket attacks in reported healthcare breaches or incident response engagements (e.g., from an IR vendor annual threat report).
- Cite the average or typical time attackers spend performing offline hash-cracking on Kerberoasted service ticket hashes relative to password complexity, from a credible security research source.
- Cite data on the proportion of healthcare organizations still relying on legacy on-prem Active Directory alongside Azure AD/Entra ID, to substantiate why hybrid Kerberos exposure is a distinct healthcare problem.
- Cite Microsoft's own guidance or documented default behavior differences between Credential Guard (Windows Defender Credential Guard) and legacy credential caching, to accurately ground the Credential Guard comparison section.

**Quotable stat candidate:** NOT AVAILABLE — no proprietary Saporo statistic on Kerberos attack path prevalence, kerberoastable account counts, or golden ticket exposure was found in company context; do not fabricate one. If Saporo product telemetry (e.g., 'X% of hybrid AD environments scanned had at least one kerberoastable Tier 0 service account') becomes available, it should be sourced here.

## Differentiation angle

Most Kerberos attack content treats Kerberoasting, golden tickets, pass-the-hash/pass-the-ticket, and delegation abuse as isolated techniques to detect or patch individually. This piece frames them as connected steps on an attack path graph — a kerberoastable service account is only dangerous because of what it's delegated to reach, and a golden ticket is catastrophic because of what Tier 0 assets it unlocks. The differentiation is prioritizing these techniques by reachability and blast radius to critical assets in a hybrid on-prem AD + Azure healthcare estate, rather than treating each technique as a flat checklist item — directly reflecting Saporo's attack-path-first mechanism versus point-detection tools.

## Internal links

- Hub: Preemptive Identity Security: A Guide to Closing Identity Attack Paths Before They're Exploited
- Sibling spoke: Privileged access management for AD/hybrid environments
- Sibling spoke: Hybrid AD/Azure identity attack surface in healthcare
