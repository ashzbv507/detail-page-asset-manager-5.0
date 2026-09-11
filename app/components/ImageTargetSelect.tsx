"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown } from "lucide-react";
import type { ImageHtmlTarget } from "../lib/task-types";

const OPTIONS: { value: ImageHtmlTarget; label: string }[] = [
  { value: "common", label: "공통" },
  { value: "general", label: "컬리 제외" },
  { value: "kurly", label: "컬리 전용" },
];

function TargetBadge({ value }: { value: ImageHtmlTarget }) {
  return <span className="image-target-badge" data-target={value}><span className="image-target-dot" aria-hidden="true" />{OPTIONS.find((option) => option.value === value)?.label}</span>;
}

export function ImageTargetSelect({ value, imageName, onChange }: { value: ImageHtmlTarget; imageName: string; onChange: (value: ImageHtmlTarget) => void }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();

  const close = (restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    const placeMenu = () => {
      const anchor = triggerRef.current?.getBoundingClientRect();
      if (!anchor) return;
      const height = menuRef.current?.offsetHeight ?? 120;
      setPosition({
        top: anchor.bottom + height + 8 <= window.innerHeight ? anchor.bottom + 4 : Math.max(8, anchor.top - height - 4),
        left: Math.max(8, Math.min(anchor.right - 160, window.innerWidth - 168)),
      });
    };
    const dismissOutside = (event: PointerEvent) => {
      if (!triggerRef.current?.contains(event.target as Node) && !menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    placeMenu();
    menuRef.current?.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({ preventScroll: true });
    document.addEventListener("pointerdown", dismissOutside, true);
    window.addEventListener("resize", placeMenu);
    window.addEventListener("scroll", placeMenu, true);
    return () => {
      document.removeEventListener("pointerdown", dismissOutside, true);
      window.removeEventListener("resize", placeMenu);
      window.removeEventListener("scroll", placeMenu, true);
    };
  }, [open]);

  const show = () => {
    const anchor = triggerRef.current?.getBoundingClientRect();
    if (anchor) setPosition({ top: anchor.bottom + 4, left: Math.max(8, anchor.right - 160) });
    setOpen(true);
  };

  return <span className="image-target-control" onPointerDown={(event) => event.stopPropagation()} onDragStart={(event) => { event.preventDefault(); event.stopPropagation(); }}>
    <button ref={triggerRef} type="button" className="image-target-trigger" aria-label={`${imageName} HTML 적용 범위: ${OPTIONS.find((option) => option.value === value)?.label}`} aria-haspopup="listbox" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => open ? close() : show()} onKeyDown={(event) => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); show(); }
    }}><TargetBadge value={value} /><ChevronDown className="image-target-chevron" size={12} aria-hidden="true" /></button>
    {open && createPortal(<div ref={menuRef} id={menuId} className="image-target-menu" role="listbox" aria-label={`${imageName} HTML 적용 범위`} style={position} onPointerDown={(event) => event.stopPropagation()} onKeyDown={(event) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(true); return; }
      if (event.key === "Tab") { close(true); return; }
      const choices = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>('[role="option"]') ?? []);
      const current = choices.indexOf(document.activeElement as HTMLButtonElement);
      let next: number;
      if (event.key === "ArrowDown") next = (current + 1) % choices.length;
      else if (event.key === "ArrowUp") next = (current - 1 + choices.length) % choices.length;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = choices.length - 1;
      else return;
      event.preventDefault();
      choices[next]?.focus();
    }}>{OPTIONS.map((option) => <button type="button" role="option" aria-selected={value === option.value} tabIndex={-1} key={option.value} className="image-target-option" onClick={() => { onChange(option.value); close(true); }}><TargetBadge value={option.value} />{value === option.value && <Check size={14} strokeWidth={1.75} aria-hidden="true" />}</button>)}</div>, document.body)}
  </span>;
}
