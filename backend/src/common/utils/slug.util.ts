export const SLUG_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/** "Multfilm Klassika" -> "multfilm-klassika", "Ta’limiy" -> "talimiy" */
export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[‘’ʻʼ'`"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}
