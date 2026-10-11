// Matches the text style of matthewtrent.me (measured values: Inter, 14px / weight 500,
// tight letter-spacing, 800px column, text inset 30px from the side lines).
//
// 1. Install the font once:        npm i @fontsource/inter
// 2. Run from your project folder:  node tweak-style.mjs
// Change the numbers below and run again any time; it replaces its own block, so
// nothing stacks. Phones (720px and under) keep their current sizes.
import fs from 'node:fs';

const WIDTH = 770;          // column width in px (his: 800)
const INSET = 30;           // space between the side lines and the text (his: 30)
const BODY_SIZE = 14;       // body text px (his: 14)
const BODY_LINE = 22.4;     // line height px (his: 22.4 = 1.6)
const BODY_WEIGHT = 500;    // (his: 500)
const BODY_SPACING = -0.031;  // letter-spacing in em (his: about -0.031)
const TITLE_SIZE = 30;      // page title and home section titles px (his: 30)
const TITLE_LINE = 36;      // (his: 36)
const TITLE_WEIGHT = 500;   // (his: 500)
const TITLE_SPACING = -0.035; // em (his: about -0.035)
const POST_H2_SIZE = 24;    // section headings inside blog posts px
const SECTION_GAP = 48;     // space above each section title px (his: 48; sections touch, no margin between)
const USE_INTER = true;     // false = keep your current font

const FONT = `Inter, -apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif`;
const START = '/* tweak:start */';
const END = '/* tweak:end */';
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&');
const strip = (s) => s.replace(new RegExp(`\\r?\\n?${esc(START)}[\\s\\S]*?${esc(END)}\\r?\\n?`), '\n');
const font = USE_INTER ? `body, button, input, textarea { font-family: ${FONT}; }` : '';

const home = `${START}
${font}
.page { --pad: ${INSET}px; }
@media (min-width: 721px) {
	.page .col { max-width: ${WIDTH}px; }
	.page .text, .page .text p {
		font-size: ${BODY_SIZE}px;
		line-height: ${BODY_LINE}px;
		font-weight: ${BODY_WEIGHT};
		letter-spacing: ${BODY_SPACING}em;
	}
	.page .band h1 {
		font-size: ${TITLE_SIZE}px; line-height: ${TITLE_LINE}px;
		font-weight: ${TITLE_WEIGHT}; letter-spacing: ${TITLE_SPACING}em;
	}
	.page .text { padding-bottom: 0; }
	.page .text p:last-child { margin-bottom: 0; }
	.page .sec-head { margin-top: ${SECTION_GAP}px; }
	.page .sec-head h2 {
		font-size: ${TITLE_SIZE}px; line-height: ${TITLE_LINE}px;
		font-weight: ${TITLE_WEIGHT}; letter-spacing: ${TITLE_SPACING}em;
	}
}
${END}
`;

const blog = `${START}
${font}
.post { --pad: ${INSET}px; }
@media (min-width: 721px) {
	.post .col { max-width: ${WIDTH}px !important; }
	.post .prose, .post .prose p, .post .prose li, .post .prose td, .post .prose th, .post .prose blockquote {
		font-size: ${BODY_SIZE}px !important;
		line-height: ${BODY_LINE}px !important;
		font-weight: ${BODY_WEIGHT};
		letter-spacing: ${BODY_SPACING}em;
	}
	.post .title h1 {
		font-size: ${TITLE_SIZE}px; line-height: ${TITLE_LINE}px;
		font-weight: ${TITLE_WEIGHT}; letter-spacing: ${TITLE_SPACING}em;
	}
	.post .prose h2 {
		margin: ${SECTION_GAP}px 0 12px;
		font-size: ${POST_H2_SIZE}px !important; line-height: 1.2 !important;
		font-weight: ${TITLE_WEIGHT}; letter-spacing: ${TITLE_SPACING}em;
	}
	.post .prose h3 { font-weight: ${TITLE_WEIGHT}; letter-spacing: -0.025em; }
	.post .prose pre, .post .prose code { letter-spacing: 0; font-weight: 400; }
}
${END}
`;

const fontImports = ["@fontsource/inter/400.css", "@fontsource/inter/500.css", "@fontsource/inter/700.css"];
function addFont(s) {
	if (!USE_INTER || s.includes(fontImports[1])) return s;
	const lines = fontImports.map((f) => `import '${f}';`).join('\n');
	return s.replace(/^---\r?\n/, (m) => m + lines + '\n');
}
function patch(file, fn) {
	if (!fs.existsSync(file)) return console.log('MISSING:', file, '(run this from your project folder)');
	fs.writeFileSync(file, fn(strip(fs.readFileSync(file, 'utf8'))));
	console.log('updated', file);
}
patch('src/styles/column.css', (s) => s.trimEnd() + '\n\n' + home);
patch('src/layouts/BlogPost.astro', (s) => {
	// put the block inside the page's <style is:global> (a scoped style would not reach .post)
	const open = s.indexOf('<style is:global');
	const i = open < 0 ? -1 : s.indexOf('</style>', open);
	if (i < 0) { console.log('could not find <style is:global> in BlogPost.astro'); return s; }
	return addFont(s.slice(0, i) + blog + '\t\t\t' + s.slice(i));
});
patch('src/pages/index.astro', addFont);
