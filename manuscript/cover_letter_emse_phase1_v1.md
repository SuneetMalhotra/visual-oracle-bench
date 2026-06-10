Dear Professor Feldt and Professor Zimmermann,

I am submitting *Visual Oracle Bench: A Pre-Registered Methodological Pilot for Multi-Application LLM-as-Judge Visual Regression Detection* for consideration as a Methodological Article in Empirical Software Engineering.

The paper reports a pre-registered methodological pilot for a reusable LLM-as-Judge benchmark targeting visual regression detection in web applications. The full study design was registered at OSF DOI 10.17605/OSF.IO/NKD6J on 2026-06-06, before any LLM judgment was collected. The manuscript reports Phase 1: an end-to-end harness validation on a 400-pair synthetic-HTML corpus with by-construction ground truth, executed against three pre-registered vision-language judges.

The paper contributes:

1. **A reusable benchmark harness for multi-application LLM-as-Judge visual-regression evaluation** — open-source injection primitives, capture orchestrator, dispatcher, pre-registered judge wrappers, and a versioned manifest contract, released under MIT with single-command reproduction.
2. **Phase 1 evidence over 1,200 judgments** — per-judge accuracy 88.8% (Claude Sonnet 4.5), 88.2% (OpenAI Codex / GPT-family), 0.0% (Llama 3.2-Vision 11B local), pairwise Cohen's κ = 0.361 on the two non-zero judges, Fleiss' κ = −0.309 across all three.
3. **The OSF pre-registered design as a reusable template** — a transferable methodological pattern for empirical LLM-eval work, not merely an artifact of this paper.

The manuscript is explicit about what Phase 1 does *not* claim. The four pre-registered research questions (RQ1–RQ4, including cross-application κ generalization) are scoped to Phase 2 — the live-Docker, eight-application experiment whose corpus capture is still being instrumented. Phase 1 is framed throughout as infrastructure validation, and §1, §4, and §5 each say so directly.

We submit to the Methodological Articles track because the contribution shape is a method and an artifact, not a hypothesis test. The OSF pre-registration, MIT-licensed code, CC-BY 4.0 data, Zenodo-archived corpus, ARTIFACTS.md manifest, and single-command reproducibility path all serve that framing. The Phase 1 / Phase 2 split is itself part of what we propose as method: register first, validate the harness honestly, then run the registered experiment. Artifacts are archived at Zenodo (concept DOI 10.5281/zenodo.20620870; Phase 1 version DOI 10.5281/zenodo.20620871) and at GitHub (github.com/SuneetMalhotra/visual-oracle-bench, release tag v0.3.0-phase1-pilot).

Per EMSE's Methodological Articles description, this manuscript both (a) presents a new method — the pre-registered Phase 1 / Phase 2 reporting split as a transferable pattern for LLM-eval SE work where infrastructure validation must precede confirmatory testing — and (b) empirically examines the use of LLM-as-Judge evaluation methodology, surfacing failure modes (Llama composite-vs-capability ambiguity, frontier-judge per-category divergences) that the methodology must account for. The harness is the artifact; the Phase 1 / Phase 2 split is the method; the failure-mode catalog is the empirical examination.

The headline Llama 3.2-Vision 11B result — 0% defect detection — is a documented limitation, disclosed in the abstract, the §4 results table, and §5.2. The local Llama deployment refuses multi-image prompts; the side-by-side composite workaround did not recover capability. The manuscript names this as a composite-vs-capability ambiguity Phase 1 evidence cannot resolve, and does not interpret 0% as a verdict on Llama 3.2-Vision's underlying visual reasoning.

This paper sits within a broader research program. A companion single-author manuscript on the agent-harness infrastructure is under consideration at the *Journal of Systems and Software* In-Practice track (JSSOFTWARE-D-26-01260); a Specification Enrichment piece is in preparation for *IEEE Software* (editor-invited). The pre-registered Phase 2 paper is deferred until live-Docker capture across all eight applications is complete.

I confirm: the manuscript has not been published previously and is not under consideration elsewhere; I am the sole author; I declare no competing interests; code and data are archived at GitHub and Zenodo with DOIs cited in the manuscript. Generative-AI use is disclosed in full inside the manuscript: the Claude Sonnet 4.5 model family is both a tool used in manuscript preparation (copy-editing, figure rendering) and one of the three LLM judges under evaluation; the disclosure names the model, version, and scope of each use.

I would value the opportunity to contribute this work to EMSE and am glad to provide additional materials or respond to editorial questions at any stage.

Sincerely,

Suneet Malhotra
ORCID: 0009-0003-8707-9590
Affiliation: Motorola Solutions (independent research; affiliation for identification only)
Email: suneetmalhotra2002@gmail.com
Website: https://suneetmalhotra.com
GitHub: https://github.com/SuneetMalhotra
