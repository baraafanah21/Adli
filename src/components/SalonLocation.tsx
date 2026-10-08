import { Button } from "@/components/Button";
import { MapOnTap } from "@/components/MapOnTap";
import { SALON } from "@/lib/salon";
import { whatsappChatUrl } from "@/lib/whatsapp";
import styles from "./SalonLocation.module.css";

/**
 * «الموقع» (U4), the home page's last section before the footer: the address (SALON in src/lib/salon.ts, one value),
 * «افتح في خرائط جوجل», WhatsApp, and the map that loads only on tap. Static: no session, no data request.
 */
export function SalonLocation() {
  const place = SALON.address ?? SALON.city;
  return (
    <section id="location" className={styles.location} aria-labelledby="location-title">
      <div className={styles.text}>
        <h2 id="location-title" className="display-lg" data-motion="words">
          الموقع
        </h2>
        <p className={`body-lg ${styles.address} ad-reveal`}>{place}</p>
        <div className={styles.actions}>
          {SALON.mapUrl && (
            <Button variant="primary" href={SALON.mapUrl} target="_blank" rel="noopener noreferrer">
              افتح في خرائط جوجل
            </Button>
          )}
          {/* Ghost on purpose: the WhatsApp fill is reserved for sending an order. */}
          <Button variant="ghost" href={whatsappChatUrl()} target="_blank" rel="noopener noreferrer">
            تواصل على واتساب
          </Button>
        </div>
      </div>
      {SALON.geo && <MapOnTap lat={SALON.geo.lat} lng={SALON.geo.lng} image={SALON.mapImage} label={place} />}
    </section>
  );
}
