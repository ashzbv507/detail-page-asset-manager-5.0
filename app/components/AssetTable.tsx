"use client";

import { Fragment, useState } from "react";
import type { AssetTask } from "../lib/task-types";
import { htmlForImages } from "../lib/html";

type Props = { tasks: AssetTask[]; onSelect: (task: AssetTask) => void };

function copyText(value: string) { if (value && navigator.clipboard) void navigator.clipboard.writeText(value); }
function CopyCell({ value }: { value: string }) { return <div className="cell-copy"><span title={value}>{value || "—"}</span>{value && <button aria-label="내용 복사" onClick={(event) => { event.stopPropagation(); copyText(value); }}>복사</button>}</div>; }

export function AssetTable({ tasks, onSelect }: Props) {
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());
  const groups = Object.entries(tasks.reduce<Record<string, AssetTask[]>>((all, task) => { (all[task.productName] ??= []).push(task); return all; }, {}));
  return <section className="table-shell" aria-label="자산 목록"><div className="table-scroll"><table><colgroup><col className="product" /><col className="item" /><col className="link" /><col className="html" /><col className="nas" /><col className="nas" /><col className="note" /></colgroup><thead><tr><th>제품명</th><th>품목</th><th>링크</th><th>HTML / URL</th><th>썸네일 NAS</th><th>상세페이지 NAS</th><th>참고사항</th></tr></thead><tbody>{groups.map(([productName, grouped]) => { const isExpanded = expandedGroups.has(productName); return <Fragment key={productName}><tr className="product-row" onClick={() => setExpandedGroups((current) => { const next = new Set(current); if (next.has(productName)) next.delete(productName); else next.add(productName); return next; })}><td><span className={`expand ${isExpanded ? "open" : ""}`}>›</span><b>{productName}</b></td><td><span className="count">{grouped.length}개</span></td><td /><td /><td /><td /><td /></tr>{isExpanded && grouped.map((task) => <tr key={task.id} className="asset-row" onClick={() => onSelect(task)}><td className="child-product">{task.productName}</td><td><strong>{task.itemName}</strong>{task.optionName && <em>{task.optionName}</em>}</td><td>{task.storeLink && <a href={task.storeLink} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()} aria-label="자사몰 링크 열기">↗</a>}</td><td><CopyCell value={htmlForImages(task.images)} /></td><td><CopyCell value={task.thumbnailNas} /></td><td><CopyCell value={task.detailNas} /></td><td><div className="table-note"><div>{task.vendors.map((vendor) => <span key={vendor}>{vendor}</span>)}</div>{task.note}</div></td></tr>)}</Fragment>; })}</tbody></table></div><footer>제품 {groups.length}개 · 품목 {tasks.length}개</footer></section>;
}
