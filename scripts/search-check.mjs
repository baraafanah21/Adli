// Product search (src/lib/search.ts): Arabic normalising, «ال», partial words, English, ranking. Run: npm run check:search
import { normalizeSearch, searchWords, buildSearchIndex, searchIndex, cleanQuery } from "../src/lib/search.ts";
let fail = 0;
const eq = (label, got, want) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} ${label} → ${JSON.stringify(got)}${ok ? "" : ` (want ${JSON.stringify(want)})`}`);
};

// Normalising.
eq("أ إ آ ٱ → ا", normalizeSearch("أإآٱ"), "اااا");
eq("ة → ه", normalizeSearch("فواكة"), "فواكه");
eq("ى → ي", normalizeSearch("موسى"), "موسي");
eq("harakat and shadda dropped", normalizeSearch("عِطْرٌ مُرَكَّز"), "عطر مركز");
eq("tatweel dropped", normalizeSearch("عـــطر"), "عطر");
eq("dagger alif dropped", normalizeSearch("رحمٰن"), "رحمن");
eq("Latin lower case, accents dropped", normalizeSearch("Élixir YOU"), "elixir you");
eq("Arabic-Indic digits", normalizeSearch("٩pm"), "9pm");
eq("query words, «ال» dropped", searchWords("البحر الأزرق"), ["بحر", "ازرق"]);
eq("«ال» kept when too short (ال، الب)", searchWords("ال الب"), ["ال", "الب"]);
eq("split on punctuation", searchWords("كاف - KAF"), ["كاف", "kaf"]);
eq("query cleaned", cleanQuery("  هوس   ايس  "), "هوس ايس");
eq("query cut at 80", cleanQuery("ا".repeat(100)).length, 80);
eq("null query", cleanQuery(null), "");

// Ranking, over a slice of the real catalog: [name, family, category, slug].
const items = [
  ["هوس تروبيكال", null, "عطور", "hawas-tropical"],
  ["نسيم البحر", "عطر منعش", "عطور", "nasim-al-bahr"],
  ["كريم الحلاقة", "المنثول والألوفيرا", "كريمات", "shaving-cream"],
  ["بلسم ما بعد الحلاقة", "الألوفيرا والبابونج", "كريمات", "after-shave-balm"],
  ["اوديسي - Odyssey", "عطر شرقي", "عطور", "odyssey-elixir"],
  ["هوس الكسير", null, "عطور", "hawas-elixir"],
  ["قمرة", null, "عطور", "qomra"],
  ["زارجوزا", "فواكة منعشه", "عطور", "zargoza"],
  ["9pm نايت اوت", null, "عطور", "9pm-nightout"],
  ["Invictus victory", null, "عطور", "invictus-victory"],
  ["فيكتوري الكسير", null, "عطور", "victory-"],
];
const index = buildSearchIndex(items, (i) => i);
const find = (q) => searchIndex(index, q).map((i) => i[3]);

eq("partial: «تروب»", find("تروب"), ["hawas-tropical"]);
eq("«البحر» = «بحر»", find("بحر"), ["nasim-al-bahr"]);
eq("«الس» while typing finds a word with ال? none here, no crash", find("الس"), []);
eq("«الحلا» while typing finds «الحلاقة»", find("الحلا"), ["shaving-cream", "after-shave-balm"]);
eq("name beats family: «الحلاقة»", find("الحلاقة"), ["shaving-cream", "after-shave-balm"]);
eq("family: «منعش» (منعش + منعشه)", find("منعش"), ["nasim-al-bahr", "zargoza"]);
eq("«منعشة» = «منعشه» (ة/ه)", find("منعشة"), ["zargoza"]);
eq("ة in the product, ه in the query: «فواكه»", find("فواكه"), ["zargoza"]);
eq("category: «كريمات»", find("كريمات"), ["shaving-cream", "after-shave-balm"]);
eq("English in the name: «odyssey»", find("odyssey"), ["odyssey-elixir"]);
eq("English, any case: «ODYS»", find("ODYS"), ["odyssey-elixir"]);
eq("English in the slug only: «hawas»", find("hawas"), ["hawas-tropical", "hawas-elixir"]);
eq("English in the slug only: «qomra»", find("qomra"), ["qomra"]);
eq("every word must match: «هوس الكسير»", find("هوس الكسير"), ["hawas-elixir"]);
eq("أ in the query: «ألكسير» → elixirs (name first)", find("ألكسير"), ["hawas-elixir", "victory-"]);
eq("whole word ranks first: «victory»", find("victory"), ["invictus-victory", "victory-"]);
eq("digits: «٩pm»", find("٩pm"), ["9pm-nightout"]);
eq("harakat in the query: «قَمَرَة»", find("قَمَرَة"), ["qomra"]);
eq("no match", find("شامبو"), []);
eq("empty query: everything, in order", find("  ").length, items.length);

console.log(fail ? `\n${fail} failed` : "\nall passed");
process.exit(fail ? 1 : 0);
