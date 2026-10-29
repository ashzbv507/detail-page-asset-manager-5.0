"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Copy, X } from "lucide-react";
import { copyToClipboard } from "../lib/clipboard";
import { sharePopoverPosition } from "../lib/share-popover-position";

type Props = {
  url: string;
  anchorRef: RefObject<HTMLButtonElement | null>;
  onClose: () => void;
  onCopied: () => void;
};

export function ShareLinkPopover({ url, anchorRef, onClose, onCopied }: Props) {
  const titleId = useId();
  const descriptionId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const busyRef = useRef(false);
  const mountedRef = useRef(false);
  const [copying, setCopying] = useState(false);
  const [retryFailed, setRetryFailed] = useState(false);
  const [position, setPosition] = useState<ReturnType<typeof sharePopoverPosition> | null>(null);

  useEffect(() => { mountedRef.current = true; return () => { mountedRef.current = false; }; }, []);
  useLayoutEffect(() => {
    const place = () => {
      const anchor = anchorRef.current?.getBoundingClientRect();
      const panel = panelRef.current?.getBoundingClientRect();
      if (!anchor || !panel) return;
      const viewport = window.visualViewport;
      const next = sharePopoverPosition(anchor, panel, { width: viewport?.width ?? window.innerWidth, height: viewport?.height ?? window.innerHeight, left: viewport?.offsetLeft ?? 0, top: viewport?.offsetTop ?? 0 });
      setPosition((current) => current && current.left === next.left && current.top === next.top && current.arrowLeft === next.arrowLeft && current.side === next.side ? current : next);
    };
    place();
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place);
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      observer?.disconnect();
    };
  }, [url, anchorRef]);
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panelRef.current?.contains(target) && !anchorRef.current?.contains(target)) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      onClose();
      anchorRef.current?.focus({ preventScroll: true });
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [anchorRef, onClose]);

  const retryCopy = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setCopying(true);
    const copied = await copyToClipboard(url);
    if (!mountedRef.current) return;
    busyRef.current = false;
    setCopying(false);
    if (copied) {
      onCopied();
      requestAnimationFrame(() => anchorRef.current?.focus({ preventScroll: true }));
    } else {
      setRetryFailed(true);
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }
  };

  if (typeof document === "undefined") return null;
  return createPortal(<div ref={panelRef} className="share-link-popover" role="dialog" aria-labelledby={titleId} aria-describedby={descriptionId}
    data-side={position?.side ?? "above"} style={{ left: position?.left ?? 0, top: position?.top ?? 0, visibility: position ? "visible" : "hidden", "--share-arrow-left": `${position?.arrowLeft ?? 0}px` } as CSSProperties}>
    <div className="share-link-popover-heading"><h2 id={titleId}>링크를 직접 복사해 주세요</h2><button type="button" className="share-link-popover-close" aria-label="링크 복사 안내 닫기" onClick={() => { onClose(); anchorRef.current?.focus({ preventScroll: true }); }}><X size={15} strokeWidth={1.75} aria-hidden="true" /></button></div>
    <p id={descriptionId}>자동 복사가 되지 않았어요.<br />아래 링크를 선택해 직접 복사할 수 있습니다.</p>
    <input ref={inputRef} className="share-link-popover-url" aria-label="공유 링크" value={url} readOnly spellCheck={false} onFocus={(event) => event.currentTarget.select()} onClick={(event) => event.currentTarget.select()} />
    <div className="share-link-popover-bottom"><span role="status">{retryFailed ? "복사가 제한되어 있어요. 링크를 직접 복사해 주세요." : "생성된 링크는 그대로 유지됩니다."}</span><button type="button" className="share-link-popover-retry" disabled={copying} onClick={() => void retryCopy()}><Copy size={14} strokeWidth={1.75} aria-hidden="true" />{copying ? "복사 중…" : "다시 복사"}</button></div>
  </div>, document.body);
}
