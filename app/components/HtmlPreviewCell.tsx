"use client";

import { useRef } from "react";
import { Copy, Eye } from "lucide-react";
import { iconProps } from "../lib/icon-props";
import { createHtmlPreviewPayload, htmlPreviewFailureMessage, openHtmlPreviewTab, previewImagesFromHtml } from "../lib/html-preview";

type Props = {
  html: string;
  copyDisabled?: boolean;
  copyLabel?: string;
  onCopy: (value: string) => void;
  onNotice: (message: string) => void;
};

export function HtmlPreviewCell({ html, copyDisabled = false, copyLabel = "셀 내용 복사", onCopy, onNotice }: Props) {
  const versionRef = useRef(0);
  const hasHtml = Boolean(html.trim());
  return <div className="cell-copy html-preview-cell">
    <span title={html}>{hasHtml ? html : ""}</span>
    <button className="copy-cell-button preview-cell-button" type="button" disabled={!hasHtml}
      title="HTML 새 창 미리보기" data-tooltip="HTML 새 창 미리보기" aria-label="HTML 새 창 미리보기"
      onPointerDown={(event) => event.stopPropagation()} onClick={(event) => {
        event.stopPropagation();
        if (!hasHtml) return;
        const images = previewImagesFromHtml(html);
        if (!images.length) { onNotice("미리보기할 이미지가 없습니다."); return; }
        const version = Math.max(Date.now(), versionRef.current + 1);
        versionRef.current = version;
        // Open synchronously in the user gesture; reuse tab isolation and cache busting.
        const message = htmlPreviewFailureMessage(openHtmlPreviewTab(createHtmlPreviewPayload("general", images, version)));
        if (message) onNotice(message);
      }}><Eye {...iconProps} /></button>
    <button className="copy-cell-button" type="button" disabled={copyDisabled || !hasHtml} aria-disabled={copyDisabled || !hasHtml}
      title={copyLabel} aria-label={copyLabel} onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => { event.stopPropagation(); if (!copyDisabled && hasHtml) onCopy(html); }}><Copy {...iconProps} /></button>
  </div>;
}
