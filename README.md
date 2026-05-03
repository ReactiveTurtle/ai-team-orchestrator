# ai-team-orchestrator

Configurable CLI foundation for orchestrating AI development teams.

## Quick Start

```bash
npm install
npm run build
npm start -- init
npm start -- validate
npm start -- run feature-team "Add rate limit to login endpoint"
npm start -- run-command feature "Add rate limit to login endpoint"
```

By default runs use dry-run mode. To connect an executor, set:

```bash
AI_TEAM_OPENCODE_COMMAND="opencode run" npm start -- run feature-team "..."
```

The command receives the assembled employee prompt via stdin.

## Use In Any Project

During local development of this orchestrator:

```bash
npm install
npm run build
npm link
```

Then in any target project:

```bash
cd path/to/your-project
ai-team init
ai-team validate
ai-team run-command feature "Add rate limit to login endpoint"
```

Each project owns its own `.ai-team` directory. That directory contains project-specific commands, principles, roles, employees, teams and policies.

The `ai-team` binary is global, but configuration is local to the current project.

You can run commands from nested folders. The CLI searches for the nearest `.ai-team` directory by walking upward from the current directory.

For package-based usage without linking:

```bash
npm install -g path/to/ai-team-orchestrator
```

## Concept

- The application core is generic: config loading, validation, orchestration, state, routing and backend execution.
- User specificity lives in `.ai-team` and is layered on top of the core.
- `commands` define user-facing presets that choose a team and task template.
- `principles` define workspace-wide engineering rules included in every employee prompt.
- `roles` define reusable professional instructions.
- `employees` bind a role to a concrete backend/model/context.
- `teams` define workflow, routing and limits.
- `policies` define general quality contracts such as review axes and review levels.
- `runs` store state, events and artifacts.

## Workspace Layout

```text
.ai-team/
  commands/     user-facing command presets
  principles/   shared engineering principles
  roles/        reusable role prompts
  employees/    concrete agents
  teams/        configurable flows
  policies/     general quality policies
  runs/         generated runtime state and artifacts
```

The orchestrator should not contain project-specific architecture knowledge. It only assembles these layers and controls the flow.
