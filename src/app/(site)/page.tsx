import Image from "next/image";
import { Suspense } from "react";
import { HeroStage } from "@/components/HeroStage";
import { SalonLocation } from "@/components/SalonLocation";
import { Shelf, ShelfFromUrl } from "@/components/Shelf";
import { Button } from "@/components/Button";
import { ChairGallery } from "@/components/gallery/ChairGallery";
import { getCatalog } from "@/lib/catalog";
import { GALLERY_MIN, getGallery } from "@/lib/gallery";
import { OpenNow } from "@/components/OpenNow";
import { formatPrice } from "@/lib/format";
import { SALON, hoursRows } from "@/lib/salon";
import { getServices, getWeek } from "@/lib/salon-data";
import styles from "./page.module.css";

export default async function Home() {
  const [catalog, week, services, gallery] = await Promise.all([getCatalog(), getWeek(), getServices(), getGallery()]);

  return (
    <main>
      {/* The opening sits on the logo's forest in both themes, like the 3D set behind the bottle. */}
      <section className={styles.hero} data-theme="night" data-layer aria-labelledby="hero-title">
        <div className={styles.heroText}>
          <h1 id="hero-title" className={`display-xl ${styles.wordmark}`}>
            عدلي
          </h1>
          <p className="latin-mark">ADLI</p>
          <p className={`body-lg ${styles.lede}`}>صالون حلاقة رجالي، وعطور وكريمات تختارها هنا وتثبّت طلبها على واتساب.</p>
          <Button variant="ghost" href="#shelf">
            تصفّح المنتجات
          </Button>
          {week && (
            <div className={styles.heroOpen}>
              <OpenNow week={week} />
            </div>
          )}
        </div>
        <div className={styles.heroStage}>
          <HeroStage />
        </div>
      </section>

      {/* U4: the hero stays pinned (CSS sticky) and each section after it rises over the one before, on its own layer
          with a brass top edge. U5.2 (motion layer, data-layer): the section layers stick at their own bottom edge too,
          so the next one rises over each of them, and the layer being covered dims. */}
      <div className={styles.curtain} data-covers-hero data-layer="rise">
      <section id="shelf" className={styles.shelf} aria-labelledby="shelf-title" tabIndex={-1}>
        <h2 id="shelf-title" className="display-lg" data-motion="words">
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

      </div>

      {/* زبايننا المرتّبين (U5.3, the gallery): the salon's photos and silent videos, from 3 published items. */}
      {gallery && gallery.length >= GALLERY_MIN && (
        <div className={styles.curtain} data-covers-hero data-layer="rise">
          <ChairGallery items={gallery} />
        </div>
      )}

      <div className={`${styles.curtain} ${styles.curtainSunk}`} data-covers-hero data-layer="rise">
      <section id="salon" className={styles.salon} aria-labelledby="salon-title">
        <div className={styles.salonHead}>
          <h2 id="salon-title" className="display-lg" data-motion="words">
            الصالون
          </h2>
          <p className={`body-lg ${styles.salonText} ad-reveal`}>
            صالون عدلي للحلاقة الرجالية. العطور والكريمات التي تراها هنا هي ما نستعمله ونثق به، وتطلبها برسالة واتساب
            وتستلمها من الصالون.
          </p>
        </div>

        <div className={styles.salonGrid}>
          {/* The price board: a paper card on the wall, cream in both themes, a brass double hairline like the seal. */}
          <div className={`${styles.board} ad-reveal`} data-theme="day">
            <div className={styles.boardInner}>
              <h3 className={styles.boardTitle}>الخدمات والأسعار</h3>
              {services ? (
                <>
                  <ul className={styles.prices} data-motion="price-list">
                    {services
                      .filter((s) => s.bookable_online)
                      .map((s) => (
                        <li key={s.id}>
                          <span className={styles.priceName}>
                            {s.name_ar}
                            {s.duration_min && <small>{s.duration_min} دقيقة</small>}
                          </span>
                          <span className={styles.leader} aria-hidden="true" data-leader />
                          <span className={styles.priceValue} data-count={s.price_ils}>
                            {formatPrice(s.price_ils)}
                          </span>
                        </li>
                      ))}
                  </ul>
                  {services.some((s) => !s.bookable_online) && (
                    <>
                      <p className={styles.addonsTitle}>إضافات تُطلب في الصالون مع خدمتك</p>
                      <ul className={`${styles.prices} ${styles.addons}`} data-motion="price-list">
                        {services
                          .filter((s) => !s.bookable_online)
                          .map((s) => (
                            <li key={s.id}>
                              <span className={styles.priceName}>{s.name_ar}</span>
                              <span className={styles.leader} aria-hidden="true" data-leader />
                              <span className={styles.priceValue} data-count={s.price_ils}>
                                {formatPrice(s.price_ils)}
                              </span>
                            </li>
                          ))}
                      </ul>
                    </>
                  )}
                  <Button variant="primary" href="/booking" data-magnetic>
                    احجز موعد
                  </Button>
                </>
              ) : (
                <p className="body">تعذّر تحميل الخدمات الآن.</p>
              )}
            </div>
          </div>

          <aside className={styles.salonSide} aria-label="ساعات الدوام">
            {/* Wide screens only: the shears' first frame, still (a CSS background inside a media query, so phones never
                fetch it; never the other frames, never turning: the turning shears are /booking's). */}
            <span className={styles.shearsStill} aria-hidden="true" />
            <h3 className="title">ساعات الدوام</h3>
            {week ? (
              <>
                <OpenNow week={week} />
                <dl className={styles.hours}>
                  {hoursRows(week).map((h) => (
                    <div key={h.days}>
                      <dt>{h.days}</dt>
                      <dd>{h.hours}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className="body">تعذّر تحميل ساعات الدوام الآن.</p>
            )}
          </aside>
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
      </div>

      <div className={styles.curtain} data-covers-hero data-layer="rise">
        <SalonLocation />
      </div>
    </main>
  );
}
