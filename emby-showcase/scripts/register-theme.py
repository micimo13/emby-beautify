#!/usr/bin/env python3
"""注册 Vanvy Noir 主题到 Emby skinmanager.js
用法: python3 register-theme.py <skinmanager路径>"""
import sys, re

path = sys.argv[1]
with open(path, 'r', encoding='utf-8') as f:
    s = f.read()

if 'vanvy_noir' in s:
    print('OK: 已注册过, 跳过')
    sys.exit(0)

anchor = '{name:"Dark"'
idx = s.find(anchor)
if idx == -1:
    print('ERR: 未找到 Dark 主题锚点')
    sys.exit(1)

insert = ('{name:"Vanvy Noir",id:"vanvy_noir",controller:DefaultController,'
          'infoPath:"modules/themes/vanvy_noir/theme.json",'
          'stylesheets:[{path:"modules/themes/vanvy_noir/theme.css",options:{cssvars:true}},'
          '{path:"modules/themes/dark/theme_nontv.css",options:{cssvars:true,tv:false}},'
          '{path:"modules/themes/dark/theme_tv.css",options:{cssvars:true,tv:true}}]},')

s = s[:idx] + insert + s[idx:]
with open(path, 'w', encoding='utf-8') as f:
    f.write(s)
print('OK: Vanvy Noir 已注册')
