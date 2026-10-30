"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Minus, Plus, RefreshCw } from "lucide-react";
import { readHtmlPreviewSnapshot, previewImageUrl, type HtmlPreviewPayload } from "../lib/html-preview";
import { capturePreviewAnchor, clampPreviewZoom, fitPreviewZoom, previewAnchorDelta, PREVIEW_BASE_WIDTH, PREVIEW_MIN_ZOOM, PREVIEW_MAX_ZOOM, PREVIEW_ZOOM_STEP, type PreviewAnchor } from "../lib/preview-zoom";
import styles from "./preview.module.css";
import { readPreviewView, writePreviewView, type PreviewViewState } from "../lib/preview-view-state";

export default function HtmlPreviewPage() {
  const [payload, setPayload] = useState<HtmlPreviewPayload | null>(null);
  const [zoom, setZoom] = useState(100);
  const [fitToWindow, setFitToWindow] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const anchorRef = useRef<PreviewAnchor | null>(null);
  const restoreRef = useRef<{ left: number; top: number } | null>(null);
  const [refreshing, setRefreshing] = useState(false);
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
    restoreRef.current = null;
    rememberPosition();
    setFitToWindow(false);
    setZoom(clampPreviewZoom(value));
  };

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const resize = () => {
      if (!restoreRef.current) rememberPosition();
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
    // Read this tab's immutable snapshot once. Opening/editing another
    // product must never replace the content of an existing preview tab.
    try {
      const snapshot = readHtmlPreviewSnapshot(window.sessionStorage);
      if (snapshot) {
        const view = readPreviewView(window.sessionStorage, snapshot);
        if (view) { setZoom(view.zoom); setFitToWindow(view.fitToWindow); }
        restoreRef.current = { left: view?.scrollLeft ?? 0, top: view?.scrollTop ?? 0 };
        setRefreshing(snapshot.images.length > 0);
      }
      setPayload(snapshot);
    } catch { setPayload(null); }
    return () => {
      document.documentElement.classList.remove("html-preview-document");
      document.body.classList.remove("html-preview-document");
    };
  }, []);

  // Save in this tab only. Never replace a saved position with the temporary
  // zero/clamped scroll offset while fresh images are still loading.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!payload || !viewport) return;
    let frame = 0;
    const save = () => {
      const pending = restoreRef.current;
      const view: PreviewViewState = { zoom, fitToWindow, scrollLeft: pending?.left ?? viewport.scrollLeft, scrollTop: pending?.top ?? viewport.scrollTop };
      try { writePreviewView(window.sessionStorage, payload, view); } catch { /* Storage can be unavailable. */ }
    };
    const onScroll = () => {
      if (restoreRef.current || frame) return;
      frame = requestAnimationFrame(() => { frame = 0; save(); });
    };
    save();
    viewport.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", save);
    const onVisibility = () => { if (document.visibilityState === "hidden") save(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelAnimationFrame(frame);
      save();
      viewport.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", save);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [payload, zoom, fitToWindow]);

  useEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!payload || !viewport || !canvas || !viewportWidth) return;
    const images = Array.from(canvas.querySelectorAll("img"));
    const restore = () => {
      const pending = restoreRef.current;
      if (pending) { viewport.scrollLeft = pending.left; viewport.scrollTop = pending.top; }
      // A failed image also settles. Do not wait forever or reset on each load.
      if (images.every((image) => image.complete)) {
        restoreRef.current = null;
        setRefreshing(false);
      }
    };
    const cancelRestore = () => { restoreRef.current = null; };
    const onKey = (event: KeyboardEvent) => {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) cancelRestore();
    };
    images.forEach((image) => { image.addEventListener("load", restore); image.addEventListener("error", restore); });
    const observer = new ResizeObserver(restore);
    observer.observe(canvas);
    viewport.addEventListener("wheel", cancelRestore, { passive: true });
    viewport.addEventListener("touchstart", cancelRestore, { passive: true });
    viewport.addEventListener("pointerdown", cancelRestore);
    viewport.addEventListener("keydown", onKey);
    restore();
    return () => {
      observer.disconnect();
      images.forEach((image) => { image.removeEventListener("load", restore); image.removeEventListener("error", restore); });
      viewport.removeEventListener("wheel", cancelRestore);
      viewport.removeEventListener("touchstart", cancelRestore);
      viewport.removeEventListener("pointerdown", cancelRestore);
      viewport.removeEventListener("keydown", onKey);
    };
  }, [payload, viewportWidth, activeZoom]);

  const refreshImages = () => {
    const viewport = viewportRef.current;
    if (!payload || !viewport || refreshing) return;
    restoreRef.current = { left: viewport.scrollLeft, top: viewport.scrollTop };
    anchorRef.current = null;
    setRefreshing(true);
    setPayload({ ...payload, version: Math.max(Date.now(), payload.version + 1) });
  };

  return <main className={styles.page} aria-label={payload?.mode === "kurly" ? "컬리용 HTML 전체 미리보기" : "기본 HTML 전체 미리보기"}>
    <header className={styles.toolbar} aria-label="미리보기 크기 조절">
      <div className={styles.heading}>
        <span className={styles.title}>{payload?.mode === "kurly" ? "컬리 HTML" : "HTML"} 미리보기</span>
        <button type="button" className={styles.refreshButton} disabled={!hasImages || refreshing} onClick={refreshImages} aria-label="이미지 새로고침" aria-busy={refreshing}><RefreshCw size={14} aria-hidden="true" />{refreshing ? "불러오는 중…" : "이미지 새로고침"}</button>
      </div>
      <div className={styles.controls}>
        <div className={styles.zoomControls}>
          <button type="button" className={styles.iconButton} aria-label="미리보기 축소" disabled={!hasImages || activeZoom <= PREVIEW_MIN_ZOOM} onClick={() => changeZoom(activeZoom - PREVIEW_ZOOM_STEP)}><Minus size={16} aria-hidden="true" /></button>
          <input type="range" aria-label="미리보기 배율" aria-valuetext={`${activeZoom}%`} min={PREVIEW_MIN_ZOOM} max={PREVIEW_MAX_ZOOM} step={1} value={activeZoom} disabled={!hasImages} onChange={(event) => changeZoom(Number(event.target.value))} />
          <button type="button" className={styles.iconButton} aria-label="미리보기 확대" disabled={!hasImages || activeZoom >= PREVIEW_MAX_ZOOM} onClick={() => changeZoom(activeZoom + PREVIEW_ZOOM_STEP)}><Plus size={16} aria-hidden="true" /></button>
          <output className={styles.percentage} aria-label="현재 배율">{activeZoom}%</output>
        </div>
        <div className={styles.presets}>
          <button type="button" disabled={!hasImages} aria-pressed={fitToWindow} onClick={() => { restoreRef.current = null; rememberPosition(); setFitToWindow(true); }}>화면 맞춤</button>
        </div>
      </div>
    </header>
    <div className={styles.viewport} ref={viewportRef}>
      {hasImages && payload ? <div className={styles.stage}><div ref={canvasRef} className={styles.canvas} style={{ width: PREVIEW_BASE_WIDTH * activeZoom / 100 }}>{payload.images.map((image, index) => <img key={`${image.name}-${index}`} src={previewImageUrl(image.url, payload.version)} alt={image.name} />)}</div></div>
        : <p className={styles.empty}>{payload ? "표시할 이미지가 없습니다." : "편집창에서 ‘새 창 미리보기’를 다시 눌러 주세요."}</p>}
    </div>
  </main>;
}
