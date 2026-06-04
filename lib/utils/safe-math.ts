// Safe arithmetic evaluator. Replaces the previous `new Function(...)` based
// math_eval, which allowed arbitrary code execution. Supports + - * / % ^,
// parentheses, unary +/-, a small whitelist of math functions, and constants.

const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  abs: Math.abs,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  floor: Math.floor,
  ceil: Math.ceil,
  round: Math.round,
  trunc: Math.trunc,
  sign: Math.sign,
  exp: Math.exp,
  log: Math.log,
  log2: Math.log2,
  log10: Math.log10,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  min: Math.min,
  max: Math.max,
  pow: Math.pow,
};

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

type Token =
  | { type: "num"; value: number }
  | { type: "name"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  const isDigit = (c: string) => c >= "0" && c <= "9";
  let i = 0;
  while (i < input.length) {
    const c = input[i];
    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }
    if (isDigit(c) || (c === "." && isDigit(input[i + 1] ?? ""))) {
      let j = i + 1;
      while (j < input.length && (isDigit(input[j]) || input[j] === ".")) j++;
      if (input[j] === "e" || input[j] === "E") {
        j++;
        if (input[j] === "+" || input[j] === "-") j++;
        while (j < input.length && isDigit(input[j])) j++;
      }
      const num = Number(input.slice(i, j));
      if (Number.isNaN(num)) throw new Error(`Invalid number "${input.slice(i, j)}"`);
      tokens.push({ type: "num", value: num });
      i = j;
      continue;
    }
    if (/[a-zA-Z_]/.test(c)) {
      let j = i + 1;
      while (j < input.length && /[a-zA-Z0-9_]/.test(input[j])) j++;
      tokens.push({ type: "name", value: input.slice(i, j).toLowerCase() });
      i = j;
      continue;
    }
    if ("+-*/%^".includes(c)) {
      tokens.push({ type: "op", value: c });
      i++;
      continue;
    }
    if (c === "(" || c === ")") {
      tokens.push({ type: "paren", value: c });
      i++;
      continue;
    }
    if (c === ",") {
      tokens.push({ type: "comma" });
      i++;
      continue;
    }
    throw new Error(`Unexpected character "${c}"`);
  }
  return tokens;
}

// Recursive-descent parser. Precedence: +/- < */% < unary < ^ (right-assoc).
class Parser {
  private pos = 0;
  private readonly tokens: Token[];
  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): number {
    const value = this.expr();
    if (this.pos !== this.tokens.length) throw new Error("Unexpected trailing input");
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private expr(): number {
    let left = this.term();
    let t = this.peek();
    while (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.pos++;
      const right = this.term();
      left = t.value === "+" ? left + right : left - right;
      t = this.peek();
    }
    return left;
  }

  private term(): number {
    let left = this.factor();
    let t = this.peek();
    while (t && t.type === "op" && (t.value === "*" || t.value === "/" || t.value === "%")) {
      this.pos++;
      const right = this.factor();
      if (t.value === "*") left *= right;
      else if (t.value === "/") left /= right;
      else left %= right;
      t = this.peek();
    }
    return left;
  }

  private factor(): number {
    const t = this.peek();
    if (t && t.type === "op" && (t.value === "+" || t.value === "-")) {
      this.pos++;
      const operand = this.factor();
      return t.value === "-" ? -operand : operand;
    }
    let base = this.primary();
    const n = this.peek();
    if (n && n.type === "op" && n.value === "^") {
      this.pos++;
      base = Math.pow(base, this.factor()); // right associative
    }
    return base;
  }

  private primary(): number {
    const t = this.tokens[this.pos++];
    if (!t) throw new Error("Unexpected end of expression");
    if (t.type === "num") return t.value;
    if (t.type === "paren" && t.value === "(") {
      const value = this.expr();
      const close = this.tokens[this.pos++];
      if (!close || close.type !== "paren" || close.value !== ")") {
        throw new Error("Missing closing parenthesis");
      }
      return value;
    }
    if (t.type === "name") {
      const after = this.peek();
      if (after && after.type === "paren" && after.value === "(") {
        this.pos++; // consume "("
        const args: number[] = [];
        const lookahead = this.peek();
        if (!(lookahead && lookahead.type === "paren" && lookahead.value === ")")) {
          args.push(this.expr());
          while (this.peek()?.type === "comma") {
            this.pos++;
            args.push(this.expr());
          }
        }
        const close = this.tokens[this.pos++];
        if (!close || close.type !== "paren" || close.value !== ")") {
          throw new Error("Missing closing parenthesis in function call");
        }
        const fn = FUNCTIONS[t.value];
        if (!fn) throw new Error(`Unknown function "${t.value}"`);
        return fn(...args);
      }
      if (t.value in CONSTANTS) return CONSTANTS[t.value];
      throw new Error(`Unknown identifier "${t.value}"`);
    }
    throw new Error("Unexpected token in expression");
  }
}

export function evaluateMath(expr: string): number {
  if (typeof expr !== "string" || expr.trim() === "") throw new Error("Empty expression");
  if (expr.length > 500) throw new Error("Expression too long");
  const tokens = tokenize(expr);
  if (tokens.length === 0) throw new Error("Empty expression");
  const result = new Parser(tokens).parse();
  if (!Number.isFinite(result)) throw new Error("Result is not a finite number");
  return result;
}
