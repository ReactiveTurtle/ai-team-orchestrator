import { join } from "node:path";
import { fileExists, writeText } from "../fs-utils.js";
import { AI_TEAM_DIR } from "../config.js";
import { saveGlobalRoles } from "../global-roles.js";

export async function initCommand(rootDir = process.cwd()): Promise<void> {
  const base = join(rootDir, AI_TEAM_DIR);
  const roles: Record<string, string> = {
    исполнитель: `Ты исполнитель.\n\nОбязанности:\n- реализовать запрошенное изменение\n- сохранить существующую архитектуру проекта\n- вернуть краткие решения и список изменённых артефактов\n`,
    ревьюер: `Ты ревьюер.\n\nОбязанности:\n- проверить текущее состояние по заданным осям качества\n- найти архитектурный дрейф, нарушения границ ответственности, недостающие тесты и скрытые риски\n- вернуть структурированные замечания и понятный вердикт\n`,
    объясняющий: `Ты объясняющий.\n\nОбязанности:\n- кратко описать выполненную работу\n- зафиксировать решения, риски и статус проверок\n- подготовить понятную передачу результата человеку\n`
  };
  const files: Record<string, string> = {
    [join(base, "commands", "feature.yaml")]: `name: Разработка фичи\ndescription: Выполнить стандартный поток разработки фичи: реализация, ревью и краткая сводка.\nteam: feature-team\ntask_template: |\n  Реализуй следующий запрос на изменение:\n\n  {{input}}\n`,
    [join(base, "principles", "engineering.md")]: `# Инженерные принципы\n\n- Сохраняй существующую архитектуру, если нет явной причины её менять.\n- Предпочитай минимальное корректное изменение.\n- Разделяй ответственности между слоями и модулями.\n- Не вводи новый подход, если в проекте уже есть принятый способ решения.\n- Фиксируй важные решения, компромиссы и риски.\n`,
    [join(base, "employees", "backend-builder.yaml")]: `name: backend-исполнитель\nrole: исполнитель\nbackend: opencode\nmodel: gpt-5.5\nextra_instructions: |\n  Предпочитай минимальное корректное изменение. Не вводи новую архитектуру без обоснования.\n`,
    [join(base, "employees", "strict-reviewer.yaml")]: `name: строгий ревьюер\nrole: ревьюер\nbackend: opencode\nmodel: gpt-5.5\nproject_context:\n  review_style: strict\nextra_instructions: |\n  Интерпретируй общие оси качества с учётом соглашений текущего репозитория.\n`,
    [join(base, "employees", "pr-explainer.yaml")]: `name: объясняющий результат\nrole: объясняющий\nbackend: opencode\nmodel: gpt-5.5\n`,
    [join(base, "teams", "feature-team.yaml")]: `name: feature-team\nmembers:\n  - backend-исполнитель\n  - строгий ревьюер\n  - объясняющий результат\nflow:\n  start: реализация\n  steps:\n    реализация:\n      employee: backend-исполнитель\n      next: ревью\n    ревью:\n      employee: строгий ревьюер\n      role: ревьюер\n      review_level: 3\n      next:\n        if_needs_fix: реализация\n        if_approved: объяснение\n    объяснение:\n      employee: объясняющий результат\n      role: объясняющий\n      next: done\nlimits:\n  max_iterations: 5\n`,
    [join(base, "policies", "review.yaml")]: `quality_axes:\n  - domain_model_integrity\n  - responsibility_boundaries\n  - consistency_with_project_conventions\n  - architectural_drift\n  - test_coverage\n  - maintainability\nlevels:\n  "1":\n    focus:\n      - obvious_bugs\n      - style\n  "3":\n    focus:\n      - responsibility_boundaries\n      - consistency_with_project_conventions\n      - tests\n  "5":\n    focus:\n      - domain_model_integrity\n      - architectural_drift\n      - security\n      - migration_risks\n`
  };

  let created = 0;
  for (const [path, content] of Object.entries(files)) {
    if (fileExists(path)) continue;
    await writeText(path, content);
    created += 1;
  }
  await saveGlobalRoles(roles);

  console.log(created === 0 ? "Configuration already exists." : `Created ${created} configuration files in ${AI_TEAM_DIR}.`);
  console.log("Global roles are available in the ai-team role registry.");
  console.log(`Project config: ${base}`);
}
