import {copyFile,mkdir,cp} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
await mkdir(new URL('public/pdf-assets/',root),{recursive:true});
await copyFile(new URL('node_modules/pdfjs-dist/build/pdf.worker.min.mjs',root),new URL('public/pdf.worker.min.mjs',root));
for(const dir of ['cmaps','standard_fonts','wasm'])await cp(fileURLToPath(new URL(`node_modules/pdfjs-dist/${dir}`,root)),fileURLToPath(new URL(`public/pdf-assets/${dir}`,root)),{recursive:true});
