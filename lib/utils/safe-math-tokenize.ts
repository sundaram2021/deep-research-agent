export type Token =
  | { type: "num"; value: number }
  | { type: "name"; value: string }
  | { type: "op"; value: string }
  | { type: "paren"; value: "(" | ")" }
  | { type: "comma" };

export function tokenize(input: string): Token[] {
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
