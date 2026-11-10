import { defineConfig } from 'vite';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
const bootMazePath=fileURLToPath(new URL('apps/public/src/boot-maze.svg', import.meta.url));
const bootMazeStylePath=fileURLToPath(new URL('apps/public/src/boot-maze.css', import.meta.url));
// Inline the one shared pixel maze and its scoped styles so the first paint
// needs no extra request.
function inlineBootMaze(){const marker='<!--boot-maze-->';return {name:'inline-boot-maze',transformIndexHtml:{order:'pre' as const,handler(html:string){
 if(!html.includes(marker))return html;
 const maze=readFileSync(bootMazePath,'utf8').trim(),styles=readFileSync(bootMazeStylePath,'utf8').trim();
 return html.replace(marker,()=>`<style>${styles}</style>${maze}`);
}}};}
// Emit the exact built module sizes so cold-start progress measures downloaded
// bytes. Hashed URLs share the browser cache with the subsequent module import.
function gameBootManifest(){return {name:'game-boot-manifest',enforce:'post' as const,generateBundle(_options:any,bundle:any){
 const entry=Object.values(bundle).find((item:any)=>item.type==='chunk'&&item.facadeModuleId?.endsWith('/packages/laboratory/src/main.mjs')) as any;
 const html=bundle['lab/index.html'];if(!entry||!html)throw Error('Missing game boot entry');
 const assets=new Map<string,number>();
 const collect=(chunk:any)=>{if(assets.has(chunk.fileName))return;assets.set(chunk.fileName,Buffer.byteLength(chunk.code));for(const name of chunk.imports){const child=bundle[name];if(child?.type==='chunk')collect(child);}};collect(entry);
 const manifest=[...assets].map(([name,bytes])=>({url:'/piclex-web/'+name,bytes}));
 html.source=String(html.source).replace('</head>',`<script>window.PICLEX_LAB_BOOT_ASSETS=${JSON.stringify(manifest)}</script></head>`);
}};}
// Let the inline first-paint loader render while the app stylesheet downloads.
// The loader stays in place until React has committed and this sheet is ready.
function earlyAppStyle(){return {name:'early-app-style',enforce:'post' as const,generateBundle(_options:any,bundle:any){
 const html=bundle['index.html'];if(!html)throw Error('Missing main HTML entry');
 const source=String(html.source),link=/<link rel="stylesheet" crossorigin href="([^"]+\.css)">/;
 if(!link.test(source))throw Error('Missing main app stylesheet');
 html.source=source.replace(link,'<link rel="stylesheet" data-app-style media="print" crossorigin href="$1" onload="this.media=\'all\'">');
}};}
export default defineConfig({ plugins:[inlineBootMaze(),gameBootManifest(),earlyAppStyle()], root: 'apps/public', base: '/piclex-web/', build: { outDir: '../../dist', emptyOutDir: true, target: 'es2022', rollupOptions: { input: { subscribe: fileURLToPath(new URL('apps/public/subscribe/index.html', import.meta.url)), main: fileURLToPath(new URL('apps/public/index.html', import.meta.url)), lab: fileURLToPath(new URL('apps/public/lab/index.html', import.meta.url)) } } }, server: { fs: { allow: [fileURLToPath(new URL('.', import.meta.url))] } } });
