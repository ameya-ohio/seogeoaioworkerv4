# Strategy & Outline: Attack Path Analysis

## Angle
> Unlike the current top 10, which all recite the same definition → attack-path-vs-vector-vs-surface → generic N-step-methodology skeleton with identity as one bullet among many, this article treats identity as the organizing principle end-to-end, opens with the 2026 breach data that proves why, and grounds the abstract "choke point" concept in one worked numeric example and one named, hop-by-hop attack chain that no ranking page currently shows.

**Why this angle:** Research found ten ranking pages sharing an identical shape and none anchoring the explanation in a specific identity attack chain, a worked choke-point calculation, or current breach statistics (Unit 42, Verizon DBIR, SpyCloud). For Saporo, a company positioned in Preemptive Identity Exposure Management, treating identity as the connective tissue of every attack path (not a bullet point) is also the least commoditized, most defensible framing — it's the wedge between "identity is one input" (Wiz, CyCognito, Cymulate) and "identity is the point" (this article, matching Saporo's own product logic of reachability/propagation/impact).

## Thesis
An attack path is dangerous in proportion to the identity relationships it can traverse, not the number of vulnerabilities it starts from. Vulnerability exploitation may be how attackers get in the door more often now, but what turns a single foothold into a breach is almost always a chain of permissions, group memberships, and sessions, so any attack path analysis that treats identity as one input among several is measuring the wrong thing.

## Keywords
- Primary: attack path analysis
- Secondary: identity attack path, attack path management, attack path vs attack surface, attack path choke points, non-human identity attack paths

**Targeting notes:**
- **attack path analysis** — high-value informational term, dense competition, but every ranking page shares the same shallow skeleton; identity-first framing plus current data is a real differentiation angle, not just a keyword play.
- **identity attack path** — competitor weakness confirmed: only SpecterOps/BloodHound content treats this as a first-class phrase; most generalist ASM pages don't use it at all. Strong AI-citation potential given the discourse gap research found.
- **attack path management** — Wikipedia's own page title; worth covering since AI Overviews pull from Wikipedia for the base definition, and the encyclopedia entry is thin on 2025–2026 market context and NHI, both of which we address.
- **attack path vs attack surface** — every top-10 page includes this distinction; it's table stakes for coverage, not a differentiator, but must be present and clean.
- **attack path choke points** — universally explained qualitatively, never quantified. Our worked numeric example is the wedge here.
- **non-human identity attack paths** — content gap research flagged directly: NHI is a passing trend mention everywhere, never a first-class node type in the core methodology. Low competition, rising search relevance given SpyCloud's September 2026 data.

## Search Intent
Informational, upper-to-mid funnel category education, with rising commercial intent near the bottom as readers start evaluating identity-first platforms versus bolt-on ASM/CNAPP attack-path modules. Structure: comprehensive-guide shape (not a comparison page, not a landing page), but the closing section earns the right to a soft product-aware CTA because the content gap research explicitly surfaces "when is bolt-on visibility not enough" as an unmet reader question.

## Target Word Count
1,900 words. No spoke brief exists for this article, so the SERP-median rule applies. The ranking pages cluster in two bands: dense glossary/guide pages (XM Cyber, Tenable, CyCognito) run long with multiple named lists; leaner fundamentals pages (Rapid7, Wiz) run shorter but leave real gaps (no breach data, no concrete example, no NHI treatment). 1,900 words matches the denser end of that median while spending the incremental length on things the SERP doesn't have — a worked choke-point calculation, a named hop-by-hop attack chain with ATT&CK technique IDs, and the identity-vs-vulnerability synthesis — rather than on restating the same methodology steps in more words. No section is included to pad length; the FAQ section absorbs the "one-thing-per-question" gaps (Tier 0, BloodHound dual-use, CTEM fit) so the body isn't forced to cover them shallowly just for coverage's sake.

## GEO/AIO Angle
- **Direct-answer-first sentence under every H2** — each section opens with a plain declarative definition or claim before any elaboration, so an AI engine can lift the first sentence as a standalone answer.
- **A worked numeric example for the choke-point concept** — turning "fixing one choke point fixes many issues" from a qualitative claim (which every competitor page makes) into an extractable, citable calculation using the SpecterOps 22-million-paths figure. This is original synthesis, not just a repeated stat.
- **Definition-style sentences (bolded term + <25-word definition)** for attack path, attack surface, attack vector, choke point, and non-human identity — built for AI engines to extract as grounding definitions, matching the AIO checklist's DefinedTerm pattern.
- **A comparison table (identity-first attack path platform vs. bolt-on ASM/CNAPP attack-path module)** — AI engines extract tables cleanly for "X vs Y" queries, and no ranking page has this exact comparison.
- **Key Takeaways block near the top** as the speakable surface, each bullet standalone-citable without needing the rest of the article for context.

## Target Entities (for `mentions` array)
- MITRE ATT&CK — https://en.wikipedia.org/wiki/MITRE_ATT%26CK
- Active Directory — https://en.wikipedia.org/wiki/Active_Directory
- Privilege escalation — https://en.wikipedia.org/wiki/Privilege_escalation
- Lateral movement (ATT&CK TA0008) — https://attack.mitre.org/tactics/TA0008/
- Attack path management (Wikipedia) — https://en.wikipedia.org/wiki/Attack_path_management
- Zero trust security model — https://en.wikipedia.org/wiki/Zero_trust_security_model
- Palo Alto Networks (Unit 42) — https://en.wikipedia.org/wiki/Palo_Alto_Networks
- Verizon — https://en.wikipedia.org/wiki/Verizon
- Microsoft — https://en.wikipedia.org/wiki/Microsoft
- Gartner — https://en.wikipedia.org/wiki/Gartner
- SpecterOps — https://specterops.io (no confirmed Wikipedia page; cite via official site)
- BloodHound (SpecterOps tool) — https://specterops.io (no standalone Wikipedia page; cite via official site/GitHub)
- Jared Atkinson, CTO, SpecterOps — cite via Identity Week byline (no standalone Wikipedia page)
- SpyCloud — https://spycloud.com (no confirmed Wikipedia page; cite via official site)
- Saporo — https://www.saporo.io (company mention in closing/CTA context only)

## FAQ Candidates
1. How is attack path analysis different from vulnerability scanning?
2. What's the actual difference between an attack vector, an attack surface, and an attack path?
3. What is a Tier 0 asset in Active Directory, and why does it matter for attack paths?
4. Is BloodHound safe to use if attackers use the same tool?
5. Do I need to run attack path analysis continuously, or is a one-time assessment enough?
6. How does attack path analysis fit into a CTEM program?
7. Can attack path analysis cover a hybrid environment, on-prem Active Directory and cloud and Entra ID, at the same time?

## Internal Link Opportunities
- Internal link to: Saporo's PIEM / product overview page (product/overview) — in the "identity-first vs bolt-on" section, framed as a resource on reachability/propagation/impact prioritization, not a hard sell.
- Internal link to: "The Power of the Security Graph" blog post — where the article introduces graph modeling of identities, permissions, and assets.
- Internal link to: "From Observation to Action: A CISO's Pragmatic Lens on Identity Blast Radius" — near the choke-point section, as further reading on operationalizing choke-point prioritization (do not reuse the banned phrase itself in our own body copy; link anchor text can reference the post by title).
- Internal link to: "Compliance Is a Starting Point, Not a Measure of Exploitability" — in the section distinguishing attack path analysis from checklist-based vulnerability management.
- Placeholder: internal link to a future/existing "Non-human identity exposure" pillar page, if one exists on saporo.io, from the NHI section.

## External Citations to Use
1. Jared Atkinson / SpecterOps, Identity Week, 17 Feb 2026 (research source #1) — used in the intro / "why now" section and in the worked choke-point example (22 million attack paths).
2. Verizon 2026 DBIR (source #2) — used in the "identity vs. vulnerability" synthesis section, framing the 31% vulnerability-exploitation entry-point finding.
3. SpyCloud 2026 Identity Threat Report (source #3) — used in the non-human identity section, framing the 31%-vs-17% NHI-vs-phishing entry-point finding.
4. Unit 42 2026 Global IR Report (source #4) — used in the intro/"why now" section, framing identity weaknesses' presence in ~90% of investigated breaches.
5. Microsoft Learn, "Work with attack paths in Microsoft Security Exposure Management" (source #5) — used in the "what is an attack path" definition section and the choke-point definition.
6. Wikipedia, "Attack path management" (source #6) — used as a grounding citation in the definition section and the attack-vector/surface/path distinction.
7. MITRE ATT&CK, "Lateral Movement (TA0008)" (source #12) — used in the named worked attack-chain section, citing specific technique IDs.

## Quotable Sound Bites
- A one-sentence definition of attack path analysis that leads with identity as the connective tissue, not a bulleted input.
- "Organizations with 10,000 identities face 22 million potential attack paths" (Atkinson/SpecterOps), immediately followed by the arithmetic that makes the choke-point concept concrete (how many paths a single choke point can close).
- A single sentence contrasting the two 2026 data points precisely: vulnerability exploitation now the top entry point (Verizon), but identity weaknesses present in nearly 90% of investigated breaches (Unit 42) — stated as two facts in tension, not smoothed into a false consensus.
- A definition-style sentence for "choke point" clean enough to stand alone as a citation.
- A closing sentence that states the identity-first distinction as a testable claim, not a slogan.

## Hook Strategy
**Sharp number.** Open on the SpecterOps figure, 22 million potential attack paths from 10,000 identities, before the reader has been told what an attack path even is. The number is jarring enough to earn the definition that follows, and it sets up the choke-point payoff later in the article. Avoids the generic "organizations today face..." problem-painting opener the quality bar bans.

## Closing / CTA
Deeper read: point the reader to Saporo's product overview / PIEM page as the next step for readers who now understand attack path analysis well enough to ask "does our current tooling actually model this, or just list findings?" This fits the ICP (CISOs and security architects at hybrid-infrastructure enterprises evaluating tooling, per `context/sales/icp.md`) and the informational-to-commercial intent curve identified in research. A demo or trial CTA would be premature for a reader who just learned the category; a "go deeper on how this is modeled" link matches where they actually are.

## Full Outline

### Intro (≈ 150 words)
Open on the 22-million-attack-paths figure (Atkinson/SpecterOps), then immediately state what an attack path is and why the number is possible (identity relationships compound). Preview the thesis: identity is the connective tissue of every attack path, whatever the entry point.

### Key Takeaways (5 bullets)
- Standalone definition of attack path analysis, identity-first framing.
- The 22-million-paths / 10,000-identities figure with attribution.
- The Verizon 31% vulnerability-exploitation stat, dated, with the caveat that post-entry movement is still identity-driven.
- One-sentence definition of a choke point.
- One-sentence statement of when a bolt-on ASM/CNAPP module stops being enough.

### H2: What an attack path actually is (≈ 250 words)
- Answer-first definition: an attack path is a chained route of exploitable relationships, not a single flaw; contrast in one paragraph with vulnerability scanning and attack surface management, since both are conflated with it constantly.
- Citations: Microsoft Learn (#5), Wikipedia attack path management (#6).
- Entities: Active Directory, MITRE ATT&CK, Attack path management (Wikipedia).
- No brief exists; this section satisfies the base "what is X" coverage every ranking page has, done in fewer words than competitors so budget goes to the differentiated sections below.

### H2: Why identity is the throughline, not one input among many (≈ 300 words)
- Answer-first claim: identity relationships are what let a single foothold become a breach, regardless of how the attacker got in. Present the Unit 42 ~90% figure and the Verizon 31% vulnerability-exploitation figure together, honestly, as two facts in tension rather than smoothing them into a false consensus (per research's debate synthesis).
- Citations: Unit 42 (#4), Verizon 2026 DBIR (#2).
- Entities: Palo Alto Networks, Verizon.
- This section is the thesis's main evidentiary load-bearing section (not a load-bearing metaphor, an actual argument): it is where the article earns the "identity as organizing principle" claim rather than asserting it.

### H2: A named attack path, hop by hop (≈ 350 words)
- Answer-first: walk one concrete chain (phishing → stale service-account credential → nested group membership → Tier 0 domain admin) naming the ATT&CK technique at each hop (e.g., initial access, credential access via a cached credential, privilege escalation via group nesting, lateral movement to a domain controller).
- Citations: MITRE ATT&CK Lateral Movement TA0008 (#12).
- Entities: Privilege escalation, Lateral movement/TA0008, Active Directory.
- Directly fills the #1 content gap research identified: no ranking page walks a single concrete chain with named technique IDs. This is the article's strongest differentiation section.

### H2: What a choke point closes, in numbers (≈ 300 words)
- Answer-first definition of choke point (a node where multiple attack paths converge), then the worked numeric example: starting from the 22-million-paths figure, show illustratively how collapsing one shared choke point (e.g., a single over-permissioned nested group) removes a large share of downstream paths at once, making the qualitative "fix one, close many" claim visually and numerically concrete.
- Citations: Identity Week/Atkinson (#1), Microsoft Learn (#5).
- Entities: none new (reuses Active Directory, SpecterOps).
- Fills content gap #4 directly: no page quantifies the choke-point concept with a worked example.

### H2: Non-human identities are already a bigger door than phishing (≈ 250 words)
- Answer-first: state the SpyCloud finding plainly (compromised non-human identities now the leading primary breach entry point, ahead of phishing), then explain concretely why NHIs (service accounts, API keys, agentic AI workers) create attack-path nodes that behave differently from human accounts (no MFA, long-lived credentials, often over-permissioned by default).
- Citations: SpyCloud 2026 Identity Threat Report (#3).
- Entities: SpyCloud.
- Fills content gap #3: NHI treated as a first-class node type in the core methodology, not a trend footnote.

### H2: When bolt-on attack-path visibility stops being enough (≈ 300 words)
- Answer-first: state the decision criterion plainly (a bolt-on module is enough when attack paths are simple and single-domain; it stops being enough once paths span hybrid on-prem/cloud/SaaS identity boundaries and need continuous reachability/propagation/impact prioritization, not a periodic scan).
- Include the identity-first-platform vs. bolt-on-ASM/CNAPP-module comparison table (dimensions: identity coverage breadth, human + non-human identity modeling, continuous vs. point-in-time, choke-point prioritization, hybrid on-prem/cloud coverage).
- Citations: none new; synthesizes research's three-camp discourse analysis (identity-native vs. cloud/CNAPP vs. generalist ASM).
- Entities: none new.
- Fills content gap #2 directly: the buy-vs-build-in decision no ranking page addresses.

### H2: Frequently Asked Questions
- Q1: How is attack path analysis different from vulnerability scanning?
- Q2: What's the actual difference between an attack vector, an attack surface, and an attack path?
- Q3: What is a Tier 0 asset in Active Directory, and why does it matter for attack paths?
- Q4: Is BloodHound safe to use if attackers use the same tool?
- Q5: Do I need to run attack path analysis continuously, or is a one-time assessment enough?
- Q6: How does attack path analysis fit into a CTEM program?
- Q7: Can attack path analysis cover a hybrid environment, on-prem Active Directory and cloud and Entra ID, at the same time?

### Closing (≈ 100 words)
Crystallize the thesis into one distinction: attack surface tells you what's exposed; attack path analysis tells you what an attacker could actually reach and connect; identity is what makes that connection possible in nearly every case, regardless of the initial entry point. Point the reader to Saporo's product overview for a look at how reachability/propagation/impact prioritization works in practice.

## Notes for the Writer
- **"Blast radius" and "gate" are on the machine-checked banned-phrases list** (`standards/banned-phrases.txt`) despite being the exact term Microsoft's own documentation uses. Do not use "blast radius" in body copy; use "how far a compromise cascades" or "downstream reach" instead. If quoting Microsoft's documentation verbatim, the term may appear only inside a direct quotation with explicit attribution, per the quality bar's term-of-art exception — never as house vocabulary.
- The Gartner CTEM breach-reduction figure is a forecast, not a measured outcome (research's debate synthesis). If referenced in the CTEM FAQ answer, frame it explicitly as a 2022 prediction, not a proven result.
- Do not claim independently verified false-positive/false-negative rates for any vendor's graph model — research found no top-ranking page has published this data; don't invent it.
- Follow `context/author-style/saporo-voice.md` exactly: declarative H2s only, concede-then-pivot arc is not required here (this is category-education, not a CISO-lens opinion post) but the answer-first-per-section, no-hedging, one-worked-example rules all apply.
