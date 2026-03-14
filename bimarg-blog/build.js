/**
 * BIMARG Blog — Build Script
 * Lee posts de Notion y genera HTML estático en /dist
 *
 * Variables de entorno requeridas:
 *   NOTION_API_KEY     — tu Notion integration token
 *   NOTION_DATABASE_ID — ID de la base de datos "Blog BIMARG"
 *                        (el ID largo de la URL de Notion)
 */

import { Client } from "@notionhq/client";
import { NotionToMarkdown } from "notion-to-md";
import { marked } from "marked";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import https from "https";

// ─── Config ────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(__dirname, "dist");
const ASSETS = path.join(__dirname, "assets");
const BLOG_DIST = path.join(DIST, "blog");

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const n2m = new NotionToMarkdown({ notionClient: notion });

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
  return d.toLocaleDateString("es-AR", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function slugify(text) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Descarga imagen a /dist/blog/images/ y devuelve la ruta relativa
async function downloadImage(url, filename) {
  return new Promise((resolve) => {
    if (!url || url.includes("notion.so") === false && !url.startsWith("http")) {
      resolve(null);
      return;
    }
    const imgDir = path.join(BLOG_DIST, "images");
    ensureDir(imgDir);
    const ext = url.includes(".png") ? ".png" : ".jpg";
    const name = filename + ext;
    const dest = path.join(imgDir, name);

    // Si ya existe, no re-descarga
    if (fs.existsSync(dest)) {
      resolve(`/blog/images/${name}`);
      return;
    }

    const file = fs.createWriteStream(dest);
    https.get(url, (response) => {
      response.pipe(file);
      file.on("finish", () => {
        file.close();
        resolve(`/blog/images/${name}`);
      });
    }).on("error", () => {
      fs.unlink(dest, () => {});
      resolve(null);
    });
  });
}

// ─── Leer posts de Notion ─────────────────────────────────────────────────

async function fetchPosts() {
  const dbId = process.env.NOTION_DATABASE_ID;
  if (!dbId) throw new Error("NOTION_DATABASE_ID no está definida");

  const response = await notion.databases.query({
    database_id: dbId,
    filter: {
      property: "Estado",
      select: { equals: "Publicado" },
    },
    sorts: [
      {
        property: "Fecha de Publicación",
        direction: "descending",
      },
    ],
  });

  const posts = [];

  for (const page of response.results) {
    const props = page.properties;

    const titulo = props["Título"]?.title?.[0]?.plain_text || "Sin título";
    const slugProp = props["Slug"]?.rich_text?.[0]?.plain_text;
    const slug = slugProp ? slugProp : slugify(titulo);
    const descripcion = props["Descripción"]?.rich_text?.[0]?.plain_text || "";
    const categoria = props["Categoría"]?.select?.name || "BIMARG";
    const autor = props["Autor"]?.rich_text?.[0]?.plain_text || "Franco Srebernic";
    const tiempoLectura = props["Tiempo de Lectura"]?.rich_text?.[0]?.plain_text || "5 min";
    const fechaRaw = props["Fecha de Publicación"]?.date?.start || page.created_time;
    const fecha = formatDate(fechaRaw);
    const imagenFiles = props["Imagen de Portada"]?.files;
    let imagenUrl = null;

    if (imagenFiles && imagenFiles.length > 0) {
      const f = imagenFiles[0];
      imagenUrl = f.type === "external" ? f.external.url : f.file?.url;
    }

    // Descargar imagen de portada
    let imagenLocal = null;
    if (imagenUrl) {
      imagenLocal = await downloadImage(imagenUrl, slug + "-cover");
    }

    // Convertir cuerpo del post de Notion blocks a Markdown
    const mdBlocks = await n2m.pageToMarkdown(page.id);
    const mdString = n2m.toMarkdownString(mdBlocks);
    const bodyHtml = marked.parse(mdString.parent || "");

    posts.push({
      id: page.id,
      titulo,
      slug,
      descripcion,
      categoria,
      autor,
      tiempoLectura,
      fecha,
      fechaRaw,
      imagenLocal,
      bodyHtml,
    });
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

  <!-- Open Graph -->
  <meta property="og:title" content="${title} | BIMARG" />
  <meta property="og:description" content="${description}" />
  <meta property="og:type" content="website" />
  <meta property="og:url" content="https://bimarg.com${canonical}" />

  <!-- Fonts -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=Syne:wght@600;700&display=swap" rel="stylesheet" />

  <link rel="stylesheet" href="/blog/style.css" />
  ${extraHead}
</head>
<body>
  <!-- Cursor personalizado -->
  <div class="cursor" id="cursor"></div>
  <div class="cursor-dot" id="cursorDot"></div>

  <!-- Nav -->
  <nav class="nav" id="nav">
    <a href="/" class="nav-logo">BIMARG</a>
    <div class="nav-links">
      <a href="/blog">Blog</a>
      <a href="/#calculadora">Calculadora</a>
      <a href="https://wa.me/542996287652" target="_blank" class="nav-cta">Hablemos</a>
    </div>
  </nav>

  ${content}

  <!-- Footer -->
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

// Página índice del blog (grilla de posts)
function indexTemplate(posts) {
  const cards = posts
    .map(
      (p) => `
    <article class="post-card reveal" data-category="${p.categoria}">
      <a href="/blog/${p.slug}/" class="post-card-link">
        <div class="post-card-img">
          ${
            p.imagenLocal
              ? `<img src="${p.imagenLocal}" alt="${p.titulo}" loading="lazy" />`
              : `<div class="post-card-placeholder"><span>${p.categoria}</span></div>`
          }
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
    </article>`
    )
    .join("");

  const categorias = [...new Set(posts.map((p) => p.categoria))];
  const filtros = categorias
    .map(
      (c) =>
        `<button class="filter-btn" data-filter="${c}">${c}</button>`
    )
    .join("");

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
    description:
      "Artículos sobre BIM, Lean Construction, RIBA y tecnología aplicada a la construcción. Por BIMARG, el primer estudio BIM especializado de la Patagonia.",
    canonical: "/blog",
    content,
  });
}

// Página individual de un post
function postTemplate(post) {
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

      ${
        post.imagenLocal
          ? `<div class="post-cover reveal">
               <img src="${post.imagenLocal}" alt="${post.titulo}" />
             </div>`
          : ""
      }

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
  </main>`;

  return htmlShell({
    title: post.titulo,
    description: post.descripcion,
    canonical: `/blog/${post.slug}/`,
    content,
    extraHead: post.imagenLocal
      ? `<meta property="og:image" content="https://bimarg.com${post.imagenLocal}" />`
      : "",
  });
}

// ─── Main ─────────────────────────────────────────────────────────────────

async function build() {
  console.log("\n🚀 BIMARG Blog — Build iniciado\n");
  const t0 = Date.now();

  // Preparar directorios
  ensureDir(DIST);
  ensureDir(BLOG_DIST);

  // Copiar assets estáticos
  if (fs.existsSync(ASSETS)) {
    fs.cpSync(ASSETS, path.join(BLOG_DIST), { recursive: true });
  }

  // Leer posts
  console.log("📥 Leyendo posts desde Notion...");
  const posts = await fetchPosts();
  console.log(`   ${posts.length} post(s) publicado(s) encontrado(s)\n`);

  // Generar index del blog
  console.log("📄 Generando páginas...");
  writeFile(path.join(BLOG_DIST, "index.html"), indexTemplate(posts));

  // Generar cada post
  for (const post of posts) {
    const postDir = path.join(BLOG_DIST, post.slug);
    writeFile(path.join(postDir, "index.html"), postTemplate(post));
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
