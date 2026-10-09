import type { Metadata } from "next";
import { GalleryManager, type AdminGalleryItem } from "@/components/admin/gallery/GalleryManager";
import { deleteGalleryItem, prepareGalleryVideo, reorderGallery, setGalleryFeatured, setGalleryPublished } from "./actions";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import { galleryFileUrl, type GalleryAspect } from "@/lib/gallery";
import formStyles from "@/components/admin/forms.module.css";
import styles from "@/app/admin/admin-page.module.css";

export const metadata: Metadata = { title: "المعرض" };

type Row = {
  id: string;
  kind: "image" | "video";
  aspect: GalleryAspect;
  storage_path: string;
  poster_path: string | null;
  sm_path: string;
  duration_ms: number | null;
  is_published: boolean;
  is_featured: boolean;
};

/** «المعرض» (U5.3, owner only): what «زبايننا المرتّبين» on the home page shows, in this order. */
export default async function AdminGalleryPage() {
  await requireRole(["owner"], "/admin/gallery");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_gallery_items");
  if (error) console.error("admin_gallery_items", error.code, error.message);

  const items: AdminGalleryItem[] = ((data ?? []) as Row[]).map((r) => ({
    id: r.id,
    kind: r.kind,
    aspect: r.aspect,
    src: galleryFileUrl(r.storage_path),
    sm: galleryFileUrl(r.sm_path),
    durationMs: r.duration_ms,
    published: r.is_published,
    featured: r.is_featured,
  }));
  const published = items.filter((i) => i.published).length;

  return (
    <main className={styles.page}>
      <h1 className="title">المعرض</h1>
      <p className={formStyles.lede}>
        صور الصالون وفيديوهاته في «زبايننا المرتّبين» على الرئيسية، بالترتيب الذي تراه هنا. يظهر القسم حين يكون فيه 3 عناصر منشورة أو
        أكثر (الآن: {published}). الفيديو صامت دائماً، ولا يُكتب على العناصر شيء.
      </p>
      {error && (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل المعرض الآن. حدّث الصفحة بعد قليل.
        </p>
      )}
      <GalleryManager
        items={items}
        actions={{
          setPublished: setGalleryPublished,
          setFeatured: setGalleryFeatured,
          reorder: reorderGallery,
          remove: deleteGalleryItem,
          prepareVideo: prepareGalleryVideo,
        }}
      />
    </main>
  );
}
