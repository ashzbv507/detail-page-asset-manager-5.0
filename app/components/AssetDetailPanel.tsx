"use client";

import { useState } from "react";
import type { AssetTask } from "../lib/task-types";
import { htmlForImages } from "../lib/html";

type Props = { task: AssetTask; onClose: () => void; onEdit?: () => void };
function copyText(value: string) { if (value && navigator.clipboard) void navigator.clipboard.writeText(value); }

export function AssetDetailPanel({ task, onClose, onEdit }: Props) {
  const [htmlMode, setHtmlMode] = useState<"html" | "url">("html");
  const normalHtml = htmlForImages(task.images);
  const displayedHtml = htmlMode === "html" ? normalHtml : task.images.map((image) => image.url).join("\n");
  return <aside className="detail-panel" aria-label="자산 상세패널"><nav className="detail-tabs"><button className="active">제품 정보</button><span />{onEdit && <button className="edit" onClick={onEdit}>편집</button>}<button className="close" onClick={onClose} aria-label="상세패널 닫기">×</button></nav><div className="detail-body"><dl className="info-grid"><dt>제품명</dt><dd>{task.productName}</dd><dt>품목</dt><dd>{task.itemName}</dd><dt>거래처</dt><dd>{task.vendors.join(", ") || "—"}</dd><dt>링크</dt><dd>{task.storeLink || "—"}</dd><dt>참고사항</dt><dd>{task.note || "—"}</dd></dl><section className="detail-section html-block"><header><h3>HTML 링크</h3><span><button onClick={() => setHtmlMode((current) => current === "html" ? "url" : "html")}>{htmlMode === "html" ? "URL 변환" : "HTML 변환"}</button><button onClick={() => copyText(displayedHtml)}>복사</button></span></header><pre>{displayedHtml || "생성된 HTML이 없습니다."}</pre></section><section className="detail-section paths"><h3>NAS 경로</h3>{[["썸네일", task.thumbnailNas], ["상세페이지", task.detailNas], ["촬영본", task.shootingNas]].map(([label, value]) => <div className="path-row" key={label}><label>{label}</label><code>{value || "—"}</code><button onClick={() => copyText(value)}>복사</button></div>)}</section></div></aside>;
}
