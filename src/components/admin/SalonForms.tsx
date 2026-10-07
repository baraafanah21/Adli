"use client";

import { useId } from "react";
import { ActionForm } from "@/components/admin/ActionForm";
import { saveBarber, saveHours, saveService } from "@/app/admin/salon/actions";
import styles from "./forms.module.css";

export type AdminBarber = {
  id: string;
  name_ar: string;
  user_id: string | null;
  linked_name: string | null;
  linked_email: string | null;
  is_active: boolean;
  sort: number;
  upcoming: number;
};

export type StaffOption = { user_id: string; label: string };

export type AdminService = {
  id: string;
  slug: string;
  name_ar: string;
  price_ils: number;
  duration_min: number | null;
  bookable_online: boolean;
  sort: number;
  is_active: boolean;
};

/** A barber: name, the staff account that sees «(أنت)» on his column, order, shown or not. */
export function BarberForm({ barber, staff, nextSort }: { barber?: AdminBarber; staff: StaffOption[]; nextSort: number }) {
  const ids = { name: useId(), user: useId(), sort: useId() };
  return (
    <ActionForm action={saveBarber} submit={barber ? "حفظ" : "أضف الحلاق"}>
      <input type="hidden" name="id" value={barber?.id ?? ""} />
      <div className={styles.grid}>
        <div className="ad-field">
          <label htmlFor={ids.name}>الاسم كما يراه الزبون</label>
          <input id={ids.name} name="name" maxLength={40} required defaultValue={barber?.name_ar ?? ""} />
        </div>
        <div className="ad-field">
          <label htmlFor={ids.user}>حساب الطاقم المربوط (اختياري)</label>
          <select id={ids.user} name="userId" defaultValue={barber?.user_id ?? ""}>
            <option value="">بدون حساب</option>
            {staff.map((s) => (
              <option key={s.user_id} value={s.user_id}>
                {s.label}
              </option>
            ))}
          </select>
          <span className="ad-field__hint">الحلاق المربوط يرى عموده باسمه، ويسكّر أوقاته بنفسه.</span>
        </div>
        <div className="ad-field">
          <label htmlFor={ids.sort}>الترتيب</label>
          <input id={ids.sort} name="sort" type="number" inputMode="numeric" defaultValue={barber?.sort ?? nextSort} dir="ltr" />
        </div>
        <label className="ad-check">
          <input type="checkbox" name="active" defaultChecked={barber?.is_active ?? true} />
          يظهر للحجز
        </label>
      </div>
      {barber && barber.upcoming > 0 && (
        <p className={styles.muted}>عنده {barber.upcoming} مواعيد قادمة: لا يمكن إخفاؤه حتى تُلغى أو تُنقل.</p>
      )}
    </ActionForm>
  );
}

export function ServiceForm({ service, nextSort }: { service?: AdminService; nextSort: number }) {
  const ids = { name: useId(), slug: useId(), price: useId(), duration: useId(), sort: useId() };
  return (
    <ActionForm action={saveService} submit={service ? "حفظ" : "أضف الخدمة"}>
      <input type="hidden" name="id" value={service?.id ?? ""} />
      <div className={styles.grid}>
        <div className="ad-field">
          <label htmlFor={ids.name}>الاسم</label>
          <input id={ids.name} name="name" maxLength={60} required defaultValue={service?.name_ar ?? ""} />
        </div>
        <div className="ad-field">
          <label htmlFor={ids.slug}>الرابط (إنجليزي)</label>
          <input id={ids.slug} name="slug" maxLength={40} required dir="ltr" placeholder="full-cut" defaultValue={service?.slug ?? ""} />
        </div>
        <div className="ad-field">
          <label htmlFor={ids.price}>السعر بالشيكل</label>
          <input id={ids.price} name="price" type="number" inputMode="numeric" min={0} max={10000} required dir="ltr" defaultValue={service?.price_ils ?? ""} />
        </div>
        <div className="ad-field">
          <label htmlFor={ids.duration}>المدة بالدقائق</label>
          <input
            id={ids.duration}
            name="duration"
            type="number"
            inputMode="numeric"
            min={5}
            max={240}
            step={5}
            dir="ltr"
            defaultValue={service?.duration_min ?? ""}
          />
          <span className="ad-field__hint">فارغة للإضافات التي تُطلب في الصالون.</span>
        </div>
        <div className="ad-field">
          <label htmlFor={ids.sort}>الترتيب</label>
          <input id={ids.sort} name="sort" type="number" inputMode="numeric" defaultValue={service?.sort ?? nextSort} dir="ltr" />
        </div>
        <div>
          <label className="ad-check">
            <input type="checkbox" name="bookable" defaultChecked={service?.bookable_online ?? true} />
            تُحجز من الموقع
          </label>
          <label className="ad-check">
            <input type="checkbox" name="active" defaultChecked={service?.is_active ?? true} />
            تظهر في الموقع
          </label>
        </div>
      </div>
    </ActionForm>
  );
}

/** One weekday: opening and closing time, or closed. */
export function HoursForm({ weekday, name, open, close }: { weekday: number; name: string; open: string | null; close: string | null }) {
  const ids = { open: useId(), close: useId() };
  return (
    <ActionForm action={saveHours} submit="حفظ" variant="ghost">
      <input type="hidden" name="weekday" value={weekday} />
      <div className={styles.row}>
        <strong className={styles.dayName}>{name}</strong>
        <div className="ad-field">
          <label htmlFor={ids.open}>يفتح</label>
          <input id={ids.open} name="open" type="time" step={900} defaultValue={open ?? "12:00"} dir="ltr" />
        </div>
        <div className="ad-field">
          <label htmlFor={ids.close}>يغلق</label>
          <input id={ids.close} name="close" type="time" step={900} defaultValue={close ?? "22:00"} dir="ltr" />
        </div>
        <label className="ad-check">
          <input type="checkbox" name="closed" defaultChecked={open === null} />
          مغلق
        </label>
      </div>
    </ActionForm>
  );
}
