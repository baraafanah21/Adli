import type { Metadata } from "next";
import Link from "next/link";
import { NewProductForm } from "@/components/admin/NewProductForm";
import { ArrowBackIcon } from "@/components/icons";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import styles from "../products.module.css";

export const metadata: Metadata = { title: "منتج جديد" };

export default async function NewProductPage({ searchParams }: PageProps<"/admin/products/new">) {
  await requireRole(["owner", "staff"], "/admin/products/new");
  const sp = await searchParams;
  const supabase = await createClient();
  const { data: categories } = await supabase.from("categories").select("id, name_ar").order("sort");

  return (
    <main className={styles.page}>
      <Link className={styles.back} href="/admin/products">
        <ArrowBackIcon />
        المنتجات
      </Link>
      <h1 className="title">منتج جديد</h1>
      <NewProductForm categories={categories ?? []} defaultKind={sp.kind === "bundle" ? "bundle" : "simple"} />
    </main>
  );
}
