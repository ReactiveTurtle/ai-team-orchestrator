# ai-team-orchestrator

Configurable CLI foundation for orchestrating AI development teams.

## Quick Start

```bash
npm install
npm run build
npm start -- init
npm start -- validate
npm start
npm start -- ui feature
npm start -- run feature-team "Add rate limit to login endpoint"
npm start -- run-command feature "Add rate limit to login endpoint"
npm start -- console feature
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
ai-team
ai-team ui feature
ai-team provider set "opencode run"
ai-team run-command feature "Add rate limit to login endpoint"
ai-team console feature
```

Each project owns its own `.ai-team` directory. That directory contains project-specific commands, principles, roles, employees, teams and policies.

The `ai-team` binary is global, but configuration is local to the current project.

You can run commands from nested folders. The CLI searches for the nearest `.ai-team` directory by walking upward from the current directory.

## Console Mode

Use terminal UI mode for a pane-based interactive interface. This is the default when running `ai-team` without arguments:

```bash
ai-team
```

or start with a specific command:

```bash
ai-team ui feature
```

The UI shows the chat/event stream, current command, current employee and step, configured commands, team flow, last run, and transcript path.

Inside the UI:

```text
Ctrl+P             open main menu in any keyboard layout
Esc                stop current running task
Tab                focus input
```

The main menu contains sections for Sessions, Commands, Provider, and Actions. Sessions are selected from a menu; use Enter to open a session, `n` to create a new session, and Esc to close the menu.

Slash commands still work as shortcuts, but the primary UI flow is menu-driven.

Provider settings are stored per project in `.ai-team/settings.json`. `AI_TEAM_OPENCODE_COMMAND` can still be used as a temporary override.

Use plain text console mode for a simpler chat-like workflow:

```bash
ai-team console
```

or start with a specific command:

```bash
ai-team console feature
```

Inside the console:

```text
/commands          list configured commands
/command review    switch current command
/status            show current console status
/last              show last run result again
/help              show console help
/exit              exit
```

Any other input is sent to the current configured command. Each message creates a new run, prints the assistant summary in the terminal, and stores transcript/state/artifacts under `.ai-team`.

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
