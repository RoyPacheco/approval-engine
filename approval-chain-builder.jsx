import { useState, useRef, useCallback, useEffect, createContext, useContext } from "react";

// ─── IDs ─────────────────────────────────────────────────────────────────────
let _id = 200;
const uid = () => `n${_id++}`;
const eid = () => `e${_id++}`;

// ─── Node dimensions ──────────────────────────────────────────────────────────
const NODE_W = 220;
const NODE_H = 90;
const PORT_R = 9;

// ─── Colors ──────────────────────────────────────────────────────────────────
const COLOR = {
  sequential: "#4ade80",
  parallel:   "#60a5fa",
  watcher:    "#f59e0b",
};
const typeColor = t => COLOR[t] || "#4ade80";

// ─── Port positions by node type ─────────────────────────────────────────────
const getPortPos = (node, side) => {
  if (!node) return { x: 0, y: 0 };
  if (node.type === "parallel") {
    return side === "out"
      ? { x: node.x + NODE_W / 2, y: node.y + NODE_H + PORT_R }
      : { x: node.x + NODE_W / 2, y: node.y - PORT_R };
  }
  return side === "out"
    ? { x: node.x + NODE_W + PORT_R, y: node.y + NODE_H / 2 }
    : { x: node.x - PORT_R,          y: node.y + NODE_H / 2 };
};

// ─── Edge path between two nodes ─────────────────────────────────────────────
const buildEdgePath = (fromNode, toNode) => {
  if (!fromNode || !toNode) return "";
  const p1 = getPortPos(fromNode, "out");
  const p2 = getPortPos(toNode,   "in");
  const dx = Math.abs(p2.x - p1.x);
  const dy = Math.abs(p2.y - p1.y);
  if (fromNode.type === "parallel" && toNode.type === "parallel") {
    const cy = (p1.y + p2.y) / 2;
    return `M ${p1.x} ${p1.y} C ${p1.x} ${cy}, ${p2.x} ${cy}, ${p2.x} ${p2.y}`;
  }
  if (fromNode.type !== "parallel" && toNode.type !== "parallel") {
    const cx = (p1.x + p2.x) / 2;
    return `M ${p1.x} ${p1.y} C ${cx} ${p1.y}, ${cx} ${p2.y}, ${p2.x} ${p2.y}`;
  }
  const offset = Math.max(dx, dy) * 0.5;
  const c1x = p1.x + (fromNode.type === "parallel" ? 0 : offset);
  const c1y = p1.y + (fromNode.type === "parallel" ? offset : 0);
  const c2x = p2.x - (toNode.type === "parallel" ? 0 : offset);
  const c2y = p2.y - (toNode.type === "parallel" ? offset : 0);
  return `M ${p1.x} ${p1.y} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
};

// ─── Coupa chain types (from template) ───────────────────────────────────────
const CHAIN_TYPES = [
  "invoice",
  "expense",
  "requisition",
  "contract",
  "receipt-request",
  "order-header-change",
  "service-time-sheets-header",
  "invoice-submission-blocking",
  "invoice-submission-warning",
  "requisition-submission-blocking",
  "requisition-submission-warning",
  "order-header-change-submission-blocking",
  "expense-submission-blocking",
  "contract-document-signatory",
  "easy-form-expense-preapproval",
  "easy-form-supplier-information",
  "easy-form-contract",
  "easy-form-user",
  "easy-form-capital-project",
  "easy-form-office-remodel",
  "easy-form-new-budget",
  "coupa-pay/supplier-payment-account",
  "coupa-pay/financial-account",
];

// ─── Condition fields (from template conditions) ──────────────────────────────
const COND_FIELDS = [
  "supplier",
  "requestor",
  "requested_by",
  "account",
  "account_type_without_segments",
  "commodity",
  "default_commodity",
  "invoice_type",
  "invoice_number_length",
  "po_match_level",
  "form_name",
  "header_cf",
  "line_cf",
  "supplier_information_cf",
  "widget_record_cf",
  "expense_category",
  "expense_category_missing_required_receipt",
  "expense_cash_advance_surplus",
  "line_description",
  "line_commodity",
  "contract_number",
  "item_name",
  "maximum_spend",
  "amount",
  "punchout_site_name",
  "approval_chain_condition.requisition_form_name",
  "approval_chain_condition.supplier_payment_account.source",
  "approval_chain_condition.service_line_type",
  "quantity",
  "hide_price",
  "line_need_by_date",
];

const COND_OPS = [
  "equals",
  "not equal to",
  "contains",
  "does not contain",
  "starts with",
  "is blank",
  "is not blank",
  "greater than or equal to",
  "greater than",
  "less than or equal to",
  "less than",
];

const COMPARATOR_OPS = [
  "Greater than",
  "Greater than or equals",
  "Less than",
  "Less than or equals",
  "Equal to",
  "Not equal to",
];

// ─── Coupa CSV export — header and row builder ────────────────────────────────
const CSV_HEADERS = [
  "Approval Chain Name","Status","Approval Chain Type","Approval Chain Subtype",
  "Priority","Skip Approvers","Skip Management Hierarchy","Skip Further Approvers",
  "Auto Approve Self","Dedupe OBO User and Auto Approve","Always Evaluate","Parallel",
  "Total Comparator","Minimum Total Amount","Maximum Total Amount","Total Currency",
  "Minimum Approval Limit","Maximum Approval Limit Amount","Maximum Approval Limit Currency",
  "Maximum Approval Limit","Operator",
  "Condition 1","Condition 2","Condition 3","Condition 4","Condition 5",
  "Condition 6","Condition 7","Condition 8","Condition 9","Condition 10",
  "Description",
  "Approver 1","Approver 2","Approver 3","Approver 4","Approver 5",
  "Approver 6","Approver 7","Approver 8","Approver 9","Approver 10",
  "Watcher 1","Watcher 2","Watcher 3","Watcher 4","Watcher 5",
  "Approver Params","Validation Message",
  "Signatory 1","Signatory 2","Signatory 3","Signatory 4","Signatory 5",
  "Applies to Supplier",
];

const csvCell = v => `"${String(v ?? "").replace(/"/g, '""')}"`;

const serializeCond = c => {
  if (!c || !c.field) return "";
  if (c.op === "is blank" || c.op === "is not blank") return `${c.field}:${c.op}:`;
  return `${c.field}:${c.op}:${c.value ?? ""}`;
};

// Topological sort of approver nodes (non-watcher)
const getApproverOrder = (nodes, edges) => {
  const approverNodes = nodes.filter(n => n.type !== "watcher");
  const approverIds   = new Set(approverNodes.map(n => n.id));
  const inDeg = {};
  approverNodes.forEach(n => { inDeg[n.id] = 0; });
  edges.forEach(ed => {
    if (approverIds.has(ed.from) && approverIds.has(ed.to)) {
      inDeg[ed.to] = (inDeg[ed.to] || 0) + 1;
    }
  });
  const queue   = approverNodes.filter(n => inDeg[n.id] === 0).map(n => n.id);
  const order   = [];
  const visited = new Set();
  while (queue.length) {
    const id = queue.shift();
    if (visited.has(id)) continue;
    visited.add(id);
    order.push(id);
    edges
      .filter(ed => ed.from === id && approverIds.has(ed.to))
      .forEach(ed => { inDeg[ed.to]--; if (inDeg[ed.to] === 0) queue.push(ed.to); });
  }
  // append any disconnected approver nodes
  approverNodes.forEach(n => { if (!visited.has(n.id)) order.push(n.id); });
  return order.map(id => nodes.find(n => n.id === id)).filter(Boolean);
};

const buildCoupaRow = chain => {
  const f           = chain.flags || {};
  const conditions  = (chain.conditions || []).slice(0, 10);
  const condStrs    = Array(10).fill("").map((_, i) => serializeCond(conditions[i]));
  const approverNodes = getApproverOrder(chain.nodes || [], chain.edges || []);
  const watcherNodes  = (chain.nodes || []).filter(n => n.type === "watcher");
  const approvers   = Array(10).fill("").map((_, i) => {
    const n = approverNodes[i];
    return n ? `${n.email || n.name}:${n.amount || ""}:${n.currency || ""}` : "";
  });
  const watchers    = Array(5).fill("").map((_, i) => watcherNodes[i]?.name || "");
  const sigs        = Array(5).fill("").map((_, i) => (chain.signatories || [])[i] || "");

  return [
    chain.name             || "",
    chain.status           || "active",
    chain.chainType        || "",
    chain.subtype          || "",
    chain.priority         ?? "",
    f.skipApprovers        ?? "",
    f.skipMgmtHierarchy    ?? "",
    f.skipFurtherApprovers ?? "",
    f.autoApproveSelf      ?? "",
    f.dedupeOBO            ?? "",
    f.alwaysEvaluate       ?? "",
    f.parallel             ?? "",
    chain.totalComparator  || "",
    chain.minTotalAmount   ?? "",
    chain.maxTotalAmount   ?? "",
    chain.totalCurrency    || "",
    chain.minApprovalLimit        ?? "",
    chain.maxApprovalLimitAmount  ?? "",
    chain.maxApprovalLimitCurrency ?? "",
    chain.maxApprovalLimit        ?? "",
    chain.condOperator     || "",
    ...condStrs,
    chain.description      || "",
    ...approvers,
    ...watchers,
    "",   // Approver Params — always empty per template
    chain.validationMessage || "",
    ...sigs,
    chain.appliesToSupplier || "No",
  ];
};

const downloadCSV = (rows, filename) => {
  const csv  = [CSV_HEADERS, ...rows].map(r => r.map(csvCell).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
};

// ─── Chains — localStorage persistence ───────────────────────────────────────
const CHAINS_KEY   = "acb_chains";
const loadChains   = () => { try { return JSON.parse(localStorage.getItem(CHAINS_KEY)) || []; } catch { return []; } };
const saveChains   = v  => localStorage.setItem(CHAINS_KEY, JSON.stringify(v));

// ─── Reference Values — localStorage persistence ─────────────────────────────
const REF_KEY      = "acb_ref_values";
const REF_DEFAULTS = { currencies: [
  { code:"USD", name:"US Dollar" },
  { code:"EUR", name:"Euro" },
  { code:"GBP", name:"British Pound" },
  { code:"JPY", name:"Japanese Yen" },
  { code:"CAD", name:"Canadian Dollar" },
  { code:"AUD", name:"Australian Dollar" },
  { code:"CHF", name:"Swiss Franc" },
  { code:"MXN", name:"Mexican Peso" },
]};
const loadRefValues = () => {
  try {
    const data = JSON.parse(localStorage.getItem(REF_KEY)) || REF_DEFAULTS;
    if (data.currencies && data.currencies.length > 0 && typeof data.currencies[0] === "string") {
      data.currencies = data.currencies.map(c => ({ code: c, name: c }));
    }
    return data;
  } catch { return REF_DEFAULTS; }
};
const saveRefValues  = v  => localStorage.setItem(REF_KEY, JSON.stringify(v));
const loadCurrencies = () => loadRefValues().currencies.map(c => c.code);

// ─── Workflows — localStorage persistence ─────────────────────────────────────
const WORKFLOWS_KEY = "acb_workflows";
const loadWorkflows = () => { try { return JSON.parse(localStorage.getItem(WORKFLOWS_KEY)) || []; } catch { return []; } };
const saveWorkflows = v => localStorage.setItem(WORKFLOWS_KEY, JSON.stringify(v));

// ─── Coupa Connections — localStorage persistence ────────────────────────────
const CONNECTIONS_KEY = "acb_connections";
const loadConnections = () => { try { return JSON.parse(localStorage.getItem(CONNECTIONS_KEY)) || []; } catch { return []; } };
const saveConnections = v => localStorage.setItem(CONNECTIONS_KEY, JSON.stringify(v));

// ─── Nav ──────────────────────────────────────────────────────────────────────
const NAV_ITEMS = [
  { id:"dashboard",   label:"Dashboard",             icon:"⬡" },
  { id:"workflow",    label:"New Approval Workflow", icon:"◈" },
  { id:"new-chain",   label:"New Approval Chain",    icon:"✦" },
  { id:"simulate",    label:"View Workflows",        icon:"▷" },
  { id:"view-chains", label:"View Approval Chains",  icon:"▤" },
  { id:"reference",   label:"Reference Values",      icon:"⊞" },
  { id:"settings",    label:"Settings",              icon:"⚙" },
  { id:"help",        label:"Help",                  icon:"?"  },
];

// ─── Theme tokens ─────────────────────────────────────────────────────────────
const TK = {
  dark: {
    // Page chrome — Tailwind gray-900 / gray-800 palette
    bg:      "#111827",  // gray-900
    topbar:  "#1f2937",  // gray-800
    panel:   "#1f2937",  // gray-800
    surface: "#111827",  // gray-900 (table headers, inner surfaces)
    deep:    "#0d1117",  // below gray-900
    // Borders
    bdr:     "#374151",  // gray-700 (dividers)
    bdrS:    "#4b5563",  // gray-600 (card borders / inputs)
    bdrD:    "#374151",  // gray-700
    // Text hierarchy
    t0:      "#f9fafb",  // gray-50  — headings / values
    t1:      "#9ca3af",  // gray-400 — subtitles / labels
    t2:      "#6b7280",  // gray-500 — muted text
    t3:      "#4b5563",  // gray-600 — dim hints
    t4:      "#374151",  // gray-700 — very dim
    inp:     "#111827",  // gray-900
    shadow:  "none",
    dots:    "radial-gradient(circle at 1.5px 1.5px, #374151 1.5px, transparent 0)",
    // ── Semantic status ────────────────────────────────────────────────────────
    successTxt: "#4ade80",    // green-400
    successBg:  "#14532d4d",  // green-900/30
    successBdr: "#16653380",  // green-800/50
    errorTxt:   "#f87171",    // red-400
    errorBg:    "#7f1d1d4d",  // red-900/30
    errorBdr:   "#99191980",  // red-800/50
    accentTxt:  "#60a5fa",    // blue-400
    accentBg:   "#1e3a8a4d",  // blue-900/30
    purpleTxt:  "#c084fc",    // purple-400
    purpleBg:   "#4a1d964d",  // purple-900/30
    orangeTxt:  "#fb923c",    // orange-400
    orangeBg:   "#7c2d124d",  // orange-900/30
    amberTxt:   "#f59e0b",    // amber-500 (app brand accent)
    // Stat card tinted backgrounds
    statChains:    "#1e3a8a1a",  // blue-900/10
    statActive:    "#14532d1a",  // green-900/10
    statWorkflows: "#451a031a",  // amber-900/10
    statConn:      "#4a1d961a",  // purple-900/10
  },
  light: {
    // Page chrome — Tailwind gray-50 / white palette
    bg:      "#f9fafb",  // gray-50
    topbar:  "#ffffff",  // white
    panel:   "#ffffff",  // white
    surface: "#f9fafb",  // gray-50
    deep:    "#f3f4f6",  // gray-100
    // Borders
    bdr:     "#e5e7eb",  // gray-200
    bdrS:    "#d1d5db",  // gray-300
    bdrD:    "#f3f4f6",  // gray-100
    // Text hierarchy
    t0:      "#111827",  // gray-900 — headings / values
    t1:      "#374151",  // gray-700 — secondary text
    t2:      "#6b7280",  // gray-500 — muted text / labels
    t3:      "#9ca3af",  // gray-400 — dim hints
    t4:      "#d1d5db",  // gray-300 — very dim
    inp:     "#ffffff",  // white
    shadow:  "0 1px 4px #0000000a",
    dots:    "radial-gradient(circle at 1.5px 1.5px, #e5e7eb 1.5px, transparent 0)",
    // ── Semantic status ────────────────────────────────────────────────────────
    successTxt: "#15803d",  // green-700
    successBg:  "#dcfce7",  // green-100
    successBdr: "#bbf7d0",  // green-200
    errorTxt:   "#b91c1c",  // red-700
    errorBg:    "#fee2e2",  // red-100
    errorBdr:   "#fecaca",  // red-200
    accentTxt:  "#1d4ed8",  // blue-700
    accentBg:   "#dbeafe",  // blue-100
    purpleTxt:  "#7e22ce",  // purple-700
    purpleBg:   "#f3e8ff",  // purple-100
    orangeTxt:  "#c2410c",  // orange-700
    orangeBg:   "#ffedd5",  // orange-100
    amberTxt:   "#d97706",  // amber-600
    // Stat card tinted backgrounds
    statChains:    "#eff6ff",  // blue-50
    statActive:    "#f0fdf4",  // green-50
    statWorkflows: "#fffbeb",  // amber-50
    statConn:      "#faf5ff",  // purple-50
  },
};
const ThemeCtx = createContext(true); // true = dark
const useTK    = () => { const dark = useContext(ThemeCtx); return TK[dark ? "dark" : "light"]; };

// ─── Shared UI helpers ────────────────────────────────────────────────────────
const Lbl = ({ children }) => {
  const t = useTK();
  return (
    <div style={{ fontSize:9, letterSpacing:"0.16em", color:t.t2, textTransform:"uppercase", marginBottom:5 }}>
      {children}
    </div>
  );
};

const Divider = () => { const t = useTK(); return <div style={{ borderTop:`1px solid ${t.bdrD}`, margin:"14px 0" }} />; };

const SectionHeader = ({ label, collapsible, open, onToggle }) => {
  const t = useTK();
  return (
    <div onClick={collapsible ? onToggle : undefined}
      style={{ display:"flex", alignItems:"center", justifyContent:"space-between",
        marginBottom:10, cursor:collapsible?"pointer":"default", userSelect:"none" }}>
      <div style={{ fontSize:9, letterSpacing:"0.18em", color:t.t4, textTransform:"uppercase", fontWeight:700 }}>{label}</div>
      {collapsible && (
        <span style={{ fontSize:11, color:t.t4, display:"inline-block",
          transform: open ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s" }}>▾</span>
      )}
    </div>
  );
};

// Yes/No toggle
const YesNoToggle = ({ value, onChange }) => {
  const t = useTK();
  return (
    <div style={{ display:"flex", gap:5 }}>
      {[["Yes", t.successTxt], ["No", t.errorTxt]].map(([opt, col]) => (
        <button key={opt} onClick={() => onChange(opt)} style={{
          flex:1, padding:"6px 0", borderRadius:6, fontSize:10, fontWeight:700,
          fontFamily:"inherit", cursor:"pointer",
          background: value === opt ? col+"22" : "transparent",
          border:     `1px solid ${value === opt ? col+"66" : t.bdrS}`,
          color:      value === opt ? col : t.t2,
          transition:"all 0.14s",
        }}>{opt}</button>
      ))}
    </div>
  );
};

// Three-state toggle: Yes / No / unset (—)
const ThreeStateToggle = ({ value, onChange }) => {
  const t = useTK();
  return (
    <div style={{ display:"flex", gap:5 }}>
      {[["Yes", t.successTxt], ["No", t.errorTxt], ["—", t.t2]].map(([opt, col]) => {
        const active = opt === "—" ? (value === "" || value == null) : value === opt;
        return (
          <button key={opt} onClick={() => onChange(opt === "—" ? "" : opt)} style={{
            flex:1, padding:"6px 0", borderRadius:6, fontSize:10, fontWeight:700,
            fontFamily:"inherit", cursor:"pointer",
            background: active ? col+"22" : "transparent",
            border:     `1px solid ${active ? col+"66" : t.bdrS}`,
            color:      active ? col : t.t2,
            transition:"all 0.14s",
          }}>{opt}</button>
        );
      })}
    </div>
  );
};

// Condition operator selector
const OPERATOR_COLORS = { "And":"#60a5fa", "Or":"#a78bfa", "Line-level And":"#34d399" };
const OperatorSelector = ({ value, onChange }) => {
  const t = useTK();
  return (
    <div style={{ display:"flex", gap:5 }}>
      {Object.entries(OPERATOR_COLORS).map(([op, col]) => (
        <button key={op} onClick={() => onChange(op)} style={{
          flex:1, padding:"5px 4px", borderRadius:6, fontSize:9, fontWeight:700,
          fontFamily:"inherit", cursor:"pointer",
          background: value === op ? col+"22" : "transparent",
          border:     `1px solid ${value === op ? col+"66" : t.bdrS}`,
          color:      value === op ? col : t.t2,
          transition:"all 0.14s",
          whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis",
        }}>{op}</button>
      ))}
    </div>
  );
};

// Sample chains for display in View Chains (pre-loaded, read-only)
const SAMPLE_CHAINS = [
  { id:"s1", name:"vCard Approval Chain",        status:"active",   chainType:"invoice",      priority:1,  updated:"2025-01-15", nodes:[], edges:[] },
  { id:"s2", name:"Requester Approval",          status:"active",   chainType:"requisition",  priority:49, updated:"2025-02-03", nodes:[], edges:[] },
  { id:"s3", name:"Amazon Approver",             status:"active",   chainType:"invoice",      priority:48, updated:"2025-01-28", nodes:[], edges:[] },
  { id:"s4", name:"Security Requests (Alo LLC)", status:"active",   chainType:"requisition",  priority:12, updated:"2025-02-10", nodes:[], edges:[] },
  { id:"s5", name:"Risk Supplier Approver",      status:"inactive", chainType:"expense",      priority:10, updated:"2024-12-01", nodes:[], edges:[] },
];

// Sample workflows for display in View Workflows (pre-loaded, read-only)
const SAMPLE_WORKFLOWS = [
  { id:"wf1", name:"Invoice Approval Workflow",   status:"active",   type:"procurement", chainCount:3, updated:"2025-02-10" },
  { id:"wf2", name:"Expense Report Workflow",     status:"active",   type:"expense",     chainCount:2, updated:"2025-01-22" },
  { id:"wf3", name:"Contract Signatory Workflow", status:"inactive", type:"legal",       chainCount:4, updated:"2024-12-15" },
  { id:"wf4", name:"Requisition Approval Flow",   status:"active",   type:"procurement", chainCount:5, updated:"2025-02-01" },
];

// ─── Workflow canvas helpers ──────────────────────────────────────────────────
const WORKFLOW_OBJECTS = [
  { type:"trigger_expense",     label:"Expenses",       icon:"💸", color:"#fb923c" },
  { type:"trigger_requisition", label:"Requisitions",   icon:"📋", color:"#60a5fa" },
  { type:"trigger_po",          label:"Purchase Order", icon:"🛒", color:"#4ade80" },
  { type:"trigger_invoice",     label:"Invoice",        icon:"🧾", color:"#c084fc" },
];
const wfNodeColor = type => {
  const obj = WORKFLOW_OBJECTS.find(o => o.type === type);
  return obj ? obj.color : (COLOR[type] || "#4ade80");
};

// Priority 50 is reserved by Coupa — excluded at data level
const PRIORITY_RESERVED = 50;
const normPriority = raw => {
  const n = Math.min(100, Math.max(1, Number(raw) || 1));
  return n === PRIORITY_RESERVED ? PRIORITY_RESERVED - 1 : n;
};

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: New Approval Workflow
// ═══════════════════════════════════════════════════════════════════════════════
function NewApprovalWorkflowPage({ onSave }) {
  const t = useTK();

  // ── Form state ──
  const [workflowName,  setWorkflowName]  = useState("");
  const [description,   setDescription]   = useState("");
  const [status,        setStatus]        = useState("active");
  const [priority,      setPriority]      = useState(10);
  const [priorityInput, setPriorityInput] = useState("10");

  // ── Section collapse state ──
  const [showObjects,   setShowObjects]   = useState(true);
  const [showApprovers, setShowApprovers] = useState(true);

  // ── Canvas state ──
  const [nodes,       setNodes]       = useState([]);
  const [edges,       setEdges]       = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [dragNode,    setDragNode]    = useState(null);
  const [connectFrom, setConnectFrom] = useState(null);
  const [mousePos,    setMousePos]    = useState({ x:0, y:0 });
  const [confirmDel,  setConfirmDel]  = useState(null);
  const [editing,     setEditing]     = useState(null);
  const [editForm,    setEditForm]    = useState({});
  const [toast,       setToast]       = useState(null);

  const canvasRef = useRef(null);
  const getNode   = id => nodes.find(n => n.id === id);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  // ── Priority handlers — 50 is system-reserved ──
  const handleSliderChange = v => {
    const n = normPriority(v);
    setPriority(n); setPriorityInput(String(n));
  };
  const handlePriorityInput = v => {
    setPriorityInput(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 1) setPriority(normPriority(n));
  };
  const handlePriorityBlur = () => {
    const n = normPriority(parseInt(priorityInput, 10) || 1);
    setPriority(n); setPriorityInput(String(n));
  };

  // ── Mouse / drag ──
  const handleMouseMove = useCallback(e => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (dragNode) {
      const dx = e.clientX - dragNode.mx, dy = e.clientY - dragNode.my;
      setNodes(p => p.map(n => n.id === dragNode.id ? { ...n, x: dragNode.ox + dx, y: dragNode.oy + dy } : n));
    }
  }, [dragNode]);
  const handleMouseUp = useCallback(() => setDragNode(null), []);

  const startDrag = (e, node) => {
    e.stopPropagation();
    setSelected(node.id);
    setDragNode({ id:node.id, ox:node.x, oy:node.y, mx:e.clientX, my:e.clientY });
  };

  const handleOutputPort = (e, nodeId) => {
    e.stopPropagation();
    setConnectFrom(nodeId);
  };
  const handleInputPort = (e, nodeId) => {
    e.stopPropagation();
    const n = getNode(nodeId);
    if (n?.type?.startsWith("trigger_") || !connectFrom || connectFrom === nodeId) return;
    if (!edges.some(ed => ed.from === connectFrom && ed.to === nodeId)) {
      setEdges(p => [...p, { id:eid(), from:connectFrom, to:nodeId }]);
      showToast("Connection added");
    }
    setConnectFrom(null);
  };

  const handleCanvasClick = () => { setConnectFrom(null); setSelected(null); };

  const handleDrop = e => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType"); if (!type) return;
    const rect    = canvasRef.current.getBoundingClientRect();
    const isTrigger = type.startsWith("trigger_");
    const obj       = WORKFLOW_OBJECTS.find(o => o.type === type);
    setNodes(p => [...p, {
      id:   uid(),
      x:    e.clientX - rect.left - NODE_W / 2,
      y:    e.clientY - rect.top  - NODE_H / 2,
      name: isTrigger ? (obj?.label || type) : (type === "watcher" ? "New Watcher" : "New Approver"),
      role: isTrigger ? "Trigger / Entry Point"  : (type === "watcher" ? "Watcher" : "Enter Role"),
      type,
    }]);
  };

  useEffect(() => {
    const fn = e => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !editing && !confirmDel)
        setConfirmDel(selected);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [selected, editing, confirmDel]);

  const doDelete = () => {
    setNodes(p => p.filter(n => n.id !== confirmDel));
    setEdges(p => p.filter(ed => ed.from !== confirmDel && ed.to !== confirmDel));
    setSelected(null); setConfirmDel(null); showToast("Removed");
  };

  const openEdit = (e, node) => {
    e.stopPropagation();
    setEditing(node.id);
    setEditForm({ name: node.name, role: node.role, type: node.type });
  };
  const saveEdit = () => {
    setNodes(p => p.map(n => n.id === editing ? { ...n, ...editForm } : n));
    setEditing(null); showToast("Updated");
  };

  const deleteEdge = (e, id) => {
    e.stopPropagation();
    setEdges(p => p.filter(ed => ed.id !== id));
    showToast("Connection removed");
  };

  const getEdgeMid = (fromId, toId) => {
    const f = getNode(fromId), tt = getNode(toId); if (!f || !tt) return { x:0, y:0 };
    const p1 = getPortPos(f, "out"), p2 = getPortPos(tt, "in");
    return { x:(p1.x+p2.x)/2, y:(p1.y+p2.y)/2 };
  };

  const liveWireEnd = () => {
    const from = getNode(connectFrom); if (!from) return null;
    const p1 = getPortPos(from, "out");
    const mx = mousePos.x, my = mousePos.y;
    if (from.type === "parallel") {
      const cy = (p1.y + my) / 2;
      return `M ${p1.x} ${p1.y} C ${p1.x} ${cy}, ${mx} ${cy}, ${mx} ${my}`;
    }
    const cx = (p1.x + mx) / 2;
    return `M ${p1.x} ${p1.y} C ${cx} ${p1.y}, ${cx} ${my}, ${mx} ${my}`;
  };

  const handleSave = () => {
    if (!workflowName.trim()) { showToast("Workflow name is required"); return; }
    onSave?.({
      id:         `wf_${Date.now()}`,
      name:       workflowName.trim(),
      description,
      status,
      priority,
      type:       nodes.find(n => n.type?.startsWith("trigger_"))?.type?.replace("trigger_","") || "custom",
      chainCount: nodes.filter(n => !n.type?.startsWith("trigger_") && n.type !== "watcher").length,
      updated:    new Date().toISOString().slice(0,10),
      nodes,
      edges,
    });
    showToast("Workflow saved!");
  };

  const inputSt = { background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"7px 10px", fontSize:12, fontFamily:"inherit", width:"100%", boxSizing:"border-box", outline:"none" };

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div style={{ width:272, background:t.topbar, borderRight:`1px solid ${t.bdr}`, display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto", transition:"background 0.25s" }}>

        {/* Workflow Info */}
        <div style={{ padding:"16px 16px 0" }}>
          <SectionHeader label="Workflow Info" />

          <div style={{ marginBottom:10 }}>
            <Lbl>Workflow Name</Lbl>
            <input value={workflowName} onChange={e => setWorkflowName(e.target.value)}
              style={inputSt} placeholder="Workflow name…" />
          </div>

          <div style={{ marginBottom:10 }}>
            <Lbl>Description</Lbl>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              rows={3} placeholder="Optional description…"
              style={{ ...inputSt, resize:"vertical", minHeight:64 }} />
          </div>

          <div style={{ marginBottom:10 }}>
            <Lbl>Status</Lbl>
            <button onClick={() => setStatus(s => s === "active" ? "inactive" : "active")} style={{
              width:"100%", padding:"8px 12px", borderRadius:7, fontSize:12, fontWeight:700,
              fontFamily:"inherit", cursor:"pointer", textAlign:"left",
              display:"flex", alignItems:"center", gap:8,
              background: status === "active" ? t.successBg : t.errorBg,
              border:    `1px solid ${status === "active" ? t.successBdr : t.errorBdr}`,
              color:      status === "active" ? t.successTxt : t.errorTxt,
            }}>
              <span style={{ fontSize:8 }}>●</span>
              {status === "active" ? "Active" : "Inactive"}
              <span style={{ marginLeft:"auto", fontSize:9, opacity:0.4 }}>click to toggle</span>
            </button>
          </div>

          <div style={{ marginBottom:4 }}>
            <Lbl>Priority</Lbl>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="range" min="1" max="100" value={Math.min(priority, 100)}
                onChange={e => handleSliderChange(e.target.value)}
                style={{ flex:1, accentColor:"#f59e0b", cursor:"pointer" }} />
              <input
                type="number" min="1"
                value={priorityInput}
                onChange={e => handlePriorityInput(e.target.value)}
                onBlur={handlePriorityBlur}
                style={{ ...inputSt, width:58, textAlign:"center", padding:"5px 6px",
                  fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:"#f59e0b", fontWeight:700 }} />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:t.t3, marginTop:2, paddingRight:66 }}>
              <span>1 – high</span><span>100 – low</span>
            </div>
            <div style={{ fontSize:9, color:t.amberTxt, opacity:0.55, marginTop:3 }}>
              50 is system-reserved — skipped automatically
            </div>
          </div>
        </div>

        <Divider />

        {/* Objects Section */}
        <div style={{ padding:"0 16px" }}>
          <SectionHeader label="Objects" collapsible open={showObjects} onToggle={() => setShowObjects(v => !v)} />
          {showObjects && (
            <div style={{ display:"flex", flexDirection:"column", gap:8, marginBottom:4 }}>
              {WORKFLOW_OBJECTS.map(obj => (
                <div key={obj.type}
                  draggable
                  onDragStart={e => e.dataTransfer.setData("nodeType", obj.type)}
                  style={{
                    background:`linear-gradient(135deg,${obj.color}12,${obj.color}06)`,
                    border:`1px solid ${obj.color}30`,
                    borderLeft:`3px solid ${obj.color}`,
                    borderRadius:9, padding:"11px 14px", cursor:"grab", userSelect:"none",
                  }}
                  onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
                  onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                  onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:14 }}>{obj.icon}</span>
                    <span style={{ fontSize:12, fontWeight:700, color:obj.color }}>{obj.label}</span>
                    <span style={{ marginLeft:"auto", fontSize:8, color:obj.color, opacity:0.6,
                      background:obj.color+"18", border:`1px solid ${obj.color}28`,
                      borderRadius:4, padding:"2px 5px", letterSpacing:"0.1em",
                      fontWeight:700, textTransform:"uppercase" }}>Trigger</span>
                  </div>
                  <div style={{ fontSize:10, color:t.t3, marginTop:4, marginLeft:22 }}>
                    Entry point — initiates workflow
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider />

        {/* Approvers Section */}
        <div style={{ padding:"0 16px" }}>
          <SectionHeader label="Approvers" collapsible open={showApprovers} onToggle={() => setShowApprovers(v => !v)} />
          {showApprovers && (
            <>
              <div draggable onDragStart={e => e.dataTransfer.setData("nodeType","sequential")}
                style={{ background:"linear-gradient(135deg,#0f1e14,#0d1a12)", border:"1px solid #1a3d22", borderLeft:`3px solid ${COLOR.sequential}`,
                  borderRadius:9, padding:"13px 14px", marginBottom:10, cursor:"grab", userSelect:"none" }}
                onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
                onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:15 }}>▶</span>
                  <span style={{ fontSize:12, fontWeight:700, color:COLOR.sequential }}>Sequential Approver</span>
                </div>
                <div style={{ fontSize:10, color:"#2a3a56", marginLeft:22 }}>→ Connects left / right</div>
              </div>

              <div draggable onDragStart={e => e.dataTransfer.setData("nodeType","parallel")}
                style={{ background:"linear-gradient(135deg,#0d1a2e,#0b1624)", border:"1px solid #1a2e52", borderLeft:`3px solid ${COLOR.parallel}`,
                  borderRadius:9, padding:"13px 14px", marginBottom:10, cursor:"grab", userSelect:"none" }}
                onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
                onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:15 }}>⋮</span>
                  <span style={{ fontSize:12, fontWeight:700, color:COLOR.parallel }}>Parallel Approver</span>
                </div>
                <div style={{ fontSize:10, color:"#2a3a56", marginLeft:22 }}>↕ Connects top / bottom</div>
              </div>

              <div draggable onDragStart={e => e.dataTransfer.setData("nodeType","watcher")}
                style={{ background:"linear-gradient(135deg,#1a1400,#120f00)", border:"1px solid #2e2200", borderLeft:`3px solid ${COLOR.watcher}`,
                  borderRadius:9, padding:"13px 14px", cursor:"grab", userSelect:"none" }}
                onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
                onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
                onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
                <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
                  <span style={{ fontSize:15 }}>👁</span>
                  <span style={{ fontSize:12, fontWeight:700, color:COLOR.watcher }}>Watcher</span>
                </div>
                <div style={{ fontSize:10, color:"#3a2a00", marginLeft:22 }}>No connections — notified only</div>
              </div>
            </>
          )}
        </div>

        <Divider />

        {/* Metrics */}
        <div style={{ padding:"0 16px", display:"flex", gap:8, marginBottom:14 }}>
          {[
            { label:"Objects",   val: nodes.filter(n => n.type?.startsWith("trigger_")).length },
            { label:"Approvers", val: nodes.filter(n => !n.type?.startsWith("trigger_") && n.type !== "watcher").length },
            { label:"Connects",  val: edges.length },
          ].map(({ label, val }) => (
            <div key={label} style={{ flex:1, background:t.surface, border:`1px solid ${t.bdrS}`, borderRadius:7, padding:"8px 6px", textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color:t.t0 }}>{val}</div>
              <div style={{ fontSize:8, color:t.t2, textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ padding:"0 16px", display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
          <button onClick={handleSave}
            style={{ width:"100%", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer",
              fontFamily:"inherit", borderRadius:9, border:"none",
              background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
              color:"#fff", transition:"all 0.2s" }}>
            ☁ Save Workflow
          </button>
          <button
            style={{ width:"100%", background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:9, color:"#070b12", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            ↑ Load Workflow
          </button>
          <button onClick={() => { setNodes([]); setEdges([]); setSelected(null); showToast("Canvas cleared"); }}
            style={{ width:"100%", background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"9px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
            Clear Canvas
          </button>
        </div>
      </div>

      {/* ═══ CANVAS ═══ */}
      <div ref={canvasRef}
        style={{ flex:1, position:"relative", overflow:"hidden",
          cursor: connectFrom ? "crosshair" : "default",
          background: t.bg,
          backgroundImage: t.dots,
          backgroundSize:"36px 36px", transition:"background 0.25s" }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

        {/* SVG edges */}
        <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none", overflow:"visible" }}>
          <defs>
            <marker id="wf-arr"      markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,9 3.5,0 7" fill="#1e3560"/></marker>
            <marker id="wf-arr-live" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,9 3.5,0 7" fill="#f59e0b"/></marker>
          </defs>
          {edges.map(edge => {
            const f  = getNode(edge.from);
            const tn = getNode(edge.to);
            const mid = getEdgeMid(edge.from, edge.to);
            return (
              <g key={edge.id}>
                <path d={buildEdgePath(f, tn)} fill="none" stroke="#1e3560" strokeWidth={2} markerEnd="url(#wf-arr)" />
                <circle cx={mid.x} cy={mid.y} r={9} fill="#0d1321" stroke="#1e3560" strokeWidth={1.5}
                  style={{ pointerEvents:"all", cursor:"pointer" }} onClick={e => deleteEdge(e, edge.id)} />
                <text x={mid.x} y={mid.y+4.5} textAnchor="middle" fill="#3b5278" fontSize="11"
                  style={{ pointerEvents:"none", userSelect:"none" }}>×</text>
              </g>
            );
          })}
          {connectFrom && liveWireEnd() && (
            <path d={liveWireEnd()} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="8 5" markerEnd="url(#wf-arr-live)" />
          )}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const isSel     = selected === node.id;
          const isTrigger = node.type?.startsWith("trigger_");
          const isWatcher = node.type === "watcher";
          const isPar     = node.type === "parallel";
          const col       = wfNodeColor(node.type);
          const trigObj   = isTrigger ? WORKFLOW_OBJECTS.find(o => o.type === node.type) : null;
          return (
            <div key={node.id}
              onMouseDown={e => startDrag(e, node)}
              onDoubleClick={e => !isTrigger && openEdit(e, node)}
              onClick={e => { e.stopPropagation(); setSelected(node.id); }}
              style={{
                position:"absolute", left:node.x, top:node.y, width:NODE_W, height:NODE_H,
                background: isTrigger
                  ? `linear-gradient(135deg,${col}20,${col}0a)`
                  : (isSel ? `linear-gradient(135deg,${col}18,${col}08)` : "linear-gradient(135deg,#0d1625,#090f1c)"),
                border:       `1px solid ${isSel ? col+"99" : (isTrigger ? col+"40" : "#111c2e")}`,
                borderLeft:   isTrigger || (!isWatcher && !isPar) ? `3px solid ${col}` : undefined,
                borderTop:    isPar && !isTrigger ? `3px solid ${col}` : undefined,
                borderRight:  isWatcher ? `3px solid ${col}` : undefined,
                borderBottom: isWatcher ? `3px solid ${col}` : undefined,
                borderRadius: 11,
                boxShadow:    isSel ? `0 0 0 1px ${col}30,0 10px 36px #00000090` : "0 4px 20px #00000060",
                cursor:       dragNode?.id === node.id ? "grabbing" : "grab",
                userSelect:   "none",
                display:"flex", alignItems:"center", paddingLeft:16, paddingRight:18, gap:10, boxSizing:"border-box",
              }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:col+"18", border:`1.5px solid ${col}44`,
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0, fontSize:isTrigger || isWatcher ? 16 : 14, color:col, fontWeight:700 }}>
                {isTrigger ? trigObj?.icon : isWatcher ? "👁" : node.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{node.name}</div>
                <div style={{ fontSize:10, color: isTrigger ? col+"99" : "#3b5278", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{node.role}</div>
              </div>
              <div style={{ position:"absolute", top:6, right:6, fontSize:8, color:col, background:col+"14",
                border:`1px solid ${col}30`, borderRadius:4, padding:"2px 5px",
                textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:700 }}>
                {isTrigger ? "Trigger" : isWatcher ? "Watcher" : node.type}
              </div>

              {/* Output port — all non-watcher nodes */}
              {!isWatcher && (
                <div onClick={e => handleOutputPort(e, node.id)} style={{
                  position:"absolute",
                  ...(isPar && !isTrigger
                    ? { bottom:-PORT_R, left:"50%", transform:"translateX(-50%)" }
                    : { right:-PORT_R, top:"50%", transform:"translateY(-50%)" }),
                  width:PORT_R*2, height:PORT_R*2, borderRadius:"50%",
                  background: connectFrom === node.id ? "#f59e0b" : "#070b12",
                  border:`2px solid ${connectFrom === node.id ? "#f59e0b" : col+"80"}`,
                  cursor:"pointer", zIndex:3, transition:"all 0.15s",
                }} />
              )}

              {/* Input port — non-watcher, non-trigger nodes */}
              {!isWatcher && !isTrigger && (
                <div onClick={e => handleInputPort(e, node.id)} style={{
                  position:"absolute",
                  ...(isPar
                    ? { top:-PORT_R, left:"50%", transform:"translateX(-50%)" }
                    : { left:-PORT_R, top:"50%", transform:"translateY(-50%)" }),
                  width:PORT_R*2, height:PORT_R*2, borderRadius:"50%",
                  background: connectFrom ? "#f59e0b22" : "#070b12",
                  border:`2px solid ${connectFrom ? "#f59e0b" : "#1e3560"}`,
                  cursor:"pointer", zIndex:3, transition:"all 0.15s",
                }} />
              )}
            </div>
          );
        })}

        {nodes.length === 0 && (
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            textAlign:"center", pointerEvents:"none", userSelect:"none" }}>
            <div style={{ fontSize:52, marginBottom:14, opacity:0.1 }}>◈</div>
            <div style={{ fontSize:13, color:t.t3, letterSpacing:"0.12em", textTransform:"uppercase" }}>
              Drag objects or approvers onto the canvas
            </div>
          </div>
        )}

        {connectFrom && (
          <div style={{ position:"absolute", top:18, left:"50%", transform:"translateX(-50%)",
            background:"#f59e0b", color:"#070b12", borderRadius:8, padding:"8px 20px",
            fontSize:12, fontWeight:700, pointerEvents:"none", boxShadow:"0 4px 20px #f59e0b60" }}>
            Click the input port of a node to connect — or click canvas to cancel
          </div>
        )}
      </div>

      {/* Confirm Delete */}
      {confirmDel && (() => {
        const node      = getNode(confirmDel);
        const isTrigger = node?.type?.startsWith("trigger_");
        return (
          <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}
            onClick={() => setConfirmDel(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:t.panel, border:`1px solid ${t.bdrS}`, borderTop:`3px solid ${t.errorTxt}`, borderRadius:14, padding:"30px", width:360, boxShadow:"0 32px 80px #000000c0", textAlign:"center" }}>
              <div style={{ fontSize:30, marginBottom:10 }}>⚠</div>
              <div style={{ fontSize:14, fontWeight:700, color:t.t0, marginBottom:6 }}>
                Remove {isTrigger ? "Trigger" : node?.type === "watcher" ? "Watcher" : "Approver"}?
              </div>
              <div style={{ fontSize:12, color:t.t2, marginBottom:6 }}>
                <span style={{ color:t.t1, fontWeight:600 }}>{node?.name}</span>
              </div>
              <div style={{ fontSize:11, color:t.t3, marginBottom:26 }}>All connections will also be removed.</div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={doDelete} style={{ flex:1, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none", borderRadius:9, color:"#fff", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Yes, Remove</button>
                <button onClick={() => setConfirmDel(null)} style={{ flex:1, background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"11px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Node Modal */}
      {editing && (
        <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}
          onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:t.panel, border:`1px solid ${t.bdrS}`, borderTop:"3px solid #f59e0b", borderRadius:14, padding:"30px", width:400, boxShadow:"0 32px 80px #000000c0" }}>
            <div style={{ fontSize:10, letterSpacing:"0.18em", color:t.t2, textTransform:"uppercase", marginBottom:22 }}>Edit Node</div>
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:9, color:t.t2, display:"block", marginBottom:6, letterSpacing:"0.12em" }}>NAME / LOGIN</label>
              <input autoFocus value={editForm.name || ""}
                onChange={e => setEditForm(f => ({ ...f, name: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveEdit()}
                placeholder="Coupa login or group name…"
                style={{ width:"100%", background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"10px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }} />
            </div>
            <div style={{ marginBottom:22 }}>
              <label style={{ fontSize:9, color:t.t2, display:"block", marginBottom:6, letterSpacing:"0.12em" }}>ROLE / TITLE</label>
              <input value={editForm.role || ""}
                onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveEdit()}
                placeholder="Job title or role…"
                style={{ width:"100%", background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"10px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }} />
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={saveEdit} style={{ flex:1, background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:9, color:"#070b12", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Save</button>
              <button onClick={() => setEditing(null)} style={{ flex:1, background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"11px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:26, left:"50%", transform:"translateX(-50%)", background:t.panel, border:`1px solid ${t.bdrS}`, borderRadius:8, padding:"9px 22px", fontSize:12, color:t.t1, boxShadow:"0 8px 32px #00000080", zIndex:400, pointerEvents:"none" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: New Approval Chain
// ═══════════════════════════════════════════════════════════════════════════════
function NewApprovalChainPage({ onSave, editingChain }) {
  const ec = editingChain || {};

  // ── Chain info ──
  const [chainName,     setChainName]     = useState(ec.name      || "New Approval Chain");
  const [chainType,     setChainType]     = useState(ec.chainType || CHAIN_TYPES[0]);
  const [subtype,       setSubtype]       = useState(ec.subtype   || "");
  const [status,        setStatus]        = useState(ec.status    || "active");
  const [priority,      setPriority]      = useState(ec.priority  || 50);
  const [priorityInput, setPriorityInput] = useState(String(ec.priority || 50));

  // ── Comparator (Total Comparator / Min Amount / Currency) ──
  const [comparatorOp,       setComparatorOp]       = useState(ec.totalComparator  || "Greater than");
  const [comparatorAmount,   setComparatorAmount]   = useState(ec.minTotalAmount   ?? "");
  const [comparatorCurrency, setComparatorCurrency] = useState(ec.totalCurrency    || loadCurrencies()[0] || "USD");

  // ── Conditions ──
  const [condOperator, setCondOperator] = useState(ec.condOperator || "And");
  const [conditions,   setConditions]   = useState(
    ec.conditions?.length ? ec.conditions : [{ id:"c1", field:"supplier", op:"equals", value:"" }]
  );
  const addCond  = () => { if (conditions.length < 10) setConditions(p => [...p, { id:`c${Date.now()}`, field:"supplier", op:"equals", value:"" }]); };
  const remCond  = id => setConditions(p => p.filter(c => c.id !== id));
  const updCond  = (id, k, v) => setConditions(p => p.map(c => c.id === id ? { ...c, [k]: v } : c));

  // ── Chain flags ──
  const [flags, setFlags] = useState(ec.flags || {
    skipApprovers:"", skipMgmtHierarchy:"", skipFurtherApprovers:"No",
    autoApproveSelf:"No", dedupeOBO:"No", alwaysEvaluate:"", parallel:"No",
  });
  const setFlag = (k, v) => setFlags(f => ({ ...f, [k]: v }));

  // ── Additional fields ──
  const [description,       setDescription]       = useState(ec.description       || "");
  const [validationMessage, setValidationMessage] = useState(ec.validationMessage || "");
  const [appliesToSupplier, setAppliesToSupplier] = useState(ec.appliesToSupplier || "No");
  const [signatories,       setSignatories]       = useState(ec.signatories?.length ? ec.signatories : [""]);
  const addSig    = () => { if (signatories.length < 5) setSignatories(s => [...s, ""]); };
  const removeSig = i => setSignatories(s => s.filter((_, idx) => idx !== i));
  const updateSig = (i, v) => setSignatories(s => s.map((x, idx) => idx === i ? v : x));

  // ── Canvas state ──
  const [approverMode,  setApproverMode]  = useState("sequential");
  const [nodes,         setNodes]         = useState(ec.nodes || []);
  const [edges,         setEdges]         = useState(ec.edges || []);
  const [selected,      setSelected]      = useState(null);
  const [editing,       setEditing]       = useState(null);
  const [editForm,      setEditForm]      = useState({ name:"", email:"", role:"", amount:"", currency:"", type:"sequential" });
  const [dragNode,      setDragNode]      = useState(null);
  const [connectFrom,   setConnectFrom]   = useState(null);
  const [mousePos,      setMousePos]      = useState({ x:0, y:0 });
  const [confirmDel,    setConfirmDel]    = useState(null);
  const [toast,         setToast]         = useState(null);

  // ── Section collapse state ──
  const [showFlags,      setShowFlags]      = useState(true);
  const [showConds,      setShowConds]      = useState(true);
  const [showAdditional, setShowAdditional] = useState(false);

  const canvasRef = useRef(null);
  const getNode   = id => nodes.find(n => n.id === id);
  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2400); };

  // Priority sync
  const handleSliderChange = v => {
    const n = Math.min(999, Math.max(1, Number(v)));
    setPriority(n); setPriorityInput(String(n));
  };
  const handlePriorityInput = v => {
    setPriorityInput(v);
    const n = parseInt(v, 10);
    if (!isNaN(n) && n >= 1) setPriority(n);
  };
  const handlePriorityBlur = () => {
    const n = Math.max(1, parseInt(priorityInput, 10) || 1);
    setPriority(n); setPriorityInput(String(n));
  };

  // Mouse
  const handleMouseMove = useCallback(e => {
    const rect = canvasRef.current?.getBoundingClientRect(); if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
    if (dragNode) {
      const dx = e.clientX - dragNode.mx, dy = e.clientY - dragNode.my;
      setNodes(p => p.map(n => n.id === dragNode.id ? { ...n, x: dragNode.ox + dx, y: dragNode.oy + dy } : n));
    }
  }, [dragNode]);
  const handleMouseUp = useCallback(() => setDragNode(null), []);

  const startDrag = (e, node) => {
    e.stopPropagation();
    setSelected(node.id);
    setDragNode({ id:node.id, ox:node.x, oy:node.y, mx:e.clientX, my:e.clientY });
  };

  const handleOutputPort = (e, nodeId) => {
    e.stopPropagation();
    const n = getNode(nodeId);
    if (n?.type === "watcher") return;
    setConnectFrom(nodeId);
  };
  const handleInputPort = (e, nodeId) => {
    e.stopPropagation();
    const n = getNode(nodeId);
    if (n?.type === "watcher" || !connectFrom || connectFrom === nodeId) return;
    if (!edges.some(ed => ed.from === connectFrom && ed.to === nodeId)) {
      setEdges(p => [...p, { id: eid(), from: connectFrom, to: nodeId }]);
      showToast("Connection added");
    }
    setConnectFrom(null);
  };

  const handleCanvasClick = () => { setConnectFrom(null); setSelected(null); };

  const handleDrop = e => {
    e.preventDefault();
    const type = e.dataTransfer.getData("nodeType"); if (!type) return;
    const rect = canvasRef.current.getBoundingClientRect();
    setNodes(p => [...p, {
      id:   uid(),
      x:    e.clientX - rect.left - NODE_W / 2,
      y:    e.clientY - rect.top  - NODE_H / 2,
      name: type === "watcher" ? "New Watcher" : "New Approver",
      role: type === "watcher" ? "Watcher"     : "Enter Role",
      type,
    }]);
  };

  useEffect(() => {
    const fn = e => {
      if ((e.key === "Delete" || e.key === "Backspace") && selected && !editing && !confirmDel)
        setConfirmDel(selected);
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, [selected, editing, confirmDel]);

  const doDelete = () => {
    setNodes(p => p.filter(n => n.id !== confirmDel));
    setEdges(p => p.filter(ed => ed.from !== confirmDel && ed.to !== confirmDel));
    setSelected(null); setConfirmDel(null); showToast("Removed");
  };

  const openEdit = (e, node) => {
    e.stopPropagation();
    setEditing(node.id);
    const currencies = loadCurrencies();
    setEditForm({
      name:     node.name,
      email:    node.email    || "",
      role:     node.role,
      amount:   node.amount   || "",
      currency: node.currency || currencies[0] || "",
      type:     node.type,
    });
  };
  const saveEdit = () => {
    setNodes(p => p.map(n => n.id === editing ? { ...n, ...editForm } : n));
    setEditing(null); showToast("Updated");
  };

  const deleteEdge = (e, id) => {
    e.stopPropagation();
    setEdges(p => p.filter(ed => ed.id !== id));
    showToast("Connection removed");
  };

  const getEdgeMid = (fromId, toId) => {
    const f = getNode(fromId), t = getNode(toId); if (!f || !t) return { x:0, y:0 };
    const p1 = getPortPos(f, "out"), p2 = getPortPos(t, "in");
    return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
  };

  // ── Save ──
  const handleSave = () => {
    if (!chainName.trim()) { showToast("Chain name is required"); return; }
    onSave({
      // Internal
      id: ec.id || `chain_${Date.now()}`,
      updated: new Date().toISOString().slice(0, 10),
      nodes,
      edges,
      approverMode,
      // Coupa fields — direct mapping
      name:        chainName.trim(),
      chainType,
      subtype,
      status,
      priority,
      flags:       { ...flags },
      totalComparator:         comparatorOp,
      minTotalAmount:          comparatorAmount,
      maxTotalAmount:          "",
      totalCurrency:           comparatorCurrency,
      minApprovalLimit:        "",
      maxApprovalLimitAmount:  "",
      maxApprovalLimitCurrency:"",
      maxApprovalLimit:        "",
      condOperator,
      conditions,
      description,
      validationMessage,
      appliesToSupplier,
      signatories: signatories.filter(s => s.trim()),
    });
    showToast("Chain saved!");
  };

  // ── Export current chain as Coupa CSV ──
  const exportCSV = () => {
    const chain = {
      id: ec.id, name: chainName.trim(), chainType, subtype, status, priority,
      flags, totalComparator: comparatorOp, minTotalAmount: comparatorAmount,
      maxTotalAmount: "", totalCurrency: comparatorCurrency,
      minApprovalLimit: "", maxApprovalLimitAmount: "", maxApprovalLimitCurrency: "", maxApprovalLimit: "",
      condOperator, conditions, description, validationMessage, appliesToSupplier,
      signatories: signatories.filter(s => s.trim()),
      nodes, edges,
    };
    downloadCSV([buildCoupaRow(chain)], `${chainName.replace(/\s+/g,"_")}.csv`);
    showToast("Exported!");
  };

  const t = useTK();
  const inputSt  = { background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"7px 10px", fontSize:12, fontFamily:"inherit", width:"100%", boxSizing:"border-box", outline:"none" };
  const selectSt = { ...inputSt, cursor:"pointer" };

  const liveWireEnd = () => {
    const from = getNode(connectFrom); if (!from) return null;
    const p1 = getPortPos(from, "out");
    const mx = mousePos.x, my = mousePos.y;
    if (from.type === "parallel") {
      const cy = (p1.y + my) / 2;
      return `M ${p1.x} ${p1.y} C ${p1.x} ${cy}, ${mx} ${cy}, ${mx} ${my}`;
    }
    const cx = (p1.x + mx) / 2;
    return `M ${p1.x} ${p1.y} C ${cx} ${p1.y}, ${cx} ${my}, ${mx} ${my}`;
  };

  return (
    <div style={{ display:"flex", height:"100%", overflow:"hidden" }}>

      {/* ═══ LEFT SIDEBAR ═══ */}
      <div style={{ width:272, background:t.topbar, borderRight:`1px solid ${t.bdr}`, display:"flex", flexDirection:"column", flexShrink:0, overflowY:"auto", transition:"background 0.25s" }}>

        {/* Chain Info */}
        <div style={{ padding:"16px 16px 0" }}>
          <SectionHeader label="Chain Info" />

          <div style={{ marginBottom:10 }}>
            <Lbl>Chain Name</Lbl>
            <input value={chainName} onChange={e => setChainName(e.target.value)} style={inputSt} placeholder="Chain name…" />
          </div>

          <div style={{ marginBottom:10 }}>
            <Lbl>Chain Type</Lbl>
            <select value={chainType} onChange={e => setChainType(e.target.value)} style={selectSt}>
              {CHAIN_TYPES.map(t => <option key={t}>{t}</option>)}
            </select>
          </div>

          <div style={{ marginBottom:10 }}>
            <Lbl>Subtype</Lbl>
            <input value={subtype} onChange={e => setSubtype(e.target.value)} style={inputSt} placeholder="Optional…" />
          </div>

          <div style={{ marginBottom:10 }}>
            <Lbl>Status</Lbl>
            <button onClick={() => setStatus(s => s === "active" ? "inactive" : "active")} style={{
              width:"100%", padding:"8px 12px", borderRadius:7, fontSize:12, fontWeight:700,
              fontFamily:"inherit", cursor:"pointer", textAlign:"left",
              display:"flex", alignItems:"center", gap:8,
              background: status === "active" ? t.successBg : t.errorBg,
              border: `1px solid ${status === "active" ? t.successBdr : t.errorBdr}`,
              color:  status === "active" ? t.successTxt : t.errorTxt,
            }}>
              <span style={{ fontSize:8 }}>●</span>
              {status === "active" ? "Active" : "Inactive"}
              <span style={{ marginLeft:"auto", fontSize:9, opacity:0.4 }}>click to toggle</span>
            </button>
          </div>

          <div style={{ marginBottom:4 }}>
            <Lbl>Priority</Lbl>
            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
              <input type="range" min="1" max="100" value={Math.min(priority, 100)}
                onChange={e => handleSliderChange(e.target.value)}
                style={{ flex:1, accentColor:"#f59e0b", cursor:"pointer" }} />
              <input
                type="number" min="1"
                value={priorityInput}
                onChange={e => handlePriorityInput(e.target.value)}
                onBlur={handlePriorityBlur}
                style={{ ...inputSt, width:58, textAlign:"center", padding:"5px 6px",
                  fontSize:12, fontFamily:"'IBM Plex Mono',monospace", color:"#f59e0b", fontWeight:700 }}
              />
            </div>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:9, color:t.t3, marginTop:2, paddingRight:66 }}>
              <span>1 – high</span><span>100 – low</span>
            </div>
          </div>
        </div>

        <Divider />

        {/* Conditions */}
        <div style={{ padding:"0 16px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <SectionHeader label={`Conditions (${conditions.length}/10)`} collapsible open={showConds} onToggle={() => setShowConds(v => !v)} />
            {showConds && (
              <button onClick={addCond} disabled={conditions.length >= 10}
                style={{ padding:"3px 9px", borderRadius:5, fontSize:10, fontWeight:700, fontFamily:"inherit", cursor:"pointer", background:"transparent", border:`1px solid ${t.bdrS}`, color:t.t2, marginLeft:8, flexShrink:0 }}>
                + Add
              </button>
            )}
          </div>
          {showConds && (
            <>
              <div style={{ marginBottom:10 }}>
                <Lbl>Condition Operator</Lbl>
                <OperatorSelector value={condOperator} onChange={setCondOperator} />
              </div>
              {conditions.map((c, i) => (
                <div key={c.id} style={{ background:t.deep, border:`1px solid ${t.bdrD}`, borderLeft:"2px solid #f59e0b44", borderRadius:8, padding:"9px 9px 7px", marginBottom:8 }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:6 }}>
                    <span style={{ fontSize:9, color:"#f59e0b77", fontFamily:"monospace", letterSpacing:"0.1em" }}>#{i+1}</span>
                    <button onClick={() => remCond(c.id)} style={{ background:"transparent", border:"none", color:t.t3, cursor:"pointer", fontSize:13, lineHeight:1 }}>×</button>
                  </div>
                  <select value={c.field} onChange={e => updCond(c.id,"field",e.target.value)} style={{ ...selectSt, marginBottom:5 }}>
                    {COND_FIELDS.map(f => <option key={f}>{f}</option>)}
                  </select>
                  <select value={c.op} onChange={e => updCond(c.id,"op",e.target.value)} style={{ ...selectSt, marginBottom: c.op==="is blank"||c.op==="is not blank" ? 0 : 5 }}>
                    {COND_OPS.map(o => <option key={o}>{o}</option>)}
                  </select>
                  {c.op !== "is blank" && c.op !== "is not blank" && (
                    <input value={c.value} onChange={e => updCond(c.id,"value",e.target.value)} placeholder="Value…" style={inputSt} />
                  )}
                </div>
              ))}
            </>
          )}
        </div>

        <Divider />

        {/* Chain Flags */}
        <div style={{ padding:"0 16px" }}>
          <SectionHeader label="Chain Flags" collapsible open={showFlags} onToggle={() => setShowFlags(v => !v)} />
          {showFlags && (
            <>
              {/* Three-state flags (can be empty in Coupa) */}
              {[
                { k:"skipApprovers",     l:"Skip Approvers",           three:true  },
                { k:"skipMgmtHierarchy", l:"Skip Mgmt Hierarchy",      three:true  },
                { k:"alwaysEvaluate",    l:"Always Evaluate",          three:true  },
              ].map(({ k, l, three }) => (
                <div key={k} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, color:t.t4, marginBottom:4 }}>{l}</div>
                  <ThreeStateToggle value={flags[k]} onChange={v => setFlag(k, v)} />
                </div>
              ))}
              {/* Yes/No flags */}
              {[
                { k:"skipFurtherApprovers", l:"Skip Further Approvers" },
                { k:"autoApproveSelf",      l:"Auto Approve Self" },
                { k:"dedupeOBO",            l:"Dedupe OBO & Auto Approve" },
                { k:"parallel",             l:"Parallel" },
              ].map(({ k, l }) => (
                <div key={k} style={{ marginBottom:8 }}>
                  <div style={{ fontSize:10, color:t.t4, marginBottom:4 }}>{l}</div>
                  <YesNoToggle value={flags[k]} onChange={v => setFlag(k, v)} />
                </div>
              ))}
            </>
          )}
        </div>

        <Divider />

        {/* Additional Fields */}
        <div style={{ padding:"0 16px" }}>
          <SectionHeader label="Additional" collapsible open={showAdditional} onToggle={() => setShowAdditional(v => !v)} />
          {showAdditional && (
            <>
              <div style={{ marginBottom:10 }}>
                <Lbl>Description</Lbl>
                <textarea value={description} onChange={e => setDescription(e.target.value)}
                  rows={2} placeholder="Optional description…"
                  style={{ ...inputSt, resize:"vertical", minHeight:52 }} />
              </div>
              <div style={{ marginBottom:10 }}>
                <Lbl>Validation Message</Lbl>
                <textarea value={validationMessage} onChange={e => setValidationMessage(e.target.value)}
                  rows={2} placeholder="Shown for blocking / warning chains…"
                  style={{ ...inputSt, resize:"vertical", minHeight:52 }} />
              </div>
              <div style={{ marginBottom:10 }}>
                <Lbl>Applies to Supplier</Lbl>
                <YesNoToggle value={appliesToSupplier} onChange={setAppliesToSupplier} />
              </div>
              <div style={{ marginBottom:10 }}>
                <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:6 }}>
                  <Lbl>Signatories ({signatories.length}/5)</Lbl>
                  {signatories.length < 5 && (
                    <button onClick={addSig} style={{ padding:"2px 8px", borderRadius:5, fontSize:10, fontWeight:700, fontFamily:"inherit", cursor:"pointer", background:"transparent", border:`1px solid ${t.bdrS}`, color:t.t2 }}>+ Add</button>
                  )}
                </div>
                {signatories.map((s, i) => (
                  <div key={i} style={{ display:"flex", gap:5, marginBottom:5 }}>
                    <input value={s} onChange={e => updateSig(i, e.target.value)}
                      placeholder={`Signatory login…`}
                      style={{ ...inputSt, flex:1 }} />
                    <button onClick={() => removeSig(i)}
                      style={{ background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:6, color:t.t3, cursor:"pointer", fontSize:14, padding:"0 8px" }}>×</button>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        <Divider />

        {/* Drag to Add + Mode toggle */}
        <div style={{ padding:"0 16px" }}>
          <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:10 }}>
            <div style={{ fontSize:9, letterSpacing:"0.18em", color:t.t4, textTransform:"uppercase", fontWeight:700 }}>Drag to Add</div>
            <div style={{ display:"flex", gap:4 }}>
              {["sequential","parallel"].map(m => (
                <button key={m} onClick={() => setApproverMode(m)} style={{
                  padding:"4px 8px", borderRadius:5, fontSize:9, fontWeight:700, fontFamily:"inherit",
                  cursor:"pointer", textTransform:"capitalize",
                  background: approverMode === m ? COLOR[m]+"22" : "transparent",
                  border:     `1px solid ${approverMode === m ? COLOR[m]+"66" : "#1a2744"}`,
                  color:      approverMode === m ? COLOR[m] : "#3b5278",
                }}>
                  {m === "sequential" ? "▶ Seq" : "⋮ Par"}
                </button>
              ))}
            </div>
          </div>

          <div draggable onDragStart={e => e.dataTransfer.setData("nodeType", approverMode)}
            style={{ background:`linear-gradient(135deg,${approverMode==="sequential"?"#0f1e14,#0d1a12":"#0d1a2e,#0b1624"})`,
              border:`1px solid ${approverMode==="sequential"?"#1a3d22":"#1a2e52"}`,
              borderLeft:`3px solid ${COLOR[approverMode]}`,
              borderRadius:9, padding:"13px 14px", marginBottom:10, cursor:"grab", userSelect:"none" }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
              <span style={{ fontSize:15 }}>{approverMode==="sequential"?"▶":"⋮"}</span>
              <span style={{ fontSize:12, fontWeight:700, color:COLOR[approverMode], textTransform:"capitalize" }}>{approverMode} Approver</span>
            </div>
            <div style={{ fontSize:10, color:"#2a3a56", marginLeft:22 }}>
              {approverMode==="sequential" ? "→ Connects left / right" : "↕ Connects top / bottom"}
            </div>
          </div>

          <div draggable onDragStart={e => e.dataTransfer.setData("nodeType","watcher")}
            style={{ background:"linear-gradient(135deg,#1a1400,#120f00)", border:"1px solid #2e2200", borderLeft:`3px solid ${COLOR.watcher}`,
              borderRadius:9, padding:"13px 14px", cursor:"grab", userSelect:"none" }}
            onMouseDown={e => e.currentTarget.style.transform = "scale(0.97)"}
            onMouseUp={e => e.currentTarget.style.transform = "scale(1)"}
            onMouseLeave={e => e.currentTarget.style.transform = "scale(1)"}>
            <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:3 }}>
              <span style={{ fontSize:15 }}>👁</span>
              <span style={{ fontSize:12, fontWeight:700, color:COLOR.watcher }}>Watcher</span>
            </div>
            <div style={{ fontSize:10, color:"#3a2a00", marginLeft:22 }}>No connections — notified only</div>
          </div>
        </div>

        <Divider />

        {/* Stats */}
        <div style={{ padding:"0 16px", display:"flex", gap:8, marginBottom:14 }}>
          {[
            { label:"Approvers", val: nodes.filter(n=>n.type!=="watcher").length },
            { label:"Watchers",  val: nodes.filter(n=>n.type==="watcher").length  },
            { label:"Connects",  val: edges.length },
          ].map(({ label, val }) => (
            <div key={label} style={{ flex:1, background:t.surface, border:`1px solid ${t.bdrS}`, borderRadius:7, padding:"8px 6px", textAlign:"center" }}>
              <div style={{ fontSize:18, fontWeight:700, color:t.t0 }}>{val}</div>
              <div style={{ fontSize:8, color:t.t2, textTransform:"uppercase", letterSpacing:"0.08em" }}>{label}</div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div style={{ padding:"0 16px", display:"flex", flexDirection:"column", gap:8, marginBottom:20 }}>
          <button onClick={handleSave}
            style={{
              width:"100%", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer",
              fontFamily:"inherit", borderRadius:9, border:"none",
              background:"linear-gradient(135deg,#2563eb,#1d4ed8)",
              color:"#fff", transition:"all 0.2s",
            }}>
            {ec.id ? "☁ Update Chain" : "☁ Save Chain"}
          </button>
          <button onClick={exportCSV} style={{ width:"100%", background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:9, color:"#070b12", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            ↓ Export Coupa CSV
          </button>
          <button onClick={() => { setNodes([]); setEdges([]); setSelected(null); showToast("Canvas cleared"); }}
            style={{ width:"100%", background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"9px", fontSize:11, cursor:"pointer", fontFamily:"inherit" }}>
            Clear Canvas
          </button>
        </div>
      </div>

      {/* ═══ CANVAS ═══ */}
      <div ref={canvasRef}
        style={{ flex:1, position:"relative", overflow:"hidden",
          cursor: connectFrom ? "crosshair" : "default",
          background: t.bg,
          backgroundImage: t.dots,
          backgroundSize:"36px 36px", transition:"background 0.25s" }}
        onMouseMove={handleMouseMove} onMouseUp={handleMouseUp}
        onClick={handleCanvasClick}
        onDrop={handleDrop} onDragOver={e => e.preventDefault()}>

        {/* Total Comparator widget */}
        <div style={{ position:"absolute", top:16, left:16, zIndex:10, display:"flex", alignItems:"center",
          background:t.panel, border:`1px solid ${t.bdrS}`, borderRadius:8,
          overflow:"hidden", boxShadow:"0 4px 20px #00000060" }}
          onClick={e => e.stopPropagation()}
          onMouseDown={e => e.stopPropagation()}>
          <select value={comparatorOp} onChange={e => setComparatorOp(e.target.value)}
            style={{ background:t.panel, border:"none", borderRight:`1px solid ${t.bdrS}`,
              color:t.t0, padding:"8px 10px", fontSize:12, fontFamily:"inherit",
              cursor:"pointer", outline:"none" }}>
            {COMPARATOR_OPS.map(op => <option key={op}>{op}</option>)}
          </select>
          <input
            type="number" value={comparatorAmount} step="0.01" placeholder="0.00"
            onChange={e => setComparatorAmount(e.target.value)}
            style={{ background:t.panel, border:"none", borderRight:`1px solid ${t.bdrS}`,
              color:t.t0, padding:"8px 10px", fontSize:12,
              fontFamily:"'IBM Plex Mono',monospace", width:130, outline:"none" }}
          />
          <select value={comparatorCurrency} onChange={e => setComparatorCurrency(e.target.value)}
            style={{ background:t.panel, border:"none", color:t.t0,
              padding:"8px 10px", fontSize:12, fontFamily:"inherit",
              cursor:"pointer", outline:"none" }}>
            {loadCurrencies().map(c => <option key={c}>{c}</option>)}
          </select>
          <div style={{ padding:"0 10px", fontSize:9, color:t.t3, letterSpacing:"0.1em", whiteSpace:"nowrap" }}>TOTAL COMPARATOR</div>
        </div>

        {/* SVG edges */}
        <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", pointerEvents:"none", overflow:"visible" }}>
          <defs>
            <marker id="arr"      markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,9 3.5,0 7" fill="#1e3560"/></marker>
            <marker id="arr-live" markerWidth="9" markerHeight="7" refX="9" refY="3.5" orient="auto"><polygon points="0 0,9 3.5,0 7" fill="#f59e0b"/></marker>
          </defs>
          {edges.map(edge => {
            const f = getNode(edge.from), t = getNode(edge.to);
            const mid = getEdgeMid(edge.from, edge.to);
            return (
              <g key={edge.id}>
                <path d={buildEdgePath(f, t)} fill="none" stroke="#1e3560" strokeWidth={2} markerEnd="url(#arr)" />
                <circle cx={mid.x} cy={mid.y} r={9} fill="#0d1321" stroke="#1e3560" strokeWidth={1.5}
                  style={{ pointerEvents:"all", cursor:"pointer" }} onClick={e => deleteEdge(e, edge.id)} />
                <text x={mid.x} y={mid.y+4.5} textAnchor="middle" fill="#3b5278" fontSize="11" style={{ pointerEvents:"none", userSelect:"none" }}>×</text>
              </g>
            );
          })}
          {connectFrom && liveWireEnd() && (
            <path d={liveWireEnd()} fill="none" stroke="#f59e0b" strokeWidth={2} strokeDasharray="8 5" markerEnd="url(#arr-live)" />
          )}
        </svg>

        {/* Nodes */}
        {nodes.map(node => {
          const isSel    = selected === node.id;
          const col      = typeColor(node.type);
          const isWatcher = node.type === "watcher";
          const isPar     = node.type === "parallel";
          return (
            <div key={node.id}
              onMouseDown={e => startDrag(e, node)}
              onDoubleClick={e => openEdit(e, node)}
              onClick={e => { e.stopPropagation(); setSelected(node.id); }}
              style={{
                position:"absolute", left:node.x, top:node.y, width:NODE_W, height:NODE_H,
                background: isSel ? `linear-gradient(135deg,${col}18,${col}08)` : "linear-gradient(135deg,#0d1625,#090f1c)",
                border:      `1px solid ${isSel ? col+"99" : "#111c2e"}`,
                borderLeft:  isWatcher || isPar ? undefined : `3px solid ${col}`,
                borderTop:   isPar ? `3px solid ${col}` : undefined,
                borderRight: isWatcher ? `3px solid ${col}` : undefined,
                borderBottom:isWatcher ? `3px solid ${col}` : undefined,
                borderRadius:11,
                boxShadow:   isSel ? `0 0 0 1px ${col}30,0 10px 36px #00000090` : "0 4px 20px #00000060",
                cursor:      dragNode?.id === node.id ? "grabbing" : "grab",
                userSelect:  "none",
                display:"flex", alignItems:"center", paddingLeft:16, paddingRight:18, gap:10, boxSizing:"border-box",
              }}>
              <div style={{ width:36, height:36, borderRadius:"50%", background:col+"18", border:`1.5px solid ${col}44`,
                display:"flex", alignItems:"center", justifyContent:"center",
                flexShrink:0, fontSize:isWatcher?18:14, color:col, fontWeight:700 }}>
                {isWatcher ? "👁" : node.name.charAt(0).toUpperCase()}
              </div>
              <div style={{ flex:1, overflow:"hidden" }}>
                <div style={{ fontSize:12, fontWeight:600, color:"#e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{node.name}</div>
                <div style={{ fontSize:10, color:"#3b5278", marginTop:1, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{node.role}</div>
                {!isWatcher && node.amount && (
                  <div style={{ fontSize:9, color:"#f59e0b", marginTop:2, fontFamily:"'IBM Plex Mono',monospace", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                    {node.currency} {Number(node.amount).toLocaleString()}
                  </div>
                )}
              </div>
              <div style={{ position:"absolute", top:6, right:6, fontSize:8, color:col, background:col+"14",
                border:`1px solid ${col}30`, borderRadius:4, padding:"2px 5px",
                textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:700 }}>
                {isWatcher ? "Watcher" : node.type}
              </div>
              {!isWatcher && !isPar && (
                <>
                  <div onClick={e => handleInputPort(e, node.id)} style={{
                    position:"absolute", left:-PORT_R, top:"50%", transform:"translateY(-50%)",
                    width:PORT_R*2, height:PORT_R*2, borderRadius:"50%",
                    background: connectFrom ? "#f59e0b22" : "#070b12",
                    border:`2px solid ${connectFrom ? "#f59e0b" : "#1e3560"}`,
                    cursor:"pointer", zIndex:3, transition:"all 0.15s",
                  }}/>
                  <div onClick={e => handleOutputPort(e, node.id)} style={{
                    position:"absolute", right:-PORT_R, top:"50%", transform:"translateY(-50%)",
                    width:PORT_R*2, height:PORT_R*2, borderRadius:"50%",
                    background: connectFrom === node.id ? "#f59e0b" : "#070b12",
                    border:`2px solid ${connectFrom === node.id ? "#f59e0b" : col+"80"}`,
                    cursor:"pointer", zIndex:3, transition:"all 0.15s",
                  }}/>
                </>
              )}
              {!isWatcher && isPar && (
                <>
                  <div onClick={e => handleInputPort(e, node.id)} style={{
                    position:"absolute", top:-PORT_R, left:"50%", transform:"translateX(-50%)",
                    width:PORT_R*2, height:PORT_R*2, borderRadius:"50%",
                    background: connectFrom ? "#f59e0b22" : "#070b12",
                    border:`2px solid ${connectFrom ? "#f59e0b" : "#1e3560"}`,
                    cursor:"pointer", zIndex:3, transition:"all 0.15s",
                  }}/>
                  <div onClick={e => handleOutputPort(e, node.id)} style={{
                    position:"absolute", bottom:-PORT_R, left:"50%", transform:"translateX(-50%)",
                    width:PORT_R*2, height:PORT_R*2, borderRadius:"50%",
                    background: connectFrom === node.id ? "#f59e0b" : "#070b12",
                    border:`2px solid ${connectFrom === node.id ? "#f59e0b" : col+"80"}`,
                    cursor:"pointer", zIndex:3, transition:"all 0.15s",
                  }}/>
                </>
              )}
            </div>
          );
        })}

        {nodes.length === 0 && (
          <div style={{ position:"absolute", top:"50%", left:"50%", transform:"translate(-50%,-50%)",
            textAlign:"center", pointerEvents:"none", userSelect:"none" }}>
            <div style={{ fontSize:52, marginBottom:14, opacity:0.1 }}>⬡</div>
            <div style={{ fontSize:13, color:t.t3, letterSpacing:"0.12em", textTransform:"uppercase" }}>
              Drag approvers or watchers onto the canvas
            </div>
          </div>
        )}

        {connectFrom && (
          <div style={{ position:"absolute", top:18, left:"50%", transform:"translateX(-50%)",
            background:"#f59e0b", color:"#070b12", borderRadius:8, padding:"8px 20px",
            fontSize:12, fontWeight:700, pointerEvents:"none", boxShadow:"0 4px 20px #f59e0b60" }}>
            Click the input port of a node to connect — or click canvas to cancel
          </div>
        )}
      </div>

      {/* Confirm Delete */}
      {confirmDel && (() => {
        const node = getNode(confirmDel);
        return (
          <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}
            onClick={() => setConfirmDel(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background:t.panel, border:`1px solid ${t.bdrS}`, borderTop:`3px solid ${t.errorTxt}`, borderRadius:14, padding:"30px", width:360, boxShadow:"0 32px 80px #000000c0", textAlign:"center" }}>
              <div style={{ fontSize:30, marginBottom:10 }}>⚠</div>
              <div style={{ fontSize:14, fontWeight:700, color:t.t0, marginBottom:6 }}>Remove {node?.type === "watcher" ? "Watcher" : "Approver"}?</div>
              <div style={{ fontSize:12, color:t.t2, marginBottom:6 }}><span style={{ color:t.t1, fontWeight:600 }}>{node?.name}</span> — {node?.role}</div>
              <div style={{ fontSize:11, color:t.t3, marginBottom:26 }}>All connections will also be removed.</div>
              <div style={{ display:"flex", gap:10 }}>
                <button onClick={doDelete} style={{ flex:1, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none", borderRadius:9, color:"#fff", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Yes, Remove</button>
                <button onClick={() => setConfirmDel(null)} style={{ flex:1, background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"11px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Edit Node Modal */}
      {editing && (
        <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}
          onClick={() => setEditing(null)}>
          <div onClick={e => e.stopPropagation()} style={{ background:t.panel, border:`1px solid ${t.bdrS}`, borderTop:"3px solid #f59e0b", borderRadius:14, padding:"30px", width:400, boxShadow:"0 32px 80px #000000c0" }}>
            <div style={{ fontSize:10, letterSpacing:"0.18em", color:t.t2, textTransform:"uppercase", marginBottom:22 }}>Edit Node</div>

            {[{ label:"NAME / LOGIN", key:"name", placeholder:"Coupa login or group name…" }, { label:"EMAIL", key:"email", placeholder:"approver@company.com (optional)" }].map(({ label, key, placeholder }) => (
              <div key={key} style={{ marginBottom:14 }}>
                <label style={{ fontSize:9, color:t.t2, display:"block", marginBottom:6, letterSpacing:"0.12em" }}>{label}</label>
                <input autoFocus={key==="name"} value={editForm[key]}
                  onChange={e => setEditForm(f => ({ ...f, [key]: e.target.value }))}
                  onKeyDown={e => e.key === "Enter" && saveEdit()}
                  placeholder={placeholder}
                  style={{ width:"100%", background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"10px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }} />
              </div>
            ))}

            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:9, color:t.t2, display:"block", marginBottom:6, letterSpacing:"0.12em" }}>ROLE / TITLE</label>
              <input value={editForm.role}
                onChange={e => setEditForm(f => ({ ...f, role: e.target.value }))}
                onKeyDown={e => e.key === "Enter" && saveEdit()}
                placeholder="Job title or role…"
                style={{ width:"100%", background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"10px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }} />
            </div>

            {editForm.type !== "watcher" && (
              <div style={{ marginBottom:22 }}>
                <label style={{ fontSize:9, color:t.t2, display:"block", marginBottom:6, letterSpacing:"0.12em" }}>APPROVAL LIMIT</label>
                <div style={{ display:"flex", gap:8 }}>
                  <input value={editForm.amount} type="number" min="0" step="any"
                    onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))}
                    placeholder="0.00 (leave blank for unlimited)"
                    style={{ flex:1, background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"10px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" }} />
                  <select value={editForm.currency}
                    onChange={e => setEditForm(f => ({ ...f, currency: e.target.value }))}
                    style={{ width:88, background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"10px 8px", fontSize:13, fontFamily:"inherit", cursor:"pointer", outline:"none" }}>
                    <option value="">—</option>
                    {loadCurrencies().map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
              </div>
            )}

            <div style={{ display:"flex", gap:10 }}>
              <button onClick={saveEdit} style={{ flex:1, background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:9, color:"#070b12", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>Save</button>
              <button onClick={() => setEditing(null)} style={{ flex:1, background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"11px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:26, left:"50%", transform:"translateX(-50%)", background:t.panel, border:`1px solid ${t.bdrS}`, borderRadius:8, padding:"9px 22px", fontSize:12, color:t.t1, boxShadow:"0 8px 32px #00000080", zIndex:400, pointerEvents:"none" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: View Approval Chains
// ═══════════════════════════════════════════════════════════════════════════════
function ViewChainsPage({ savedChains, onNavigate, onEdit, onDelete }) {
  const t = useTK();
  const [search,          setSearch]          = useState("");
  const [filter,          setFilter]          = useState("all");
  const [toast,           setToast]           = useState(null);
  const [confirmDelete,   setConfirmDelete]   = useState(null);
  const [hiddenSampleIds, setHiddenSampleIds] = useState(new Set());

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const handleDeleteConfirm = () => {
    const isSaved = savedChains.some(s => s.id === confirmDelete.id);
    if (isSaved) {
      onDelete(confirmDelete.id);
    } else {
      setHiddenSampleIds(prev => new Set([...prev, confirmDelete.id]));
    }
    showToast(`Deleted: ${confirmDelete.name}`);
    setConfirmDelete(null);
  };

  const visibleSamples = SAMPLE_CHAINS.filter(c => !hiddenSampleIds.has(c.id));
  const all            = [...visibleSamples, ...savedChains];
  const filtered = all.filter(c => {
    const ms = c.name.toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || c.status === filter;
    return ms && mf;
  });

  const handleExportOne = chain => {
    downloadCSV([buildCoupaRow(chain)], `${chain.name.replace(/\s+/g,"_")}.csv`);
    showToast(`Exported: ${chain.name}`);
  };

  const handleExportAll = () => {
    if (!savedChains.length) { showToast("No saved chains to export"); return; }
    downloadCSV(savedChains.map(buildCoupaRow), "approval_chains_export.csv");
    showToast(`Exported ${savedChains.length} chain${savedChains.length > 1 ? "s" : ""}`);
  };

  return (
    <div style={{ padding:"30px 34px", height:"100%", overflowY:"auto", boxSizing:"border-box" }}>
      <div style={{ display:"flex", alignItems:"flex-end", justifyContent:"space-between", marginBottom:26 }}>
        <div>
          <div style={{ fontSize:10, letterSpacing:"0.2em", color:t.t2, textTransform:"uppercase", marginBottom:5 }}>Coupa</div>
          <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:t.t0 }}>Approval Chains</h1>
          <div style={{ fontSize:12, color:t.t2, marginTop:3 }}>{all.length} chains · {all.filter(c=>c.status==="active").length} active</div>
        </div>
        <div style={{ display:"flex", gap:8 }}>
          <button onClick={handleExportAll}
            style={{ background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"10px 16px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            ↓ Export All
          </button>
          <button onClick={() => onNavigate("new-chain")}
            style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:9, color:"#070b12", padding:"10px 20px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            + New Chain
          </button>
        </div>
      </div>

      <div style={{ display:"flex", gap:10, marginBottom:18 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search chains…"
          style={{ flex:1, background:t.panel, border:`1px solid ${t.bdrS}`, borderRadius:8, color:t.t0, padding:"9px 13px", fontSize:12, fontFamily:"inherit", outline:"none" }} />
        {["all","active","inactive"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{ padding:"9px 16px", borderRadius:8, fontSize:11, fontWeight:600, fontFamily:"inherit", cursor:"pointer", textTransform:"capitalize",
            background: filter===f ? t.bdrS : "transparent", border:`1px solid ${filter===f ? t.t4 : t.bdrS}`, color: filter===f ? t.t1 : t.t2 }}>
            {f}
          </button>
        ))}
      </div>

      <div style={{ background:t.panel, border:`1px solid ${t.bdr}`, borderRadius:12, overflow:"hidden" }}>
        <table style={{ width:"100%", borderCollapse:"collapse" }}>
          <thead>
            <tr style={{ borderBottom:`1px solid ${t.bdr}` }}>
              {["Chain Name","Status","Type","Priority","Updated",""].map(h => (
                <th key={h} style={{ padding:"11px 14px", textAlign:"left", fontSize:9, letterSpacing:"0.14em", color:t.t2, textTransform:"uppercase", fontWeight:600, whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((chain, i) => (
              <tr key={chain.id} style={{ borderBottom:`1px solid ${t.bdrD}`, background:i%2===0?"transparent":`${t.topbar}bb` }}
                onMouseEnter={e => e.currentTarget.style.background = t.bdr}
                onMouseLeave={e => e.currentTarget.style.background = i%2===0?"transparent":`${t.topbar}bb`}>

                {/* Name */}
                <td style={{ padding:"12px 14px" }}>
                  <div style={{ fontSize:13, fontWeight:600, color:t.t0 }}>{chain.name}</div>
                  {savedChains.some(s => s.id === chain.id) && (
                    <span style={{ fontSize:9, color:t.accentTxt, letterSpacing:"0.1em" }}>● SAVED</span>
                  )}
                </td>

                {/* Status */}
                <td style={{ padding:"12px 14px" }}>
                  <span style={{ fontSize:10, fontWeight:700,
                    color:chain.status==="active"?t.successTxt:t.errorTxt,
                    background:chain.status==="active"?t.successBg:t.errorBg,
                    border:`1px solid ${chain.status==="active"?t.successBdr:t.errorBdr}`,
                    borderRadius:4, padding:"3px 8px" }}>
                    {chain.status}
                  </span>
                </td>

                {/* Type */}
                <td style={{ padding:"12px 14px" }}>
                  <span style={{ fontSize:11, color:t.t1, fontFamily:"'IBM Plex Mono',monospace" }}>
                    {chain.chainType || "—"}
                  </span>
                </td>

                {/* Priority */}
                <td style={{ padding:"12px 14px", fontSize:12, color:"#f59e0b", fontFamily:"monospace", fontWeight:700 }}>
                  {chain.priority}
                </td>

                {/* Updated */}
                <td style={{ padding:"12px 14px", fontSize:11, color:t.t2, fontFamily:"monospace" }}>
                  {chain.updated || "—"}
                </td>

                {/* Actions */}
                <td style={{ padding:"12px 14px" }}>
                  <div style={{ display:"flex", gap:6 }}>
                    <button onClick={() => onEdit(chain)}
                      style={{ padding:"5px 12px", borderRadius:6, fontSize:11, fontWeight:600, fontFamily:"inherit", cursor:"pointer", background:"transparent", border:`1px solid ${t.bdrS}`, color:t.t2 }}>
                      Edit
                    </button>
                    <button onClick={() => handleExportOne(chain)}
                      style={{ padding:"5px 10px", borderRadius:6, fontSize:11, fontWeight:600, fontFamily:"inherit", cursor:"pointer", background:"transparent", border:`1px solid ${t.bdrS}`, color:"#f59e0b" }}>
                      ↓
                    </button>
                    <button onClick={() => setConfirmDelete(chain)}
                      title="Delete chain"
                      style={{ padding:"5px 9px", borderRadius:6, fontSize:13, fontWeight:600, fontFamily:"inherit", cursor:"pointer", background:"transparent", border:`1px solid ${t.bdr}`, color:t.t2, lineHeight:1, transition:"all 0.14s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = t.errorBdr; e.currentTarget.style.color = t.errorTxt; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = t.bdr; e.currentTarget.style.color = t.t2; }}>
                      ⌫
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr><td colSpan={6} style={{ padding:"36px", textAlign:"center", color:t.t3, fontSize:12 }}>No chains match your search</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{ position:"fixed", inset:0, background:"#000000aa", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}
          onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background:t.panel, border:`1px solid ${t.bdrS}`, borderTop:`3px solid ${t.errorTxt}`, borderRadius:14, padding:"32px", width:400, boxShadow:"0 32px 80px #000000c0", textAlign:"center" }}>
            <div style={{ fontSize:32, marginBottom:12, opacity:0.8 }}>🗑</div>
            <div style={{ fontSize:15, fontWeight:700, color:t.t0, marginBottom:8 }}>Delete Approval Chain?</div>
            <div style={{ fontSize:12, color:t.t2, marginBottom:4 }}>
              You are about to permanently delete:
            </div>
            <div style={{ fontSize:13, fontWeight:600, color:t.errorTxt, background:t.errorBg, border:`1px solid ${t.errorBdr}`, borderRadius:7, padding:"9px 14px", marginBottom:8 }}>
              {confirmDelete.name}
            </div>
            <div style={{ fontSize:11, color:t.t3, marginBottom:28 }}>
              This action cannot be undone.
            </div>
            <div style={{ display:"flex", gap:10 }}>
              <button onClick={handleDeleteConfirm}
                style={{ flex:1, background:"linear-gradient(135deg,#dc2626,#b91c1c)", border:"none", borderRadius:9, color:"#fff", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
                Yes, Delete
              </button>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex:1, background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"11px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position:"fixed", bottom:26, left:"50%", transform:"translateX(-50%)", background:t.panel, border:`1px solid ${t.bdrS}`, borderRadius:8, padding:"9px 22px", fontSize:12, color:t.t1, boxShadow:"0 8px 32px #00000080", zIndex:400, pointerEvents:"none" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Add Currency Modal ───────────────────────────────────────────────────────
function CurrencyModal({ existingCodes, onAdd, onClose }) {
  const t = useTK();
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");

  const handleAdd = () => {
    const trimCode = code.trim().toUpperCase();
    const trimName = name.trim();
    if (!trimCode) { setError("Code is required."); return; }
    if (!trimName) { setError("Name is required."); return; }
    if (trimCode.length > 6) { setError("Code must be ≤ 6 characters."); return; }
    if (existingCodes.includes(trimCode)) { setError(`${trimCode} already exists.`); return; }
    onAdd({ code: trimCode, name: trimName });
  };

  const fieldSt = { width:"100%", background:t.inp, border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t0, padding:"10px 12px", fontSize:13, fontFamily:"inherit", boxSizing:"border-box", outline:"none" };

  return (
    <div style={{ position:"fixed", inset:0, background:"#000000b0", display:"flex", alignItems:"center", justifyContent:"center", zIndex:300, backdropFilter:"blur(4px)" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background:t.panel, border:`1px solid ${t.bdrS}`, borderTop:"3px solid #f59e0b", borderRadius:14, padding:"30px", width:380, boxShadow:"0 32px 80px #000000c0" }}>
        <div style={{ fontSize:10, letterSpacing:"0.18em", color:t.t2, textTransform:"uppercase", marginBottom:22 }}>Add Currency</div>
        <div style={{ marginBottom:14 }}>
          <label style={{ fontSize:9, color:t.t2, display:"block", marginBottom:6, letterSpacing:"0.12em" }}>NAME</label>
          <input autoFocus value={name} onChange={e => { setName(e.target.value); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleAdd()} placeholder="e.g. Euro" style={fieldSt} />
        </div>
        <div style={{ marginBottom: error ? 10 : 22 }}>
          <label style={{ fontSize:9, color:t.t2, display:"block", marginBottom:6, letterSpacing:"0.12em" }}>CODE</label>
          <input value={code} onChange={e => { setCode(e.target.value.toUpperCase()); setError(""); }}
            onKeyDown={e => e.key === "Enter" && handleAdd()}
            placeholder="e.g. EUR" maxLength={6}
            style={{ ...fieldSt, fontFamily:"'IBM Plex Mono',monospace", letterSpacing:"0.1em" }} />
        </div>
        {error && (
          <div style={{ fontSize:11, color:t.errorTxt, marginBottom:16, padding:"7px 10px", background:t.errorBg, border:`1px solid ${t.errorBdr}`, borderRadius:6 }}>
            {error}
          </div>
        )}
        <div style={{ display:"flex", gap:10 }}>
          <button onClick={handleAdd}
            style={{ flex:1, background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:9, color:"#070b12", padding:"11px", fontSize:12, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
            Add Currency
          </button>
          <button onClick={onClose}
            style={{ flex:1, background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:9, color:t.t2, padding:"11px", fontSize:12, cursor:"pointer", fontFamily:"inherit" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Reference Values
// ═══════════════════════════════════════════════════════════════════════════════
function ReferenceValuesPage() {
  const t = useTK();
  const [refs,      setRefs]      = useState(loadRefValues);
  const [showModal, setShowModal] = useState(false);
  const [toast,     setToast]     = useState(null);
  const fileInputRef              = useRef(null);

  const showToast  = msg => { setToast(msg); setTimeout(() => setToast(null), 2800); };
  const updateRefs = updated => { setRefs(updated); saveRefValues(updated); };

  const addCurrency = ({ code, name }) => {
    updateRefs({ ...refs, currencies: [...refs.currencies, { code, name }] });
    setShowModal(false); showToast(`${code} added`);
  };

  const removeCurrency = code => {
    updateRefs({ ...refs, currencies: refs.currencies.filter(c => c.code !== code) });
    showToast(`${code} removed`);
  };

  const handleFileLoad = e => {
    const file = e.target.files[0]; if (!file) return;
    e.target.value = "";
    const reader = new FileReader();
    reader.onload = evt => {
      const text = evt.target.result.trim();
      let parsed = [];
      try {
        if (file.name.toLowerCase().endsWith(".json")) {
          const json = JSON.parse(text);
          const arr  = Array.isArray(json) ? json : (Array.isArray(json.currencies) ? json.currencies : []);
          parsed = arr.map(item => {
            if (typeof item === "string") { const c = item.trim().toUpperCase(); return { code: c, name: c }; }
            const code = String(item.code || item.Code || "").trim().toUpperCase();
            return { code, name: String(item.name || item.Name || code).trim() };
          });
        } else {
          const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (!lines.length) { showToast("File is empty"); return; }
          const firstCols = lines[0].split(",").map(s => s.trim().replace(/^"|"$/g,"").toLowerCase());
          const hasHeader = firstCols.includes("code") || firstCols.includes("name");
          let codeIdx = 0, nameIdx = 1;
          if (hasHeader) {
            codeIdx = firstCols.indexOf("code") >= 0 ? firstCols.indexOf("code") : 0;
            nameIdx = firstCols.indexOf("name") >= 0 ? firstCols.indexOf("name") : (codeIdx === 0 ? 1 : 0);
          }
          const dataLines = hasHeader ? lines.slice(1) : lines;
          parsed = dataLines.map(line => {
            const cols = line.split(",").map(s => s.trim().replace(/^"|"$/g,""));
            const code = (cols[codeIdx] || "").toUpperCase();
            const name = (cols[nameIdx] || code).trim() || code;
            return { code, name };
          }).filter(item => item.code);
        }
      } catch { showToast("Failed to parse file"); return; }
      if (!parsed.length) { showToast("No valid entries found"); return; }
      const existingCodes = refs.currencies.map(c => c.code);
      const toAdd = parsed.filter(item => item.code && item.code.length <= 6 && !existingCodes.includes(item.code));
      const skipped = parsed.length - toAdd.length;
      if (!toAdd.length) { showToast(`All ${skipped} entries already exist or are invalid`); return; }
      updateRefs({ ...refs, currencies: [...refs.currencies, ...toAdd] });
      showToast(skipped > 0 ? `${toAdd.length} added · ${skipped} skipped` : `${toAdd.length} currencies loaded`);
    };
    reader.readAsText(file);
  };

  const Section = ({ icon, title, count, children, action }) => (
    <div style={{ background:t.panel, border:`1px solid ${t.bdr}`, borderRadius:12, padding:"22px 24px", marginBottom:18 }}>
      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:16 }}>
        <div>
          <div style={{ display:"flex", alignItems:"center", gap:9 }}>
            <span style={{ fontSize:16, opacity:0.6 }}>{icon}</span>
            <span style={{ fontSize:14, fontWeight:700, color:t.t0 }}>{title}</span>
          </div>
          <div style={{ fontSize:11, color:t.t2, marginTop:3 }}>{count} value{count !== 1 ? "s" : ""}</div>
        </div>
        {action}
      </div>
      {children}
    </div>
  );

  return (
    <div style={{ padding:"30px 34px", height:"100%", overflowY:"auto", boxSizing:"border-box" }}>
      <div style={{ marginBottom:26 }}>
        <div style={{ fontSize:10, letterSpacing:"0.2em", color:t.t2, textTransform:"uppercase", marginBottom:5 }}>Coupa</div>
        <h1 style={{ margin:0, fontSize:22, fontWeight:700, color:t.t0 }}>Reference Values</h1>
        <div style={{ fontSize:12, color:t.t2, marginTop:3 }}>Manage lookup values used across approval chains · stored in browser local storage</div>
      </div>

      <Section
        icon="💱" title="Currencies" count={refs.currencies.length}
        action={
          <div style={{ display:"flex", gap:8 }}>
            <input ref={fileInputRef} type="file" accept=".csv,.json" onChange={handleFileLoad} style={{ display:"none" }} />
            <button onClick={() => fileInputRef.current?.click()}
              style={{ background:"transparent", border:`1px solid ${t.bdrS}`, borderRadius:7, color:t.t2, padding:"8px 14px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              ↑ Load from file
            </button>
            <button onClick={() => setShowModal(true)}
              style={{ background:"linear-gradient(135deg,#f59e0b,#d97706)", border:"none", borderRadius:7, color:"#070b12", padding:"8px 16px", fontSize:11, fontWeight:700, cursor:"pointer", fontFamily:"inherit" }}>
              + Add
            </button>
          </div>
        }>
        <div style={{ display:"flex", flexWrap:"wrap", gap:8 }}>
          {refs.currencies.map(c => (
            <div key={c.code} title={c.name}
              style={{ display:"flex", alignItems:"center", gap:6, background:t.surface, border:`1px solid ${t.bdrS}`, borderRadius:6, padding:"6px 11px", cursor:"default" }}>
              <span style={{ fontSize:12, color:t.t1, fontFamily:"'IBM Plex Mono',monospace", fontWeight:600, letterSpacing:"0.06em" }}>{c.code}</span>
              <button onClick={() => removeCurrency(c.code)}
                style={{ background:"transparent", border:"none", color:t.t3, cursor:"pointer", fontSize:14, lineHeight:1, padding:0, marginLeft:2 }}>×</button>
            </div>
          ))}
          {refs.currencies.length === 0 && (
            <div style={{ fontSize:12, color:t.t3, padding:"8px 0" }}>No currencies yet — click Add to create one.</div>
          )}
        </div>
      </Section>

      <div style={{ border:`1px dashed ${t.bdrS}`, borderRadius:12, padding:"22px 24px", textAlign:"center" }}>
        <div style={{ fontSize:11, color:t.t3, letterSpacing:"0.1em", textTransform:"uppercase" }}>More reference value categories coming soon</div>
      </div>

      {showModal && (
        <CurrencyModal existingCodes={refs.currencies.map(c => c.code)} onAdd={addCurrency} onClose={() => setShowModal(false)} />
      )}
      {toast && (
        <div style={{ position:"fixed", bottom:26, left:"50%", transform:"translateX(-50%)", background:t.panel, border:`1px solid ${t.bdrS}`, borderRadius:8, padding:"9px 22px", fontSize:12, color:t.t1, boxShadow:"0 8px 32px #00000080", zIndex:400, pointerEvents:"none" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Placeholder page ─────────────────────────────────────────────────────────
function PlaceholderPage({ title, icon, description, bullets=[] }) {
  const t = useTK();
  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", height:"100%", textAlign:"center", padding:48 }}>
      <div style={{ fontSize:56, marginBottom:18, opacity:0.12 }}>{icon}</div>
      <h2 style={{ margin:"0 0 10px", fontSize:22, fontWeight:700, color:t.t0 }}>{title}</h2>
      <p style={{ margin:"0 0 26px", fontSize:13, color:t.t2, maxWidth:420, lineHeight:1.7 }}>{description}</p>
      {bullets.length > 0 && (
        <div style={{ display:"flex", flexDirection:"column", gap:10, alignItems:"flex-start", maxWidth:360 }}>
          {bullets.map((b,i) => (
            <div key={i} style={{ display:"flex", gap:10, alignItems:"flex-start" }}>
              <span style={{ color:"#f59e0b", fontSize:13, marginTop:1, flexShrink:0 }}>◆</span>
              <span style={{ fontSize:12, color:t.t4, lineHeight:1.5 }}>{b}</span>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop:32, padding:"9px 20px", borderRadius:8, border:`1px solid ${t.bdrS}`, fontSize:11, color:t.t3, letterSpacing:"0.1em", textTransform:"uppercase" }}>Coming Soon</div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Dashboard
// ═══════════════════════════════════════════════════════════════════════════════
function DashboardPage({ savedChains, savedWorkflows, onNavigate }) {
  const t = useTK();
  const allChains       = [...SAMPLE_CHAINS, ...savedChains];
  const activeChains    = allChains.filter(c => c.status === "active").length;
  const allWorkflows    = [...SAMPLE_WORKFLOWS, ...savedWorkflows];
  const activeWorkflows = allWorkflows.filter(w => w.status === "active").length;
  const connections     = loadConnections();

  const typeCounts = {};
  allChains.forEach(c => { if (c.chainType) typeCounts[c.chainType] = (typeCounts[c.chainType] || 0) + 1; });
  const topTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const maxCount = topTypes[0]?.[1] || 1;

  const recentChains = [...savedChains]
    .sort((a, b) => (b.updated || "").localeCompare(a.updated || ""))
    .slice(0, 5);

  const StatCard = ({ label, value, icon, color, bg, note }) => (
    <div style={{ background: bg, border: `1px solid ${color}33`, borderRadius: 14, padding: "22px 24px", position: "relative", overflow: "hidden", boxShadow: t.shadow }}>
      <div style={{ fontSize: 22, marginBottom: 12, opacity: 0.45 }}>{icon}</div>
      <div style={{ fontSize: 38, fontWeight: 700, color, fontFamily: "'IBM Plex Mono',monospace", lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: t.t2, marginTop: 8, textTransform: "uppercase", letterSpacing: "0.13em" }}>{label}</div>
      {note && <div style={{ fontSize: 10, color: color + "99", marginTop: 4 }}>{note}</div>}
      <div style={{ position: "absolute", right: -16, top: -16, width: 96, height: 96, borderRadius: "50%", background: color + "09", border: `1px solid ${color}18` }} />
    </div>
  );

  return (
    <div style={{ padding: "30px 34px", height: "100%", overflowY: "auto", boxSizing: "border-box", background: t.bg, transition: "background 0.25s" }}>

      {/* Header */}
      <div style={{ marginBottom: 30 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.22em", color: t.t2, textTransform: "uppercase", marginBottom: 5 }}>Coupa</div>
        <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: t.t0 }}>Dashboard</h1>
        <div style={{ fontSize: 12, color: t.t2, marginTop: 3 }}>
          {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}
        </div>
      </div>

      {/* Stat Cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 14, marginBottom: 22 }}>
        <StatCard label="Total Chains"    value={allChains.length}   icon="⛓" color={t.accentTxt}  bg={t.statChains}    note={`${allChains.length - activeChains} inactive`} />
        <StatCard label="Active Chains"   value={activeChains}        icon="✓" color={t.successTxt} bg={t.statActive} />
        <StatCard label="Total Workflows" value={allWorkflows.length} icon="◈" color={t.amberTxt}   bg={t.statWorkflows} note={`${activeWorkflows} active`} />
        <StatCard label="Connections"     value={connections.length}  icon="⚡" color={t.purpleTxt}  bg={t.statConn}      note={connections.length === 0 ? "None configured" : `${connections.filter(c => c.status === "active").length} active`} />
      </div>

      {/* Middle row — distribution + recent */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1.5fr", gap: 14, marginBottom: 22 }}>

        {/* Chain Type Distribution */}
        <div style={{ background: t.panel, border: `1px solid ${t.bdr}`, borderRadius: 14, padding: "22px 24px", boxShadow: t.shadow }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: t.t2, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 20 }}>
            Chain Type Distribution
          </div>
          {topTypes.length > 0 ? topTypes.map(([type, count]) => (
            <div key={type} style={{ marginBottom: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 5 }}>
                <span style={{ fontSize: 11, color: t.t1, fontFamily: "'IBM Plex Mono',monospace" }}>{type}</span>
                <span style={{ fontSize: 11, color: t.amberTxt, fontFamily: "monospace", fontWeight: 700 }}>{count}</span>
              </div>
              <div style={{ height: 5, background: t.surface, borderRadius: 3 }}>
                <div style={{ height: 5, borderRadius: 3, background: "linear-gradient(90deg,#f59e0b,#d97706)", width: `${(count / maxCount) * 100}%`, transition: "width 0.5s ease" }} />
              </div>
            </div>
          )) : (
            <div style={{ padding: "20px 0", fontSize: 12, color: t.t3, textAlign: "center" }}>
              No chain data available yet
            </div>
          )}
        </div>

        {/* Recent Saved Chains */}
        <div style={{ background: t.panel, border: `1px solid ${t.bdr}`, borderRadius: 14, padding: "22px 24px", boxShadow: t.shadow }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
            <div style={{ fontSize: 10, fontWeight: 700, color: t.t2, textTransform: "uppercase", letterSpacing: "0.14em" }}>
              Recently Saved Chains
            </div>
            <button onClick={() => onNavigate("view-chains")}
              style={{ background: "transparent", border: `1px solid ${t.bdrS}`, borderRadius: 6, color: t.t2, padding: "4px 11px", fontSize: 10, cursor: "pointer", fontFamily: "inherit" }}>
              View All
            </button>
          </div>
          {recentChains.length > 0 ? recentChains.map(chain => (
            <div key={chain.id} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "9px 13px", background: t.surface, borderRadius: 9, border: `1px solid ${t.bdrD}` }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0, background: chain.status === "active" ? t.successTxt : t.errorTxt }} />
              <div style={{ flex: 1, overflow: "hidden" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: t.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{chain.name}</div>
                <div style={{ fontSize: 10, color: t.t2, fontFamily: "'IBM Plex Mono',monospace", marginTop: 1 }}>
                  {chain.chainType || "—"} · {chain.updated || "—"}
                </div>
              </div>
              <span style={{ fontSize: 10, color: t.amberTxt, fontWeight: 700, fontFamily: "monospace", flexShrink: 0 }}>#{chain.priority}</span>
            </div>
          )) : (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "28px 0", gap: 10 }}>
              <div style={{ fontSize: 36, opacity: 0.07 }}>✦</div>
              <div style={{ fontSize: 12, color: t.t3 }}>No saved chains yet</div>
              <button onClick={() => onNavigate("new-chain")}
                style={{ marginTop: 6, background: "linear-gradient(135deg,#2563eb,#1d4ed8)", border: "none", borderRadius: 8, color: "#fff", padding: "8px 18px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Create First Chain
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Workflows summary row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14, marginBottom: 22 }}>
        {allWorkflows.slice(0, 3).map(wf => (
          <div key={wf.id} style={{ background: t.surface, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "16px 18px", display: "flex", alignItems: "flex-start", gap: 12, boxShadow: t.shadow }}>
            <div style={{ width: 34, height: 34, borderRadius: 8, background: `${t.amberTxt}14`, border: `1px solid ${t.amberTxt}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>◈</div>
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: t.t0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{wf.name}</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 5 }}>
                <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4,
                  color:       wf.status === "active" ? t.successTxt : t.errorTxt,
                  background:  wf.status === "active" ? t.successBg  : t.errorBg,
                  border: `1px solid ${wf.status === "active" ? t.successBdr : t.errorBdr}` }}>
                  {wf.status}
                </span>
                <span style={{ fontSize: 10, color: t.t2 }}>{wf.chainCount} chains</span>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Quick Actions */}
      <div style={{ background: t.panel, border: `1px solid ${t.bdr}`, borderRadius: 14, padding: "22px 24px", boxShadow: t.shadow }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: t.t2, textTransform: "uppercase", letterSpacing: "0.14em", marginBottom: 18 }}>Quick Actions</div>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {[
            { label: "New Approval Chain",    icon: "✦", id: "new-chain",   accent: "#2563eb" },
            { label: "View Approval Chains",  icon: "▤", id: "view-chains", accent: "#f59e0b" },
            { label: "New Approval Workflow", icon: "◈", id: "workflow",    accent: "#4ade80" },
            { label: "View Workflows",        icon: "▷", id: "simulate",    accent: "#60a5fa" },
            { label: "Reference Values",      icon: "⊞", id: "reference",   accent: "#a78bfa" },
            { label: "Settings",              icon: "⚙", id: "settings",    accent: t.t1 },
          ].map(({ label, icon, id, accent }) => (
            <button key={id} onClick={() => onNavigate(id)} style={{
              display: "flex", alignItems: "center", gap: 9, padding: "10px 18px",
              background: "transparent", border: `1px solid ${accent}44`, borderRadius: 9,
              color: accent, fontSize: 12, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
              transition: "background 0.15s",
            }}
              onMouseEnter={e => { e.currentTarget.style.background = accent + "14"; }}
              onMouseLeave={e => { e.currentTarget.style.background = "transparent"; }}
            >
              <span style={{ fontSize: 14 }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: View Workflows
// ═══════════════════════════════════════════════════════════════════════════════
const WORKFLOW_TYPE_COLORS = {
  procurement: "#60a5fa",
  expense:     "#f59e0b",
  legal:       "#a78bfa",
  hr:          "#4ade80",
  finance:     "#f87171",
};

function ViewWorkflowsPage({ savedWorkflows, onNavigate, onDelete }) {
  const t = useTK();
  const [search,          setSearch]          = useState("");
  const [filter,          setFilter]          = useState("all");
  const [toast,           setToast]           = useState(null);
  const [confirmDelete,   setConfirmDelete]   = useState(null);
  const [hiddenSampleIds, setHiddenSampleIds] = useState(new Set());

  const showToast = msg => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const handleDeleteConfirm = () => {
    const isSaved = savedWorkflows.some(w => w.id === confirmDelete.id);
    if (isSaved) {
      onDelete(confirmDelete.id);
    } else {
      setHiddenSampleIds(prev => new Set([...prev, confirmDelete.id]));
    }
    showToast(`Deleted: ${confirmDelete.name}`);
    setConfirmDelete(null);
  };

  const visibleSamples = SAMPLE_WORKFLOWS.filter(w => !hiddenSampleIds.has(w.id));
  const all            = [...visibleSamples, ...savedWorkflows];
  const filtered       = all.filter(w => {
    const ms = w.name.toLowerCase().includes(search.toLowerCase());
    const mf = filter === "all" || w.status === filter;
    return ms && mf;
  });

  return (
    <div style={{ padding: "30px 34px", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", marginBottom: 26 }}>
        <div>
          <div style={{ fontSize: 10, letterSpacing: "0.2em", color: t.t2, textTransform: "uppercase", marginBottom: 5 }}>Coupa</div>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: t.t0 }}>Workflows</h1>
          <div style={{ fontSize: 12, color: t.t2, marginTop: 3 }}>
            {all.length} workflows · {all.filter(w => w.status === "active").length} active
          </div>
        </div>
        <button onClick={() => onNavigate("workflow")}
          style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", border: "none", borderRadius: 9, color: "#070b12", padding: "10px 20px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
          + New Workflow
        </button>
      </div>

      {/* Search + filter */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search workflows…"
          style={{ flex: 1, background: t.panel, border: `1px solid ${t.bdrS}`, borderRadius: 8, color: t.t0, padding: "9px 13px", fontSize: 12, fontFamily: "inherit", outline: "none" }} />
        {["all", "active", "inactive"].map(f => (
          <button key={f} onClick={() => setFilter(f)} style={{
            padding: "9px 16px", borderRadius: 8, fontSize: 11, fontWeight: 600, fontFamily: "inherit",
            cursor: "pointer", textTransform: "capitalize",
            background: filter === f ? t.bdrS : "transparent",
            border: `1px solid ${filter === f ? t.t4 : t.bdrS}`,
            color: filter === f ? t.t1 : t.t2,
          }}>{f}</button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: t.panel, border: `1px solid ${t.bdr}`, borderRadius: 12, overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ borderBottom: `1px solid ${t.bdr}` }}>
              {["Workflow Name", "Status", "Type", "Chains", "Updated", ""].map(h => (
                <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 9, letterSpacing: "0.14em", color: t.t2, textTransform: "uppercase", fontWeight: 600, whiteSpace: "nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((wf, i) => (
              <tr key={wf.id}
                style={{ borderBottom: `1px solid ${t.bdrD}`, background: i % 2 === 0 ? "transparent" : `${t.topbar}bb` }}
                onMouseEnter={e => e.currentTarget.style.background = t.bdr}
                onMouseLeave={e => e.currentTarget.style.background = i % 2 === 0 ? "transparent" : `${t.topbar}bb`}>

                <td style={{ padding: "12px 14px" }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: t.t0 }}>{wf.name}</div>
                  {savedWorkflows.some(s => s.id === wf.id) && (
                    <span style={{ fontSize: 9, color: t.accentTxt, letterSpacing: "0.1em" }}>● SAVED</span>
                  )}
                </td>

                <td style={{ padding: "12px 14px" }}>
                  <span style={{
                    fontSize: 10, fontWeight: 700,
                    color: wf.status === "active" ? t.successTxt : t.errorTxt,
                    background: wf.status === "active" ? t.successBg : t.errorBg,
                    border: `1px solid ${wf.status === "active" ? t.successBdr : t.errorBdr}`,
                    borderRadius: 4, padding: "3px 8px",
                  }}>{wf.status}</span>
                </td>

                <td style={{ padding: "12px 14px" }}>
                  {wf.type ? (
                    <span style={{
                      fontSize: 11, borderRadius: 4, padding: "2px 8px",
                      color: WORKFLOW_TYPE_COLORS[wf.type] || "#94a3b8",
                      background: (WORKFLOW_TYPE_COLORS[wf.type] || "#94a3b8") + "14",
                      border: `1px solid ${(WORKFLOW_TYPE_COLORS[wf.type] || "#94a3b8")}22`,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}>{wf.type}</span>
                  ) : <span style={{ color: t.t2, fontSize: 11 }}>—</span>}
                </td>

                <td style={{ padding: "12px 14px", fontSize: 13, color: "#60a5fa", fontFamily: "monospace", fontWeight: 700 }}>
                  {wf.chainCount ?? 0}
                </td>

                <td style={{ padding: "12px 14px", fontSize: 11, color: t.t2, fontFamily: "monospace" }}>
                  {wf.updated || "—"}
                </td>

                <td style={{ padding: "12px 14px" }}>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button
                      style={{ padding: "5px 12px", borderRadius: 6, fontSize: 11, fontWeight: 600, fontFamily: "inherit", cursor: "pointer", background: "transparent", border: `1px solid ${t.bdrS}`, color: t.t2 }}>
                      Edit
                    </button>
                    <button onClick={() => setConfirmDelete(wf)}
                      title="Delete workflow"
                      style={{ padding: "5px 9px", borderRadius: 6, fontSize: 13, lineHeight: 1, fontFamily: "inherit", cursor: "pointer", background: "transparent", border: `1px solid ${t.bdr}`, color: t.t2, transition: "all 0.14s" }}
                      onMouseEnter={e => { e.currentTarget.style.borderColor = t.errorBdr; e.currentTarget.style.color = t.errorTxt; }}
                      onMouseLeave={e => { e.currentTarget.style.borderColor = t.bdr; e.currentTarget.style.color = t.t2; }}>
                      ⌫
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: "36px", textAlign: "center", color: t.t3, fontSize: 12 }}>
                  No workflows match your search
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDelete && (
        <div style={{ position: "fixed", inset: 0, background: "#000000aa", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, backdropFilter: "blur(4px)" }}
          onClick={() => setConfirmDelete(null)}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: t.panel, border: `1px solid ${t.bdrS}`, borderTop: `3px solid ${t.errorTxt}`, borderRadius: 14, padding: "32px", width: 400, boxShadow: "0 32px 80px #000000c0", textAlign: "center" }}>
            <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.8 }}>🗑</div>
            <div style={{ fontSize: 15, fontWeight: 700, color: t.t0, marginBottom: 8 }}>Delete Workflow?</div>
            <div style={{ fontSize: 13, fontWeight: 600, color: t.errorTxt, background: t.errorBg, border: `1px solid ${t.errorBdr}`, borderRadius: 7, padding: "9px 14px", marginBottom: 8 }}>
              {confirmDelete.name}
            </div>
            <div style={{ fontSize: 11, color: t.t3, marginBottom: 28 }}>This action cannot be undone.</div>
            <div style={{ display: "flex", gap: 10 }}>
              <button onClick={handleDeleteConfirm}
                style={{ flex: 1, background: "linear-gradient(135deg,#dc2626,#b91c1c)", border: "none", borderRadius: 9, color: "#fff", padding: "11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                Yes, Delete
              </button>
              <button onClick={() => setConfirmDelete(null)}
                style={{ flex: 1, background: "transparent", border: `1px solid ${t.bdrS}`, borderRadius: 9, color: t.t2, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: t.panel, border: `1px solid ${t.bdrS}`, borderRadius: 8, padding: "9px 22px", fontSize: 12, color: t.t1, boxShadow: "0 8px 32px #00000080", zIndex: 400, pointerEvents: "none" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ─── Coupa Connection Modal ───────────────────────────────────────────────────
function CoupaConnectionModal({ initial, onSave, onClose, title }) {
  const t = useTK();
  const [form, setForm]       = useState(initial || { name: "", apiUrl: "", clientId: "", clientSecret: "", scope: "" });
  const [error, setError]     = useState("");
  const [showSecret, setShowSecret] = useState(false);

  const upd = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError(""); };

  const handleSave = () => {
    if (!form.name.trim())     { setError("Connection name is required."); return; }
    if (!form.apiUrl.trim())   { setError("API URL is required."); return; }
    if (!form.clientId.trim()) { setError("Client ID is required."); return; }
    onSave(form);
  };

  const fieldSt = {
    width: "100%", background: t.inp, border: `1px solid ${t.bdrS}`, borderRadius: 7,
    color: t.t0, padding: "9px 11px", fontSize: 12, fontFamily: "inherit",
    boxSizing: "border-box", outline: "none",
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "#000000b0", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 400, backdropFilter: "blur(4px)" }}
      onClick={onClose}>
      <div onClick={e => e.stopPropagation()}
        style={{ background: t.panel, border: `1px solid ${t.bdrS}`, borderTop: "3px solid #a78bfa", borderRadius: 14, padding: "30px", width: 480, boxShadow: "0 32px 80px #000000c0" }}>
        <div style={{ fontSize: 10, letterSpacing: "0.18em", color: t.t2, textTransform: "uppercase", marginBottom: 22 }}>{title}</div>
        {[
          { label: "CONNECTION NAME", key: "name",     placeholder: "e.g. Coupa Production" },
          { label: "API URL",         key: "apiUrl",   placeholder: "https://yourinstance.coupahost.com" },
          { label: "CLIENT ID",       key: "clientId", placeholder: "OAuth Client ID" },
          { label: "SCOPE",           key: "scope",    placeholder: "core:requisitions:read (optional)" },
        ].map(({ label, key, placeholder }) => (
          <div key={key} style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 9, color: t.t2, display: "block", marginBottom: 6, letterSpacing: "0.12em" }}>{label}</label>
            <input value={form[key]} placeholder={placeholder} onChange={e => upd(key, e.target.value)} style={fieldSt} />
          </div>
        ))}
        <div style={{ marginBottom: error ? 10 : 22 }}>
          <label style={{ fontSize: 9, color: t.t2, display: "block", marginBottom: 6, letterSpacing: "0.12em" }}>CLIENT SECRET</label>
          <div style={{ position: "relative" }}>
            <input value={form.clientSecret} type={showSecret ? "text" : "password"} placeholder="OAuth Client Secret"
              onChange={e => upd("clientSecret", e.target.value)}
              style={{ ...fieldSt, paddingRight: 38 }} />
            <button onClick={() => setShowSecret(s => !s)}
              style={{ position: "absolute", right: 9, top: "50%", transform: "translateY(-50%)", background: "transparent", border: "none", color: t.t2, cursor: "pointer", fontSize: 13, lineHeight: 1 }}>
              {showSecret ? "🙈" : "👁"}
            </button>
          </div>
          <div style={{ fontSize: 10, color: t.t3, marginTop: 5 }}>
            Stored in browser localStorage. Use a server-side proxy for production.
          </div>
        </div>
        {error && (
          <div style={{ fontSize: 11, color: t.errorTxt, marginBottom: 16, padding: "7px 10px", background: t.errorBg, border: `1px solid ${t.errorBdr}`, borderRadius: 6 }}>
            {error}
          </div>
        )}
        <div style={{ display: "flex", gap: 10 }}>
          <button onClick={handleSave}
            style={{ flex: 1, background: "linear-gradient(135deg,#a78bfa,#7c3aed)", border: "none", borderRadius: 9, color: "#fff", padding: "11px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
            {initial?.id ? "Update Connection" : "Add Connection"}
          </button>
          <button onClick={onClose}
            style={{ flex: 1, background: "transparent", border: `1px solid ${t.bdrS}`, borderRadius: 9, color: t.t2, padding: "11px", fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAGE: Settings
// ═══════════════════════════════════════════════════════════════════════════════
function SettingsPage() {
  const t = useTK();
  const [connections,  setConns]       = useState(loadConnections);
  const [toast,        setToast]       = useState(null);
  const [showAdd,      setShowAdd]     = useState(false);
  const [expandedId,   setExpandedId]  = useState(null);
  const [editingConn,  setEditingConn] = useState(null);

  const showToast  = msg => { setToast(msg); setTimeout(() => setToast(null), 2400); };
  const persist    = updated => { setConns(updated); saveConnections(updated); };

  const handleAdd = form => {
    persist([...connections, {
      ...form,
      id:          `conn_${Date.now()}`,
      status:      "active",
      createdDate: new Date().toISOString().slice(0, 10),
      createdBy:   "Admin",
    }]);
    setShowAdd(false);
    showToast("Connection added");
  };

  const handleUpdate = form => {
    persist(connections.map(c => c.id === editingConn.id ? { ...c, ...form } : c));
    setEditingConn(null);
    showToast("Connection updated");
  };

  const handleDelete = id => {
    persist(connections.filter(c => c.id !== id));
    if (expandedId === id) setExpandedId(null);
    showToast("Connection removed");
  };

  const toggleStatus = id => {
    persist(connections.map(c => c.id === id ? { ...c, status: c.status === "active" ? "inactive" : "active" } : c));
  };

  return (
    <div style={{ padding: "30px 34px", height: "100%", overflowY: "auto", boxSizing: "border-box" }}>
      <div style={{ marginBottom: 26 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.2em", color: t.t2, textTransform: "uppercase", marginBottom: 5 }}>Configuration</div>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: t.t0 }}>Settings</h1>
        <div style={{ fontSize: 12, color: t.t2, marginTop: 3 }}>Manage global preferences and integrations</div>
      </div>

      {/* ── Coupa Connections ── */}
      <div style={{ background: t.panel, border: `1px solid ${t.bdr}`, borderRadius: 12, padding: "22px 24px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 20 }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span style={{ fontSize: 16, opacity: 0.55 }}>⚡</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: t.t0 }}>Coupa Connections</span>
            </div>
            <div style={{ fontSize: 11, color: t.t2, marginTop: 3 }}>
              OAuth 2.0 API credentials for Coupa integration
            </div>
          </div>
          <button onClick={() => setShowAdd(true)}
            style={{ background: "linear-gradient(135deg,#a78bfa,#7c3aed)", border: "none", borderRadius: 8, color: "#fff", padding: "9px 18px", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", flexShrink: 0 }}>
            + Add Connection
          </button>
        </div>

        {connections.length === 0 ? (
          <div style={{ border: `1px dashed ${t.bdrS}`, borderRadius: 10, padding: "32px", textAlign: "center" }}>
            <div style={{ fontSize: 30, opacity: 0.08, marginBottom: 10 }}>⚡</div>
            <div style={{ fontSize: 12, color: t.t3 }}>No connections configured yet</div>
            <div style={{ fontSize: 11, color: t.t2, marginTop: 5 }}>Add a Coupa OAuth connection to enable API integration</div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {connections.map(conn => {
              const isExpanded = expandedId === conn.id;
              const isEditing  = editingConn?.id === conn.id;
              return (
                <div key={conn.id} style={{
                  background: t.surface,
                  border: `1px solid ${isExpanded ? `${t.purpleTxt}44` : t.bdr}`,
                  borderRadius: 11, overflow: "hidden", transition: "border-color 0.2s",
                }}>
                  {/* Tile header — click to expand */}
                  <div style={{ display: "flex", alignItems: "center", gap: 14, padding: "14px 18px", cursor: "pointer" }}
                    onClick={() => setExpandedId(isExpanded ? null : conn.id)}>
                    <div style={{ width: 40, height: 40, borderRadius: 9, background: t.purpleBg, border: `1px solid ${t.purpleTxt}33`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 17, flexShrink: 0 }}>⚡</div>
                    <div style={{ flex: 1, overflow: "hidden" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 700, color: t.t0 }}>{conn.name}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 4,
                          color: conn.status === "active" ? t.successTxt : t.errorTxt,
                          background: conn.status === "active" ? t.successBg : t.errorBg,
                          border: `1px solid ${conn.status === "active" ? t.successBdr : t.errorBdr}`,
                        }}>{conn.status}</span>
                      </div>
                      <div style={{ fontSize: 10, color: t.t2, marginTop: 3, fontFamily: "'IBM Plex Mono',monospace", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {conn.apiUrl}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontSize: 10, color: t.t2 }}>Created {conn.createdDate}</div>
                      <div style={{ fontSize: 10, color: t.t4, marginTop: 2 }}>by {conn.createdBy}</div>
                    </div>
                    <span style={{ fontSize: 12, color: t.t2, transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s", flexShrink: 0 }}>▾</span>
                  </div>

                  {/* Expanded credential details */}
                  {isExpanded && !isEditing && (
                    <div style={{ borderTop: `1px solid ${t.bdr}`, padding: "18px 18px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 16 }}>
                        {[
                          { label: "API URL",       value: conn.apiUrl || "—" },
                          { label: "Client ID",     value: conn.clientId || "—" },
                          { label: "Scope",         value: conn.scope || "—" },
                          { label: "Client Secret", value: "••••••••••••" },
                        ].map(({ label, value }) => (
                          <div key={label}>
                            <div style={{ fontSize: 9, color: t.t2, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 5 }}>{label}</div>
                            <div style={{ fontSize: 11, color: t.t1, fontFamily: "'IBM Plex Mono',monospace", background: t.panel, border: `1px solid ${t.bdr}`, borderRadius: 6, padding: "8px 10px", wordBreak: "break-all" }}>
                              {value}
                            </div>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { setEditingConn(conn); }}
                          style={{ padding: "7px 16px", borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", background: "transparent", border: `1px solid ${t.purpleTxt}44`, color: t.purpleTxt }}>
                          Edit Credentials
                        </button>
                        <button onClick={() => toggleStatus(conn.id)}
                          style={{
                            padding: "7px 16px", borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", background: "transparent",
                            border: `1px solid ${conn.status === "active" ? t.errorBdr : t.successBdr}`,
                            color: conn.status === "active" ? t.errorTxt : t.successTxt,
                          }}>
                          {conn.status === "active" ? "Deactivate" : "Activate"}
                        </button>
                        <button onClick={() => handleDelete(conn.id)}
                          style={{ marginLeft: "auto", padding: "7px 14px", borderRadius: 7, fontSize: 11, fontWeight: 700, fontFamily: "inherit", cursor: "pointer", background: "transparent", border: `1px solid ${t.bdr}`, color: t.t2, transition: "all 0.14s" }}
                          onMouseEnter={e => { e.currentTarget.style.borderColor = t.errorBdr; e.currentTarget.style.color = t.errorTxt; }}
                          onMouseLeave={e => { e.currentTarget.style.borderColor = t.bdr; e.currentTarget.style.color = t.t2; }}>
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security notice */}
      <div style={{ background: t.surface, border: `1px solid ${t.bdrS}`, borderRadius: 10, padding: "16px 20px", marginBottom: 18 }}>
        <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
          <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>🔒</span>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, color: t.t1, marginBottom: 5 }}>Security Note</div>
            <div style={{ fontSize: 11, color: t.t2, lineHeight: 1.7 }}>
              Credentials are stored in browser localStorage for local development.
              For production deployments, set{" "}
              <code style={{ fontFamily: "'IBM Plex Mono',monospace", color: t.purpleTxt, background: t.purpleBg, padding: "1px 5px", borderRadius: 4 }}>VITE_COUPA_API_URL</code>,{" "}
              <code style={{ fontFamily: "'IBM Plex Mono',monospace", color: t.purpleTxt, background: t.purpleBg, padding: "1px 5px", borderRadius: 4 }}>COUPA_CLIENT_ID</code>, and{" "}
              <code style={{ fontFamily: "'IBM Plex Mono',monospace", color: t.purpleTxt, background: t.purpleBg, padding: "1px 5px", borderRadius: 4 }}>COUPA_CLIENT_SECRET</code>{" "}
              server-side and route API calls through a secure backend proxy.
              See{" "}
              <code style={{ fontFamily: "'IBM Plex Mono',monospace", color: t.accentTxt, background: t.accentBg, padding: "1px 5px", borderRadius: 4 }}>.env.example</code>{" "}
              in the project root.
            </div>
          </div>
        </div>
      </div>

      {/* Placeholder for future settings */}
      <div style={{ border: `1px dashed ${t.bdrS}`, borderRadius: 12, padding: "22px 24px", textAlign: "center" }}>
        <div style={{ fontSize: 11, color: t.t3, letterSpacing: "0.1em", textTransform: "uppercase" }}>More settings coming soon</div>
      </div>

      {showAdd && (
        <CoupaConnectionModal title="Add Coupa Connection" onSave={handleAdd} onClose={() => setShowAdd(false)} />
      )}
      {editingConn && (
        <CoupaConnectionModal title="Edit Coupa Connection" initial={editingConn} onSave={handleUpdate} onClose={() => setEditingConn(null)} />
      )}

      {toast && (
        <div style={{ position: "fixed", bottom: 26, left: "50%", transform: "translateX(-50%)", background: t.panel, border: `1px solid ${t.bdrS}`, borderRadius: 8, padding: "9px 22px", fontSize: 12, color: t.t1, boxShadow: "0 8px 32px #00000080", zIndex: 400, pointerEvents: "none" }}>
          {toast}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// ROOT App
// ═══════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [activePage,     setActivePage]     = useState("dashboard");
  const [navOpen,        setNavOpen]        = useState(false);
  const [darkMode,       setDarkMode]       = useState(true);
  const [savedChains,    setSavedChains]    = useState(loadChains);
  const [savedWorkflows, setSavedWorkflows] = useState(loadWorkflows);
  const [editingChain,   setEditingChain]   = useState(null);

  useEffect(() => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }, []);

  // Persist chains and workflows to localStorage on every change
  useEffect(() => { saveChains(savedChains); }, [savedChains]);
  useEffect(() => { saveWorkflows(savedWorkflows); }, [savedWorkflows]);

  const navigate = page => { setActivePage(page); setNavOpen(false); };

  const handleSave = chain => {
    setSavedChains(prev => {
      const idx = prev.findIndex(c => c.id === chain.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = chain; return n; }
      return [...prev, chain];
    });
    // Stay on new-chain page; update editingChain so subsequent saves use correct id
    setEditingChain(chain);
  };

  const handleEdit = chain => {
    setEditingChain(chain);
    navigate("new-chain");
  };

  const handleDelete = id => {
    setSavedChains(prev => prev.filter(c => c.id !== id));
    // If currently editing the deleted chain, clear it
    if (editingChain?.id === id) setEditingChain(null);
  };

  const handleNewChain = () => {
    setEditingChain(null);
    navigate("new-chain");
  };

  const handleDeleteWorkflow = id => {
    setSavedWorkflows(prev => prev.filter(w => w.id !== id));
  };

  const handleSaveWorkflow = workflow => {
    setSavedWorkflows(prev => {
      const idx = prev.findIndex(w => w.id === workflow.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = workflow; return n; }
      return [...prev, workflow];
    });
  };

  const renderPage = () => {
    switch (activePage) {
      case "dashboard":   return <DashboardPage savedChains={savedChains} savedWorkflows={savedWorkflows} onNavigate={navigate} />;
      case "new-chain":   return <NewApprovalChainPage onSave={handleSave} editingChain={editingChain} key={editingChain?.id || "new"} />;
      case "view-chains": return <ViewChainsPage savedChains={savedChains} onNavigate={navigate} onEdit={handleEdit} onDelete={handleDelete} />;
      case "workflow":    return <NewApprovalWorkflowPage onSave={handleSaveWorkflow} />;
      case "simulate":    return <ViewWorkflowsPage savedWorkflows={savedWorkflows} onNavigate={navigate} onDelete={handleDeleteWorkflow} />;
      case "reference":   return <ReferenceValuesPage />;
      case "settings":    return <SettingsPage />;
      case "help":        return <PlaceholderPage icon="?" title="Help & Documentation" description="Guides, tips and reference material for building Coupa approval chains." bullets={["Step-by-step guide", "Condition syntax reference", "FAQ"]} />;
      default:            return <DashboardPage savedChains={savedChains} savedWorkflows={savedWorkflows} onNavigate={navigate} />;
    }
  };

  const activeLabel = NAV_ITEMS.find(n => n.id === activePage)?.label || "";
  const tk = TK[darkMode ? "dark" : "light"];

  return (
    <ThemeCtx.Provider value={darkMode}>
    <div style={{ display:"flex", flexDirection:"column", height:"100vh", background:tk.bg, color:tk.t0, fontFamily:"'Space Grotesk',sans-serif", overflow:"hidden", transition:"background 0.25s,color 0.25s" }}>

      {/* TOP BAR */}
      <div style={{ display:"flex", alignItems:"center", gap:14, padding:"0 20px", height:52, background:tk.topbar, borderBottom:`1px solid ${tk.bdr}`, flexShrink:0, zIndex:100, transition:"background 0.25s,border-color 0.25s" }}>
        <button onClick={() => setNavOpen(o => !o)}
          style={{ display:"flex", flexDirection:"column", gap:5, background:"transparent", border:"none", cursor:"pointer", padding:"5px 3px", flexShrink:0 }}>
          <div style={{ width:20, height:2, background:navOpen?"#f59e0b":"#3b5278", borderRadius:2, transition:"all 0.22s", transform:navOpen?"rotate(45deg) translate(5px,5px)":"none" }} />
          <div style={{ width:20, height:2, background:navOpen?"transparent":"#3b5278", borderRadius:2, transition:"opacity 0.15s" }} />
          <div style={{ width:20, height:2, background:navOpen?"#f59e0b":"#3b5278", borderRadius:2, transition:"all 0.22s", transform:navOpen?"rotate(-45deg) translate(5px,-5px)":"none" }} />
        </button>
        <div style={{ width:1, height:18, background:"#111c2e" }} />
        <span style={{ fontSize:10, letterSpacing:"0.22em", color:tk.t4, fontWeight:700, flexShrink:0 }}>COUPA</span>
        <div style={{ width:1, height:18, background:tk.bdr }} />
        <span style={{ fontSize:12, color:tk.t2 }}>Approval Chains</span>
        <span style={{ fontSize:12, color:tk.bdrS }}>›</span>
        <span style={{ fontSize:12, color:tk.t1, fontWeight:600 }}>{activeLabel}</span>
        <div style={{ marginLeft:"auto", display:"flex", alignItems:"center", gap:10 }}>

          {/* Day / Night toggle — Dashboard only */}
          {activePage === "dashboard" && (
            <button onClick={() => setDarkMode(d => !d)} style={{
              display:"flex", alignItems:"center", gap:7,
              padding:"5px 13px", borderRadius:20, cursor:"pointer", fontFamily:"inherit",
              fontSize:11, fontWeight:700, transition:"all 0.22s",
              background: darkMode ? "#111c2e" : "#fef9c3",
              border:     darkMode ? "1px solid #1e3560" : "1px solid #fde047",
              color:      darkMode ? "#94a3b8"  : "#854d0e",
            }}>
              <span style={{ fontSize:13 }}>{darkMode ? "☽" : "☀"}</span>
              {darkMode ? "Dark" : "Light"}
            </button>
          )}

          {/* New-chain page controls */}
          {activePage === "new-chain" && (
            <>
              {savedChains.length > 0 && (
                <div style={{ display:"flex", alignItems:"center", gap:6, padding:"4px 12px", borderRadius:6, background:tk.deep, border:`1px solid ${tk.bdrS}` }}>
                  <span style={{ width:6, height:6, borderRadius:"50%", background:"#2563eb", display:"inline-block" }} />
                  <span style={{ fontSize:10, color:tk.t2 }}>{savedChains.length} saved</span>
                </div>
              )}
              <button onClick={handleNewChain}
                style={{ padding:"5px 14px", borderRadius:7, fontSize:11, fontWeight:700, fontFamily:"inherit", cursor:"pointer", background:"transparent", border:"1px solid #f59e0b44", color:"#f59e0b" }}>
                + New
              </button>
            </>
          )}

        </div>
      </div>

      {/* BODY */}
      <div style={{ display:"flex", flex:1, overflow:"hidden", position:"relative" }}>

        {/* Nav drawer */}
        <div style={{ position:"absolute", top:0, left:0, height:"100%", width:256,
          background:tk.topbar, borderRight:`1px solid ${tk.bdr}`,
          transform: navOpen ? "translateX(0)" : "translateX(-260px)",
          transition:"transform 0.26s cubic-bezier(0.4,0,0.2,1), background 0.25s",
          zIndex:50, display:"flex", flexDirection:"column",
          boxShadow: navOpen ? "8px 0 32px #00000060" : "none" }}>
          <div style={{ padding:"18px 18px 12px", borderBottom:`1px solid ${tk.bdr}` }}>
            <div style={{ fontSize:9, letterSpacing:"0.2em", color:tk.t2, textTransform:"uppercase", fontWeight:700 }}>Navigation</div>
          </div>
          <nav style={{ flex:1, padding:"10px", overflowY:"auto" }}>
            {NAV_ITEMS.map(item => {
              const isActive = item.id === activePage;
              return (
                <button key={item.id} onClick={() => navigate(item.id)}
                  style={{ display:"flex", alignItems:"center", gap:12, width:"100%", padding:"10px 13px", borderRadius:9, marginBottom:3, textAlign:"left",
                    background: isActive ? "linear-gradient(135deg,#f59e0b18,#d9770610)" : "transparent",
                    border: `1px solid ${isActive ? "#f59e0b33" : "transparent"}`,
                    cursor:"pointer", fontFamily:"inherit", transition:"all 0.14s" }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = tk.bdr; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = "transparent"; }}>
                  <span style={{ fontSize:13, color:isActive?"#f59e0b":tk.t2, width:18, textAlign:"center", flexShrink:0 }}>{item.icon}</span>
                  <span style={{ fontSize:12, fontWeight:isActive?600:400, color:isActive?"#f59e0b":tk.t1 }}>{item.label}</span>
                  {isActive && <span style={{ marginLeft:"auto", width:5, height:5, borderRadius:"50%", background:"#f59e0b", flexShrink:0 }} />}
                </button>
              );
            })}
          </nav>
          <div style={{ padding:"12px 18px", borderTop:`1px solid ${tk.bdr}` }}>
            <div style={{ fontSize:9, color:tk.t3, letterSpacing:"0.12em" }}>COUPA APPROVAL BUILDER</div>
            <div style={{ fontSize:9, color:tk.t2, marginTop:2 }}>v2.0.0</div>
          </div>
        </div>

        {navOpen && <div onClick={() => setNavOpen(false)} style={{ position:"absolute", inset:0, background:"#00000055", zIndex:40, backdropFilter:"blur(1px)" }} />}

        <div style={{ flex:1, overflow:"hidden", display:"flex", flexDirection:"column" }}>
          {renderPage()}
        </div>
      </div>

      <style>{`
        * { box-sizing: border-box; }
        input:focus, select:focus, textarea:focus { border-color: #2a4a7f !important; box-shadow: 0 0 0 2px #1a2e6018; }
        button:not(:disabled):hover { opacity: 0.84; }
        ::-webkit-scrollbar { width: 5px; height: 5px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: #1a2744; border-radius: 3px; }
        input[type=range] { height: 4px; }
        input[type=number]::-webkit-inner-spin-button { opacity: 0.4; }
      `}</style>
    </div>
    </ThemeCtx.Provider>
  );
}
