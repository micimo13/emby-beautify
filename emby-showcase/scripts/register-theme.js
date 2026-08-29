// 注册 Vanvy Noir 主题到 Emby skinmanager.js
// 用法: node register-theme.js <skinmanager路径>
const fs = require('fs');
const path = process.argv[2];
if (!path) { console.error('用法: node register-theme.js <path>'); process.exit(1); }

let s = fs.readFileSync(path, 'utf8');
if (s.includes('vanvy_noir')) { console.log('✅ 已注册过, 跳过'); process.exit(0); }

// 在 Dark 主题条目前插入 Vanvy Noir 条目 (格式对齐 AllThemes 数组)
const anchor = '{name:"Dark"';
const idx = s.indexOf(anchor);
if (idx === -1) { console.error('❌ 未找到 Dark 主题锚点'); process.exit(1); }

const insert = '{name:"Vanvy Noir",id:"vanvy_noir",controller:DefaultController,infoPath:"modules/themes/vanvy_noir/theme.json",stylesheets:[{path:"modules/themes/vanvy_noir/theme.css",options:{cssvars:true}},{path:"modules/themes/dark/theme_nontv.css",options:{cssvars:true,tv:false}},{path:"modules/themes/dark/theme_tv.css",options:{cssvars:true,tv:true}}]},';

s = s.slice(0, idx) + insert + s.slice(idx);
fs.writeFileSync(path, s);
console.log('✅ Vanvy Noir 已注册');
