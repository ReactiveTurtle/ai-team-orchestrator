import type { EmployeeRunInput, EmployeeRunResult } from "../types.js";

export interface ExecutionBackend {
  readonly name: string;
  runEmployee(input: EmployeeRunInput): Promise<EmployeeRunResult>;
}
