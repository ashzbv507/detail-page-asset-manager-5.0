import type { AssetImage } from "./task-types";

export function buildImageUrl(filename: string) {
  const rawName = filename.trim().split("/").pop()?.split(/[?#]/)[0] ?? filename;
  let normalizedName = rawName;

  try {
    normalizedName = decodeURIComponent(rawName);
  } catch {
    // Keep an unexpected filename intact instead of failing HTML generation.
  }

  return `https://img.amante.co.kr/images/ani_img/${encodeURIComponent(normalizedName)}`;
}

export function generateGeneralHtml(images: AssetImage[]) {
  return images
    .map((image) => `<img src='${buildImageUrl(image.name)}'>`)
    .join("\n");
}

export function htmlForImages(images: AssetImage[]) {
  return generateGeneralHtml(images);
}
