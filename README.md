# BIMARG Blog

Blog estático generado automáticamente desde Notion.

**Stack:** Node.js + Notion API + GitHub Actions + Cloudflare Pages (proyecto `bimarg-blog`)

> Desde el 19/10/2026 el blog se publica en Cloudflare Pages (DreamHost dado de baja). El Worker `bimarg-blog-router` sirve `www.bimarg.com/blog/*` desde el proyecto `bimarg-blog` y, si un post viejo no existe ahi, usa la copia historica del repo `bimarg-web`. Los secrets FTP_* ya no se usan; el deploy usa `CLOUDFLARE_API_TOKEN`.

Cada vez que publicás un post en Notion (Estado = Publicado), GitHub Actions genera el HTML y lo publica en `bimarg.com/blog` en ~2 minutos.

---

## Setup (una sola vez)

### 1. Notion — Crear la integración

1. Ir a [notion.so/my-integrations](https://www.notion.so/my-integrations)
2. Crear nueva integración llamada "BIMARG Blog"
3. Copiar el **Internal Integration Token** — lo vas a necesitar como `NOTION_API_KEY`
4. En la base de datos "📝 Blog BIMARG" → clic en los tres puntos → **Connect to** → seleccionar "BIMARG Blog"
5. Copiar el ID de la base de datos de la URL:
   `notion.so/[workspace]/[**ESTE-ES-EL-ID**]?v=...`

### 2. GitHub — Crear el repo y subir el código

```bash
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/TU-USUARIO/bimarg-blog.git
git push -u origin main
```

### 3. GitHub — Agregar los Secrets

Ir a: GitHub repo → Settings → Secrets and variables → Actions → New repository secret

Agregar estos 5 secrets:

| Secret | Valor |
|---|---|
| `NOTION_API_KEY` | Tu token de Notion |
| `NOTION_DATABASE_ID` | ID de la base de datos |
| `FTP_HOST` | ej: `ftp.bimarg.com` |
| `FTP_USERNAME` | Usuario FTP de DreamHost |
| `FTP_PASSWORD` | Contraseña FTP de DreamHost |
| `FTP_SERVER_DIR` | `/blog/` |

### 4. DreamHost — Verificar la carpeta

Confirmar que existe la ruta `/bimarg.com/blog/` en el servidor.
Si no existe, crearla desde el panel de DreamHost o por FTP.

---

## Uso diario

Para publicar un post nuevo:

1. Abrir la base de datos **📝 Blog BIMARG** en Notion
2. Crear una nueva página
3. Completar: Título, Slug, Descripción, Categoría, Fecha de Publicación, Imagen de Portada
4. Escribir el contenido como bloques normales de Notion
5. Cambiar **Estado** a `Publicado`
6. En hasta 1 hora el post aparece en `bimarg.com/blog`

Para publicar de inmediato (sin esperar la hora):
- Ir a GitHub → Actions → "Deploy Blog BIMARG" → "Run workflow"

---

## Desarrollo local

```bash
# Instalar dependencias
npm install

# Crear .env con tus credenciales
cp .env.example .env
# (editá .env con tus valores reales)

# Correr el build
npm run build

# Los archivos quedan en /dist/blog/
# Podés abrirlos directo en el browser para revisar
```

---

## Estructura del proyecto

```
bimarg-blog/
├── build.js              # Script principal de build
├── assets/
│   ├── style.css         # Estilos del blog
│   └── main.js           # JavaScript (cursor, animaciones, filtros)
├── dist/                 # Generado automáticamente (no subir a Git)
│   └── blog/
│       ├── index.html
│       ├── style.css
│       ├── main.js
│       ├── images/       # Fotos descargadas de Notion
│       └── [slug]/
│           └── index.html
├── .github/
│   └── workflows/
│       └── deploy.yml    # GitHub Actions
├── .env.example
├── .gitignore
└── package.json
```

---

## Modificar el diseño

- **Colores / fuentes:** `assets/style.css`
- **Template de la grilla:** función `indexTemplate()` en `build.js`
- **Template de cada post:** función `postTemplate()` en `build.js`
- **Interacciones:** `assets/main.js`
