"use client";

import type { AssetImage } from "../lib/task-types";

type Props = { images: AssetImage[]; onMove: (id: string, direction: -1 | 1) => void; onRemove: (id: string) => void };

export function ImageCardList({ images, onMove, onRemove }: Props) {
  return <div className="image-card-list">{images.map((image, index) => <article className="image-card" key={image.id}>
    <img className="image-placeholder" src={image.url} alt="" />
    <div className="image-card-content"><strong>{image.name}</strong><small>{image.mimeType || "image/jpeg"}</small></div>
    <div className="image-card-actions"><button onClick={() => onMove(image.id, -1)} disabled={index === 0} aria-label="이미지 위로 이동">↑</button><button onClick={() => onMove(image.id, 1)} disabled={index === images.length - 1} aria-label="이미지 아래로 이동">↓</button><button onClick={() => onRemove(image.id)} aria-label="이미지 제거">×</button></div>
  </article>)}</div>;
}
