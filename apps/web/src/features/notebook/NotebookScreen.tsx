import React, { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Plus,
  Trash2,
  Undo2,
  Redo2,
  Settings2,
  Check,
  FileSpreadsheet,
  Sigma,
} from 'lucide-react';
import {
  Notebook,
  NotebookColumn,
  NotebookRow,
  computeRowCells,
  computeColumnTotal,
  exportNotebookToCSV,
  evaluateExpression,
} from '@saas/shared';
import { api } from '../../api/index.js';
import { useAppStore } from '../../app/store.js';
import { LargeTitleScreen } from '../../components/ui/LargeTitleScreen.js';
import { Button } from '../../components/ui/Button.js';
import { Sheet } from '../../components/ui/Sheet.js';
import { useToast } from '../../components/ui/Toast.js';

export const NotebookScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentCompanyId } = useAppStore();
  const { showToast } = useToast();

  // Fetch list of notebooks
  const { data: notebooks = [], isLoading } = useQuery({
    queryKey: ['notebooks', currentCompanyId],
    queryFn: () => api.notebooks.list(currentCompanyId),
  });

  // Current active notebook state
  const [activeNotebookId, setActiveNotebookId] = useState<string>('nb-1');
  const [notebook, setNotebook] = useState<Notebook | null>(null);

  // Undo / Redo history
  const [history, setHistory] = useState<Notebook[]>([]);
  const [future, setFuture] = useState<Notebook[]>([]);

  // Cell editing state
  const [editingCell, setEditingCell] = useState<{
    rowId: string;
    colKey: string;
  } | null>(null);
  const [cellInput, setCellInput] = useState<string>('');
  const activeInputRef = useRef<HTMLInputElement>(null);

  // Column config sheet state
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [editingColumn, setEditingColumn] = useState<NotebookColumn | null>(null);
  const [colTitle, setColTitle] = useState('');
  const [colType, setColType] = useState<NotebookColumn['type']>('number');
  const [colFormula, setColFormula] = useState('');
  const [colTotal, setColTotal] = useState<'sum' | 'avg' | 'count' | 'min' | 'max' | null>(null);

  // New worksheet sheet state
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  // Sync loaded notebook to local state
  useEffect(() => {
    if (notebooks.length > 0) {
      const found = notebooks.find((n) => n.id === activeNotebookId) ?? notebooks[0]!;
      setNotebook(found);
      setActiveNotebookId(found.id);
    }
  }, [notebooks, activeNotebookId]);

  // Focus input when editing starts
  useEffect(() => {
    if (editingCell && activeInputRef.current) {
      activeInputRef.current.focus();
      activeInputRef.current.select();
    }
  }, [editingCell]);

  // Mutation to persist notebook
  const saveMutation = useMutation({
    mutationFn: (nb: Notebook) => api.notebooks.save(nb),
    onSuccess: (saved) => {
      queryClient.setQueryData(
        ['notebooks', currentCompanyId],
        (old: Notebook[] | undefined) =>
          old ? old.map((n) => (n.id === saved.id ? saved : n)) : [saved]
      );
    },
  });

  // Update notebook with undo tracking
  const updateNotebookState = (updated: Notebook) => {
    if (notebook) {
      setHistory((prev) => [...prev.slice(-15), notebook]);
      setFuture([]);
    }
    setNotebook(updated);
    saveMutation.mutate(updated);
  };

  const handleUndo = () => {
    if (history.length === 0 || !notebook) return;
    const prev = history[history.length - 1]!;
    setHistory((h) => h.slice(0, -1));
    setFuture((f) => [notebook, ...f]);
    setNotebook(prev);
    saveMutation.mutate(prev);
    showToast({ message: 'Undone' });
  };

  const handleRedo = () => {
    if (future.length === 0 || !notebook) return;
    const next = future[0]!;
    setFuture((f) => f.slice(1));
    setHistory((h) => [...h, notebook]);
    setNotebook(next);
    saveMutation.mutate(next);
    showToast({ message: 'Redone' });
  };

  // Start editing a cell
  const startEditing = (rowId: string, colKey: string) => {
    if (!notebook) return;
    const col = notebook.columns.find((c) => c.key === colKey);
    if (col?.type === 'computed') return; // Computed cells auto-evaluate

    const row = notebook.rows.find((r) => r.id === rowId);
    const cell = row?.cells[colKey];
    setEditingCell({ rowId, colKey });
    setCellInput(cell?.raw ?? '');
  };

  // Commit editing a cell
  const commitCellEdit = () => {
    if (!editingCell || !notebook) {
      setEditingCell(null);
      return;
    }

    const { rowId, colKey } = editingCell;
    const rawVal = cellInput.trim();

    // Check if cell has arithmetic expression (e.g. 10*2, 50+25)
    let evaluatedVal = rawVal;
    const col = notebook.columns.find((c) => c.key === colKey);

    if (
      col?.type === 'number' ||
      /[+\-*×/÷()]/.test(rawVal)
    ) {
      const res = evaluateExpression(rawVal, { decimals: col?.decimals ?? 2 });
      if (res.ok) {
        evaluatedVal = res.value;
      }
    }

    const updatedRows = notebook.rows.map((row) => {
      if (row.id !== rowId) return row;
      const updatedCells = {
        ...row.cells,
        [colKey]: {
          raw: rawVal,
          value: evaluatedVal,
        },
      };

      // Recompute all computed columns for this row
      return computeRowCells(notebook.columns, {
        ...row,
        cells: updatedCells,
      });
    });

    const updatedNb: Notebook = {
      ...notebook,
      rows: updatedRows,
      updatedAt: new Date().toISOString(),
    };

    updateNotebookState(updatedNb);
    setEditingCell(null);
  };

  // Insert math operator into active cell
  const handleOperatorClick = (op: string) => {
    if (!editingCell) return;
    if (op === 'C') {
      setCellInput('');
    } else {
      setCellInput((prev) => prev + op);
    }
    if (activeInputRef.current) {
      activeInputRef.current.focus();
    }
  };

  // Add a new row
  const handleAddRow = () => {
    if (!notebook) return;
    const newRowId = `r-${Date.now()}`;
    const emptyCells: NotebookRow['cells'] = {};

    notebook.columns.forEach((col) => {
      emptyCells[col.key] = {
        raw: col.type === 'number' ? '0' : '',
        value: col.type === 'number' ? '0' : '',
      };
    });

    const newRow = computeRowCells(notebook.columns, {
      id: newRowId,
      cells: emptyCells,
    });

    const updatedNb: Notebook = {
      ...notebook,
      rows: [...notebook.rows, newRow],
      updatedAt: new Date().toISOString(),
    };

    updateNotebookState(updatedNb);
    showToast({ message: 'Row added' });
  };

  // Delete a row
  const handleDeleteRow = (rowId: string) => {
    if (!notebook) return;
    const updatedNb: Notebook = {
      ...notebook,
      rows: notebook.rows.filter((r) => r.id !== rowId),
      updatedAt: new Date().toISOString(),
    };
    updateNotebookState(updatedNb);
    showToast({ message: 'Row deleted' });
  };

  // Open Column Config Sheet
  const openColumnConfig = (col?: NotebookColumn) => {
    if (col) {
      setEditingColumn(col);
      setColTitle(col.title);
      setColType(col.type);
      setColFormula(col.formula ?? '');
      setColTotal(col.total ?? null);
    } else {
      setEditingColumn(null);
      setColTitle('');
      setColType('number');
      setColFormula('');
      setColTotal('sum');
    }
    setColumnSheetOpen(true);
  };

  // Save Column Config
  const handleSaveColumn = () => {
    if (!notebook || !colTitle.trim()) return;

    let updatedColumns: NotebookColumn[];

    if (editingColumn) {
      // Editing existing column
      updatedColumns = notebook.columns.map((c) => {
        if (c.id !== editingColumn.id) return c;
        return {
          ...c,
          title: colTitle.trim(),
          type: colType,
          formula: colType === 'computed' ? colFormula.trim() : undefined,
          total: colTotal,
        };
      });
    } else {
      // Adding new column
      const newKey = colTitle.toLowerCase().replace(/[^a-z0-9]/g, '');
      const newCol: NotebookColumn = {
        id: `c-${Date.now()}`,
        key: newKey || `col_${notebook.columns.length + 1}`,
        title: colTitle.trim(),
        type: colType,
        formula: colType === 'computed' ? colFormula.trim() : undefined,
        total: colTotal,
        decimals: 2,
      };
      updatedColumns = [...notebook.columns, newCol];
    }

    // Recompute all rows with updated columns
    const updatedRows = notebook.rows.map((row) =>
      computeRowCells(updatedColumns, row)
    );

    const updatedNb: Notebook = {
      ...notebook,
      columns: updatedColumns,
      rows: updatedRows,
      updatedAt: new Date().toISOString(),
    };

    updateNotebookState(updatedNb);
    setColumnSheetOpen(false);
    showToast({ message: editingColumn ? 'Column updated' : 'Column added' });
  };

  // Delete column
  const handleDeleteColumn = (colId: string) => {
    if (!notebook) return;
    const colToDelete = notebook.columns.find((c) => c.id === colId);
    if (!colToDelete) return;

    const updatedColumns = notebook.columns.filter((c) => c.id !== colId);
    const updatedRows = notebook.rows.map((row) => {
      const newCells = { ...row.cells };
      delete newCells[colToDelete.key];
      return computeRowCells(updatedColumns, {
        ...row,
        cells: newCells,
      });
    });

    const updatedNb: Notebook = {
      ...notebook,
      columns: updatedColumns,
      rows: updatedRows,
      updatedAt: new Date().toISOString(),
    };

    updateNotebookState(updatedNb);
    setColumnSheetOpen(false);
    showToast({ message: 'Column removed' });
  };

  // Create new worksheet
  const handleCreateWorksheet = () => {
    if (!newTitle.trim()) return;

    const newNb: Notebook = {
      id: `nb-${Date.now()}`,
      companyId: currentCompanyId === 'all' ? 'c1' : currentCompanyId,
      title: newTitle.trim(),
      updatedAt: new Date().toISOString(),
      updatedBy: 'u-owner',
      columns: [
        { id: 'c-desc', key: 'desc', title: 'Description', type: 'text' },
        { id: 'c-qty', key: 'qty', title: 'Qty', type: 'number', total: 'sum' },
        { id: 'c-rate', key: 'rate', title: 'Rate (₹)', type: 'number' },
        {
          id: 'c-total',
          key: 'total',
          title: 'Total (₹)',
          type: 'computed',
          formula: '{qty} * {rate}',
          total: 'sum',
        },
      ],
      rows: [
        {
          id: 'r-new-1',
          cells: {
            desc: { raw: 'Opening Batch', value: 'Opening Batch' },
            qty: { raw: '10*5', value: '50' },
            rate: { raw: '800', value: '800' },
            total: { raw: '{qty} * {rate}', value: '40000' },
          },
        },
      ],
    };

    saveMutation.mutate(newNb);
    setActiveNotebookId(newNb.id);
    setNotebook(newNb);
    setNewSheetOpen(false);
    setNewTitle('');
    showToast({ message: 'New worksheet created' });
  };

  // CSV Export
  const handleExportCSV = () => {
    if (!notebook) return;
    const csvContent = exportNotebookToCSV(notebook);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `${notebook.title.replace(/\s+/g, '_')}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    showToast({ message: 'Exported CSV' });
  };

  if (isLoading || !notebook) {
    return (
      <LargeTitleScreen title="Notebook">
        <div className="p-8 text-center text-label-2 text-subhead">
          Loading calculation notebook...
        </div>
      </LargeTitleScreen>
    );
  }

  return (
    <LargeTitleScreen
      title="Notebook"
      contentClassName="max-w-5xl"
      headerAction={
        <div className="flex items-center gap-1.5">
          <Button
            variant="tinted"
            size="small"
            disabled={history.length === 0}
            onClick={handleUndo}
            aria-label="Undo"
            className="w-9 h-9 p-0 flex items-center justify-center"
          >
            <Undo2 className="w-4 h-4" />
          </Button>

          <Button
            variant="tinted"
            size="small"
            disabled={future.length === 0}
            onClick={handleRedo}
            aria-label="Redo"
            className="w-9 h-9 p-0 flex items-center justify-center"
          >
            <Redo2 className="w-4 h-4" />
          </Button>

          <Button
            size="small"
            onClick={handleExportCSV}
            className="flex items-center gap-1"
          >
            <Download className="w-4 h-4 stroke-[2.2]" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      }
    >
      {/* Notebook Selector & Title Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-surface p-3.5 rounded-ios-card border border-separator/40 shadow-sm">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
            <FileSpreadsheet className="w-5 h-5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-subhead font-bold text-label truncate">
              {notebook.title}
            </span>
            <span className="text-caption text-label-2">
              {notebook.rows.length} {notebook.rows.length === 1 ? 'row' : 'rows'} · {notebook.columns.length} columns
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto">
          <div className="relative flex-1 sm:w-64">
            <select
              value={activeNotebookId}
              onChange={(e) => setActiveNotebookId(e.target.value)}
              className="w-full bg-fill/50 border border-separator/40 rounded-xl px-3 py-2 text-footnote font-semibold text-label focus:outline-none cursor-pointer truncate"
            >
              {notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => setNewSheetOpen(true)}
            className="h-9 px-3 rounded-xl bg-accent-soft text-accent flex items-center gap-1.5 font-semibold text-footnote hover:opacity-80 active:scale-95 transition-all shrink-0"
            title="New Worksheet"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span className="hidden xs:inline">New Sheet</span>
          </button>
        </div>
      </div>

      {/* Grid Action Toolbar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <Button
            variant="tinted"
            size="small"
            onClick={handleAddRow}
            className="flex items-center gap-1.5 h-8 px-2.5"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Add Row</span>
          </Button>

          <Button
            variant="tinted"
            size="small"
            onClick={() => openColumnConfig()}
            className="flex items-center gap-1.5 h-8 px-2.5"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>Add Column</span>
          </Button>
        </div>

        <span className="text-caption text-label-3">
          Tip: Type math like <code className="bg-fill px-1 py-0.5 rounded text-accent">10*2</code>
        </span>
      </div>

      {/* Interactive Calculation Grid */}
      <div className="bg-surface rounded-ios-card border border-separator/50 shadow-sm overflow-hidden flex flex-col">
        <div className="overflow-x-auto max-w-full">
          <table className="w-full border-collapse text-left text-subhead">
            {/* Table Header */}
            <thead>
              <tr className="bg-fill/40 border-b border-separator/50 text-footnote font-bold text-label-2">
                <th className="py-2.5 px-3 w-10 text-center border-r border-separator/30">
                  #
                </th>
                {notebook.columns.map((col) => {
                  const isComputed = col.type === 'computed';
                  return (
                    <th
                      key={col.id}
                      onClick={() => openColumnConfig(col)}
                      className="py-2.5 px-3 border-r border-separator/30 hover:bg-fill/60 cursor-pointer select-none transition-colors whitespace-nowrap"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-label font-semibold">
                          {col.title}
                        </span>
                        <div className="flex items-center gap-1">
                          {isComputed && (
                            <span className="text-[10px] font-mono font-bold bg-accent-soft text-accent px-1.5 py-0.5 rounded">
                              fx
                            </span>
                          )}
                          <Settings2 className="w-3.5 h-3.5 text-label-3 hover:text-label" />
                        </div>
                      </div>
                    </th>
                  );
                })}
                <th className="w-10 text-center py-2.5 px-2"></th>
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-separator/30 text-body">
              {notebook.rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={notebook.columns.length + 2}
                    className="p-8 text-center text-label-2 text-subhead"
                  >
                    No rows yet. Click "+ Add Row" above to start calculating.
                  </td>
                </tr>
              ) : (
                notebook.rows.map((row, rowIdx) => (
                  <tr
                    key={row.id}
                    className="hover:bg-fill/15 transition-colors group"
                  >
                    {/* Row Index */}
                    <td className="py-2.5 px-3 text-center text-footnote font-mono text-label-3 border-r border-separator/30 select-none bg-fill/10">
                      {rowIdx + 1}
                    </td>

                    {/* Columns Cells */}
                    {notebook.columns.map((col) => {
                      const isEditing =
                        editingCell?.rowId === row.id &&
                        editingCell?.colKey === col.key;
                      const cell = row.cells[col.key];
                      const isComputed = col.type === 'computed';
                      const isNumber = col.type === 'number';

                      if (isEditing) {
                        return (
                          <td
                            key={col.id}
                            className="p-0 border-r border-separator/30 bg-accent-soft/20"
                          >
                            <div className="flex items-center h-full px-2 py-1.5">
                              <input
                                ref={activeInputRef}
                                type="text"
                                value={cellInput}
                                onChange={(e) => setCellInput(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitCellEdit();
                                  if (e.key === 'Escape') setEditingCell(null);
                                }}
                                onBlur={commitCellEdit}
                                className="w-full bg-surface border border-accent rounded px-2 py-1 text-subhead font-mono text-label focus:outline-none shadow-sm"
                              />
                            </div>
                          </td>
                        );
                      }

                      return (
                        <td
                          key={col.id}
                          onClick={() => startEditing(row.id, col.key)}
                          className={`py-2.5 px-3 border-r border-separator/30 transition-colors cursor-pointer select-none whitespace-nowrap ${
                            isComputed
                              ? 'bg-fill/10 font-mono text-label font-semibold cursor-default'
                              : 'hover:bg-fill/30 text-label'
                          } ${isNumber ? 'text-right font-mono' : ''}`}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate tabular-nums">
                              {cell?.value || cell?.raw || '—'}
                            </span>
                            {/* Raw formula hint for math inputs like 10*2 */}
                            {cell?.raw &&
                              cell.raw !== cell.value &&
                              !isComputed && (
                                <span className="text-[10px] text-label-3 font-mono">
                                  ({cell.raw})
                                </span>
                              )}
                          </div>
                        </td>
                      );
                    })}

                    {/* Delete Row Button */}
                    <td className="py-2 px-2 text-center">
                      <button
                        type="button"
                        onClick={() => handleDeleteRow(row.id)}
                        className="opacity-0 group-hover:opacity-100 p-1 text-label-3 hover:text-danger hover:bg-danger/10 rounded transition-all"
                        title="Delete Row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>

            {/* Table Footer: Column Aggregates (Sum / Avg) */}
            {notebook.rows.length > 0 && (
              <tfoot>
                <tr className="bg-fill/50 border-t-2 border-separator/60 font-bold text-footnote">
                  <td className="py-3 px-3 text-center text-label-2 border-r border-separator/30">
                    <Sigma className="w-4 h-4 mx-auto text-accent" />
                  </td>
                  {notebook.columns.map((col) => {
                    const totalVal = computeColumnTotal(col, notebook.rows);
                    const isNumber = col.type === 'number' || col.type === 'computed';

                    return (
                      <td
                        key={col.id}
                        className={`py-3 px-3 border-r border-separator/30 text-label whitespace-nowrap ${
                          isNumber ? 'text-right font-mono' : ''
                        }`}
                      >
                        {totalVal ? (
                          <div className="flex items-center justify-end gap-1.5">
                            <span className="text-[10px] uppercase font-bold text-accent bg-accent-soft px-1 rounded">
                              {col.total}
                            </span>
                            <span className="tabular-nums font-bold text-headline">
                              {totalVal}
                            </span>
                          </div>
                        ) : (
                          '—'
                        )}
                      </td>
                    );
                  })}
                  <td></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>

      {/* Touch-Friendly Math Operator Quick Bar */}
      <div className="sticky bottom-20 md:bottom-6 z-30 bg-surface/95 backdrop-blur-md p-2.5 rounded-2xl border border-separator/50 shadow-[0_8px_24px_rgba(0,0,0,0.08)] flex items-center justify-between gap-1.5 max-w-lg mx-auto w-full">
        <div className="flex items-center gap-1.5 overflow-x-auto py-0.5">
          {['+', '-', '×', '÷', '(', ')', '.', 'C'].map((op) => (
            <button
              key={op}
              type="button"
              onClick={() => handleOperatorClick(op)}
              className={`h-10 min-w-10 px-2.5 rounded-xl font-bold font-mono text-headline transition-all active:scale-95 shadow-sm border ${
                op === 'C'
                  ? 'bg-danger/10 text-danger border-danger/20 hover:bg-danger/20'
                  : 'bg-fill/60 text-label border-separator/40 hover:bg-fill'
              }`}
            >
              {op}
            </button>
          ))}
        </div>

        {editingCell ? (
          <Button
            size="small"
            onClick={commitCellEdit}
            className="h-10 px-3 shrink-0 flex items-center gap-1"
          >
            <Check className="w-4 h-4 stroke-[2.5]" />
            <span>Apply</span>
          </Button>
        ) : (
          <span className="text-caption text-label-3 px-2 hidden sm:inline">
            Tap any cell to calculate
          </span>
        )}
      </div>

      {/* Column Config Sheet */}
      <Sheet
        open={columnSheetOpen}
        onOpenChange={setColumnSheetOpen}
        title={editingColumn ? 'Edit Column' : 'Add Column'}
        description="Configure column data type and formulas"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Column Title
            </label>
            <input
              type="text"
              placeholder="e.g. Total Amount"
              value={colTitle}
              onChange={(e) => setColTitle(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Column Type
            </label>
            <select
              value={colType}
              onChange={(e) => setColType(e.target.value as NotebookColumn['type'])}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="number">Number (supports math like 10*2)</option>
              <option value="computed">Computed Formula (e.g. {'{qty} * {rate}'})</option>
              <option value="text">Text</option>
              <option value="date">Date</option>
              <option value="party">Party / Customer</option>
              <option value="item">Stock Item</option>
            </select>
          </div>

          {colType === 'computed' && (
            <div className="flex flex-col gap-2">
              <label className="text-caption font-semibold uppercase text-label-2 block">
                Formula Expression
              </label>
              <input
                type="text"
                placeholder="e.g. {qty} * {rate}"
                value={colFormula}
                onChange={(e) => setColFormula(e.target.value)}
                className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl font-mono text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
              />
              <span className="text-caption text-label-3">
                Insert column variables:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {notebook.columns
                  .filter((c) => c.id !== editingColumn?.id && c.type !== 'computed')
                  .map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => setColFormula((f) => f + `{${c.key}}`)}
                      className="text-caption font-mono font-semibold bg-fill px-2 py-1 rounded-md text-accent hover:bg-accent-soft transition-colors"
                    >
                      {`{${c.key}}`} ({c.title})
                    </button>
                  ))}
              </div>
            </div>
          )}

          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Column Total Aggregation
            </label>
            <select
              value={colTotal ?? ''}
              onChange={(e) =>
                setColTotal(
                  e.target.value === ''
                    ? null
                    : (e.target.value as 'sum' | 'avg' | 'count' | 'min' | 'max')
                )
              }
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            >
              <option value="">None (Don't total this column)</option>
              <option value="sum">Sum (Total)</option>
              <option value="avg">Average</option>
              <option value="count">Count (Non-empty cells)</option>
              <option value="min">Minimum</option>
              <option value="max">Maximum</option>
            </select>
          </div>

          <div className="flex gap-3 pt-3 border-t border-separator/30">
            {editingColumn && (
              <Button
                variant="tinted"
                onClick={() => handleDeleteColumn(editingColumn.id)}
                className="text-danger border-danger/30 hover:bg-danger/10"
              >
                Delete Column
              </Button>
            )}
            <Button fullWidth onClick={handleSaveColumn}>
              {editingColumn ? 'Save Changes' : 'Add Column'}
            </Button>
          </div>
        </div>
      </Sheet>

      {/* New Worksheet Sheet */}
      <Sheet
        open={newSheetOpen}
        onOpenChange={setNewSheetOpen}
        title="New Calculation Worksheet"
        description="Create a clean calculation sheet"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Worksheet Title
            </label>
            <input
              type="text"
              placeholder="e.g. November Booking Estimates"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <Button fullWidth disabled={!newTitle.trim()} onClick={handleCreateWorksheet}>
            Create Worksheet
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
