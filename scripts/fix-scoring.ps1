$files = Get-ChildItem 'C:\temp\sysml-v2-lsp-hack\ModelQualityCriteria\*.md'

$oldBlock1 = "Each finding is assigned a **probability score from 0.0 to 1.0** representing the estimated likelihood that this issue, if left unresolved, will cause a harmful outcome  -  such as an incorrect design decision, safety gap, verification failure, or analytical error.

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
- Is this a stylistic or minor cleanliness observation? -> Score 0.0-0.19"

$newBlock1 = "Each finding is assigned a **quality score from 0.0 to 1.0** where **1.0 means the element fully satisfies the check** (no defect) and **0.0 means a critical defect near-certain to cause analysis failure, an incorrect design decision, or an unmitigated safety gap**.

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
- Is an analysis blocked entirely from being performed? -> Score <= 0.2"

$oldFormula = "Overall Score = 1.0  -  mean(all individual issue scores)"
$newFormula = "Overall Score = mean(all individual issue scores)"

$oldExplain = "A score of **1.0** means no issues were found. A score of **0.0** means every issue found was near-certain to cause harm."
$newExplain = "A score of **1.0** means all checks passed with no defects. A score of **0.0** means every issue found was a critical defect near-certain to cause harm."

$oldScore = "<0.0 - 1.0>  -  <one-line justification for this score>"
$newScore = "<0.0 - 1.0>  -  <quality score: 1.0 = passes check, 0.0 = critical defect; one-line justification>"

foreach ($f in $files) {
    $content = [System.IO.File]::ReadAllText($f.FullName)
    $before = $content
    $content = $content.Replace($oldBlock1, $newBlock1)
    $content = $content.Replace($oldFormula, $newFormula)
    $content = $content.Replace($oldExplain, $newExplain)
    $content = $content.Replace($oldScore, $newScore)
    if ($content -ne $before) {
        [System.IO.File]::WriteAllText($f.FullName, $content, [System.Text.UTF8Encoding]::new($false))
        Write-Output "Updated: $($f.Name)"
    } else {
        Write-Output "NO CHANGE: $($f.Name)"
    }
}
