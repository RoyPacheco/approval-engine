"""
Coupa approval-chain CSV export — Python port of the frontend buildCoupaRow logic.
Produces the exact 58-column format Coupa expects for bulk import.
"""

CSV_HEADERS = [
    "Approval Chain Name", "Status", "Approval Chain Type", "Approval Chain Subtype",
    "Priority", "Skip Approvers", "Skip Management Hierarchy", "Skip Further Approvers",
    "Auto Approve Self", "Dedupe OBO User and Auto Approve", "Always Evaluate", "Parallel",
    "Total Comparator", "Minimum Total Amount", "Maximum Total Amount", "Total Currency",
    "Minimum Approval Limit", "Maximum Approval Limit Amount", "Maximum Approval Limit Currency",
    "Maximum Approval Limit", "Operator",
    "Condition 1", "Condition 2", "Condition 3", "Condition 4", "Condition 5",
    "Condition 6", "Condition 7", "Condition 8", "Condition 9", "Condition 10",
    "Description",
    "Approver 1", "Approver 2", "Approver 3", "Approver 4", "Approver 5",
    "Approver 6", "Approver 7", "Approver 8", "Approver 9", "Approver 10",
    "Watcher 1", "Watcher 2", "Watcher 3", "Watcher 4", "Watcher 5",
    "Approver Params", "Validation Message",
    "Signatory 1", "Signatory 2", "Signatory 3", "Signatory 4", "Signatory 5",
    "Applies to Supplier",
]


def _serialize_cond(c: dict) -> str:
    if not c or not c.get("field"):
        return ""
    if c.get("op") in ("is blank", "is not blank"):
        return f"{c['field']}:{c['op']}:"
    return f"{c['field']}:{c.get('op', '')}:{c.get('value', '')}"


def _get_approver_order(nodes: list[dict], edges: list[dict]) -> list[dict]:
    approver_nodes = [n for n in nodes if n.get("type") != "watcher"]
    approver_ids = {n["id"] for n in approver_nodes}
    in_deg: dict[str, int] = {n["id"]: 0 for n in approver_nodes}

    for ed in edges:
        src, dst = ed.get("from", ""), ed.get("to", "")
        if src in approver_ids and dst in approver_ids:
            in_deg[dst] = in_deg.get(dst, 0) + 1

    queue = [n["id"] for n in approver_nodes if in_deg.get(n["id"], 0) == 0]
    order: list[str] = []
    visited: set[str] = set()

    while queue:
        nid = queue.pop(0)
        if nid in visited:
            continue
        visited.add(nid)
        order.append(nid)
        for ed in edges:
            if ed.get("from") == nid and ed.get("to") in approver_ids:
                dst = ed["to"]
                in_deg[dst] -= 1
                if in_deg[dst] == 0:
                    queue.append(dst)

    for n in approver_nodes:
        if n["id"] not in visited:
            order.append(n["id"])

    node_map = {n["id"]: n for n in nodes}
    return [node_map[nid] for nid in order if nid in node_map]


def build_coupa_row(chain: dict) -> list:
    f = chain.get("flags") or {}
    conditions = (chain.get("conditions") or [])[:10]
    cond_strs = [_serialize_cond(conditions[i]) if i < len(conditions) else "" for i in range(10)]

    approver_nodes = _get_approver_order(chain.get("nodes") or [], chain.get("edges") or [])
    watcher_nodes = [n for n in (chain.get("nodes") or []) if n.get("type") == "watcher"]
    signatories = chain.get("signatories") or []

    approvers = [
        f"{(approver_nodes[i].get('email') or approver_nodes[i].get('name', ''))}:{approver_nodes[i].get('amount', '')}:{approver_nodes[i].get('currency', '')}"
        if i < len(approver_nodes) else ""
        for i in range(10)
    ]
    watchers = [watcher_nodes[i].get("name", "") if i < len(watcher_nodes) else "" for i in range(5)]
    sigs = [signatories[i] if i < len(signatories) else "" for i in range(5)]

    return [
        chain.get("name", ""),
        chain.get("status", "active"),
        chain.get("chainType", ""),
        chain.get("subtype", ""),
        chain.get("priority", ""),
        f.get("skipApprovers", ""),
        f.get("skipMgmtHierarchy", ""),
        f.get("skipFurtherApprovers", ""),
        f.get("autoApproveSelf", ""),
        f.get("dedupeOBO", ""),
        f.get("alwaysEvaluate", ""),
        f.get("parallel", ""),
        chain.get("totalComparator", ""),
        chain.get("minTotalAmount", ""),
        chain.get("maxTotalAmount", ""),
        chain.get("totalCurrency", ""),
        chain.get("minApprovalLimit", ""),
        chain.get("maxApprovalLimitAmount", ""),
        chain.get("maxApprovalLimitCurrency", ""),
        chain.get("maxApprovalLimit", ""),
        chain.get("condOperator", ""),
        *cond_strs,
        chain.get("description", ""),
        *approvers,
        *watchers,
        "",  # Approver Params — always blank per Coupa template
        chain.get("validationMessage", ""),
        *sigs,
        chain.get("appliesToSupplier", "No"),
    ]


def render_csv(chains: list[dict]) -> str:
    def quote(v) -> str:
        return '"' + str(v if v is not None else "").replace('"', '""') + '"'

    lines = [",".join(quote(h) for h in CSV_HEADERS)]
    for chain in chains:
        lines.append(",".join(quote(cell) for cell in build_coupa_row(chain)))
    return "\n".join(lines)
