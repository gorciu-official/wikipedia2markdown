import process from "node:process";
import { out } from "./util/console.ts";
import { wikipediaArticleExists } from "./util/articleExists.ts";
import { processArticle, schedule } from "./article.ts";

async function main() {
    const args = process.argv;

    if (args.length < 2) {
        return out.warn('Too low arguments length.');
    }

    const max_depth = await out.askForNumber('What\'s the max depth you want to crawl Wikipedia?');

    out.log(`Selected to crawl Wikipedia to the moment we reach ${max_depth} pages from the start.`);

    const entry_point = await out.askForInput('What\'s the entry point you want to start crawling at?');

    out.log(`Selected to crawl Wikipedia from entry point called ${entry_point}`);

    if (!(await wikipediaArticleExists(entry_point))) {
        out.err("This entry point does not exist.");
        out.err("Terminating...");
        return;
    }

    await schedule(() =>
        processArticle(entry_point, 0, max_depth)
    );
}

main();