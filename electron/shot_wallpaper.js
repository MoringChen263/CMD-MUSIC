/* ============================================================
   shot_wallpaper.js — 渲染层真实截图（用于肉眼确认配色与整屏效果）
   用法：npx electron shot_wallpaper.js
   产出：artifacts/wallpaper_classic.png / wallpaper_green.png
   ============================================================ */
'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');

const ART = path.join(__dirname, '..', 'artifacts');
if (!fs.existsSync(ART)) fs.mkdirSync(ART, { recursive: true });

app.disableHardwareAcceleration();

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1280, height: 760, show: false,
    // 关键：窗口 show:false 时 Chromium 不合成图层，capturePage() 会抓到陈旧帧
    // （表现为截图仍是切换前的旧界面）。paintWhenInitiallyHidden 强制其离屏也绘制。
    paintWhenInitiallyHidden: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false,
    },
  });
  await win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  await new Promise(r => setTimeout(r, 1200));

  // 塞两首歌进去，让歌单有内容（截图才看得出层次）
  const mockRet = await win.webContents.executeJavaScript(`
    (() => {
      try {
        const P = window.__probe;
        if (!P) return 'ERR: window.__probe 不存在';
        P.setMode('wallpaper');
        return 'OK mode=' + P.mode;
      } catch (e) { return 'ERR ' + e.message; }
    })()`);
  console.log('MOCK_STEP1:', mockRet);
  await new Promise(r => setTimeout(r, 500));

  const mockRet2 = await win.webContents.executeJavaScript(`
    (() => {
      try {
        const mock = [
          { name: 'M500000FEjzZ2STu0Y.mp3', dur: '03:41' },
          { name: '夜曲 - 周杰伦.mp3', dur: '03:56' },
          { name: 'Hotel California - Eagles.mp3', dur: '04:12' },
        ];
        const list = document.getElementById('plList');
        list.innerHTML = mock.map((t, i) =>
          '<div class="row' + (i === 0 ? ' cur' : '') + '"><span class="idx">' + (i + 1) +
          '</span><span class="name">' + t.name + '</span><span class="dur">' + t.dur + '</span></div>'
        ).join('');
        document.getElementById('npTitle').textContent = 'M500000FEjzZ2STu0Y.mp3';
        document.getElementById('npSub').textContent = '本地文件 · FLAC 44.1k/16b';
        document.getElementById('npState').textContent = 'PLAYING';
        document.getElementById('npDot').classList.add('on');
        document.getElementById('plMeta').textContent = '[ 3 tracks ]';
        document.getElementById('tTot').textContent = '03:41';
        // 冻结渲染循环对时间/频谱的覆盖：直接停掉 rAF 由 drawIdle* 继续，改为手动画一次后立刻截图
        return 'OK rows=' + list.children.length +
               ' stageClass=' + document.getElementById('stage').className +
               ' vw=' + window.innerWidth + 'x' + window.innerHeight +
               ' stageW=' + Math.round(document.getElementById('stage').getBoundingClientRect().width);
      } catch (e) { return 'ERR ' + e.message; }
    })()`);
  console.log('MOCK_STEP2:', mockRet2);
  await new Promise(r => setTimeout(r, 400));

  // classic 主题
  await new Promise(r => setTimeout(r, 400));
  const domNow = await win.webContents.executeJavaScript(
    `(() => ({ cls: document.getElementById('stage').className,
               rows: document.getElementById('plList').children.length,
               titlebar: getComputedStyle(document.getElementById('titlebar')).display,
               np: document.getElementById('npTitle').textContent }))()`);
  console.log('DOM_BEFORE_SHOT:', JSON.stringify(domNow));
  const img1 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ART, 'wallpaper_classic.png'), img1.toPNG());
  console.log('SHOT1 size=' + JSON.stringify(img1.getSize()) +
              ' nonEmpty=' + (img1.toPNG().length > 20000));

  // green 主题（验证暗底派生色）
  await win.webContents.executeJavaScript(
    `document.querySelector('.presets button[data-preset="green"]').click();`);
  await new Promise(r => setTimeout(r, 500));
  const img2 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ART, 'wallpaper_green.png'), img2.toPNG());

  // 窗口态对照
  await win.webContents.executeJavaScript(`window.__probe.setMode('window')`);
  await new Promise(r => setTimeout(r, 600));
  const img3 = await win.webContents.capturePage();
  fs.writeFileSync(path.join(ART, 'window_classic.png'), img3.toPNG());

  console.log('SHOTS_OK');
  app.exit(0);
});

setTimeout(() => { console.error('SHOT TIMEOUT'); app.exit(2); }, 40000);
