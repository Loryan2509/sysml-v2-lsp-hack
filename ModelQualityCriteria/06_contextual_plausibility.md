# SysML v2 Model Assessment: Contextual Plausibility

## Purpose

You are a SysML v2 model validation agent. Your task is to assess whether a SysML v2 model describes a system that is **physically, operationally, and logically plausible** — that is, whether the specified system could exist and function as described given the laws of physics, established engineering practice, the deployment environment, and the operational context.

A model may be internally consistent whilst describing something that is not achievable. This check applies engineering domain knowledge and reasonableness to the model's content, going beyond what can be verified syntactically.

Evaluate the model systematically against each check below. For every issue found, record it using the output format defined at the end of this file.

---

## Before You Begin

Read [_shared_protocol.md](_shared_protocol.md) for the model characterisation procedure, scoring guide, confidence rating definitions, and overall score formula. Apply that protocol throughout this assessment.

---
## Conceptual Background

Contextual plausibility failures arise when:

- Specified performance values exceed what current or near-term technology can achieve
- Physical constraints (conservation of energy, Newtonian mechanics, thermodynamics) are violated by the model's assumptions
- Environmental or deployment conditions make the system's operation impossible or severely degraded
- The model assumes external system behaviours or environmental conditions that are unreliable or unrealistic
- Timing and sequencing assumptions are not achievable given real-world latencies or human reaction times
- The model describes an interaction or operation that is logically impossible or causally inverted

When assessing plausibility, the agent should flag concerns rather than make definitive engineering judgements. The goal is to surface issues for domain expert review, not to replace that review.

---

## Checks to Perform

> **How to apply these checks**: Work through each item and record a finding for every problem identified. For items that do not apply given your model characterisation, state why and skip.
### 1. Physical Plausibility

- Verify that the specified values for physical quantities (mass, force, velocity, pressure, temperature, power, voltage, current) fall within ranges achievable by real engineering systems.
- Check that the energy budget is closed — does the specified available energy/power supply cover all consuming elements at their specified maximum load, including margins.
- Check that the thermal budget is closed — does the specified cooling capacity cover all heat-generating components at their maximum dissipation.
- Check that the structural design (if modelled) respect load limits and material constraints.
- Check that mass, volume, and centre-of-gravity constraints compatible with the physical envelope specified.
- Identify any specified efficiencies exceed 100%, or do component efficiencies, when compounded, produce an impossible system efficiency.
- Check that signal levels, impedances, or electrical parameters specified at values consistent with the interfaces and media claimed.

### 2. Timing & Sequencing Plausibility

- Verify that all specified response times achievable given the processing capacity of the are allocated computing hardware and the complexity of the required computation.
- Check that end-to-end latency budgets (sensor → processing → actuation) achievable when the latencies of each stage are summed.
- Verify that communication latencies over the specified network or bus (including protocol overhead, arbitration, and retransmission) fit within the timing requirements.
- Check that human-in-the-loop response times specified at values consistent with known human reaction time distributions (typically > 150–200ms for trained operators, > 500ms for cognitive decisions).
- Check that startup or initialisation sequences achievable before the system is required to enter its first operational state.
- Check that watchdog timeout values consistent with the specified maximum execution times of the monitored functions (i.e., timeout > max execution time with margin).
- Identify any physical events specified to occur before their physical cause (causality violations).

### 3. Environmental Plausibility

- Check that the specified operating temperature, pressure, humidity, vibration, and radiation environments is consistent with the deployment scenario (e.g., altitude, geographic region, indoor/outdoor, space).
- Check that components specified that cannot survive the environmental conditions in which they are stated to operate.
- Check that materials or substances specified that would degrade, react, or fail when exposed to the specified environment.
- Check that the electromagnetic compatibility (EMC) assumptions realistic — e.g., is a sensitive RF receiver assumed to operate adjacently to a high-power transmitter without adequate isolation.
- Check that the specified lifetime of components is consistent with the environmental exposure (UV, humidity, thermal cycling, vibration fatigue).

### 4. Operational Plausibility

- Check that the specified operational concept is achievable by the human operators given their cognitive load, training level, number of simultaneous monitors, and available decision time.
- Check whether there are operational sequences that require actions to be performed simultaneously by a single operator when they require physical presence at different locations.
- Check that operational availability figures (uptime, duty cycle, MTBF, MTTR) consistent with each other and with the maintenance concept — e.g., does the required MTTR assume a spare part replacement that takes longer than specified.
- Check that the required system availability is achievable given the component reliabilities and the maintenance/repair concept (e.g., redundancy, repair rate).
- Check that supply chain or logistics dependencies assumed (e.g., consumables, calibration gases, fuel) that are not plausible given the deployment location.

### 5. External System & Environment Assumptions

- Check that the model assume continuous availability of external services (GPS, network connectivity, grid power, data feeds) in an environment where such availability cannot be guaranteed.
- Check that the modelled external system behaviours (partner systems, infrastructure, regulatory systems) is consistent with how those systems actually behave.
- Check that communication link budgets closed — does the specified data rate, range, and antenna configuration produce a received signal level above the noise floor with adequate link margin.
- Check that bandwidth or spectrum assumptions consistent with what is available or licensed in the deployment environment.
- Check that the assumed human behaviour of external users, operators, or adversaries realistic (e.g., assuming all users will follow nominal procedures perfectly).

### 6. Architectural Plausibility

- Check that the specified system is achievable within the technology readiness level (TRL) available to the programme — are components or capabilities assumed that do not yet exist.
- Check that stated integration paths between subsystems physically achievable — are connectors, form factors, voltages, and protocols compatible.
- Check that the proposed software architecture for the real-time elements is achievable on the specified hardware — does the worst-case execution time fit within the period.
- Check that specified reliability targets (MTBF, probability of failure on demand, safety integrity level) achievable with the specified component count, redundancy level, and maintenance philosophy.

### 7. Causal Plausibility

- Verify that all specified control loops have a physically realisable feedback path — i.e., can the sensor observe the effect of the actuator, and is the loop gain and bandwidth achievable.
- Verify that all information flows logically causal — does each consumer receive information only after it has been produced.
- Identify any circular data dependencies in parametric models that would produce an unsolvable constraint system.
- Check that effects specifiedto propagate faster than physically possible (e.g., a mechanical response assumed instantaneous, an acoustic wave assumed to travel faster than the speed of sound).

---

## Scoring & Overall Score

Apply the scoring, confidence, and overall score protocol in [_shared_protocol.md](_shared_protocol.md).
---

## Output Format

For each issue found, produce a record in the following format:

```ISSUE [PLAUSIBILITY-###]
Element:        <Qualified name or path of the affected model element, or "Model-Wide">
Check:          <Check number and title, e.g. "2. Timing & Sequencing Plausibility">
Finding:        <Precise description of the plausibility concern  -  what is specified and why it may not be achievable>
Evidence:       <Quote or reference to the specific model content that raises the concern>
Domain Basis:   <The physical law, engineering principle, or established practice that appears to be violated>
Score:          <0.0 - 1.0>  -  <one-line justification for this score>
Confidence:     <HIGH | MEDIUM | LOW>  -  <if MEDIUM or LOW, explain what limits certainty>
Impact:         <What happens if this issue is not addressed>
Recommendation: <How to address  -  e.g., revise value, add feasibility analysis, confirm with domain expert>```

Produce a **summary table** at the end with columns: **ID | Score | Confidence | One-line description**.

If no issues are found for a check, state: `CHECK PASSED: <check name>  -  <one sentence on what was examined and why it passed>.`

Once all checks are complete, compute and report the **Overall Assessment Score** using the formula above.
