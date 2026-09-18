"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";
import { HTML_PREVIEW_STORAGE_KEY, parseHtmlPreviewPayload, previewImageUrl, type HtmlPreviewPayload } from "../lib/html-preview";
import { capturePreviewAnchor, clampPreviewZoom, fitPreviewZoom, previewAnchorDelta, PREVIEW_BASE_WIDTH, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM, PREVIEW_ZOOM_STEP, type PreviewAnchor } from "../lib/preview-zoom";
import styles from "./preview.module.css";

function readLatestPayload() {
  const payload = parseHtmlPreviewPayload(window.localStorage.getItem(HTML_PREVIEW_STORAGE_KEY));
  return payload ? { ...payload, version: Math.max(payload.version, Date.now()) } : null;
}

export default function HtmlPreviewPage() {
  const [payload, setPayload] = useState<HtmlPreviewPayload | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fitToWindow, setFitToWindow] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<PreviewAnchor | null>(null);
  const fittedZoom = viewportWidth ? fitPreviewZoom(viewportWidth) : 100;
  const activeZoom = fitToWindow ? fittedZoom : zoom;
  const hasImages = Boolean(payload?.images.length);

  const rememberPosition = () => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (viewport && canvas) {
      const bounds = viewport.getBoundingClientRect();
      anchorRef.current = capturePreviewAnchor(canvas.getBoundingClientRect(), {
        left: bounds.left, top: bounds.top, width: viewport.clientWidth, height: viewport.clientHeight,
      });
    }
  };

  const changeZoom = (value: number) => {
    rememberPosition();
    setFitToWindow(false);
    setZoom(clampPreviewZoom(value));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => {
      rememberPosition();
      setViewportWidth(viewport.clientWidth);
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  useLayoutEffect(() => {
    const anchor = anchorRef.current;
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    anchorRef.current = null;
    if (!anchor || !viewport || !canvas) return;
    const bounds = viewport.getBoundingClientRect();
    const delta = previewAnchorDelta(anchor, canvas.getBoundingClientRect(), {
      left: bounds.left, top: bounds.top, width: viewport.clientWidth, height: viewport.clientHeight,
    });
    viewport.scrollLeft += delta.left;
    viewport.scrollTop += delta.top;
  }, [activeZoom]);

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

  return <main className={styles.page} aria-label={payload?.mode === "kurly" ? "컬리용 HTML 전체 미리보기" : "기본 HTML 전체 미리보기"}>
    <header className={styles.toolbar} aria-label="미리보기 크기 조절">
      <span className={styles.title}>{payload?.mode === "kurly" ? "컬리 HTML" : "HTML"} 미리보기</span>
      <div className={styles.controls}>
        <div className={styles.zoomControls}>
          <button type="button" className={styles.iconButton} aria-label="미리보기 축소" disabled={!hasImages || activeZoom <= PREVIEW_MIN_ZOOM} onClick={() => changeZoom(activeZoom - PREVIEW_ZOOM_STEP)}><Minus size={16} aria-hidden="true" /></button>
          <input type="range" aria-label="미리보기 배율" aria-valuetext={`${activeZoom}%`} min={PREVIEW_MIN_ZOOM} max={PREVIEW_MAX_ZOOM} step={1} value={activeZoom} disabled={!hasImages} onChange={(event) => changeZoom(Number(event.target.value))} />
          <button type="button" className={styles.iconButton} aria-label="미리보기 확대" disabled={!hasImages || activeZoom >= PREVIEW_MAX_ZOOM} onClick={() => changeZoom(activeZoom + PREVIEW_ZOOM_STEP)}><Plus size={16} aria-hidden="true" /></button>
          <output className={styles.percentage} aria-label="현재 배율">{activeZoom}%</output>
        </div>
        <div className={styles.presets}>
          <button type="button" disabled={!hasImages} aria-pressed={fitToWindow} onClick={() => { rememberPosition(); setFitToWindow(true); }}>화면 맞춤</button>
        </div>
      </div>
    </header>
    <div className={styles.viewport} ref={viewportRef}>
      {hasImages && payload ? <div className={styles.stage}><div ref={canvasRef} className={styles.canvas} style={{ width: PREVIEW_BASE_WIDTH * activeZoom / 100 }}>{payload.images.map((image, index) => <img key={`${image.name}-${index}`} src={previewImageUrl(image.url, payload.version)} alt={image.name} />)}</div></div>
        : <p className={styles.empty}>{payload ? "표시할 이미지가 없습니다." : "편집창에서 ‘새 창 미리보기’를 다시 눌러 주세요."}</p>}
    </div>
  </main>;
}
