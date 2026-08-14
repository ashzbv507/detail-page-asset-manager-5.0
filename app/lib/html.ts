import type { AssetImage } from "./task-types";

export function buildImageUrl(filename: string) {
  return `https://img.amante.co.kr/images/ani_img/${encodeURIComponent(filename)}`;
}

export function generateGeneralHtml(images: AssetImage[]) {
  return images.map((image) => `<img src="${image.url}" alt="${image.name}">`).join("\n");
}

export function htmlForImages(images: AssetImage[]) {
  return generateGeneralHtml(images);
}
