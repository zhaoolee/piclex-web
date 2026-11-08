import {defineConfig} from '@playwright/test';
import base from './playwright.config';
export default defineConfig({...base,outputDir:'/evidence/test-results',reporter:[['line'],['json',{outputFile:'/evidence/browser-report.json'}]],projects:base.projects!.map(p=>({...p,use:{...p.use,channel:undefined}})),webServer:{...base.webServer as object,reuseExistingServer:false}});
