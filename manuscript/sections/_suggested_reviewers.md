# Suggested Reviewers — EMSE Submission (Phase 1 Methodological Pilot)

**Manuscript:** *Beyond TodoMVC: A Multi-Application Empirical Evaluation of LLM-as-Judge Visual Regression Detection Across 8 Open-Source Web Applications*
**Author:** Suneet Malhotra (sole author, no prior co-authors)
**Pre-registration:** OSF DOI 10.17605/OSF.IO/NKD6J
**List compiled:** 2026-06-09

## Eligibility checks performed for every candidate

1. Published in empirical SE / software testing / LLM-eval methodology in the last 24 months — verified via Google Scholar, conference researchr.org profiles, and recent journal indices.
2. Verifiable institutional email at a university or major industry research lab.
3. No prior co-authorship with Suneet Malhotra (Malhotra has no prior publications, so this is automatic).
4. NOT an EMSE Editor-in-Chief — Robert Feldt (Chalmers) and Thomas Zimmermann (Microsoft Research) are EXCLUDED. EMSE EICs verified 2026-06-09 against the Springer journal page and emsejournal.github.io.
5. NOT a JSS Editor-in-Chief — Paris Avgeriou (Groningen) and David Shepherd (LSU) are EXCLUDED because they are currently handling Suneet's companion JSS submission (JSSOFTWARE-D-26-01260).

Sigrid Eldh (Mälardalen / Ericsson) was considered but is EXCLUDED from the suggested list. Although she has not co-authored with Malhotra, she has had recent personal correspondence with him (declined to serve as an IEEE Senior Member reference in May 2026). That communication is enough of a perceived conflict that she should not be suggested as a peer reviewer for this manuscript; the editor can still independently invite her if desired.

---

### Reviewer 1: Davide Falessi
- **Affiliation:** Associate Professor, Department of Civil and Computer Engineering, University of Rome "Tor Vergata", Italy
- **Email:** falessi@ing.uniroma2.it
- **Expertise:** Empirical software engineering with a specific focus on methodological rigor in studies that involve LLMs. Recently co-authored "Evaluation Guidelines for Empirical Studies in Software Engineering involving LLMs" (preprint, August 2025) and contributed to the WSESE '25 (Workshop on Software Engineering for Empirical Studies) proceedings on methodological issues in empirical SE.
- **Justification for suggesting:** Falessi's 2025 guidelines paper is essentially the rubric this manuscript is built to satisfy: pre-registration, by-construction ground truth, explicit phase separation between infrastructure validation and hypothesis testing. He is one of the few referees who will engage substantively with the Phase 1 / Phase 2 split rather than treating it as evasion.
- **Verification status:** Email verified 2026-06-09 against ing.uniroma2.it faculty directory; most recent paper August 2025.
- **Confidence flag:** HIGH

### Reviewer 2: Foutse Khomh
- **Affiliation:** Full Professor and Canada Research Chair Tier 1 in Software Engineering for AI/ML, Polytechnique Montréal, Canada; Vice-President, Research and Innovation (effective January 2026); Canada CIFAR AI Chair (Mila)
- **Email:** foutse.khomh@polymtl.ca
- **Expertise:** Empirical software engineering at the intersection of machine-learning systems and traditional SE quality, including LLM-for-code evaluation. 2025 EMSE article "Adversarial attack classification and robustness testing for large language models for code"; 2026 IEEE IoT Journal paper "Think Fast: Real-Time IoT Intrusion Reasoning Using IDS and LLMs at the Edge Gateway".
- **Justification for suggesting:** Khomh is an EMSE associate editor in adjacent waters and runs SWAT Lab, which routinely evaluates LLM behavior in SE settings. He will recognize the Llama 0% finding as a real instrumentation-versus-capability ambiguity rather than a paper-killing defect.
- **Verification status:** Email verified 2026-06-09 against polymtl.ca expert directory and the SWAT Lab homepage; most recent paper 2026.
- **Confidence flag:** HIGH

### Reviewer 3: Massimiliano Di Penta
- **Affiliation:** Full Professor, Department of Engineering (DING), University of Sannio, Benevento, Italy
- **Email:** dipenta@unisannio.it
- **Expertise:** Empirical SE, mining software repositories, and software engineering with/for AI; h-index 96 as of mid-2026. Recent work directly relevant: "Developers and generative AI: A study of self-admitted usage in open source projects" (EMSE, April 2026) and "Machine Learning in the Wild: Early Evidence of Non-Compliant ML-Automation in Open-Source Software" (2026).
- **Justification for suggesting:** Di Penta has been a frequent EMSE author and reviewer for years and is well positioned to assess both the harness-as-artifact contribution and the κ / Fleiss-κ analysis methodology. His 2026 EMSE paper on generative-AI usage shows current engagement with exactly the methodological-disclosure questions the manuscript surfaces (including the dual role of Claude Sonnet 4.5 as tool and as object of study).
- **Verification status:** Email verified 2026-06-09 against unisannio.it user directory and mdipenta.github.io; most recent paper April 2026.
- **Confidence flag:** HIGH

### Reviewer 4: Andy Zaidman
- **Affiliation:** Full Professor and Chair of Software Technology, Delft University of Technology, the Netherlands
- **Email:** A.E.Zaidman@tudelft.nl
- **Expertise:** Empirical software engineering, software testing, and GenAI use in testing pedagogy. Recent work: "How Students Use Generative AI for Software Testing: An Observational Study" (preprint, October 2025), "Not One to Rule Them All: Mining Meaningful Code Review Orders From GitHub" (December 2025), and "On the Energy Cost of Static Analysis Precision" (accepted DevOpsSustain 2026, co-located with FSE).
- **Justification for suggesting:** Zaidman leads the TestShift project on software-testing evolution and chairs the Software Technology group at TU Delft; he is squarely in the testing-methodology constituency this paper is written for. He will be exacting on the per-defect-category breakdown and on whether the synthetic-HTML corpus is honestly framed as Phase 1 only.
- **Verification status:** Email verified 2026-06-09 against tudelft.nl staff page; most recent preprint October 2025.
- **Confidence flag:** HIGH

### Reviewer 5: Lionel Briand
- **Affiliation:** Professor, University of Ottawa (Canada) and SnT Centre for Security, Reliability and Trust, University of Luxembourg
- **Email:** lbriand@uottawa.ca
- **Expertise:** Software testing, verification and validation, and application of machine learning and LLMs to SE problems. Recent work: "Call-Chain-Aware LLM-Based Test Generation for Java Projects" (2026); machine-learning techniques for log-based anomaly detection (2025); ML-based automated form filling (2025).
- **Justification for suggesting:** Briand has been a senior voice on empirical-method rigor in SE for two decades and currently runs the SVV group at SnT. He is the right reviewer to interrogate whether the pre-registered RQ1–RQ4 deferral to Phase 2 is genuinely a methodological commitment or a hedge — and to demand the manuscript stay honest about which questions Phase 1 does and does not answer.
- **Verification status:** Email verified 2026-06-09 against University of Ottawa Faculty of Engineering directory; most recent paper 2026.
- **Confidence flag:** HIGH

---

## Reviewers considered and dropped

- **Sigrid Eldh (Mälardalen University / Ericsson)** — dropped for perceived personal-correspondence conflict (declined Malhotra's IEEE Senior reference request, May 2026). Strong topical fit (Ericsson LLM-in-testing work, MDU empirical SE) but inappropriate to suggest given the prior interaction.
- **Filomena Ferrucci (University of Salerno)** — strong recent record (2025 JSS paper on ML projects; 2025–2026 work on LLMs for SE), but ranked sixth on fit. Available as a backup if EMSE requests additional names.
- **Tao Yue (Simula Research Laboratory / Beihang)** — strong testing background and very active 2025–2026; institutional email split across simula.no and buaa.edu.cn made verification ambiguous, so dropped in favor of candidates with unambiguous single-institution addresses.
- **Andreas Zeller (CISPA / Saarland University)** — 2026 Harlan D. Mills Award recipient, but his recent visibility is debugging/fuzzing rather than LLM-as-Judge evaluation; weaker direct fit than the five above.
- **Tao Xie (Peking University)** — strong fit on LLM-for-SE; 2026 publications confirmed in *Journal of Computer Science and Technology* and *Science China Information Sciences*. Dropped only because a five-of-five Western/European list reduces time-zone and language friction; available as backup.

## What Suneet should verify before submission

- **EMSE Editors-in-Chief:** confirmed Robert Feldt (Chalmers) and Thomas Zimmermann (Microsoft Research) as of 2026-06-09. Re-check the editorial-board page at the time of submission in case of turnover.
- **All five email addresses:** spot-check by opening each candidate's institutional faculty page on the day of submission. Institutional emails change less often than affiliations, but a 30-second check costs nothing.
- **Conflict-of-interest declaration:** even with no prior co-authorships, the EMSE submission form will ask. Standard answer: "Sole-author submission; no prior co-authorships; no funding or employment relationships with any suggested reviewer." Sigrid Eldh's exclusion from the suggested list does not need to be volunteered.
