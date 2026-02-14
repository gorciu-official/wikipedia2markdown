import { out } from "./util/console.ts";
import { wikipediaArticleExists } from "./util/articleExists.ts";
import { getArticleMarkdown } from "./util/getMarkdown.ts";
import fs from 'node:fs';

const MAX_CONCURRENT = 5;
let active = 0;
const queue: (() => Promise<void>)[] = [];

export async function schedule(task: () => Promise<void>) {
    if (active >= MAX_CONCURRENT) {
        await new Promise<void>(resolve => queue.push(resolve as () => Promise<void>));
    }

    active++;

    try {
        await task();
    } finally {
        active--;
        if (queue.length > 0) {
            const next = queue.shift();
            next?.();
        }
    }
}

export function extractWikipediaReferences(markdown: string): string[] {
    const results = new Set<string>();

    const r = /\[([^\]]+)\]\((https?:\/\/en\.wikipedia\.org\/wiki\/[^\s)]+(?:\([^\)]*\)[^\s)]*)*)\)/gi;

    let match: RegExpExecArray | null;

    while ((match = r.exec(markdown)) !== null) {
        const url = match[2];

        const raw_title = url.replace(/^https?:\/\/en\.wikipedia\.org\/wiki\//i, '').split('#')[0];

        // bezpieczne decode
        let decoded = raw_title.replace(/%/g, '%25'); 
        try {
            decoded = decodeURIComponent(decoded);
        } catch {
            decoded = raw_title; 
        }

        decoded = decoded.replace(/_/g, ' ').trim();

        if (decoded.length > 0) {
            results.add(decoded);
        }
    }

    return Array.from(results);
}


export function wikiFormattingToMarkdown(c: string, title: string): string {

    const r_comments = /<!--([\s\S]*?)-->/g;
    const r_ref_block = /<ref[^>]*>[\s\S]*?<\/ref>/gi;
    const r_ref_self = /<ref[^/>]*\/\s*>/gi;
    const r_html_tags = /<[^>]+>/g;

    let r = c
        .replace(r_comments, '')
        .replace(r_ref_block, '')
        .replace(r_ref_self, '')
        .replace(r_html_tags, '');

    const r_template = /\{\{[^{}]*\}\}/g;
    while (r_template.test(r)) {
        r = r.replace(r_template, '');
    }

    const r_headers = /^(={2,6})\s*(.*?)\s*\1$/gm;
    const r_bold = /'''(.*?)'''/g;
    const r_italic = /''(.*?)''/g;

    r = r
        .replace(r_headers, (_m, eq, title) => {
            const level = eq.length - 1;
            return `${'#'.repeat(level) + '#'} ${title.trim()}`;
        })
        .replace(r_bold, '**$1**')
        .replace(r_italic, '*$1*');

    const skip_sections = new Set([
        'references',
        'notes',
        'citations',
        'works cited',
        'see also'
    ]);

    const lines = r.split('\n');
    const output: string[] = [];

    let skip_mode = false;
    let skip_level = 0;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const header_match = line.match(/^(#{1,6})\s+(.*)$/);

        if (header_match) {
            const level = header_match[1].length;
            const title = header_match[2].trim().toLowerCase();

            if (skip_mode) {
                if (level <= skip_level) {
                    skip_mode = false;
                } else {
                    continue;
                }
            }

            if (skip_sections.has(title)) {
                skip_mode = true;
                skip_level = level;
                continue;
            }
        }

        if (!skip_mode) {
            output.push(line);
        }
    }

    const cleaned = output.join('\n');

    const lines2 = cleaned.split('\n');
    const final_lines: string[] = [];

    for (let i = 0; i < lines2.length; i++) {
        const line = lines2[i];
        const header_match = line.match(/^(#{1,6})\s+(.*)$/);

        if (header_match) {
            let has_content = false;

            for (let j = i + 1; j < lines2.length; j++) {
                if (/^#{1,6}\s+/.test(lines2[j])) break;
                if (lines2[j].trim() !== '') {
                    has_content = true;
                    break;
                }
            }

            if (!has_content) continue;
        }

        final_lines.push(line);
    }

    const spaced: string[] = [];

    for (let i = 0; i < final_lines.length; i++) {
        const line = final_lines[i];
        const is_header = /^#{1,6}\s+/.test(line);

        if (is_header) {
            if (spaced.length > 0 && spaced[spaced.length - 1].trim() !== '') {
                spaced.push('');
            }

            spaced.push(line);

            if (i + 1 < final_lines.length && final_lines[i + 1].trim() !== '') {
                spaced.push('');
            }

        } else {
            spaced.push(line);
        }
    }

    const out = spaced
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();

    return `# ${title.replaceAll('_', ' ')}\n\n` + out;
}

const R_IMAGES = /\[\[(?:File|Image):([^\|\]]+)(?:[^\]]*)\]\]/gi;
const R_LINKS = /\[\[([^|\]]+)(?:\|([^\]]+))?\]\]/g;

export function wikilinksToMarkdown(c: string): string {

    c = c.replace(R_IMAGES, (_m, name) => {
        const clean = name.trim();
        const url = 'https://en.wikipedia.org/wiki/Special:FilePath/' + clean.split(' ').join('_');
        return `![image](${url})`;
    });

    c = c.replace(R_LINKS, (_m, link, text) => {
        const target = link.trim();
        const display = (text ? text.trim() : target) || '<unknown>';

        if (target.startsWith('wikt:') || target.startsWith('Wikt:')) {
            return `[${display}](https://en.wiktionary.org/wiki/${target.slice(5)})`;
        }

        const formatted =
            target.charAt(0).toUpperCase() + target.slice(1);

        return `[${display}](https://en.wikipedia.org/wiki/${formatted.split(' ').join('_')})`;
    });

    return c;
}

export async function processArticle(title: string, depth: number, maxDepth: number) {
    if (depth == (maxDepth + 1)) 
        return out.log(`Thread finished executing - reached end at ${title}, not indexing this article`);

    title = title.replaceAll(' ', '_');
    if (title.includes('(')) title = title + ')';

    if (!fs.existsSync('results'))
        fs.mkdirSync('results');

    if (fs.existsSync(`results/report_${title.replaceAll('/', '_')}.md`))
        return out.log(`Skipping article ${title} - report already exists.`);

    if (!(await wikipediaArticleExists(title))) 
        return out.warn(`Article referencing other non-existing article ${title}`);

    // download
    let markdown = await getArticleMarkdown(title);
    out.log(`Finished downloading text: ${title}`);

    // formatting
    markdown = wikiFormattingToMarkdown(markdown, title);
    out.log(`Finished formatting text: ${title}`);

    // correcting links syntax
    markdown = wikilinksToMarkdown(markdown);
    out.log(`Finished correcting syntax for links in: ${title}`);
    while (markdown.includes('*\n')) markdown = markdown.replaceAll('*\n', '\n');
    while (markdown.includes('\n\n\n')) markdown = markdown.replaceAll('\n\n\n', '\n\n');

    // writing
    out.log(`Writing output: ${title}`);
    fs.writeFileSync(`results/report_${title.replaceAll('/', '_')}.md`, markdown);

    // references
    out.log(`Checking for references: ${title}`);
    const references = extractWikipediaReferences(markdown);
    if (references.length == 0)
        out.warn(`Article ${title} does not reference other articles`);
    else 
        out.log(`Article ${title} references ${references.length} articles.`);
    for (const article_title of references) {
        schedule(() =>
            processArticle(article_title, depth + 1, maxDepth)
        );
    }

    out.success(`Finished: ${title}`);
}