/**
 * BIMARG Blog — Build Script v3
 * Lee posts de Notion y genera HTML estático en /dist
 * Incluye hero scroll-driven (frame animation) en el index del blog
 *
 * Variables de entorno requeridas:
 *   NOTION_API_KEY     — tu Notion integration token
 *   NOTION_DATABASE_ID — ID de la base de datos "Blog BIMARG"
 */

import { Client } from "@notionhq/client";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const ASSETS = path.join(__dirname, "assets");
const BLOG_DIST = path.join(DIST, "blog");

const notion = new Client({ auth: process.env.NOTION_API_KEY });

// ─── Helpers ───────────────────────────────────────────────────────────────

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function writeFile(filepath, content) {
  ensureDir(path.dirname(filepath));
  fs.writeFileSync(filepath, content, "utf8");
  console.log(`  ✓ ${filepath.replace(__dirname, "")}`);
}

function formatDate(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-AR", { year: "numeric", month: "long", day: "numeric" });
}

function slugify(text) {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-");
}

async function downloadImage(url, filename) {
  return new Promise((resolve) => {
    if (!url || !url.startsWith("http")) { resolve(null); return; }
    const imgDir = path.join(BLOG_DIST, "images");
    ensureDir(imgDir);
    const ext = url.includes(".png") ? ".png" : ".jpg";
    const name = filename + ext;
    const dest = path.join(imgDir, name);
    if (fs.existsSync(dest)) { resolve(`/blog/images/${name}`); return; }
    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        file.close();
        fs.unlink(dest, () => {});
        https.get(response.headers.location, (r2) => {
          const f2 = fs.createWriteStream(dest);
          r2.pipe(f2);
          f2.on("finish", () => { f2.close(); resolve(`/blog/images/${name}`); });
        }).on("error", () => resolve(null));
        return;
      }
      response.pipe(file);
      file.on("finish", () => { file.close(); resolve(`/blog/images/${name}`); });
    }).on("error", () => { fs.unlink(dest, () => {}); resolve(null); });
  });
}

// ─── Convertir bloques de Notion a HTML ────────────────────────────────────

function richTextToHtml(richTexts) {
  if (!richTexts || !richTexts.length) return "";
  return richTexts.map(rt => {
    let text = rt.plain_text
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    if (rt.annotations) {
      if (rt.annotations.bold) text = `<strong>${text}</strong>`;
      if (rt.annotations.italic) text = `<em>${text}</em>`;
      if (rt.annotations.strikethrough) text = `<s>${text}</s>`;
      if (rt.annotations.code) text = `<code>${text}</code>`;
      if (rt.annotations.underline) text = `<u>${text}</u>`;
    }
    if (rt.href) text = `<a href="${rt.href}" target="_blank" rel="noopener">${text}</a>`;
    return text;
  }).join("");
}

async function blockToHtml(block) {
  const type = block.type;
  const data = block[type];

  switch (type) {
    case "paragraph":
      const pText = richTextToHtml(data.rich_text);
      return pText ? `<p>${pText}</p>` : "<br>";

    case "heading_1":
      return `<h2>${richTextToHtml(data.rich_text)}</h2>`;

    case "heading_2":
      return `<h3>${richTextToHtml(data.rich_text)}</h3>`;

    case "heading_3":
      return `<h4>${richTextToHtml(data.rich_text)}</h4>`;

    case "bulleted_list_item":
      return `<li>${richTextToHtml(data.rich_text)}</li>`;

    case "numbered_list_item":
      return `<li>${richTextToHtml(data.rich_text)}</li>`;

    case "to_do":
      const checked = data.checked ? "checked" : "";
      return `<li><input type="checkbox" ${checked} disabled> ${richTextToHtml(data.rich_text)}</li>`;

    case "quote":
      return `<blockquote>${richTextToHtml(data.rich_text)}</blockquote>`;

    case "callout":
      const emoji = data.icon?.emoji || "💡";
      return `<div class="callout"><span class="callout-icon">${emoji}</span><div>${richTextToHtml(data.rich_text)}</div></div>`;

    case "code":
      const lang = data.language || "";
      const code = data.rich_text.map(rt => rt.plain_text).join("").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
      return `<pre><code class="language-${lang}">${code}</code></pre>`;

    case "divider":
      return "<hr>";

    case "image": {
      const imgUrl = data.type === "external" ? data.external?.url : data.file?.url;
      const caption = data.caption?.length ? richTextToHtml(data.caption) : "";
      if (!imgUrl) return "";
      // Descargar la imagen durante el build para evitar URLs expiradas de Notion
      const localPath = await downloadImage(imgUrl, `content-${block.id}`);
      const finalSrc = localPath || imgUrl;
      return `<figure class="post-figure"><img src="${finalSrc}" alt="${caption}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;
    }

    case "video":
      const videoUrl = data.type === "external" ? data.external?.url : data.file?.url;
      if (!videoUrl) return "";
      if (videoUrl.includes("youtube") || videoUrl.includes("youtu.be")) {
        const videoId = videoUrl.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]+)/)?.[1];
        return videoId ? `<div class="video-embed"><iframe src="https://www.youtube.com/embed/${videoId}" frameborder="0" allowfullscreen></iframe></div>` : "";
      }
      return `<video controls src="${videoUrl}"></video>`;

    case "embed":
      return `<div class="embed"><a href="${data.url}" target="_blank">${data.url}</a></div>`;

    case "bookmark":
      return `<div class="bookmark"><a href="${data.url}" target="_blank" rel="noopener">${data.url}</a></div>`;

    case "table_of_contents":
    case "breadcrumb":
    case "child_database":
    case "child_page":
    case "unsupported":
      return "";

    default:
      return "";
  }
}

async function fetchAllBlocks(blockId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      page_size: 100,
      ...(cursor ? { start_cursor: cursor } : {}),
    });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : null;
  } while (cursor);

  for (const block of blocks) {
    const type = block.type;
    if (block.has_children && type !== "child_database" && type !== "child_page") {
      block._children = await fetchAllBlocks(block.id);
    }
  }
  return blocks;
}

async function renderBlocks(blocks) {
  let html = "";
  let inBulletList = false;
  let inNumberedList = false;

  for (const block of blocks) {
    const type = block.type;
    const isBullet = type === "bulleted_list_item" || type === "to_do";
    const isNumbered = type === "numbered_list_item";

    if (!isBullet && inBulletList) { html += "</ul>"; inBulletList = false; }
    if (!isNumbered && inNumberedList) { html += "</ol>"; inNumberedList = false; }
    if (isBullet && !inBulletList) { html += "<ul>"; inBulletList = true; }
    if (isNumbered && !inNumberedList) { html += "<ol>"; inNumberedList = true; }

    html += await blockToHtml(block);

    if (block._children && block._children.length > 0) {
      html += await renderBlocks(block._children);
    }
  }

  if (inBulletList) html += "</ul>";
  if (inNumberedList) html += "</ol>";
  return html;
}

async function blocksToHtml(pageId) {
  const blocks = await fetchAllBlocks(pageId);
  return renderBlocks(blocks);
}

// ─── Leer posts de Notion ─────────────────────────────────────────────────

async function fetchPosts() {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) throw new Error("NOTION_DATABASE_ID no está definida");

  const response = await notion.databases.query({
    database_id: dbId,
    filter: { property: "Estado", select: { equals: "Publicado" } },
    sorts: [{ property: "Fecha de Publicación", direction: "descending" }],
  });

  const posts = [];

  for (const page of response.results) {
    const props = page.properties;

    const titulo = props["Título"]?.title?.[0]?.plain_text || "Sin título";
    const slugProp = props["Slug"]?.rich_text?.[0]?.plain_text;
    const slug = slugProp ? slugProp : slugify(titulo);
    const descripcion = props["Descripción"]?.rich_text?.[0]?.plain_text || "";
    const categoria = props["Categoría"]?.select?.name || "BIMARG";
    const autor = props["Autor"]?.rich_text?.[0]?.plain_text || "Franco D. Srebernic";
    const tiempoLectura = props["Tiempo de Lectura"]?.rich_text?.[0]?.plain_text || "3 min";
    const fechaRaw = props["Fecha de Publicación"]?.date?.start || page.created_time;
    const fecha = formatDate(fechaRaw);

    const imagenFiles = props["Imagen de Portada"]?.files;
    let imagenUrl = null;
    if (imagenFiles && imagenFiles.length > 0) {
      const f = imagenFiles[0];
      imagenUrl = f.type === "external" ? f.external.url : f.file?.url;
    }

    let imagenLocal = null;
    if (imagenUrl) {
      imagenLocal = await downloadImage(imagenUrl, slug + "-cover");
    }

    const bodyHtml = await blocksToHtml(page.id);

    posts.push({ id: page.id, titulo, slug, descripcion, categoria, autor, tiempoLectura, fecha, fechaRaw, imagenLocal, bodyHtml });
  }

  return posts;
}

// ─── Templates ────────────────────────────────────────────────────────────

function htmlShell({ title, description, canonical, content, extraHead = "" }) {
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} | BIMARG</title>
  <meta name="description" content="${description}" />
  <link rel="canonical" href="https://bimarg.com${canonical}" />
  <meta property="og:title" content="${title} | BIMARG" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://bimarg.com${canonical}" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@600;700&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="/blog/style.css" />
  ${extraHead}
</head>
<body>
  <div class="cursor" id="cursor"></div>
  <div class="cursor-dot" id="cursorDot"></div>
  <nav class="nav" id="nav">
    <a href="/" class="nav-logo">BIMARG</a>
    <div class="nav-links">
      <a href="/blog">Blog</a>
      <a href="/#calculadora">Calculadora</a>
      <a href="https://wa.me/542996287652" target="_blank" class="nav-cta">Hablemos</a>
    </div>
  </nav>
  ${content}
  <footer class="footer">
    <div class="footer-inner">
      <span class="footer-logo">BIMARG</span>
      <span class="footer-copy">© ${new Date().getFullYear()} BIMARG. Neuquén, Patagonia.</span>
      <div class="footer-links">
        <a href="/">Inicio</a>
        <a href="/blog">Blog</a>
        <a href="https://wa.me/542996287652" target="_blank">WhatsApp</a>
      </div>
    </div>
  </footer>
  <script src="/blog/main.js"></script>
</body>
</html>`;
}

// ─── HERO SCROLL — CSS inerido en el index del blog ───────────────────────

const heroStyles = `
<style>
/* ── Hero scroll section ── */
#hero-scroll { position: relative; height: 500vh; }
#hero-sticky {
  position: sticky; top: 0; height: 100vh; width: 100%;
  overflow: hidden; display: flex; align-items: center;
  justify-content: center; background: #080808;
}
#hero-canvas { display: block; }

/* Loader */
#hero-loader {
  position: absolute; inset: 0; background: #080808;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  z-index: 10; transition: opacity 0.8s ease;
}
#hero-loader.hidden { opacity: 0; pointer-events: none; }
.hl-logo { font-family: 'Syne', sans-serif; font-size: 11px; letter-spacing: 0.4em; color: #00BFFF; margin-bottom: 40px; text-transform: uppercase; }
.hl-track { width: 160px; height: 1px; background: rgba(255,255,255,0.08); overflow: hidden; }
.hl-fill  { height: 100%; width: 0%; background: #00BFFF; box-shadow: 0 0 8px #00BFFF; transition: width 0.08s linear; }
.hl-num   { margin-top: 14px; font-size: 10px; letter-spacing: 0.25em; color: rgba(255,255,255,0.25); }

/* Texto overlay */
#hero-text {
  position: absolute; inset: 0;
  display: flex; flex-direction: column; justify-content: center;
  padding: 0 6vw; pointer-events: none;
}
.ht-label {
  font-size: clamp(9px, 0.85vw, 11px); letter-spacing: 0.35em; text-transform: uppercase;
  color: #00BFFF; opacity: 0; transform: translateY(8px);
  transition: opacity 0.6s ease, transform 0.6s ease; margin-bottom: 16px;
}
.ht-title {
  font-family: 'Syne', sans-serif; font-size: clamp(28px, 4.2vw, 68px);
  font-weight: 700; line-height: 1.06; letter-spacing: -0.025em;
  color: #fff; max-width: 11ch; opacity: 0; transform: translateY(14px);
  transition: opacity 0.7s ease 0.1s, transform 0.7s ease 0.1s; margin-bottom: 18px;
}
.ht-title em { font-style: normal; color: #00BFFF; -webkit-text-fill-color: #00BFFF; background: none; }
.ht-sub {
  font-size: clamp(12px, 1.1vw, 16px); color: rgba(255,255,255,0.45);
  line-height: 1.65; max-width: 34ch; font-weight: 300;
  opacity: 0; transform: translateY(10px);
  transition: opacity 0.7s ease 0.2s, transform 0.7s ease 0.2s;
}
#hero-text.visible .ht-label,
#hero-text.visible .ht-title,
#hero-text.visible .ht-sub { opacity: 1; transform: translateY(0); }

/* Scroll hint */
#hero-hint {
  position: absolute; bottom: 28px; left: 50%; transform: translateX(-50%);
  display: flex; flex-direction: column; align-items: center; gap: 6px;
  pointer-events: none; transition: opacity 0.5s ease;
}
#hero-hint.gone { opacity: 0; }
.hh-txt { font-size: 9px; letter-spacing: 0.3em; text-transform: uppercase; color: rgba(255,255,255,0.2); }
.hh-line { width: 1px; height: 26px; background: linear-gradient(to bottom, rgba(255,255,255,0.2), transparent); animation: hintPulse 1.8s ease-in-out infinite; }
@keyframes hintPulse { 0%,100%{opacity:.2} 50%{opacity:.7} }
</style>`;

// ─── HERO SCROLL — JS inline ──────────────────────────────────────────────

const heroScript = `
<script>
document.addEventListener('DOMContentLoaded', function() {
(function() {
  var TOTAL  = 121;
  var RATIO  = 1920 / 1080;
  var DIR    = '/blog/frames/';
  var name   = function(n) { return 'frame_' + String(n).padStart(4,'0') + '.webp'; };
  var TEXT_IN  = 0.04;
  var TEXT_OUT = 0.88;

  var section = document.getElementById('hero-scroll');
  var sticky  = document.getElementById('hero-sticky');
  var canvas  = document.getElementById('hero-canvas');
  var ctx     = canvas.getContext('2d');
  var overlay = document.getElementById('hero-text');
  var hint    = document.getElementById('hero-hint');
  var loader  = document.getElementById('hero-loader');
  var lf      = document.getElementById('hl-fill');
  var ln      = document.getElementById('hl-num');
  var DPR     = window.devicePixelRatio || 1;
  var frames  = [];
  var cur = 0, pend = false, nxt = 0, loaded = 0;

  function resize() {
    var vw = window.innerWidth, vh = window.innerHeight;
    var w, h;
    // cover: llena toda la pantalla, recorta si es necesario
    if (vw / vh > RATIO) { w = vw; h = vw / RATIO; }
    else { h = vh; w = vh * RATIO; }
    canvas.style.width    = w + 'px';
    canvas.style.height   = h + 'px';
    canvas.style.position = 'absolute';
    canvas.style.left     = Math.round((vw - w) / 2) + 'px';
    canvas.style.top      = Math.round((vh - h) / 2) + 'px';
    canvas.width  = Math.round(w * DPR);
    canvas.height = Math.round(h * DPR);
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    if (frames[cur]) draw(cur);
  }
  window.addEventListener('resize', resize);

  function draw(i) {
    var img = frames[i]; if (!img) return;
    var w = parseFloat(canvas.style.width), h = parseFloat(canvas.style.height);
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
  }

  function schedule(i) {
    nxt = i;
    if (pend) return;
    pend = true;
    requestAnimationFrame(function() {
      pend = false;
      if (nxt !== cur) { cur = nxt; draw(cur); }
    });
  }

  function onScroll() {
    var scrolled = window.scrollY - section.offsetTop;
    var total    = section.offsetHeight - window.innerHeight;
    var progress = Math.max(0, Math.min(1, scrolled / total));
    var idx      = Math.min(TOTAL - 1, Math.floor(progress * TOTAL));
    schedule(idx);
    overlay.classList.toggle('visible', progress > TEXT_IN && progress < TEXT_OUT);
    hint.classList.toggle('gone', scrolled > 80);
  }
  window.addEventListener('scroll', onScroll, { passive: true });

  function preload() {
    for (var i = 0; i < TOTAL; i++) {
      (function(idx) {
        var img = new Image();
        img.onload = img.onerror = function() {
          frames[idx] = img.naturalWidth ? img : null;
          var p = Math.round(++loaded / TOTAL * 100);
          lf.style.width = p + '%';
          ln.textContent = p + '%';
          if (loaded === TOTAL) {
            loader.classList.add('hidden');
            setTimeout(function() { loader.style.display = 'none'; }, 900);
            draw(0);
            onScroll();
          }
        };
        img.src = DIR + name(idx + 1);
      })(i);
    }
  }

  resize();
  preload();
})();
}); // DOMContentLoaded
</script>`;

// ─── indexTemplate con hero integrado ─────────────────────────────────────

function indexTemplate(posts) {
  const cards = posts.map(p => `
    <article class="post-card reveal" data-category="${p.categoria}">
      <a href="/blog/${p.slug}/" class="post-card-link">
        <div class="post-card-img">
          ${p.imagenLocal
            ? `<img src="${p.imagenLocal}" alt="${p.titulo}" loading="lazy" />`
            : `<div class="post-card-placeholder"><span>${p.categoria}</span></div>`}
          <span class="post-card-cat">${p.categoria}</span>
        </div>
        <div class="post-card-body">
          <h2 class="post-card-title">${p.titulo}</h2>
          <p class="post-card-desc">${p.descripcion}</p>
          <div class="post-card-meta">
            <span class="post-date">${p.fecha}</span>
            <span class="post-time">${p.tiempoLectura} lectura</span>
          </div>
        </div>
      </a>
    </article>`).join("");

  const categorias = [...new Set(posts.map(p => p.categoria))];
  const filtros = categorias.map(c => `<button class="filter-btn" data-filter="${c}">${c}</button>`).join("");

  const content = `

  <!-- ══ HERO SCROLL-DRIVEN ══════════════════════════════════════ -->
  <section id="hero-scroll">
    <div id="hero-sticky">

      <!-- Loader -->
      <div id="hero-loader">
        <div class="hl-logo">BIMARG</div>
        <div class="hl-track"><div class="hl-fill" id="hl-fill"></div></div>
        <div class="hl-num" id="hl-num">0%</div>
      </div>

      <!-- Canvas del video -->
      <canvas id="hero-canvas"></canvas>

      <!-- Texto overlay izquierda -->
      <div id="hero-text">
        <div class="ht-label">Conocimiento BIM — Patagonia</div>
        <h1 class="ht-title">El Blog de<br/><em>BIMARG</em></h1>
        <p class="ht-sub">Metodología, tecnología y casos reales del primer estudio BIM de la Patagonia.</p>
      </div>

      <!-- Scroll hint -->
      <div id="hero-hint">
        <div class="hh-txt">Scroll</div>
        <div class="hh-line"></div>
      </div>

    </div>
  </section>
  <!-- ══════════════════════════════════════════════════════════════ -->

  <main class="blog-main">
    <section class="blog-content">
      <div class="blog-filters">
        <button class="filter-btn active" data-filter="all">Todos</button>
        ${filtros}
      </div>
      <div class="posts-grid" id="postsGrid">
        ${cards}
      </div>
      ${posts.length === 0 ? '<p class="no-posts">Próximamente, el primer post.</p>' : ""}
    </section>
  </main>`;

  return htmlShell({
    title: "Blog",
    description: "Artículos sobre BIM, Lean Construction, RIBA y tecnología aplicada a la construcción. Por BIMARG, el primer estudio BIM especializado de la Patagonia.",
    canonical: "/blog",
    content,
    // Inyectamos los estilos y script del hero en el <head> / antes del </body>
    extraHead: heroStyles + heroScript,
  });
}

function relatedPostsHtml(currentPost, allPosts) {
  const others = allPosts.filter(p => p.slug !== currentPost.slug);
  const related = others.slice(0, 2);
  if (!related.length) return "";

  const cards = related.map(p => `
    <a href="/blog/${p.slug}/" class="related-card">
      <div class="related-card-img">
        ${p.imagenLocal
          ? `<img src="${p.imagenLocal}" alt="${p.titulo}" loading="lazy">`
          : `<div class="related-card-placeholder"><span>${p.categoria}</span></div>`}
      </div>
      <div class="related-card-body">
        <span class="related-card-cat">${p.categoria}</span>
        <h3 class="related-card-title">${p.titulo}</h3>
        <span class="related-card-time">${p.tiempoLectura} lectura</span>
      </div>
    </a>`).join("");

  return `
    <section class="related-posts reveal">
      <h2 class="related-title">Seguí leyendo</h2>
      <div class="related-grid">
        ${cards}
      </div>
    </section>`;
}

function postTemplate(post, allPosts) {
  const content = `
  <main class="post-main">
    <article class="post-article">
      <header class="post-header reveal">
        <div class="post-header-inner">
          <a href="/blog" class="post-back">← Volver al blog</a>
          <span class="post-cat">${post.categoria}</span>
          <h1 class="post-title">${post.titulo}</h1>
          <p class="post-description">${post.descripcion}</p>
          <div class="post-meta">
            <span class="post-author">${post.autor}</span>
            <span class="post-sep">·</span>
            <span class="post-date">${post.fecha}</span>
            <span class="post-sep">·</span>
            <span class="post-time">${post.tiempoLectura} de lectura</span>
          </div>
        </div>
      </header>
      ${post.imagenLocal ? `<div class="post-cover reveal"><img src="${post.imagenLocal}" alt="${post.titulo}" /></div>` : ""}
      <div class="post-body reveal">
        ${post.bodyHtml}
      </div>
      <footer class="post-footer reveal">
        <div class="post-footer-cta">
          <p>¿Querés implementar BIM en tu estudio o proyecto?</p>
          <a href="https://wa.me/542996287652" target="_blank" class="btn-cta">Hablemos por WhatsApp</a>
        </div>
        <a href="/blog" class="post-back-bottom">← Todos los artículos</a>
      </footer>
    </article>
    ${relatedPostsHtml(post, allPosts)}
  </main>`;

  return htmlShell({
    title: post.titulo,
    description: post.descripcion,
    canonical: `/blog/${post.slug}/`,
    content,
    extraHead: post.imagenLocal ? `<meta property="og:image" content="https://bimarg.com${post.imagenLocal}" />` : "",
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function build() {
  console.log("\n🚀 BIMARG Blog — Build iniciado\n");
  const t0 = Date.now();

  ensureDir(DIST);
  ensureDir(BLOG_DIST);

  // Copiar assets (style.css, main.js)
  if (fs.existsSync(ASSETS)) {
    fs.cpSync(ASSETS, path.join(BLOG_DIST), { recursive: true });
  }

  // Copiar frames del hero scroll
  const framesSource = path.join(__dirname, "assets", "frames");
  const framesDest   = path.join(BLOG_DIST, "frames");
  if (fs.existsSync(framesSource)) {
    console.log("🎞️  Copiando frames del hero...");
    fs.cpSync(framesSource, framesDest, { recursive: true });
    console.log(`   ✓ Frames copiados a /dist/blog/frames/\n`);
  } else {
    console.warn("⚠️  No se encontró assets/frames/ — el hero no va a cargar imágenes.");
    console.warn("   Copiá la carpeta frames/ dentro de assets/frames/\n");
  }

  console.log("📥 Leyendo posts desde Notion...");
  const posts = await fetchPosts();
  console.log(`   ${posts.length} post(s) publicado(s) encontrado(s)\n`);

  console.log("📄 Generando páginas...");
  writeFile(path.join(BLOG_DIST, "index.html"), indexTemplate(posts));

  for (const post of posts) {
    const postDir = path.join(BLOG_DIST, post.slug);
    writeFile(path.join(postDir, "index.html"), postTemplate(post, posts));
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n✅ Build completado en ${elapsed}s`);
  console.log(`   ${posts.length + 1} archivo(s) HTML generado(s)`);
  console.log(`   Salida: /dist/blog/\n`);
}

build().catch((err) => {
  console.error("\n❌ Error en el build:", err);
  process.exit(1);
});
