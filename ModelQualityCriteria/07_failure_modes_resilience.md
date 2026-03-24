# SysML v2 Model Assessment: Failure Modes & Resilience

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model **adequately captures failure modes, fault states, degraded operational modes, and resilience mechanisms**. This check assesses whether the model can be used as a basis for safety analysis, hazard assessment, or dependability engineering — and whether the model reflects not just what the system does when everything works, but what it does when things go wrong.

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

Systems engineering models are frequently built to represent nominal (designed-for) operation only. Failure mode coverage requires a deliberate additional effort to model what can go wrong and how the system responds. Without this, the model:

- Cannot be used as input to FMEA, FMECA, FTA, or HAZOP analyses
- Cannot demonstrate that safety requirements are met
- Will produce designs that have undiscovered single points of failure
- Cannot be used to define test scenarios for safety-critical functions
- May silently omit entire operational states that real-world operators must manage

Failure coverage in a model is not the same as a separate safety case — it is about ensuring the model is rich enough to support one.

---

## Checks to Perform

> **How to apply these checks**: Each item below is a diagnostic question. Record a finding whenever the answer indicates a problem  -  answer **No** for checks asking whether something required is present, or **Yes** for checks asking whether a problem exists. Skip checks that are out of scope given your model characterisation, and note why.
### 1. Failure State Coverage in State Machines

- [ ] Does every state machine for a safety-relevant element include at least one fault or failure state?
- [ ] Is there a safe state explicitly modelled — the state the system enters when it cannot continue safe operation?
- [ ] Are all failure states reachable from nominal states via defined transitions? A failure state that cannot be entered from any nominal state is a modelling omission.
- [ ] Are recovery transitions defined — paths from failure states back to nominal or degraded states, with conditions and actions?
- [ ] Are there timeout transitions from nominal states that capture what happens when an expected event does not occur within a required time?
- [ ] Are watchdog or health monitoring states modelled — states that are entered when a heartbeat, health signal, or communication link is lost?
- [ ] Is there a distinction between transient faults (recoverable automatically) and permanent faults (requiring human intervention or maintenance)?

### 2. Failure Mode Identification

- [ ] Are the principal failure modes for each significant component identified? For mechanical elements: fatigue, fracture, wear, corrosion, jamming. For electronics: open circuit, short circuit, drift, latch-up. For software: incorrect output, no output, delayed output, unexpected output.
- [ ] Are failure modes linked to or traceable from the model elements they affect?
- [ ] Are external failure modes captured — what happens if an external system (GPS, power grid, communications network, partner system) fails?
- [ ] Are common cause failures considered — failure modes that simultaneously affect multiple elements (e.g., a power outage disabling all electronics)?
- [ ] Are software failure modes included — e.g., data corruption, buffer overflow leading to loss of control, incorrect sensor interpretation?
- [ ] Are human error modes considered where human actors are in the loop (e.g., operator selecting wrong mode, misinterpreting display)?

### 3. Failure Propagation

- [ ] Is it possible to trace from a component failure, through the model's connections and dependencies, to the system-level effect?
- [ ] Are there model elements that, if they fail, would cause downstream elements to fail or produce incorrect outputs, and are these dependencies captured?
- [ ] Are interface-level failures modelled — what happens when a connection carries a corrupt, late, or missing value?
- [ ] Are cascading failure paths identified — chains of failures where one failure triggers another?
- [ ] Is there a separation between the item that can fail and the item that detects the failure — are sensors, monitors, and diagnostics present as separate elements?
- [ ] Is there a defined "failure effect" for each modelled failure mode that states the consequence at the subsystem and system level?

### 4. Single Points of Failure

- [ ] Can each system-level function be mapped through the model to identify whether there is any single component whose failure would prevent that function?
- [ ] Are single points of failure explicitly identified and tagged in the model?
- [ ] For safety-critical functions, is every single point of failure mitigated by redundancy, fail-safe behaviour, or established safety argument?
- [ ] Are control paths (not just data paths) evaluated for single points of failure — e.g., a single point that could cause a spurious actuation or an undetectable loss of control?
- [ ] Are power supply paths single-point-of-failure free for safety-critical functions?

### 5. Degraded Operational Modes

- [ ] Are degraded or limp-home operational modes explicitly modelled as states or configurations?
- [ ] For each degraded mode, are the following defined:
  - What capability is lost or reduced?
  - What constraints apply in the degraded mode (reduced performance, restricted commands)?
  - What triggers entry into degraded mode?
  - What is required to exit degraded mode (e.g., maintenance action, self-recovery)?
- [ ] Are there graceful degradation paths — does losing one component cause a partial rather than total loss of function?
- [ ] Are the degraded modes and their constraints captured as requirements that the design must satisfy?

### 6. Safety Mechanism Coverage

- [ ] Are safety mechanisms (interlocks, monitors, watchdogs, redundancy, diversity) explicitly modelled as system elements, not assumed to exist without representation?
- [ ] Are the functional requirements for each safety mechanism captured as requirements?
- [ ] Are safety monitors modelled with their own failure modes — what happens if the monitor fails?
- [ ] Are interlocks modelled with their conditions, the actions they prevent, and the reset conditions?
- [ ] Are failure detection and diagnostic functions modelled at a level sufficient to evaluate their coverage and latency?
- [ ] Are independence requirements enforced in the model — e.g., are redundant paths structurally independent from common-mode components?

### 7. Fault Detection, Isolation & Recovery (FDIR)

- [ ] Is there a defined detection mechanism for every failure mode that the system is required to handle autonomously?
- [ ] Are fault isolation actions modelled — can the system identify which specific component or function has failed?
- [ ] Are recovery actions modelled — what steps does the system take to restore function after a detected fault?
- [ ] Are there time constraints on FDIR actions — maximum time to detect, isolate, and recover modelled and traceable to requirements?
- [ ] Are there scenarios where FDIR itself could fail, and are these modelled?

### 8. Requirement Traceability for Safety

- [ ] Are safety-critical functions explicitly identified and tagged in the model?
- [ ] Is every safety-critical function traceable to at least one safety requirement?
- [ ] Are safety requirements linked to the design elements that implement their required mitigations?
- [ ] Are there failure modes with no corresponding safety requirement and no documented justification for why one is not needed?
- [ ] Is the functional safety integrity level (SIL, DAL, ASIL, or equivalent) assigned to safety-critical functions and reflected in the model?

### 9. Combined & Multi-Fault Scenarios

- [ ] Are multi-fault scenarios considered, not just single-fault isolation?
- [ ] Are there combinations of partial failures that together produce a hazardous system state that no individual failure alone would produce?
- [ ] Are common cause failure groups identified — sets of elements that can fail together due to a shared root cause?
- [ ] Are there failure modes that are individually undetectable but whose combined effect is detectable — and is this addressed?

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

```ISSUE [FAILURE-###]
Element:        <Qualified name or path of the affected model element, or "Model-Wide">
Check:          <Check number and title, e.g. "4. Single Points of Failure">
Finding:        <Precise description of the missing failure mode, state, mechanism, or propagation path>
Evidence:       <Quote or reference to model content (or absence thereof)>
Failure Mode:   <Description of the failure mode or fault scenario that is not addressed>
Score:          <0.0 - 1.0>  -  <one-line justification for this score>
Confidence:     <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Safety Impact:  <What hazardous or undesired system state could result from this gap>
Recommendation: <What should be added  -  a state, transition, safety mechanism, or requirement>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.