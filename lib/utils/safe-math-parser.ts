import type { Token } from "./safe-math-tokenize";

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

// Recursive-descent parser. Precedence: +/- < */% < unary < ^ (right-assoc).
export class Parser {
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
