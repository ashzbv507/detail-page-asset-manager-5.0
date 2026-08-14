"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeftRight, ArrowRight, ChevronDown, ChevronRight, Copy, ImagePlus, Plus, Search, Share2, Trash2, X } from "lucide-react";
import { generateGeneralHtml } from "./lib/html";

type DetailTask = {
  id?: string;
  brandKey?: BrandKey;
  product: string;
  item: string;
  html: string;
  storeLink?: string;
  vendors?: string[];
  note?: string;
  thumbnailNas: string;
  detailNas: string;
  images?: ImageAsset[];
};

type ImageAsset = { id: string; name: string; url: string; mimeType?: string; size?: number; excludeFromKurly?: boolean };
type AssetGroup = { product: string; count: number; items?: DetailTask[] };

function taskKey(task: DetailTask) {
  return task.id ?? `${task.product}::${task.item}`;
}

type BrandKey = "amante" | "imbedding" | "serendiment" | "sommier";

const BRANDS: Array<{ key: BrandKey; name: string; image: string }> = [
  { key: "amante", name: "아망떼", image: "/brands/amante.png" },
  { key: "imbedding", name: "아임베딩", image: "/brands/imbedding.png" },
  { key: "serendiment", name: "세렌디먼트", image: "/brands/serendiment.png" },
  { key: "sommier", name: "소미에르", image: "/brands/sommier.png" },
];

const iconProps = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;

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

function CellCopy({ value, disabled = false }: { value: string; disabled?: boolean }) {
  return <div className={`cell-copy ${disabled ? "is-disabled" : ""}`}><span>{value}</span><button className="copy-cell-button" type="button" disabled={disabled} aria-disabled={disabled} aria-label="셀 내용 복사" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (!disabled) void copyText(value); }}><Copy {...iconProps} /></button></div>;
}

function DetailPanel({ task, onClose, onEdit }: { task: DetailTask; onClose: () => void; onEdit: () => void }) {
  const [htmlMode, setHtmlMode] = useState<"html" | "url">("html");
  const [htmlPanelMode, setHtmlPanelMode] = useState<"general" | "kurly">("general");
  const images = task.images ?? [];
  const activeImages = htmlPanelMode === "general" ? images : images.filter((image) => !image.excludeFromKurly);
  const activeHtml = generateGeneralHtml(activeImages);
  const displayedHtmlLinks = htmlMode === "html" ? activeHtml.split("\n").filter(Boolean) : activeImages.map((image) => image.url);
  useEffect(() => { setHtmlMode("html"); setHtmlPanelMode("general"); }, [task.id, task.item, task.product]);
  return <aside className="detail-panel saved-detail-panel">
    <div className="detail-tabs"><button className="active">제품 정보</button><span /><button className="edit" onClick={onEdit}>편집</button><button className="close" aria-label="상세 패널 닫기" onClick={onClose}><X {...iconProps} /></button></div>
    <div className="detail-body">
      <div className="info-grid"><span>제품명</span><b>{task.product}</b><span>품목</span><b>{task.item}</b><span>거래처</span><b>{task.vendors?.join(", ") || "-"}</b><span>링크</span>{task.storeLink ? <a href={task.storeLink} target="_blank" rel="noopener noreferrer">열기</a> : <b>-</b>}<span>참고사항</span><b className="wide">{task.note || "-"}</b></div>
      <section className="detail-section html-section"><div className="section-title"><div className="html-section-heading"><h3>HTML 링크</h3><span className="html-mode-tabs"><button type="button" className={htmlPanelMode === "general" ? "active" : ""} onClick={() => { setHtmlPanelMode("general"); setHtmlMode("html"); }}>기본</button><button type="button" className={htmlPanelMode === "kurly" ? "active" : ""} onClick={() => { setHtmlPanelMode("kurly"); setHtmlMode("html"); }}>컬리용</button></span></div><span className="html-link-actions"><button type="button" className="html-view-toggle" title={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} aria-label={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} onClick={() => setHtmlMode((current) => current === "html" ? "url" : "html")}><ArrowLeftRight {...iconProps} /></button><button type="button" className="copy-action" title="현재 내용 복사" aria-label="현재 내용 복사" onClick={() => void copyText(displayedHtmlLinks.join("\n"))}><Copy {...iconProps} /></button></span></div><div className="code-box">{displayedHtmlLinks.map((link, index) => <p key={`${htmlPanelMode}-${htmlMode}-${index}-${link}`}>{htmlMode === "url" ? <a href={link} target="_blank" rel="noopener noreferrer">{link}</a> : link}</p>)}</div></section>
      <section className="detail-section paths"><h3>NAS 경로</h3><PathRow label="썸네일" value={task.thumbnailNas} /><PathRow label="상세페이지" value={task.detailNas} /></section>
    </div>
  </aside>;
}

function PathRow({ label, value }: { label: string; value: string }) {
  return <div className="path-row"><label>{label}</label><div>{value}</div><button type="button" aria-label={`${label} 경로 복사`} onClick={() => void copyText(value)}><Copy className="copy-icon" {...iconProps} /> 복사</button></div>;
}

type TaskDraftValues = { product: string; item: string; storeLink: string; note: string; thumbnailNas: string; detailNas: string };

function TaskModal({ step, onClose, onNext, onSave, initialTask }: { step: 1 | 2; onClose: () => void; onNext: () => void; onSave: (draft: TaskDraftValues & { images: ImageAsset[] }) => void; initialTask?: DetailTask | null }) {
  const [images, setImages] = useState<ImageAsset[]>(() => initialTask?.images ?? []);
  const [draft, setDraft] = useState<TaskDraftValues>(() => ({ product: initialTask?.product ?? "", item: initialTask?.item ?? "", storeLink: "", note: "", thumbnailNas: initialTask?.thumbnailNas ?? "", detailNas: initialTask?.detailNas ?? "" }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [fileDragActive, setFileDragActive] = useState(false);
  const generalHtml = useMemo(() => generateGeneralHtml(images), [images]);
  const kurlyImages = useMemo(() => images.filter((image) => !image.excludeFromKurly), [images]);
  const sortImages = (items: ImageAsset[]) => [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file, index) => ({ id: `${file.name}-${file.lastModified}-${index}`, name: file.name, url: URL.createObjectURL(file), mimeType: file.type || "image/*", size: file.size, excludeFromKurly: false }));
    setImages((current) => sortImages([...current, ...next]));
  };
  const removeImage = (id: string) => setImages((current) => current.filter((image) => image.id !== id));
  const toggleKurlyExclusion = (id: string) => setImages((current) => current.map((image) => image.id === id ? { ...image, excludeFromKurly: !image.excludeFromKurly } : image));
  const moveImage = (fromId: string, toId: string) => setImages((current) => { const from = current.findIndex((image) => image.id === fromId); const to = current.findIndex((image) => image.id === toId); if (from < 0 || to < 0 || from === to) return current; const next = [...current]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next; });
  return <div className="modal-backdrop" role="presentation"><section className={`modal ${step === 1 ? "compact" : "wide"}`} role="dialog" aria-modal="true" aria-label="새 작업 생성">
    <header><h2><Plus {...iconProps} /> 새 작업 생성</h2><div><button className="cancel" onClick={onClose}>취소</button>{step === 1 ? <button className="primary" onClick={onNext}>HTML 생성 <ArrowRight {...iconProps} /></button> : <button className="primary" onClick={() => { onSave({ ...draft, images }); onClose(); }}>저장 <ArrowRight {...iconProps} /></button>}</div></header>
    {step === 1 ? <div className="step-one">
      <section><h3>기본 정보 입력</h3><Field label="제품명" value={draft.product} onChange={(value) => setDraft((current) => ({ ...current, product: value }))} /><ItemSelectField value={draft.item} onChange={(value) => setDraft((current) => ({ ...current, item: value }))} /><Field label="자사몰 링크" value={draft.storeLink} onChange={(value) => setDraft((current) => ({ ...current, storeLink: value }))} /><div className="vendor-field"><label>거래처</label><div><button>자사몰 ONLY</button><button>오집 ONLY</button><button>퀸잇 ONLY</button><button>네이버 ONLY</button></div></div><Field label="참고사항" value={draft.note} onChange={(value) => setDraft((current) => ({ ...current, note: value }))} /></section>
      <section className="nas-form"><h3>NAS 경로 입력</h3><TextArea label="썸네일 NAS 경로" value={draft.thumbnailNas} onChange={(value) => setDraft((current) => ({ ...current, thumbnailNas: value }))} /><TextArea label="상세페이지 NAS 경로" value={draft.detailNas} onChange={(value) => setDraft((current) => ({ ...current, detailNas: value }))} /></section>
    </div> : <div className="step-two">
      <section className="upload-side" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setFileDragActive(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFileDragActive(false); }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); addFiles(event.dataTransfer.files); setFileDragActive(false); } }}><h3><i>1</i> 이미지 업로드</h3><label>이미지 목록</label><input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /><button className={`dropzone ${fileDragActive ? "drag-active" : ""}`} type="button" onClick={() => fileInputRef.current?.click()}><ImagePlus {...iconProps} /><strong>{fileDragActive ? "여기에 놓아 업로드" : "이미지 업로드 영역"}</strong><span>이미지 파일을 선택하거나 끌어다 놓으세요.</span></button><div className="image-list">{images.map((image) => <div className={`file ${draggedId === image.id ? "dragging" : ""} ${dragOverId === image.id && draggedId !== image.id ? "drag-over" : ""}`} key={image.id} draggable onDragStart={() => setDraggedId(image.id)} onDragEnter={() => { if (draggedId && draggedId !== image.id && dragOverId !== image.id) moveImage(draggedId, image.id); setDragOverId(image.id); }} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.preventDefault(); setDraggedId(null); setDragOverId(null); }} onDragEnd={() => { setDraggedId(null); setDragOverId(null); }}><span className="drag-handle" aria-hidden="true">⋮⋮</span><img className="thumb" src={image.url} alt="" /><div className="file-meta"><b>{image.name}</b><small>{(image.mimeType || "image/jpeg").split("/").pop()?.toUpperCase()} · {formatBytes(image.size ?? 1_200_000)}</small></div><div className="file-actions"><label className="kurly-exclude"><input type="checkbox" checked={Boolean(image.excludeFromKurly)} onChange={() => toggleKurlyExclusion(image.id)} aria-label={`${image.name} 컬리 HTML에서 제외`} /><span>컬리 제외</span></label><button className="delete-file" type="button" aria-label={`${image.name} 삭제`} onClick={() => removeImage(image.id)}><Trash2 {...iconProps} /></button></div></div>)}</div></section>
      <section className="preview-side"><h3><i>2</i> 이미지 미리보기</h3><div className="preview-grid"><div className="preview-box"><div className="preview-box-title">HTML 미리보기</div><div className="preview-canvas"><div className="preview-strip">{images.map((image) => <div className="preview-placeholder" key={image.id}><img src={image.url} alt={image.name} /></div>)}</div></div></div><div className="preview-box kurly-preview-box"><div className="preview-box-title">컬리 HTML 미리보기</div><div className="preview-canvas"><div className="preview-strip">{kurlyImages.map((image) => <div className="preview-placeholder" key={image.id}><img src={image.url} alt={image.name} /></div>)}</div>{kurlyImages.length === 0 && <div className="preview-empty">표시할 이미지가 없습니다.</div>}</div></div></div></section>
    </div>}
  </section></div>;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function Field({ label, placeholder, select, value, onChange }: { label: string; placeholder?: string; select?: boolean; value?: string; onChange?: (value: string) => void }) {
  return <label className="field"><span>{label}</span><div><input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} />{select && <ChevronDown {...iconProps} />}</div></label>;
}
function TextArea({ label, value, onChange }: { label: string; value?: string; onChange?: (value: string) => void }) { return <label className="field"><span>{label}</span><textarea value={value} onChange={(event) => onChange?.(event.target.value)} /></label>; }

const ITEM_OPTIONS = ["차렵이불", "베개커버", "패드", "이불커버", "매트리스커버", "토퍼", "쿠션", "담요"];

function ItemSelectField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const filtered = ITEM_OPTIONS.filter((item) => !value || item.includes(value));
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !fieldRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return <label className="field item-select-field"><span>품목</span><div ref={fieldRef} className="item-select-control"><Search className="field-search" {...iconProps} /><input value={value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} placeholder="품목명을 검색하거나 선택하세요" aria-label="품목 검색" aria-expanded={open} /><ChevronDown {...iconProps} />{open && <div className="item-select-menu" role="listbox">{filtered.length ? filtered.map((item) => <button type="button" key={item} role="option" onClick={() => { onChange(item); setOpen(false); }}>{item}</button>) : <span>검색 결과가 없습니다.</span>}</div>}</div></label>;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DetailTask | null>(null);
  const [modal, setModal] = useState<1 | 2 | null>(null);
  const [dataGroups, setDataGroups] = useState<AssetGroup[]>([]);
  const [editingTask, setEditingTask] = useState<DetailTask | null>(null);
  const [selectedBrand, setSelectedBrand] = useState<BrandKey>("amante");
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [shareMode, setShareMode] = useState(false);
  const [shareSelection, setShareSelection] = useState<Set<string>>(() => new Set());
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const activeBrand = BRANDS.find((brand) => brand.key === selectedBrand) ?? BRANDS[0];
  const allTasks = useMemo(() => dataGroups.flatMap((group) => group.items ?? []), [dataGroups]);
  const shownGroups = useMemo(() => dataGroups.filter(({ product, items }) => !query || `${product} ${items?.map((item) => item.item).join(" ") ?? ""}`.toLowerCase().includes(query.toLowerCase())), [dataGroups, query]);
  const changeBrand = (brandKey: BrandKey) => { setSelectedBrand(brandKey); setBrandMenuOpen(false); setSelected(null); setQuery(""); setDataGroups([]); setShareMode(false); setShareSelection(new Set()); setShareMessage(""); };
  const enterShareMode = () => { setSelected(null); setBrandMenuOpen(false); setShareMode(true); setShareSelection(new Set()); setShareMessage(""); };
  const toggleShareTask = (task: DetailTask) => { const id = taskKey(task); setShareSelection((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const finishShareMode = () => { setShareMode(false); setShareSelection(new Set()); setShareMessage(""); setSelected(null); };
  const createShareLink = async () => {
    if (!shareMode) { enterShareMode(); return; }
    if (!shareSelection.size) { finishShareMode(); return; }
    setShareBusy(true); setShareMessage("");
    try {
      const selectedTasks = allTasks.filter((task) => shareSelection.has(taskKey(task)));
      const response = await fetch("/api/shares", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tasks: selectedTasks }) });
      if (!response.ok) throw new Error("공유 링크를 만들지 못했습니다.");
      const payload = await response.json() as { shareUrl?: string };
      if (!payload.shareUrl) throw new Error("공유 링크가 없습니다.");
      const shareUrl = new URL(payload.shareUrl, window.location.origin).toString();
      await copyText(shareUrl);
      finishShareMode();
      setShareMessage("공유 링크가 복사되었습니다.");
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "공유 링크를 만들지 못했습니다.");
    } finally { setShareBusy(false); }
  };
  useEffect(() => {
    let cancelled = false;
    const load = fetch(`/api/tasks?brandKey=${selectedBrand}`).then(async (response) => { if (!response.ok) throw new Error("Supabase API unavailable"); return response.json(); }).catch(() => fetch("/data/tasks.json").then((response) => response.json()));
    load.then((payload: { tasks?: Array<{ id: string; brandKey: BrandKey; productName: string; itemName: string; detailHtml?: string; images?: ImageAsset[]; storeLink?: string; vendors?: string[]; note?: string; thumbnailNas: string; detailNas: string }> }) => {
      const tasks = payload.tasks?.filter((task) => task.brandKey === selectedBrand);
      if (cancelled || !tasks?.length) return;
      const grouped = new Map<string, DetailTask[]>();
      tasks.forEach((task) => { const item: DetailTask = { id: task.id, brandKey: task.brandKey, product: task.productName, item: task.itemName, html: task.detailHtml || generateGeneralHtml(task.images ?? []), storeLink: task.storeLink, vendors: task.vendors, note: task.note, images: task.images, thumbnailNas: task.thumbnailNas, detailNas: task.detailNas }; const entries = grouped.get(item.product) ?? []; entries.push(item); grouped.set(item.product, entries); });
      if (!cancelled) setDataGroups([...grouped.entries()].map(([product, items]) => ({ product, count: items.length, items })));
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [selectedBrand]);
  useEffect(() => {
    if (!selected) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("tr, .detail-panel, .app-header, .modal-backdrop")) setSelected(null);
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    return () => document.removeEventListener("pointerdown", closeOnOutside, true);
  }, [selected]);
  return <main className={modal ? "modal-open" : undefined}>
    <header className="app-header"><div className="brand-heading"><div className="brand-switcher"><button className={`brand-avatar ${selectedBrand}`} aria-label={`${activeBrand.name} 브랜드 변경`} aria-expanded={brandMenuOpen && !modal} onClick={() => setBrandMenuOpen((current) => !current)}><img src={activeBrand.image} alt="" /><ChevronDown {...iconProps} /></button>{brandMenuOpen && !modal && <div className="brand-menu">{BRANDS.map((brand) => <button key={brand.key} className={brand.key === selectedBrand ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); changeBrand(brand.key); }} onClick={() => changeBrand(brand.key)}><span className={`brand-option-avatar ${brand.key}`}><img src={brand.image} alt="" /></span><b>{brand.name}</b></button>)}</div>}</div><div className="app-title"><h1>Detail Page Asset Manager</h1><p>상세페이지 URL과 NAS 경로를 한 곳에서 관리하세요.</p></div></div><div className="actions"><label className="search"><Search {...iconProps} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제품명, 품목, 경로 검색" aria-label="검색" /></label><button className="new-task" onClick={() => { setBrandMenuOpen(false); setEditingTask(null); setSelected(null); setShareMode(false); setShareSelection(new Set()); setModal(1); }}><Plus {...iconProps} /><b>새 작업 등록</b></button></div></header>
    <div className={`workspace ${selected ? "with-detail" : ""}`}><section className="table-shell"><div className="table-scroll"><table><colgroup><col className="c-name"/><col className="c-type"/><col className="c-link"/><col className="c-html"/><col className="c-nas"/><col className="c-nas"/><col className="c-note"/></colgroup><thead><tr><th>제품명</th><th>품목</th><th>링크</th><th>HTML / URL</th><th>썸네일 NAS</th><th>상세페이지 NAS</th><th>참고사항</th></tr></thead><tbody>{shownGroups.map((group, index) => <GroupRows group={group} key={group.product} onSelect={setSelected} shareMode={shareMode} selectedIds={shareSelection} onToggleShare={toggleShareTask} tone={index % 2} />)}</tbody></table></div><footer><span>제품 {dataGroups.length}개 · 품목 {dataGroups.reduce((total, group) => total + (group.items?.length ?? 0), 0)}개</span>{shareMessage && <span className="share-message" role="status">{shareMessage}</span>}<button type="button" className={`share-button ${shareMode ? "selecting" : ""}`} disabled={shareBusy} onClick={() => void createShareLink()}><Share2 {...iconProps} /><span>{shareBusy ? "링크 생성 중..." : shareMode && shareSelection.size ? `링크 복사 (${shareSelection.size})` : "공유하기"}</span></button></footer></section>{selected && !shareMode && <DetailPanel task={selected} onClose={() => setSelected(null)} onEdit={() => { setEditingTask(selected); setModal(1); }} />}</div>
    {modal && <TaskModal step={modal} initialTask={editingTask} onClose={() => { setModal(null); setEditingTask(null); }} onNext={() => setModal(2)} onSave={(draft) => { const payload = { brandKey: selectedBrand, id: editingTask?.id, productName: draft.product || "새 작업", itemName: draft.item || "미분류", storeLink: draft.storeLink, note: draft.note, thumbnailNas: draft.thumbnailNas, detailNas: draft.detailNas, images: draft.images, detailHtml: generateGeneralHtml(draft.images) }; void fetch(editingTask?.id ? `/api/tasks?id=${encodeURIComponent(editingTask.id)}` : "/api/tasks", { method: editingTask?.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: payload }) }).then(() => window.location.reload()).catch(() => undefined); }} />}
  </main>;
}

function GroupRows({ group, onSelect, shareMode, selectedIds, onToggleShare, tone }: { group: AssetGroup; onSelect: (task: DetailTask) => void; shareMode: boolean; selectedIds: Set<string>; onToggleShare: (task: DetailTask) => void; tone: number }) {
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = () => setExpanded((current) => !current);
  return <><tr className={`product-row tone-${tone}`} onClick={toggleExpanded}><td><button className="expand" aria-label={`${group.product} 하위 품목 ${expanded ? "접기" : "펼치기"}`} onClick={(event) => { event.stopPropagation(); toggleExpanded(); }}>{expanded ? <ChevronDown {...iconProps} /> : <ChevronRight {...iconProps} />}</button><b>{group.product}</b></td><td><span className="count">{group.count}개</span></td><td></td><td></td><td></td><td></td><td></td></tr>{expanded && group.items?.map((item) => { const isSelected = selectedIds.has(taskKey(item)); return <tr className={`item-row ${shareMode && isSelected ? "share-selected" : ""} ${shareMode ? "share-selectable" : ""}`} key={taskKey(item)} onClick={() => shareMode ? onToggleShare(item) : onSelect(item)}><td>{item.product}</td><td>{item.item}</td><td></td><td><CellCopy value={`${item.html} ...`} disabled={shareMode} /></td><td><CellCopy value={item.thumbnailNas} disabled={shareMode} /></td><td><CellCopy value={item.detailNas} disabled={shareMode} /></td><td></td></tr>; })}</>;
}
