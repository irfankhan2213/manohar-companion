import { describe, expect, it } from 'vitest';
import { evaluateExpression } from '../src/expression.js';

describe('expression engine (recursive-descent parser)', () => {
  it('evaluates 10*2 to 20', () => {
    const res = evaluateExpression('10*2');
    expect(res).toEqual({ ok: true, value: '20', display: '20' });
  });

  it('evaluates 12.5x4 with x operator to 50', () => {
    const res = evaluateExpression('12.5x4');
    expect(res).toEqual({ ok: true, value: '50', display: '50' });
  });

  it('evaluates (100+50)/3 with parentheses to 50', () => {
    const res = evaluateExpression('(100+50)/3');
    expect(res).toEqual({ ok: true, value: '50', display: '50' });
  });

  it('evaluates 1/3 with 2 decimals to 0.33', () => {
    const res = evaluateExpression('1/3', { decimals: 2 });
    expect(res).toEqual({ ok: true, value: '0.33', display: '0.33' });
  });

  it('evaluates 1,00,000*2 ignoring Indian commas', () => {
    const res = evaluateExpression('1,00,000*2');
    expect(res).toEqual({ ok: true, value: '200000', display: '2,00,000' });
  });

  it('evaluates -5+8 to 3', () => {
    const res = evaluateExpression('-5+8');
    expect(res).toEqual({ ok: true, value: '3', display: '3' });
  });

  it('handles 0.1+0.2 exact decimal arithmetic to 0.3', () => {
    const res = evaluateExpression('0.1+0.2');
    expect(res).toEqual({ ok: true, value: '0.3', display: '0.3' });
  });

  it('substitutes column variables {qty}*{rate}', () => {
    const res = evaluateExpression('{qty}*{rate}', {
      vars: { qty: '3', rate: '12.5' },
    });
    expect(res).toEqual({ ok: true, value: '37.5', display: '37.5' });
  });

  it('returns errors for malformed or invalid inputs', () => {
    expect(evaluateExpression('10*')).toEqual({
      ok: false,
      error: 'Incomplete expression',
    });
    expect(evaluateExpression('abc')).toEqual({
      ok: false,
      error: 'Unexpected character',
    });
    expect(evaluateExpression('5/0')).toEqual({
      ok: false,
      error: 'Divide by zero',
    });
    expect(evaluateExpression('(2+3')).toEqual({
      ok: false,
      error: 'Missing bracket',
    });
    expect(evaluateExpression('')).toEqual({
      ok: false,
      error: 'Empty',
    });
  });
});
