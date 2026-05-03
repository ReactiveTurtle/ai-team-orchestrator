import { join } from "node:path";
import { fileExists, writeText } from "../fs-utils.js";
import { AI_TEAM_DIR } from "../config.js";

export async function initCommand(rootDir = process.cwd()): Promise<void> {
  const base = join(rootDir, AI_TEAM_DIR);
  const files: Record<string, string> = {
    [join(base, "commands", "feature.yaml")]: `name: feature\ndescription: Run the default feature development flow.\nteam: feature-team\ntask_template: |\n  Implement the following feature request:\n\n  {{input}}\n`,
    [join(base, "principles", "engineering.md")]: `# Engineering Principles\n\n- Preserve the existing architecture unless there is an explicit reason to change it.\n- Prefer the smallest correct change.\n- Keep responsibilities separated between layers and modules.\n- Do not introduce a new approach when an accepted project approach already exists.\n- Record important decisions, tradeoffs and risks.\n`,
    [join(base, "roles", "builder.md")]: `You are Builder.\n\nResponsibilities:\n- implement the requested change\n- preserve existing project architecture\n- return concise decisions and changed artifacts\n`,
    [join(base, "roles", "reviewer.md")]: `You are Reviewer.\n\nResponsibilities:\n- review the current state against requested quality axes\n- detect architectural drift, responsibility boundary violations, missing tests and hidden risks\n- return structured findings and a clear verdict\n`,
    [join(base, "roles", "explainer.md")]: `You are Explainer.\n\nResponsibilities:\n- summarize the completed work\n- record decisions, risks and test status\n- prepare a human-readable handoff\n`,
    [join(base, "employees", "backend-builder.yaml")]: `name: backend-builder\nrole: builder\nbackend: opencode\nmodel: gpt-5.5\nextra_instructions: |\n  Prefer the smallest correct change. Do not introduce new architecture without justification.\n`,
    [join(base, "employees", "strict-reviewer.yaml")]: `name: strict-reviewer\nrole: reviewer\nbackend: opencode\nmodel: gpt-5.5\nproject_context:\n  review_style: strict\nextra_instructions: |\n  Interpret general quality axes according to the current repository conventions.\n`,
    [join(base, "employees", "pr-explainer.yaml")]: `name: pr-explainer\nrole: explainer\nbackend: opencode\nmodel: gpt-5.5\n`,
    [join(base, "teams", "feature-team.yaml")]: `name: feature-team\nmembers:\n  - backend-builder\n  - strict-reviewer\n  - pr-explainer\nflow:\n  start: build\n  steps:\n    build:\n      employee: backend-builder\n      next: review\n    review:\n      employee: strict-reviewer\n      review_level: 3\n      next:\n        if_needs_fix: build\n        if_approved: explain\n    explain:\n      employee: pr-explainer\n      next: done\nlimits:\n  max_iterations: 5\n`,
    [join(base, "policies", "review.yaml")]: `quality_axes:\n  - domain_model_integrity\n  - responsibility_boundaries\n  - consistency_with_project_conventions\n  - architectural_drift\n  - test_coverage\n  - maintainability\nlevels:\n  "1":\n    focus:\n      - obvious_bugs\n      - style\n  "3":\n    focus:\n      - responsibility_boundaries\n      - consistency_with_project_conventions\n      - tests\n  "5":\n    focus:\n      - domain_model_integrity\n      - architectural_drift\n      - security\n      - migration_risks\n`
  };

  let created = 0;
  for (const [path, content] of Object.entries(files)) {
    if (fileExists(path)) continue;
    await writeText(path, content);
    created += 1;
  }

  console.log(created === 0 ? "Configuration already exists." : `Created ${created} configuration files in ${AI_TEAM_DIR}.`);
  console.log(`Project config: ${base}`);
}
