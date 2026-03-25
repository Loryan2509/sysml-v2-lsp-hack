# SysML v2 Model Assessment: Conflicting Requirements & Constraints

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model contains **conflicting requirements, constraints, or specifications** — cases where two or more model elements impose conditions that cannot be simultaneously satisfied, that contradict each other, or that create a design space with no valid solution.

Conflicts are among the most dangerous model defects because they guarantee that no correct design can emerge from the model in its current state. They are also frequently invisible to the individual authors of each requirement, since conflicts only manifest when two independently authored elements are analysed together.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin

Read [_shared_protocol.md](_shared_protocol.md) for the model characterisation procedure, scoring guide, confidence rating definitions, and overall score formula. Apply that protocol throughout this assessment.

---
## Conceptual Background

Conflicts in a SysML v2 model can be:

- **Hard conflicts**: mathematically or logically impossible to satisfy simultaneously (e.g., X > 10 and X < 5 on the same value)
- **Soft conflicts**: technically satisfiable but practically incompatible given engineering reality (e.g., maximum mass < sum of minimum component masses)
- **Latent conflicts**: individually reasonable requirements whose interaction produces an unresolvable tension that only appears during design (e.g., minimum reliability and maximum cost)
- **Temporal conflicts**: requirements that cannot be satisfied at the same time but the model does not define when each applies

The agent must reason about all of these, not just obvious logical contradictions.

---

## Checks to Perform

> **How to apply these checks**: Work through each item and record a finding for every problem identified. For items that do not apply given your model characterisation, state why and skip.
### 1. Numeric Constraint Conflicts

- Check whether there are two or more constraints applied to the same attribute or value that impose overlapping or contradictory bounds.
  - Example: One constraint requires `voltage >= 12V` and another requires `voltage <= 10V` on the same bus.
- Check that the sum of minimum-value constraints on sub-components exceed the maximum-value constraint on the parent.
  - Example: Subsystem mass minimums sum to 85 kg, but the system-level mass budget maximum is 80 kg.
- Check whether there are timing constraints where the sum of sequential step durations exceeds the end-to-end deadline.
- Check whether there are throughput or data rate requirements that, when combined across all channels, exceed the link capacity constraint.
- Check whether there are power consumption lower bounds on components that, summed, exceed the power supply upper bound.
- Check whether there are temperature range requirements on components that are incompatible with the operating environment temperature constraints.

### 2. Behavioural Conflicts

- Check whether there are transitions from the same source state with the same trigger but guards that overlap (i.e., both guards could simultaneously be true for the same system state).
- Check whether there are actions in a state machine or activity that must execute but whose preconditions are mutually exclusive with a constraint imposed elsewhere.
- Check whether there are conflicting sequencing requirements — e.g., requirement A mandates that action X occurs before action Y, whilst requirement B mandates Y before X.
- Check whether there are liveness requirements (e.g., "the system shall always eventually respond") that conflict with safety requirements that mandate the system halt or lock out in certain states.
- Check whether there are real-time deadlines specified for two concurrent actions that cannot both be met on the allocated hardware given its processing capacity.

### 3. Interface & Protocol Conflicts

- Verify that two ends of a connection specify incompatible flow types — e.g., one end expects an integer signal and the other produces a floating-point value.
- Verify that two ends of a connection specify incompatible rates — e.g., one end produces at 100 Hz but the other requires data at 1 kHz.
- Check whether there are connection ends with opposing directionality — both declared as `out` — with no intermediate mediator.
- Verify that protocol specifications on either side of an interface conflict regarding handshake sequence, timing, or message ordering.
- Verify that redundant interfaces specify different timeout or retry policies that would produce contradictory system behaviour at runtime.

### 4. Requirement-Level Conflicts

- Check whether there are two or more requirements that impose contradictory constraints on the same system quality attribute (e.g., one requiring MTBF > 10,000 hours and another requiring a design-life of 3 years with no maintenance, which may conflict depending on usage rate).
- Check whether there are safety requirements that mandate fail-safe shutdown and availability requirements that mandate continuous operation, without a defined resolution or priority ordering for the conflict.
- Check whether there are security requirements that mandate data isolation and interoperability requirements that mandate data sharing on the same interface.
- Check whether there are cost or mass minimisation requirements that conflict with reliability or redundancy requirements that mandate additional components.
- Identify any child-level (subsystem) requirements, when taken together, violate a parent-level (system) requirement they are supposed to satisfy.

### 5. Allocation Conflicts

- Check that the same function allocated to more than one physical component without the intent being explicitly redundant execution.
- Check that the total processing load of all functions allocated to a given processor greater than the processor's is specified capacity.
- Check that a function allocated to a component flagged as being in a thermal zone, radiation environment, or vibration range that exceeds the component's specified operational limits.
- Check that a software function allocated to a hardware element that does not have the required interface (port, bus, sensor input) to execute that function.
- Check whether there are functions allocated to components in locations that make the required physical connectivity to other functions impossible.

### 6. Safety vs. Functional Conflicts

- Check whether there are functional requirements that mandate a behaviour that a safety constraint explicitly prohibits or limits.
  - Example: A functional requirement to "maximise thrust" conflicting with a safety constraint that limits thrust below a given temperature threshold.
- Check whether there are operational mode requirements that place the system in a configuration that violates a safety monitor constraint.
- Check that safety shutdown conditions specified in a way that would interrupt a function that a separate requirement mandates be uninterruptible.
- Verify that a conflict between a watchdog or health monitoring timeout value and the maximum specified execution time for a monitored function.

### 7. Priority & Resolution

For every conflict identified:

- Verify that a documented priority ordering between the conflicting requirements (e.g., safety requirements take precedence).
- Verify that a `satisfy`, `refine`, or rationale note that explains how an apparent conflict is resolved in the current design.
- If no resolution is documented, is the conflict raising a genuine irresolvable contradiction that must be escalated to stakeholders?

---

## Scoring

Each finding is assigned a **quality score from 0.0 to 1.0** where **1.0 means the element fully satisfies the check** (no defect) and **0.0 means a critical defect near-certain to cause analysis failure, an incorrect design decision, or an unmitigated safety gap**.

| Score Range | Interpretation |
|---|---|
| **0.9 - 1.0** | Passes or near-passes the check; at most a very minor observation |
| **0.7 - 0.89** | Minor gap; reduces model confidence but unlikely to cause immediate failure |
| **0.5 - 0.69** | Moderate defect; likely to surface as a problem under specific conditions |
| **0.2 - 0.49** | Significant defect; high likelihood of causing analytical error or blocking a key decision |
| **0.0 - 0.19** | Critical defect; near-certain to cause analysis failure, incorrect decision, or unmitigated safety gap |

Use the following decision aid when assigning a score:
- Is this a stylistic or minor cleanliness observation? -> Score 0.9-1.0
- Is the model weaker but not currently producing wrong results? -> Score 0.7-0.89
- Will a decision be made without necessary information? -> Score 0.5-0.69
- Will an analysis likely produce a wrong result? -> Score 0.2-0.49
- Is an analysis blocked entirely from being performed? -> Score <= 0.2

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
Overall Score = mean(all individual issue scores)
```

A score of **1.0** means all checks passed with no defects. A score of **0.0** means every issue found was a critical defect near-certain to cause harm.

| Overall Score | Model Status for this Dimension |
|---|---|
| 0.9 - 1.0 | Good  -  minor improvements only |
| 0.7 - 0.89 | Notable gaps  -  address before finalising design decisions |
| 0.5 - 0.69 | Significant issues  -  not suitable for baseline or verification activities |
| 0.0 - 0.49 | Critical deficiencies  -  major rework required before this model can be used |

---

## Output Format

For each issue found, produce a record in the following format:

```ISSUE [CONFLICT-###]
Element(s):     <Qualified names or paths of all conflicting model elements>
Check:          <Check number and title, e.g. "1. Numeric Constraint Conflicts">
Finding:        <Precise description of the conflict  -  what is in tension with what>
Evidence:       <Quotes or references to the specific model content from each conflicting element>
Conflict Type:  <Hard | Soft | Latent | Temporal>
Score:          <0.0 - 1.0>  -  <quality score: 1.0 = passes check, 0.0 = critical defect; one-line justification>
Confidence:     <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Impact:         <What design decision is blocked, or what analysis produces contradictory results>
Recommendation: <Options to resolve  -  e.g., relax a constraint, add priority ordering, request stakeholder decision>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.
