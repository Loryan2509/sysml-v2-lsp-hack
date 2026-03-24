# SysML v2 Model Assessment: Correctness & Intent Fidelity

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model **correctly represents the system as intended** by the stakeholders and system architects. A model may be complete in structure yet still misrepresent the system — through wrong semantics, incorrect relationships, reversed flows, or contradictions between the model and its authoritative source material.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin

Read [_shared_protocol.md](_shared_protocol.md) for the model characterisation procedure, scoring guide, confidence rating definitions, and overall score formula. Apply that protocol throughout this assessment.

---
## Conceptual Background

Correctness in this context has two dimensions:

1. **Semantic correctness** — the SysML v2 constructs used mean what the modeller intended them to mean. Misuse of SysML semantics (e.g., using `part` where `ref` is intended, or `attribute` where `port` is needed) produces a structurally valid but semantically wrong model.

2. **Intent fidelity** — the model reflects the actual operational concept, architectural intent, and engineering specification. Even if the SysML is used correctly, the model may diverge from what the system is supposed to do.

These are distinct failure modes. A modeller may use SysML correctly but model the wrong system, or may understand the system but use SysML incorrectly to express it.

---

## Checks to Perform

> **How to apply these checks**: Work through each item and record a finding for every problem identified. For items that do not apply given your model characterisation, state why and skip.
### 1. Architectural Intent Alignment

- Check that the top-level decomposition reflect the agreed architectural viewpoint (functional, logical, physical, or hybrid).
- Check that the subsystem boundaries in the model are consistent with the system architecture definition document or equivalent authoritative source.
- Check that the partitioning of responsibilities between subsystems in the model match the intended allocation.
- Identify any elements that appear to belong to a different architectural layer than the one being modelled (e.g., physical components appearing in a functional model).
- Check that the model reflects the correct system configuration — is the right variant, baseline, or configuration modelled.

### 2. Behaviour Fidelity

- Verify that state machines reflect the actual operational modes and transitions defined in the concept of operations (ConOps) or operational concept document.
- Check that action sequences expressed with `succession`, `then`, and `perform` constructs are consistent with the intended operational sequence — verify the ordering is correct and no steps are swapped or omitted.
- Check that timing constraints on transitions and actions consistent with the engineering specification.
- Check that guards on transitions and decisions accurately reflecting the real conditions that trigger them (not oversimplified or inverted).
- Check that concurrency — parallel action flows and orthogonal state regions — correctly represents what happens simultaneously versus sequentially.
- Verify that message exchanges modelled via `send`, `receive`, `exhibit`, or `accept` actions are ordered consistently with the expected interaction protocols between components.

### 3. Flow Direction & Type Correctness

- Verify that all flow directions (`in`, `out`, `inout`) on ports correct relative to the block that owns them.
- Verify that material flows, energy flows, and information/data flows use appropriate and distinct item types — are they not mixed or exchanged as the same typed flow.
- Check that the items flowing through connections is correct — is the right entity (mass, signal, power, data packet) being flowed on each connection.
- Check that control flows and data flows kept appropriately separate in activity models.
- Check that causal directions in parametric models correct — are the right attributes marked as inputs vs. outputs to constraint blocks.

### 4. Structural Semantics Correctness

- Check that `part` usage (composite ownership) used only where the owning element genuinely owns the lifecycle of the owned part? Where sharing or referencing is intended, is `ref` used instead.
- Check that multiplicities (`[1]`, `[0..*]`, `[1..*]`, `[0..1]`) on parts, connections, and ports consistent with the real cardinality of those relationships in the physical/operational world.
- Check that `specialization` (`::>`) relationships used only where genuine classification inheritance is intended, not as a shortcut for association.
- Check that `redefine` used where it should be, rather than silently shadowing inherited features.
- Check that `bind` constraints used correctly in parametric models to equate the right parameters to the right attributes.

### 5. Value & Parameter Correctness

- Check that the numerical values for key attributes (mass, power, voltage, frequency, data rate, etc.) are consistent with the engineering specification or datasheet.
- Check that units correct and consistent — e.g., is mass in kilograms everywhere, or is there an implicit mix of grams and kilograms.
- Check that reference frames, coordinate systems, or bases clearly defined where directional or positional attributes exist.
- Check that nominal, minimum, and maximum bounds correctly ordered (min ≤ nominal ≤ max).
- Check that boolean conditions and logical expressions in constraints and guards in the correct polarity — is a condition checking for the right state (e.g., not accidentally inverted).

### 6. Requirement–Design Alignment

- Verify that each design element that satisfies a requirement genuinely fulfil the requirement's intent — or does the `satisfy` relationship connect a requirement to an element that is merely adjacent.
- Check that performance requirements linked to the model elements that actually produce that performance, not to a parent assembly that merely contains those elements.
- Check that safety requirements traced to safety mechanisms or mitigations that are actually present in the model.
- Check whether there are requirements whose text conflicts with the design that supposedly satisfies them.

### 7. Naming & Vocabulary Consistency

- Check that names of model elements consistent with the system's established terminology (from the glossary, ICD, or ConOps).
- Check whether the same concepts referred to by different names in different parts of the model, creating the impression of distinct elements where there is only one?
- Check whether there are names that are misleading — implying a capability, behaviour, or relationship that the element does not actually have.
- Check that abbreviations expanded consistently, and is the standard abbreviation used where one exists.

### 8. Interface Contract Correctness

- Verify that interface definitions on both sides of a connection agree on: flow type, direction (producer/consumer), data rate or quantity, and protocol where applicable.
- Where one block defines a required interface and another defines a provided interface, do the two definitions match?
- Identify any interface constraints (timing, ordering, latency) specified and consistent with what the connected components declare they can deliver.

---

## Scoring & Overall Score

Apply the scoring, confidence, and overall score protocol in [_shared_protocol.md](_shared_protocol.md).
---

## Output Format

For each issue found, produce a record in the following format:

```ISSUE [CORRECTNESS-###]
Element:        <Qualified name or path of the affected model element, or "Model-Wide">
Check:          <Check number and title, e.g. "3. Flow Direction & Type Correctness">
Finding:        <Precise description of the correctness problem>
Evidence:       <Quote or reference to model content demonstrating the problem>
Score:          <0.0 - 1.0>  -  <one-line justification for this score>
Confidence:     <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Impact:         <What is wrong or misleading  -  what decision would be made incorrectly>
Recommendation: <What should be changed to make the model correct>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.
