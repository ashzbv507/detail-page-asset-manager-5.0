import type { AssetImage, BrandKey } from "./task-types";

type ImageUrlRule = { baseUrl: string; quote: "'" | '"' };

// The two confirmed production CDN rules. Serendiment and Sommier retain the
// existing image host until their separate CDN URL rule is provided.
const IMAGE_URL_RULES: Record<BrandKey, ImageUrlRule> = {
  amante: { baseUrl: "https://img.amante.co.kr/images/ani_img/", quote: "'" },
  imbedding: { baseUrl: "http://img.imbedding.co.kr/images/", quote: '"' },
  serendiment: { baseUrl: "https://img.amante.co.kr/images/ani_img/", quote: "'" },
  sommier: { baseUrl: "https://img.amante.co.kr/images/ani_img/", quote: "'" },
};

export function buildImageUrl(filename: string, brandKey: BrandKey = "amante") {
  const rawName = filename.trim().split("/").pop()?.split(/[?#]/)[0] ?? filename;
  let normalizedName = rawName;

  try {
    normalizedName = decodeURIComponent(rawName);
  } catch {
    // Keep an unexpected filename intact instead of failing HTML generation.
  }

  return `${IMAGE_URL_RULES[brandKey].baseUrl}${encodeURIComponent(normalizedName)}`;
}

export function generateGeneralHtml(images: AssetImage[], brandKey: BrandKey = "amante") {
  const { quote } = IMAGE_URL_RULES[brandKey];
  return images
    .map((image) => `<img src=${quote}${buildImageUrl(image.name, brandKey)}${quote}>`)
    .join("\n");
}

export function htmlForImages(images: AssetImage[], brandKey: BrandKey = "amante") {
  return generateGeneralHtml(images, brandKey);
}
