/**
 * wordpress-api.ts — API endpoint for WP Importer v3
 *
 * Estratégia: browser envia posts 1 a 1, servidor acumula,
 * no final faz 1 commit via GitHub Trees API.
 *
 * Endpoints (todos POST, JSON body):
 *   action: "init"       — Inicia sessão, processa categorias/autores
 *   action: "post"       — Processa 1 post (download imagens, serializa)
 *   action: "finalize"   — Faz batch commit de tudo no GitHub (1 commit, 1 deploy)
 */

import type { APIRoute } from 'astro';
import { validateSession } from '../../../../../lib/auth';
import { serializePost, postPath } from '../../../../../plugins/_adapter';
import { readFileFromRepo } from '../../../../../plugins/_server';

export const prerender = false;

// ── In-memory session (dura enquanto a serverless function está quente) ────

interface PendingFile { path: string; content: string; binary?: boolean }
interface SessionData {
    files: PendingFile[];
    stats: {
        postsImported: number; postsSkipped: number; postErrors: string[];
        imagesImported: number;
        authorsImported: number; authorsSkipped: number;
        categoriesImported: number; categoriesSkipped: number;
    };
    categories: string[];
    authors: any[];
    usedSlugs: Set<string>;
    authorLoginToId: Map<string, string>;
}

let session: SessionData | null = null;

// ── Helpers ───────────────────────────────────────────────────────────────

function generateSlug(str: string): string {
    return str.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function htmlToText(html: string): string {
    return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
        .replace(/&[a-z]+;/gi, ' ').replace(/\s+/g, ' ').trim();
}

async function downloadImage(url: string): Promise<{ base64: string; ext: string } | null> {
    try {
        if (!url || url.startsWith('data:') || url.startsWith('/')) return null;
        const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
        if (!res.ok) return null;
        const ct = res.headers.get('content-type') || '';
        if (!ct.startsWith('image/')) return null;
        const extMap: Record<string, string> = { jpeg: 'jpg', jpg: 'jpg', png: 'png', gif: 'gif', webp: 'webp', 'svg+xml': 'svg' };
        const rawExt = ct.split('/')[1]?.split(';')[0]?.trim() || 'jpg';
        const ext = extMap[rawExt] || 'jpg';
        const buf = await res.arrayBuffer();
        return { base64: Buffer.from(buf).toString('base64'), ext };
    } catch { return null; }
}

function extractImageUrls(html: string): string[] {
    const urls: string[] = [];
    const re = /<img[^>]+src=["']([^"']+)["'][^>]*>/gi;
    let m;
    while ((m = re.exec(html)) !== null) {
        if (m[1] && !m[1].startsWith('data:')) urls.push(m[1]);
    }
    return [...new Set(urls)];
}

// ── Auth helper ──────────────────────────────────────────────────────────

async function checkAuth(request: Request): Promise<boolean> {
    const cookieHeader = request.headers.get('cookie') || '';
    const cookies = Object.fromEntries(
        cookieHeader.split(';').map(c => { const [k, ...v] = c.trim().split('='); return [k, decodeURIComponent(v.join('='))]; })
    );
    return validateSession(cookies['admin_session']);
}

// ── GitHub Trees API: batch commit ──────────────────────────────────────

async function batchCommit(files: PendingFile[], message: string): Promise<boolean> {
    const token = (process.env.GITHUB_TOKEN || '').trim();
    const owner = (process.env.GITHUB_OWNER || '').trim();
    const repo  = (process.env.GITHUB_REPO || '').trim();

    if (!token || !owner || !repo) {
        // Dev mode: write to filesystem
        const fs = await import('node:fs/promises');
        const nodePath = await import('node:path');
        for (const f of files) {
            const abs = nodePath.resolve(process.cwd(), f.path);
            await fs.mkdir(nodePath.dirname(abs), { recursive: true });
            if (f.binary) {
                await fs.writeFile(abs, Buffer.from(f.content, 'base64'));
            } else {
                await fs.writeFile(abs, f.content, 'utf-8');
            }
        }
        return true;
    }

    const headers = {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
    };
    const api = `https://api.github.com/repos/${owner}/${repo}`;

    // 1. Get latest commit SHA + tree SHA
    const refRes = await fetch(`${api}/git/ref/heads/main`, { headers });
    if (!refRes.ok) throw new Error('Erro ao obter ref main');
    const refData = await refRes.json() as any;
    const baseCommitSha = refData.object.sha;

    const commitRes = await fetch(`${api}/git/commits/${baseCommitSha}`, { headers });
    const commitData = await commitRes.json() as any;
    const baseTreeSha = commitData.tree.sha;

    // 2. Create blobs for each file
    const treeItems: any[] = [];
    for (const f of files) {
        const blobRes = await fetch(`${api}/git/blobs`, {
            method: 'POST', headers,
            body: JSON.stringify({
                content: f.binary ? f.content : Buffer.from(f.content).toString('base64'),
                encoding: 'base64',
            }),
        });
        if (!blobRes.ok) continue;
        const blob = await blobRes.json() as any;
        treeItems.push({
            path: f.path,
            mode: '100644',
            type: 'blob',
            sha: blob.sha,
        });
    }

    if (treeItems.length === 0) return false;

    // 3. Create new tree
    const treeRes = await fetch(`${api}/git/trees`, {
        method: 'POST', headers,
        body: JSON.stringify({ base_tree: baseTreeSha, tree: treeItems }),
    });
    if (!treeRes.ok) throw new Error('Erro ao criar tree');
    const newTree = await treeRes.json() as any;

    // 4. Create commit
    const newCommitRes = await fetch(`${api}/git/commits`, {
        method: 'POST', headers,
        body: JSON.stringify({
            message,
            tree: newTree.sha,
            parents: [baseCommitSha],
        }),
    });
    if (!newCommitRes.ok) throw new Error('Erro ao criar commit');
    const newCommit = await newCommitRes.json() as any;

    // 5. Update ref
    const updateRes = await fetch(`${api}/git/refs/heads/main`, {
        method: 'PATCH', headers,
        body: JSON.stringify({ sha: newCommit.sha }),
    });

    return updateRes.ok;
}

// ── POST handler ────────────────────────────────────────────────────────

export const POST: APIRoute = async ({ request }) => {
    try {
        if (!await checkAuth(request)) {
            return new Response(JSON.stringify({ error: 'Não autorizado' }), {
                status: 401, headers: { 'Content-Type': 'application/json' },
            });
        }

        const body = await request.json();
        const action = body.action as string;

        // ── INIT: start import session ──────────────────────────────
        if (action === 'init') {
            const categories: string[] = body.categories || [];
            const authors: { login: string; displayName: string; firstName: string; lastName: string }[] = body.authors || [];

            // Load current state
            let currentCategories: string[] = [];
            try {
                const raw = await readFileFromRepo('src/data/categories.json');
                if (raw) currentCategories = JSON.parse(raw);
            } catch {}

            let currentAuthors: any[] = [];
            try {
                const raw = await readFileFromRepo('src/data/authors.json');
                if (raw) currentAuthors = JSON.parse(raw);
            } catch {}

            let existingSlugs: string[] = [];
            try {
                const raw = await readFileFromRepo('src/data/post-slugs.json');
                if (raw) existingSlugs = JSON.parse(raw);
            } catch {}

            // Process categories
            let catImported = 0, catSkipped = 0;
            for (const name of categories) {
                if (!name || currentCategories.includes(name)) { catSkipped++; continue; }
                currentCategories.push(name);
                catImported++;
            }

            // Process authors
            const authorLoginToId = new Map<string, string>();
            let authImported = 0, authSkipped = 0;
            for (const a of authors) {
                if (!a.login) continue;
                const id = generateSlug(a.login);
                authorLoginToId.set(a.login, id);
                if (currentAuthors.some((x: any) => x.id === id)) { authSkipped++; continue; }
                currentAuthors.push({
                    id, name: a.displayName, role: 'Autor', avatar: '',
                    bio: `${a.firstName} ${a.lastName}`.trim() || a.displayName,
                });
                authImported++;
            }

            // Init session
            const files: PendingFile[] = [];
            if (catImported > 0) {
                files.push({ path: 'src/data/categories.json', content: JSON.stringify(currentCategories, null, 2) });
            }
            if (authImported > 0) {
                files.push({ path: 'src/data/authors.json', content: JSON.stringify(currentAuthors, null, 2) });
            }

            session = {
                files,
                stats: {
                    postsImported: 0, postsSkipped: 0, postErrors: [],
                    imagesImported: 0,
                    authorsImported: authImported, authorsSkipped: authSkipped,
                    categoriesImported: catImported, categoriesSkipped: catSkipped,
                },
                categories: currentCategories,
                authors: currentAuthors,
                usedSlugs: new Set(existingSlugs),
                authorLoginToId,
            };

            return new Response(JSON.stringify({
                ok: true,
                authors: { imported: authImported, skipped: authSkipped },
                categories: { imported: catImported, skipped: catSkipped },
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }

        // ── POST: process one post ──────────────────────────────────
        if (action === 'post') {
            if (!session) {
                return new Response(JSON.stringify({ error: 'Sessão não iniciada. Envie action: "init" primeiro.' }), {
                    status: 400, headers: { 'Content-Type': 'application/json' },
                });
            }

            const post = body.post;
            if (!post) {
                return new Response(JSON.stringify({ error: 'Post não enviado.' }), {
                    status: 400, headers: { 'Content-Type': 'application/json' },
                });
            }

            try {
                let slug = post.slug || generateSlug(post.title || 'sem-titulo');
                if (!slug) { session.stats.postsSkipped++; return ok({ skipped: true }); }

                let base = slug, counter = 1;
                while (session.usedSlugs.has(slug)) { slug = `${base}-${counter++}`; }
                session.usedSlugs.add(slug);

                const authorId = post.creator
                    ? (session.authorLoginToId.get(post.creator) || generateSlug(post.creator))
                    : undefined;

                let pubDate: string | undefined;
                if (post.postDate && post.status === 'publish') {
                    try {
                        const d = new Date(post.postDate.replace(' ', 'T'));
                        if (!isNaN(d.getTime())) pubDate = d.toISOString().split('T')[0];
                    } catch {}
                }

                // Thumbnail
                let heroImage = '';
                if (post.thumbnailUrl) {
                    const dl = await downloadImage(post.thumbnailUrl);
                    if (dl) {
                        const fn = `${Date.now()}-${slug}-thumb.${dl.ext}`;
                        session.files.push({ path: `public/uploads/${fn}`, content: dl.base64, binary: true });
                        heroImage = `/uploads/${fn}`;
                        session.stats.imagesImported++;
                    }
                }

                // Content images
                let content = post.content || '';
                const imgUrls = post.imageUrls || extractImageUrls(content);
                for (const imgUrl of imgUrls) {
                    const dl = await downloadImage(imgUrl);
                    if (dl) {
                        const fn = `${Date.now()}-${slug}-${Math.random().toString(36).slice(2, 6)}.${dl.ext}`;
                        session.files.push({ path: `public/uploads/${fn}`, content: dl.base64, binary: true });
                        content = content.split(imgUrl).join(`/uploads/${fn}`);
                        session.stats.imagesImported++;
                    }
                }

                // Description
                let description = '';
                if (post.excerpt) description = htmlToText(post.excerpt).substring(0, 160);
                if (!description && content) description = htmlToText(content).substring(0, 160);

                // Serialize
                const md = serializePost({
                    title: post.title || 'Sem título',
                    slug, description, content,
                    heroImage, category: post.category || '',
                    author: authorId || '',
                    pubDate: pubDate || new Date().toISOString().split('T')[0],
                    draft: post.status === 'draft',
                });

                session.files.push({ path: postPath(slug), content: md });
                session.stats.postsImported++;

                return ok({ imported: true, slug });
            } catch (err: any) {
                session.stats.postErrors.push(`"${post.title}": ${err.message}`);
                session.stats.postsSkipped++;
                return ok({ error: err.message });
            }
        }

        // ── FINALIZE: batch commit everything ───────────────────────
        if (action === 'finalize') {
            if (!session) {
                return new Response(JSON.stringify({ error: 'Sessão não iniciada.' }), {
                    status: 400, headers: { 'Content-Type': 'application/json' },
                });
            }

            const s = session.stats;
            const totalFiles = session.files.length;

            console.log(`[WP Import] Finalizando: ${totalFiles} arquivos, ${s.postsImported} posts, ${s.imagesImported} imagens`);

            let commitOk = false;
            if (totalFiles > 0) {
                commitOk = await batchCommit(
                    session.files,
                    `CMS: Import WordPress — ${s.postsImported} posts, ${s.categoriesImported} categorias, ${s.authorsImported} autores`
                );
            }

            const result = {
                success: commitOk || totalFiles === 0,
                posts: { imported: s.postsImported, skipped: s.postsSkipped, errors: s.postErrors, imagesImported: s.imagesImported },
                authors: { imported: s.authorsImported, skipped: s.authorsSkipped },
                categories: { imported: s.categoriesImported, skipped: s.categoriesSkipped },
                errors: commitOk ? [] : ['Erro ao fazer commit no GitHub'],
                totalFiles,
            };

            session = null; // Cleanup

            return new Response(JSON.stringify(result), {
                status: result.success ? 200 : 422,
                headers: { 'Content-Type': 'application/json' },
            });
        }

        return new Response(JSON.stringify({ error: 'Ação inválida. Use: init, post, finalize' }), {
            status: 400, headers: { 'Content-Type': 'application/json' },
        });

    } catch (error: any) {
        console.error('[WP Import] Erro fatal:', error);
        session = null;
        return new Response(JSON.stringify({
            success: false,
            error: error.message || 'Erro interno',
            posts: { imported: 0, skipped: 0, errors: [], imagesImported: 0 },
            authors: { imported: 0, skipped: 0 },
            categories: { imported: 0, skipped: 0 },
            errors: [error.message || 'Erro desconhecido'],
        }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }
};

function ok(data: any) {
    return new Response(JSON.stringify(data), {
        status: 200, headers: { 'Content-Type': 'application/json' },
    });
}
