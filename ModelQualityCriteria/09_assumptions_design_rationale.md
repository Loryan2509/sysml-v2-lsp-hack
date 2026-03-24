# SysML v2 Model Assessment: Assumptions & Design Rationale

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model **explicitly captures the assumptions it relies upon and the rationale behind its design decisions**. Models that contain unstated assumptions are fragile — changes in context, environment, or understanding can silently invalidate the model without any visible signal in the model itself. Similarly, absent design rationale means the reasoning behind architectural choices is lost, making future changes unsafe because the constraints that drove the original decisions are unknown.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin: Model Characterisation

Before applying any checks, briefly summarise the following about the model under assessment. Use this characterisation as the basis for all subsequent judgements.

- **System purpose**: What is the system designed to do, and for whom?
- **Operational domain**: What environment does it operate in (e.g., aerospace, automotive, medical, industrial, defence)?
- **Lifecycle phase**: What engineering phase does the model represent (concept, preliminary design, detailed design, verification)?
- **Model scope**: Is this a complete system model, a fragment, a specific view, or one variant of a product family?
- **Known scope limitations**: Note any areas intentionally excluded from this model; skip the relevant checks below with a documented rationale rather than raising false findings.

> **Recommended execution order across all assessment files**: 01 -> 05 -> 03 -> 07 -> 02 -> 06 -> 04 -> 08 -> 09 -> 10

---
## Conceptual Background

Every engineering model rests on a foundation of assumptions that are not derived from requirements or verifiable from the design alone. These include:

- **Environmental assumptions**: What conditions the system will (and will not) encounter
- **Operational assumptions**: How users, operators, and partner systems will behave
- **Interface assumptions**: What external systems will provide, in what form, and with what reliability
- **Technology assumptions**: What capabilities are achievable within the programme's timeframe and budget
- **Lifecycle assumptions**: How the system will be maintained, upgraded, and eventually retired

When these assumptions are violated — by a change in the deployment environment, a requirement change, a partner system revision, or an emerging operational scenario — the affected model elements can become invalid without any obvious defect appearing in the model.

Design rationale records the engineering logic behind architectural choices. Without it:

- Future engineers cannot distinguish a constraint that is fundamental from one that is arbitrary
- Refactoring or change impact assessment is guesswork
- The same design analysis is repeated from scratch whenever the model is revisited
- Trade-offs that were deliberately closed are unknowingly reopened

---

## Checks to Perform

> **How to apply these checks**: Each item below is a diagnostic question. Record a finding whenever the answer indicates a problem  -  answer **No** for checks asking whether something required is present, or **Yes** for checks asking whether a problem exists. Skip checks that are out of scope given your model characterisation, and note why.
### 1. Operating Environment Assumptions

- [ ] Are the assumed operating conditions (temperature range, humidity, pressure, radiation, vibration, EMI) explicitly stated in the model, either as constraints, attribute bounds, or documented assumptions?
- [ ] Is the geographic or orbital deployment envelope explicitly defined, or is it assumed implicitly?
- [ ] Are any environmental conditions assumed to be always present (e.g., gravity, atmospheric pressure, ambient lighting) that in some deployment scenarios may not hold?
- [ ] Are assumptions about connectivity (network availability, GPS signal, power grid) explicitly documented rather than implicit in the design?
- [ ] Are worst-case environmental conditions bounded — or does the model silently assume benign conditions?

### 2. External System & Interface Assumptions

- [ ] Are assumptions about the behaviour of external systems (data format, protocol, timing, availability, accuracy) explicitly captured adjacent to the interfaces that depend on them?
- [ ] Is it documented what the model assumes external systems will do in off-nominal conditions (e.g., "Assume the upstream sensor always sends valid data within 10ms")?
- [ ] Are performance assumptions about third-party or COTS components documented — e.g., assumed latency, throughput, MTBF — especially where these have not been formally verified?
- [ ] Are the trust boundaries documented — what external systems are assumed to be trusted, and which are assumed to be potentially adversarial?
- [ ] Where a standard or protocol is assumed (e.g., IEEE 802.11, ARINC 429), is the specific version and profile documented?

### 3. Operational & Human Behaviour Assumptions

- [ ] Are assumptions about human operator behaviour documented — training level, response time, concurrency of tasks, error rate?
- [ ] Are nominal usage patterns assumed (e.g., "operators will not simultaneously activate modes A and B")? If so, are they documented, and are there interlocks to enforce them?
- [ ] Are assumptions about maintenance intervals, calibration periods, and consumable replenishment rates documented?
- [ ] Are assumptions about who will operate the system, at what skill level, and with what support resources documented?

### 4. Technology & Capability Assumptions

- [ ] Are assumptions about the technology readiness of key components or subsystems stated — is anything assumed to exist that is not currently proven?
- [ ] Are availability of components, materials, or manufacturing processes assumed without documentation?
- [ ] Are software performance assumptions (processing speed, memory, compile-time configuration) documented for the target hardware?
- [ ] Are assumptions about the availability and accuracy of models used in parametric analyses (e.g., aero databases, material property models) documented?

### 5. Lifecycle & Programme Assumptions

- [ ] Are assumptions about the system's operational lifetime documented?
- [ ] Are assumptions about maintenance concepts (field replacement, depot repair, no maintenance) documented and consistent with the reliability model?
- [ ] Are assumptions about growth margins (mass, power, data link capacity) documented — i.e., is there a stated margin policy and is it reflected in the constraint values?
- [ ] Are assumptions about what will change (and what will remain fixed) across system variants or product lines documented?

### 6. Design Decision Rationale

- [ ] Are the key architectural decisions documented with rationale — explaining not just what was chosen but why, and what alternatives were considered and rejected?
  - Example decisions requiring rationale: choice of communication bus, redundancy architecture, processing topology, safety mechanism type, control law structure.
- [ ] Are there design decisions in the model that would be non-obvious to a new reader — choices that deviate from common practice or that are surprising given the requirements?
- [ ] Where a constraint or specification value appears arbitrary (e.g., a specific timeout, a specific frequency), is there a rationale or source reference explaining why that value was chosen?
- [ ] Are known unresolved trade-offs documented — cases where a decision is still open and future analysis is required?

### 7. Known Unknowns & TBD Tracking

- [ ] Are TBD (To Be Determined) and TBC (To Be Confirmed) elements explicitly flagged and tracked in the model, rather than silently omitted or assigned placeholder values?
- [ ] Is there a consistent mechanism in the model for marking TBD elements — e.g., a specific comment, stereotype, or tag?
- [ ] Is the scope of TBDs bounded — does each TBD have a responsible owner, an expected resolution date, and a description of what information is needed to resolve it?
- [ ] Are any TBD values used in calculations or analyses without appropriate caveats about the uncertainty in those results?
- [ ] Are there implied assumptions that effectively foreclose a TBD decision before it has been made — e.g., a TBD interface specification but a design element that only works with one specific answer?

### 8. Assumption Validity & Sensitivity

- [ ] For critical assumptions, is there a documented assessment of what happens if the assumption is violated — what downstream model elements would be invalidated?
- [ ] Are any assumptions listed that are known to be at risk — e.g., highly uncertain external system behaviour, unproven component performance — and flagged for close monitoring?
- [ ] Are there constraints or requirements that are only valid given a specific assumption, and is that dependency explicitly linked in the model?
- [ ] Have assumptions been reviewed and validated by appropriate domain experts or stakeholders, and is this documented?

---

## Scoring

Each finding is assigned a **probability score from 0.0 to 1.0** representing the estimated likelihood that this issue, if left unresolved, will cause a harmful outcome  -  such as an incorrect design decision, safety gap, verification failure, or analytical error.

| Score Range | Interpretation |
|---|---|
| **0.9 - 1.0** | Near-certain to cause analysis failure, incorrect decision, or unmitigated safety gap |
| **0.7 - 0.89** | High likelihood of causing significant analytical error or blocking a key decision |
| **0.5 - 0.69** | Moderate likelihood of harm; likely to surface as a problem under specific conditions |
| **0.2 - 0.49** | Low-to-moderate likelihood; reduces model confidence but may not cause immediate failure |
| **0.0 - 0.19** | Very low likelihood; an observation or minor inconsistency unlikely to cause harm in the current state |

Use the following decision aid when assigning a score:
- Is an analysis blocked entirely from being performed? -> Score >= 0.9
- Will an analysis likely produce a wrong result? -> Score 0.7-0.89
- Will a decision be made without necessary information? -> Score 0.5-0.69
- Is the model weaker but not currently producing wrong results? -> Score 0.2-0.49
- Is this a stylistic or minor cleanliness observation? -> Score 0.0-0.19

### Confidence Level

Each finding also carries a **Confidence** rating indicating how certain the assessment is that the finding is real and correctly characterised.

| Confidence | Meaning |
|---|---|
| **HIGH** | The finding is directly supported by explicit evidence in the model text. No domain assumption is required. Any competent reviewer examining the same model would reach the same conclusion. |
| **MEDIUM** | The finding is based on inference, partial evidence, or domain knowledge that may not be universally shared. A domain expert could reasonably disagree or request more context before accepting the finding. |
| **LOW** | The finding is speculative or depends on information not present in the model (e.g., external requirements, domain-specific norms, or undisclosed design intent). Treat as a question to raise with the model author rather than a confirmed defect. |

Use the following decision aid when assigning a confidence level:
- Is the evidence a direct quote or explicit absence from the model? -> HIGH
- Does the finding depend on an engineering assumption or domain norm that reasonable engineers might apply differently? -> MEDIUM
- Would confirming the finding require external documents, domain expertise, or author intent not visible in the model? -> LOW

For MEDIUM or LOW findings, the `Confidence` output field must explain what limits certainty.

### Overall Assessment Score

At the end of the assessment, compute an **overall model score** for this dimension:

```
Overall Score = 1.0  -  mean(all individual issue scores)
```

A score of **1.0** means no issues were found. A score of **0.0** means every issue found was near-certain to cause harm.

| Overall Score | Model Status for this Dimension |
|---|---|
| 0.9 - 1.0 | Good  -  minor improvements only |
| 0.7 - 0.89 | Notable gaps  -  address before finalising design decisions |
| 0.5 - 0.69 | Significant issues  -  not suitable for baseline or verification activities |
| 0.0 - 0.49 | Critical deficiencies  -  major rework required before this model can be used |

---

## Output Format

For each issue found, produce a record in the following format:

```ISSUE [ASSUMPTION-###]
Element:             <Qualified name or path of the affected model element, or "Model-Wide">
Check:               <Check number and title, e.g. "2. External System & Interface Assumptions">
Finding:             <Precise description of the undocumented assumption or missing rationale>
Evidence:            <Quote or reference to model content revealing the implicit assumption>
Assumption/Decision: <Statement of the assumption or decision that is missing from the model>
Score:               <0.0 - 1.0>  -  <one-line justification for this score>
Confidence:          <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
If Violated:         <What breaks or becomes invalid if this assumption does not hold>
Recommendation:      <How to make the assumption explicit  -  e.g., add comment, constraint, requirement, rationale>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.