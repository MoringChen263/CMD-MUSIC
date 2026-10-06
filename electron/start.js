'use strict';
/*
 * start.js — 跨平台启动包装
 * ------------------------------------------------------------
 * 问题：当前运行环境注入了 ELECTRON_RUN_AS_NODE=1，会让 electron 二进制退化成
 * 普通 Node.js 运行，不注入内部 `electron` 模块，于是主进程里
 * `require('electron')` 退回到 npm shim、返回 exe 路径字符串，
 * `app`/`BrowserWindow` 全为 undefined，main.js 一行 `app.on(...)` 直接崩。
 * 修复：拉起 electron 之前先从环境里彻底删掉这个变量（等价于 `env -u`）。
 * 这样 `npm start` 在受影响的 shell / Windows cmd 下也能直接跑起来。
 */
delete process.env.ELECTRON_RUN_AS_NODE;

const { spawn } = require('child_process');

// npm 的 electron 包 index.js 导出的就是 electron 可执行文件的完整路径，
// 用它在“普通 node”上下文里拿路径最稳，无需硬编码。
const electronPath = require('electron');

const child = spawn(electronPath, ['.'], {
  stdio: 'inherit',
  env: process.env,
  windowsHide: false,
});

child.on('close', (code, signal) => {
  if (code === null) {
    console.error(`electron exited with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code);
});
child.on('error', (err) => {
  console.error('failed to start electron:', err && err.message || err);
  process.exit(1);
});
