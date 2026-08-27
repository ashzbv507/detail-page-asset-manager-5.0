"use client";

import { Fragment, useEffect, useMemo, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight, Copy, ExternalLink, X } from "lucide-react";
import { generateGeneralHtml } from "../../lib/html";
import { productGroupLabel } from "../../lib/product-grouping";
import type { BrandKey } from "../../lib/task-types";

type SharedImage = { id: string; name: string; url: string; excludeFromKurly?: boolean };
type SharedTask = { id: string; brandKey?: BrandKey; product: string; item: string; html?: string; storeLink?: string; vendors?: string[]; note?: string; thumbnailNas?: string; detailNas?: string; shootingNas?: string; images?: SharedImage[] };

const BRAND_IMAGES: Record<string, string> = { amante: "/brands/amante.png", imbedding: "/brands/imbedding.png", serendiment: "/brands/serendiment.png", sommier: "/brands/sommier.png" };

async function copyText(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = value;
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }
}

function SharedCopyCell({ value, label }: { value: string; label: string }) {
  return <div className="cell-copy"><span title={value}>{value}</span>{value && <button className="copy-cell-button" type="button" aria-label={`${label} 복사`} title={`${label} 복사`} onClick={(event) => { event.stopPropagation(); void copyText(value); }}><Copy size={16} /></button>}</div>;
}

function SharedDetailPanel({ task, onClose }: { task: SharedTask; onClose: () => void }) {
  const [htmlMode, setHtmlMode] = useState<"html" | "url">("html");
  const [htmlPanelMode, setHtmlPanelMode] = useState<"general" | "kurly">("general");
  const images = task.images ?? [];
  const activeImages = htmlPanelMode === "general" ? images : images.filter((image) => !image.excludeFromKurly);
  const html = htmlPanelMode === "general" ? (task.html || generateGeneralHtml(activeImages, task.brandKey)) : generateGeneralHtml(activeImages, task.brandKey);
  const displayed = htmlMode === "html" ? html.split("\n").filter(Boolean) : activeImages.map((image) => image.url ?? "").filter(Boolean);
  useEffect(() => { setHtmlMode("html"); setHtmlPanelMode("general"); }, [task.id]);
  return <aside className="detail-panel saved-detail-panel share-detail-panel">
    <div className="detail-tabs"><button className="active">제품 정보</button><span /><button className="close" aria-label="상세 패널 닫기" onClick={onClose}><X size={16} /></button></div>
    <div className="detail-body">
      <div className="info-grid"><span>제품명</span><b>{task.product}</b><span>품목</span><b>{task.item}</b><span>거래처</span><b>{task.vendors?.join(", ") || "-"}</b><span>링크</span>{task.storeLink ? <a href={task.storeLink} target="_blank" rel="noopener noreferrer">열기</a> : <b>-</b>}<span>참고사항</span><b className="wide">{task.note || "-"}</b></div>
      <section className="detail-section html-section"><div className="section-title"><div className="html-section-heading"><h3>HTML 링크</h3><span className="html-mode-tabs"><button type="button" className={htmlPanelMode === "general" ? "active" : ""} onClick={() => { setHtmlPanelMode("general"); setHtmlMode("html"); }}>기본</button><button type="button" className={htmlPanelMode === "kurly" ? "active" : ""} onClick={() => { setHtmlPanelMode("kurly"); setHtmlMode("html"); }}>컬리용</button></span></div><span className="html-link-actions"><button type="button" className="html-view-toggle" title={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} aria-label={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} onClick={() => setHtmlMode((current) => current === "html" ? "url" : "html")}><ArrowLeftRight size={16} /></button><button type="button" className="copy-action" title="현재 내용 복사" aria-label="현재 내용 복사" onClick={() => void copyText(displayed.join("\n"))}><Copy size={16} /></button></span></div><div className="code-box">{displayed.map((line, index) => <p key={`${htmlPanelMode}-${htmlMode}-${index}-${line}`}>{htmlMode === "url" ? <a href={line} target="_blank" rel="noopener noreferrer">{line}</a> : line}</p>)}</div></section>
      <section className="detail-section paths"><h3>NAS 경로</h3><SharedPathRow label="썸네일" value={task.thumbnailNas ?? ""} /><SharedPathRow label="상세페이지" value={task.detailNas ?? ""} /><SharedPathRow label="촬영본" value={task.shootingNas ?? ""} /></section>
    </div>
  </aside>;
}

function SharedPathRow({ label, value }: { label: string; value: string }) {
  return <div className="path-row"><label>{label}</label><div>{value || "-"}</div><button type="button" aria-label={`${label} 경로 복사`} onClick={() => void copyText(value)}><Copy size={16} /> 복사</button></div>;
}

export default function ShareViewer({ token }: { token: string }) {
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<SharedTask | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(`/api/shares/${encodeURIComponent(token)}`).then(async (response) => {
      if (!response.ok) throw new Error("공유 링크가 없거나 만료되었습니다.");
      return response.json() as Promise<{ share?: { tasks?: SharedTask[] } }>;
    }).then((payload) => {
      const sharedTasks = payload.share?.tasks ?? [];
      setTasks(sharedTasks);
      setCollapsedGroups(new Set(sharedTasks.map((task) => productGroupLabel(task.product, task.brandKey))));
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "공유 정보를 불러오지 못했습니다.")).finally(() => setLoading(false));
  }, [token]);
  const groups = useMemo(() => Object.entries(tasks.reduce<Record<string, SharedTask[]>>((all, task) => { const groupLabel = productGroupLabel(task.product, task.brandKey); (all[groupLabel] ??= []).push(task); return all; }, {})), [tasks]);
  const activeBrandImage = BRAND_IMAGES[tasks[0]?.brandKey ?? "amante"] ?? BRAND_IMAGES.amante;
  const toggleGroup = (product: string) => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(product)) next.delete(product); else next.add(product); return next; });
  return <main className="share-page"><header className="app-header share-app-header"><div className="brand-heading"><div className="brand-switcher share-brand-switcher"><img src={activeBrandImage} alt="" /></div><div className="app-title"><h1>Detail Page Asset Manager</h1><p>읽기 전용 공유 링크 · 편집할 수 없습니다.</p></div></div><div className="actions"><button type="button" className="share-header-copy" onClick={() => void copyText(window.location.href)}><Copy size={16} /> 링크 복사</button></div></header><div className={`workspace share-workspace ${selectedTask ? "with-detail" : ""}`}><section className="table-shell"><div className="table-header"><table><colgroup><col className="c-name"/><col className="c-type"/><col className="c-link"/><col className="c-html"/><col className="c-nas"/><col className="c-nas"/><col className="c-nas"/><col className="c-note"/></colgroup><thead><tr><th>제품명</th><th>품목</th><th>링크</th><th>HTML / URL</th><th>썸네일 NAS</th><th>상세페이지 NAS</th><th>촬영본 NAS</th><th>참고사항</th></tr></thead></table></div><div className="table-scroll"><table className="share-table"><colgroup><col className="c-name"/><col className="c-type"/><col className="c-link"/><col className="c-html"/><col className="c-nas"/><col className="c-nas"/><col className="c-nas"/><col className="c-note"/></colgroup><tbody>{loading ? <tr><td colSpan={8}><div className="share-empty">공유 정보를 불러오는 중입니다.</div></td></tr> : error ? <tr><td colSpan={8}><div className="share-empty error">{error}</div></td></tr> : groups.length === 0 ? <tr><td colSpan={8}><div className="share-empty">공유된 자산이 없습니다.</div></td></tr> : groups.map(([product, grouped], index) => <Fragment key={product}><tr className={`product-row tone-${index % 2}`} onClick={() => toggleGroup(product)}><td><button className="expand" type="button" aria-label={`${product} 하위 품목 ${collapsedGroups.has(product) ? "펼치기" : "접기"}`} onClick={(event) => { event.stopPropagation(); toggleGroup(product); }}>{collapsedGroups.has(product) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button><b>{product}</b></td><td><span className="count">{grouped.length}개</span></td><td /><td /><td /><td /><td /><td /></tr>{!collapsedGroups.has(product) && grouped.map((task) => <tr className="item-row" key={task.id} onClick={() => setSelectedTask(task)}><td>{task.product}</td><td>{task.item}</td><td>{task.storeLink ? <a className="store-link" href={task.storeLink} target="_blank" rel="noopener noreferrer" title="자사몰 상품 열기" aria-label={`${task.product} ${task.item} 자사몰 상품 열기`} onClick={(event) => event.stopPropagation()}><ExternalLink size={18} /></a> : null}</td><td onClick={(event) => event.stopPropagation()}><SharedCopyCell value={task.html ?? ""} label={`${task.product} ${task.item} HTML`} /></td><td onClick={(event) => event.stopPropagation()}><SharedCopyCell value={task.thumbnailNas ?? ""} label="썸네일 NAS" /></td><td onClick={(event) => event.stopPropagation()}><SharedCopyCell value={task.detailNas ?? ""} label="상세페이지 NAS" /></td><td onClick={(event) => event.stopPropagation()}><SharedCopyCell value={task.shootingNas ?? ""} label="촬영본 NAS" /></td><td><div className="table-note"><div className="vendor-badges">{(task.vendors ?? []).map((vendor) => <span className={`vendor-badge ${vendorClass(vendor)}`} key={vendor}>{vendor}</span>)}</div>{task.note && <span className="table-note-text">{task.note}</span>}</div></td></tr>)}</Fragment>)}</tbody></table></div><footer><span className="table-summary">제품 {groups.length}개 · 품목 {tasks.length}개</span></footer></section>{selectedTask && <SharedDetailPanel task={selectedTask} onClose={() => setSelectedTask(null)} />}</div></main>;
}

function vendorClass(vendor: string) {
  if (vendor.includes("컬리")) return "vendor-kurly";
  if (vendor.includes("오집")) return "vendor-ohzip";
  if (vendor.includes("퀸잇")) return "vendor-queenzit";
  if (vendor.includes("네이버")) return "vendor-naver";
  return "vendor-default";
}
