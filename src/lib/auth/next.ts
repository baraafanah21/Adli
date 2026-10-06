/** Only same-site paths: "/account" yes; "//evil.com", "https://…", "/\\evil" no. */
export function safeNext(value: string | null | undefined, fallback = "/account") {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  return value;
}
