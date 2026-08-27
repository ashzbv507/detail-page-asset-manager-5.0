"use client";

import { useMemo, useState } from "react";
import { ImageCardList } from "./ImageCardList";
import { generateGeneralHtml } from "../lib/html";
import type { AssetImage, AssetTask, BrandKey, TaskDraft } from "../lib/task-types";

type Props = { brandKey: BrandKey; onClose: () => void; onSave: (task: AssetTask) => void };
const emptyDraft = (brandKey: BrandKey): TaskDraft => ({ brandKey, productName: "", itemName: "", optionName: "", storeLink: "", vendors: [], note: "", thumbnailNas: "", detailNas: "", shootingNas: "" });

export function TaskEditorModal({ brandKey, onClose, onSave }: Props) {
  const [step, setStep] = useState<1 | 2>(1);
  const [draft, setDraft] = useState<TaskDraft>(() => emptyDraft(brandKey));
  const [images, setImages] = useState<AssetImage[]>([]);
  const html = useMemo(() => generateGeneralHtml(images), [images]);
  const update = (field: keyof TaskDraft, value: string) => setDraft((current) => ({ ...current, [field]: value }));
  const save = () => onSave({ ...draft, id: `local-${Date.now()}`, productName: draft.productName || "새 작업", itemName: draft.itemName || "미분류", images });
  return <div className="overlay" role="presentation"><section className={`modal ${step === 1 ? "compact" : "wide"}`} role="dialog" aria-modal="true" aria-label="새 작업 생성"><header><h2>＋ 새 작업 생성</h2><div><button onClick={onClose}>취소</button><button className="primary" onClick={step === 1 ? () => setStep(2) : save}>{step === 1 ? "HTML 생성" : "저장"} →</button></div></header>{step === 1 ? <div className="task-step-one"><section><h3>기본 정보 입력</h3><label>제품명<input value={draft.productName} onChange={(event) => update("productName", event.target.value)} /></label><label>품목<input value={draft.itemName} onChange={(event) => update("itemName", event.target.value)} /></label><label>옵션<input value={draft.optionName} onChange={(event) => update("optionName", event.target.value)} /></label><label>자사몰 링크<input value={draft.storeLink} onChange={(event) => update("storeLink", event.target.value)} /></label><label>참고사항<input value={draft.note} onChange={(event) => update("note", event.target.value)} /></label></section><section><h3>NAS 경로 입력</h3><label>썸네일 NAS<textarea value={draft.thumbnailNas} onChange={(event) => update("thumbnailNas", event.target.value)} /></label><label>상세페이지 NAS<textarea value={draft.detailNas} onChange={(event) => update("detailNas", event.target.value)} /></label><label>촬영본 NAS<textarea value={draft.shootingNas} onChange={(event) => update("shootingNas", event.target.value)} /></label></section></div> : <div className="task-step-two"><section><div className="step-heading"><h3>1 이미지 목록</h3></div><ImageCardList images={images} onMove={(id, direction) => setImages((current) => { const index = current.findIndex((image) => image.id === id); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; return next; })} onRemove={(id) => setImages((current) => current.filter((image) => image.id !== id))} /></section><section><div className="step-heading"><h3>2 HTML 미리보기</h3></div><div className="html-preview"><h4>일반 HTML <small>전체 {images.length}장 포함</small></h4><pre>{html || "생성된 HTML이 없습니다."}</pre></div></section></div>}</section></div>;
}
