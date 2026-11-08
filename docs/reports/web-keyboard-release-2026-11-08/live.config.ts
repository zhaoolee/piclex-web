import {defineConfig} from '@playwright/test';
import base from './playwright.config';
const label=process.env.PICLEX_LIVE_LABEL||'live';
export default defineConfig({...base,webServer:undefined,testMatch:'learning-keyboard-shortcuts.spec.ts',outputDir:`/evidence/${label}-results`,reporter:[['line'],['json',{outputFile:`/evidence/${label}-report.json`}]],projects:base.projects!.map(p=>({...p,testMatch:'learning-keyboard-shortcuts.spec.ts',use:{...p.use,channel:undefined}})),use:{...base.use,baseURL:process.env.PICLEX_LIVE_URL}});
