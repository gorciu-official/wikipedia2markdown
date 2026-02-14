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
        const d = await r.json();
        const p = d.query.pages;
        const k = Object.keys(p)[0];

        return k !== '-1';
    } catch (e) {
        console.log(e);
        return false;
    }
}