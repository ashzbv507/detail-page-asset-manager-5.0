import type { ImageHtmlTarget } from "./task-types";

type ImageTargetSource = { htmlTarget?: unknown; excludeFromKurly?: boolean; url?: string };

const TARGET_MARKERS = { general: "#kurly-excluded", kurly: "#kurly-only" } as const;

export function getImageHtmlTarget(image: ImageTargetSource): ImageHtmlTarget {
  if (image.htmlTarget === "common" || image.htmlTarget === "general" || image.htmlTarget === "kurly") return image.htmlTarget;
  if (image.url?.endsWith(TARGET_MARKERS.kurly)) return "kurly";
  if (image.excludeFromKurly || image.url?.endsWith(TARGET_MARKERS.general)) return "general";
  return "common";
}

export function imagesForHtmlTarget<T extends ImageTargetSource>(images: T[], target: "general" | "kurly"): T[] {
  return images.filter((image) => {
    const scope = getImageHtmlTarget(image);
    return scope === "common" || scope === target;
  });
}

// These markers are storage metadata only; strip them before displaying URLs.
// Keep the existing text[] column and old exclusion marker backward compatible.
export function decodeStoredImageUrl(storedUrl: string) {
  const htmlTarget = getImageHtmlTarget({ url: storedUrl });
  const marker = htmlTarget === "common" ? "" : TARGET_MARKERS[htmlTarget];
  const url = marker ? storedUrl.slice(0, -marker.length) : storedUrl;
  return { url, htmlTarget, excludeFromKurly: htmlTarget === "general" };
}

export function encodeStoredImageUrl(url: string, image: ImageTargetSource) {
  const htmlTarget = getImageHtmlTarget(image);
  return `${decodeStoredImageUrl(url).url}${htmlTarget === "common" ? "" : TARGET_MARKERS[htmlTarget]}`;
}
