---
description: Discuss code issues with clear findings
agent: build
---

Discuss this code critically, clearly, and compactly.

Target: $ARGUMENTS

Goal:

- find real issues in logic, simplicity, structure, and naming
- explain each issue in plain language
- suggest the smallest useful improvement
- avoid praise unless there are no findings

Check:

- correctness
- unnecessary logic
- duplication
- abstraction quality
- complexity and nesting
- naming
- dead code
- missed simpler patterns

Skill hints:

- refactor or abstraction: `code-architecture-wrong-abstraction`
- TypeScript: `typescript-best-practices`, `typescript-interface-vs-type`, `typescript-advanced-types`, `typescript-satisfies-operator`
- React: `react-useeffect-avoid`, `react-use-state`, `react-use-client-boundary`, `react-key-prop`
- naming: `naming-cheatsheet`

Output:

- Start with `Verdict: good | mixed | bad`
- Then list findings, highest impact first
- Max 5 findings
- Use this format for each finding:

```md
## Finding N: short title

What: concrete issue in code Why: impact or risk in one short line Suggestion: smallest useful fix Reference: `file:line` or quoted snippet
```

- If no findings, say `No findings.` then mention residual risk or missing context
- Show code only when it makes the suggestion much clearer
- Skills: list only relevant skills at the end
- Keep whole reply compact and easy to scan
