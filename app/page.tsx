"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { ArrowLeftRight, ArrowRight, Check, ChevronDown, ChevronRight, Copy, ExternalLink, ImagePlus, Plus, Search, Share2, Trash2, X } from "lucide-react";
import { generateGeneralHtml, generateKurlyHtml, withPreviewImageVersion } from "./lib/html";
import { productGroupLabel } from "./lib/product-grouping";
import { getImageHtmlTarget, imagesForHtmlTarget } from "./lib/image-target";
import type { AssetImage, ImageHtmlTarget } from "./lib/task-types";
import { ImageTargetSelect } from "./components/ImageTargetSelect";
import { HtmlCodeDrawer } from "./components/HtmlCodeDrawer";
import { matchesTaskSearch, normalizeSearch } from "./lib/task-search";
import { mergeSavedTask } from "./lib/task-state";
import { reorderByDrop, type DropPosition } from "./lib/image-order";
import { dragAutoScrollVelocity, DRAG_SCROLL_HORIZONTAL_TOLERANCE, DRAG_SCROLL_VERTICAL_TOLERANCE } from "./lib/drag-auto-scroll";
import { createHtmlPreviewPayload, HTML_PREVIEW_STORAGE_KEY, HTML_PREVIEW_WINDOW_NAME, type HtmlPreviewMode } from "./lib/html-preview";

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
  shootingNas: string;
  images?: ImageAsset[];
  kurlyEnabled?: boolean;
};

type RowContextMenu = { task: DetailTask; x: number; y: number };

type ImageAsset = AssetImage;
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

function brandFromLocation(): BrandKey {
  if (typeof window === "undefined") return "amante";
  const brandKey = new URLSearchParams(window.location.search).get("brand");
  return BRANDS.some((brand) => brand.key === brandKey) ? brandKey as BrandKey : "amante";
}

function writeBrandToLocation(brandKey: BrandKey) {
  const url = new URL(window.location.href);
  if (brandKey === "amante") url.searchParams.delete("brand");
  else url.searchParams.set("brand", brandKey);
  window.history.replaceState(null, "", url);
}

function subscribeToBrandLocation(onStoreChange: () => void) {
  window.addEventListener("popstate", onStoreChange);
  return () => window.removeEventListener("popstate", onStoreChange);
}

function serverBrandSnapshot(): BrandKey {
  return "amante";
}

const iconProps = { size: 16, strokeWidth: 1.75, "aria-hidden": true } as const;
const VENDOR_OPTIONS = ["컬리 ONLY", "오집 ONLY", "퀸잇 ONLY", "네이버 ONLY"] as const;

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
  const hasValue = Boolean(value.trim());
  return <div className={`cell-copy ${disabled ? "is-disabled" : ""}`}><span>{hasValue ? value : ""}</span>{hasValue && <button className="copy-cell-button" type="button" disabled={disabled} aria-disabled={disabled} aria-label="셀 내용 복사" onPointerDown={(event) => event.stopPropagation()} onClick={(event) => { event.stopPropagation(); if (!disabled) void copyText(value).then(() => window.dispatchEvent(new Event("asset-cell-copied"))); }}><Copy {...iconProps} /></button>}</div>;
}

function DetailPanel({ task, onClose, onEdit, closing }: { task: DetailTask; onClose: () => void; onEdit: () => void; closing?: boolean }) {
  const [htmlMode, setHtmlMode] = useState<"html" | "url">("html");
  const [htmlPanelMode, setHtmlPanelMode] = useState<"general" | "kurly">("general");
  const [toastMessage, setToastMessage] = useState("");
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const images = task.images ?? [];
  const activeHtml = htmlPanelMode === "general" ? task.html || generateGeneralHtml(images, task.brandKey) : generateKurlyHtml(images, task.brandKey, task.kurlyEnabled !== false);
  const displayedHtmlLinks = htmlMode === "html" ? activeHtml.split("\n").filter(Boolean) : [...activeHtml.matchAll(/<img\s+src=['"]([^'"]+)['"]/g)].map((match) => match[1]);
  useEffect(() => { setHtmlMode("html"); setHtmlPanelMode("general"); }, [task.id, task.item, task.product]);
  useEffect(() => () => { if (toastTimerRef.current) clearTimeout(toastTimerRef.current); }, []);
  const showToast = (message: string) => {
    setToastMessage(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToastMessage(""), 1800);
  };
  const copyPanelText = async (value: string) => { await copyText(value); showToast("복사되었습니다."); };
  return <aside className={`detail-panel saved-detail-panel${closing ? " is-closing" : ""}`}>
    <div className="detail-tabs"><button className="active">제품 정보</button><span /><button className="edit" onClick={onEdit}>편집</button><button className="close" aria-label="상세 패널 닫기" onClick={onClose}><X {...iconProps} /></button></div>
    <div className="detail-body">
      <div className="info-grid"><span>제품명</span><b>{task.product}</b><span>품목</span><b>{task.item}</b><span>거래처</span><b className="vendor-badges">{task.vendors?.length ? task.vendors.map((vendor) => <span className={`vendor-badge ${vendorClass(vendor)}`} key={vendor}>{vendor}</span>) : "-"}</b><span>링크</span>{task.storeLink ? <a href={task.storeLink} target="_blank" rel="noopener noreferrer">열기</a> : <b>-</b>}<span>참고사항</span><b className="wide">{task.note || "-"}</b></div>
      <section className="detail-section html-section"><div className="section-title"><div className="html-section-heading"><h3>HTML 링크</h3><span className="html-mode-tabs"><button type="button" className={htmlPanelMode === "general" ? "active" : ""} onClick={() => { setHtmlPanelMode("general"); setHtmlMode("html"); }}>기본</button><button type="button" disabled={task.kurlyEnabled === false} className={htmlPanelMode === "kurly" ? "active" : ""} onClick={() => { setHtmlPanelMode("kurly"); setHtmlMode("html"); }}>컬리용</button></span></div><span className="html-link-actions"><button type="button" className="html-view-toggle" data-tooltip={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} title={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} aria-label={htmlMode === "html" ? "URL로 전환" : "HTML로 전환"} onClick={() => setHtmlMode((current) => current === "html" ? "url" : "html")}><ArrowLeftRight {...iconProps} /></button><button type="button" className="copy-action" data-tooltip="현재 내용 복사" title="현재 내용 복사" aria-label="현재 내용 복사" disabled={!activeHtml.trim()} onClick={() => void copyPanelText(displayedHtmlLinks.join("\n"))}><Copy {...iconProps} /></button></span></div><div className="code-box">{displayedHtmlLinks.map((link, index) => <p key={`${htmlPanelMode}-${htmlMode}-${index}-${link}`}>{htmlMode === "url" ? <a href={link} target="_blank" rel="noopener noreferrer">{link}</a> : link}</p>)}</div></section>
      <section className="detail-section paths"><h3>NAS 경로</h3><PathRow label="썸네일" value={task.thumbnailNas} onCopied={showToast} /><PathRow label="상세페이지" value={task.detailNas} onCopied={showToast} /><PathRow label="촬영본" value={task.shootingNas} onCopied={showToast} /></section>
    </div>
    {toastMessage && <div className="detail-copy-toast" role="status">{toastMessage}</div>}
  </aside>;
}

function PathRow({ label, value, onCopied }: { label: string; value: string; onCopied: (message: string) => void }) {
  const hasValue = Boolean(value.trim());
  return <div className="path-row"><label>{label}</label><div>{value}</div>{hasValue && <button type="button" data-tooltip={`${label} 경로 복사`} aria-label={`${label} 경로 복사`} onClick={() => void copyText(value).then(() => onCopied("복사되었습니다."))}><Copy className="copy-icon" {...iconProps} /> 복사</button>}</div>;
}

type TaskDraftValues = { kurlyEnabled: boolean; product: string; item: string; storeLink: string; note: string; thumbnailNas: string; detailNas: string; shootingNas: string; vendors: string[]; detailHtml: string };

const DEFAULT_BRAND_IMAGE: ImageAsset = {
  id: "default-amante-brand-image",
  name: "amante_brand_image.jpg",
  url: "https://img.amante.co.kr/images/ani_img/amante_brand_image.jpg",
  mimeType: "image/jpeg",
};

function DiscardChangesDialog({ onKeep, onDiscard }: { onKeep: () => void; onDiscard: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="discard-changes-dialog" aria-labelledby="discard-title" aria-describedby="discard-description"
    onCancel={(event) => { event.preventDefault(); onKeep(); }}>
    <h2 id="discard-title">저장하지 않은 변경사항을 버릴까요?</h2>
    <p id="discard-description">이번에 입력하거나 수정한 내용만 사라집니다. 기존에 저장된 자산은 유지됩니다.</p>
    <div><button type="button" className="modal-action modal-action-secondary" autoFocus onClick={onKeep}>계속 편집</button>
      <button type="button" className="modal-action modal-action-primary" onClick={onDiscard}>변경사항 버리기</button></div>
  </dialog>;
}

function OverwriteTaskDialog({ product, item, onCancel, onOverwrite }: { product: string; item: string; onCancel: () => void; onOverwrite: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => { const dialog = ref.current; dialog?.showModal(); return () => dialog?.close(); }, []);
  return <dialog ref={ref} className="discard-changes-dialog" aria-labelledby="overwrite-title" aria-describedby="overwrite-description"
    onCancel={(event) => { event.preventDefault(); onCancel(); }}>
    <h2 id="overwrite-title">동일한 작업이 이미 있습니다.</h2>
    <p id="overwrite-description"><strong>{product} · {item}</strong>의 기존 내용을 새 내용으로 덮어쓰시겠습니까?</p>
    <div><button type="button" className="modal-action modal-action-secondary" autoFocus onClick={onCancel}>계속 편집</button>
      <button type="button" className="modal-action modal-action-primary" onClick={onOverwrite}>덮어쓰기</button></div>
  </dialog>;
}

type SaveResult = "saved" | "duplicate" | "failed";

function TaskModal({ step, brandKey, onClose, onNext, onSave, initialTask }: { step: 1 | 2; brandKey: BrandKey; onClose: () => void; onNext: () => void; onSave: (draft: TaskDraftValues & { images: ImageAsset[] }, overwrite: boolean) => Promise<SaveResult>; initialTask?: DetailTask | null }) {
  const [images, setImages] = useState<ImageAsset[]>(() => initialTask ? initialTask.images ?? [] : brandKey === "amante" ? [DEFAULT_BRAND_IMAGE] : []);
  const [draft, setDraft] = useState<TaskDraftValues>(() => ({ kurlyEnabled: initialTask?.kurlyEnabled !== false, product: initialTask?.product ?? "", item: initialTask?.item ?? "", storeLink: initialTask?.storeLink ?? "", note: initialTask?.note ?? "", thumbnailNas: initialTask?.thumbnailNas ?? "", detailNas: initialTask?.detailNas ?? "", shootingNas: initialTask?.shootingNas ?? "", vendors: initialTask?.vendors ?? [], detailHtml: initialTask?.html ?? "" }));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageListRef = useRef<HTMLDivElement>(null);
  const dragScrollFrameRef = useRef<number | null>(null);
  const dragScrollLastFrameTimeRef = useRef<number | null>(null);
  const dragScrollVelocityRef = useRef(0);
  const htmlPreviewWindowRef = useRef<Window | null>(null);
  const htmlPreviewModeRef = useRef<HtmlPreviewMode | null>(null);
  const htmlPreviewVersionRef = useRef(Date.now());
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<DropPosition>("before");
  const [fileDragActive, setFileDragActive] = useState(false);
  const [htmlPreviewError, setHtmlPreviewError] = useState("");
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [confirmOverwrite, setConfirmOverwrite] = useState(false);
  const [initialValues] = useState(() => JSON.stringify({ draft, images }));
  const dirty = useMemo(() => JSON.stringify({ draft, images }) !== initialValues, [draft, images, initialValues]);
  const requestClose = () => { if (!savingRef.current) { if (dirty) setConfirmDiscard(true); else onClose(); } };
  useEffect(() => {
    if (!dirty && !saving) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty, saving]);
  const stopDragAutoScroll = useCallback(() => {
    dragScrollVelocityRef.current = 0;
    if (dragScrollFrameRef.current !== null) cancelAnimationFrame(dragScrollFrameRef.current);
    dragScrollFrameRef.current = null;
    dragScrollLastFrameTimeRef.current = null;
  }, []);
  const updateDragAutoScroll = useCallback((clientX: number, clientY: number) => {
    const list = imageListRef.current;
    if (!list) {
      stopDragAutoScroll();
      return false;
    }

    const bounds = list.getBoundingClientRect();
    const withinHorizontalRange = clientX >= bounds.left - DRAG_SCROLL_HORIZONTAL_TOLERANCE && clientX <= bounds.right + DRAG_SCROLL_HORIZONTAL_TOLERANCE;
    const withinVerticalRange = clientY >= bounds.top - DRAG_SCROLL_VERTICAL_TOLERANCE && clientY <= bounds.bottom + DRAG_SCROLL_VERTICAL_TOLERANCE;
    if (!withinHorizontalRange || !withinVerticalRange) {
      stopDragAutoScroll();
      return false;
    }
    const velocity = dragAutoScrollVelocity(clientY, bounds.top, bounds.bottom);
    dragScrollVelocityRef.current = velocity;
    if (velocity === 0) {
      stopDragAutoScroll();
      return true;
    }
    if (dragScrollFrameRef.current !== null) return true;

    const scrollFrame = (timestamp: number) => {
      const currentList = imageListRef.current;
      const currentVelocity = dragScrollVelocityRef.current;
      if (!currentList || currentVelocity === 0) {
        dragScrollFrameRef.current = null;
        return;
      }
      const previousTimestamp = dragScrollLastFrameTimeRef.current;
      const elapsedSeconds = previousTimestamp === null ? 1 / 60 : Math.min(0.032, (timestamp - previousTimestamp) / 1000);
      dragScrollLastFrameTimeRef.current = timestamp;
      const maxScrollTop = Math.max(0, currentList.scrollHeight - currentList.clientHeight);
      const nextScrollTop = Math.min(maxScrollTop, Math.max(0, currentList.scrollTop + currentVelocity * elapsedSeconds));
      if (nextScrollTop === currentList.scrollTop) {
        dragScrollFrameRef.current = null;
        dragScrollLastFrameTimeRef.current = null;
        return;
      }
      currentList.scrollTop = nextScrollTop;
      dragScrollFrameRef.current = requestAnimationFrame(scrollFrame);
    };
    dragScrollFrameRef.current = requestAnimationFrame(scrollFrame);
    return true;
  }, [stopDragAutoScroll]);
  useEffect(() => {
    if (!draggedId) {
      stopDragAutoScroll();
      return;
    }
    const followPointer = (event: DragEvent) => {
      if (updateDragAutoScroll(event.clientX, event.clientY)) event.preventDefault();
    };
    document.addEventListener("dragover", followPointer);
    return () => {
      document.removeEventListener("dragover", followPointer);
      stopDragAutoScroll();
    };
  }, [draggedId, stopDragAutoScroll, updateDragAutoScroll]);
  // This version is only used for <img> elements in this editor. It is never
  // included in the generated HTML that is saved, displayed, or copied.
  const [previewVersion, setPreviewVersion] = useState(() => Date.now());
  const generatedHtml = useMemo(() => generateGeneralHtml(images, brandKey), [images, brandKey]);
  // Preserve legacy stored HTML until the user actually changes the image list.
  const [preserveStoredHtml, setPreserveStoredHtml] = useState(Boolean(initialTask?.html));
  const generalHtml = preserveStoredHtml ? draft.detailHtml : generatedHtml;
  const generalImages = useMemo(() => imagesForHtmlTarget(images, "general"), [images]);
  const kurlyImages = useMemo(() => draft.kurlyEnabled ? imagesForHtmlTarget(images, "kurly") : [], [images, draft.kurlyEnabled]);
  const publishHtmlPreview = useCallback((mode: HtmlPreviewMode) => {
    const version = Math.max(Date.now(), htmlPreviewVersionRef.current + 1);
    htmlPreviewVersionRef.current = version;
    const previewImages = mode === "general" ? generalImages : kurlyImages;
    try {
      window.localStorage.setItem(HTML_PREVIEW_STORAGE_KEY, JSON.stringify(createHtmlPreviewPayload(mode, previewImages, version)));
      setHtmlPreviewError("");
      return true;
    } catch {
      setHtmlPreviewError("새 창 미리보기 데이터를 준비하지 못했습니다.");
      return false;
    }
  }, [generalImages, kurlyImages]);
  const openHtmlPreview = (mode: HtmlPreviewMode) => {
    htmlPreviewModeRef.current = mode;
    if (!publishHtmlPreview(mode)) return;
    let previewWindow = htmlPreviewWindowRef.current;
    if (!previewWindow || previewWindow.closed) {
      previewWindow = window.open("/html-preview", HTML_PREVIEW_WINDOW_NAME);
      htmlPreviewWindowRef.current = previewWindow;
    }
    if (!previewWindow) {
      setHtmlPreviewError("팝업이 차단되었습니다. 이 사이트의 팝업을 허용해 주세요.");
      return;
    }
    previewWindow.focus();
  };
  useEffect(() => {
    if (htmlPreviewModeRef.current) publishHtmlPreview(htmlPreviewModeRef.current);
  }, [publishHtmlPreview]);
  const refreshImagePreviews = () => setPreviewVersion((current) => current + 1);
  const sortImages = (items: ImageAsset[]) => [...items].sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" }));
  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const next = Array.from(files).map((file, index) => ({ id: `${file.name}-${file.lastModified}-${index}`, name: file.name, url: URL.createObjectURL(file), mimeType: file.type || "image/*", size: file.size, htmlTarget: "common" as const }));
    const batch = next.length > 1 ? sortImages(next) : next;
    setImages((current) => [...current, ...batch]);
    setPreserveStoredHtml(false);
    refreshImagePreviews();
  };
  const removeImage = (id: string) => { setImages((current) => current.filter((image) => image.id !== id)); setPreserveStoredHtml(false); refreshImagePreviews(); };
  const changeImageTarget = (id: string, htmlTarget: ImageHtmlTarget) => {
    const image = images.find((entry) => entry.id === id);
    if (!image || getImageHtmlTarget(image) === htmlTarget) return;
    setPreserveStoredHtml(false);
    setImages((current) => current.map((entry) => entry.id === id ? { ...entry, htmlTarget, excludeFromKurly: htmlTarget === "general" } : entry));
    refreshImagePreviews();
  };
  const toggleVendor = (vendor: string) => setDraft((current) => ({ ...current, vendors: current.vendors.includes(vendor) ? current.vendors.filter((item) => item !== vendor) : [...current.vendors, vendor] }));
  const moveImage = (fromId: string, toId: string, position: DropPosition) => {
    const next = reorderByDrop(images, fromId, toId, position);
    if (next === images) return;
    setPreserveStoredHtml(false);
    setImages(next);
  };
  const saveTask = async (overwrite = false) => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError("");
    try {
      const result = await onSave({ ...draft, detailHtml: generalHtml, images }, overwrite);
      if (result === "saved") onClose();
      else if (result === "duplicate") setConfirmOverwrite(true);
      else setSaveError("저장하지 못했습니다. 입력 내용은 유지되어 있으니 다시 시도해 주세요.");
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장하지 못했습니다. 다시 시도해 주세요.");
    } finally { savingRef.current = false; setSaving(false); }
  };
  return <div className="modal-backdrop" role="presentation"><section className={`modal ${step === 1 ? "compact" : "wide"}`} role="dialog" aria-modal="true" aria-label="새 작업 생성">
    <header><h2><Plus {...iconProps} /> {initialTask ? "작업 편집" : "새 작업 생성"}</h2><div className="modal-actions"><button className="modal-action modal-action-secondary" disabled={saving} onClick={requestClose}>취소 <X {...iconProps} /></button>{step === 1 ? <><button className="modal-action modal-action-secondary" disabled={saving} onClick={onNext}>{initialTask ? "HTML 편집" : "HTML 생성"} <ArrowRight {...iconProps} /></button>{initialTask && <button className="modal-action modal-action-primary" disabled={saving} onClick={() => void saveTask()}>{saving ? "저장 중..." : "저장"} <Check {...iconProps} /></button>}</> : <button className="modal-action modal-action-primary" disabled={saving} onClick={() => void saveTask()}>{saving ? "저장 중..." : "저장"} <Check {...iconProps} /></button>}</div></header>
    {step === 1 ? <div className="step-one">
      <section><h3>기본 정보 입력</h3><Field label="제품명" value={draft.product} onChange={(value) => setDraft((current) => ({ ...current, product: value }))} /><ItemSelectField brandKey={brandKey} value={draft.item} onChange={(value) => setDraft((current) => ({ ...current, item: value }))} /><Field label="자사몰 링크" value={draft.storeLink} onChange={(value) => setDraft((current) => ({ ...current, storeLink: value }))} /><div className="vendor-field"><label>거래처</label><div>{VENDOR_OPTIONS.map((vendor) => <button key={vendor} type="button" className={draft.vendors.includes(vendor) ? "active" : ""} aria-pressed={draft.vendors.includes(vendor)} onClick={() => toggleVendor(vendor)}>{vendor}</button>)}</div></div><Field label="참고사항" value={draft.note} onChange={(value) => setDraft((current) => ({ ...current, note: value }))} /></section>
      <section className="nas-form"><h3>NAS 경로 입력</h3><TextArea label="썸네일 NAS 경로" value={draft.thumbnailNas} onChange={(value) => setDraft((current) => ({ ...current, thumbnailNas: value }))} /><TextArea label="상세페이지 NAS 경로" value={draft.detailNas} onChange={(value) => setDraft((current) => ({ ...current, detailNas: value }))} /><TextArea label="촬영본 NAS 경로" value={draft.shootingNas} onChange={(value) => setDraft((current) => ({ ...current, shootingNas: value }))} /></section>
    </div> : <div className="step-two">
      <section className="upload-side" onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; setFileDragActive(true); } }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setFileDragActive(false); }} onDrop={(event) => { if (event.dataTransfer.files.length) { event.preventDefault(); addFiles(event.dataTransfer.files); setFileDragActive(false); } }}><h3><i>1</i> 이미지 업로드</h3><label>이미지 목록</label><input ref={fileInputRef} className="visually-hidden" type="file" accept="image/*" multiple onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /><button className={`dropzone ${fileDragActive ? "drag-active" : ""}`} type="button" onClick={() => fileInputRef.current?.click()}><ImagePlus {...iconProps} /><strong>{fileDragActive ? "여기에 놓아 업로드" : "이미지 업로드 영역"}</strong><span>이미지 파일을 선택하거나 끌어다 놓으세요.</span></button><div className="image-list" ref={imageListRef}>{images.map((image) => <div className={`file ${draggedId === image.id ? "dragging" : ""} ${dragOverId === image.id && draggedId !== image.id ? `drag-over-${dropPosition}` : ""}`} key={image.id} draggable onDragStart={(event) => { stopDragAutoScroll(); event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", image.id); setDraggedId(image.id); }} onDragOver={(event) => { if (!draggedId && !event.dataTransfer.types.includes("text/plain")) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; if (draggedId === image.id) { setDragOverId(null); return; } const bounds = event.currentTarget.getBoundingClientRect(); const nextPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"; setDragOverId((current) => current === image.id ? current : image.id); setDropPosition((current) => current === nextPosition ? current : nextPosition); }} onDrop={(event) => { if (event.dataTransfer.files.length) return; const sourceId = event.dataTransfer.getData("text/plain") || draggedId; if (!sourceId) return; event.preventDefault(); event.stopPropagation(); const bounds = event.currentTarget.getBoundingClientRect(); const finalPosition = event.clientY < bounds.top + bounds.height / 2 ? "before" : "after"; moveImage(sourceId, image.id, finalPosition); stopDragAutoScroll(); setDraggedId(null); setDragOverId(null); }} onDragEnd={() => { stopDragAutoScroll(); setDraggedId(null); setDragOverId(null); }}><span className="drag-handle" aria-hidden="true">⋮⋮</span><img className="thumb" src={withPreviewImageVersion(image.url, previewVersion)} alt="" draggable={false} /><div className="file-meta"><b title={image.name}>{image.name}</b>{imageMetadata(image) && <small>{imageMetadata(image)}</small>}</div><div className="file-actions"><ImageTargetSelect value={getImageHtmlTarget(image)} imageName={image.name} onChange={(target) => changeImageTarget(image.id, target)} /><button className="delete-file" type="button" aria-label={`${image.name} 삭제`} onClick={() => removeImage(image.id)}><Trash2 {...iconProps} /></button></div></div>)}</div></section>
      <section className="preview-side"><h3><i>2</i> 이미지 미리보기</h3>{htmlPreviewError && <p className="preview-window-error" role="alert">{htmlPreviewError}</p>}<div className="preview-grid"><div className="preview-box"><div className="preview-box-title"><span>HTML 미리보기</span><button type="button" onClick={() => openHtmlPreview("general")}><ExternalLink size={14} aria-hidden="true" />새 창 미리보기</button></div><div className="preview-canvas"><div className="preview-strip">{generalImages.map((image) => <div className="preview-placeholder" key={image.id}><img src={withPreviewImageVersion(image.url, previewVersion)} alt={image.name} /></div>)}</div>{generalImages.length === 0 && <div className="preview-empty">표시할 이미지가 없습니다.</div>}</div></div><div className={`preview-box kurly-preview-box${draft.kurlyEnabled ? "" : " is-disabled"}`}><div className="preview-box-title"><label className="kurly-preview-toggle"><input type="checkbox" checked={draft.kurlyEnabled} onChange={(event) => setDraft((current) => ({ ...current, kurlyEnabled: event.target.checked }))} />컬리 HTML 미리보기</label><button type="button" disabled={!draft.kurlyEnabled} onClick={() => openHtmlPreview("kurly")}><ExternalLink size={14} aria-hidden="true" />새 창 미리보기</button></div><div className="preview-canvas"><div className="preview-strip">{kurlyImages.map((image) => <div className="preview-placeholder" key={image.id}><img src={withPreviewImageVersion(image.url, previewVersion)} alt={image.name} /></div>)}</div>{kurlyImages.length === 0 && <div className="preview-empty" role="status">{draft.kurlyEnabled ? "표시할 이미지가 없습니다." : "컬리용 HTML 생성 안 함"}</div>}</div></div></div></section>
      <HtmlCodeDrawer generalHtml={generalHtml} kurlyHtml={generateKurlyHtml(images, brandKey, draft.kurlyEnabled)} kurlyEnabled={draft.kurlyEnabled}
        onCopy={copyText} />
    </div>}
    {saveError && <div className="modal-save-error" role="alert">{saveError}</div>}
  </section>{confirmDiscard && <DiscardChangesDialog onKeep={() => setConfirmDiscard(false)} onDiscard={onClose} />}
    {confirmOverwrite && <OverwriteTaskDialog product={draft.product || "새 작업"} item={draft.item || "미분류"} onCancel={() => setConfirmOverwrite(false)} onOverwrite={() => { setConfirmOverwrite(false); void saveTask(true); }} />}</div>;
}

function formatBytes(size: number) {
  if (size < 1024) return `${size} B`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function imageMetadata(image: ImageAsset) {
  const values = [image.mimeType?.split("/").pop()?.toUpperCase()];
  if (typeof image.size === "number") values.push(formatBytes(image.size));
  return values.filter(Boolean).join(" · ");
}

function Field({ label, placeholder, select, value, onChange }: { label: string; placeholder?: string; select?: boolean; value?: string; onChange?: (value: string) => void }) {
  return <label className="field"><span>{label}</span><div><input value={value} onChange={(event) => onChange?.(event.target.value)} placeholder={placeholder} />{select && <ChevronDown {...iconProps} />}</div></label>;
}
function TextArea({ label, value, onChange }: { label: string; value?: string; onChange?: (value: string) => void }) { return <label className="field"><span>{label}</span><textarea value={value} onChange={(event) => onChange?.(event.target.value)} /></label>; }

type ItemGroup = { label: string; items: string[] };

const AMANTE_IMBEDDING_ITEM_GROUPS: ItemGroup[] = [
  { label: "이불", items: ["차렵이불", "홑겹이불커버", "누빔이불커버", "냉감 여름이불", "냉감 홑이불", "극세사 차렵이불", "간절기 차렵이불", "자가발열 차렵이불"] },
  { label: "베개커버", items: ["2겹 베개커버", "자루 베개커버", "가로형 자루 베개커버", "밴딩 베개커버"] },
  { label: "패드/매트커버", items: ["침대패드", "냉감 침대패드", "극세사 침대패드", "홑겹 매트커버", "누빔 매트커버", "올인원 매트커버", "방수 매트커버"] },
  { label: "기타", items: ["토퍼", "소파패드", "바디필로우", "베개솜", "이불솜", "커튼", "담요", "냉감 토퍼", "이불 겸 패드"] },
];

const SERENDIMENT_ITEM_GROUPS: ItemGroup[] = [
  { label: "이불", items: ["차렵이불", "홑겹이불커버", "누빔이불커버", "냉감 여름이불", "냉감 홑이불", "극세사 차렵이불", "간절기 차렵이불", "자가발열 차렵이불"] },
  { label: "베개커버", items: ["2겹 베개커버", "자루 베개커버", "가로형 자루 베개커버", "밴딩 베개커버"] },
  { label: "패드/매트커버", items: ["침대패드", "냉감 침대패드", "극세사 침대패드", "홑겹매트커버", "누빔매트커버", "방수 매트커버"] },
  { label: "기타", items: ["토퍼", "소파패드", "바디필로우", "베개솜", "이불솜", "커튼", "냉감 토퍼", "이불 겸 패드"] },
];

const SOMMIER_ITEM_GROUPS: ItemGroup[] = [
  { label: "이불", items: ["차렵이불", "홑겹이불커버", "누빔이불커버", "냉감 여름이불", "냉감 홑이불", "극세사 차렵이불", "간절기 차렵이불", "자가발열 차렵이불"] },
  { label: "베개커버", items: ["2겹 베개커버", "자루 베개커버", "가로형 자루 베개커버", "밴딩 베개커버"] },
  { label: "패드/매트커버", items: ["침대패드", "냉감 침대패드", "극세사 침대패드", "홑겹매트커버", "누빔매트커버", "방수 매트커버"] },
  { label: "기타", items: ["토퍼", "소파패드", "바디필로우", "베개솜", "이불솜", "커튼", "냉감 토퍼", "이불 겸 패드"] },
];

const ITEM_GROUPS_BY_BRAND: Record<BrandKey, ItemGroup[]> = {
  amante: AMANTE_IMBEDDING_ITEM_GROUPS,
  imbedding: AMANTE_IMBEDDING_ITEM_GROUPS,
  serendiment: SERENDIMENT_ITEM_GROUPS,
  sommier: SOMMIER_ITEM_GROUPS,
};

function itemGroupsForBrand(brandKey: BrandKey) {
  return ITEM_GROUPS_BY_BRAND[brandKey];
}

function sortTasksByItemOrder(tasks: DetailTask[], brandKey: BrandKey) {
  const itemOrder = new Map<string, number>(itemGroupsForBrand(brandKey).flatMap((group) => group.items).map((item, index) => [item, index]));
  return [...tasks].sort((left, right) => {
    const leftOrder = itemOrder.get(left.item);
    const rightOrder = itemOrder.get(right.item);
    if (leftOrder !== undefined && rightOrder !== undefined) return leftOrder - rightOrder;
    if (leftOrder !== undefined) return -1;
    if (rightOrder !== undefined) return 1;
    return left.item.localeCompare(right.item, "ko-KR");
  });
}

const HANGUL_INITIALS = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];

function getHangulInitials(value: string) {
  return [...value].map((character) => {
    const code = character.charCodeAt(0) - 0xac00;
    return code >= 0 && code <= 11171 ? HANGUL_INITIALS[Math.floor(code / 588)] : character;
  }).join("");
}

function matchesItem(value: string, query: string) {
  const normalizedQuery = query.toLowerCase().replace(/\s+/g, "");
  if (!normalizedQuery) return true;
  const normalizedValue = value.toLowerCase().replace(/\s+/g, "");
  return normalizedValue.includes(normalizedQuery) || getHangulInitials(value).replace(/\s+/g, "").includes(normalizedQuery);
}

function ItemSelectField({ brandKey, value, onChange }: { brandKey: BrandKey; value: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const filteredGroups = itemGroupsForBrand(brandKey).map((group) => ({ ...group, items: group.items.filter((item) => matchesItem(item, value)) })).filter((group) => group.items.length > 0);
  useEffect(() => {
    const close = (event: PointerEvent) => { if (event.target instanceof Node && !fieldRef.current?.contains(event.target)) setOpen(false); };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, []);
  return <label className="field item-select-field"><span>품목</span><div ref={fieldRef} className="item-select-control"><Search className="field-search" {...iconProps} /><input value={value} onFocus={() => setOpen(true)} onChange={(event) => { onChange(event.target.value); setOpen(true); }} placeholder="품목명을 검색하거나 선택하세요" aria-label="품목 검색" aria-expanded={open} /><ChevronDown {...iconProps} />{open && <div className="item-select-menu" role="listbox">{filteredGroups.length ? filteredGroups.map((group) => <div className="item-select-group" key={group.label}><div className="item-select-group-label">[{group.label}]</div>{group.items.map((item) => <button type="button" key={item} role="option" onClick={() => { onChange(item); setOpen(false); }}>{item}</button>)}</div>) : <span>검색 결과가 없습니다.</span>}</div>}</div></label>;
}

export default function Home() {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<DetailTask | null>(null);
  const [detailClosing, setDetailClosing] = useState(false);
  const detailCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [modal, setModal] = useState<1 | 2 | null>(null);
  const [dataGroups, setDataGroups] = useState<AssetGroup[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [reloadKey, setReloadKey] = useState(0);
  const [editingTask, setEditingTask] = useState<DetailTask | null>(null);
  const selectedBrand = useSyncExternalStore(subscribeToBrandLocation, brandFromLocation, serverBrandSnapshot);
  const [brandMenuOpen, setBrandMenuOpen] = useState(false);
  const [shareMode, setShareMode] = useState(false);
  const [shareSelection, setShareSelection] = useState<Set<string>>(() => new Set());
  const [shareBusy, setShareBusy] = useState(false);
  const [shareMessage, setShareMessage] = useState("");
  const [tableToast, setTableToast] = useState("");
  const tableToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [rowContextMenu, setRowContextMenu] = useState<RowContextMenu | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<DetailTask | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const activeBrand = BRANDS.find((brand) => brand.key === selectedBrand) ?? BRANDS[0];
  const allTasks = useMemo(() => dataGroups.flatMap((group) => group.items ?? []), [dataGroups]);
  const searchActive = Boolean(normalizeSearch(query));
  const shownGroups = useMemo(() => {
    if (!normalizeSearch(query)) return dataGroups;
    return dataGroups.flatMap((group) => {
      const items = (group.items ?? []).filter((item) => matchesTaskSearch(item, query, group.product));
      return items.length ? [{ ...group, items, count: items.length }] : [];
    });
  }, [dataGroups, query]);
  const shownTaskCount = shownGroups.reduce((total, group) => total + (group.items?.length ?? 0), 0);
  const openDetail = (task: DetailTask) => {
    if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current);
    detailCloseTimerRef.current = null;
    setDetailClosing(false);
    setSelected(task);
  };
  const closeDetail = () => {
    if (!selected || detailClosing) return;
    setDetailClosing(true);
    detailCloseTimerRef.current = setTimeout(() => {
      setSelected(null);
      setDetailClosing(false);
      detailCloseTimerRef.current = null;
    }, 180);
  };
  useEffect(() => {
    document.body.dataset.brand = selectedBrand;
    return () => { delete document.body.dataset.brand; };
  }, [selectedBrand]);
  useEffect(() => () => { if (detailCloseTimerRef.current) clearTimeout(detailCloseTimerRef.current); }, []);
  useEffect(() => {
    const showToast = () => {
      setTableToast("복사되었습니다.");
      if (tableToastTimerRef.current) clearTimeout(tableToastTimerRef.current);
      tableToastTimerRef.current = setTimeout(() => setTableToast(""), 1800);
    };
    window.addEventListener("asset-cell-copied", showToast);
    return () => {
      window.removeEventListener("asset-cell-copied", showToast);
      if (tableToastTimerRef.current) clearTimeout(tableToastTimerRef.current);
    };
  }, []);
  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<RowContextMenu>).detail;
      if (detail) setRowContextMenu({ task: detail.task, x: Math.min(detail.x, window.innerWidth - 136), y: Math.min(detail.y, window.innerHeight - 52) });
    };
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Element && event.target.closest(".row-context-menu")) return;
      setRowContextMenu(null);
    };
    window.addEventListener("asset-row-context-menu", open);
    document.addEventListener("pointerdown", dismiss);
    return () => { window.removeEventListener("asset-row-context-menu", open); document.removeEventListener("pointerdown", dismiss); };
  }, []);
  const resetForBrand = () => { setBrandMenuOpen(false); setSelected(null); setQuery(""); setDataGroups([]); setLoadState("loading"); setShareMode(false); setShareSelection(new Set()); setShareMessage(""); };
  const changeBrand = (brandKey: BrandKey) => {
    if (brandKey === selectedBrand) { setBrandMenuOpen(false); return; }
    writeBrandToLocation(brandKey); resetForBrand(); window.dispatchEvent(new PopStateEvent("popstate"));
  };
  const enterShareMode = () => { setSelected(null); setBrandMenuOpen(false); setShareMode(true); setShareSelection(new Set()); setShareMessage(""); };
  const handleTaskSelect = (task: DetailTask) => { if (selected && taskKey(selected) === taskKey(task)) closeDetail(); else openDetail(task); };
  const confirmDelete = async () => {
    if (!deleteTarget?.id) return;
    setDeleteBusy(true);
    try {
      const response = await fetch(`/api/tasks?id=${encodeURIComponent(deleteTarget.id)}`, { method: "DELETE" });
      if (!response.ok) throw new Error("행을 삭제하지 못했습니다.");
      const deletedKey = taskKey(deleteTarget);
      setDataGroups((current) => current.map((group) => {
        const items = (group.items ?? []).filter((task) => taskKey(task) !== deletedKey);
        return { ...group, count: items.length, items };
      }).filter((group) => Boolean(group.items?.length)));
      if (selected && taskKey(selected) === deletedKey) setSelected(null);
      setShareSelection((current) => { const next = new Set(current); next.delete(deletedKey); return next; });
      setDeleteTarget(null);
      setShareMessage("행이 삭제되었습니다.");
    } catch (error) {
      setShareMessage(error instanceof Error ? error.message : "행을 삭제하지 못했습니다.");
    } finally {
      setDeleteBusy(false);
    }
  };
  const toggleShareTask = (task: DetailTask) => { const id = taskKey(task); setShareSelection((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; }); };
  const finishShareMode = () => { setShareMode(false); setShareSelection(new Set()); setShareMessage(""); setSelected(null); };
  const createShareLink = async () => {
    if (!shareSelection.size) return;
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
  useEffect(() => { resetForBrand(); }, [selectedBrand]);
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    setLoadState("loading");
    fetch(`/api/tasks?brandKey=${selectedBrand}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        if (!response.ok) throw new Error("목록 조회 실패");
        return response.json();
      })
      .then((payload: { tasks?: Array<{ id: string; brandKey: BrandKey; productName: string; itemName: string; detailHtml?: string; images?: ImageAsset[]; storeLink?: string; vendors?: string[]; note?: string; thumbnailNas: string; detailNas: string; shootingNas?: string; kurlyEnabled?: boolean }> }) => {
      if (cancelled) return;
      if (!Array.isArray(payload.tasks)) throw new Error("잘못된 목록 응답");
      const tasks = payload.tasks.filter((task) => task.brandKey === selectedBrand);
      const grouped = new Map<string, DetailTask[]>();
      tasks.forEach((task) => { const item: DetailTask = { id: task.id, brandKey: task.brandKey, product: task.productName, item: task.itemName, html: task.detailHtml || generateGeneralHtml(task.images ?? [], task.brandKey), storeLink: task.storeLink, vendors: task.vendors, note: task.note, images: task.images, thumbnailNas: task.thumbnailNas, detailNas: task.detailNas, shootingNas: task.shootingNas ?? "", kurlyEnabled: task.kurlyEnabled !== false }; const groupLabel = productGroupLabel(item.product, item.brandKey); const entries = grouped.get(groupLabel) ?? []; entries.push(item); grouped.set(groupLabel, entries); });
      if (!cancelled) {
        setDataGroups([...grouped.entries()]
          .map(([product, items]) => ({ product, count: items.length, items: sortTasksByItemOrder(items, selectedBrand) }))
          .sort((left, right) => left.product.localeCompare(right.product, "ko-KR")));
        setLoadState("ready");
      }
    }).catch(() => {
      if (!cancelled) { setDataGroups([]); setLoadState("error"); }
    }).finally(() => clearTimeout(timeout));
    return () => { cancelled = true; clearTimeout(timeout); controller.abort(); };
  }, [selectedBrand, reloadKey]);
  useEffect(() => {
    if (!selected) return;
    const closeOnOutside = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      if (!event.target.closest("tr, .detail-panel, .app-header, .modal-backdrop")) closeDetail();
    };
    document.addEventListener("pointerdown", closeOnOutside, true);
    return () => document.removeEventListener("pointerdown", closeOnOutside, true);
  }, [selected]);
  return <main className={`${modal ? "modal-open " : ""}brand-${selectedBrand}`.trim()}>
    <header className="app-header"><div className="brand-heading"><div className={`brand-switcher ${brandMenuOpen && !modal ? "is-open" : ""}`}><button className={`brand-avatar ${selectedBrand}`} aria-label={`${activeBrand.name} 브랜드 변경`} aria-expanded={brandMenuOpen && !modal} onClick={() => setBrandMenuOpen((current) => !current)}><img src={activeBrand.image} alt="" /><ChevronDown {...iconProps} /></button>{brandMenuOpen && !modal && <div className="brand-menu">{BRANDS.map((brand) => <button key={brand.key} className={brand.key === selectedBrand ? "active" : ""} onMouseDown={(event) => { event.preventDefault(); changeBrand(brand.key); }} onClick={() => changeBrand(brand.key)}><span className={`brand-option-avatar ${brand.key}`}><img src={brand.image} alt="" /></span><b>{brand.name}</b></button>)}</div>}</div><div className="app-title"><h1>Detail Page Asset Manager</h1><p>상세페이지 URL과 NAS 경로를 한 곳에서 관리하세요.</p></div></div><div className="actions"><label className="search"><Search {...iconProps} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="제품명, 품목, NAS, HTML·링크 검색" aria-label="검색" /></label><button className="new-task" onClick={() => { setBrandMenuOpen(false); setEditingTask(null); setSelected(null); setShareMode(false); setShareSelection(new Set()); setModal(1); }}><Plus {...iconProps} /><b>새 작업 등록</b></button></div></header>
    <div className={`workspace ${selected ? "with-detail" : ""}`}><section className="table-shell" onClick={(event) => { const target = event.target as HTMLElement; if (selected && !shareMode && !target.closest("tr,button,a")) closeDetail(); }}><div className="table-header"><table><colgroup><col className="c-name"/><col className="c-type"/><col className="c-link"/><col className="c-html"/><col className="c-nas"/><col className="c-nas"/><col className="c-nas"/><col className="c-note"/></colgroup><thead><tr><th>제품명</th><th>품목</th><th>링크</th><th>HTML / URL</th><th>썸네일 NAS</th><th>상세페이지 NAS</th><th>촬영본 NAS</th><th>참고사항</th></tr></thead></table></div><div className="table-scroll"><table><colgroup><col className="c-name"/><col className="c-type"/><col className="c-link"/><col className="c-html"/><col className="c-nas"/><col className="c-nas"/><col className="c-nas"/><col className="c-note"/></colgroup><tbody>{loadState !== "ready" || shownGroups.length === 0 ? <tr><td colSpan={8}><div className="table-state" role={loadState === "error" ? "alert" : "status"}>
      <strong>{loadState === "loading" ? "자산 목록을 불러오고 있습니다." : loadState === "error" ? "자산 목록을 불러오지 못했습니다." : searchActive ? "검색 결과가 없습니다." : `${activeBrand.name}에 등록된 자산이 없습니다.`}</strong>
      <p>{loadState === "loading" ? "잠시만 기다려 주세요." : loadState === "error" ? "네트워크 연결을 확인한 뒤 다시 시도해 주세요." : searchActive ? "제품명, 품목, NAS 경로 또는 HTML·링크로 다시 검색해 보세요." : "새 작업 등록 버튼으로 첫 자산을 추가해 주세요."}</p>
      {loadState === "error" && <button type="button" onClick={() => setReloadKey((current) => current + 1)}>다시 시도</button>}
      {loadState === "ready" && searchActive && <button type="button" onClick={() => setQuery("")}>검색 초기화</button>}
    </div></td></tr> : shownGroups.map((group, index) => <GroupRows group={group} key={`${selectedBrand}:${group.product}:${searchActive}`} initiallyExpanded={searchActive} onSelect={handleTaskSelect} shareMode={shareMode} selectedIds={shareSelection} onToggleShare={toggleShareTask} tone={index % 2} />)}</tbody></table></div><footer className={shareMode ? "share-mode-footer" : undefined}>{shareMode ? <div className="share-selection-hint"><span>자산 행을 선택하세요</span><b>{shareSelection.size}개 선택됨</b></div> : <span className="table-summary" role="status">{loadState === "loading" ? "불러오는 중…" : loadState === "error" ? "목록 조회 실패" : searchActive ? `검색 결과: 제품 ${shownGroups.length}개 · 품목 ${shownTaskCount}개 / 전체 품목 ${allTasks.length}개` : `제품 ${dataGroups.length}개 · 품목 ${allTasks.length}개`}</span>}{shareMessage && <span className="share-message" role="status">{shareMessage}</span>}{shareMode ? <div className="share-actions"><button type="button" className="share-cancel" disabled={shareBusy} onClick={finishShareMode}>취소</button><button type="button" className="share-copy-button" disabled={shareBusy || shareSelection.size === 0} onClick={() => void createShareLink()}><Share2 {...iconProps} /><span>{shareBusy ? "링크 생성 중..." : "링크 복사"}</span></button></div> : <button type="button" className="share-button" disabled={shareBusy || loadState !== "ready" || allTasks.length === 0} onClick={enterShareMode}><Share2 {...iconProps} /><span>공유</span></button>}</footer></section>{selected && !shareMode && <DetailPanel task={selected} closing={detailClosing} onClose={closeDetail} onEdit={() => { setEditingTask(selected); setModal(1); }} />}</div>
    {tableToast && <div className="table-copy-toast" role="status">{tableToast}</div>}
    {rowContextMenu && <div className="row-context-menu" role="menu" style={{ left: rowContextMenu.x, top: rowContextMenu.y }}><button type="button" role="menuitem" onClick={() => { setDeleteTarget(rowContextMenu.task); setRowContextMenu(null); }}><Trash2 {...iconProps} /> 삭제</button></div>}
    {deleteTarget && <div className="delete-confirm-backdrop" role="presentation"><section className="delete-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="delete-confirm-title"><h2 id="delete-confirm-title">행 삭제</h2><p><strong>{deleteTarget.product} {deleteTarget.item}</strong>을 삭제하시겠습니까?</p><div><button type="button" disabled={deleteBusy} onClick={() => setDeleteTarget(null)}>아니오</button><button type="button" className="delete-confirm-button" disabled={deleteBusy} onClick={() => void confirmDelete()}>{deleteBusy ? "삭제 중..." : "예"}</button></div></section></div>}
    {modal && <TaskModal step={modal} brandKey={selectedBrand} initialTask={editingTask} onClose={() => { setModal(null); setEditingTask(null); }} onNext={() => setModal(2)} onSave={async (draft, overwrite) => { const payload = { brandKey: selectedBrand, id: editingTask?.id, productName: draft.product || "새 작업", itemName: draft.item || "미분류", storeLink: draft.storeLink, vendors: draft.vendors, note: draft.note, thumbnailNas: draft.thumbnailNas, detailNas: draft.detailNas, shootingNas: draft.shootingNas, kurlyEnabled: draft.kurlyEnabled, images: draft.images, detailHtml: draft.detailHtml }; try { const response = await fetch(editingTask?.id ? `/api/tasks?id=${encodeURIComponent(editingTask.id)}` : "/api/tasks", { method: editingTask?.id ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task: payload, overwrite }) }); const body = await response.json().catch(() => null) as { error?: string; code?: string; tasks?: Array<{ id: string; brandKey: BrandKey; productName: string; itemName: string; detailHtml?: string; images?: ImageAsset[]; storeLink?: string; vendors?: string[]; note?: string; thumbnailNas: string; detailNas: string; shootingNas?: string; kurlyEnabled?: boolean }> } | null; if (response.status === 409 && body?.code === "DUPLICATE_TASK") return "duplicate"; if (!response.ok) throw new Error(body?.error || "저장에 실패했습니다."); const stored = body?.tasks?.[0]; if (!stored) throw new Error("저장 결과를 확인하지 못했습니다."); const savedTask: DetailTask = { id: stored.id, brandKey: stored.brandKey, product: stored.productName, item: stored.itemName, html: stored.detailHtml || generateGeneralHtml(stored.images ?? [], stored.brandKey), storeLink: stored.storeLink, vendors: stored.vendors, note: stored.note, images: stored.images, thumbnailNas: stored.thumbnailNas, detailNas: stored.detailNas, shootingNas: stored.shootingNas ?? "", kurlyEnabled: stored.kurlyEnabled !== false }; setDataGroups((current) => mergeSavedTask(current, savedTask, productGroupLabel(savedTask.product, savedTask.brandKey), (items) => sortTasksByItemOrder(items, selectedBrand))); if (editingTask) setSelected(savedTask); setTableToast("저장되었습니다."); if (tableToastTimerRef.current) clearTimeout(tableToastTimerRef.current); tableToastTimerRef.current = setTimeout(() => setTableToast(""), 1800); return "saved"; } catch (error) { setTableToast(error instanceof Error ? error.message : "저장에 실패했습니다."); return "failed"; } }} />}
  </main>;
}

function GroupRows({ group, onSelect, shareMode, selectedIds, onToggleShare, tone, initiallyExpanded = false }: { initiallyExpanded?: boolean; group: AssetGroup; onSelect: (task: DetailTask) => void; shareMode: boolean; selectedIds: Set<string>; onToggleShare: (task: DetailTask) => void; tone: number }) {
  const [expanded, setExpanded] = useState(initiallyExpanded);
  const toggleExpanded = () => setExpanded((current) => !current);
  return <>
    <tr className={`product-row tone-${tone}`} onClick={toggleExpanded}><td><button className="expand" aria-label={`${group.product} 하위 품목 ${expanded ? "접기" : "펼치기"}`} onClick={(event) => { event.stopPropagation(); toggleExpanded(); }}>{expanded ? <ChevronDown {...iconProps} /> : <ChevronRight {...iconProps} />}</button><b>{group.product}</b></td><td><span className="count">{group.count}개</span></td><td></td><td></td><td></td><td></td><td></td><td></td></tr>
    {expanded && group.items?.map((item) => {
      const isSelected = selectedIds.has(taskKey(item));
      return <tr className={`item-row ${shareMode && isSelected ? "share-selected" : ""} ${shareMode ? "share-selectable" : ""}`} key={taskKey(item)} onClick={() => shareMode ? onToggleShare(item) : onSelect(item)} onContextMenu={(event) => { if (shareMode) return; event.preventDefault(); window.dispatchEvent(new CustomEvent<RowContextMenu>("asset-row-context-menu", { detail: { task: item, x: event.clientX, y: event.clientY } })); }}>
        <td>{item.product}</td><td>{item.item}</td>
        <td>{item.storeLink ? <a className="store-link" href={item.storeLink} target="_blank" rel="noopener noreferrer" title="자사몰 상품 열기" aria-label={`${item.product} ${item.item} 자사몰 상품 열기`} onClick={(event) => event.stopPropagation()}><ExternalLink {...iconProps} /></a> : null}</td>
        <td><CellCopy value={item.html} disabled={shareMode} /></td><td><CellCopy value={item.thumbnailNas} disabled={shareMode} /></td><td><CellCopy value={item.detailNas} disabled={shareMode} /></td><td><CellCopy value={item.shootingNas} disabled={shareMode} /></td>
        <td><div className="table-note"><div className="vendor-badges">{(item.vendors ?? []).map((vendor) => <span className={`vendor-badge ${vendorClass(vendor)}`} key={vendor}>{vendor}</span>)}</div>{item.note && <span className="table-note-text">{item.note}</span>}</div></td>
      </tr>;
    })}
  </>;
}

function vendorClass(vendor: string) {
  if (vendor.includes("컬리")) return "vendor-kurly";
  if (vendor.includes("오집")) return "vendor-ohzip";
  if (vendor.includes("퀸잇")) return "vendor-queenzit";
  if (vendor.includes("네이버")) return "vendor-naver";
  return "vendor-default";
}
