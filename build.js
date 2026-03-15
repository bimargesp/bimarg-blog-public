/**
 * BIMARG Blog — Build Script v2
 * Lee posts de Notion y genera HTML estático en /dist
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

function blockToHtml(block) {
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

    case "image":
      const imgUrl = data.type === "external" ? data.external?.url : data.file?.url;
      const caption = data.caption?.length ? richTextToHtml(data.caption) : "";
      if (!imgUrl) return "";
      return `<figure><img src="${imgUrl}" alt="${caption}" loading="lazy">${caption ? `<figcaption>${caption}</figcaption>` : ""}</figure>`;

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
      return ""; // Ignorar estos bloques (incl. bases de datos inline)

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

  // Leer subbloques recursivamente
  for (const block of blocks) {
  const type = block.type;
    if (block.has_children && type !== "child_database" && type !== "child_page") {
      block._children = await fetchAllBlocks(block.id);
    }
  }
  return blocks;
}

function renderBlocks(blocks) {
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

    html += blockToHtml(block);

    // Renderizar subbloques si existen
    if (block._children && block._children.length > 0) {
      html += renderBlocks(block._children);
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

    // Convertir bloques a HTML directamente (sin notion-to-md)
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
  <main class="blog-main">
    <header class="blog-header reveal">
      <div class="blog-header-inner">
        <p class="blog-overline">Conocimiento BIM</p>
        <h1 class="blog-title">El Blog de<br/><em>BIMARG</em></h1>
        <p class="blog-subtitle">Metodología, tecnología y casos reales<br/>del primer estudio BIM de la Patagonia.</p>
      </div>
    </header>
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

  if (fs.existsSync(ASSETS)) {
    fs.cpSync(ASSETS, path.join(BLOG_DIST), { recursive: true });
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
