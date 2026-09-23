# Strategy & Outline: Kerberos Attack Mitigation in Healthcare: One Attack Path, Not Four Checklists

## Angle
> Unlike the current top 10, which treat Kerberoasting, Golden Ticket forgery, pass-the-hash/pass-the-ticket, and delegation abuse as four separate glossary entries to patch independently, this article chains them into a single attack-path narrative for hybrid on-prem AD + Entra ID healthcare environments, anchored in the operational reality that as of July 2026 Microsoft has finished retiring RC4 by default and hospitals now have to sequence remediation for legacy clinical systems that quietly depended on it.

**Why this angle:** Research found no page that connects all four techniques as reachability/blast-radius steps on one path (the Ascension and CISA HPH incidents both show a low-value account leading to domain admin, exactly this pattern), and no healthcare-specific page addresses the post-July-2026 RC4-enforcement reality at all. Both are confirmed content gaps and both map directly to Saporo's actual product mechanism (attack-path graph, reachability/propagation/impact prioritization), so the angle is defensible rather than just novel for novelty's sake.

## Thesis
The four Kerberos attack techniques hospitals worry about (Kerberoasting, Golden Ticket forgery, pass-the-hash/pass-the-ticket, and delegation abuse) are not independent risks to clear off a checklist; they are sequential steps on a single attack path, and a hospital's real exposure is set by what each compromised credential is positioned to reach, not by the credential alone. Now that Microsoft's 2026 RC4 retirement has closed off the easiest technical excuse, path-level prioritization, not per-technique patching, is what actually shrinks a hospital's dangerous exposure.

## Keywords
- Primary: kerberos attack mitigation
- Secondary: kerberoasting healthcare, golden ticket attack mitigation, pass-the-hash vs pass-the-ticket, kerberos delegation attacks, credential guard vs defender credential guard, RC4 kerberos deprecation healthcare

Per research: no single top-10 page targets all four technique keywords plus the 2026 RC4-retirement angle together, and PAA/AI-answer patterns are shifting toward "what breaks when RC4 is disabled," a query cluster none of the current top 10 addresses. This is a competitor-weakness match, not just a volume play.

## Search Intent
Informational, problem-aware to solution-aware — the reader (CISO / security architect) already knows Kerberos credential theft is a named audit or incident-report risk; they're evaluating whether their current AD tooling can detect and prioritize these paths before exploitation, not looking for a product page or a generic definition. Structure: comprehensive-guide shape with passage-level depth per technique, not a single glossary definition and not a comparison-shopping structure.

## Target Word Count
1,900 words — set by the spoke brief's 1,400–2,000 band (D31 overrides SERP-median matching). The brief's own reasoning applies directly here: this topic spans four attack techniques, a hybrid on-prem-AD-vs-Entra-ID detection contrast, and a Credential Guard naming comparison, each needing mechanism + detection signal + mitigation rather than a shared explanation. That pushes the target to the top of the band, not the middle. No padding: each of the required passages gets its own compact section rather than stretching any one technique into an encyclopedic entry.

## GEO/AIO Angle
- Answer-first sentence under every H2, each one written to independently satisfy one of the brief's nine required passages (extractable on its own, no "as mentioned above").
- Definition-style sentences (under 25 words, bolded term) for Kerberoasting, Golden Ticket, pass-the-hash, pass-the-ticket, the three delegation types, and Credential Guard — these are the terms AI engines need to ground answers, and none of the top 10 defines all of them in one place.
- A comparison table for pass-the-hash vs. pass-the-ticket and a second for Credential Guard vs. Defender Credential Guard — AI engines extract "X vs Y" tables cleanly, and this exact comparison is a confirmed content gap (research notes: "no content clearly distinguishes Credential Guard from Windows Defender Credential Guard").
- Key Takeaways block (speakable) stating the attack-path thesis in plain, standalone sentences near the top.
- Quotable, standalone factual sentences (see below) placed at the end of each technique section, not clustered in the intro.

## Target Entities (for `mentions` array)
- Kerberos (protocol) — https://en.wikipedia.org/wiki/Kerberos_(protocol)
- Active Directory — https://en.wikipedia.org/wiki/Active_Directory
- Pass the hash — https://en.wikipedia.org/wiki/Pass_the_hash
- RC4 — https://en.wikipedia.org/wiki/RC4
- Advanced Encryption Standard (AES) — https://en.wikipedia.org/wiki/Advanced_Encryption_Standard
- Credential Guard — https://en.wikipedia.org/wiki/Credential_Guard
- Mimikatz — https://en.wikipedia.org/wiki/Mimikatz
- MITRE ATT&CK — https://en.wikipedia.org/wiki/MITRE_ATT%26CK
- Cybersecurity and Infrastructure Security Agency (CISA) — https://en.wikipedia.org/wiki/Cybersecurity_and_Infrastructure_Security_Agency
- Microsoft — https://en.wikipedia.org/wiki/Microsoft
- Ascension (healthcare system) — https://en.wikipedia.org/wiki/Ascension_(healthcare_system)
- U.S. Department of Health and Human Services Office for Civil Rights — https://en.wikipedia.org/wiki/Office_for_Civil_Rights
- Ron Wyden — https://en.wikipedia.org/wiki/Ron_Wyden
- Microsoft Entra ID — https://www.microsoft.com/en-us/security/business/identity-access/microsoft-entra-id (no standalone Wikipedia page under current name; official product URL used)
- Group Managed Service Accounts (gMSA) — https://learn.microsoft.com/en-us/windows-server/identity/ad-ds/manage/group-managed-service-accounts/group-managed-service-accounts-overview (Microsoft feature, no Wikipedia page)
- Saporo — https://www.saporo.io/ (self-reference for the proprietary attack-path framing)

Mentioned in body by name but intentionally excluded from the formal `mentions` array (no canonical page to link, per schema-spec guidance not to guess): KRBTGT account, Sean Metcalf / Trimarc Security, Black Basta, Rubeus, Impacket, CVE-2026-20833.

## FAQ Candidates
1. Why do you have to reset the KRBTGT password twice after a Golden Ticket attack, not just once?
2. Is it safe to re-enable RC4 for a legacy clinical device that can't support AES, and what does that do to HIPAA compliance?
3. Are Group Managed Service Accounts (gMSA) practical for vendor-managed EHR, PACS, or lab-middleware systems that don't support them?
4. Which delegation type, unconstrained, constrained, or resource-based constrained, should a hospital security team worry about most?
5. How do you find kerberoastable accounts in your own Active Directory before an attacker does?
6. Do hospitals need to deploy both Credential Guard and Windows Defender Credential Guard?

Each adds information the body sections don't already spell out in full (the body explains what Golden Ticket/delegation/Credential Guard *are* and how to mitigate them generally; the FAQ answers the sharper operational follow-up a reader would ask next).

## Internal Link Opportunities
- Hub: "Preemptive Identity Security: A Guide to Closing Identity Attack Paths Before They're Exploited" — link from the framing section (H2: "Four Kerberos attacks, one attack path") as the broader category this topic sits inside.
- Sibling spoke: "Privileged access management for AD/hybrid environments" — link from the mitigation section (H2 on hybrid on-prem AD + Entra ID mitigation).
- Sibling spoke: "Hybrid AD/Azure identity attack surface in healthcare" — link from the on-prem-vs-Entra-ID detection passage.
- Placeholder: internal link to Saporo's product overview page (https://www.saporo.io/product/overview) from the mitigation section, anchored on "reachability and propagation" language, not a bare product plug.

## External Citations to Use
1. Microsoft Community Hub — "Kerberos and the End of RC4: Protocol Hardening and Preparing for CVE-2026-20833" (Source #1) — used in: RC4/enforcement-timeline framing woven into the Kerberoasting section and the hybrid-mitigation section; supports the "RC4 is off by default since July 2026" claim and the "strongly discouraged" quote.
2. CISA Advisory AA23-349A (Source #2) — used in: Kerberoasting section, as the concrete real-world healthcare proof (a CISA-run risk assessment at a healthcare organization used Kerberoasting via Impacket's GetUserSPNs to crack a domain-admin service account).
3. HIPAA Journal — "Average Cost of a Healthcare Data Breach Falls to $7.42 Million" (Source #3) — used in: intro/framing, to establish why Kerberos-based lateral movement is uniquely costly in healthcare (279-day identify-and-contain average, highest breach cost of any industry for 14 years).
4. Microsoft Learn — "Credential Guard overview" (Source #4) — used in: Credential Guard vs. Defender Credential Guard section, as the primary source for the naming history and current default behavior.
5. Office of Senator Ron Wyden — FTC investigation request (Source #5) — used in: RC4/hybrid-mitigation section, as context for why Microsoft's default changed (regulatory pressure following Ascension).
6. Microsoft Learn — "Detect and Remediate RC4 Usage in Kerberos" (Source #6) — used in: hybrid mitigation section, for the Event ID 4768/4769, `msDS-SupportedEncryptionTypes`, and `Get-KerbEncryptionUsage.ps1` detection methodology.
7. MITRE ATT&CK T1558.003 (Source #7) — used in: Kerberoasting section, for the canonical mitigation IDs (M1041, M1027, M1026), framed as the neutral technical baseline the article builds past.
8. NCC Group — "Defending Your Directory" (Source #8) — used in: Kerberoasting section, for the RC4-HMAC (0x17) encryption-type detection nuance versus noisy raw Event ID 4769 counts.
9. Trimarc Security / Sean Metcalf — Kerberos Unconstrained Delegation (Source #9) — used in: delegation-abuse section, for the mechanics of how one compromised server cascades to full domain compromise.
10. Semperis — "How to Defend Against Golden Ticket Attacks" (Source #10) — used in: Golden Ticket section, for the dual KRBTGT password-reset procedure.
11. HIPAA Journal — "Ascension Ransomware Attack Affects 5.6 Million Patients" (Source #11) — used in: intro, for the confirmed breach-scope figure (5,599,699 records, per HHS OCR update).

## Evidence Gaps — Do Not Fabricate
Research flagged three statistics the brief asks for that do not have a citable source. Handle each as follows, per the fact-check rules in `standards/quality-bar.md`:
- **Prevalence of Kerberoasting/Golden Ticket in reported healthcare breaches or IR engagements:** no reliable figure found. Do not invent a percentage. Substitute the two concrete, sourced incidents (Ascension, CISA AA23-349A) as the evidentiary backbone instead of a prevalence stat — they carry the argument better than an unsourced number would.
- **Average offline-cracking time for a Kerberoasted hash relative to password complexity:** research surfaced only a hashcat-forum-sourced "~100x slower" claim for AES vs. RC4, explicitly flagged as not citable for a load-bearing claim. State the point qualitatively ("AES-encrypted tickets are dramatically more expensive to crack offline than RC4 tickets were") without attributing a specific multiplier to an uncitable source.
- **Proportion of healthcare organizations still running hybrid on-prem AD + Entra ID:** no reliable figure found. Do not invent a percentage. State the hybrid-identity reality as an observed operational pattern (most health systems run AD federated or synced to Entra ID) rather than as a cited statistic.

## Quotable Sound Bites
- A sentence stating plainly that a kerberoastable service account is dangerous only because of what it is delegated to reach, not because of the account itself.
- A sentence explaining that KRBTGT gets reset twice, not once, because a single reset still leaves an attacker holding one valid forged ticket.
- A sentence contrasting pass-the-hash (replaying a stolen password hash to get a new ticket) with pass-the-ticket (replaying an already-issued ticket directly), stated as a clean two-clause distinction.
- A sentence stating that as of July 2026, Active Directory domain controllers no longer issue RC4 tickets by default, and that re-enabling RC4 is a HIPAA technical-safeguards decision, not just a compatibility toggle.
- A sentence stating that raw Event ID 4769 volume is not a detection strategy by itself; the RC4 ticket-encryption flag combined with per-account request anomalies is the actual signal.

## Hook Strategy
Specific scene, feeding directly into the house arc's concede-then-pivot. Open on the concrete mechanism of the May 2024 Ascension attack: a contractor's malware-infected laptop, a domain-admin-privileged service account protected only by weak RC4-encrypted credentials, and Kerberoasting as the exact technique that turned initial access into full domain compromise. Concede that the standard hardening checklist (rotate SPNs, prefer AES, monitor Event ID 4769) is correct and necessary. Pivot: the checklist is what every top-ranking page already says, and it still didn't stop Ascension, because the checklist treats the account as the risk instead of asking what the account could reach.

## Closing / CTA
Deeper read: point the reader to the hub guide ("Preemptive Identity Security: A Guide to Closing Identity Attack Paths Before They're Exploited") and name Saporo's attack-path graph capability once, briefly, as the mechanism that answers the question the whole article has been building toward (what does this credential unlock). This fits a problem-aware-to-solution-aware informational read: the reader isn't ready for a demo CTA yet, but they are ready to keep reading in the direction the article just pointed, and the hub/spoke structure is exactly what the internal-link plan supports.

## Full Outline

### Intro (≈ 130 words)
Open on the Ascension attack mechanism (contractor laptop → Kerberoasting → weak RC4 service-account credential → domain compromise → 5,599,699 records exposed, per HHS OCR). Concede the standard checklist is correct. Pivot to the thesis: these four techniques are steps on one path, and post-July-2026 RC4 enforcement means hospitals can no longer treat "wait for Microsoft" as a mitigation strategy.

### Key Takeaways (5 bullets, speakable block)
- Kerberoasting, Golden Ticket forgery, pass-the-hash/pass-the-ticket, and delegation abuse chain together into one attack path; treating them as separate checklist items misses what actually made Ascension and the CISA healthcare RVA succeed.
- As of July 2026, Active Directory domain controllers no longer issue RC4 tickets by default under CVE-2026-20833; explicitly re-enabling RC4 is a documented HIPAA technical-safeguards exception, not a default-compatible setting.
- A kerberoastable service account is dangerous in proportion to what it's delegated to reach, not to the account's own privilege label.
- Golden Ticket attacks require resetting the KRBTGT password twice, because a single reset leaves one attacker-forged ticket still valid.
- Credential Guard and Windows Defender Credential Guard are the same feature under two branding eras, not two products a hospital needs to deploy separately.

### H2: Four Kerberos attacks add up to one attack path (≈ 130 words)
- Direct-answer opener: states the thesis plainly, that Kerberoasting, Golden Ticket, pass-the-hash/pass-the-ticket, and delegation abuse are sequential steps, not independent risks, illustrated by how Ascension and the CISA RVA both started with one low-value account and ended in domain compromise.
- Citations: CISA AA23-349A (#2), Ascension/HIPAA Journal (#11)
- Entities: Active Directory, Ascension, CISA
- Satisfies brief context: sets up required passages 5 and 6 without yet answering them in full.

### H2: Kerberoasting exploits a weak service-account password protected by legacy encryption (≈ 260 words)
- Direct-answer opener defines Kerberoasting (request a TGS ticket for any account with a Service Principal Name, take it offline, crack the password hash) and states plainly why it's hard to catch before the crack succeeds: the request itself is legitimate Kerberos traffic, indistinguishable from normal service authentication until the RC4 ticket-encryption flag and per-account request volume are examined together.
- Covers what actually reduces exposure: AES-only tickets, gMSA adoption for service accounts, and the NCC Group point that RC4-HMAC (0x17) flagging plus behavioral baselining beats raw Event ID 4769 counting.
- Citations: CISA AA23-349A (#2), MITRE ATT&CK T1558.003 (#7), NCC Group (#8), Microsoft RC4/CVE-2026-20833 (#1)
- Entities: Mimikatz (tooling context), RC4, AES, MITRE ATT&CK
- Satisfies brief required passages: "How does Kerberoasting work and why is it hard to detect" and "Kerberoasting attack prevention in healthcare Active Directory: what actually reduces exposure."

### H2: A golden ticket outlives a single password reset (≈ 210 words)
- Direct-answer opener defines a Golden Ticket attack (forging a Ticket-Granting Ticket after compromising the KRBTGT account, granting the attacker the ability to impersonate any user, indefinitely, without further authentication) and states directly why it's hard to remediate: KRBTGT's password must be reset twice, on a delay, because a single reset still leaves one forged ticket cryptographically valid until its lifetime expires.
- Citations: Semperis (#10)
- Entities: KRBTGT (body-only, no mentions entry), Credential Guard (introduced here, expanded later)
- Satisfies brief required passage: "What is a golden ticket attack and why is it so hard to remediate once it happens."

### H2: Pass-the-hash and pass-the-ticket move through a hospital network differently (≈ 220 words)
- Direct-answer opener states the distinction plainly: pass-the-hash replays a stolen NTLM/Kerberos password hash to request new authentication; pass-the-ticket replays an already-issued Kerberos ticket directly, skipping the hash-to-ticket step entirely, which matters because ticket lifetime, not password rotation, is what limits the second technique.
- Grounds it in a hospital-specific scenario: a compromised clinical workstation with a cached ticket for an imaging-integration service account, and why rotating that account's password does nothing against an already-stolen ticket still inside its lifetime.
- Covers mitigation: Credential Guard's isolation of the LSASS process against hash/ticket extraction, versus patching (rotation) as a necessary but insufficient control on its own.
- Citations: Microsoft Learn Credential Guard overview (#4)
- Entities: Pass the hash, Credential Guard
- Satisfies brief required passages: "Pass-the-hash vs pass-the-ticket: what's the difference in a hospital environment" and "Pass-the-hash mitigation in an on-prem AD environment: patching vs. path-based defense."

### H2: Delegation abuse turns one compromised server into domain-wide reach (≈ 200 words)
- Direct-answer opener defines the three delegation types in one pass (unconstrained: the receiving server can impersonate the user to any other service; constrained: limited to a defined service list; resource-based constrained: the target resource itself decides which accounts can delegate to it) and states plainly which is worst-case for a hospital: unconstrained delegation on any server a clinical user regularly authenticates to, because compromising that one server yields a usable copy of that user's TGT.
- Grounds it in a healthcare-realistic path: a lab-integration server with unconstrained delegation reachable from a compromised workstation, cascading to a domain admin's cached ticket.
- Citations: Trimarc / Sean Metcalf (#9)
- Entities: Active Directory
- Satisfies brief required passage: "What Kerberos delegation attacks look like on a healthcare network."

### H2: Mitigation only holds up when it accounts for both on-prem AD and Entra ID (≈ 250 words)
- Direct-answer opener states plainly that on-prem Kerberos monitoring (Event IDs 4768/4769, `msDS-SupportedEncryptionTypes`, `Get-KerbEncryptionUsage.ps1`) does not extend to Entra ID sign-in logs, so a hospital running hybrid identity needs both telemetry sources correlated, not one substituting for the other, because a Kerberos ticket compromised on-prem can pivot into Entra ID through synced or federated identities with no on-prem-only tool visibility into that hop.
- States the operational reality of the July 2026 RC4 enforcement: legacy PACS boxes, lab middleware, and imaging modalities that only spoke RC4 either failed authentication outright after April/July 2026 or are running on a documented, time-boxed RC4 exception, and that exception is itself a HIPAA §164.312 technical-safeguards decision that needs an owner and an expiration date, not a standing configuration.
- Names Saporo's attack-path-graph mechanism once here as the proprietary evidence: correlating on-prem AD Kerberos exposure with Entra ID hybrid-identity risk in a single graph, prioritized by reachability, propagation potential, and impact to critical assets, and scored against ANSSI/CIS/ISO/MITRE frameworks (mapping Kerberoasting and Golden Ticket paths to ATT&CK T1558.001/.003).
- Citations: Microsoft Learn RC4 detection/remediation (#6), Microsoft RC4/CVE-2026-20833 (#1), Wyden/FTC letter (#5)
- Entities: Microsoft Entra ID, RC4, MITRE ATT&CK, Saporo
- Satisfies brief required passages: "Active Directory Kerberos attack mitigation techniques that hold up in hybrid healthcare environments" and "How credential theft detection differs between on-prem Active Directory and Azure AD."
- Internal links: hub guide, "PAM for AD/hybrid environments" spoke, "Hybrid AD/Azure identity attack surface in healthcare" spoke, product overview page.

### H2: Credential Guard and Defender Credential Guard are the same feature, not two products (≈ 160 words)
- Direct-answer opener states plainly, per Microsoft's own current documentation, that Credential Guard and Windows Defender Credential Guard are the same feature under two different branding eras, not separate tools, so a hospital does not need to deploy both. States what the feature actually does: isolates LSASS secrets in a virtualization-based security container, which blocks the credential-dumping step both pass-the-hash and Golden Ticket attacks depend on.
- Notes the one real decision point: whether the hospital's clinical hardware supports the virtualization-based security prerequisites, which is the actual constraint on legacy devices, not the name.
- Citations: Microsoft Learn Credential Guard overview (#4)
- Entities: Credential Guard
- Satisfies brief required passage: "Credential Guard vs. Defender Credential Guard: what a hospital deployment needs to know."

### H2: Frequently Asked Questions (≈ 330 words total, ~55 words per answer)
- Q1: Why do you have to reset the KRBTGT password twice after a Golden Ticket attack, not just once?
- Q2: Is it safe to re-enable RC4 for a legacy clinical device that can't support AES, and what does that do to HIPAA compliance?
- Q3: Are Group Managed Service Accounts (gMSA) practical for vendor-managed EHR, PACS, or lab-middleware systems that don't support them?
- Q4: Which delegation type, unconstrained, constrained, or resource-based constrained, should a hospital security team worry about most?
- Q5: How do you find kerberoastable accounts in your own Active Directory before an attacker does?
- Q6: Do hospitals need to deploy both Credential Guard and Windows Defender Credential Guard?

### Closing (≈ 90 words)
Crystallize the thesis into one clean distinction: a checklist tells you which Kerberos controls are missing; an attack path tells you which missing control actually gets an attacker to a Tier 0 asset. Point the reader to the hub guide on closing identity attack paths, and name Saporo's graph-based reachability scoring once as the mechanism that answers the question the article has been building toward.
