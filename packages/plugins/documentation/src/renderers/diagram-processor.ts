import { renderErdSvg } from './erd';

interface DiagramFile {
    filename: string;
    content: string;
}

interface DiagramResult {
    markdown: string;
    svgFiles: DiagramFile[];
}

const MERMAID_BLOCK_RE = /```mermaid\n([\s\S]*?)```/g;

/**
 * Extracts inline Mermaid code blocks from markdown, renders each to SVG,
 * and replaces the blocks with image references to companion SVG files.
 */
export async function processDiagrams(
    markdown: string,
    baseName: string,
    format: 'mermaid' | 'svg' | 'both',
    theme?: string,
): Promise<DiagramResult> {
    if (format === 'mermaid') {
        return { markdown, svgFiles: [] };
    }

    const blocks: Array<{ fullMatch: string; source: string }> = [];
    let match: RegExpExecArray | null;
    const re = new RegExp(MERMAID_BLOCK_RE.source, MERMAID_BLOCK_RE.flags);
    while ((match = re.exec(markdown)) !== null) {
        blocks.push({ fullMatch: match[0], source: match[1] });
    }

    if (blocks.length === 0) {
        return { markdown, svgFiles: [] };
    }

    const svgFiles: DiagramFile[] = [];
    let result = markdown;

    for (let i = 0; i < blocks.length; i++) {
        const { fullMatch, source } = blocks[i];
        const suffix = blocks.length > 1 ? `-${i + 1}` : '';
        const svgFilename = `${baseName}-diagram${suffix}.svg`;

        const svg = await renderErdSvg(source, theme);
        if (!svg) continue;

        svgFiles.push({ filename: svgFilename, content: svg });

        const imgRef = `![diagram](./${svgFilename})`;

        if (format === 'svg') {
            result = result.replace(fullMatch, imgRef);
        } else {
            const replacement = [
                imgRef,
                '',
                '<details>',
                '<summary>Mermaid source</summary>',
                '',
                fullMatch,
                '',
                '</details>',
            ].join('\n');
            result = result.replace(fullMatch, replacement);
        }
    }

    return { markdown: result, svgFiles };
}
