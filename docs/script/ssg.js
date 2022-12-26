import puppeteer from 'puppeteer';
import { globbySync } from 'globby';
import fs from 'fs';
import ora from 'ora';

const siteUrl = 'http://localhost:8765';

const urls = [
    { route: 'index', url: `${siteUrl}/` },
    { route: 'changelog', url: `${siteUrl}/changelog` },
    ...globbySync(['./**/[!_]?*.md', '!node_modules', '!README.md']).map((path) => ({
        route: path.replace('.md', ''),
        url: `${siteUrl}/${path.replace('.md', '')}`,
    })),
];

console.log('Generating static content for', urls.length, 'urls');
const browser = await puppeteer.launch();

for (let i = 0; i < urls.length; i++) {
    const { url, route } = urls[i];
    const spinner = ora(`${i + 1}/${urls.length}\tGenerating ${url}`).start();
    const page = await browser.newPage();

    await page.goto(url);
    await page.waitForNetworkIdle({ idleTime: 2000, timeout: 5000 });
    await page.evaluate("document.querySelectorAll('script').forEach(e => e.remove())");
    const content = await page.content();
    fs.writeFileSync(`../doc-serve/public/static/${route}.html`, content);
    spinner.succeed();
    await page.close();
}

await browser.close();
