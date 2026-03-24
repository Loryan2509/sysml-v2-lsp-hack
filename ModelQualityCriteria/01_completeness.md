# SysML v2 Model Assessment: Completeness

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model is **complete** — that is, whether all elements that should exist are present and sufficiently specified. A model may be syntactically valid yet critically incomplete in ways that will cause downstream design failures, unresolved ambiguities, or gaps in verification coverage.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin

Read [_shared_protocol.md](_shared_protocol.md) for the model characterisation procedure, scoring guide, confidence rating definitions, and overall score formula. Apply that protocol throughout this assessment.

---
## Conceptual Background

Completeness in a SysML v2 model means:

- Every concept in scope is represented by at least one model element
- Every model element has sufficient detail for its intended purpose at the current level of the engineering lifecycle
- Every connection, interface, flow, and relationship has both ends specified
- No element is a stub or placeholder without flagging it explicitly

Incompleteness is one of the most common and most costly modelling defects. It is particularly dangerous because the model appears valid — nothing is wrong with what is there, but critical things are simply absent.

---

## Checks to Perform

> **How to apply these checks**: Work through each item and record a finding for every problem identified. For items that do not apply given your model characterisation, state why and skip.
### 1. Requirements Coverage

- Verify that all stakeholder-level requirements are present in the model as `requirement` definitions.
- Verify that every requirement has:
  - A non-empty `doc` or text body describing what is required?
  - A subject that identifies what part of the system it constrains?
  - At least one `satisfy` or `verify` relationship, or is it explicitly marked as pending/TBD?
- Check whether there are requirements referenced in documentation or external artefacts that do not appear in the model.
- Check that derived requirements are present and linked to their parent via `derivedReq` or refinement.
- Check that non-functional requirements are present — performance, safety, reliability, maintainability, interoperability.

### 2. System Boundary

- Verify that a top-level element representing the system under study is present (`part def` or top-level allocation block).
- Check that external actors, systems, and environments are identified and modelled as external elements (e.g., context-level parts outside the system boundary).
- Verify that the model text explicitly delimits the system boundary — for example via a top-level context block with clearly identified external `part` instances — rather than leaving it implicit.
- Verify that all external interfaces — everything crossing the system are boundary — are identified as ports or connections on that boundary element.

### 3. Structural Decomposition

- Verify that every subsystem or major function is represented as a `part` or `item` definition.
- Verify that all parts are decomposed to a level of detail appropriate for the model's current maturity and intended use.
- Identify any blocks defined but never instantiated as parts anywhere in a composition hierarchy.
- Verify that all leaf-level components are specified with enough attributes (mass, power draw, interfaces, etc.) to be usable in analysis.
- Verify that every `part` is typed by a `part def`, with no anonymous or untyped parts.

### 4. Interface & Connection Completeness

- Verify that every `port` on every block has a defined direction (`in`, `out`, `inout`) and a flow type.
- Verify that every `port` is connected to exactly one counterpart in the context where the owning block is used as a part. (Unconnected ports should be flagged.)
- Verify that all connections (`connect`) between parts use compatible port types.
- Verify that all flows (`flow`) are typed with an `item def` or `attribute def`, with no untyped flows.
- Check that interface definitions are present for every significant system-to-system boundary crossing.

### 5. Behaviour Completeness

- Check whether there is at least one behavioural model (action, state machine, or sequence) for every operationally significant function.
- Verify that all `action def` blocks have:
  - Defined input and output parameters (typed)?
  - A body (`perform`, `succession`, or delegation to sub-actions) if they are not leaf-level?
- Verify that all operational scenarios or modes are represented in at least one behaviour model.
- Check that entry, exit, and `do` behaviours are present on states where behaviour is expected to occur.
- Verify that all state machine transitions are fully are specified with a trigger, guard (where applicable), and effect (where applicable).
- Verify that every state in a state machine is reachable from the initial state.
- Check whether there is at least one terminal or final state in each state machine.

### 6. Value & Constraint Completeness

- Verify that all `attribute` definitions typed with an appropriate value type (including units).
- Check that bounds (min, max, nominal) are specified for all critical numerical attributes.
- Check that `constraint` blocks are present for all quantitative requirements (performance budgets, timing limits, energy budgets).
- Check that parametric models (`constraint def`) are bound to actual attribute values in a usage context.
- Check that units are consistent and explicit (e.g., SI units, not bare real numbers).

### 7. Allocation Completeness

- Verify that all functional elements are allocated to physical elements via `allocate`.
- Verify that all software functions are allocated to hardware execution platforms.
- Verify that all physical components are allocated to a logical or geographical zone where relevant.
- Verify that all interfaces are allocated to physical communication media.
- Verify that every allocation relationship is navigable in both directions — can you trace from function to physical host and back.

### 8. Scenario & Use Case Coverage

- Verify that a defined mission or operational scenario exists that exercises the full system.
- Verify that all identified operational modes are covered by at least one scenario.
- Check that startup, shutdown, and transition sequences are explicitly modelled.
- Check that off-nominal scenarios (degraded operations, safe states) are modelled, not just nominal scenarios.

### 9. Verification Methods

- Verify that every requirement has a is defined verification method (test, analysis, demonstration, inspection).
- Check that verification cases or test scenarios are present and linked to requirements.
- Confirm that it is clear which model elements serve as evidence for each verification activity.

---

## Scoring & Overall Score

Apply the scoring, confidence, and overall score protocol in [_shared_protocol.md](_shared_protocol.md).
---

## Output Format

For each issue found, produce a record in the following format:

```ISSUE [COMPLETENESS-###]
Element:        <Qualified name or path of the affected model element, or "Model-Wide">
Check:          <Check number and title, e.g. "4. Interface & Connection Completeness">
Finding:        <Precise description of what is missing or incomplete>
Evidence:       <Quote or reference to model content (or absence thereof)>
Score:          <0.0 - 1.0>  -  <one-line justification for this score>
Confidence:     <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Impact:         <What analysis, decision, or artefact is blocked or invalidated>
Recommendation: <What should be added or changed to resolve this issue>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.
