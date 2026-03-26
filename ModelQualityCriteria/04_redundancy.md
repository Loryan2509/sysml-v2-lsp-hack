# SysML v2 Model Assessment: Redundancy

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model contains **unnecessary duplication** of model elements, relationships, requirements, or definitions. Redundancy in a model is not simply a cleanliness problem — it creates divergence risk, inconsistency, and maintenance burden. When the same concept is defined twice, changes made to one definition will not automatically propagate to the other, causing the model to silently become internally inconsistent over time.

Redundancy must be distinguished from **intentional design redundancy** (e.g., redundant hardware for fault tolerance), which is architecturally deliberate and should be explicitly annotated as such.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin

Read [_shared_protocol.md](_shared_protocol.md) for the model characterisation procedure, scoring guide, confidence rating definitions, and overall score formula. Apply that protocol throughout this assessment.

---
## Conceptual Background

Model redundancy typically arises from:

- Copy-paste modelling where an existing block or requirement is duplicated rather than referenced or specialised
- Parallel development where two people independently model the same concept
- Iterative modelling where an old version of an element is not removed when a new version is created
- Overly eager decomposition that creates child elements restating what the parent already expresses

In SysML v2, redundancy is particularly harmful because the language provides powerful reuse mechanisms (`specialization`, `subclassification`, `ref`, `binding`, `redefinition`) that make duplication unnecessary in almost all cases.

---

## Checks to Perform

> **How to apply these checks**: Work through each item and record a finding for every problem identified. For items that do not apply given your model characterisation, state why and skip.
### 1. Duplicate Requirements

- Check whether there are two or more requirement elements whose text is identical or nearly identical, without one being a derivation or refinement of the other.
- Check whether there are requirements at different levels of the hierarchy that state the same constraint at the same level of specificity, suggesting the lower-level requirement was created by copying rather than deriving.
- Check that requirements duplicated across packages (e.g., a system-level package and a subsystem-level package) without an explicit `derivedReq` or `refine` relationship linking them.
- Check whether the same stakeholder needs restated as both a stakeholder requirement and a system requirement with identical wording, without the expected abstraction step?
- Check whether there are verification cases that are identical or near-identical, verifying the same requirement in the same way multiple times.

### 2. Duplicate Block or Part Definitions

- Check whether there are two or more `part def` or `item def` blocks that represent the same physical or logical entity but are named differently (e.g., `PowerSupply` and `PSU` as separate definitions).
- Check whether there are blocks that have nearly identical sets of attributes and ports, suggesting they should be unified as a single definition or one should specialise the other.
- Check whether there are `part` usages in different contexts that refer to different blocks but that block appears to model the same real-world component.
- Check whether there are multiple definitions of the same interface type scattered across packages rather than a single definition imported or referenced where needed.

### 3. Redundant Relationships

- Check whether there are multiple `satisfy` relationships from the same design element to the same requirement.
- Check whether there are multiple `allocate` relationships assigning the same function to the same component.
- Check that structural `connect` statements that duplicate information already expressed by flow definitions or interface bindings.
- Check whether there are `bind` constraints in parametric models that equate the same pair of attributes multiple times.
- Check whether there are generalisation and `specialization` chains that express the same relationship twice (e.g., A specialises B, and B specialises C, but also A is directly stated to specialise C when this is already implied).

### 4. Redundant Behaviour Models

- Check whether there are two state machines in the model that represent the same operational lifecycle of the same element.
- Check whether there are action definitions or sequences that duplicate steps already captured elsewhere in the model, without being a decomposition or specialisation of the original.
- Check whether the same message exchange patterns are captured multiple times in the model without one being a refinement of the other.
- Check whether the same guard conditions and transitions reproduced across multiple states or state machines where a shared mechanism would suffice?

### 5. Redundant Attributes & Constraints

- Check whether the same physical or performance attributes (e.g., mass, voltage, data rate) defined on both a general definition and a specific usage, where the usage simply repeats the definition's value without redefinition?
- Check that constraint blocks applied multiple times to the same set of values in different contexts, where a single application would suffice.
- Check whether there are derived attributes that simply restate a base attribute without transformation — i.e., a "copy" rather than a computation.
- Check that units re-specified at every level of the hierarchy when they are already implied by the type.

### 6. Redundant Decomposition

- Check whether there are intermediate blocks in a decomposition hierarchy that add no structural, behavioural, or constraint content — i.e., single-child pass-through blocks that serve no organising purpose.
- Check whether there are empty packages that exist only as namespace placeholders without content or future purpose.
- Check whether there are action decompositions where a parent action contains only a single sub-action with no additional structure, guards, or parameters — making the parent layer redundant.

### 7. Unintentional vs. Intentional Redundancy

For any redundancy identified, determine whether it could be **intentional design redundancy** (e.g., two independent power supply paths for reliability). The distinctions are:

- Intentional architectural redundancy should be **explicitly annotated** with a comment, stereotype, or requirement that justifies it (e.g., "Redundant for single-fault tolerance per requirement REQ-045").
- If a duplicated element lacks any such annotation or justification, it should be flagged as potentially unintentional.
- If redundancy appears in requirements or model structure (not in physical architecture), it is almost certainly unintentional.

### 8. States that are never activated

Behaviour architecture can prohibit the possibility of some modelled events occuring, for example, if a cooling fan is triggered at 85 degrees celcius, but an emergency shut down kicks in at 80 degrees celcius, the cooling fan will never be triggered and is redundant.
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

```ISSUE [REDUNDANCY-###]
Element(s):     <Qualified names or paths of all duplicated model elements involved>
Check:          <Check number and title, e.g. "1. Duplicate Requirements">
Finding:        <Precise description of what is duplicated and how>
Evidence:       <Quotes or references to both (or all) instances of the duplicated content>
Score:          <0.0 - 1.0>  -  <quality score: 1.0 = passes check, 0.0 = critical defect; one-line justification>
Confidence:     <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Risk:           <How this redundancy could lead to inconsistency or incorrect analysis>
Recommendation: <Whether to remove, merge, specialise, or annotate  -  and which instance to keep>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.
