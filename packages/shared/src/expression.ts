import Decimal from 'decimal.js';

export interface EvaluateOptions {
  decimals?: number;
  vars?: Record<string, string>;
}

export type EvaluateResult =
  | { ok: true; value: string; display: string }
  | { ok: false; error: string };

type TokenType =
  | 'NUMBER'
  | 'PLUS'
  | 'MINUS'
  | 'STAR'
  | 'SLASH'
  | 'LPAREN'
  | 'RPAREN'
  | 'VAR'
  | 'EOF';

interface Token {
  type: TokenType;
  value?: string;
}

class Lexer {
  private pos = 0;

  constructor(private input: string) {}

  nextToken(): Token {
    if (this.pos >= this.input.length) {
      return { type: 'EOF' };
    }

    const ch = this.input[this.pos];

    if (ch === '+') {
      this.pos++;
      return { type: 'PLUS' };
    }
    if (ch === '-') {
      this.pos++;
      return { type: 'MINUS' };
    }
    if (ch === '*') {
      this.pos++;
      return { type: 'STAR' };
    }
    if (ch === '/') {
      this.pos++;
      return { type: 'SLASH' };
    }
    if (ch === '(') {
      this.pos++;
      return { type: 'LPAREN' };
    }
    if (ch === ')') {
      this.pos++;
      return { type: 'RPAREN' };
    }

    if (ch === '{') {
      const start = this.pos + 1;
      const end = this.input.indexOf('}', start);
      if (end === -1) {
        throw new Error('Incomplete expression');
      }
      const varName = this.input.slice(start, end);
      this.pos = end + 1;
      return { type: 'VAR', value: varName };
    }

    if (!ch) {
      return { type: 'EOF' };
    }

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = '';
      let hasDot = false;
      while (this.pos < this.input.length) {
        const c = this.input[this.pos];
        if (c !== undefined && c >= '0' && c <= '9') {
          numStr += c;
          this.pos++;
        } else if (c === '.') {
          if (hasDot) {
            throw new Error('Unexpected character');
          }
          hasDot = true;
          numStr += c;
          this.pos++;
        } else {
          break;
        }
      }
      return { type: 'NUMBER', value: numStr };
    }

    throw new Error('Unexpected character');
  }
}

class Parser {
  private currentToken: Token;

  constructor(
    private lexer: Lexer,
    private vars?: Record<string, string>
  ) {
    this.currentToken = this.lexer.nextToken();
  }

  private eat(type: TokenType): void {
    if (this.currentToken.type === type) {
      this.currentToken = this.lexer.nextToken();
    } else if (type === 'RPAREN') {
      throw new Error('Missing bracket');
    } else {
      throw new Error('Incomplete expression');
    }
  }

  private isEOF(): boolean {
    return this.currentToken.type === 'EOF';
  }

  parse(): Decimal {
    if (this.isEOF()) {
      throw new Error('Empty');
    }
    const result = this.expr();
    if (!this.isEOF()) {
      if (this.currentToken.type === 'RPAREN') {
        throw new Error('Unexpected character');
      }
      throw new Error('Incomplete expression');
    }
    return result;
  }

  private expr(): Decimal {
    let result = this.term();

    while (
      this.currentToken.type === 'PLUS' ||
      this.currentToken.type === 'MINUS'
    ) {
      const op = this.currentToken.type;
      this.eat(op);
      const right = this.term();
      if (op === 'PLUS') {
        result = result.plus(right);
      } else {
        result = result.minus(right);
      }
    }

    return result;
  }

  private term(): Decimal {
    let result = this.factor();

    while (
      this.currentToken.type === 'STAR' ||
      this.currentToken.type === 'SLASH'
    ) {
      const op = this.currentToken.type;
      this.eat(op);
      const right = this.factor();
      if (op === 'STAR') {
        result = result.times(right);
      } else {
        if (right.isZero()) {
          throw new Error('Divide by zero');
        }
        result = result.dividedBy(right);
      }
    }

    return result;
  }

  private factor(): Decimal {
    const token = this.currentToken;

    if (token.type === 'PLUS') {
      this.eat('PLUS');
      return this.factor();
    }

    if (token.type === 'MINUS') {
      this.eat('MINUS');
      return this.factor().negated();
    }

    if (token.type === 'NUMBER') {
      this.eat('NUMBER');
      try {
        return new Decimal(token.value ?? '0');
      } catch {
        throw new Error('Unexpected character');
      }
    }

    if (token.type === 'VAR') {
      const varKey = token.value ?? '';
      this.eat('VAR');
      if (!this.vars || !(varKey in this.vars)) {
        throw new Error('Unknown column');
      }
      const rawVal = this.vars[varKey] ?? '0';
      const cleanVal = rawVal.trim() === '' ? '0' : rawVal;
      try {
        return new Decimal(cleanVal);
      } catch {
        throw new Error('Unexpected character');
      }
    }

    if (token.type === 'LPAREN') {
      this.eat('LPAREN');
      const result = this.expr();
      this.eat('RPAREN');
      return result;
    }

    if (token.type === 'EOF') {
      throw new Error('Incomplete expression');
    }

    throw new Error('Unexpected character');
  }
}

/**
 * Evaluates an arithmetic expression safely using Decimal.js with Indian currency / number grouping.
 */
export function evaluateExpression(
  raw: string,
  opts?: EvaluateOptions
): EvaluateResult {
  if (!raw || raw.trim() === '') {
    return { ok: false, error: 'Empty' };
  }

  // Pre-processing:
  // remove spaces and commas
  let sanitized = raw.replace(/[\s,]/g, '');
  // x, X, × become *
  sanitized = sanitized.replace(/[xX×]/g, '*');
  // ÷ becomes /
  sanitized = sanitized.replace(/÷/g, '/');

  if (sanitized === '') {
    return { ok: false, error: 'Empty' };
  }

  try {
    const lexer = new Lexer(sanitized);
    const parser = new Parser(lexer, opts?.vars);
    const result = parser.parse();

    const decimals = opts?.decimals ?? 2;
    Decimal.set({ rounding: Decimal.ROUND_HALF_UP });

    let finalValStr: string;
    if (result.isInteger()) {
      finalValStr = result.toString();
    } else {
      finalValStr = result.toFixed(decimals);
      // Remove trailing zeroes if not required or keep clean
      if (finalValStr.includes('.')) {
        finalValStr = finalValStr.replace(/\.?0+$/, '');
      }
    }

    // Format display with Indian number grouping
    const num = Number(finalValStr);
    const display = new Intl.NumberFormat('en-IN', {
      maximumFractionDigits: decimals,
    }).format(num);

    return {
      ok: true,
      value: finalValStr,
      display,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Incomplete expression';
    return { ok: false, error: message };
  }
}
