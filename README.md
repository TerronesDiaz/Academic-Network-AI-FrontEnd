# AcademicNetwork FrontEnd

La interfaz comercial presenta un único recorrido por proyecto: búsqueda
institucional ROR/OpenAlex, importación automática, procesamiento, revisión
experta, calidad y publicación. Scholar queda como mejora/fallback opcional y
la extensión se detecta desde el proyecto para evitar copiar códigos. Pipeline
y Gold permanecen como superficies de investigación y no aparecen en la
navegación comercial.

Dashboard web de **AcademicNetwork-AI** para la Universidad de Colima. Explora autores, publicaciones, red de coautoría, indicadores y evaluación AND, y permite monitorear/lanzar etapas del pipeline a través de la API del backend.

> **Guía del monorepo:** [`../Context/`](../Context/)  
> Detalle de UI y flujos FE: [`../Context/06-frontend.md`](../Context/06-frontend.md)

## Stack

| Pieza | Tecnología |
|---|---|
| Framework | SvelteKit 2 + Svelte 5 |
| Lenguaje | TypeScript |
| Estilos | Tailwind CSS 4 |
| Build | Vite 8 |
| Auth | JWT (access + refresh) en `localStorage` |

El cliente HTTP y los tipos del contrato API viven en `src/lib/api/` (`client.ts`, `types.ts`).

## Requisitos

- Node.js reciente (compatible con Vite 8)
- Backend AcademicNetwork en marcha (`python api_server.py`, puerto **8000** por defecto)
- Usuario API creado en el backend (`scripts/create_api_user.py`)

## Configuración

```bash
# .env en la raíz de este proyecto
VITE_API_URL=http://localhost:8000
```

El backend debe permitir el origen del dev server (p. ej. `http://localhost:5173`) vía `API_CORS_ORIGINS`.

## Idiomas

La interfaz admite español (`es`, formato `es-MX`) e inglés (`en`, formato
`en-US`) mediante Paraglide. La selección se conserva en una cookie y, en la
primera visita, se toma el idioma preferido del navegador con español como
respaldo. Las URLs permanecen estables y no incluyen el idioma.

Para agregar o modificar texto visible:

1. Añade la misma clave a `messages/es.json` y `messages/en.json`.
2. Usa la función tipada generada desde `$lib/paraglide/messages.js`.
3. Ejecuta `npm run check`; el comando detecta claves faltantes, duplicadas o
   placeholders desalineados y regenera Paraglide antes de revisar Svelte.

Para sumar un idioma, agrégalo a `locales` en `project.inlang/settings.json`,
crea su archivo en `messages/`, actualiza el selector y define el locale de
`Intl` correspondiente en `src/lib/i18n/format.ts`.

## Desarrollo

```bash
pnpm install    # o: npm install
pnpm dev        # o: npm run dev / npm run dev -- --open
```

Scripts:

| Comando | Descripción |
|---|---|
| `pnpm dev` / `npm run dev` | Servidor de desarrollo |
| `pnpm build` / `npm run build` | Build de producción |
| `pnpm preview` / `npm run preview` | Preview del build |
| `pnpm check` / `npm run check` | Catálogos i18n + generación Paraglide + `svelte-check` |

## Rutas de la aplicación

| Ruta | Función |
|---|---|
| `/login` | Autenticación contra `POST /auth/login` |
| `/` | Home con accesos a secciones |
| `/authors`, `/authors/[id]` | Investigadores, pubs, coautores, historial de indicadores |
| `/publications`, `/publications/[id]` | Publicaciones y autorías / resolución AND |
| `/network` | Grafo y estadísticas de coautoría |
| `/indicators` | Snapshots bibliométricos y de red |
| `/evaluation` | Resultados de evaluación AND |
| `/pipeline` | Historial de runs y lanzamiento de etapas |

## Estructura

```
AcademicNetworkFrontEnd/
├── src/
│   ├── lib/
│   │   ├── api/client.ts    # fetch, JWT, refresh, API helpers
│   │   ├── api/types.ts     # tipos del contrato REST
│   │   └── auth.ts          # store de sesión
│   ├── routes/              # páginas SvelteKit (file-based)
│   ├── app.css
│   └── app.html
├── static/
├── package.json
├── vite.config.ts
└── svelte.config.js
```

## Relación con el backend

```
Browser → SvelteKit → FastAPI (:8000) → PostgreSQL / pipeline
```

Este frontend **no** ejecuta Playwright, OpenAlex ni el AND: solo consume REST.

Backend: [`../AcademicNetworkBackEnd/`](../AcademicNetworkBackEnd/)  
Arranque conjunto: [`../Context/09-guia-de-arranque.md`](../Context/09-guia-de-arranque.md)

## Ramas experimentales

Estado al 2026-11-10: `main` contiene todo el trabajo vigente. Queda fuera,
a propósito, una rama experimental, que se conserva en GitHub para reproducir
el piloto.

**`feature/supervised-ranker-pilot`**: commit `dcacc1c` (2026-10-26), creada
desde `b816b25`.

- **Qué es:** la pantalla de revisión del piloto supervisado UdeC de 20
  ocurrencias, en `/validation/gold/supervised`.
- **Cómo funciona:** habla con una API local aparte del piloto
  (`127.0.0.1:8793`), con su propio inicio de sesión y token guardado en
  `sessionStorage`, separado del JWT de producción. Para eso modifica
  `src/routes/+layout.svelte`: en esa ruta no restaura la sesión de
  producción ni redirige al login.
- **Por qué no está en `main`:** fue un piloto exploratorio. Lo reemplazó la
  sugerencia del ranker v4 en la validación, que ya está en `main`
  (`f436e1d`). Unirla agregaría al producto una ruta fuera de su
  autenticación y choca con el `+layout.svelte` actual.
- **Documentación:**
  [`docs/design/udec_supervised_pilot.md`](../AcademicNetworkBackEnd/docs/design/udec_supervised_pilot.md)
  en el backend.

La rama `feature/dashboard-dimensions-redesign` se unió a `main` y se borró
el mismo día. Las ramas experimentales del backend están descritas en
[`docs/design/history/experimental_branches.md`](../AcademicNetworkBackEnd/docs/design/history/experimental_branches.md).

## Scaffold original

El proyecto se generó con [`sv`](https://github.com/sveltejs/cli) (plantilla minimal + TypeScript + Tailwind). La configuración de recreación histórica:

```sh
npx sv@0.15.3 create --template minimal --types ts --add tailwindcss="plugins:none" --install npm AcademicNetworkFrontEnd
```

Para desplegar, puede hacer falta un [adapter](https://svelte.dev/docs/kit/adapters) según el entorno (`adapter-auto` por defecto).
