# SysML v2 Model Assessment: Failure Modes & Resilience

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model **adequately captures failure modes, fault states, degraded operational modes, and resilience mechanisms**. This check assesses whether the model can be used as a basis for safety analysis, hazard assessment, or dependability engineering — and whether the model reflects not just what the system does when everything works, but what it does when things go wrong.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin

Read [_shared_protocol.md](_shared_protocol.md) for the model characterisation procedure, scoring guide, confidence rating definitions, and overall score formula. Apply that protocol throughout this assessment.

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

> **How to apply these checks**: Work through each item and record a finding for every problem identified. For items that do not apply given your model characterisation, state why and skip.
### 1. Failure State Coverage in State Machines

- Verify that every state machine for a safety-relevant element include at least one fault or failure state.
- Verify that a safe state explicitly modelled — the state the system enters when it cannot continue safe operation.
- Verify that all failure states reachable from nominal states via are defined transitions? A failure state that cannot be entered from any nominal state is a modelling omission.
- Check that recovery transitions defined — paths from failure states back to nominal or degraded states, with conditions and actions.
- Check whether there are timeout transitions from nominal states that capture what happens when an expected event does not occur within a required time.
- Check that watchdog or health monitoring states modelled — states that are entered when a heartbeat, health signal, or communication link is lost.
- Verify that a distinction between transient faults (recoverable automatically) and permanent faults (requiring human intervention or maintenance).

### 2. Failure Mode Identification

- Check that the principal failure modes for each significant component identified? For mechanical elements: fatigue, fracture, wear, corrosion, jamming. For electronics: open circuit, short circuit, drift, latch-up. For software: incorrect output, no output, delayed output, unexpected output.
- Check that failure modes linked to or traceable from the model elements they affect.
- Check that external failure modes captured — what happens if an external system (GPS, power grid, communications network, partner system) fails.
- Check that common cause failures considered — failure modes that simultaneously affect multiple elements (e.g., a power outage disabling all electronics).
- Check that software failure modes included — e.g., data corruption, buffer overflow leading to loss of control, incorrect sensor interpretation.
- Check that human error modes considered where human actors are in the loop (e.g., operator selecting wrong mode, misinterpreting display).

### 3. Failure Propagation

- Confirm that possible to trace from a component failure, through the model's connections and dependencies, to the system-level effect.
- Check whether there are model elements that, if they fail, would cause downstream elements to fail or produce incorrect outputs, and are these dependencies captured.
- Check that interface-level failures modelled — what happens when a connection carries a corrupt, late, or missing value.
- Check that cascading failure paths identified — chains of failures where one failure triggers another.
- Verify that a separation between the item that can fail and the item that detects the failure — are sensors, monitors, and diagnostics present as separate elements.
- Verify that a defined "failure effect" for each modelled failure mode that states the consequence at the subsystem and system level.

### 4. Single Points of Failure

- Confirm that each system-level function be mapped through the model to identify whether there is any single component whose failure would prevent that function.
- Check that single points of failure explicitly identified and tagged in the model.
- For safety-critical functions, is every single point of failure mitigated by redundancy, fail-safe behaviour, or established safety argument?
- Check that control paths (not just data paths) evaluated for single points of failure — e.g., a single point that could cause a spurious actuation or an undetectable loss of control.
- Check that power supply paths single-point-of-failure free for safety-critical functions.

### 5. Degraded Operational Modes

- Check that degraded or limp-home operational modes explicitly modelled as states or configurations.
- For each degraded mode, are the following defined:
  - What capability is lost or reduced?
  - What constraints apply in the degraded mode (reduced performance, restricted commands)?
  - What triggers entry into degraded mode?
  - What is required to exit degraded mode (e.g., maintenance action, self-recovery)?
- Check whether there are graceful degradation paths — does losing one component cause a partial rather than total loss of function.
- Check that the degraded modes and their constraints captured as requirements that the design must satisfy.

### 6. Safety Mechanism Coverage

- Check that safety mechanisms (interlocks, monitors, watchdogs, redundancy, diversity) explicitly modelled as system elements, not assumed to exist without representation.
- Check that the functional requirements for each safety mechanism captured as requirements.
- Check that safety monitors modelled with their own failure modes — what happens if the monitor fails.
- Check that interlocks modelled with their conditions, the actions they prevent, and the reset conditions.
- Check that failure detection and diagnostic functions modelled at a level sufficient to evaluate their coverage and latency.
- Check that independence requirements enforced in the model — e.g., are redundant paths structurally independent from common-mode components.

### 7. Fault Detection, Isolation & Recovery (FDIR)

- Verify that a defined detection mechanism for every failure mode that the system is required to handle autonomously.
- Check that fault isolation actions modelled — can the system identify which specific component or function has failed.
- Check that recovery actions modelled — what steps does the system take to restore function after a detected fault.
- Check whether there are time constraints on FDIR actions — maximum time to detect, isolate, and recover modelled and traceable to requirements.
- Check whether there are scenarios where FDIR itself could fail, and are these modelled.

### 8. Requirement Traceability for Safety

- Check that safety-critical functions explicitly identified and tagged in the model.
- Verify that every safety-critical function is traceable to at least one safety requirement.
- Check that safety requirements linked to the design elements that implement their required mitigations.
- Check whether there are failure modes with no corresponding safety requirement and no documented justification for why one is not needed.
- Check that the functional safety integrity level (SIL, DAL, ASIL, or equivalent) assigned to safety-critical functions and reflected in the model.

### 9. Combined & Multi-Fault Scenarios

- Check that multi-fault scenarios considered, not just single-fault isolation.
- Check whether there are combinations of partial failures that together produce a hazardous system state that no individual failure alone would produce.
- Check that common cause failure groups identified — sets of elements that can fail together due to a shared root cause.
- Check whether there are failure modes that are individually undetectable but whose combined effect is detectable — and is this addressed.

---

## Scoring & Overall Score

Apply the scoring, confidence, and overall score protocol in [_shared_protocol.md](_shared_protocol.md).
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
