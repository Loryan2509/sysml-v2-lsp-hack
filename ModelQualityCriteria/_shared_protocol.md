# SysML v2 Assessment: Shared Protocol

This file defines procedures common to **all 10 assessment criteria files**. Read this file once before beginning any individual criterion assessment, then apply the protocol throughout.

---

## Model Characterisation

Before applying any checks from an individual criterion file, briefly summarise the following. Use this characterisation as the basis for all subsequent judgements.

- **System purpose**: What is the system designed to do, and for whom?
- **Operational domain**: What environment does it operate in (e.g., aerospace, automotive, medical, industrial, defence)?
- **Model scope**: Is this a complete system model, a fragment, a specific view, or one variant of a product family?
- **Known scope limitations**: Note any areas intentionally excluded from this model; skip the relevant checks in each criterion file with a documented rationale rather than raising false findings.

> **Recommended execution order**: 01 → 05 → 03 → 07 → 02 → 06 → 04 → 08 → 09 → 10

---

## Scoring

Each finding is assigned a **probability score from 0.0 to 1.0** representing the estimated likelihood that this issue, if left unresolved, will cause a harmful outcome — such as an incorrect design decision, safety gap, verification failure, or analytical error.

| Score Range | Interpretation |
|---|---|
| **0.9 – 1.0** | Near-certain to cause analysis failure, incorrect decision, or unmitigated safety gap |
| **0.7 – 0.89** | High likelihood of causing significant analytical error or blocking a key decision |
| **0.5 – 0.69** | Moderate likelihood of harm; likely to surface as a problem under specific conditions |
| **0.2 – 0.49** | Low-to-moderate likelihood; reduces model confidence but may not cause immediate failure |
| **0.0 – 0.19** | Very low likelihood; an observation or minor inconsistency unlikely to cause harm in the current state |

Decision aid:

- Analysis blocked entirely from being performed → Score ≥ 0.9
- Analysis likely produces a wrong result → Score 0.7–0.89
- Decision will be made without necessary information → Score 0.5–0.69
- Model is weaker but not currently producing wrong results → Score 0.2–0.49
- Stylistic or minor cleanliness observation → Score 0.0–0.19

---

## Confidence Level

Each finding also carries a **Confidence** rating indicating how certain the assessment is that the finding is real and correctly characterised.

| Confidence | Meaning |
|---|---|
| **HIGH** | The finding is directly supported by explicit evidence in the model text. No domain assumption is required. Any competent reviewer examining the same model would reach the same conclusion. |
| **MEDIUM** | The finding is based on inference, partial evidence, or domain knowledge that may not be universally shared. A domain expert could reasonably disagree or request more context before accepting the finding. |
| **LOW** | The finding is speculative or depends on information not present in the model (e.g., external requirements, domain-specific norms, or undisclosed design intent). Treat as a question to raise with the model author rather than a confirmed defect. |

Decision aid:

- Evidence is a direct quote or explicit absence from the model → HIGH
- Finding depends on an engineering assumption or domain norm that reasonable engineers might apply differently → MEDIUM
- Confirming the finding would require external documents, domain expertise, or author intent not visible in the model → LOW

For MEDIUM or LOW findings, the `Confidence` output field must explain what limits certainty.

---

## Overall Assessment Score

At the end of each assessment, compute an **overall model score** for that criterion dimension:

```
If no issues were found:
    Overall Score = 1.0
Else:
    Overall Score = 1.0 − mean(all individual issue scores)
```

A score of **1.0** means no issues were found. A score of **0.0** means every issue found was near-certain to cause harm.

| Overall Score | Model Status for this Dimension |
|---|---|
| **0.9 – 1.0** | Good — minor improvements only |
| **0.7 – 0.89** | Notable gaps — address before finalising design decisions |
| **0.5 – 0.69** | Significant issues — not suitable for baseline or verification activities |
| **0.0 – 0.49** | Critical deficiencies — major rework required before this model can be used |
