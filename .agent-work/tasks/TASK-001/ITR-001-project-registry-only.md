# ITR-001 - Project Registry Only

## Topic

Reduce the product to project registration and active project selection.

## Expected Result

After this iteration, the app can list, add, remove, and select remembered projects, confirmed by build and HTTP smoke tests.

## Primary Risk

Leaving obsolete command/task/chat routes or UI components in the active path.

## Main Decision

Keep `AppComponent` and the HTTP server as thin containers, but remove command/task/chat/provider behavior from the web app and server routing for this iteration.

## In Scope

- Project list UI.
- Add project by path.
- Select/open project.
- Remove remembered project.
- Static web serving.
- `/api/projects` project registry routes.

## Out Of Scope

- Commands.
- Roles/employees.
- Tasks/sessions.
- Runs/provider/SSE.
- Chat.
- Graph editor.

## Verification

- `npm run build`
- Start server and check `/` and `/api/projects`.
