import Decimal from 'decimal.js';
import { evaluateExpression } from './expression.js';
import { Notebook, NotebookColumn, NotebookRow } from './types.js';

/**
 * Recomputes all computed cells in a single row based on existing cell values,
 * supporting multi-stage computed dependencies and detecting circular references (#CYCLE!).
 */
export function computeRowCells(
  columns: NotebookColumn[],
  row: NotebookRow
): NotebookRow {
  const vars: Record<string, string> = {};
  const computedCols = new Map<string, NotebookColumn>();

  // First pass: collect non-computed cell values and register computed columns
  for (const col of columns) {
    if (col.type !== 'computed') {
      const cell = row.cells[col.key];
      vars[col.key] = cell?.value ?? cell?.raw ?? '0';
    } else if (col.formula) {
      computedCols.set(col.key, col);
    }
  }

  const updatedCells = { ...row.cells };
  const visiting = new Set<string>();
  const resolved = new Set<string>();

  function resolveComputedColumn(key: string): boolean {
    if (resolved.has(key)) return true;
    if (visiting.has(key)) {
      updatedCells[key] = {
        raw: computedCols.get(key)?.formula || '',
        value: '—',
        error: '#CYCLE!',
      };
      return false;
    }

    const col = computedCols.get(key);
    if (!col || !col.formula) return true;

    visiting.add(key);

    // Extract referenced variables {varKey}
    const refRegex = /\{([^}]+)\}/g;
    let match: RegExpExecArray | null;
    while ((match = refRegex.exec(col.formula)) !== null) {
      const depKey = match[1]?.trim() || '';
      if (depKey === key) {
        visiting.delete(key);
        updatedCells[key] = {
          raw: col.formula,
          value: '—',
          error: '#CYCLE!',
        };
        return false;
      }
      if (computedCols.has(depKey) && !resolved.has(depKey)) {
        const okDep = resolveComputedColumn(depKey);
        if (!okDep) {
          visiting.delete(key);
          updatedCells[key] = {
            raw: col.formula,
            value: '—',
            error: '#CYCLE!',
          };
          return false;
        }
      }
    }

    visiting.delete(key);

    const evalRes = evaluateExpression(col.formula, {
      decimals: col.decimals ?? 2,
      vars,
    });

    if (evalRes.ok) {
      updatedCells[col.key] = {
        raw: col.formula,
        value: evalRes.value,
      };
      vars[col.key] = evalRes.value;
    } else {
      updatedCells[col.key] = {
        raw: col.formula,
        value: '—',
        error: evalRes.error,
      };
    }

    resolved.add(key);
    return true;
  }

  for (const col of columns) {
    if (col.type === 'computed' && col.formula) {
      resolveComputedColumn(col.key);
    }
  }

  return {
    ...row,
    cells: updatedCells,
  };
}

/**
 * Computes the total aggregate for a specific column across all notebook rows.
 */
export function computeColumnTotal(
  col: NotebookColumn,
  rows: NotebookRow[]
): string | null {
  if (!col.total || rows.length === 0) return null;

  const values: Decimal[] = [];

  for (const r of rows) {
    const cell = r.cells[col.key];
    const val = cell?.value ?? cell?.raw;
    if (val && val !== '—') {
      try {
        const d = new Decimal(val.replace(/,/g, ''));
        if (!d.isNaN()) {
          values.push(d);
        }
      } catch {
        // skip non-numeric
      }
    }
  }

  if (col.total === 'count') {
    return values.length.toString();
  }

  if (values.length === 0) return '0';

  let result: Decimal;

  switch (col.total) {
    case 'sum':
      result = values.reduce((acc, curr) => acc.plus(curr), new Decimal(0));
      break;
    case 'avg': {
      const sum = values.reduce((acc, curr) => acc.plus(curr), new Decimal(0));
      result = sum.dividedBy(values.length);
      break;
    }
    case 'min':
      result = values.reduce(
        (min, curr) => (curr.lessThan(min) ? curr : min),
        values[0]!
      );
      break;
    case 'max':
      result = values.reduce(
        (max, curr) => (curr.greaterThan(max) ? curr : max),
        values[0]!
      );
      break;
  }

  const decimals = col.decimals ?? 2;
  const num = Number(result.toFixed(decimals));
  return new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Exports a notebook table to CSV string format.
 */
export function exportNotebookToCSV(notebook: Notebook): string {
  const headers = notebook.columns.map((c) => `"${c.title.replace(/"/g, '""')}"`);
  const lines: string[] = [headers.join(',')];

  for (const row of notebook.rows) {
    const rowValues = notebook.columns.map((c) => {
      const cell = row.cells[c.key];
      const val = cell?.value ?? cell?.raw ?? '';
      return `"${val.replace(/"/g, '""')}"`;
    });
    lines.push(rowValues.join(','));
  }

  return lines.join('\n');
}
