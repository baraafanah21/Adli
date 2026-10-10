/*
  A person's name at sign-up: «الاسم الأول» and «اسم العائلة», each required, at least 2 letters, Arabic or English
  letters and spaces only (harakat fine; no digits, no symbols). Saved together in the one field there is,
  profiles.full_name = «الأول العائلة» (trimmed, inner spaces collapsed), so nothing else changes. Safe in the browser.
*/

export const NAME_PART_MIN = 2;
export const NAME_PART_MAX = 40;

export type NamePart = "first" | "last";
export type NameProblem = "empty" | "short" | "chars" | "long";

/** Spaces trimmed and collapsed. */
export const tidyName = (v: string) => v.trim().replace(/\s+/g, " ");

/** Every character a space, or an Arabic / Latin letter or mark (Arabic-Indic digits and ٪ ، are not letters). */
const ALLOWED = /^(?:\s|(?=[\p{L}\p{M}])[\p{Script=Arabic}\p{Script=Latin}\p{Script=Inherited}])+$/u;

export function nameProblem(v: string): NameProblem | null {
  const t = tidyName(v);
  if (t === "") return "empty";
  if (!ALLOWED.test(t)) return "chars";
  if ((t.match(/\p{L}/gu) ?? []).length < NAME_PART_MIN) return "short";
  if (t.length > NAME_PART_MAX) return "long";
  return null;
}

const LABEL: Record<NamePart, string> = { first: "الاسم الأول", last: "اسم العائلة" };

export function nameMessage(part: NamePart, problem: NameProblem): string {
  switch (problem) {
    case "empty":
      return part === "first" ? "اكتب اسمك الأول." : "اكتب اسم العائلة.";
    case "short":
      return `${LABEL[part]} حرفان على الأقل.`;
    case "chars":
      return `${LABEL[part]} بالحروف العربية أو الإنجليزية فقط، بلا أرقام أو رموز.`;
    case "long":
      return `${LABEL[part]} ${NAME_PART_MAX} حرفاً على الأكثر.`;
  }
}

/** The saved form: «الأول العائلة». */
export const joinName = (first: string, last: string) => `${tidyName(first)} ${tidyName(last)}`;

/** A saved name of one word (an older account, or typed so in «بياناتي»): worth a gentle nudge to complete it. */
export const isSingleWord = (name: string | null | undefined) => {
  const t = tidyName(name ?? "");
  return t !== "" && !t.includes(" ");
};
