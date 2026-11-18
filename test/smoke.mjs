/**
 * 冒烟测试：不联网、不装插件，只验证纯逻辑与产物格式。
 * 跑法：node test/smoke.mjs
 */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import assert from 'node:assert/strict'

process.env.DSH_HOME = mkdtempSync(join(tmpdir(), 'persona-lab-'))

const { normalizeZone, zoneDefaults, allocateQuota, inScheduleWindow } = await import('../lib/config.js')
const { allocateQuota: allocate } = await import('../lib/learn/plan.js')
const { admitSample, stripPii, isNoise, hardBlocked } = await import('../lib/learn/filter.js')
const { makeIr, renderText, renderFields, renderChatSystem } = await import('../lib/ir.js')
const { buildCard, toCardJson, toCardPng } = await import('../lib/export/card.js')
const { encode } = await import('../lib/qr.js')
const { makeQrPng } = await import('../lib/export/png.js')
const { createZone, listZones, loadZone, saveZone, deleteZone, appendIsolation } = await import('../lib/zone.js')
const { dataDir } = await import('../lib/paths.js')

let passed = 0
function test(name, fn) {
  try {
    fn()
    passed += 1
    console.log(`  ok  ${name}`)
  } catch (error) {
    console.error(`  FAIL ${name}`)
    console.error(error)
    process.exitCode = 1
  }
}

console.log('config')
test('默认区带过滤，新建区不筛', () => {
  const a = normalizeZone({}, 0).value
  const b = normalizeZone({}, 1).value
  assert.equal(a.kind, 'default')
  assert.ok(a.filters.minPlay > 0)
  assert.equal(b.kind, 'custom')
  assert.equal(b.filters.minPlay, 0)
  assert.equal(b.focus.traits.length, 0)
  assert.ok(!('keywords' in b))
})

test('旧关键词会并进学习重点', () => {
  const zone = normalizeZone({ keywords: ['dsh', 'DeepSeek'], focus: { traits: ['短句'] } }).value
  assert.deepEqual(zone.focus.traits, ['短句', 'dsh', 'DeepSeek'])
  assert.ok(!('keywords' in zone))
})

test('参考人设存在 focus 里并去空白', () => {
  const zone = normalizeZone({ focus: { reference: '  傲娇但心软  ' } }).value
  assert.equal(zone.focus.reference, '傲娇但心软')
  const empty = normalizeZone({}).value
  assert.equal(empty.focus.reference, '')
})

test('比例全 0 时退回默认', () => {
  const zone = normalizeZone({ quota: { ratio: { dm: 0, reply: 0, comment: 0, danmaku: 0, rcmd: 0 } } }).value
  assert.ok(Object.values(zone.quota.ratio).some((n) => n > 0))
})

test('时间窗判定', () => {
  const schedule = { enabled: true, start: '02:00', end: '04:00' }
  assert.equal(inScheduleWindow(schedule, new Date('2026-11-04T03:00:00')), true)
  assert.equal(inScheduleWindow(schedule, new Date('2026-11-04T05:00:00')), false)
})

console.log('quota')
test('按比例分给评论 / 视频内容 / 弹幕', () => {
  const zone = normalizeZone({
    quota: { total: 1000, ratio: { comment: 60, video: 40, danmaku: 0 } },
    sources: { comment: true, video: true, danmaku: false },
  }, 1).value
  const q = allocate(zone)
  assert.equal(q.comment, 600)
  assert.equal(q.video, 400)
  assert.equal(q.danmaku, 0)
  assert.equal(q.dm, undefined)
  assert.equal(q.reply, undefined)
  assert.ok(!('dmUids' in zone))
})

test('关掉视频内容后只分评论', () => {
  const zone = normalizeZone({
    quota: { total: 1000, ratio: { comment: 70, video: 30, danmaku: 0 } },
    sources: { comment: true, video: false, danmaku: false },
  }, 1).value
  const q = allocate(zone)
  assert.equal(q.comment, 1000)
  assert.equal(q.video, 0)
})

test('推荐流只是内容来源开关', () => {
  const on = normalizeZone({ content: { recommend: true } }).value
  const off = normalizeZone({ content: { recommend: false } }).value
  assert.equal(on.content.recommend, true)
  assert.equal(off.content.recommend, false)
})

console.log('filter')
test('硬词表拦广告', () => {
  assert.equal(hardBlocked('加微信看片').blocked, true)
  assert.equal(hardBlocked('今天天气不错').blocked, false)
})
test('隔离文本命中', () => {
  assert.equal(hardBlocked('这句话里有奇怪词', ['奇怪词']).blocked, true)
})
test('PII 剥离', () => {
  const out = stripPii('加我 13812345678，QQ 12345678，BV1xx411c7mD')
  assert.ok(!out.includes('13812345678'))
  assert.ok(!out.includes('BV1xx411c7mD'))
  assert.ok(out.includes('[手机号]'))
})
test('噪声判定', () => {
  assert.equal(isNoise('哈哈哈哈'), true)
  assert.equal(isNoise('666'), true)
  assert.equal(isNoise('还行吧'), false)
})
test('样本入闸', () => {
  const ok = admitSample('我觉得这个视频剪得挺舒服的', [])
  assert.equal(ok.ok, true)
  const bad = admitSample('[表情包]', [])
  assert.equal(bad.ok, false)
})

console.log('ir')
const distilled = {
  chat: { summary: '短句，爱反问', rhythm: '句子短，常常半句', tone: '懒，不解释', habits: ['啧', '行吧'], avoid: ['不列清单'] },
  comment: { summary: '语气平，不站队', rhythm: '中长句', tone: '克制', habits: [], avoid: [] },
  danmaku: { summary: '', rhythm: '', tone: '', habits: [], avoid: [] },
  media: { summary: '', rhythm: '', tone: '', usage: '', habits: [], avoid: [] },
  fields: {
    identity: '一个懒得解释的人', tone: '低气压', rhythm: '短',
    vocabulary: '少用感叹号', quirks: ['先说结论'], boundaries: ['不说教'],
  },
}
const ir = makeIr({ zoneId: 'zone-1', samples: [{ source: 'dm' }, { source: 'comment' }], model: 'x', distilled })
test('纯文本包含三段与字段', () => {
  const text = renderText(ir)
  assert.ok(text.includes('私聊'))
  assert.ok(text.includes('公开评论'))
  assert.ok(text.includes('身份'))
})
test('人物画像会渲染，并进聊天提示', () => {
  const withProfile = makeIr({
    zoneId: 'zone-1',
    samples: [{ source: 'video' }],
    model: 'x',
    distilled: {
      ...distilled,
      profile: {
        summary: '嘴硬心软', traits: ['被求就答应，嘴上先嫌麻烦'], likes: ['安静的午后'],
        dislikes: ['被催'], reactions: ['先皱眉再动手'], boundaries: ['不背后说人'],
      },
    },
  })
  const text = renderText(withProfile)
  assert.ok(text.includes('人物'))
  assert.ok(text.includes('嘴硬心软'))
  assert.ok(text.includes('性格：'))
  const system = renderChatSystem(withProfile)
  assert.ok(system.includes('你是谁：嘴硬心软'))
})
test('表情与表达块会渲染 usage', () => {
  const withMedia = makeIr({
    zoneId: 'zone-1',
    samples: [{ source: 'dm' }, { source: 'media' }],
    model: 'x',
    distilled: {
      ...distilled,
      media: { summary: '用表情代替说话', rhythm: '', tone: '', usage: '高兴发猫，懒得回发它', habits: ['猫图'], avoid: ['连发三张'] },
    },
  })
  const text = renderText(withMedia)
  assert.ok(text.includes('表情与表达'))
  assert.ok(text.includes('用法：高兴发猫'))
})
test('多模态三层开关', () => {
  const on = normalizeZone({}).value
  const off = normalizeZone({ media: { recognize: false, learn: false, use: false } }).value
  assert.equal(on.media.recognize, true)
  assert.equal(off.media.learn, false)
})
test('人设要求签名：相同才合并历史', async () => {
  const { focusSignature } = await import('../lib/run.js')
  const a = focusSignature({ primary: 'chat', traits: ['短句', '冷幽默'], avoid: [] })
  const b = focusSignature({ primary: 'chat', traits: ['冷幽默', '短句'], avoid: [] })
  const c = focusSignature({ primary: 'chat', traits: ['长句'], avoid: [] })
  assert.equal(a, b)
  assert.notEqual(a, c)
})
test('字段表结构', () => {
  const fields = renderFields(ir)
  assert.equal(fields.identity, '一个懒得解释的人')
  assert.deepEqual(fields.quirks, ['先说结论'])
})
test('聊天系统提示', () => {
  const system = renderChatSystem(ir)
  assert.ok(system.includes('你就是这个人'))
  assert.ok(system.includes('不解释自己'))
  assert.ok(!system.includes('你在扮演'))
})
test('examples 只留短句、非技术、不违规', async () => {
  const { pickExamples } = await import('../lib/learn/distill.js')
  const out = pickExamples([
    '别信免费群，进去了就是收费的',
    '插件市场不是有吗？直接安装，记得开github的加速器',
    '删帖了好像被传话了',
    '这是一句特别特别长的技术说明，里面有很多很多关于配置和部署的细节，肯定超过三十六个字了',
    '从提示词软破到破甲链再到绕闸机生成黄文',
  ])
  assert.ok(out.includes('别信免费群，进去了就是收费的'))
  assert.ok(!out.some((text) => text.includes('安装')))
  assert.ok(!out.some((text) => text.includes('破甲')))
  assert.ok(!out.some((text) => text.length > 36))
})

console.log('export')
test('SillyTavern JSON', () => {
  const card = buildCard(ir, { name: '测试' })
  assert.equal(card.spec, 'chara_card_v2')
  assert.equal(card.data.name, '测试')
  assert.ok(typeof card.data.description === 'string')
})
test('SillyTavern PNG 有 chara 块', () => {
  const png = toCardPng(ir, { name: '测试' })
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
  assert.ok(png.includes(Buffer.from('chara', 'latin1')), '没有 chara tEXt 块')
})

console.log('qr')
test('二维码能编码 B站 登录链接', () => {
  const url = 'https://passport.bilibili.com/h5-app/passport/login/scan?navhide=1&qrcode_key=' + 'a'.repeat(32) + '&from=web'
  const matrix = encode(url)
  assert.ok(matrix.size >= 21)
  const png = makeQrPng(matrix)
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a')
})

console.log('zone')
test('建区 / 读区 / 删区', () => {
  const root = dataDir()
  const zone = createZone(root, { name: '测试区' })
  assert.ok(listZones(root).some((item) => item.id === zone.id))
  const loaded = loadZone(root, zone.id)
  assert.equal(loaded.name, '测试区')
  zone.enabled = false
  saveZone(root, zone)
  assert.equal(loadZone(root, zone.id).enabled, false)
  appendIsolation(root, zone.id, ['不要学这个'])
  assert.ok(deleteZone(root, zone.id))
  assert.equal(loadZone(root, zone.id), null)
})

console.log('')
console.log(passed > 0 ? `通过 ${passed} 项` : '没有通过的项')
rmSync(process.env.DSH_HOME, { recursive: true, force: true })
