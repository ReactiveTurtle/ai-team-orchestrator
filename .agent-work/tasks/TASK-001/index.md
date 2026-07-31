# TASK-001 - Reset UI To Project Registry

## Goal

Start over with the smallest useful product: a local web app that can open project folders and remember them between launches.

## Success Criteria

- The web UI shows remembered projects.
- A user can add a project by path.
- A user can select/open a project and the selection is persisted.
- A user can remove a project from the remembered list without deleting files.
- The app builds successfully.

## Constraints

- Keep the existing CLI/server entrypoint working.
- Do not remove git history.
- Do not implement commands, tasks, chat, runs, providers, roles, employees, or graph editing in this task.

## Known Risks

- Old backend routes and UI components can accidentally remain reachable and keep complexity alive.
- Project registry is stored outside the repo under the user app data directory.

## Excluded Work

- Team/role/command editor.
- Task/session list.
- Chat.
- Provider execution.
- OpenCode streaming.
