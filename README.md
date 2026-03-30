# cms-plugins

Repositório central de plugins e temas do ecossistema de criação de blogs.

---

## 1. Visão Geral do Ecossistema

```
┌─────────────────────────────────┐
│       admin-ui-boilerplate      │  ← Componentes React copy-paste
│  Button, Modal, DataTable, ...  │
└────────────────┬────────────────┘
                 │ embutido em
                 ▼
┌─────────────────────────────────┐
│            cms-core             │  ← Base funcional + Walker template
│  auth · API CRUD · middleware   │     Alunos deployam/forkeiam daqui
│  admin pages · plugin system    │
│  src/plugins/ · update system   │
└────────────────┬────────────────┘
                 │ recebe plugins via
                 ▼
┌─────────────────────────────────┐
│           cms-plugins           │  ← ESTE REPOSITÓRIO
│  Fonte de verdade dos plugins   │     Criar/corrigir plugins aqui
│  registry.json · paths.json     │     Depois sincronizar no cms-core
└─────────────────────────────────┘
```

**Regra de ouro:** plugins nascem aqui, vivem no `cms-core`, chegam aos alunos via updater.

---

## 2. Fluxo para Criar um Novo Plugin

> Abra este chat e descreva o plugin que quer criar. O assistente cria os arquivos, sincroniza no cms-core e publica a release automaticamente.

Se quiser fazer manualmente, siga os passos abaixo:

### Passo 1 — Criar os arquivos do plugin aqui

```
plugins/<name>/
├── plugin.json              ← metadados e schema de config
├── <Component>.astro        ← componente injetado no tema (se tiver slot)
├── <Settings>.tsx           ← painel de configuração no admin
├── <admin>.astro            ← página admin (importa o Settings.tsx)
└── <util>.ts                ← lógica server-side (API calls, etc.)
```

### Passo 2 — Registrar no `registry.json`

```json
{
  "meu-plugin": { "version": "1.0.0", "description": "Descrição curta" }
}
```

### Passo 3 — Mapear no `templates/walker/paths.json`

```json
{
  "meu-plugin": {
    "files": [
      { "src": "Component.astro", "dest": "src/plugins/meu-plugin/Component.astro" },
      { "src": "Settings.tsx",    "dest": "src/plugins/meu-plugin/Settings.tsx" }
    ],
    "adminPages": [
      { "src": "admin.astro", "dest": "src/pages/admin/meu-plugin.astro" }
    ],
    "slots": [
      {
        "slot": "head",
        "import": "import Component from '../meu-plugin/Component.astro';",
        "component": "<Component />"
      }
    ]
  }
}
```

### Passo 4 — Commit + push (cms-plugins)

```bash
git add . && git commit -m "feat(meu-plugin): v1.0.0 — descrição"
git push
```

### Passo 5 — Sincronizar no cms-core

```bash
cp plugins/meu-plugin/* ../cms-core/src/plugins/meu-plugin/

cd ../cms-core
git add src/plugins/meu-plugin/
git commit -m "feat(meu-plugin): adiciona plugin v1.0.0"
git push
```

> Plugins novos **não precisam de release** — alunos recebem no próximo sync do fork.

---

## 3. Fluxo para Corrigir / Atualizar um Plugin

### Passo 1 — Editar o plugin aqui

```bash
# editar plugins/<name>/arquivo.ts
vim plugins/<name>/plugin.json       # bumpar version
vim registry.json                    # bumpar version
```

### Passo 2 — Commit + push (cms-plugins)

```bash
git add . && git commit -m "fix(<name>): descrição do fix"
git push
```

### Passo 3 — Sincronizar e publicar release no cms-core

```bash
cp plugins/<name>/arquivo.ts ../cms-core/src/plugins/<name>/

cd ../cms-core

# Atualizar update-manifest.json (bumpar version + listar arquivos que mudaram)
vim update-manifest.json

git add . && git commit -m "fix(<name>): descrição"
git push

# Publicar release — alunos verão no painel /admin/updates
gh release create vX.Y.Z --title "vX.Y.Z — descrição" --notes "..."
```

### Passo 4 — Alunos atualizam com 1 clique

```
/admin/updates → Verificar → Ver e Atualizar → Confirmar
```

---

## 4. `update-manifest.json` — Formato

Arquivo na raiz do `cms-core`. Deve existir em cada release tag.

```json
{
  "version": "1.0.3",
  "note": "Descrição do que mudou nesta versão.",
  "files": [
    "src/plugins/<name>/arquivo.ts",
    "src/plugins/_server.ts",
    "src/lib/templateConfig.ts"
  ]
}
```

**Regras:**
- `version` deve bater com a tag da release (sem o `v`)
- Listar apenas arquivos que **mudaram** — não precisa listar tudo
- Nunca incluir `src/data/` ou `src/content/` — são dados do aluno e estão protegidos

---

## 5. Anatomia de um Plugin

### `plugin.json`

```json
{
  "name": "meu-plugin",
  "version": "1.0.0",
  "description": "Descrição curta",
  "files": ["Component.astro", "Settings.tsx"],
  "adminPages": ["admin.astro"],
  "configDefaults": {
    "meuPlugin": { "enabled": true, "chave": "" }
  },
  "hub": {
    "label": "Meu Plugin",
    "description": "Descrição para o hub de plugins.",
    "icon": "NomeLucide",
    "color": "text-blue-600",
    "bg": "bg-blue-50",
    "href": "/admin/meu-plugin"
  },
  "changelog": "Versão inicial"
}
```

### Os 5 slots de injeção automática

| Slot | Onde é inserido no tema |
|------|------------------------|
| `head` | Dentro de `<head>` |
| `body-end` | Antes de `</body>` |
| `post-bottom` | Rodapé do conteúdo do post |
| `post-after` | Após o bloco do autor |
| `post-schema` | JSON-LD schema do post |

---

## 6. Estrutura do Repositório

```
cms-plugins/
├── plugins/
│   └── <name>/
│       ├── plugin.json
│       └── *.{astro,tsx,ts}
├── templates/
│   └── walker/
│       ├── theme.json
│       └── paths.json
├── public/themes/
│   └── <name>.png           ← screenshot 16:9, mín. 800×450px
├── registry.json             ← versões de todos os plugins
├── update-manifest.json      ← template do manifesto (copiar para cms-core)
└── src/                      ← dashboard Astro deste site
```

---

## 7. Criando um Novo Tema

1. **Clonar o cms-core** (não este repo)
   ```bash
   git clone https://github.com/8linksapp-maker/cms-core meu-tema
   cd meu-tema && rm -rf .git && git init
   ```

2. **Configurar identidade** em `src/lib/templateConfig.ts`:
   ```ts
   export const TEMPLATE_REPO = 'meu-usuario/meu-tema'; // repo do aluno no GitHub
   export const TEMPLATE_NAME = 'meu-tema';
   ```

3. **Customizar o design** — `BaseLayout.astro`, páginas públicas, CSS

4. **Deploy no Vercel** com as variáveis:
   ```
   ADMIN_SECRET=<senha>
   GITHUB_TOKEN=<token com permissão de escrita no repo>
   GITHUB_OWNER=<usuario>
   GITHUB_REPO=<nome-do-repo>
   ```

5. **Registrar o tema aqui** (opcional, para aparecer no dashboard):
   - Criar `templates/<name>/theme.json`
   - Criar `templates/<name>/paths.json`
   - Adicionar `public/themes/<name>.png`

---

## 8. Versão Atual

| Repositório | Versão | Link |
|-------------|--------|------|
| cms-plugins | ver `registry.json` | [github.com/8linksapp-maker/cms-plugins](https://github.com/8linksapp-maker/cms-plugins) |
| cms-core (Walker) | ver `src/data/version.json` | [github.com/8linksapp-maker/cms-core](https://github.com/8linksapp-maker/cms-core) |
| admin-ui-boilerplate | — | [github.com/8linksapp-maker/admin-ui-boilerplate](https://github.com/8linksapp-maker/admin-ui-boilerplate) |
