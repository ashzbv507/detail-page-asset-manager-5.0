import type { AssetImage } from "./task-types";
import { getImageHtmlTarget } from "./image-target";
import { normalizeTaskVendors } from "./task-identity";

export const DUPLICATE_TASK_MESSAGE = "동일한 제품명·품목·옵션·거래처·참고사항의 작업이 이미 있습니다. 별도 작업으로 저장하려면 품목이나 참고사항 등을 변경해 주세요.";

type DuplicateContent = {
  product: string; item: string; option?: string; storeLink?: string; note?: string;
  thumbnailNas?: string; detailNas?: string; shootingNas?: string;
  vendors?: string[]; detailHtml?: string; kurlyEnabled?: boolean; images?: AssetImage[];
};

/** Compare saved content, not UI IDs, preview cache versions or vendor click order. */
export function duplicateTaskContentKey(content: DuplicateContent): string {
  const trimmed = (value?: string) => value?.trim() ?? "";
  return JSON.stringify({
    product: trimmed(content.product), item: trimmed(content.item), option: trimmed(content.option),
    storeLink: trimmed(content.storeLink), note: trimmed(content.note),
    thumbnailNas: trimmed(content.thumbnailNas), detailNas: trimmed(content.detailNas), shootingNas: trimmed(content.shootingNas),
    vendors: normalizeTaskVendors(content.vendors), detailHtml: content.detailHtml ?? "",
    kurlyEnabled: content.kurlyEnabled !== false,
    images: (content.images ?? []).map((image) => ({ name: trimmed(image.name), url: trimmed(image.url), htmlTarget: getImageHtmlTarget(image) })),
  });
}

/** An isolated form seed, not a persisted task or a request to overwrite one. */
export function duplicateTaskSeed<T extends { id?: string; vendors?: string[]; images?: AssetImage[] }>(task: T): Omit<T, "id"> {
  const { id: _sourceId, ...values } = task;
  return {
    ...values,
    vendors: task.vendors ? [...task.vendors] : undefined,
    images: task.images?.map((image, index) => ({ ...image, id: `duplicate-image-${index}` })),
  };
}
