// Safe arithmetic evaluator. Replaces the previous `new Function(...)` based
// math_eval, which allowed arbitrary code execution. Supports + - * / % ^,
// parentheses, unary +/-, a small whitelist of math functions, and constants.

import { tokenize } from "./safe-math-tokenize";
import { Parser } from "./safe-math-parser";

export function evaluateMath(expr: string): number {
  if (typeof expr !== "string" || expr.trim() === "") throw new Error("Empty expression");
  if (expr.length > 500) throw new Error("Expression too long");
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new Error("Empty expression");
  const result = new Parser(tokens).parse();
  if (!Number.isFinite(result)) throw new Error("Result is not a finite number");
  return result;
}
