# cms-plugins

Repositório central de plugins e temas do ecossistema de criação de blogs.

---

## 1. Visão Geral do Ecossistema

O ecossistema é composto por três repositórios independentes:

```
┌─────────────────────────────────┐
│       admin-ui-boilerplate      │  ← Componentes React copy-paste
│  Button, Modal, DataTable, ...  │     (usado sozinho ou via cms-core)
└────────────────┬────────────────┘
                 │ embutido em
                 ▼
┌─────────────────────────────────┐
│            cms-core             │  ← Base funcional completa
│  auth · API CRUD · middleware   │     Clonar para novo tema
│  admin pages · plugin system    │
│  data layer · content schema    │
└────────────────┬────────────────┘
                 │ instala plugins via
                 ▼
┌─────────────────────────────────┐
│           cms-plugins           │  ← Este repositório
│  14 plugins versionados         │     Analytics, SEO, email, ads...
│  templates/  → mapeamento       │
└─────────────────────────────────┘
```

| Repositório | Propósito | Quando usar |
|-------------|-----------|-------------|
| **admin-ui-boilerplate** | Componentes React copy-paste (Button, Modal, DataTable, Toast, etc.) | Qualquer ferramenta ou app admin |
| **cms-core** | Base funcional completa: auth, API CRUD, middleware, admin pages, plugin system, data layer. Já usa admin-ui-boilerplate internamente | Ponto de partida para novo tema de blog |
| **cms-plugins** | 14 plugins independentes com versionamento próprio + mapeamento por tema | Instalados nos temas via PluginsHub |

**Fluxo para novo tema:** Clonar `cms-core` → customizar design (BaseLayout, páginas públicas, CSS) → instalar plugins via PluginsHub → registrar tema aqui.

---

## 2. Estrutura deste Repositório

```
cms-plugins/
├── plugins/
│   └── <name>/
│       ├── plugin.json          # metadados do plugin
│       └── *.{astro,tsx,ts}     # código do plugin
├── templates/
│   └── <name>/
│       ├── theme.json           # metadados do tema
│       └── paths.json           # mapeamento plugin → destinos no tema
├── public/
│   └── themes/
│       └── <name>.png           # screenshot do tema
├── registry.json                # índice de versões de todos os plugins
└── src/                         # dashboard Astro (este site)
    ├── layouts/DashLayout.astro
    ├── pages/
    │   ├── index.astro
    │   ├── plugin/[name].astro
    │   └── theme/[name].astro
    └── lib/data.ts
```

---

## 3. Anatomia de um Plugin

### `plugin.json`

```json
{
  "name": "google-analytics",
  "version": "1.0.0",
  "description": "Google Analytics GA4",
  "files": ["GoogleAnalytics.astro", "SettingsGA.tsx"],
  "adminPages": ["analytics.astro"],
  "configDefaults": {
    "googleAnalytics": { "measurementId": "" }
  },
  "hub": {
    "label": "Google Analytics",
    "description": "Rastreie visitas e comportamento dos leitores com GA4.",
    "icon": "BarChart3",
    "color": "text-orange-600",
    "bg": "bg-orange-50",
    "href": "/admin/analytics"
  },
  "changelog": "Versão inicial"
}
```

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `name` | string | Identificador único (slug) |
| `version` | string | Semver da versão atual |
| `files` | string[] | Arquivos de componente (copiados para `src/plugins/<name>/`) |
| `adminPages` | string[] | Páginas admin (copiadas para `src/pages/admin/`) |
| `configDefaults` | object | Valores padrão da config persistida no tema |
| `hub.label` | string | Nome exibido no PluginsHub |
| `hub.icon` | string | Ícone Lucide |
| `hub.color` / `hub.bg` | string | Classes Tailwind de cor |
| `hub.href` | string | Rota da página admin do plugin |
| `changelog` | string | Nota da versão atual |

### Os 5 slots de injeção automática

Os slots permitem que o plugin injete código no layout do tema sem edição manual:

| Slot | Localização no tema |
|------|---------------------|
| `head` | Dentro de `<head>` (scripts, meta tags) |
| `body-end` | Antes de `</body>` (scripts de rastreamento) |
| `post-bottom` | Rodapé do conteúdo do post |
| `post-after` | Após o bloco do autor |
| `post-schema` | Schema markup JSON-LD do post |

---

## 4. Mapeamento por Tema (`paths.json`)

O arquivo `templates/<name>/paths.json` define onde cada plugin é instalado no tema:

```json
{
  "google-analytics": {
    "files": [
      { "src": "GoogleAnalytics.astro", "dest": "src/plugins/google-analytics/GoogleAnalytics.astro" },
      { "src": "SettingsGA.tsx",        "dest": "src/plugins/google-analytics/SettingsGA.tsx" }
    ],
    "adminPages": [
      { "src": "analytics.astro", "dest": "src/pages/admin/analytics.astro" }
    ],
    "slots": [
      {
        "slot": "head",
        "import": "import GoogleAnalytics from '../google-analytics/GoogleAnalytics.astro';",
        "component": "<GoogleAnalytics />"
      }
    ]
  }
}
```

- **`files`** — componentes copiados; `src` relativo a `plugins/<name>/`, `dest` relativo à raiz do tema.
- **`adminPages`** — páginas admin copiadas; mesma lógica.
- **`slots`** — injeção automática via PluginsHub: `import` é inserido no topo do layout, `component` no slot correspondente.

---

## 5. Criando um Novo Tema (passo a passo)

1. **Clonar o cms-core**
   ```bash
   git clone https://github.com/8linksapp-maker/cms-core meu-tema
   cd meu-tema
   ```

2. **Configurar identidade do tema**
   Em `src/lib/templateConfig.ts`, atualizar:
   ```ts
   export const TEMPLATE_REPO = 'meu-usuario/meu-tema';
   export const TEMPLATE_NAME = 'meu-tema';
   ```

3. **Criar o design**
   - `src/layouts/BaseLayout.astro` — layout raiz (slots já preparados)
   - Páginas públicas: `src/pages/index.astro`, `[slug].astro`, etc.
   - Componentes visuais em `src/components/layout/`, `sections/`, `sidebar/`, `ui/`
   - CSS / imagens / fontes em `public/`
   - `src/data/home.json` — conteúdo da home

4. **Instalar plugins**
   Via PluginsHub admin (rota `/admin/hub`) ou copiando manualmente de `cms-plugins/plugins/<name>/`.

5. **Registrar o tema no cms-plugins** (ver seção 6)

6. **Deploy no Vercel**
   Variáveis de ambiente obrigatórias:
   ```
   ADMIN_SECRET=<senha-do-admin>
   GITHUB_TOKEN=<personal-access-token>
   GITHUB_OWNER=<usuario-ou-org>
   GITHUB_REPO=<nome-do-repo>
   ```

---

## 6. Registrando um Tema no cms-plugins

Para que o tema apareça no dashboard e seja instalável:

### 6.1 Criar `templates/<name>/theme.json`

```json
{
  "name": "meu-tema",
  "label": "Meu Tema",
  "description": "Descrição curta do tema.",
  "version": "1.0.0",
  "status": "Ativo",
  "screenshot": "/themes/meu-tema.png"
}
```

### 6.2 Criar `templates/<name>/paths.json`

Mapear cada plugin instalado no tema (ver seção 4).

### 6.3 Adicionar screenshot

Colocar `public/themes/<name>.png` (proporção 16:9, mín. 800×450px).

O dashboard detecta automaticamente novos temas pelo diretório `templates/`.

---

## 7. O que muda por tema vs. o que vem do cms-core

| Camada | O que é customizado pelo tema | O que vem do cms-core (não tocar) |
|--------|-------------------------------|-----------------------------------|
| Layout | `BaseLayout.astro` | — |
| Páginas públicas | `index.astro`, `[slug].astro`, categoria, tag | — |
| Componentes visuais | `layout/`, `sections/`, `sidebar/`, `ui/` | `admin/` (componentes React) |
| Estilo | CSS, fontes, imagens em `public/` | — |
| Conteúdo | `src/data/home.json` | `src/data/posts/`, `src/data/config.json` |
| Auth | — | `src/middleware.ts`, `src/lib/auth.ts` |
| API | — | `src/pages/api/` (CRUD completo) |
| Admin pages | — | `src/pages/admin/` |
| Plugin system | — | `src/lib/plugins.ts`, `src/pages/admin/hub.astro` |
| Schema | — | `src/content/config.ts` |

---

## 8. Repos Relacionados

| Repositório | URL | Descrição |
|-------------|-----|-----------|
| **admin-ui-boilerplate** | `github.com/8linksapp-maker/admin-ui-boilerplate` | Componentes React copy-paste para UIs admin |
| **cms-core** | `github.com/8linksapp-maker/cms-core` | Base funcional completa para novos temas |
| **Walker** (referência) | `github.com/8linksapp-maker/walker` | Primeiro tema construído sobre o cms-core |
