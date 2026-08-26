const AMANTE_POLAND_GOOSE_GROUP = "폴란드 구스";

export function productGroupLabel(product: string, brandKey?: string) {
  if (brandKey !== "amante") return product;

  return product === AMANTE_POLAND_GOOSE_GROUP || product.startsWith(`${AMANTE_POLAND_GOOSE_GROUP} (`)
    ? AMANTE_POLAND_GOOSE_GROUP
    : product;
}
