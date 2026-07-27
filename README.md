# AcademicNetwork FrontEnd

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
| `pnpm check` / `npm run check` | `svelte-check` + sync de tipos |

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

## Scaffold original

El proyecto se generó con [`sv`](https://github.com/sveltejs/cli) (plantilla minimal + TypeScript + Tailwind). La configuración de recreación histórica:

```sh
npx sv@0.15.3 create --template minimal --types ts --add tailwindcss="plugins:none" --install npm AcademicNetworkFrontEnd
```

Para desplegar, puede hacer falta un [adapter](https://svelte.dev/docs/kit/adapters) según el entorno (`adapter-auto` por defecto).
