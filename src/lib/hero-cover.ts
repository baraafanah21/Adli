/**
 * Whether the pinned hero is fully covered by the sections rising over it (U4 stacking). The hero never leaves the
 * screen while pinned, so an ordinary IntersectionObserver on it can't tell. It is fully hidden once one of the layers
 * after it ([data-covers-hero]) reaches the header's bottom edge: watch a band from the top of the screen to just under
 * the header, and count the layers inside it. Used by the bottle (WebGL) and the shears (2D) to stop drawing.
 * Returns a cleanup function.
 */
export function watchHeroCover(onChange: (covered: boolean) => void): () => void {
  const covering = new Set<Element>();
  let io: IntersectionObserver | undefined;

  const watch = () => {
    io?.disconnect();
    covering.clear();
    const headerBottom = Math.ceil(document.querySelector("header")?.getBoundingClientRect().bottom ?? 0) + 1;
    io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) covering.add(e.target);
          else covering.delete(e.target);
        }
        onChange(covering.size > 0);
      },
      { rootMargin: `0px 0px ${headerBottom - window.innerHeight}px 0px` },
    );
    document.querySelectorAll("[data-covers-hero]").forEach((el) => io!.observe(el));
  };

  watch();
  window.addEventListener("resize", watch);
  return () => {
    window.removeEventListener("resize", watch);
    io?.disconnect();
  };
}
