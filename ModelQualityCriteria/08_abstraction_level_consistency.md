# SysML v2 Model Assessment: Abstraction Level Consistency

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model maintains **consistent levels of abstraction** within and across views, diagrams, and packages. Inconsistent abstraction levels are a subtle but serious modelling defect: they produce models that mix concerns from different points in the design process, make certain analyses impossible, and silently impose premature design commitments.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin

Read [_shared_protocol.md](_shared_protocol.md) for the model characterisation procedure, scoring guide, confidence rating definitions, and overall score formula. Apply that protocol throughout this assessment.

---
## Conceptual Background

In a well-structured SysML v2 model, different levels of abstraction serve different engineering purposes:

| Abstraction Level | Typical Content |
|---|---|
| Stakeholder / Operational | Actors, missions, use cases, capabilities, high-level requirements |
| System / Logical | Functions, logical flows, system-level behaviour, system requirements |
| Subsystem / Design | Components, interfaces, allocated behaviour, derived requirements |
| Implementation / Physical | Specific parts, part numbers, electrical schematics, code architecture |

Elements from different levels can coexist in a model, but they must be in clearly delimited contexts (packages, viewpoints, concern layers) and should not be mixed within the same structural hierarchy or diagram without explicit and justified reason.

Premature implementation detail destroys option space — specifying how before establishing what prevents alternative design exploration. Missing implementation detail where it is expected creates gaps in verification.

---

## Checks to Perform

> **How to apply these checks**: Work through each item and record a finding for every problem identified. For items that do not apply given your model characterisation, state why and skip.
### 1. Intra-Hierarchy Abstraction Consistency

- Within a single structural hierarchy (`part def` decomposition or package), verify that all elements are at a comparable level of abstraction — none should mix high logical-level blocks with detailed physical or implementation-level elements in the same context.
  - Example defect: A top-level system decomposition where one block is "Navigation Function" (logical) and an adjacent sibling block is "STM32F4 Microcontroller" (physical implementation).
- Check whether stakeholder-level actors and implementation-level components are mixed within the same structural decomposition or package context.
- Check that action decompositions consistent in grain size — are all sub-actions at the same level of specificity, or does one branch decompose to primitive operations while another remains at a high capability level.
- Verify that all value and attribute definitions within a single block at a are consistent level of specificity — or does the block mix strategic-level metrics with component-level parameters.

### 2. Cross-Hierarchy Abstraction Leakage

- Check that physical or implementation-specific elements appearing in logical or functional decompositions.
  - Example: A specific commercial-off-the-shelf component appearing as a block in a functional architecture that is claimed to be implementation-independent.
- Check that software-specific constructs (threads, tasks, memory addresses, APIs) appearing in a hardware or physical architecture context.
- Check that logical interfaces defined in terms of physical-layer protocols when the logical level should be protocol-agnostic.
- Check that high-level mission requirements referencing low-level implementation parameters that should be determined by the design, not specified as requirements.
- Check whether there are abstract functional blocks that have implementation-specific constraints applied to them (e.g., a timing constraint that only makes sense for a specific processor architecture being applied to a logical function).

### 3. Decomposition Depth Inconsistency

- Check that some subsystems decomposed to many more levels than others at the same level of the hierarchy, without justification for the difference in depth.
  - Example: One functional area decomposed to five levels of sub-functions, whilst adjacent functions of similar complexity are left as leaf-level blocks.
- Check that the depth of behavioural modelling (number of levels of action decomposition) is consistent across functions of similar complexity and safety criticality.
- Check that requirements decomposed to different levels of specificity across different subsystems, making cross-subsystem comparison or allocation impossible.
- Check that the decomposition of interfaces is consistent — are some interfaces defined at a message/parameter level whilst others remain as a single typed port.

### 4. Premature Design Lock-In

- Check that specific technologies, vendor products, or implementation choices specified at a model layer where requirements or logical architecture is expected.
  - Example: A requirement that specifies a CAN 2.0B bus at 500 kbps when the requirement should only specify data rate and reliability — the choice of CAN should be a design decision, not a requirement.
- Check that component form factors, mounting locations, or connector types specified in a logical model before a physical design model has been established.
- Check that software design patterns (specific algorithms, data structures, frameworks) constrained at the system requirements level where they should be determined in software architecture.
- Check whether there are constraints in the model that would prevent future design evolution without requirement changes, when those constraints should be design decisions.

### 5. Missing Abstraction Steps

- Check whether there is a direct mapping from stakeholder-level needs to physical implementation without intermediate logical or design levels — this skips the analytical layers that allow requirements to be validated and alternative designs to be explored.
- Check whether there are requirements that jump directly from system-level capability statements to component-level specifications without derived subsystem requirements linking them.
- Check that behaviours described at the implementation level (e.g., interrupt service routines, DMA transfers) without corresponding logical-level behaviour models that the implementation is realising.

### 6. Viewpoint Boundary Violations

- [ ] Are elements that should belong to a specific viewpoint (e.g., the security viewpoint, the safety viewpoint, the performance viewpoint) scattered across the general model rather than being organised in their own viewpoint context?
- [ ] Are elements from one viewpoint referenced directly by elements from an incompatible viewpoint without an explicit cross-viewpoint relationship?
- [ ] Are different concerns (structural, behavioural, parametric) mixed in the same package or namespace without viewpoint separation?

### 7. Abstraction Consistency Across Lifecycle Phases

- [ ] Is the model appropriate for its current lifecycle phase? Elements appropriate for a Phase B detailed design should not appear in a Phase A concept model, and vice versa.
- [ ] Are there parts of the model that appear overly speculative or under-specified relative to the maturity expected at the current phase?
- [ ] Are TBD/TBC elements approximately consistent in their distribution — or is one area of the model highly mature while another is at a sketch level, suggesting inconsistent development effort?

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

```ISSUE [ABSTRACTION-###]
Element:          <Qualified name or path of the affected model element(s), or "Model-Wide">
Check:            <Check number and title, e.g. "2. Cross-Hierarchy Abstraction Leakage">
Finding:          <Precise description of the abstraction inconsistency  -  what is at the wrong level and why>
Evidence:         <Quote or reference to model content demonstrating the issue>
Expected Level:   <What abstraction level should this element or content be at>
Actual Level:     <What abstraction level does the element or content appear to be at>
Score:            <0.0 - 1.0>  -  <quality score: 1.0 = passes check, 0.0 = critical defect; one-line justification>
Confidence:       <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Impact:           <What analysis or design freedom is compromised>
Recommendation:   <How to restructure, separate, or move the content to restore abstraction consistency>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.
