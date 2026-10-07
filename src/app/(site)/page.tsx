import Image from "next/image";
import { Suspense } from "react";
import { HeroStage } from "@/components/HeroStage";
import { SealMark } from "@/components/SealMark";
import { Shelf, ShelfFromUrl } from "@/components/Shelf";
import { Button } from "@/components/Button";
import { getCatalog } from "@/lib/catalog";
import { OpenNow } from "@/components/OpenNow";
import { formatPrice } from "@/lib/format";
import { SALON, hoursRows } from "@/lib/salon";
import { getServices, getWeek } from "@/lib/salon-data";
import { whatsappChatUrl } from "@/lib/whatsapp";
import styles from "./page.module.css";

export default async function Home() {
  const [catalog, week, services] = await Promise.all([getCatalog(), getWeek(), getServices()]);

  return (
    <main>
      {/* The opening sits on the logo's forest in both themes, like the 3D set behind the bottle. */}
      <section className={styles.hero} data-theme="night" aria-labelledby="hero-title">
        <div className={styles.heroText}>
          <h1 id="hero-title" className={`display-xl ${styles.wordmark}`}>
            عدلي
          </h1>
          <p className="latin-mark">ADLI</p>
          <p className={`body-lg ${styles.lede}`}>صالون حلاقة رجالي، وعطور وكريمات تختارها هنا وتثبّت طلبها على واتساب.</p>
          <Button variant="ghost" href="#shelf">
            تصفّح المنتجات
          </Button>
        </div>
        <div className={styles.heroStage}>
          <HeroStage />
        </div>
      </section>

      <section id="shelf" className={styles.shelf} aria-labelledby="shelf-title" tabIndex={-1}>
        <h2 id="shelf-title" className="title">
          منتجات الصالون
        </h2>
        {catalog.data ? (
          <Suspense fallback={<Shelf categories={catalog.data.categories} products={catalog.data.products} />}>
            <ShelfFromUrl categories={catalog.data.categories} products={catalog.data.products} />
          </Suspense>
        ) : (
          <div className={styles.error} role="alert">
            <p className="body">تعذّر تحميل المنتجات الآن. حاول مرة أخرى بعد قليل.</p>
            <Button variant="ghost" href="/">
              أعد المحاولة
            </Button>
          </div>
        )}
      </section>

      <section id="salon" className={styles.salon} aria-labelledby="salon-title">
        <h2 id="salon-title" className="display-lg">
          الصالون
        </h2>
        <p className={`body-lg ${styles.salonText}`}>
          صالون عدلي للحلاقة الرجالية. العطور والكريمات التي تراها هنا هي ما نستعمله ونثق به، وتطلبها برسالة واتساب
          وتستلمها من الصالون.
        </p>
        <div className={styles.salonLists}>
          <div className={styles.list}>
            <h3 className="title">ساعات الدوام</h3>
            {week ? (
              <>
                <OpenNow week={week} />
                <dl>
                  {hoursRows(week).map((h) => (
                    <div key={h.days} className={styles.row}>
                      <dt>{h.days}</dt>
                      <dd>{h.hours}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="body">تعذّر تحميل ساعات الدوام الآن.</p>
            )}
          </div>
          <div className={styles.list}>
            <h3 className="title">الخدمات والأسعار</h3>
            {services ? (
              <>
                <dl>
                  {services.map((s) => (
                    <div key={s.id} className={styles.row}>
                      <dt>
                        {s.name_ar}
                        {!s.bookable_online && <span className={styles.rowNote}>تُطلب في الصالون مع خدمتك</span>}
                      </dt>
                      <dd>{formatPrice(s.price_ils)}</dd>
                    </div>
                  ))}
                </dl>
                <Button variant="primary" href="/booking">
                  احجز موعد
                </Button>
              </>
            ) : (
              <p className="body">تعذّر تحميل الخدمات الآن.</p>
            )}
          </div>
        </div>
        {SALON.photos.length > 0 && (
          <ul className={styles.photos}>
            {SALON.photos.map((p) => (
              <li key={p.src}>
                <Image src={p.src} alt={p.alt} width={600} height={750} sizes="(max-width: 720px) 100vw, 33vw" />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={styles.closing} aria-labelledby="closing-title">
        <SealMark />
        <h2 id="closing-title" className="title">
          نراك في الصالون
        </h2>
        {SALON.address && <p className="body">{SALON.address}</p>}
        <div className={styles.closingActions}>
          {SALON.mapUrl && (
            <Button variant="ghost" href={SALON.mapUrl} target="_blank" rel="noopener noreferrer">
              افتح الخريطة
            </Button>
          )}
          {/* Ghost on purpose: the WhatsApp fill is reserved for sending an order. */}
          <Button variant="ghost" href={whatsappChatUrl()} target="_blank" rel="noopener noreferrer">
            تواصل على واتساب
          </Button>
        </div>
      </section>
    </main>
  );
}
