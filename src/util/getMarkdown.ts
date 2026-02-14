export default function sleep(ms: number): Promise<void> { 
    return new Promise(resolve => setTimeout(resolve, ms)); 
}

let lastRequest = 0;
const MIN_DELAY = 50;

async function throttle() {
    const now = Date.now();
    const diff = now - lastRequest;

    if (diff < MIN_DELAY) {
        await sleep(MIN_DELAY - diff);
    }

    lastRequest = Date.now();
}

export async function getArticleMarkdown(t: string): Promise<string> {
    try {
        await throttle();

        const u = new URL('https://en.wikipedia.org/w/api.php');
        u.search = new URLSearchParams({
            action: 'query',
            prop: 'revisions',
            titles: t,
            rvprop: 'content',
            format: 'json',
            redirects: '1'
        }).toString();

        const r = await fetch(u.toString(), {
            headers: {
                'User-Agent': 'Wikipedia2Markdown/1.0 (contact: gorciuyt@gmail.com)'
            }
        });

        if (r.status === 429) {
            await sleep(1000);
            return getArticleMarkdown(t);
        }

        if (!r.ok) return '';

        const d = await r.json();
        const p = d.query.pages;
        const i = Object.keys(p)[0];

        if (i === '-1') return '';

        return p[i].revisions[0]['*'] ?? '';

    } catch {
        return '';
    }
}
