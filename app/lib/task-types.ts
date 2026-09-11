export const BRAND_KEYS = ["amante", "imbedding", "serendiment", "sommier"] as const;

export type BrandKey = (typeof BRAND_KEYS)[number];

export type ImageHtmlTarget = "common" | "general" | "kurly";

export type AssetImage = {
  id: string;
  name: string;
  url: string;
  mimeType?: string;
  size?: number;
  htmlTarget?: ImageHtmlTarget;
  // Retained for tasks and share snapshots saved before the target menu.
  excludeFromKurly?: boolean;
};

export type AssetTask = {
  id: string;
  brandKey: BrandKey;
  productName: string;
  itemName: string;
  optionName: string;
  storeLink: string;
  vendors: string[];
  note: string;
  thumbnailNas: string;
  detailNas: string;
  shootingNas: string;
  images: AssetImage[];
};

export type TaskDraft = Omit<AssetTask, "id" | "images">;
