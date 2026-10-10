import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/AuthShell";
import { formatDate } from "@/lib/dates";
import { SALON } from "@/lib/salon";
import { pageMeta } from "@/lib/seo";
import { salonTelUrl, whatsappChatUrl, whatsappUrl } from "@/lib/whatsapp";
import styles from "./privacy.module.css";

export const metadata: Metadata = pageMeta({
  title: "سياسة الخصوصية",
  description:
    "ما يجمعه صالون عدلي عند الحساب والحجز والطلب، ولماذا، وأين يُحفظ، وكيف ترى بياناتك أو تعدّلها أو تطلب حذفها.",
  path: "/privacy",
});

/** Change it with every edit to the text below. */
const UPDATED = "2026-10-10T12:00:00+03:00";

/**
 * Written from what the code actually stores (profiles, bookings, orders, private.order_rate_hits, customer notes,
 * flags and blocks; the auth cookie; the cart, theme and code step in the browser). A new field or service: update
 * this page and UPDATED with it.
 */
export default function PrivacyPage() {
  const salonNumber = salonTelUrl().replace("tel:", "");

  return (
    <AuthShell
      title="سياسة الخصوصية"
      lede="باختصار: نجمع ما يلزم لتثبيت موعدك أو طلبك فقط. لا نستعمله للتسويق، ولا نبيعه ولا نعطيه لأحد."
      footer={<Link href="/">الصفحة الرئيسية</Link>}
    >
      <div className={styles.prose}>
        <section aria-labelledby="privacy-who">
          <h2 id="privacy-who">من نحن</h2>
          <p>
            {SALON.name} ({SALON.owner}) للحلاقة الرجالية والعطور في {SALON.city}. لأي سؤال عن بياناتك، راسلنا على واتساب:{" "}
            <a href={whatsappChatUrl()} target="_blank" rel="noopener noreferrer">
              <bdi dir="ltr">{salonNumber}</bdi>
            </a>
            .
          </p>
        </section>

        <section aria-labelledby="privacy-what">
          <h2 id="privacy-what">ما نجمعه</h2>
          <ul>
            <li>
              <strong>الحساب (اختياري):</strong> الاسم والبريد الإلكتروني وكلمة المرور. كلمة المرور تُحفظ مشفّرة بطريقة لا
              تُقرأ، فلا يراها أحد، ولا حتى الصالون. ومن «حسابي» تقدر تضيف منطقتك ورقم جوالك لنملأ بهما الطلب والحجز.
            </li>
            <li>
              <strong>الحجز:</strong> الخدمة والحلاق والوقت، واسمك ورقم جوالك (ويُحفظ الرقم في حسابك أيضاً). ونسجّل ما يحصل
              للموعد: حضرت، أو ألغيت، أو لم تحضر.
            </li>
            <li>
              <strong>الطلب:</strong> المنتجات والكميات، واسمك ورقم جوالك، والمنطقة إن كتبتها. نحفظ الطلب عندنا، ثم يفتح
              واتساب برسالة جاهزة، ويتثبّت الطلب حين ترسلها ونتأكد منه معك.
            </li>
            <li>
              <strong>عنوان الإنترنت (IP) عند إرسال طلب:</strong> لمنع الطلبات المتكررة فقط. يُحفظ وحده، دون اسم أو طلب، ويُحذف
              تلقائياً بعد دقائق.
            </li>
            <li>
              <strong>ملاحظات الصالون:</strong> قد يكتب فريق الصالون ملاحظة داخلية على حسابك، أو يسجّل أنك لم تحضر موعداً، أو
              يوقف الحجز والطلب من الحساب مع ذكر السبب. هذا لإدارة المواعيد فقط، ولا يراه غير فريق الصالون.
            </li>
          </ul>
          <p>لا نجمع موقعك ولا جهات اتصالك، ولا بيانات دفع: لا يوجد دفع على الموقع.</p>
        </section>

        <section aria-labelledby="privacy-why">
          <h2 id="privacy-why">لماذا</h2>
          <p>
            لنثبّت موعدك أو طلبك ونتواصل معك بخصوصه، ولنملأ النموذج عنك في المرة القادمة. لا تسويق ولا رسائل دعائية، ولا نبيع
            بياناتك لأحد.
          </p>
        </section>

        <section aria-labelledby="privacy-where">
          <h2 id="privacy-where">أين تُحفظ ومن يتعامل معها</h2>
          <ul>
            <li>
              <strong>Supabase:</strong> قاعدة البيانات وتسجيل الدخول، على خوادم في فرانكفورت، ألمانيا.
            </li>
            <li>
              <strong>Vercel:</strong> استضافة الموقع.
            </li>
            <li>
              <strong>Resend:</strong> إرسال إيميلات رمز التأكيد.
            </li>
            <li>
              <strong>واتساب:</strong> حين تختار إرسال الطلب أو مراسلتنا، تصل رسالتك عبر واتساب.
            </li>
            <li>
              <strong>خرائط جوجل:</strong> الخريطة في «الموقع» لا تُحمَّل إلا إذا ضغطت عليها. قبل ذلك لا يصل جوجل شيء من
              الموقع.
            </li>
          </ul>
        </section>

        <section aria-labelledby="privacy-cookies">
          <h2 id="privacy-cookies">الكوكيز والتخزين في جهازك</h2>
          <ul>
            <li>كوكيز تسجيل الدخول فقط، حين تدخل لحسابك، لتبقى مسجّلاً.</li>
            <li>
              في متصفحك فقط، ولا يصل إلينا: سلّة الطلب، واختيارك للمظهر الفاتح أو الداكن، وخطوة الرمز أثناء الدخول أو التسجيل.
            </li>
          </ul>
          <p>لا نستعمل كوكيز تتبّع أو إعلانات، ولا أدوات إحصاء.</p>
        </section>

        <section aria-labelledby="privacy-rights">
          <h2 id="privacy-rights">حقوقك</h2>
          <ul>
            <li>
              ترى بياناتك ومواعيدك من <Link href="/account">«حسابي»</Link>، وطلباتك من{" "}
              <Link href="/account/orders">«طلباتي»</Link>.
            </li>
            <li>تعدّل اسمك ومنطقتك ورقم جوالك من «حسابي».</li>
            <li>
              تطلب حذف حسابك وبياناته برسالة واتساب للصالون. بعد الحذف تبقى الطلبات والمواعيد السابقة في سجلّ الصالون للحساب
              والمخزون، دون ربطها بأي حساب.
            </li>
          </ul>
          <a
            className="ad-btn ad-btn--ghost ad-btn--block"
            href={whatsappUrl("مرحباً صالون عدلي، أريد حذف حسابي وبياناتي من الموقع.")}
            target="_blank"
            rel="noopener noreferrer"
          >
            اطلب حذف حسابك
          </a>
        </section>

        <p className={styles.updated}>آخر تحديث: {formatDate(UPDATED)}</p>
      </div>
    </AuthShell>
  );
}
