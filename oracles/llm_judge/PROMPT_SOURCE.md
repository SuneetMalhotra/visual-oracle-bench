# LLM-judge prompt: source and provenance

`prompt.txt` is a VERBATIM port of the `VISUAL_ASSERTION_VISION_SYSTEM` constant
from the antecedent agent-harness study:

- Source repo: `github.com/SuneetMalhotra/agent-harness`
- Source file: `intelligence.ts` (line ~28, constant `VISUAL_ASSERTION_VISION_SYSTEM`)
- Ported on: 2026-07-20 (W7 milestone, per `preregistration/draft.md` §4.3)
- License: MIT (same author, Suneet Malhotra)

The prompt is held verbatim per the OSF pre-registration `§4.3 Oracles` clause:

> O3 — LLM-as-judge: the visual-assertion prompt ported from the antecedent
> agent-harness `intelligence.ts: VISUAL_ASSERTION_VISION_SYSTEM` (committed
> verbatim at `oracles/llm_judge/prompt.txt` in this repo's release). The
> prompt instructs the model to output a single-line JSON verdict.

**DO NOT modify `prompt.txt`.** Any wording change invalidates the
external-validity comparison to the antecedent study's κ = 0.667 result. If the
prompt needs evolution, that is a separate pre-registered hypothesis (out of
scope for this study).

## Adaptation note

In the antecedent harness the prompt instructed the model to use its "Read tool
(the path is absolute)" because the harness ran inside Claude Code's tool
calling environment, where the model invokes file reads itself. In this study
the four judge providers (`gpt4o.ts`, `claude.ts`, `gemini.ts`,
`llama_ollama.ts`) instead pass the PNG bytes as a vision-content block in the
API call directly — the model never invokes a Read tool. The wording
"You MUST open the PNG using your Read tool" is preserved verbatim in
`prompt.txt` so that the prompt itself is a 1:1 string match with the
antecedent constant; the operational substitution (API-provided image bytes vs.
tool-invoked file read) is documented here and is reported in the manuscript
§4.4 alongside the judge inventory.
