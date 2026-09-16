"use client";

import { useEffect, useState } from "react";
import { HTML_PREVIEW_STORAGE_KEY, parseHtmlPreviewPayload, previewImageUrl, type HtmlPreviewPayload } from "../lib/html-preview";
import styles from "./preview.module.css";

function readLatestPayload() {
  const payload = parseHtmlPreviewPayload(window.localStorage.getItem(HTML_PREVIEW_STORAGE_KEY));
  return payload ? { ...payload, version: Math.max(payload.version, Date.now()) } : null;
}

export default function HtmlPreviewPage() {
  const [payload, setPayload] = useState<HtmlPreviewPayload | null>(null);

  useEffect(() => {
    document.documentElement.classList.add("html-preview-document");
    document.body.classList.add("html-preview-document");
    const update = () => setPayload(readLatestPayload());
    const sync = (event: StorageEvent) => {
      if (event.key === HTML_PREVIEW_STORAGE_KEY) update();
    };
    update();
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener("storage", sync);
      document.documentElement.classList.remove("html-preview-document");
      document.body.classList.remove("html-preview-document");
    };
  }, []);

  if (!payload) return <main className={styles.page}><p className={styles.empty}>편집창에서 ‘새 창 미리보기’를 다시 눌러 주세요.</p></main>;
  if (payload.images.length === 0) return <main className={styles.page}><p className={styles.empty}>표시할 이미지가 없습니다.</p></main>;

  return <main className={styles.page} aria-label={payload.mode === "kurly" ? "컬리용 HTML 전체 미리보기" : "기본 HTML 전체 미리보기"}>
    <div className={styles.canvas}>{payload.images.map((image, index) => <img key={`${image.name}-${index}`} src={previewImageUrl(image.url, payload.version)} alt={image.name} />)}</div>
  </main>;
}
