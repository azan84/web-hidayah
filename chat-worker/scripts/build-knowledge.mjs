// Builds src/knowledge.js from the site's HTML pages so the chat bot answers
// from exactly what is published. Re-run (npm run deploy does it) after editing
// the site. No dependencies — plain regex extraction is enough for these pages.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(here, "../..");
const outFile = path.resolve(here, "../src/knowledge.js");
const SITE = "https://hidayah.biomechemical.com";

// Page order: core pages first, then blog posts alphabetically.
const CORE = ["index.html", "academics.html", "students.html", "personal.html", "blog.html"];
const blogPosts = fs
  .readdirSync(siteRoot)
  .filter((f) => /^blog-.+\.html$/.test(f))
  .sort();
const pages = [...CORE, ...blogPosts].filter((f) => fs.existsSync(path.join(siteRoot, f)));

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", middot: "·", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", times: "×", deg: "°", copy: "©", rarr: "→", larr: "←", bull: "•", sup2: "²", sup3: "³", micro: "µ", plusmn: "±", minus: "−", le: "≤", ge: "≥", eacute: "é", divide: "÷", epsilon: "ε", alpha: "α", beta: "β", gamma: "γ", delta: "δ", theta: "θ", lambda: "λ", mu: "μ", nu: "ν", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", omega: "ω", Delta: "Δ", infin: "∞", asymp: "≈", ne: "≠" };

function decode(s) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z0-9]+);/gi, (m, e) => {
    if (e[0] === "#") {
      const n = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) ? String.fromCodePoint(n) : m;
    }
    return ENTITIES[e] ?? ENTITIES[e.toLowerCase()] ?? m;
  });
}

// Publications on academics.html are a JS array rendered client-side.
function extractPublications(html) {
  const m = html.match(/const publications\s*=\s*(\[[\s\S]*?\]);/);
  if (!m) return "";
  const rows = [...m[1].matchAll(/\{\s*title:\s*"((?:[^"\\]|\\.)*)",\s*journal:\s*"((?:[^"\\]|\\.)*)",\s*year:\s*(\d+),\s*citations:\s*(\d+)\s*\}/g)];
  const unescape = (s) => JSON.parse(`"${s}"`);
  const lines = rows
    .map(([, t, j, y, c]) => ({ t: unescape(t), j: unescape(j), y: +y, c: +c }))
    .sort((a, b) => b.y - a.y || b.c - a.c)
    .map((p) => `- ${p.t}. ${p.j} (${p.y}). Citations listed on site: ${p.c}.`);
  return lines.length ? `\nPublication list (${lines.length} items, newest first):\n${lines.join("\n")}\n` : "";
}

const BOILERPLATE = new Set(["Skip to content", "Your browser does not support HTML5 video.", "Your browser does not support the video tag."]);

// Structured profile data (degrees with years, Scopus/ResearchGate links) lives in JSON-LD.
function extractJsonLd(html) {
  const blocks = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi)];
  const out = blocks.map(([, json]) => {
    try { return JSON.stringify(JSON.parse(json)); } catch { return ""; }
  }).filter(Boolean);
  return out.length ? `\nStructured profile data from this page (JSON-LD):\n${out.join("\n")}\n` : "";
}

// Diagrams are inline SVG; keep their text labels (e.g. fishbone categories).
function svgLabels(svg) {
  const labels = [...svg.matchAll(/<(?:text|tspan|title)\b[^>]*>([^<]+)</gi)].map((m) => decode(m[1]).trim()).filter(Boolean);
  const aria = svg.match(/aria-label\s*=\s*"([^"]+)"/i)?.[1];
  const all = [...new Set([aria, ...labels].filter(Boolean))];
  return all.length ? ` (diagram: ${all.join(" · ")}) ` : " ";
}

// blog.html renders its post cards client-side from blog-posts.js.
function blogIndex() {
  const file = path.join(siteRoot, "blog-posts.js");
  if (!fs.existsSync(file)) return "";
  const src = fs.readFileSync(file, "utf8");
  const posts = [...src.matchAll(/\{\s*file:\s*"([^"]+)"[\s\S]*?title:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?tag:\s*"((?:[^"\\]|\\.)*)"[\s\S]*?date:\s*"([^"]*)"[\s\S]*?excerpt:\s*"((?:[^"\\]|\\.)*)"/g)];
  const unescape = (s) => JSON.parse(`"${s}"`);
  const lines = posts.map(([, f, t, tag, d, ex]) =>
    `- ${decode(unescape(t))} (${unescape(tag)}, ${d}) [${f}]: ${decode(unescape(ex).replace(/<[^>]+>/g, ""))}`);
  return lines.length ? `\nBlog posts listed on this page (newest first):\n${lines.join("\n")}\n` : "";
}

function htmlToText(html) {
  let s = html;
  s = s.replace(/<head[\s\S]*?<\/head>/i, "");
  s = s.replace(/<svg\b[\s\S]*?<\/svg>/gi, svgLabels);
  s = s.replace(/<(script|style|noscript|nav|footer|canvas|template)\b[\s\S]*?<\/\1>/gi, " ");
  s = s.replace(/<!--[\s\S]*?-->/g, " ");
  // Keep link targets so the bot can point visitors to the right page.
  s = s.replace(/<a\b[^>]*href\s*=\s*"([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (m, href, inner) => {
    const text = inner.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    if (!text) return " ";
    if (href === "#" || href === "") return ` ${text} (link not available yet) `;
    if (/^(#|javascript:|mailto:$)/i.test(href)) return ` ${text} `;
    return ` ${text} [${href}] `;
  });
  s = s.replace(/<img\b[^>]*alt\s*=\s*"([^"]+)"[^>]*>/gi, " (image: $1) ");
  s = s.replace(/<(h[1-6])\b[^>]*>/gi, (m, h) => `\n\n${"#".repeat(Math.min(+h[1] + 1, 6))} `);
  s = s.replace(/<li\b[^>]*>/gi, "\n- ");
  s = s.replace(/<(br|hr)\b[^>]*>/gi, "\n");
  s = s.replace(/<\/?(p|div|section|article|header|ul|ol|table|tr|blockquote|figure|figcaption|h[1-6]|dl|dt|dd|main|aside)\b[^>]*>/gi, "\n");
  s = s.replace(/<(td|th)\b[^>]*>/gi, " | ");
  s = s.replace(/<[^>]+>/g, " ");
  s = decode(s);
  return s
    .split("\n")
    .map((l) => l.replace(/[ \t ]+/g, " ").trim())
    .filter((l, i, a) => l && l !== "-" && !BOILERPLATE.has(l) && l !== a[i - 1])
    .join("\n")
    .replace(/\n(#+ )/g, "\n\n$1")
    .trim();
}

const sections = pages.map((file) => {
  const html = fs.readFileSync(path.join(siteRoot, file), "utf8");
  const title = decode((html.match(/<title>([\s\S]*?)<\/title>/i)?.[1] ?? file).trim());
  const url = file === "index.html" ? `${SITE}/` : `${SITE}/${file}`;
  return `=== PAGE: ${title}\nURL: ${url} (relative link: ${file})\n\n${htmlToText(html)}\n${extractPublications(html)}${file === "blog.html" ? blogIndex() : ""}${extractJsonLd(html)}`;
});

const knowledge = sections.filter(Boolean).join("\n\n");
fs.writeFileSync(
  outFile,
  `// Generated by scripts/build-knowledge.mjs — do not edit by hand.\nexport default ${JSON.stringify(knowledge)};\n`,
);
console.log(`knowledge.js: ${pages.length} pages, ${knowledge.length.toLocaleString()} chars (~${Math.round(knowledge.length / 4).toLocaleString()} tokens)`);
