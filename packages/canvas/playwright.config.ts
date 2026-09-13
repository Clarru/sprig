import { defineConfig } from '@playwright/test';
import { fileURLToPath } from 'node:url';
process.env.CANVAS_STANDALONE_EXPORT='1';
export default defineConfig({testDir:'./tests/browser',timeout:60000,workers:1,use:{baseURL:'http://127.0.0.1:5191',channel:'chrome',headless:true,viewport:{width:1440,height:1000},reducedMotion:'reduce'},webServer:{command:'npm run dev',cwd:fileURLToPath(new URL('../../',import.meta.url)),url:'http://127.0.0.1:5191',reuseExistingServer:true}});
