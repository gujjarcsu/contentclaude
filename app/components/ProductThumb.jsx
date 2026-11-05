/**
 * ProductThumb — the merchant's own product photo, at list size.
 *
 * Redesign (Nov 2026): every top app in the category shows each row's real
 * product image (Smart SEO's meta-tag list, Tapita's content list); a list of
 * identical placeholder icons reads as a template. The image is the product's
 * featured media from Shopify. Polaris's own image icon appears only when the
 * product truly has no image — which is itself a finding, so it is never
 * dressed up as an illustration.
 */
import { Thumbnail } from "@shopify/polaris";
import { ImageIcon } from "@shopify/polaris-icons";

/**
 * @param {object} props
 * @param {string} [props.url]   the featured image URL, or empty when the product has none
 * @param {string} [props.alt]   the image's own alt text; decorative ("") beside the title by default
 * @param {"extraSmall"|"small"|"medium"|"large"} [props.size]
 */
export function ProductThumb({ url, alt = "", size = "small" }) {
  return <Thumbnail source={url || ImageIcon} alt={url ? alt : ""} size={size} />;
}

export default ProductThumb;
