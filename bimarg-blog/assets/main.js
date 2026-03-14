/* BIMARG Blog — main.js */

// ── Cursor personalizado ──────────────────────────────────────────
const cursor = document.getElementById("cursor");
const dot = document.getElementById("cursorDot");

if (cursor && dot) {
  let mx = 0, my = 0;
  let cx = 0, cy = 0;

  document.addEventListener("mousemove", (e) => {
    mx = e.clientX;
    my = e.clientY;
    dot.style.left = mx + "px";
    dot.style.top = my + "px";
  });

  function animateCursor() {
    cx += (mx - cx) * 0.12;
    cy += (my - cy) * 0.12;
    cursor.style.left = cx + "px";
    cursor.style.top = cy + "px";
    requestAnimationFrame(animateCursor);
  }
  animateCursor();

  // Hover effect sobre links y botones
  document.querySelectorAll("a, button, .post-card").forEach((el) => {
    el.addEventListener("mouseenter", () => cursor.classList.add("hover"));
    el.addEventListener("mouseleave", () => cursor.classList.remove("hover"));
  });
}

// ── Nav scroll ────────────────────────────────────────────────────
const nav = document.getElementById("nav");
if (nav) {
  window.addEventListener("scroll", () => {
    nav.classList.toggle("scrolled", window.scrollY > 40);
  });
}

// ── Reveal on scroll ─────────────────────────────────────────────
const revealEls = document.querySelectorAll(".reveal");
if (revealEls.length > 0) {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => {
            entry.target.classList.add("visible");
          }, i * 60);
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.08, rootMargin: "0px 0px -40px 0px" }
  );
  revealEls.forEach((el) => observer.observe(el));
}

// ── Filtro de categorías ──────────────────────────────────────────
const filterBtns = document.querySelectorAll(".filter-btn");
const postsGrid = document.getElementById("postsGrid");

if (filterBtns.length > 0 && postsGrid) {
  filterBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      // Actualizar botones activos
      filterBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      const filter = btn.dataset.filter;
      const cards = postsGrid.querySelectorAll(".post-card");

      cards.forEach((card) => {
        if (filter === "all" || card.dataset.category === filter) {
          card.style.display = "";
          setTimeout(() => card.classList.add("visible"), 10);
        } else {
          card.style.display = "none";
          card.classList.remove("visible");
        }
      });
    });
  });
}
