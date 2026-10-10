import type { Metadata } from "next";
import type { ProductDetail } from "@/lib/catalog";
import { productImageSrc } from "@/lib/format";
import { SALON, type Week, type Weekday } from "@/lib/salon";
import type { SalonService } from "@/lib/salon-data";
import type { GalleryItem } from "@/lib/gallery";
import { GALLERY_MIN } from "@/lib/gallery";
import { backdropPhotos, rowItems } from "@/lib/gallery-items";

/*
  Search and sharing: the site's absolute address, each public page's metadata (title, description, canonical, Open
  Graph, Twitter) and the JSON-LD the pages print through <JsonLd> (src/components/JsonLd.tsx). Server only (reads
  env at build / render), no session.

  Open Graph is merged shallowly between segments: a page that sets `openGraph` replaces the layout's whole object,
  the file-based picture included, so every page builds it with pageMeta(), never by hand, and pageMeta() always names
  a picture: the page's own (the product photo) or the shared one, app/opengraph-image.tsx.
*/

/** Vercel sets VERCEL_PROJECT_PRODUCTION_URL on every deployment (the primary domain, adlisalon.com), so Preview pages
 *  point at the live site too; locally it is the dev server. */
export const SITE_URL = process.env.VERCEL_PROJECT_PRODUCTION_URL
  ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
  : "http://localhost:3000";

export const absolute = (path: string) => new URL(path, SITE_URL).toString();

export const SITE_NAME = "عدلي";
/** The shared picture (app/opengraph-image.tsx) and its alt text. */
export const SHARE_IMAGE = { url: "/opengraph-image", width: 1200, height: 630, type: "image/png", alt: "عدلي، صالون حلاقة رجالية في قلقيلية" };
export const SITE_TITLE = "صالون عدلي | حلاق وعطور في قلقيلية – Adli Salon";
/** Google may show a large image preview and choose the snippet length; no limit on video previews (robots meta,
 *  https://developers.google.com/search/docs/crawling-indexing/robots-meta-tag). Private pages set index: false. */
export const ROBOTS = { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } as const;

export const SITE_DESCRIPTION =
  "صالون عدلي (أبو عادل) للحلاقة الرجالية والعطور في قلقيلية: احجز موعدك من الموقع، واطلب العطور والكريمات برسالة واتساب.";

/** Under 160 characters, cut at a word. */
export function clampDescription(text: string, max = 158): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (flat.length <= max) return flat;
  const cut = flat.slice(0, max - 1);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 80 ? cut.lastIndexOf(" ") : cut.length)}…`;
}

type PageMetaInput = {
  /** Page title (the layout's template adds «| عدلي»); omitted on the home page. */
  title?: string;
  /** A whole title that names the salon itself («عطور في قلقيلية | صالون عدلي»), instead of the template. */
  fullTitle?: string;
  description: string;
  /** Canonical path, e.g. "/products". */
  path: string;
  /** A page's own shared picture (the product photo); default: app/opengraph-image.tsx. */
  image?: { url: string; alt: string; width?: number; height?: number };
  type?: "website" | "article";
};

/** Title, description, canonical, Open Graph and Twitter for one public page. */
export function pageMeta({ title, fullTitle, description, path, image, type = "website" }: PageMetaInput): Metadata {
  const shareTitle = fullTitle ?? (title ? `${title} | ${SITE_NAME}` : SITE_TITLE);
  const picture = image ?? SHARE_IMAGE;
  return {
    ...(fullTitle ? { title: { absolute: fullTitle } } : title ? { title } : { title: { absolute: SITE_TITLE } }),
    description,
    alternates: { canonical: path },
    openGraph: {
      type,
      locale: "ar_AR",
      siteName: SALON.name,
      url: path,
      title: shareTitle,
      description,
      images: [picture],
    },
    twitter: {
      card: "summary_large_image",
      title: shareTitle,
      description,
      images: [{ url: picture.url, alt: picture.alt }],
    },
  };
}

/* ---------- JSON-LD ---------- */

type Thing = Record<string, unknown>;

const AVAILABILITY = {
  in: "https://schema.org/InStock",
  low: "https://schema.org/LimitedAvailability",
  out: "https://schema.org/OutOfStock",
} as const;

const SCHEMA_DAY: Record<Weekday, string> = {
  0: "https://schema.org/Sunday",
  1: "https://schema.org/Monday",
  2: "https://schema.org/Tuesday",
  3: "https://schema.org/Wednesday",
  4: "https://schema.org/Thursday",
  5: "https://schema.org/Friday",
  6: "https://schema.org/Saturday",
};
const WEEK_ORDER: Weekday[] = [6, 0, 1, 2, 3, 4, 5];

/** The salon's number for schema.org, from NEXT_PUBLIC_WHATSAPP_NUMBER (digits, international): "+970…". */
function salonTelephone(): string | undefined {
  const digits = process.env.NEXT_PUBLIC_WHATSAPP_NUMBER?.replace(/\D/g, "");
  return digits ? `+${digits}` : undefined;
}

/** «₪ 20 – ₪ 60» from the online services' prices; undefined when there are none. */
function priceRange(services: SalonService[] | null): string | undefined {
  const prices = (services ?? []).map((s) => s.price_ils).filter((p) => p > 0);
  if (!prices.length) return undefined;
  const [low, high] = [Math.min(...prices), Math.max(...prices)];
  return low === high ? `₪ ${low}` : `₪ ${low} – ₪ ${high}`;
}

/**
 * The salon photos the home page shows, for its JSON-LD `image` and its shared picture: the gallery's backdrop photos
 * and the featured video's poster, then the row's cards (a photo or a video's poster); only when the section is on the page (from
 * GALLERY_MIN items in the row), since structured data and previews describe what people see. Large files.
 */
export function salonPhotos(items: GalleryItem[] | null, max = 3): { url: string; id: string }[] {
  if (!items || rowItems(items).length < GALLERY_MIN) return [];
  const featured = items.filter((i) => i.featured && i.poster).map((i) => ({ url: i.poster!, id: i.id }));
  const backdrops = backdropPhotos(items).map((i) => ({ url: i.src, id: i.id }));
  // The row's cards: a photo, or a video's poster (the frame its card shows).
  const cards = rowItems(items)
    .filter((i) => !i.featured)
    .map((i) => ({ url: i.kind === "image" ? i.src : (i.poster ?? i.sm), id: i.id }));
  return [...backdrops, ...featured, ...cards].slice(0, max);
}

/** The price board's services as offers: one Service each, priced in shekels, the same list and prices the page shows. */
function serviceOffers(services: SalonService[]): Thing[] {
  return services.map((s) => ({
    "@type": "Offer",
    itemOffered: { "@type": "Service", name: s.name_ar, provider: { "@id": absolute("/#salon") } },
    priceCurrency: "ILS",
    price: s.price_ils,
  }));
}

/** The home page's name for Google's site names: one WebSite node (https://developers.google.com/search/docs/appearance/site-names). */
export function websiteJsonLd(): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": absolute("/#website"),
    name: SALON.name,
    alternateName: [SITE_NAME, SALON.nameEn],
    url: absolute("/"),
    inLanguage: "ar",
  };
}

/**
 * The home page's business. One place that cuts hair and sells perfume is one LocalBusiness with two types,
 * `["HairSalon", "Store"]` (schema.org has no BarberShop; a JSON-LD @type may be a list), not a @graph of two
 * businesses at the same address, which would read as two separate places with one name. Opening hours come from
 * `salon_hours` (getWeek()): a weekday with no row is closed and left out, as schema.org expects. The products the
 * page shows are its offers (`hasOfferCatalog`), from the same cached catalog as the shelf (live products only).
 */
export function salonJsonLd(week: Week | null, services: SalonService[] | null, photos: { url: string }[] = []): Thing {
  const telephone = salonTelephone();
  const range = priceRange(services);
  const logo = absolute("/brand/icons/icon-512.png");
  return {
    "@context": "https://schema.org",
    "@type": ["HairSalon", "Store"],
    "@id": absolute("/#salon"),
    name: SALON.name,
    alternateName: [SITE_NAME, SALON.owner, SALON.nameEn, "Adli", SALON.ownerEn],
    description: SITE_DESCRIPTION,
    url: absolute("/"),
    logo,
    // Real salon photos when the page shows them (salonPhotos), else the logo.
    image: photos.length ? photos.map((p) => p.url) : logo,
    address: {
      "@type": "PostalAddress",
      ...(SALON.address && { streetAddress: SALON.address }),
      addressLocality: SALON.city,
      addressCountry: "PS",
    },
    ...(SALON.geo && { geo: { "@type": "GeoCoordinates", latitude: SALON.geo.lat, longitude: SALON.geo.lng } }),
    ...(SALON.mapUrl && { hasMap: SALON.mapUrl }),
    ...(telephone && { telephone }),
    ...(week && {
      openingHoursSpecification: WEEK_ORDER.filter((d) => week[d]).map((d) => ({
        "@type": "OpeningHoursSpecification",
        dayOfWeek: SCHEMA_DAY[d],
        opens: week[d]!.open,
        closes: week[d]!.close,
      })),
    }),
    ...(range && { priceRange: range }),
    currenciesAccepted: "ILS",
    ...(SALON.instagram && { sameAs: [SALON.instagram] }),
    // The services only. The home shelf's products are left out: a Product there has no offers of its own, so Search
    // Console reads each one as an incomplete product snippet; every product has its full Product + Offer on /p/.
    ...(services?.length && {
      hasOfferCatalog: { "@type": "OfferCatalog", name: "الخدمات والأسعار", itemListElement: serviceOffers(services) },
    }),
  };
}

/** /p/<slug>: the product with its price in shekels and its availability (best state across the variants). */
export function productJsonLd(product: ProductDetail): Thing {
  const image = productImageSrc(product.image_path, "lg");
  const prices = product.variants.map((v) => v.price_ils);
  const url = absolute(`/p/${product.slug}`);
  const availability = AVAILABILITY[product.stock_state];
  const offers =
    prices.length > 1 && product.price_varies
      ? {
          "@type": "AggregateOffer",
          priceCurrency: "ILS",
          lowPrice: Math.min(...prices),
          highPrice: Math.max(...prices),
          offerCount: prices.length,
          availability,
          url,
        }
      : { "@type": "Offer", priceCurrency: "ILS", price: product.price_ils, availability, url, seller: { "@id": absolute("/#salon") } };
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name_ar,
    ...(product.description_ar && { description: product.description_ar }),
    ...(image && { image: absolute(image) }),
    sku: product.variants[0]?.sku ?? product.slug,
    ...(product.category && { category: product.category.name_ar }),
    url,
    offers,
  };
}

/** Breadcrumbs from the home page down to this page; the last one is the page itself. */
export function breadcrumbJsonLd(trail: { name: string; path: string }[]): Thing {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [{ name: "الرئيسية", path: "/" }, ...trail].map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.name,
      item: absolute(c.path),
    })),
  };
}
