# ai-team-orchestrator

Configurable local Angular web application and CLI foundation for orchestrating AI development teams.

## Quick Start

```bash
npm install
npm run build
npm start -- init
npm start -- validate
npm start
npm start -- server
npm start -- tui feature
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
ai-team server
ai-team provider set "opencode run"
ai-team run-command feature "Add rate limit to login endpoint"
ai-team console feature
```

Each project owns its own `.ai-team` directory. That directory contains project-specific commands, principles, roles, employees, teams and policies.

The `ai-team` binary is global, but configuration is local to the current project.

You can run commands from nested folders. The CLI searches for the nearest `.ai-team` directory by walking upward from the current directory.

## Web UI

Use the local web UI for the interactive workflow. This is the default when running `ai-team` without arguments:

```bash
ai-team
```

Start the server without opening a browser:

```bash
ai-team server
```

The Angular web UI starts on a separate project selection page. Projects are shown as cards, can be added by path, opened, refreshed, or removed from the ai-team list.

Inside a selected project, the UI shows the chat/event stream, selected command, current employee and step, configured flow, provider settings, tasks, live progress, public reasoning, and last run status.

Inside the UI:

```text
Ctrl+P             open main menu in any keyboard layout
Esc                close menu or stop current running task
```

The main menu contains sections for Projects, Tasks, Commands, Provider, and Actions. Tasks open in a separate task list overlay. Switching projects or tasks does not stop a running process; only the explicit stop action interrupts provider execution.

Projects are managed in the browser. Add a project by path from the project cards page, open a registered project, and remove projects from the list without deleting files from disk. A project must contain `.ai-team`, or the path must be inside a directory tree that contains `.ai-team`.

Provider settings are stored per project in `.ai-team/settings.json`. `AI_TEAM_OPENCODE_COMMAND` can still be used as a temporary override.

## Terminal And Console Modes

Use the legacy terminal UI if you need a terminal-only interface:

```bash
ai-team tui feature
```

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
  sessions/     task transcripts
  settings.json project-local provider/UI settings
```

The orchestrator should not contain project-specific architecture knowledge. It only assembles these layers and controls the flow.
