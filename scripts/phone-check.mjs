// Phone rules (E3.1): paste, local part, prefix, server check, WhatsApp. Run: npm run check:phone
// The prefix is only ever taken from an explicit +970 / +972 / 00970 / 00972; nothing is guessed.
import { splitPasted, localMobile, fullMobile, parseMobile, normalizeMobile, whatsappDigits, phoneProblem } from "../src/lib/phone.ts";
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} → ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};
// Paste: the prefix changes only on an explicit +970 / +972 / 00970 / 00972.
eq("paste +970599123456", splitPasted("+970599123456"), { prefix: "970", local: "599123456" });
eq("paste +972 52-123-4567", splitPasted("+972 52-123-4567"), { prefix: "972", local: "521234567" });
eq("paste 00970599123456", splitPasted("00970599123456"), { prefix: "970", local: "599123456" });
eq("paste 00972521234567", splitPasted("00972521234567"), { prefix: "972", local: "521234567" });
eq("paste +970 0599 123 456 (0 after prefix)", splitPasted("+970 0599 123 456"), { prefix: "970", local: "0599123456" });
eq("paste \u200E+٩٧٢٥٢١٢٣٤٥٦٧ (Arabic digits)", splitPasted("\u200E+٩٧٢٥٢١٢٣٤٥٦٧"), { prefix: "972", local: "521234567" });
eq("970599123456 (no + or 00): prefix untouched", splitPasted("970599123456"), { prefix: null, local: "970599123456" });
eq("972521234567 (no + or 00): prefix untouched", splitPasted("972521234567"), { prefix: null, local: "972521234567" });
eq("0599123456: prefix untouched", splitPasted("0599123456"), { prefix: null, local: "0599123456" });
eq("599123456: prefix untouched", splitPasted("599123456"), { prefix: null, local: "599123456" });
eq("0521234567: no guess, prefix untouched", splitPasted("0521234567"), { prefix: null, local: "0521234567" });
// Local part.
eq("local 599123456", localMobile("599123456"), "599123456");
eq("local 0599123456 (leading 0 dropped)", localMobile("0599123456"), "599123456");
eq("local ٠٥٩٩١٢٣٤٥٦", localMobile("٠٥٩٩١٢٣٤٥٦"), "599123456");
eq("local 059 912 3456", localMobile("059 912 3456"), "599123456");
eq("local 970599123456 → invalid", localMobile("970599123456"), null);
eq("local 22345678 (landline) → invalid", localMobile("22345678"), null);
eq("local 59912345 (8 digits) → invalid", localMobile("59912345"), null);
eq("local 0599a12345 → invalid", localMobile("0599a12345"), null);
// Full number: the chosen prefix, never a guess (059 with 972, 052 with 970 are both allowed).
eq("970 + 0599123456", fullMobile("970", "0599123456"), "+970599123456");
eq("972 + 0599123456 (no guess)", fullMobile("972", "0599123456"), "+972599123456");
eq("970 + 0521234567 (no guess)", fullMobile("970", "0521234567"), "+970521234567");
// Server check and saved numbers.
eq("normalize +970599123456", normalizeMobile("+970599123456"), "+970599123456");
eq("normalize +972 52 123 4567", normalizeMobile("+972 52 123 4567"), "+972521234567");
eq("normalize 0599123456 (local) → refused", normalizeMobile("0599123456"), null);
eq("normalize 00970599123456 → refused (site sends +)", normalizeMobile("00970599123456"), null);
eq("normalize 970599123456 → refused", normalizeMobile("970599123456"), null);
eq("parse saved +972521234567", parseMobile("+972521234567"), { prefix: "972", local: "521234567" });
eq("parse legacy 0594369494 → null", parseMobile("0594369494"), null);
eq("whatsapp +970594369494", whatsappDigits("+970594369494"), "970594369494");
eq("whatsapp 0594369494 → no link", whatsappDigits("0594369494"), null);
eq("whatsapp null", whatsappDigits(null), null);
// What is wrong with a submitted value (no default prefix: the bare local number means «choose the prefix»).
eq("problem +970599123456 → none", phoneProblem("+970599123456"), null);
eq("problem +972521234567 → none", phoneProblem("+972521234567"), null);
eq("problem empty", phoneProblem(""), "empty");
eq("problem spaces only", phoneProblem("   "), "empty");
eq("problem 0591234567 (no prefix chosen)", phoneProblem("0591234567"), "prefix");
eq("problem 591234567 (no prefix chosen)", phoneProblem("591234567"), "prefix");
eq("problem ٠٥٩١٢٣٤٥٦٧ (no prefix chosen)", phoneProblem("٠٥٩١٢٣٤٥٦٧"), "prefix");
eq("problem +970 + 22345678 (landline)", phoneProblem("+97022345678"), "number");
eq("problem 059123 (too short)", phoneProblem("059123"), "number");
eq("problem +9700591 (prefix, short)", phoneProblem("+9700591"), "number");
console.log(fail ? `\n${fail} FAILED` : "\nall passed");
process.exit(fail ? 1 : 0);
