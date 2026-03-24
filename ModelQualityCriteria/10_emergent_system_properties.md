# SysML v2 Model Assessment: Emergent & System-Level Properties

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model **adequately captures emergent and system-level properties** — behaviours, capabilities, or failure modes that arise from the interactions of components rather than from any single component in isolation. This check assesses whether the model can be used to reason about holistic system behaviour, system-level performance, and properties that only become apparent when the model is analysed as a whole.

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

Emergent properties are characteristics of a system that cannot be predicted from examining individual components in isolation — they arise from the interactions, dependencies, and coupling between parts. A model that faithfully describes every component individually may still be dangerously incomplete if it cannot support reasoning about these system-level effects.

Common examples of emergence in engineered systems:

- A system meets all individual component timing budgets yet experiences intermittent data loss due to a race condition in message ordering
- All subsystems operate within thermal limits individually, yet the assembled system suffers thermal runaway due to co-location heating effects
- All software modules handle errors gracefully in isolation, yet the system deadlocks when two modules simultaneously wait on each other's acknowledgement
- Reliability metrics derived from individual components predict 99.9% availability, yet the system's achieved availability is far lower due to correlated failure modes and maintenance dependencies

Because emergence is inter-actional rather than compositional, it is seldom captured by element-by-element checks. This assessment file specifically targets the gaps that only surface at the system level.

---

## Checks to Perform

> **How to apply these checks**: Each item below is a diagnostic question. Record a finding whenever the answer indicates a problem  -  answer **No** for checks asking whether something required is present, or **Yes** for checks asking whether a problem exists. Skip checks that are out of scope given your model characterisation, and note why.

### 1. System-Level Property Specification

- [ ] Are system-level properties that can only be evaluated at the whole-system level explicitly identified? Examples include: end-to-end latency, system availability, mission success probability, information throughput, and system-level heat dissipation.
- [ ] Are these system-level properties specified as verifiable requirements, not just as informal goals or notes?
- [ ] Is there a clear distinction between component-level properties (managed at subsystem level) and system-level properties (measurable only when the system is assembled and operating)?
- [ ] Are system-level properties quantified with bounds, not left as qualitative statements (e.g., "high reliability" without a numeric target)?
- [ ] Are system-level properties traceable from stakeholder needs through to verifiable system-level requirements and allocated design constraints?

### 2. Functional Emergence from Component Interactions

- [ ] Are the cross-subsystem dependencies that together produce system-level functions explicitly modelled (e.g., an N2 diagram, interface matrix, or dependency view)?
- [ ] Are functions that depend on coordination between multiple subsystems identified, and is that coordination visible in the model (sequence of actions, shared state, synchronisation conditions)?
- [ ] Are there system-level functions that appear nowhere in any single subsystem's behaviour model but only arise from the combination? Flag these as potential emergent function gaps requiring explicit modelling.
- [ ] Are timing relationships between subsystems captured at the system level, not only locally within each subsystem? Specifically: end-to-end latency chains, pipeline stage dependencies, and synchronisation points.
- [ ] Are resource sharing arrangements modelled — shared buses, shared power rails, shared memory spaces, shared actuators — where simultaneous use by multiple subsystems produces interaction effects?

### 3. Negative Emergent Behaviours

- [ ] Are the following categories of negative emergent behaviour considered and either modelled or explicitly argued as non-applicable:
  - **Deadlock**: Two or more subsystems each waiting on the other to proceed, resulting in system stall
  - **Livelock**: Subsystems continuously changing state in response to each other without making progress
  - **Race conditions**: Outcomes that depend on the relative timing of concurrent events that the model does not resolve
  - **Resource starvation**: A subsystem denied access to a shared resource indefinitely due to scheduling or priority interactions
  - **Priority inversion**: A low-priority task holding a resource needed by a high-priority task, indirectly pre-empting it
  - **Resonance**: Periodic excitation at or near a natural frequency producing amplified oscillation (mechanical, electrical, or software polling loops)
  - **Thermal runaway**: Positive feedback loop in temperature where increased temperature increases heat generation further
  - **Feedback instability**: A control loop whose gain or phase margin is insufficient to remain stable across the operating envelope
  - **Cascading overload**: A failure in one subsystem increases load on others until a tipping point is reached and the system collapses
- [ ] For any of the above that are considered applicable, is there model evidence that the design addresses or mitigates them?
- [ ] Are there numerical thresholds, stability margins, or coverage criteria associated with the mitigation?

### 4. Feedback Loops and Dynamic Stability

- [ ] Are all significant feedback control loops in the system identified and captured in the model — including ones that span subsystem boundaries?
- [ ] For each feedback loop, is the following captured:
  - The sensor or measurement that provides the feedback signal
  - The actuator or output that the control action affects
  - The plant dynamics (even at a high level, e.g., a constraint or `param def`)
  - The control law or algorithm that translates error to control action
- [ ] Are there any unintended feedback paths created by the architecture — where the output of one subsystem influences its own input through a chain of other subsystems — that are not accounted for in the control design?
- [ ] Are stability conditions or margins stated? Examples: gain margin, phase margin, settling time, or a constraint that the control loop must remain stable over a specified range of plant parameter variation.
- [ ] Are any open-loop operations identified where feedback is deliberately absent or delayed, and are the implications for controllability captured?

### 5. System-of-Systems Context

- [ ] If this system is intended to operate as part of a larger system-of-systems (SoS), are the external systems (constituent systems) and their interfaces to this system modelled at a level sufficient to reason about joint emergent behaviour?
- [ ] Are the operational modes where this system and an external system must coordinate explicitly captured?
- [ ] Are there emergent properties at the SoS level — capabilities that only exist when this system operates alongside partner systems — that need to be reflected in requirements or constraints on this system's interfaces?
- [ ] Are the effects of external system failure or degradation on the emergent SoS behaviour addressed? Can this system detect and respond appropriately if a partner system behaves unexpectedly?
- [ ] Are there governance or command-and-control arrangements between systems-of-systems constituents that affect emergent behaviour (e.g., conflicting authority, ambiguous handoff conditions) and are these modelled or documented?

### 6. Load, Saturation, and Environmental Interaction Effects

- [ ] Are worst-case loading conditions identified at the system level — conditions where multiple subsystems simultaneously demand resources or produce peak loads?
- [ ] Are there non-linear system-level effects that emerge under load that cannot be predicted from individual subsystem specs (e.g., shared bus saturation, thermal crosstalk, acoustic interference)?
- [ ] Are environmental interactions captured that affect the system as a whole rather than individual components — e.g., vibration transmitted through a shared chassis, electromagnetic interference from co-located electronics, humidity ingress affecting multiple systems simultaneously?
- [ ] Are operating envelope boundaries explicitly identified — the conditions (load, temperature, speed, duty cycle, frequency) beyond which the system's emergent behaviour is no longer predictable or has not been analysed?
- [ ] Are edge cases modelled where the system must operate at or near the boundary of its intended envelope — not just nominal conditions?

### 7. Temporal and Ordering Effects

- [ ] Is the system start-up and initialisation sequence modelled with sufficient fidelity to identify ordering dependencies between subsystems?
- [ ] Are there conditions where the relative order of events across subsystems produces different system states? Are these identified and the correct ordering enforced in the model?
- [ ] Are message or data ordering assumptions made explicit — what happens if data arrives out of sequence, late, or duplicated?
- [ ] Is the shut-down and power-down sequence modelled for any system where incorrect ordering could cause damage, data loss, or unsafe states?
- [ ] Are mode transitions at the system level modelled to show which subsystems must transition in a defined sequence, with what preconditions and postconditions?

### 8. System-Level Analysis and Simulation Support

- [ ] Does the model contain sufficient detail at the system level to support analysis methods such as N2 diagrams, functional flow block diagrams, system simulation, reliability block diagrams, or fault trees — even if those artefacts are external to the model?
- [ ] Are interface definitions rich enough (flow type, protocol, timing, value range) to support system-level modelling and simulation?
- [ ] Are `param def` or `constraint def` elements used to capture system-level engineering relationships (mass budgets, power budgets, link budgets, latency chains) that connect component-level quantities to system-level properties?
- [ ] Are analysis viewpoints or model views defined that allow a reviewer to inspect the system's key interaction patterns without navigating every element?
- [ ] Are system-level simulations, coupled analyses, or co-simulation interfaces referenced or represented in the model?

### 9. Verification of Emergent Properties

- [ ] Are the system-level emergent properties identified in Check 1 linked to verification activities?
- [ ] Are system integration tests or system-level test scenarios defined that specifically target emergent behaviours rather than just component-level correctness?
- [ ] Is there an explicit test or analysis for each identified negative emergent behaviour type (deadlock analysis, stability margin test, thermal simulation, etc.)?
- [ ] Are simulation environments, hardware-in-the-loop (HIL) rigs, or test beds identified that are necessary to observe and verify emergent properties not visible in component-level tests?
- [ ] Is there a defined acceptance criterion for each system-level emergent property, such that it is unambiguous whether the system has passed verification?

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

```
ISSUE [EMERGENT-###]
Element:           <Qualified name or path of the affected model element, or "Model-Wide">
Check:             <Check number and title, e.g. "3. Negative Emergent Behaviours">
Finding:           <Precise description of the missing specification, unmodelled interaction, or unaddressed emergent effect>
Evidence:          <Quote or reference to model content (or absence thereof)>
Emergence Type:    <Positive (intended system-level capability) | Negative (harmful interaction) | Uncertain>
Trigger Conditions: <What conditions or combination of states cause this emergent effect to manifest>
Score:             <0.0 - 1.0>  -  <one-line justification for this score>
Confidence:        <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Impact:            <What analysis, design decision, or safety argument is invalidated or blocked>
Recommendation:    <What should be added  -  a constraint, analysis hook, system-level requirement, or interaction model>
```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.
