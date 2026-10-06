/* ============================================================
   audioprobe.js — 直接读音频文件头，拿到真实的编码 / 采样率 / 位深 / 声道

   为什么不用 ffprobe：
     1. ffprobe 不是 Windows 自带组件，多数用户机器上根本没有；
        为了显示 4 个字段去拉一个外部进程 + 解析它的 JSON，代价和收益完全不成比例。
     2. 这里要读的参数全都明文躺在文件头的前几个 KB 里（RIFF fmt / MPEG 帧头 /
        FLAC STREAMINFO / Ogg 识别包 / MP4 stsd），自己读反而更快（纯内存操作，
        亚毫秒级）、零进程开销、零外部依赖。
     3. 项目是零依赖 Electron 应用，为此引入一个二进制工具链不划算。

   设计约束（很重要，别改坏）：
     · 只读文件头。绝不把整个音频读进内存 —— 播放器同时还要喂 WebAudio，
       一个 30MB 的 FLAC 被 readFileSync 进内存是不可接受的。
       实际读取量：首次 64KB，之后只在需要的位置补读几字节到几十 KB。
     · 解析不出来就是 null，绝不用 44100 / 16 / 2 这种"看起来很合理"的默认值填坑。
       面板上显示 null 就是"--"，这是诚实的；显示假数据是误导。
       （MP3 本身没有位深概念，bitDepth 必须是 null，不是 16。）
     · 纯 Node 内置模块（只有 fs），不引入任何第三方依赖。
     · 任何异常都在 probeAudio 里兜住，返回 { ok:false, error } 而不抛出 ——
       UI 会持续调用它，一个坏文件不能让渲染进程崩掉。
   ============================================================ */
'use strict';

const fs = require('fs');

// 首次读取的文件头长度。ID3v2 标签可能很大，那部分靠"跳过"处理而不是读进来。
// WAV 的 fmt/data chunk 几乎总在前几 KB；这里给一个够用又不浪费的上限
const WAV_READ = 8 * 1024;
// 扫描同步字节时最多往后看的距离（找不到帧头就放弃，避免在奇怪文件上空转）
const SCAN_LIMIT = 64 * 1024;

/* ------------------------------------------------------------
   底层读取：所有偏移都是"文件绝对偏移"，越界自动截短。

   带一个单块窗口缓存：box 头探测（16 字节）会反复落在同一段区域，
   缓存住这一段就能把 pread 次数从"每 box 一次"降到"每区域一次"。
   MP4 的 moov 可能在文件尾部，但每个 box 的探测都紧邻自己的头，
   所以单块窗口已经足够，不需要更复杂的多块缓存。
   ------------------------------------------------------------ */
function makeCtx(fd, fileSize) {
  return {
    fd,
    size: fileSize,
    bytesRead: 0, // 累计真正从磁盘读出的字节数（报告 / 自检用）
    boxCache: new Map(), // MP4 box 列表缓存，避免反复重扫同一段
    win: null, // { start, buf } 当前窗口
    read(pos, len) {
      if (!(len > 0) || !(pos >= 0) || pos >= fileSize) return Buffer.alloc(0);
      const w = this.win;
      // 命中窗口：起点在窗口内且所需数据完整包含
      if (w && pos >= w.start && pos + len <= w.start + w.buf.length) {
        return w.buf.subarray(pos - w.start, pos - w.start + len);
      }
      // 窗口够大就直接切出来；否则重新读一块（顺带把相邻区域带进来）
      const winLen = Math.min(Math.max(len, 512), fileSize - pos);
      const buf = Buffer.allocUnsafe(winLen);
      const got = fs.readSync(fd, buf, 0, winLen, pos);
      this.bytesRead += got;
      this.win = { start: pos, buf: buf.subarray(0, got) };
      if (len <= got) return this.win.buf.subarray(0, len);
      // 请求超出本次窗口（少见），退回精确读一次
      const buf2 = Buffer.allocUnsafe(len);
      const got2 = fs.readSync(fd, buf2, 0, len, pos);
      this.bytesRead += got2;
      return buf2.subarray(0, got2);
    },
  };
}

function fail(error) {
  return { ok: false, error };
}

function okBase(ctx, codec, container) {
  return {
    ok: true,
    codec: codec || null,
    container: container || null,
    sampleRate: null,
    bitDepth: null,
    channels: null,
    bitrateKbps: null,
    bytesRead: ctx.bytesRead,
  };
}

/* ------------------------------------------------------------
   WAV / RIFF —— 作为对照基准，字段最规整
   结构：'RIFF' <size:4> 'WAVE' 然后一串 chunk：
     <id:4> <size:4> <data...>   （size 为奇数时补 1 字节对齐）
   fmt chunk 数据区（相对 chunk data 起点）：
     +0  u16 audioFormat   1=PCM  3=IEEE float  0xFFFE=extensible
     +2  u16 channels
     +4  u32 sampleRate
     +8  u32 byteRate
     +12 u16 blockAlign
     +14 u16 bitsPerSample
   extensible 时再往后：
     +16 u16 cbSize  +18 u16 validBitsPerSample  +20 u32 channelMask
     +24 SubFormat GUID（头 2 字节就是真正的 format tag，little-endian）
   ------------------------------------------------------------ */
const WAV_CODEC = {
  0x0001: 'PCM',
  0x0002: 'ADPCM',
  0x0003: 'IEEE Float',
  0x0006: 'A-law',
  0x0007: 'mu-law',
  0x0011: 'IMA ADPCM',
  0x0022: 'TrueSpeech',
  0x0031: 'GSM 6.10',
  0x0050: 'MPEG Layer-2',
  0x0055: 'MPEG Layer-3',
  0xFFFE: 'PCM',
};

function parseWav(ctx, head) {
  // fmt / data 可能被 LIST 等大 chunk 往后推。绝大多数 WAV 的 fmt 在前 1KB 内，
  // 读 8KB 足够；真遇到超大的 JUNK/LIST chunk，循环会自然停在已读范围内并给出明确错误。
  if (head.length < Math.min(WAV_READ, ctx.size)) head = ctx.read(0, Math.min(WAV_READ, ctx.size));
  const limit = head.length;
  let fmt = null;
  let dataSize = null;

  // fmt 不保证紧跟 'WAVE'（可能先有 LIST/INFO 等 chunk），必须逐块走
  let pos = 12;
  while (pos + 8 <= limit) {
    const id = head.subarray(pos, pos + 4).toString('latin1');
    const size = head.readUInt32LE(pos + 4);
    const body = pos + 8;

    if (id === 'fmt ') {
      if (body + 16 > limit) return fail('WAV: fmt 块被截断，读到的文件头不完整');
      const f = {
        audioFormat: head.readUInt16LE(body),
        channels: head.readUInt16LE(body + 2),
        sampleRate: head.readUInt32LE(body + 4),
        byteRate: head.readUInt32LE(body + 8),
        bitsPerSample: head.readUInt16LE(body + 14),
        validBits: 0,
      };
      if (f.audioFormat === 0xfffe) {
        // WAVE_FORMAT_EXTENSIBLE：真实格式藏在 SubFormat GUID 的头 2 字节里
        if (body + 26 > limit) return fail('WAV: extensible fmt 块被截断');
        const cbSize = head.readUInt16LE(body + 16);
        if (cbSize >= 22 && body + 20 <= limit) f.validBits = head.readUInt16LE(body + 18);
        f.audioFormat = head.readUInt16LE(body + 24);
      }
      fmt = f;
    } else if (id === 'data') {
      dataSize = size;
      break;
    }

    pos = body + size + (size & 1); // chunk 数据按偶数字节对齐，奇数长度补 1 字节
  }

  if (!fmt) return fail('WAV: 未找到 fmt 块');
  if (fmt.sampleRate === 0) return fail('WAV: fmt 块里的采样率为 0，文件可能已损坏');

  const r = okBase(ctx, WAV_CODEC[fmt.audioFormat] || null, 'RIFF/WAVE');
  r.sampleRate = fmt.sampleRate;
  r.channels = fmt.channels > 0 ? fmt.channels : null;
  // 位深：优先用 extensible 的 validBits（那是真实有效位深），否则用容器声明值
  const bits = fmt.validBits > 0 && fmt.validBits <= fmt.bitsPerSample ? fmt.validBits : fmt.bitsPerSample;
  r.bitDepth = bits > 0 ? bits : null;
  r.bitrateKbps = fmt.byteRate > 0 ? Math.round((fmt.byteRate * 8) / 1000) : null;
  r.durationSec = dataSize && fmt.byteRate ? +(dataSize / fmt.byteRate).toFixed(3) : null;
  return r;
}

/* ------------------------------------------------------------
   MP3 / MPEG-1 Audio —— ID3v2 之后是连续的帧，每帧头 4 字节
   帧头（4 字节）：
     byte0 = 0xFF
     byte1 = 111 VVV LL P   V=版本(11=MPEG1,10=MPEG2,00=MPEG2.5) LL=层(01=Layer3)
     byte2 = BBBB SS Pd Pr  B=比特率索引 S=采样率索引 P=填充 Pr=保留
     byte3 = MM C Co Orif   M=模式(11=单声道,10=双声道,00=立体声,01=联合立体声)
   比特率/采样率必须查表，不能算 —— 表由 MPEG 标准固定，不同版本表不同。
   ------------------------------------------------------------ */
// 每张表第 0 项 = free（未知），第 15 项 = bad（非法）
const MP3_BITRATE = {
  // MPEG-1：单位 kbps
  L1: [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0],
  L2: [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0],
  L3: [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0],
  // MPEG-2 / MPEG-2.5：Layer1 和 Layer2/3 各一张
  V2L1: [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0],
  V2L23: [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0],
};
const MP3_SAMPLE_RATE = {
  3: [44100, 48000, 32000], // MPEG-1
  2: [22050, 24000, 16000], // MPEG-2
  0: [11025, 12000, 8000], // MPEG-2.5
};

// ID3v2 长度是 synchsafe：4 字节，每字节只用低 7 位
function synchsafe(b, off) {
  return ((b[off] & 0x7f) << 21) | ((b[off + 1] & 0x7f) << 14) | ((b[off + 2] & 0x7f) << 7) | (b[off + 3] & 0x7f);
}

// 解析 4 字节帧头，非法返回 null
function parseMp3Frame(b, off) {
  if (off + 4 > b.length) return null;
  if (b[off] !== 0xff || (b[off + 1] & 0xe0) !== 0xe0) return null;

  const version = (b[off + 1] >> 3) & 0x03; // 3=MPEG1 2=MPEG2 0=MPEG2.5 1=保留(非法)
  const layerBits = (b[off + 1] >> 1) & 0x03; // 3=L1 2=L2 1=L3 0=保留(非法)
  if (version === 1 || layerBits === 0) return null;

  const layer = 4 - layerBits; // 1/2/3
  const bitrateIdx = (b[off + 2] >> 4) & 0x0f;
  const rateIdx = (b[off + 2] >> 2) & 0x03;
  if (bitrateIdx === 0 || bitrateIdx === 15 || rateIdx === 3) return null; // free / bad / 保留

  const rateTable = MP3_SAMPLE_RATE[version];
  if (!rateTable) return null;
  const sampleRate = rateTable[rateIdx];
  if (!sampleRate) return null;

  let table;
  if (version === 3) table = MP3_BITRATE['L' + layer];
  else table = layer === 1 ? MP3_BITRATE.V2L1 : MP3_BITRATE.V2L23;
  const bitrate = table[bitrateIdx];
  if (!bitrate) return null;

  const padding = (b[off + 2] >> 1) & 0x01;
  const mode = (b[off + 3] >> 6) & 0x03;
  // 00=立体声 01=联合立体声 10=双声道 11=单声道
  const channels = mode === 3 ? 1 : 2;

  // 帧长（字节）：Layer1 用 12*4 算法，其余用 144（MPEG1）/ 72（MPEG2、2.5）
  let frameLen;
  if (layer === 1) frameLen = (Math.floor((12 * bitrate * 1000) / sampleRate) + padding) * 4;
  else frameLen = Math.floor(((version === 3 ? 144 : 72) * bitrate * 1000) / sampleRate) + padding;

  return { version, layer, sampleRate, bitrate, channels, mode, frameLen };
}

function parseMp3(ctx, head) {
  let pos = 0;

  // 跳过 ID3v2：'ID3' + 版本2字节 + 标志1字节 + synchsafe 长度4字节 [+ 10字节 footer]
  if (head.length >= 10 && head.subarray(0, 3).toString('latin1') === 'ID3') {
    const footer = (head[5] & 0x10) !== 0;
    const tagSize = synchsafe(head, 6);
    pos = 10 + tagSize + (footer ? 10 : 0);
    if (pos >= ctx.size) return fail('MP3: ID3 标签长度超出文件末尾，文件可能被截断');
    // 引导块可能整个被 ID3 吃掉了，帧头要往后读
    if (pos >= head.length) head = ctx.read(pos, Math.min(SCAN_LIMIT, ctx.size - pos));
  }

  // 帧头搜索窗口：ID3 之后重新读（ID3 可能把 64KB 吃光了）
  const win = ctx.read(pos, Math.min(SCAN_LIMIT, ctx.size - pos));
  if (win.length < 4) return fail('MP3: 跳过 ID3 后没有可读的音频数据');

  let found = null;
  let confirmed = false;
  for (let i = 0; i + 4 <= win.length; i++) {
    if (win[i] !== 0xff || (win[i + 1] & 0xe0) !== 0xe0) continue;
    const f = parseMp3Frame(win, i);
    if (!f) continue;
    found = { f, at: i };
    // 用"下一帧也有合法帧头"来确认，避免把音频数据里碰巧的 0xFF Ex 当成帧头
    const next = parseMp3Frame(win, i + f.frameLen);
    if (next && next.sampleRate === f.sampleRate && next.layer === f.layer) {
      confirmed = true;
      break;
    }
  }
  if (!found) return fail('MP3: 未找到合法的 MPEG 帧头');

  const { f } = found;
  const vName = f.version === 3 ? 'MPEG-1' : f.version === 2 ? 'MPEG-2' : 'MPEG-2.5';
  const codec = f.layer === 3 ? 'MP3' : f.layer === 2 ? 'MP2' : 'MP1';

  const r = okBase(ctx, codec, vName + ' Layer ' + f.layer);
  r.sampleRate = f.sampleRate;
  r.channels = f.channels;
  r.bitrateKbps = f.bitrate;
  // MP3 是有损压缩格式，文件里根本不存在"位深"这个概念 —— 只能是 null
  r.bitDepth = null;
  r.frameSyncConfirmed = confirmed;
  return r;
}

/* ------------------------------------------------------------
   FLAC —— 'fLaC' 之后是元数据块，第 0 号块固定是 STREAMINFO
   块头 4 字节：bit7=是否最后一块，bit0-6=类型；随后 3 字节长度（大端 24 位）
   STREAMINFO（共 34 字节）位布局 —— 必须按位偏移读，不能按字节：
     +0  u16 minBlockSize      +2  u16 maxBlockSize
     +4  24  minFrameSize      +7  24  maxFrameSize
     +10 64 位打包字段：
           20 bits sampleRate | 3 bits (channels-1) | 5 bits (bitsPerSample-1) | 36 bits totalSamples
     +18 128 位 MD5
   用 BigInt 取这 64 位再移位，避免 36+20 位超出 JS 安全整数范围。
   ------------------------------------------------------------ */
function parseFlac(ctx) {
  let pos = 4;
  let info = null;

  for (let i = 0; i < 128; i++) {
    const h = ctx.read(pos, 4);
    if (h.length < 4) return fail('FLAC: 元数据块头被截断');
    const isLast = (h[0] & 0x80) !== 0;
    const type = h[0] & 0x7f;
    const size = (h[1] << 16) | (h[2] << 8) | h[3]; // 24 位大端

    if (type === 0) {
      if (size < 18) return fail('FLAC: STREAMINFO 块长度异常（' + size + '）');
      const b = ctx.read(pos + 4, Math.min(size, 34));
      if (b.length < 18) return fail('FLAC: STREAMINFO 被截断');
      const packed = b.readBigUInt64BE(10); // 从 +10 起 8 字节的打包字段
      const sampleRate = Number(packed >> 44n); // 高 20 位
      const channels = Number((packed >> 41n) & 0x07n) + 1; // 接着 3 位，存的是 channels-1
      const bpsField = Number((packed >> 36n) & 0x1fn); // 接着 5 位，存的是 bitsPerSample-1
      const totalSamples = Number(packed & 0xfffffffffn); // 低 36 位
      info = { sampleRate, channels, bitDepth: bpsField === 0 ? null : bpsField + 1, totalSamples };
      break;
    }
    pos += 4 + size;
    if (isLast) return fail('FLAC: 元数据块里没有 STREAMINFO');
  }

  if (!info) return fail('FLAC: 未找到 STREAMINFO 元数据块');
  if (info.sampleRate === 0) return fail('FLAC: STREAMINFO 里的采样率为 0，文件可能已损坏');

  const r = okBase(ctx, 'FLAC', 'FLAC');
  r.sampleRate = info.sampleRate;
  r.channels = info.channels > 0 ? info.channels : null;
  r.bitDepth = info.bitDepth; // 编码器写 0 表示"未知"，保持 null
  // 比特率：FLAC 头里不存，由总采样数算时长再用文件大小反推（是真实推导，不是默认值）。
  // 反推出来 <1kbps 说明这是个只有头没有音频数据的残缺文件，此时给 null 而不是 0。
  if (info.totalSamples > 0) {
    const dur = info.totalSamples / info.sampleRate;
    const kbps = dur > 0 ? (ctx.size * 8) / dur / 1000 : 0;
    if (kbps >= 1) r.bitrateKbps = Math.round(kbps);
  }
  r.durationSec = info.totalSamples > 0 ? +(info.totalSamples / info.sampleRate).toFixed(3) : null;
  return r;
}

/* ------------------------------------------------------------
   Ogg —— 分页结构，每页：'OggS' <1版本> <1头类型> <8 granule> <4 serial> <4 seq>
          <4 crc> <1 分段数> <分段表 n 字节> <载荷>
   载荷长度 = 分段表所有字节之和（分段表第 i 项 = 第 i 段的字节数）。
   音频参数都在识别包（第一个包）里：
     Vorbis: 0x01 'vorbis' | u32 版本 | u8 声道 | u32 采样率(LE) |
             i32 bitrate_max | i32 bitrate_nominal | i32 bitrate_min | ...
             → 声道在包内偏移 11，采样率在偏移 12（4 字节小端）
     Opus:   'OpusHead' | u8 版本 | u8 声道 | u16 预跳过 | u32 原始采样率(LE) | ...
             → 声道在偏移 9，原始采样率在偏移 12（4 字节小端）
   注意 Opus 解码输出恒为 48000Hz，偏移 12 是编码时的原始输入采样率（可能为 0）。
   ------------------------------------------------------------ */
const VORBIS_MAGIC = Buffer.from([0x01, 0x76, 0x6f, 0x72, 0x62, 0x69, 0x73]); // \x01vorbis
const OPUS_MAGIC = Buffer.from('OpusHead', 'latin1');

function parseOgg(ctx) {
  let pos = 0;

  // 识别包总是很短，只取每页载荷前 1KB 足够；页数上限防 pathological 文件
  for (let page = 0; page < 32 && pos < ctx.size; page++) {
    const h = ctx.read(pos, 27);
    if (h.length < 27 || h.subarray(0, 4).toString('latin1') !== 'OggS') {
      return fail(page === 0 ? 'Ogg: 缺少 OggS 魔数，不是有效的 Ogg 文件' : 'Ogg: 第 ' + (page + 1) + ' 页缺少 OggS 魔数');
    }
    const segCount = h[26];
    const segTable = ctx.read(pos + 27, segCount);
    if (segTable.length < segCount) return fail('Ogg: 分段表被截断');

    let payload = 0;
    for (let i = 0; i < segCount; i++) payload += segTable[i];
    const body = ctx.read(pos + 27 + segCount, Math.min(payload, 1024));

    // Vorbis 识别包：需要前 30 字节（声道 + 采样率 + nominal 码率）
    const vi = body.indexOf(VORBIS_MAGIC);
    if (vi >= 0 && vi + 30 <= body.length) {
      const channels = body[vi + 11];
      const sampleRate = body.readUInt32LE(vi + 12);
      const nominal = body.readInt32LE(vi + 20); // 声明码率，-1 = 未知
      if (sampleRate === 0) return fail('Ogg/Vorbis: 识别包里的采样率为 0，文件可能已损坏');
      const r = okBase(ctx, 'Vorbis', 'Ogg');
      r.sampleRate = sampleRate;
      r.channels = channels > 0 ? channels : null;
      r.bitDepth = null; // Vorbis 是有损格式，文件里没有位深字段
      r.bitrateKbps = nominal > 0 ? Math.round(nominal / 1000) : null;
      return r;
    }

    // Opus 识别包：需要前 19 字节
    const oi = body.indexOf(OPUS_MAGIC);
    if (oi >= 0 && oi + 19 <= body.length) {
      const channels = body[oi + 9];
      const inputRate = body.readUInt32LE(oi + 12);
      const r = okBase(ctx, 'Opus', 'Ogg');
      // Opus 解码输出恒为 48000Hz；这里优先报原始输入采样率，为 0 时按 spec 记 48000
      r.sampleRate = inputRate > 0 ? inputRate : 48000;
      r.channels = channels > 0 ? channels : null;
      r.bitDepth = null; // Opus 内部定点 16bit，但那是实现细节不是文件里的字段
      r.bitrateKbps = null; // Opus 是可变码率，识别包不声明码率
      return r;
    }

    pos += 27 + segCount + payload;
  }
  return fail('Ogg: 在前 32 页里没有找到 Vorbis/Opus 识别包');
}

/* ------------------------------------------------------------
   MP4 / M4A —— box 树
   box 头：u32 size（大端）+ 4 字节 type；
     size == 1 → 后面跟 8 字节 largesize；size == 0 → 一直到文件末尾。
   路径：moov > trak > mdia > minf > stbl > stsd > (mp4a|alac|...)
   stsd 是 FullBox：u32 version/flags + u32 entryCount，然后是采样描述。
   采样描述（音频）头：u32 size + 4 字节 format + 6 字节 reserved + u16 dataRefIndex
     + 2 版本 | +2 修订 | +4 厂商 | +2 声道 | +2 采样大小(位深) | +2 压缩ID
     + 2 包大小 | +4 采样率（16.16 定点，高 16 位才是整数 Hz）
   mp4a 的真实编码在子 box 'esds' 里（对象类型 0x40=AAC，0x6B=MPEG-1 Audio…）。
   注意 moov 可能在文件尾部（没做 faststart 的 M4A 就是 mdat 在前），
   所以 box 头是"按需 pread"读的，不会为了找 moov 把整个文件读进来。
   ------------------------------------------------------------ */
const MP4_AUDIO_CODEC = {
  mp4a: 'AAC',
  alac: 'ALAC',
  'ac-3': 'AC-3',
  'ec-3': 'E-AC-3',
  samr: 'AMR',
  sawb: 'AMR-WB',
  '.mp3': 'MP3',
  mp3s: 'MP3',
  sowt: 'PCM',
  twos: 'PCM',
  lpcm: 'PCM',
  in24: 'PCM',
  in32: 'PCM',
  fl32: 'IEEE Float',
  fl64: 'IEEE Float',
  Opus: 'Opus',
};

function listBoxes(ctx, start, end) {
  const ck = start + ':' + end;
  const cached = ctx.boxCache.get(ck);
  if (cached) return cached;

  const out = [];
  let pos = start;
  let guard = 0;
  while (pos + 8 <= end && guard++ < 512) {
    const h = ctx.read(pos, 16);
    if (h.length < 8) break;
    const type = h.subarray(4, 8).toString('latin1');
    let size = h.readUInt32BE(0);
    let body = pos + 8;
    if (size === 1) {
      if (h.length < 16) break;
      const big = h.readBigUInt64BE(8);
      if (big > BigInt(Number.MAX_SAFE_INTEGER)) break;
      size = Number(big);
      body = pos + 16;
    } else if (size === 0) {
      size = end - pos; // 延伸到父 box 末尾
    }
    if (size < body - pos) break; // 非法尺寸，停止避免死循环
    const boxEnd = Math.min(pos + size, end);
    out.push({ type, start: pos, body, end: boxEnd });
    if (boxEnd <= pos) break;
    pos = boxEnd;
  }
  ctx.boxCache.set(ck, out);
  return out;
}

function findChild(ctx, box, type) {
  const kids = listBoxes(ctx, box.body, box.end);
  return kids.find((b) => b.type === type) || null;
}

// 沿路径下钻，如 ['trak','mdia','minf','stbl','stsd']
function descend(ctx, box, path) {
  let cur = box;
  for (const t of path) {
    cur = findChild(ctx, cur, t);
    if (!cur) return null;
  }
  return cur;
}

function findBox(ctx, start, end, type) {
  return listBoxes(ctx, start, end).find((b) => b.type === type) || null;
}

// 读 MPEG-4 描述符长度（7 位一组，最长 4 字节）
function readDescLen(b, p) {
  let len = 0;
  for (let i = 0; i < 4; i++) {
    if (p + i >= b.length) return null;
    const x = b[p + i];
    len = (len << 7) | (x & 0x7f);
    if (!(x & 0x80)) return { len, next: p + i + 1 };
  }
  return null;
}

// 解析 esds：返回对象类型 / 平均码率 / AudioSpecificConfig
function parseEsds(ctx, box) {
  const b = ctx.read(box.body, Math.min(box.end - box.body, 1024));
  if (b.length < 5) return null;
  let p = 4; // version + flags
  if (b[p] !== 0x03) return null; // 期望 ES_Descriptor
  const l1 = readDescLen(b, p + 1);
  if (!l1) return null;
  p = l1.next + 2; // ES_ID(2)
  if (p >= b.length) return null;
  const flags = b[p];
  p += 1;
  if (flags & 0x80) p += 2 + (b[p] || 0); // dependsOn_ES_ID
  if (flags & 0x40) p += 2; // OCR_ES_Id
  if (flags & 0x20) p += 2 + (b[p] || 0); // URL
  if (p >= b.length || b[p] !== 0x04) return null; // 期望 DecoderConfigDescriptor
  const l2 = readDescLen(b, p + 1);
  if (!l2) return null;
  const oti = b[l2.next] || null;
  // DecoderConfigDescriptor: +0 对象类型 +1 流类型 +2..4 缓冲 +5..8 最大码率 +9..12 平均码率
  const avgBitrate = l2.next + 13 <= b.length ? b.readUInt32BE(l2.next + 9) : 0;

  // AudioSpecificConfig（AAC）：5 bits 对象类型 | 4 bits 采样率索引 | 4 bits 声道配置
  let asc = null;
  let q = l2.next + 13;
  if (q < b.length && b[q] === 0x05) {
    const l3 = readDescLen(b, q + 1);
    if (l3 && l3.len >= 2) asc = b.subarray(l3.next, Math.min(l3.next + l3.len, b.length));
  }
  return { oti, avgBitrate, asc };
}

const AAC_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
const MP4_OTI = { 0x40: 'AAC', 0x66: 'MPEG-2 AAC', 0x67: 'MPEG-2 AAC', 0x69: 'MP2', 0x6b: 'MP3' };

// 解析 ALAC 的 'alac' cookie（比特率/位深/声道都在里面）
function parseAlacCookie(ctx, box) {
  const b = ctx.read(box.body, Math.min(box.end - box.body, 64));
  // version/flags(4) frameLength(4) compatibleVersion(1) bitDepth(1) pb mb kb(4)
  // numChannels(1) maxRun(2) maxFrameBytes(4) avgBitRate(4) sampleRate(4)
  if (b.length < 28) return null;
  return {
    bitDepth: b[9] > 0 ? b[9] : null,
    channels: b[13] > 0 ? b[13] : null,
    bitrateKbps: b.readUInt32BE(20) > 0 ? Math.round(b.readUInt32BE(20) / 1000) : null,
    sampleRate: b.readUInt32BE(24),
  };
}

function parseMp4(ctx) {
  const tops = listBoxes(ctx, 0, ctx.size);
  const ftyp = tops.find((b) => b.type === 'ftyp');
  const moov = tops.find((b) => b.type === 'moov') || (ftyp ? null : null);
  if (!moov) return fail('M4A/MP4: 未找到 moov box（文件可能被截断，或不是 MP4 容器）');

  // moov > trak（取第一个装了音频的 trak）> mdia > minf > stbl > stsd
  const traks = listBoxes(ctx, moov.body, moov.end).filter((b) => b.type === 'trak');
  let stsd = null;
  for (const trak of traks) {
    const cand = descend(ctx, trak, ['mdia', 'minf', 'stbl', 'stsd']);
    if (cand) {
      stsd = cand;
      break;
    }
  }
  if (!stsd) return fail('M4A/MP4: moov 里没有音频轨（stsd），可能只有视频轨');

  // stsd: version/flags(4) + entryCount(4)，然后是采样描述
  const sh = ctx.read(stsd.body, 8);
  if (sh.length < 8) return fail('M4A/MP4: stsd 头被截断');
  const entryCount = sh.readUInt32BE(4);

  let picked = null;
  let pos = stsd.body + 8;
  for (let i = 0; i < Math.min(entryCount, 16); i++) {
    const eh = ctx.read(pos, 8);
    if (eh.length < 8) break;
    const size = eh.readUInt32BE(0);
    const format = eh.subarray(4, 8).toString('latin1');
    const entryEnd = size >= 8 ? Math.min(pos + size, stsd.end) : stsd.end;
    // AudioSampleEntry body 精确布局（ISO/IEC 14496-12 §12.2.3）：
    //   +0  u8[6] reserved   +6  u16 dataRefIndex
    //   +8  u16 version      +10 u16 revision    +12 u32 vendor
    //   +16 u16 channels     +18 u16 sampleSize(位深)
    //   +20 u16 compressionID +22 u16 packetSize  +24 u32 sampleRate(16.16 定点)
    // 这些偏移相对"box 头之后的 body 起点"（即 pos+8），别搞混。
    const a = ctx.read(pos + 8, 28);
    if (a.length >= 28) {
      picked = {
        format,
        start: pos,
        body: pos + 8,
        end: entryEnd,
        channels: a.readUInt16BE(16),
        sampleSize: a.readUInt16BE(18),
        sampleRate: a.readUInt32BE(24) >>> 16, // 16.16 定点 → 取高 16 位才是整数 Hz
      };
      break;
    }
    if (size < 8) break;
    pos += size;
  }
  if (!picked) return fail('M4A/MP4: stsd 里没有可解析的音频采样描述');

  const entry = { type: picked.format, start: picked.start, body: picked.body, end: picked.end };
  let codec = MP4_AUDIO_CODEC[picked.format] || null;
  let bitDepth = picked.sampleSize > 0 ? picked.sampleSize : null;
  let bitrate = null;

  // 子 box 起点：AudioSampleEntry 公共部分 28 字节；版本 1 多 16 字节，版本 2 再多 36 字节
  for (const skip of [28, 44, 80]) {
    const childStart = picked.body + skip;
    if (childStart >= picked.end) break;
    const kids = listBoxes(ctx, childStart, picked.end);
    const esds = kids.find((b) => b.type === 'esds');
    if (esds) {
      const info = parseEsds(ctx, esds);
      if (info) {
        if (info.oti && MP4_OTI[info.oti]) codec = MP4_OTI[info.oti];
        // esds 里的 maxBitrate/avgBitrate 单位是 bit/s，除 1000 即 kbps（不要再乘 8）
        if (info.avgBitrate > 0) bitrate = Math.round(info.avgBitrate / 1000);
        // AAC 的真实采样率/声道在 AudioSpecificConfig 里，比外层更可靠。
        // 位布局：5 bits objType | 4 bits freqIdx | 4 bits channelConfig
        // freqIdx 跨字节（byte0 低 3 位 + byte1 最高 1 位），必须按位拼，不能当整字节读
        if (info.asc && info.asc.length >= 2 && codec === 'AAC') {
          const freqIdx = ((info.asc[0] & 0x07) << 1) | (info.asc[1] >> 7);
          const chCfg = (info.asc[1] >> 3) & 0x0f;
          if (freqIdx < AAC_RATES.length) picked.sampleRate = AAC_RATES[freqIdx];
          if (chCfg > 0 && chCfg <= 7) picked.channels = chCfg;
        }
      }
      break;
    }
    const alacBox = kids.find((b) => b.type === 'alac');
    if (alacBox) {
      const c = parseAlacCookie(ctx, alacBox);
      if (c) {
        if (c.bitDepth) bitDepth = c.bitDepth;
        if (c.channels) picked.channels = c.channels;
        if (c.sampleRate > 0) picked.sampleRate = c.sampleRate;
        if (c.bitrateKbps) bitrate = c.bitrateKbps;
      }
      break;
    }
  }

  if (!picked.sampleRate) return fail('M4A/MP4: 采样率为 0，文件可能已损坏');

  const r = okBase(ctx, codec, 'MP4/ISO-BMFF');
  r.sampleRate = picked.sampleRate;
  r.channels = picked.channels > 0 ? picked.channels : null;
  r.bitDepth = bitDepth;
  r.bitrateKbps = bitrate;
  // 码率缺失时用 mvhd 时长 × 文件大小推导（真实计算，不是默认值）
  if (r.bitrateKbps === null) {
    const mvhd = findChild(ctx, moov, 'mvhd');
    if (mvhd) {
      const m = ctx.read(mvhd.body, 32);
      if (m.length >= 20) {
        const version = m[0];
        const timescale = version === 1 ? m.readUInt32BE(20) : m.readUInt32BE(12);
        const duration = version === 1 ? Number(m.readBigUInt64BE(24)) : m.readUInt32BE(16);
        if (timescale > 0 && duration > 0) {
          const dur = duration / timescale;
          r.bitrateKbps = Math.round((ctx.size * 8) / dur / 1000);
          r.durationSec = +dur.toFixed(3);
        }
      }
    }
  }
  return r;
}

/* ------------------------------------------------------------
   入口
   ------------------------------------------------------------ */
function probeAudio(filePath) {
  let fd = null;
  try {
    if (typeof filePath !== 'string' || filePath.trim() === '') return fail('无效的文件路径');

    let st;
    try {
      st = fs.statSync(filePath);
    } catch (e) {
      if (e && e.code === 'ENOENT') return fail('文件不存在');
      if (e && e.code === 'EACCES') return fail('没有权限读取该文件');
      return fail('无法访问文件：' + (e && e.message ? e.message : String(e)));
    }
    if (st.isDirectory()) return fail('这是一个目录，不是音频文件');
    if (st.size === 0) return fail('文件为空（0 字节）');

    fd = fs.openSync(filePath, 'r');
    const ctx = makeCtx(fd, st.size);
    // 引导读：分派只需要魔数字节，2KB 足够判断格式；各解析器再按需补读
    const head = ctx.read(0, Math.min(4096, st.size));
    if (head.length < 12) return fail('文件太小（' + st.size + ' 字节），不像是音频文件');

    // ---- 魔数分派：只认明确的头，不靠扩展名猜格式 ----
    // 注意：一律用 subarray().toString() 取固定长度，避免手写偏移算错
    const magic = (off, len) => head.subarray(off, off + len).toString('latin1');
    const magic4 = magic(0, 4);

    if (magic4 === 'RIFF' && magic(8, 4) === 'WAVE') return parseWav(ctx, head);
    if (magic4 === 'RIFX') return fail('RIFX（大端序 WAV）暂不支持解析');
    if (magic4 === 'fLaC') return parseFlac(ctx);
    if (magic4 === 'OggS') return parseOgg(ctx);
    if (magic(0, 3) === 'ID3' || (head[0] === 0xff && (head[1] & 0xe0) === 0xe0)) return parseMp3(ctx, head);
    if (magic(4, 4) === 'ftyp' || magic4 === 'moov' || magic4 === 'mdat' || magic4 === 'free') {
      return parseMp4(ctx);
    }

    // 明确认得出、但本模块不支持的容器：给出具体原因，而不是笼统的"未知格式"
    if (magic4 === 'FORM') return fail('AIFF 容器暂不支持解析');
    if (magic4 === 'MAC ') return fail('APE / Monkey\'s Audio 暂不支持解析');
    if (head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3) {
      return fail('Matroska / WebM 容器暂不支持解析');
    }
    if (magic4 === 'wvpk') return fail('WavPack 暂不支持解析');
    if (magic4 === 'ADIF') return fail('ADIF 暂不支持解析');

    return fail('未识别的音频格式（既不是 WAV/MP3/FLAC/Ogg/MP4，文件头也不匹配）');
  } catch (err) {
    // 兜底：UI 会持续调用，绝不能因为一个畸形文件抛异常
    return fail('解析失败：' + (err && err.message ? err.message : String(err)));
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch (_) {
        /* ignore */
      }
    }
  }
}

module.exports = { probeAudio };
