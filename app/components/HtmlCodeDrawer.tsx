"use client";

import { useId, useRef, useState } from "react";
import { Check, Code2, Copy, X } from "lucide-react";

type Props = {
  generalHtml: string;
  kurlyHtml: string;
  kurlyEnabled?: boolean;
  onCopy: (value: string) => Promise<void>;
};

export function HtmlCodeDrawer({ generalHtml, kurlyHtml, kurlyEnabled = true, onCopy }: Props) {
  const id = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"general" | "kurly">("general");
  const [copiedValue, setCopiedValue] = useState<string | null>(null);
  const [copyError, setCopyError] = useState(false);
  const activeMode = !kurlyEnabled && mode === "kurly" ? "general" : mode;
  const value = activeMode === "general" ? generalHtml : kurlyHtml;
  const copied = copiedValue === `${activeMode}:${value}`;
  const close = () => { setOpen(false); triggerRef.current?.focus(); };

  return <div className="html-drawer-root" onKeyDown={(event) => {
    if (event.key === "Escape" && open) { event.stopPropagation(); close(); }
  }}>
    <button ref={triggerRef} type="button" className="html-bookmark" aria-expanded={open} aria-controls={id}
      aria-label={open ? "HTML 코드 패널 닫기" : "HTML 코드 패널 열기"}
      onClick={() => { setOpen(!open); setCopiedValue(null); setCopyError(false); }}>
      <Code2 size={17} aria-hidden="true" />
    </button>
    {open && <section id={id} className="html-code-drawer" aria-label="HTML 코드">
      <div className="html-drawer-heading"><h3>HTML 코드</h3>
        <button type="button" className="html-drawer-close" aria-label="코드 패널 닫기" onClick={close}><X size={18} aria-hidden="true" /></button>
      </div>
      <div className="html-drawer-tabs" role="tablist" aria-label="HTML 종류">
        {(["general", "kurly"] as const).map((target) => <button key={target} type="button" role="tab"
          id={`${id}-${target}`} aria-selected={activeMode === target} aria-controls={`${id}-code`}
          disabled={target === "kurly" && !kurlyEnabled}
          tabIndex={activeMode === target ? 0 : -1} autoFocus={activeMode === target}
          onClick={() => { setMode(target); setCopyError(false); }}
          onKeyDown={(event) => {
            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
            event.preventDefault();
            const next = !kurlyEnabled || event.key === "Home" ? "general" : event.key === "End" ? "kurly" : activeMode === "general" ? "kurly" : "general";
            setMode(next); setCopyError(false);
            document.getElementById(`${id}-${next}`)?.focus();
          }}>{target === "general" ? "기본 HTML" : "컬리용 HTML"}</button>)}
      </div>
      <div className="html-drawer-content" role="tabpanel" id={`${id}-code`} aria-labelledby={`${id}-${activeMode}`}>
        <p>조회·복사 전용입니다. 이미지를 추가·삭제하거나 순서·적용 범위를 변경하면 HTML이 자동 생성됩니다.</p>
        <textarea aria-label={activeMode === "general" ? "기본 HTML 코드" : "컬리용 HTML 코드"}
          value={value} readOnly spellCheck={false} wrap="off"
          placeholder="이미지를 추가하면 HTML이 생성됩니다." />
      </div>
      <div className="html-drawer-footer"><span role="status">{copyError ? "복사하지 못했습니다. 다시 시도해 주세요." : copied ? "복사되었습니다." : ""}</span>
        <button type="button" disabled={!value.trim()} onClick={async () => {
          const key = `${activeMode}:${value}`;
          try { await onCopy(value); setCopiedValue(key); setCopyError(false); }
          catch { setCopyError(true); }
        }}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}복사</button>
      </div>
    </section>}
  </div>;
}
