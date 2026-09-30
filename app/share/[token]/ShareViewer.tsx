"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ChevronDown, ChevronRight, Copy, ExternalLink, X } from "lucide-react";
import { generateGeneralHtml, generateKurlyHtml } from "../../lib/html";
import { createHtmlPreviewPayload, HTML_PREVIEW_STORAGE_KEY, HTML_PREVIEW_WINDOW_NAME } from "../../lib/html-preview";
import { productGroupLabel } from "../../lib/product-grouping";
import type { AssetImage, BrandKey } from "../../lib/task-types";

type SharedImage = AssetImage;
type SharedTask = { kurlyEnabled?: boolean; id: string; brandKey?: BrandKey; product: string; item: string; option?: string; html?: string; storeLink?: string; vendors?: string[]; note?: string; thumbnailNas?: string; detailNas?: string; shootingNas?: string; images?: SharedImage[] };

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

function SharedCopyCell({ value, label, onCopied }: { value: string; label: string; onCopied: () => void }) {
  return <div className="cell-copy"><span title={value}>{value}</span>{value && <button className="copy-cell-button" type="button" aria-label={`${label} 복사`} title={`${label} 복사`} onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); void copyText(value).then(onCopied); }}><Copy size={16} /></button>}</div>;
}

function SharedDetailPanel({ task, onClose, onCopied, onNotice, closing }: { task: SharedTask; onClose: () => void; onCopied: () => void; onNotice: (message: string) => void; closing: boolean }) {
  const [htmlMode, setHtmlMode] = useState<"html" | "url">("html");
  const [htmlPanelMode, setHtmlPanelMode] = useState<"general" | "kurly">("general");
  const previewVersionRef = useRef(Date.now());
  const images = task.images ?? [];
  const html = htmlPanelMode === "general" ? (task.html || generateGeneralHtml(images, task.brandKey)) : generateKurlyHtml(images, task.brandKey, task.kurlyEnabled !== false);
  const displayed = htmlMode === "html" ? html.split("\n").filter(Boolean) : [...html.matchAll(/<img\s+src=['"]([^'"]+)['"]/g)].map((match) => match[1]);
  useEffect(() => { setHtmlMode("html"); setHtmlPanelMode("general"); }, [task.id]);
  const openHtmlPreview = () => {
    const previewImages: SharedImage[] = [...html.matchAll(/<img\s+src=['"]([^'"]+)['"]/g)].map((match, index) => {
      const url = match[1];
      let name = `image-${index + 1}`;
      try { name = decodeURIComponent(new URL(url).pathname.split("/").pop() || name); } catch { /* Keep the fallback name. */ }
      return { id: `shared-preview-${index}-${url}`, name, url };
    });
    if (!previewImages.length) { onNotice("미리보기할 이미지가 없습니다."); return; }
    try {
      const version = Math.max(Date.now(), previewVersionRef.current + 1);
      previewVersionRef.current = version;
      window.localStorage.setItem(HTML_PREVIEW_STORAGE_KEY, JSON.stringify(createHtmlPreviewPayload(htmlPanelMode, previewImages, version)));
    } catch {
      onNotice("새 창 미리보기 데이터를 준비하지 못했습니다.");
      return;
    }
    const previewWindow = window.open("/html-preview", HTML_PREVIEW_WINDOW_NAME);
    if (!previewWindow) { onNotice("팝업이 차단되었습니다. 팝업을 허용해 주세요."); return; }
    previewWindow.focus();
  };
  return <aside className={`detail-panel saved-detail-panel share-detail-panel${closing ? " is-closing" : ""}`}>
    <div className="detail-tabs"><button className="active">제품 정보</button><span /><button className="close" aria-label="상세 패널 닫기" onClick={onClose}><X size={16} /></button></div>
    <div className="detail-body">
      <div className="info-grid"><span>제품명</span><b>{task.product}</b><span>품목</span><b>{task.item}</b>{task.option && <><span>옵션</span><b>{task.option}</b></>}<span>거래처</span><b>{task.vendors?.join(", ") || "-"}</b><span>링크</span>{task.storeLink ? <a href={task.storeLink} target="_blank" rel="noopener noreferrer">열기</a> : <b>-</b>}<span>참고사항</span><b className="wide">{task.note || "-"}</b></div>
      <section className="detail-section html-section">
        <div className="section-title">
          <div className="html-section-heading">
            <h3>HTML 링크</h3>
            <span className="html-mode-tabs">
              <button type="button" className={htmlPanelMode === "general" ? "active" : ""} onClick={() => { setHtmlPanelMode("general"); setHtmlMode("html"); }}>기본</button>
              <button type="button" disabled={task.kurlyEnabled === false} className={htmlPanelMode === "kurly" ? "active" : ""} onClick={() => { setHtmlPanelMode("kurly"); setHtmlMode("html"); }}>컬리용</button>
            </span>
          </div>
          <span className="html-link-actions">
            <button type="button" className="html-view-toggle" data-tooltip={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} title={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} aria-label={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} onClick={() => setHtmlMode((current) => current === "html" ? "url" : "html")}><ArrowLeftRight size={16} /></button>
            <button type="button" className="copy-action" data-tooltip="현재 내용 복사" title="현재 내용 복사" aria-label="현재 내용 복사" disabled={!html.trim()} onClick={() => void copyText(displayed.join("\n")).then(onCopied)}><Copy size={16} /></button>
            <button type="button" className="preview-action" data-tooltip="새 창 미리보기" title="새 창 미리보기" aria-label="현재 HTML 새 창에서 미리보기" disabled={!html.trim()} onClick={openHtmlPreview}><ExternalLink size={16} /></button>
          </span>
        </div>
        <div className="code-box">{displayed.map((line, index) => <p key={`${htmlPanelMode}-${htmlMode}-${index}-${line}`}>{htmlMode === "url" ? <a href={line} target="_blank" rel="noopener noreferrer">{line}</a> : line}</p>)}</div>
      </section>
      <section className="detail-section paths"><h3>NAS 경로</h3><SharedPathRow label="썸네일" value={task.thumbnailNas ?? ""} onCopied={onCopied} /><SharedPathRow label="상세페이지" value={task.detailNas ?? ""} onCopied={onCopied} /><SharedPathRow label="촬영본" value={task.shootingNas ?? ""} onCopied={onCopied} /></section>
    </div>
  </aside>;
}

function SharedPathRow({ label, value, onCopied }: { label: string; value: string; onCopied: () => void }) {
  return <div className="path-row"><label>{label}</label><div>{value || "-"}</div>{value && <button type="button" aria-label={`${label} 경로 복사`} onClick={() => void copyText(value).then(onCopied)}><Copy size={16} /> 복사</button>}</div>;
}

export default function ShareViewer({ token }: { token: string }) {
  const [tasks, setTasks] = useState<SharedTask[]>([]);
  const [selectedTask, setSelectedTask] = useState<SharedTask | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const detailCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copyNotice, setCopyNotice] = useState("");
  const copyNoticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    fetch(`/api/shares/${encodeURIComponent(token)}`).then(async (response) => {
      if (!response.ok) throw new Error("공유 링크가 없거나 만료되었습니다.");
      return response.json() as Promise<{ share?: { tasks?: SharedTask[] } }>;
    }).then((payload) => {
      const sharedTasks = payload.share?.tasks ?? [];
      setTasks(sharedTasks);
      setCollapsedGroups(new Set());
    }).catch((reason: unknown) => setError(reason instanceof Error ? reason.message : "공유 정보를 불러오지 못했습니다.")).finally(() => setLoading(false));
  }, [token]);
  const groups = useMemo(() => Object.entries(tasks.reduce<Record<string, SharedTask[]>>((all, task) => { const groupLabel = productGroupLabel(task.product, task.brandKey); (all[groupLabel] ??= []).push(task); return all; }, {})), [tasks]);
  const activeBrandKey = tasks[0]?.brandKey ?? "amante";
  const activeBrandImage = BRAND_IMAGES[activeBrandKey] ?? BRAND_IMAGES.amante;
  const showOptionColumn = activeBrandKey === "serendiment";
  const tableColumnCount = showOptionColumn ? 9 : 8;
  useEffect(() => {
    document.body.dataset.brand = activeBrandKey;
    return () => { delete document.body.dataset.brand; };
  }, [activeBrandKey]);
  useEffect(() => () => {
    if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current);
    if (copyNoticeTimerRef.current) clearTimeout(copyNoticeTimerRef.current);
  }, []);
  const showCopyNotice = (message = "복사되었습니다.") => {
    setCopyNotice(message);
    if (copyNoticeTimerRef.current) clearTimeout(copyNoticeTimerRef.current);
    copyNoticeTimerRef.current = setTimeout(() => setCopyNotice(""), 1800);
  };
  const openDetail = (task: SharedTask) => {
    if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current);
    detailCloseTimerRef.current = null;
    setDetailClosing(false);
    setSelectedTask(task);
  };
  const closeDetail = () => {
    if (!selectedTask || detailClosing) return;
    setDetailClosing(true);
    detailCloseTimerRef.current = setTimeout(() => {
      setSelectedTask(null);
      setDetailClosing(false);
      detailCloseTimerRef.current = null;
    }, 180);
  };
  const handleTaskSelect = (task: SharedTask) => { if (selectedTask?.id === task.id) closeDetail(); else openDetail(task); };
  useEffect(() => {
    if (!selectedTask) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("tr, .detail-panel, .app-header")) closeDetail();
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    return () => document.removeEventListener("pointerdown", closeOnOutside, true);
  }, [selectedTask]);
  const toggleGroup = (product: string) => setCollapsedGroups((current) => { const next = new Set(current); if (next.has(product)) next.delete(product); else next.add(product); return next; });
  return <main className={`share-page brand-${activeBrandKey}`}><header className="app-header share-app-header"><div className="brand-heading"><div className="brand-switcher share-brand-switcher"><img src={activeBrandImage} alt="" /></div><div className="app-title"><h1>Detail Page Asset Manager</h1><p>읽기 전용 공유 링크 · 편집할 수 없습니다.</p></div></div><div className="actions"><button type="button" className="share-header-copy" onClick={() => void copyText(window.location.href).then(() => showCopyNotice())}><Copy size={16} /> 링크 복사</button></div></header><div className={`workspace share-workspace ${selectedTask ? "with-detail" : ""}`}><section className={`table-shell${showOptionColumn ? " has-option-column" : ""}`} onClick={(event) => { const target = event.target as HTMLElement; if (selectedTask && !target.closest("tr,button,a")) closeDetail(); }}><div className="table-header"><table><colgroup><col className="c-name"/><col className="c-type"/>{showOptionColumn && <col className="c-option"/>}<col className="c-link"/><col className="c-html"/><col className="c-nas"/><col className="c-nas"/><col className="c-nas"/><col className="c-note"/></colgroup><thead><tr><th>제품명</th><th>품목</th>{showOptionColumn && <th>옵션</th>}<th>링크</th><th className="html-column">HTML / URL</th><th className="nas-column"><span className="table-header-label-full">{showOptionColumn ? "썸네일 Drive" : "썸네일 NAS"}</span><span className="table-header-label-compact">썸네일</span></th><th className="nas-column"><span className="table-header-label-full">{showOptionColumn ? "상세페이지 Drive" : "상세페이지 NAS"}</span><span className="table-header-label-compact">상세페이지</span></th><th className="nas-column"><span className="table-header-label-full">{showOptionColumn ? "촬영본 Drive" : "촬영본 NAS"}</span><span className="table-header-label-compact">촬영본</span></th><th>참고사항</th></tr></thead></table></div><div className="table-scroll"><table className="share-table"><colgroup><col className="c-name"/><col className="c-type"/>{showOptionColumn && <col className="c-option"/>}<col className="c-link"/><col className="c-html"/><col className="c-nas"/><col className="c-nas"/><col className="c-nas"/><col className="c-note"/></colgroup><tbody>{loading ? <tr><td colSpan={tableColumnCount}><div className="share-empty">공유 정보를 불러오는 중입니다.</div></td></tr> : error ? <tr><td colSpan={tableColumnCount}><div className="share-empty error">{error}</div></td></tr> : groups.length === 0 ? <tr><td colSpan={tableColumnCount}><div className="share-empty">공유된 자산이 없습니다.</div></td></tr> : groups.map(([product, grouped], index) => <Fragment key={product}><tr className={`product-row tone-${index % 2}`} onClick={() => toggleGroup(product)}><td><button className="expand" type="button" aria-label={`${product} 하위 품목 ${collapsedGroups.has(product) ? "펼치기" : "접기"}`} onClick={(event) => { event.stopPropagation(); toggleGroup(product); }}>{collapsedGroups.has(product) ? <ChevronRight size={16} /> : <ChevronDown size={16} />}</button><b>{product}</b></td><td><span className="count">{grouped.length}개</span></td>{showOptionColumn && <td />}<td /><td /><td className="nas-column"/><td className="nas-column"/><td className="nas-column"/><td /></tr>{!collapsedGroups.has(product) && grouped.map((task) => <tr className="item-row" key={task.id} onClick={() => handleTaskSelect(task)}><td data-label="제품명">{task.product}</td><td data-label="품목">{task.item}</td>{showOptionColumn && <td data-label="옵션">{task.option}</td>}<td data-label="링크">{task.storeLink ? <a className="store-link" href={task.storeLink} target="_blank" rel="noopener noreferrer" title="자사몰 상품 열기" aria-label={`${task.product} ${task.item} 자사몰 상품 열기`} onClick={(event) => event.stopPropagation()}><ExternalLink size={18} /></a> : null}</td><td data-label="HTML"><SharedCopyCell value={task.html ?? ""} label={`${task.product} ${task.item} HTML`} onCopied={showCopyNotice} /></td><td className="nas-column" data-label="썸네일 NAS"><SharedCopyCell value={task.thumbnailNas ?? ""} label="썸네일 NAS" onCopied={showCopyNotice} /></td><td className="nas-column" data-label="상세페이지 NAS"><SharedCopyCell value={task.detailNas ?? ""} label="상세페이지 NAS" onCopied={showCopyNotice} /></td><td className="nas-column" data-label="촬영본 NAS"><SharedCopyCell value={task.shootingNas ?? ""} label="촬영본 NAS" onCopied={showCopyNotice} /></td><td data-label="참고사항"><div className="table-note"><div className="vendor-badges">{(task.vendors ?? []).map((vendor) => <span className={`vendor-badge ${vendorClass(vendor)}`} key={vendor}>{vendor}</span>)}</div>{task.note && <span className="table-note-text">{task.note}</span>}</div></td></tr>)}</Fragment>)}</tbody></table></div><footer><span className="table-summary">제품 {groups.length}개 · 품목 {tasks.length}개</span></footer></section>{selectedTask && <SharedDetailPanel task={selectedTask} closing={detailClosing} onClose={closeDetail} onCopied={showCopyNotice} onNotice={showCopyNotice} />}</div>{copyNotice && <div className="table-copy-toast" role="status">{copyNotice}</div>}</main>;
}

function vendorClass(vendor: string) {
  if (vendor.includes("컬리")) return "vendor-kurly";
  if (vendor.includes("오집")) return "vendor-ohzip";
  if (vendor.includes("퀸잇")) return "vendor-queenzit";
  if (vendor.includes("네이버")) return "vendor-naver";
  return "vendor-default";
}
