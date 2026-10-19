import { describe, expect, it } from 'vitest';
import {
  computeColumnTotal,
  computeRowCells,
  exportNotebookToCSV,
} from '../src/notebook.js';
import { Notebook, NotebookColumn, NotebookRow } from '../src/types.js';

describe('notebook calculations and helpers', () => {
  const columns: NotebookColumn[] = [
    { id: 'c1', key: 'item', title: 'Item Name', type: 'text' },
    { id: 'c2', key: 'qty', title: 'Qty', type: 'number' },
    { id: 'c3', key: 'rate', title: 'Rate', type: 'number' },
    {
      id: 'c4',
      key: 'amount',
      title: 'Amount',
      type: 'computed',
      formula: '{qty} * {rate}',
      total: 'sum',
    },
  ];

  it('computes row formula correctly', () => {
    const rawRow: NotebookRow = {
      id: 'r1',
      cells: {
        item: { raw: 'Servo Motor' },
        qty: { raw: '10', value: '10' },
        rate: { raw: '2500', value: '2500' },
      },
    };

    const computed = computeRowCells(columns, rawRow);
    expect(computed.cells.amount).toEqual({
      raw: '{qty} * {rate}',
      value: '25000',
    });
  });

  it('computes column total aggregate', () => {
    const rows: NotebookRow[] = [
      {
        id: 'r1',
        cells: {
          qty: { raw: '2' },
          amount: { raw: '2000', value: '2000' },
        },
      },
      {
        id: 'r2',
        cells: {
          qty: { raw: '3' },
          amount: { raw: '3500', value: '3500' },
        },
      },
    ];

    const amountCol = columns[3]!;
    const total = computeColumnTotal(amountCol, rows);
    expect(total).toBe('5,500');
  });

  it('exports notebook rows to CSV format', () => {
    const notebook: Notebook = {
      id: 'nb1',
      companyId: 'c1',
      title: 'Stock Order',
      columns,
      rows: [
        {
          id: 'r1',
          cells: {
            item: { raw: 'Hook Unit' },
            qty: { raw: '5', value: '5' },
            rate: { raw: '120', value: '120' },
            amount: { raw: '', value: '600' },
          },
        },
      ],
      updatedAt: '2026-10-17T10:00:00Z',
      updatedBy: 'u1',
    };

    const csv = exportNotebookToCSV(notebook);
    expect(csv).toContain('"Item Name","Qty","Rate","Amount"');
    expect(csv).toContain('"Hook Unit","5","120","600"');
  });
});
