import type { Metadata } from "next";
import { ActionForm } from "@/components/admin/ActionForm";
import { StaffMember, type Member } from "@/components/admin/StaffMember";
import { addStaff } from "./actions";
import { requireRole } from "@/lib/auth/guards";
import { createClient } from "@/lib/supabase/server";
import formStyles from "@/components/admin/forms.module.css";
import styles from "./staff.module.css";

export const metadata: Metadata = { title: "الطاقم" };

export default async function AdminStaffPage() {
  const { user } = await requireRole(["owner"], "/admin/staff");
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_staff");
  if (error) console.error("admin_staff", error.code, error.message);
  const members = (data ?? []) as Member[];
  const owners = members.filter((m) => m.role === "owner").length;

  return (
    <main className={styles.page}>
      <h1 className="title">الطاقم</h1>
      <p className={formStyles.lede}>
        «طاقم» يدير الطلبات والمنتجات والمخزون والمواعيد. «صاحب الصالون» يرى كل شيء، ومنها الإحصائيات المالية والفئات والطاقم
        والصالون. يبقى صاحب صالون واحد على الأقل دائماً. لربط حساب بحلاق (ليرى عموده ويسكّر أوقاته) افتح «الصالون».
      </p>

      <section className={formStyles.section} aria-labelledby="add-staff">
        <h2 id="add-staff">أضف شخصاً</h2>
        <ActionForm action={addStaff} submit="أضف للطاقم">
          <div className={formStyles.grid}>
            <div className={`ad-field ${formStyles.wide}`}>
              <label htmlFor="staff-email">البريد الإلكتروني</label>
              <input id="staff-email" name="email" type="email" inputMode="email" autoComplete="off" dir="ltr" required />
              <span className="ad-field__hint">يجب أن يكون قد أنشأ حساباً في الموقع بهذا البريد.</span>
            </div>
            <div className="ad-field">
              <label htmlFor="staff-role">الدور</label>
              <select id="staff-role" name="role" defaultValue="staff">
                <option value="staff">طاقم</option>
                <option value="owner">صاحب صالون</option>
              </select>
            </div>
          </div>
        </ActionForm>
      </section>

      {error ? (
        <p className="ad-notice ad-notice--error" role="alert">
          تعذّر تحميل الطاقم. حدّث الصفحة بعد قليل.
        </p>
      ) : (
        <>
          <h2 className={styles.h2}>
            الطاقم الآن ({members.length}){owners === 1 ? " · صاحب صالون واحد" : ""}
          </h2>
          <ul className={styles.list}>
            {members.map((m) => (
              <StaffMember key={m.user_id} member={m} isSelf={m.user_id === user.id} />
            ))}
          </ul>
        </>
      )}
    </main>
  );
}
