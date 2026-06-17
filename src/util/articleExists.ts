import { out } from "./console.ts";

export async function wikipediaArticleExists(t: string): Promise<boolean> {
    try {
        const u = new URL('https://en.wikipedia.org/w/api.php');
        u.search = new URLSearchParams({
            action: 'query',
            format: 'json',
            titles: t,
            origin: '*'
        }).toString();

        const r = await fetch(u.toString());
        const x = await r.text();

        if (x.includes('bot-traffic')) {
            out.warn("Scheduling the check to be completed after 500ms because of ratelimits.");
            await new Promise((resolve) => setTimeout(resolve, 500));
            return await wikipediaArticleExists(t);
        }

        const d = JSON.parse(x);
        const p = d.query.pages;
        const k = Object.keys(p)[0];

        return k !== '-1';
    } catch (e) {
        console.log(e);
        return false;
    }
}
