/**
 * Structured data for search engines (src/lib/seo.ts builds it). JSON.stringify doesn't escape HTML, so «<», «>» and
 * «&» are written as \u escapes: a name holding «</script>» or «<!--» can't close or break the tag.
 */
export function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  const json = JSON.stringify(data)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026");
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: json }} />;
}
