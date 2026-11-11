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
  FileText,
  Sigma,
  Calculator,
  ListChecks,
  List,
  Calendar,
  Table as TableIcon,
  Search,
  Sparkles,
} from 'lucide-react';
import {
  Notebook,
  NotebookColumn,
  NotebookRow,
  NotebookTable,
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

function createDefaultColumns(): NotebookColumn[] {
  return [
    { id: `c-desc-${Date.now()}`, key: 'desc', title: 'Description', type: 'text' },
    { id: `c-qty-${Date.now() + 1}`, key: 'qty', title: 'Qty', type: 'number', total: 'sum' },
    { id: `c-rate-${Date.now() + 2}`, key: 'rate', title: 'Rate (₹)', type: 'number' },
    {
      id: `c-total-${Date.now() + 3}`,
      key: 'total',
      title: 'Total (₹)',
      type: 'computed',
      formula: '{qty} * {rate}',
      total: 'sum',
    },
  ];
}

export const NotebookScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const { currentCompanyId, currentUser } = useAppStore();
  const { showToast } = useToast();

  // Fetch companies
  const { data: companies = [] } = useQuery({
    queryKey: ['companies'],
    queryFn: () => api.companies.list(),
  });

  // Fetch list of notebooks (scoped per user and company)
  const { data: notebooks = [], isLoading } = useQuery({
    queryKey: ['notebooks', currentCompanyId, currentUser?.id],
    queryFn: () => api.notebooks.list(currentCompanyId),
  });

  // Current active notebook state
  const [activeNotebookId, setActiveNotebookId] = useState<string>('');
  const [notebook, setNotebook] = useState<Notebook | null>(null);
  const [noteSearch, setNoteSearch] = useState<string>('');
  const [quickCalcExpr, setQuickCalcExpr] = useState<string>('');
  const [quickCalcResult, setQuickCalcResult] = useState<string>('');

  // Undo / Redo history
  const [history, setHistory] = useState<Notebook[]>([]);
  const [future, setFuture] = useState<Notebook[]>([]);

  // Cell editing state (supports primary table with tableId = 'primary' or extra tables in notebook.tables)
  const [editingCell, setEditingCell] = useState<{
    tableId: string;
    rowId: string;
    colKey: string;
  } | null>(null);
  const [cellInput, setCellInput] = useState<string>('');
  const activeInputRef = useRef<HTMLInputElement>(null);
  const noteTextareaRef = useRef<HTMLTextAreaElement>(null);

  // Column config sheet state
  const [columnSheetOpen, setColumnSheetOpen] = useState(false);
  const [activeTableForCol, setActiveTableForCol] = useState<string>('primary');
  const [editingColumn, setEditingColumn] = useState<NotebookColumn | null>(null);
  const [colTitle, setColTitle] = useState('');
  const [colType, setColType] = useState<NotebookColumn['type']>('number');
  const [colFormula, setColFormula] = useState('');
  const [colTotal, setColTotal] = useState<'sum' | 'avg' | 'count' | 'min' | 'max' | null>(null);

  // New note / worksheet sheet state
  const [newSheetOpen, setNewSheetOpen] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newNoteWithTable, setNewNoteWithTable] = useState(true);

  // Sync loaded notebook to local state
  useEffect(() => {
    if (notebooks.length > 0) {
      const found = notebooks.find((n) => n.id === activeNotebookId) ?? notebooks[0]!;
      setNotebook(found);
      setActiveNotebookId(found.id);
    } else if (!isLoading && notebooks.length === 0 && !notebook) {
      const targetCompanyId =
        currentCompanyId === 'all' || !currentCompanyId ? companies[0]?.id || '' : currentCompanyId;
      const ownerId = currentUser?.id || 'staff';
      const initialNb: Notebook = {
        id: `nb-${ownerId}-${Date.now()}`,
        companyId: targetCompanyId,
        userId: ownerId,
        title: 'Material & Delivery Calculation Notebook',
        content: '',
        tables: [],
        updatedAt: new Date().toISOString(),
        updatedBy: ownerId,
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
              desc: { raw: 'Servo Motor 550W (Batch A)', value: 'Servo Motor 550W (Batch A)' },
              qty: { raw: '10*2', value: '20' },
              rate: { raw: '4200', value: '4200' },
              total: { raw: '{qty} * {rate}', value: '84000' },
            },
          },
        ],
      };
      setNotebook(initialNb);
      setActiveNotebookId(initialNb.id);
      saveMutation.mutate(initialNb);
    }
  }, [notebooks, activeNotebookId, isLoading, notebook, companies, currentCompanyId, currentUser]);

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
    onSuccess: (res: any) => {
      const saved: Notebook = res?.notebook || res;
      if (!saved || !saved.id) return;
      queryClient.setQueryData(
        ['notebooks', currentCompanyId, currentUser?.id],
        (old: Notebook[] | undefined) => {
          if (!old) return [saved];
          const exists = old.some((n) => n.id === saved.id);
          return exists ? old.map((n) => (n.id === saved.id ? saved : n)) : [saved, ...old];
        }
      );
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      if (api.notebooks.delete) {
        return api.notebooks.delete(id);
      }
      return { success: true };
    },
    onSuccess: (_res, deletedId) => {
      queryClient.setQueryData(
        ['notebooks', currentCompanyId, currentUser?.id],
        (old: Notebook[] | undefined) => {
          const next = (old || []).filter((n) => n.id !== deletedId);
          if (next.length > 0) {
            setActiveNotebookId(next[0]!.id);
            setNotebook(next[0]!);
          } else {
            setNotebook(null);
            setActiveNotebookId('');
          }
          return next;
        }
      );
      showToast({ message: 'Note deleted' });
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

  // Freeform Note Writing Handlers
  const handleNoteTitleChange = (title: string) => {
    if (!notebook) return;
    const updated: Notebook = {
      ...notebook,
      title,
      updatedAt: new Date().toISOString(),
    };
    setNotebook(updated);
  };

  const handleNoteTitleBlur = () => {
    if (!notebook) return;
    saveMutation.mutate(notebook);
  };

  const handleNoteContentChange = (content: string) => {
    if (!notebook) return;
    const updated: Notebook = {
      ...notebook,
      content,
      updatedAt: new Date().toISOString(),
    };
    setNotebook(updated);
    saveMutation.mutate(updated);
  };

  // Insert snippet or formatting into the freeform note editor
  const insertIntoNote = (snippet: string) => {
    if (!notebook) return;
    const current = notebook.content || '';
    const nextContent = current ? `${current}\n${snippet}` : snippet;
    updateNotebookState({
      ...notebook,
      content: nextContent,
      updatedAt: new Date().toISOString(),
    });
    setTimeout(() => {
      if (noteTextareaRef.current) {
        noteTextareaRef.current.focus();
      }
    }, 20);
  };

  // Evaluate inline math expressions written inside the note text (e.g. "Motors: 12 * 4500 =" or "100 + 250 * 2")
  const handleEvaluateInlineNoteMath = () => {
    if (!notebook || !notebook.content) {
      showToast({ message: 'Write a math expression in your note first (e.g. 25 * 450 =)' });
      return;
    }
    let evaluatedCount = 0;
    const lines = notebook.content.split('\n').map((line) => {
      // Match lines ending with "=" or containing a math expression after ":" or on the line
      const eqMatch = line.match(/^(.*?[:\-]?\s*)([\d.,+\-*×/÷()\s]+)=\s*$/);
      if (eqMatch && eqMatch[2]) {
        const expr = eqMatch[2].replace(/,/g, '').trim();
        if (/[+\-*×/÷]/.test(expr)) {
          const res = evaluateExpression(expr, { decimals: 2 });
          if (res.ok) {
            evaluatedCount++;
            return `${eqMatch[1]}${eqMatch[2].trim()} = ₹${Number(res.value).toLocaleString('en-IN')}`;
          }
        }
      }
      // Also match pure math lines without "=" yet
      const pureMatch = line.match(/^\s*([\d.,]+\s*[+\-*×/÷]\s*[\d.,+\-*×/÷()\s]+)\s*$/);
      if (pureMatch && pureMatch[1]) {
        const expr = pureMatch[1].replace(/,/g, '').trim();
        const res = evaluateExpression(expr, { decimals: 2 });
        if (res.ok) {
          evaluatedCount++;
          return `${line.trim()} = ${Number(res.value).toLocaleString('en-IN')}`;
        }
      }
      return line;
    });

    if (evaluatedCount > 0) {
      updateNotebookState({
        ...notebook,
        content: lines.join('\n'),
        updatedAt: new Date().toISOString(),
      });
      showToast({ message: `Calculated ${evaluatedCount} expression${evaluatedCount > 1 ? 's' : ''} in note` });
    } else {
      showToast({ message: 'Tip: End any math line with "=" (e.g. 12 * 4200 =) to auto-calculate' });
    }
  };

  // Quick scratchpad calculator evaluation
  const handleQuickCalcChange = (val: string) => {
    setQuickCalcExpr(val);
    const clean = val.replace(/,/g, '').trim();
    if (!clean) {
      setQuickCalcResult('');
      return;
    }
    const res = evaluateExpression(clean, { decimals: 2 });
    if (res.ok) {
      setQuickCalcResult(Number(res.value).toLocaleString('en-IN'));
    } else {
      setQuickCalcResult('');
    }
  };

  // Add an extra calculation table inside the current note
  const handleAddTableToNote = () => {
    if (!notebook) return;
    // If primary table has 0 columns (pure text note), initialize primary table first
    if (notebook.columns.length === 0) {
      const cols = createDefaultColumns();
      const firstRow = computeRowCells(cols, {
        id: `r-${Date.now()}`,
        cells: {
          desc: { raw: 'Item 1', value: 'Item 1' },
          qty: { raw: '1', value: '1' },
          rate: { raw: '0', value: '0' },
          total: { raw: '{qty} * {rate}', value: '0' },
        },
      });
      updateNotebookState({
        ...notebook,
        columns: cols,
        rows: [firstRow],
        updatedAt: new Date().toISOString(),
      });
      showToast({ message: 'Calculation table added to note' });
      return;
    }

    const existingTables = Array.isArray(notebook.tables) ? notebook.tables : [];
    const cols = createDefaultColumns();
    const firstRow = computeRowCells(cols, {
      id: `r-${Date.now()}`,
      cells: {
        desc: { raw: 'Item 1', value: 'Item 1' },
        qty: { raw: '1', value: '1' },
        rate: { raw: '0', value: '0' },
        total: { raw: '{qty} * {rate}', value: '0' },
      },
    });
    const newTable: NotebookTable = {
      id: `tbl-${Date.now()}`,
      title: `Calculation Table ${existingTables.length + 2}`,
      columns: cols,
      rows: [firstRow],
    };
    updateNotebookState({
      ...notebook,
      tables: [...existingTables, newTable],
      updatedAt: new Date().toISOString(),
    });
    showToast({ message: 'Added new calculation table to note' });
  };

  const handleRemoveExtraTable = (tableId: string) => {
    if (!notebook) return;
    if (tableId === 'primary') {
      updateNotebookState({
        ...notebook,
        columns: [],
        rows: [],
        updatedAt: new Date().toISOString(),
      });
      showToast({ message: 'Table removed from note' });
      return;
    }
    const existingTables = Array.isArray(notebook.tables) ? notebook.tables : [];
    updateNotebookState({
      ...notebook,
      tables: existingTables.filter((t) => t.id !== tableId),
      updatedAt: new Date().toISOString(),
    });
    showToast({ message: 'Table removed from note' });
  };

  const getTableById = (tableId: string): { columns: NotebookColumn[]; rows: NotebookRow[] } | null => {
    if (!notebook) return null;
    if (tableId === 'primary') {
      return { columns: notebook.columns, rows: notebook.rows };
    }
    const found = (notebook.tables || []).find((t) => t.id === tableId);
    return found ? { columns: found.columns, rows: found.rows } : null;
  };

  const updateTableById = (
    tableId: string,
    updater: (tbl: { columns: NotebookColumn[]; rows: NotebookRow[] }) => {
      columns: NotebookColumn[];
      rows: NotebookRow[];
    }
  ) => {
    if (!notebook) return;
    if (tableId === 'primary') {
      const next = updater({ columns: notebook.columns, rows: notebook.rows });
      updateNotebookState({
        ...notebook,
        columns: next.columns,
        rows: next.rows,
        updatedAt: new Date().toISOString(),
      });
      return;
    }
    const updatedTables = (notebook.tables || []).map((t) => {
      if (t.id !== tableId) return t;
      const next = updater({ columns: t.columns, rows: t.rows });
      return { ...t, columns: next.columns, rows: next.rows };
    });
    updateNotebookState({
      ...notebook,
      tables: updatedTables,
      updatedAt: new Date().toISOString(),
    });
  };

  // Start editing a cell
  const startEditing = (rowId: string, colKey: string, tableId: string = 'primary') => {
    const tbl = getTableById(tableId);
    if (!tbl) return;
    const col = tbl.columns.find((c) => c.key === colKey);
    if (col?.type === 'computed') return;

    const row = tbl.rows.find((r) => r.id === rowId);
    const cell = row?.cells[colKey];
    setEditingCell({ tableId, rowId, colKey });
    setCellInput(cell?.raw ?? '');
  };

  // Commit editing a cell
  const commitCellEdit = () => {
    if (!editingCell || !notebook) {
      setEditingCell(null);
      return;
    }

    const { tableId, rowId, colKey } = editingCell;
    const tbl = getTableById(tableId);
    if (!tbl) {
      setEditingCell(null);
      return;
    }

    const rawVal = cellInput.trim();
    let evaluatedVal = rawVal;
    const col = tbl.columns.find((c) => c.key === colKey);

    if (col?.type === 'number' || /[+\-*×/÷()]/.test(rawVal)) {
      const res = evaluateExpression(rawVal, { decimals: col?.decimals ?? 2 });
      if (res.ok) {
        evaluatedVal = res.value;
      }
    }

    updateTableById(tableId, (current) => ({
      columns: current.columns,
      rows: current.rows.map((row) => {
        if (row.id !== rowId) return row;
        const updatedCells = {
          ...row.cells,
          [colKey]: {
            raw: rawVal,
            value: evaluatedVal,
          },
        };
        return computeRowCells(current.columns, {
          ...row,
          cells: updatedCells,
        });
      }),
    }));

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
  const handleAddRow = (tableId: string = 'primary') => {
    const tbl = getTableById(tableId);
    if (!tbl) return;
    const newRowId = `r-${Date.now()}`;
    const emptyCells: NotebookRow['cells'] = {};

    tbl.columns.forEach((col) => {
      emptyCells[col.key] = {
        raw: col.type === 'number' ? '0' : '',
        value: col.type === 'number' ? '0' : '',
      };
    });

    const newRow = computeRowCells(tbl.columns, {
      id: newRowId,
      cells: emptyCells,
    });

    updateTableById(tableId, (current) => ({
      columns: current.columns,
      rows: [...current.rows, newRow],
    }));
    showToast({ message: 'Row added' });
  };

  // Delete a row
  const handleDeleteRow = (rowId: string, tableId: string = 'primary') => {
    updateTableById(tableId, (current) => ({
      columns: current.columns,
      rows: current.rows.filter((r) => r.id !== rowId),
    }));
    showToast({ message: 'Row deleted' });
  };

  // Open Column Config Sheet
  const openColumnConfig = (col?: NotebookColumn, tableId: string = 'primary') => {
    setActiveTableForCol(tableId);
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
    const tbl = getTableById(activeTableForCol);
    if (!tbl || !colTitle.trim()) return;

    let updatedColumns: NotebookColumn[];

    if (editingColumn) {
      updatedColumns = tbl.columns.map((c) => {
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
      const baseKey =
        colTitle.toLowerCase().replace(/[^a-z0-9]/g, '') || `col_${tbl.columns.length + 1}`;
      const existingKeys = new Set(tbl.columns.map((c) => c.key));
      let uniqueKey = baseKey;
      let suffix = 2;
      while (existingKeys.has(uniqueKey)) {
        uniqueKey = `${baseKey}_${suffix}`;
        suffix += 1;
      }
      const newCol: NotebookColumn = {
        id: `c-${Date.now()}`,
        key: uniqueKey,
        title: colTitle.trim(),
        type: colType,
        formula: colType === 'computed' ? colFormula.trim() : undefined,
        total: colTotal,
        decimals: 2,
      };
      updatedColumns = [...tbl.columns, newCol];
    }

    updateTableById(activeTableForCol, (current) => ({
      columns: updatedColumns,
      rows: current.rows.map((row) => computeRowCells(updatedColumns, row)),
    }));

    setColumnSheetOpen(false);
    showToast({ message: editingColumn ? 'Column updated' : 'Column added' });
  };

  // Delete column
  const handleDeleteColumn = (colId: string) => {
    const tbl = getTableById(activeTableForCol);
    if (!tbl) return;
    const colToDelete = tbl.columns.find((c) => c.id === colId);
    if (!colToDelete) return;

    const updatedColumns = tbl.columns.filter((c) => c.id !== colId);
    updateTableById(activeTableForCol, (current) => ({
      columns: updatedColumns,
      rows: current.rows.map((row) => {
        const newCells = { ...row.cells };
        delete newCells[colToDelete.key];
        return computeRowCells(updatedColumns, {
          ...row,
          cells: newCells,
        });
      }),
    }));

    setColumnSheetOpen(false);
    showToast({ message: 'Column removed' });
  };

  // Create new note / worksheet
  const handleCreateWorksheet = () => {
    if (!newTitle.trim()) return;

    const targetCompanyId =
      currentCompanyId === 'all' || !currentCompanyId ? companies[0]?.id || '' : currentCompanyId;
    const ownerId = currentUser?.id || 'staff';
    const defaultCols = newNoteWithTable ? createDefaultColumns() : [];
    const defaultRows = newNoteWithTable
      ? [
          computeRowCells(defaultCols, {
            id: 'r-new-1',
            cells: {
              desc: { raw: 'Opening Batch', value: 'Opening Batch' },
              qty: { raw: '10*5', value: '50' },
              rate: { raw: '800', value: '800' },
              total: { raw: '{qty} * {rate}', value: '40000' },
            },
          }),
        ]
      : [];

    const newNb: Notebook = {
      id: `nb-${ownerId}-${Date.now()}`,
      companyId: targetCompanyId,
      userId: ownerId,
      title: newTitle.trim(),
      content: '',
      tables: [],
      updatedAt: new Date().toISOString(),
      updatedBy: ownerId,
      columns: defaultCols,
      rows: defaultRows,
    };

    saveMutation.mutate(newNb);
    setActiveNotebookId(newNb.id);
    setNotebook(newNb);
    setNewSheetOpen(false);
    setNewTitle('');
    showToast({ message: 'New note created' });
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

  const filteredNotebooks = notebooks.filter(
    (n) =>
      n.title.toLowerCase().includes(noteSearch.toLowerCase()) ||
      (n.content && n.content.toLowerCase().includes(noteSearch.toLowerCase()))
  );

  // Render an interactive calculation table block
  const renderCalculationTable = (
    tableId: string,
    tableTitle: string,
    columns: NotebookColumn[],
    rows: NotebookRow[],
    isPrimary: boolean
  ) => (
    <div
      key={tableId}
      className="bg-surface rounded-ios-card border border-separator/50 shadow-sm overflow-hidden flex flex-col"
    >
      {/* Table Top Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2.5 bg-fill/30 border-b border-separator/40">
        <div className="flex items-center gap-2">
          <FileSpreadsheet className="w-4 h-4 text-accent" />
          {isPrimary ? (
            <span className="text-footnote font-bold text-label">Calculation Table</span>
          ) : (
            <input
              type="text"
              value={tableTitle}
              onChange={(e) => {
                const nextTitle = e.target.value;
                const updatedTables = (notebook?.tables || []).map((t) =>
                  t.id === tableId ? { ...t, title: nextTitle } : t
                );
                if (notebook) {
                  setNotebook({ ...notebook, tables: updatedTables });
                }
              }}
              onBlur={() => notebook && saveMutation.mutate(notebook)}
              className="bg-transparent text-footnote font-bold text-label focus:outline-none focus:underline"
            />
          )}
          <span className="text-caption text-label-3">
            ({rows.length} {rows.length === 1 ? 'row' : 'rows'})
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <Button
            variant="tinted"
            size="small"
            onClick={() => handleAddRow(tableId)}
            className="flex items-center gap-1 h-7 px-2 text-caption"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>{isPrimary ? 'Add Row' : 'Row'}</span>
          </Button>

          <Button
            variant="tinted"
            size="small"
            onClick={() => openColumnConfig(undefined, tableId)}
            className="flex items-center gap-1 h-7 px-2 text-caption"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2.2]" />
            <span>{isPrimary ? 'Add Column' : 'Column'}</span>
          </Button>

          <button
            type="button"
            onClick={() => handleRemoveExtraTable(tableId)}
            className="p-1.5 text-label-3 hover:text-danger hover:bg-danger/10 rounded-lg transition-colors"
            title="Remove Table from Note"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Interactive Calculation Grid */}
      <div className="overflow-x-auto max-w-full">
        <table className="w-full border-collapse text-left text-subhead">
          <thead>
            <tr className="bg-fill/40 border-b border-separator/50 text-footnote font-bold text-label-2">
              <th className="py-2.5 px-3 w-10 text-center border-r border-separator/30">#</th>
              {columns.map((col) => {
                const isComputed = col.type === 'computed';
                return (
                  <th
                    key={col.id}
                    onClick={() => openColumnConfig(col, tableId)}
                    className="py-2.5 px-3 border-r border-separator/30 hover:bg-fill/60 cursor-pointer select-none transition-colors whitespace-nowrap"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-label font-semibold">{col.title}</span>
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

          <tbody className="divide-y divide-separator/30 text-body">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length + 2}
                  className="p-6 text-center text-label-2 text-subhead"
                >
                  No rows yet. Click "+ Add Row" above to start calculating.
                </td>
              </tr>
            ) : (
              rows.map((row, rowIdx) => (
                <tr key={row.id} className="hover:bg-fill/15 transition-colors group">
                  <td className="py-2.5 px-3 text-center text-footnote font-mono text-label-3 border-r border-separator/30 select-none bg-fill/10">
                    {rowIdx + 1}
                  </td>

                  {columns.map((col) => {
                    const isEditing =
                      editingCell?.tableId === tableId &&
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
                        onClick={() => startEditing(row.id, col.key, tableId)}
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
                          {cell?.raw && cell.raw !== cell.value && !isComputed && (
                            <span className="text-[10px] text-label-3 font-mono">
                              ({cell.raw})
                            </span>
                          )}
                        </div>
                      </td>
                    );
                  })}

                  <td className="py-2 px-2 text-center">
                    <button
                      type="button"
                      onClick={() => handleDeleteRow(row.id, tableId)}
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

          {rows.length > 0 && (
            <tfoot>
              <tr className="bg-fill/50 border-t-2 border-separator/60 font-bold text-footnote">
                <td className="py-3 px-3 text-center text-label-2 border-r border-separator/30">
                  <Sigma className="w-4 h-4 mx-auto text-accent" />
                </td>
                {columns.map((col) => {
                  const totalVal = computeColumnTotal(col, rows);
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
  );

  if (isLoading && !notebook) {
    return (
      <LargeTitleScreen title="Notebook">
        <div className="p-8 text-center text-label-2 text-subhead">
          Loading calculation notebook...
        </div>
      </LargeTitleScreen>
    );
  }

  if (!notebook) {
    return (
      <LargeTitleScreen
        title="Notebook"
        headerAction={
          <Button variant="primary" size="small" onClick={() => setNewSheetOpen(true)}>
            <Plus className="w-4 h-4 mr-1" />
            New Note
          </Button>
        }
      >
        <div className="p-12 text-center text-label-2 text-subhead">
          <p className="mb-4">No notes or calculation worksheets found.</p>
          <Button variant="primary" size="default" onClick={() => setNewSheetOpen(true)}>
            <Plus className="w-4 h-4 mr-1.5" />
            Create First Note
          </Button>
        </div>
      </LargeTitleScreen>
    );
  }

  const activeColTable = getTableById(activeTableForCol) || {
    columns: notebook.columns,
    rows: notebook.rows,
  };

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

          <Button size="small" onClick={handleExportCSV} className="flex items-center gap-1">
            <Download className="w-4 h-4 stroke-[2.2]" />
            <span className="hidden sm:inline">CSV</span>
          </Button>
        </div>
      }
    >
      {/* Top Notes Strip (Google Keep / Google Docs Note Switcher + Search + New Note) */}
      <div className="flex flex-col gap-3 bg-surface p-3.5 rounded-ios-card border border-separator/40 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-label-3 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              placeholder="Search notes, party calculations, or items..."
              value={noteSearch}
              onChange={(e) => setNoteSearch(e.target.value)}
              className="w-full h-9 pl-9 pr-3 bg-fill/40 border border-separator/40 rounded-xl text-footnote text-label placeholder:text-label-3 focus:outline-none focus:border-accent"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={activeNotebookId}
              onChange={(e) => setActiveNotebookId(e.target.value)}
              className="bg-fill/50 border border-separator/40 rounded-xl px-3 py-1.5 text-footnote font-semibold text-label focus:outline-none cursor-pointer max-w-[220px] truncate"
            >
              {notebooks.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.title}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => setNewSheetOpen(true)}
              className="h-9 px-3 rounded-xl bg-accent text-white flex items-center gap-1.5 font-semibold text-footnote hover:opacity-90 active:scale-95 transition-all shrink-0 shadow-xs"
              title="New Note"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>New Note</span>
            </button>
          </div>
        </div>

        {/* Horizontal Note Cards Strip */}
        {filteredNotebooks.length > 1 && (
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {filteredNotebooks.map((n) => {
              const isSelected = n.id === notebook.id;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => {
                    setActiveNotebookId(n.id);
                    setNotebook(n);
                  }}
                  className={`px-3 py-2 rounded-xl border text-left transition-all shrink-0 max-w-[210px] flex flex-col gap-0.5 ${
                    isSelected
                      ? 'bg-accent-soft/60 border-accent text-label shadow-xs'
                      : 'bg-fill/30 border-separator/40 text-label-2 hover:bg-fill/60'
                  }`}
                >
                  <span className="text-footnote font-bold truncate">{n.title}</span>
                  <span className="text-[11px] text-label-3 truncate">
                    {n.content
                      ? n.content.slice(0, 35)
                      : `${n.rows.length} rows · ${n.columns.length} cols`}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Google Docs / Keep Note Canvas */}
      <div className="bg-surface rounded-ios-card border border-separator/50 shadow-sm p-4 flex flex-col gap-3">
        {/* Editable Note Title Header */}
        <div className="flex items-center justify-between gap-2 border-b border-separator/40 pb-2.5">
          <div className="flex items-center gap-2.5 flex-1 min-w-0">
            <div className="w-8 h-8 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div className="flex flex-col flex-1 min-w-0">
              <input
                type="text"
                value={notebook.title}
                onChange={(e) => handleNoteTitleChange(e.target.value)}
                onBlur={handleNoteTitleBlur}
                placeholder="Note Title..."
                className="text-headline font-bold text-label bg-transparent focus:outline-none w-full truncate"
              />
              <span className="text-caption text-label-3">
                Auto-saved · Private to your account ·{' '}
                <span className="hidden sm:inline">{notebook.title}</span>
              </span>
            </div>
          </div>

          {notebooks.length > 1 && (
            <button
              type="button"
              onClick={() => deleteMutation.mutate(notebook.id)}
              className="p-2 text-label-3 hover:text-danger hover:bg-danger/10 rounded-xl transition-colors"
              title="Delete Note"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Rich Note Formatting & Calculation Action Bar */}
        <div className="flex flex-wrap items-center justify-between gap-2 bg-fill/30 p-2 rounded-xl border border-separator/30">
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => insertIntoNote('• ')}
              className="px-2.5 py-1.5 rounded-lg bg-surface border border-separator/50 text-caption font-semibold text-label hover:border-accent flex items-center gap-1 shadow-2xs"
            >
              <List className="w-3.5 h-3.5 text-accent" />
              <span>Bullet</span>
            </button>

            <button
              type="button"
              onClick={() => insertIntoNote('☐ ')}
              className="px-2.5 py-1.5 rounded-lg bg-surface border border-separator/50 text-caption font-semibold text-label hover:border-accent flex items-center gap-1 shadow-2xs"
            >
              <ListChecks className="w-3.5 h-3.5 text-accent" />
              <span>Checklist</span>
            </button>

            <button
              type="button"
              onClick={() =>
                insertIntoNote(`📅 ${new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}: `)
              }
              className="px-2.5 py-1.5 rounded-lg bg-surface border border-separator/50 text-caption font-semibold text-label hover:border-accent flex items-center gap-1 shadow-2xs"
            >
              <Calendar className="w-3.5 h-3.5 text-accent" />
              <span>Date</span>
            </button>

            <button
              type="button"
              onClick={handleEvaluateInlineNoteMath}
              className="px-2.5 py-1.5 rounded-lg bg-accent-soft text-accent border border-accent/20 text-caption font-bold hover:bg-accent hover:text-white transition-colors flex items-center gap-1 shadow-2xs"
              title="Calculate any math expression ending with = inside your note"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Calculate Note Math (=)</span>
            </button>

            <button
              type="button"
              onClick={handleAddTableToNote}
              className="px-2.5 py-1.5 rounded-lg bg-accent text-white text-caption font-semibold hover:opacity-95 flex items-center gap-1 shadow-2xs"
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>+ Add Calculation Table</span>
            </button>
          </div>

          {/* Inline Instant Calculator Scratchpad */}
          <div className="flex items-center gap-1.5 bg-surface px-2.5 py-1 rounded-lg border border-separator/50 w-full sm:w-auto">
            <Calculator className="w-3.5 h-3.5 text-accent shrink-0" />
            <input
              type="text"
              value={quickCalcExpr}
              onChange={(e) => handleQuickCalcChange(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && quickCalcResult) {
                  insertIntoNote(`${quickCalcExpr.trim()} = ₹${quickCalcResult}`);
                  setQuickCalcExpr('');
                  setQuickCalcResult('');
                }
              }}
              placeholder="Quick calc: e.g. 4500*12"
              className="text-caption font-mono text-label bg-transparent focus:outline-none w-36 sm:w-40"
            />
            {quickCalcResult && (
              <button
                type="button"
                onClick={() => {
                  insertIntoNote(`${quickCalcExpr.trim()} = ₹${quickCalcResult}`);
                  setQuickCalcExpr('');
                  setQuickCalcResult('');
                }}
                className="text-caption font-mono font-bold text-accent bg-accent-soft px-1.5 py-0.5 rounded hover:opacity-80"
                title="Click to insert into note"
              >
                = {quickCalcResult} ↵
              </button>
            )}
          </div>
        </div>

        {/* Freeform Note Writing Area (Google Keep / Docs style) */}
        <textarea
          ref={noteTextareaRef}
          rows={5}
          value={notebook.content ?? ''}
          onChange={(e) => handleNoteContentChange(e.target.value)}
          placeholder="Write notes here..."
          className="w-full p-3 bg-fill/15 border border-separator/40 rounded-xl text-body text-label placeholder:text-label-3 leading-relaxed focus:outline-none focus:border-accent focus:bg-surface transition-all resize-y min-h-[120px]"
        />
      </div>

      {/* Primary Calculation Table (if present) */}
      {notebook.columns.length > 0 &&
        renderCalculationTable('primary', notebook.title, notebook.columns, notebook.rows, true)}

      {/* Additional Calculation Tables Added to Note */}
      {Array.isArray(notebook.tables) &&
        notebook.tables.map((tbl) =>
          renderCalculationTable(tbl.id, tbl.title, tbl.columns, tbl.rows, false)
        )}

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
              <span className="text-caption text-label-3">Insert column variables:</span>
              <div className="flex flex-wrap gap-1.5">
                {activeColTable.columns
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

      {/* New Note / Worksheet Sheet */}
      <Sheet
        open={newSheetOpen}
        onOpenChange={setNewSheetOpen}
        title="Create New Note"
        description="Write freeform notes and embed calculation tables"
      >
        <div className="flex flex-col gap-4 pt-2">
          <div>
            <label className="text-caption font-semibold uppercase text-label-2 mb-1 block">
              Note Title
            </label>
            <input
              type="text"
              placeholder="e.g. November Party Rates & Dispatch Notes"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              className="w-full h-11 px-3 bg-surface border border-separator/60 rounded-xl text-subhead text-label focus:outline-none focus:ring-2 focus:ring-accent/30 focus:border-accent"
            />
          </div>

          <label className="flex items-center justify-between p-3 bg-fill/40 rounded-xl border border-separator/40 cursor-pointer">
            <div className="flex flex-col">
              <span className="text-subhead font-semibold text-label">
                Include Calculation Table
              </span>
              <span className="text-caption text-label-2">
                Start with a ready-to-use Qty × Rate table (you can also add tables anytime)
              </span>
            </div>
            <input
              type="checkbox"
              checked={newNoteWithTable}
              onChange={(e) => setNewNoteWithTable(e.target.checked)}
              className="w-5 h-5 accent-accent rounded"
            />
          </label>

          <Button fullWidth disabled={!newTitle.trim()} onClick={handleCreateWorksheet}>
            Create Note
          </Button>
        </div>
      </Sheet>
    </LargeTitleScreen>
  );
};
