"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { closestCenter, DndContext, DragOverlay, KeyboardSensor, PointerSensor, useSensor, useSensors, type CollisionDetection } from "@dnd-kit/core";
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Trash2 } from "lucide-react";
import { ImageTargetSelect } from "./ImageTargetSelect";
import { withPreviewImageVersion } from "../lib/html";
import { getImageHtmlTarget } from "../lib/image-target";
import { imageSortTarget } from "../lib/image-order";
import { dragAutoScrollVelocity, dragPointerWithinBounds } from "../lib/drag-auto-scroll";
import type { AssetImage, ImageHtmlTarget } from "../lib/task-types";

type Props = {
  images: AssetImage[];
  previewVersion: number;
  onMove: (fromId: string, toId: string) => void;
  onRemove: (id: string) => void;
  onTargetChange: (id: string, target: ImageHtmlTarget) => void;
};

type Point = { x: number; y: number };
function useImageSortAutoScroll(active: boolean, listRef: RefObject<HTMLDivElement | null>, pointerRef: RefObject<Point | null>) {
  useEffect(() => {
    // Pointer events keep arriving over card gaps and moving children. Read
    // the real pointer, never the animated overlay's bounds or drag angle.
    // Listen before activation too, so a fast first move cannot be missed.
    const followPointer = (event: PointerEvent) => { pointerRef.current = { x: event.clientX, y: event.clientY }; };
    document.addEventListener("pointermove", followPointer, true);
    return () => document.removeEventListener("pointermove", followPointer, true);
  }, [pointerRef]);
  useEffect(() => {
    if (!active || !pointerRef.current) return;
    let frame: number;
    let lastTime: number | null = null;
    const scroll = (time: number) => {
      const list = listRef.current;
      const point = pointerRef.current;
      const elapsed = lastTime === null ? 1 / 60 : Math.min(0.032, (time - lastTime) / 1000);
      lastTime = time;
      if (list && point) {
        const bounds = list.getBoundingClientRect();
        if (dragPointerWithinBounds(point, bounds)) {
          const velocity = dragAutoScrollVelocity(point.y, bounds.top, bounds.bottom, 56, 500);
          if (velocity !== 0) {
            const limit = Math.max(0, list.scrollHeight - list.clientHeight);
            list.scrollTop = Math.max(0, Math.min(limit, list.scrollTop + velocity * elapsed));
          }
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [active, listRef, pointerRef]);
}

function ImageContents({ image, previewVersion }: { image: AssetImage; previewVersion: number }) {
  const metadata = [image.mimeType?.split("/").pop()?.toUpperCase()];
  if (typeof image.size === "number") metadata.push(image.size < 1024 ? `${image.size} B` : `${(image.size / 1024 / 1024).toFixed(1)} MB`);
  return <>
    <img className="thumb" src={withPreviewImageVersion(image.url, previewVersion)} alt="" draggable={false} />
    <div className="file-meta"><b title={image.name}>{image.name}</b>{metadata.filter(Boolean).length > 0 && <small>{metadata.filter(Boolean).join(" · ")}</small>}</div>
  </>;
}

function SortableImage({ image, previewVersion, onRemove, onTargetChange }: Omit<Props, "images" | "onMove"> & { image: AssetImage }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: image.id,
    transition: { duration: 180, easing: "cubic-bezier(0.25, 1, 0.5, 1)" },
  });
  return <div ref={setNodeRef} className={`file sortable-file${isDragging ? " is-sort-placeholder" : ""}`}
    style={{ transform: CSS.Transform.toString(transform), transition }} onPointerDown={(event) => listeners?.onPointerDown?.(event)}>
    <button ref={setActivatorNodeRef} type="button" className="drag-handle" {...attributes} onKeyDown={(event) => listeners?.onKeyDown?.(event)}
      aria-label={`${image.name} 순서 이동`} title="드래그하여 이동 · Space로 선택 후 방향키로 이동">⋮⋮</button>
    <ImageContents image={image} previewVersion={previewVersion} />
    <div className="file-actions" onPointerDown={(event) => event.stopPropagation()}>
      <ImageTargetSelect value={getImageHtmlTarget(image)} imageName={image.name} onChange={(target) => onTargetChange(image.id, target)} />
      <button className="delete-file" type="button" aria-label={`${image.name} 삭제`} onClick={() => onRemove(image.id)}><Trash2 size={16} strokeWidth={1.75} aria-hidden="true" /></button>
    </div>
  </div>;
}

export function SortableImageList({ images, previewVersion, onMove, onRemove, onTargetChange }: Props) {
  const contextId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<Point | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  useImageSortAutoScroll(activeId !== null, listRef, pointerRef);
  const ids = useMemo(() => images.map((image) => image.id), [images]);
  const activeImage = images.find((image) => image.id === activeId);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const collisionDetection = useCallback<CollisionDetection>((args) => {
    // Keyboard sorting uses the next card's centre; pointer sorting accepts
    // every gap and the list padding, not just the visible card elements.
    if (!args.pointerCoordinates) return closestCenter(args);
    const bounds = listRef.current?.getBoundingClientRect();
    const { y } = args.pointerCoordinates;
    if (!bounds || !dragPointerWithinBounds(args.pointerCoordinates, bounds)) return [];
    const rects = [...args.droppableRects].map(([id, rect]) => ({ id: String(id), top: rect.top, height: rect.height }));
    const target = imageSortTarget(ids, String(args.active.id), y, rects);
    return target === null ? [] : [{ id: target }];
  }, [ids]);
  const finishDrag = () => { pointerRef.current = null; setActiveId(null); };
  return <div className="image-list" ref={listRef} data-sorting={activeId !== null}>
    <DndContext id={contextId} sensors={sensors} collisionDetection={collisionDetection}
      autoScroll={false}
      accessibility={{ screenReaderInstructions: { draggable: "Space 또는 Enter로 이미지를 선택하고 위아래 방향키로 이동하세요. 다시 Space 또는 Enter를 누르면 확정되고 Escape를 누르면 취소됩니다." }, announcements: {
        onDragStart: ({ active }) => `${images.find((image) => image.id === active.id)?.name ?? "이미지"} 이동을 시작했습니다.`,
        onDragOver: ({ over }) => over ? `${ids.indexOf(String(over.id)) + 1}번째 위치입니다.` : "목록 밖입니다. 놓으면 이동이 취소됩니다.",
        onDragEnd: ({ over }) => over ? "이미지 순서를 변경했습니다." : "이동을 취소했습니다.",
        onDragCancel: () => "이동을 취소했습니다.",
      } }}
      onDragStart={({ active, activatorEvent }) => {
        pointerRef.current = "clientX" in activatorEvent ? pointerRef.current ?? { x: (activatorEvent as PointerEvent).clientX, y: (activatorEvent as PointerEvent).clientY } : null;
        setActiveId(String(active.id));
      }}
      onDragCancel={finishDrag}
      onDragEnd={({ active, over }) => {
        // Only this event commits the order. Hovering never changes images,
        // regenerates HTML, or requests preview images again.
        if (over && active.id !== over.id) onMove(String(active.id), String(over.id));
        finishDrag();
      }}>
      <SortableContext items={ids} strategy={verticalListSortingStrategy}>
        {images.map((image) => <SortableImage key={image.id} image={image} previewVersion={previewVersion} onRemove={onRemove} onTargetChange={onTargetChange} />)}
      </SortableContext>
      {typeof document !== "undefined" && createPortal(<DragOverlay dropAnimation={null} zIndex={10000}>
        {activeImage ? <div className="file sort-drag-overlay" aria-hidden="true"><span className="drag-handle">⋮⋮</span><ImageContents image={activeImage} previewVersion={previewVersion} /><span className="sort-overlay-target">{getImageHtmlTarget(activeImage) === "general" ? "컬리 제외" : getImageHtmlTarget(activeImage) === "kurly" ? "컬리 전용" : "공통"}</span></div> : null}
      </DragOverlay>, document.body)}
    </DndContext>
  </div>;
}
