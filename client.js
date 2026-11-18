/**
 * dsh-persona-lab —— 浏览器半边（设置页）。
 *
 * 一页到底：同意 → 账号 → 学习区 → 参数 → 历史 → 人设词 → 测试 → 插件。
 * 不自己造标题栏按钮，走 settings.section（跟别的插件同一个位置）。
 */
window.__ModuleLoader__.load({
  id: 'dsh-persona-lab',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const API = '/persona-lab/api'

    const CSS = `
.pl-root{display:flex;flex-direction:column;gap:14px;padding:4px 2px 40px;color:var(--dsw-alias-label-primary);
  font-size:13px;line-height:1.55;max-width:980px}
.pl-tabs{display:flex;gap:6px;flex-wrap:wrap;border-bottom:1px solid var(--dsw-alias-border-l1);padding-bottom:8px}
.pl-tab{border:1px solid transparent;background:transparent;color:var(--dsw-alias-label-secondary);
  border-radius:8px;padding:6px 12px;font-size:12.5px;cursor:pointer}
.pl-tab:hover{background:var(--dsw-alias-bg-layer-2);color:var(--dsw-alias-label-primary)}
.pl-tab[data-on="1"]{background:var(--dsw-alias-bg-layer-2);border-color:var(--dsw-alias-border-l2);
  color:var(--dsw-alias-label-primary);font-weight:600}
.pl-card{background:var(--dsw-alias-bg-layer-1);border:1px solid var(--dsw-alias-border-l1);
  border-radius:12px;padding:14px 16px}
.pl-card h3{margin:0 0 8px;font-size:13.5px;font-weight:650}
.pl-muted{color:var(--dsw-alias-label-secondary);font-size:12px}
.pl-row{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.pl-field{display:flex;flex-direction:column;gap:4px;margin-bottom:10px}
.pl-field label{font-size:12px;color:var(--dsw-alias-label-secondary)}
.pl-input,.pl-textarea,.pl-select{background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);
  color:var(--dsw-alias-label-primary);border-radius:8px;padding:7px 9px;font-size:12.5px;font-family:inherit;width:100%;box-sizing:border-box}
.pl-textarea{min-height:70px;resize:vertical}
.pl-btn{border:1px solid var(--dsw-alias-border-l2);background:var(--dsw-alias-bg-layer-2);
  color:var(--dsw-alias-label-primary);border-radius:8px;padding:6px 12px;font-size:12.5px;cursor:pointer}
.pl-btn:hover{border-color:var(--dsw-alias-brand-primary,#3B6FE0)}
.pl-btn[disabled]{opacity:.5;cursor:default}
.pl-btn.primary{background:#3B6FE0;border-color:#3B6FE0;color:#fff;font-weight:600}
.pl-btn.danger{color:var(--dsw-alias-state-error-primary);border-color:var(--dsw-alias-state-error-primary)}
.pl-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--dsw-alias-border-l1);
  background:var(--dsw-alias-bg-layer-2);border-radius:999px;padding:4px 10px;font-size:12px}
.pl-chip[data-on="1"]{border-color:var(--dsw-alias-brand-primary,#3B6FE0);color:var(--dsw-alias-brand-primary,#3B6FE0)}
.pl-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}
.pl-pill{display:flex;gap:8px;flex-wrap:wrap}
.pl-zone{border:1px solid var(--dsw-alias-border-l1);border-radius:10px;padding:10px 12px;
  background:var(--dsw-alias-bg-layer-1);cursor:pointer;min-width:150px}
.pl-zone[data-on="1"]{border-color:var(--dsw-alias-brand-primary,#3B6FE0)}
.pl-zone b{display:block;font-size:12.5px}
.pl-zone span{font-size:11.5px;color:var(--dsw-alias-label-secondary)}
.pl-log{border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:8px 10px;margin-bottom:8px;
  background:var(--dsw-alias-bg-base)}
.pl-log-head{display:flex;align-items:center;gap:8px;justify-content:space-between}
.pl-pre{white-space:pre-wrap;word-break:break-word;font-size:12px;line-height:1.6;
  background:var(--dsw-alias-bg-base);border:1px solid var(--dsw-alias-border-l1);
  border-radius:8px;padding:10px 12px;margin:8px 0 0;max-height:340px;overflow:auto}
.pl-chat{display:flex;flex-direction:column;gap:8px;max-height:380px;overflow:auto;padding:4px 0}
.pl-msg{max-width:82%;padding:7px 11px;border-radius:10px;font-size:12.5px;white-space:pre-wrap;word-break:break-word}
.pl-msg[data-role="user"]{align-self:flex-end;background:#3B6FE0;color:#fff}
.pl-msg[data-role="assistant"]{align-self:flex-start;background:var(--dsw-alias-bg-layer-2);
  border:1px solid var(--dsw-alias-border-l1)}
.pl-warn{border-left:3px solid var(--dsw-alias-state-warn-primary);padding:8px 12px;
  background:var(--dsw-alias-bg-layer-2);border-radius:0 8px 8px 0;font-size:12px}
.pl-ok{color:var(--dsw-alias-state-success-primary)}
.pl-err{color:var(--dsw-alias-state-error-primary)}
.pl-list{display:flex;flex-direction:column;gap:6px}
.pl-item{display:flex;align-items:center;gap:8px;justify-content:space-between;
  border:1px solid var(--dsw-alias-border-l1);border-radius:8px;padding:7px 10px;font-size:12px}
.pl-item-main{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-qr{width:180px;height:180px;image-rendering:pixelated;border-radius:8px;background:#fff;padding:6px}
`

    /* ---------- 小工具 ---------- */

    async function call(path, options = {}) {
      const response = await fetch(API + path, {
        method: options.method || 'GET',
        headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
        body: options.body ? JSON.stringify(options.body) : undefined,
      })
      let data = null
      try { data = await response.json() } catch { data = null }
      if (!response.ok && data === null) {
        throw new Error(`HTTP ${response.status}`)
      }
      return data ?? { ok: false, message: `HTTP ${response.status}` }
    }

    function fmtTime(value) {
      if (!value) return ''
      const date = new Date(value)
      if (Number.isNaN(date.getTime())) return String(value)
      const pad = (n) => String(n).padStart(2, '0')
      return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
    }

    const SOURCE_OPTIONS = [
      { key: 'comment', label: '视频评论' },
      { key: 'video', label: '视频内容' },
      { key: 'danmaku', label: '弹幕' },
    ]

    /* ---------- 主面板 ---------- */

    function Panel() {
      const [state, setState] = React.useState(null)
      const [tab, setTab] = React.useState('zones')
      const [busy, setBusy] = React.useState('')
      const [notice, setNotice] = React.useState('')
      const [error, setError] = React.useState('')
      const [activeZone, setActiveZone] = React.useState(null)
      const [zoneDraft, setZoneDraft] = React.useState(null)
      const [history, setHistory] = React.useState([])
      const [persona, setPersona] = React.useState(null)
      const [targets, setTargets] = React.useState(null)
      const [login, setLogin] = React.useState(null)
      const [chat, setChat] = React.useState([])
      const [chatInput, setChatInput] = React.useState('')
      const [chatSystem, setChatSystem] = React.useState('')
      const [settings, setSettings] = React.useState({
        apiKey: '', apiBaseUrl: '', apiModel: '',
        vision: { enabled: false, baseUrl: '', apiKey: '', model: '' },
        speech: { enabled: false, baseUrl: '', apiKey: '', model: '' },
      })

      const refresh = React.useCallback(async () => {
        const data = await call('/state')
        setState(data)
        if (data?.zones?.length > 0) {
          const id = activeZone?.id && data.zones.some((zone) => zone.id === activeZone.id)
            ? activeZone.id : data.zones[0].id
          const zone = data.zones.find((item) => item.id === id) || null
          setActiveZone(zone)
        }
      }, [activeZone?.id])

      React.useEffect(() => { void refresh() }, [])

      React.useEffect(() => {
        if (activeZone === null) { setZoneDraft(null); return }
        setZoneDraft(JSON.parse(JSON.stringify(activeZone)))
        void loadHistory(activeZone.id)
        void loadPersona(activeZone.id)
        setChat([])
        setChatSystem('')
      }, [activeZone?.id])

      async function loadHistory(zoneId) {
        const data = await call(`/zones/${encodeURIComponent(zoneId)}/history`)
        setHistory(Array.isArray(data?.runs) ? data.runs : [])
      }

      async function loadPersona(zoneId) {
        const data = await call(`/zones/${encodeURIComponent(zoneId)}/persona`)
        setPersona(data?.ok ? data : null)
      }

      function flash(message) { setNotice(message); setError('') }
      function fail(message) { setError(message); setNotice('') }

      async function guard(name, action) {
        setBusy(name)
        try {
          return await action()
        } catch (error) {
          // 任何异常都要看得见，不能让按钮闪一下什么都没发生
          fail(`出错了：${error?.message || error}`)
        } finally {
          setBusy('')
        }
      }

      /* ---------- 同意 ---------- */
      async function acceptConsent(accepted) {
        await guard('consent', async () => {
          const data = await call('/consent', { method: 'POST', body: { accepted } })
          if (data?.ok) { flash(accepted ? '已同意，可以开始。' : '已拒绝，功能保持关闭。'); await refresh() }
        })
      }

      /* ---------- 登录（每个学习区各自一份） ---------- */
      async function startLogin(zoneId) {
        await guard('login', async () => {
          const data = await call(`/zones/${encodeURIComponent(zoneId)}/login/start`, { method: 'POST' })
          if (!data?.ok) return fail(data?.message || '生成二维码失败')
          setLogin({ zoneId, key: data.key, url: data.url })
          pollLogin(zoneId, data.key)
        })
      }

      async function pollLogin(zoneId, key) {
        for (let i = 0; i < 60; i += 1) {
          await new Promise((resolve) => setTimeout(resolve, 2000))
          try {
            const data = await call(`/zones/${encodeURIComponent(zoneId)}/login/poll?key=${encodeURIComponent(key)}`)
            if (data?.state === 'ok') { setLogin(null); await refresh(); return flash('登录成功。') }
            if (data?.state === 'expired') { setLogin(null); return fail('二维码过期了，再点一次。') }
          } catch { /* 继续轮询 */ }
        }
      }

      async function manualLogin(zoneId, cookie) {
        await guard('manual', async () => {
          const data = await call(`/zones/${encodeURIComponent(zoneId)}/login/manual`, {
            method: 'POST', body: { cookie },
          })
          if (!data?.ok) return fail(data?.message || 'Cookie 无效')
          await refresh()
          flash(`已登录：${data.account?.name || data.account?.uid || ''}`)
        })
      }

      async function logout(zoneId) {
        await guard('logout', async () => {
          await call(`/zones/${encodeURIComponent(zoneId)}/login/logout`, { method: 'POST' })
          await refresh()
          flash('已清除这个区的登录。')
        })
      }

      async function copyAccount(zoneId) {
        await guard('copy', async () => {
          const data = await call(`/zones/${encodeURIComponent(zoneId)}/login/copy`, { method: 'POST', body: {} })
          if (!data?.ok) return fail(data?.message || '没有可复用的账号')
          await refresh()
          flash(`已沿用账号：${data.account?.name || data.account?.uid || ''}`)
        })
      }

      /* ---------- 学习区 ---------- */
      async function saveZoneDraft() {
        if (!zoneDraft) return
        await guard('save-zone', async () => {
          const payload = { ...zoneDraft }
          const data = await call(`/zones/${encodeURIComponent(zoneDraft.id)}`, { method: 'POST', body: payload })
          if (!data?.ok) return fail(data?.message || '保存失败')
          await refresh()
          flash('已保存。')
        })
      }

      async function newZone() {
        await guard('new-zone', async () => {
          const data = await call('/zones', { method: 'POST', body: { name: `学习区 ${(state?.zones?.length || 0) + 1}` } })
          if (!data?.ok) return fail(data?.message || '新建失败')
          await refresh()
          setActiveZone(data.zone)
          setTab('zones')
        })
      }

      async function removeZone(zone) {
        if (!window.confirm(`删除学习区「${zone.name}」？目录会一起删掉，不能恢复。`)) return
        await guard('del-zone', async () => {
          await call(`/zones/${encodeURIComponent(zone.id)}`, { method: 'DELETE' })
          setActiveZone(null)
          await refresh()
          flash('已删除。')
        })
      }

      /** 清空学习记录，但保留账号——换一批素材重学不用重新扫码。 */
      async function resetLearning() {
        if (!activeZone) return
        const ok = window.confirm(
          `清空「${activeZone.name}」的学习记录？\n\n`
          + '会删掉：学习历史、样本、人设词、去重记录、测试记录。\n'
          + '会保留：账号、隔离文本、参数设置。\n\n'
          + '这个操作不能撤销。',
        )
        if (!ok) return
        await guard('reset', async () => {
          const data = await call(`/zones/${encodeURIComponent(activeZone.id)}/reset-learning`, { method: 'POST' })
          if (!data?.ok) return fail(data?.message || '清空失败')
          await refresh()
          await loadHistory(activeZone.id)
          await loadPersona(activeZone.id)
          setChat([])
          flash('已清空学习记录，账号还在。')
        })
      }

      async function runNow() {
        if (!activeZone) return
        await guard('run', async () => {
          setNotice('正在学习，可能要几十秒…')
          const data = await call(`/zones/${encodeURIComponent(activeZone.id)}/run`, { method: 'POST', body: { force: true } })
          await loadHistory(activeZone.id)
          await loadPersona(activeZone.id)
          await refresh()
          if (data?.ok) {
            flash(`完成：本次 ${data.sampleCount} 条，累计 ${data.mergedCount || data.sampleCount} 条，人设词 v${data.version}。`)
          } else {
            fail(`${data?.message || '这次没跑成'}`)
          }
        })
      }

      async function removeRun(runId) {
        if (!window.confirm('删除这次学习的日志？学习内容会一起删掉，且不会写进隔离文本。')) return
        await guard('del-run', async () => {
          await call(`/zones/${encodeURIComponent(activeZone.id)}/history/${encodeURIComponent(runId)}`, { method: 'DELETE' })
          await loadHistory(activeZone.id)
          await refresh()
          flash('日志已删除。')
        })
      }

      async function removeSample(runId, sampleId) {
        if (!window.confirm('删除这一条学习内容？它会自动进隔离文本，以后不再学。')) return
        await guard('del-sample', async () => {
          const data = await call(
            `/zones/${encodeURIComponent(activeZone.id)}/samples/${encodeURIComponent(runId)}/${encodeURIComponent(sampleId)}`,
            { method: 'DELETE' },
          )
          if (!data?.ok) return fail(data?.message || '删除失败')
          await loadHistory(activeZone.id)
          await refresh()
          flash('已删除，并写进隔离文本。')
        })
      }

      async function openRun(runId) {
        await guard('open-run', async () => {
          const data = await call(`/zones/${encodeURIComponent(activeZone.id)}/history/${encodeURIComponent(runId)}/samples`)
          if (!data?.ok) return fail('读不到样本')
          setHistory((prev) => prev.map((run) => run.id === runId ? { ...run, samples: data.samples } : run))
        })
      }

      /* ---------- 人设词 ---------- */
      async function exportPersona(format) {
        if (!persona?.current) return
        const version = persona.current.version
        const url = `${API}/zones/${encodeURIComponent(activeZone.id)}/persona/${version}/export?format=${format}`
        if (format === 'text') {
          const text = await (await fetch(url)).text()
          await navigator.clipboard?.writeText(text)
          return flash('纯文本已复制。')
        }
        window.open(url, '_blank')
      }

      async function loadTargets() {
        await guard('targets', async () => {
          const data = await call('/targets')
          setTargets(data)
        })
      }

      /* ---------- 测试 ---------- */
      async function sendChat() {
        const text = chatInput.trim()
        if (text === '') return
        const messages = [...chat, { role: 'user', content: text }]
        setChat(messages)
        setChatInput('')
        await guard('chat', async () => {
          const data = await call(`/zones/${encodeURIComponent(activeZone.id)}/chat`, {
            method: 'POST',
            body: {
              messages,
              scene: 'chat',
              system: chatSystem || defaultChatSystem(persona?.current),
            },
          })
          if (!data?.ok) { fail(data?.message || '测试失败'); return }
          setChat([...messages, { role: 'assistant', content: data.reply }])
        })
      }

      async function sendFeedback(type, text) {
        await guard('feedback', async () => {
          const data = await call(`/zones/${encodeURIComponent(activeZone.id)}/feedback`, {
            method: 'POST', body: { type, text },
          })
          if (!data?.ok) return fail(data?.message || '回写失败')
          flash(data.note || '已记录。')
          await refresh()
        })
      }

      async function saveSettings() {
        await guard('settings', async () => {
          const data = await call('/config', { method: 'POST', body: settings })
          if (!data?.ok) return fail('保存失败')
          flash('已保存。')
        })
      }

      /** 学习区切换条：历史 / 人设词 / 测试共用，避免看错区。 */
      function zonePicker(list) {
        if (!Array.isArray(list) || list.length === 0) return null
        return h('div', { className: 'pl-pill', style: { marginBottom: 10 } },
          ...list.map((zone) => h('button', {
            key: zone.id,
            className: 'pl-chip',
            type: 'button',
            'data-on': activeZone?.id === zone.id ? '1' : '0',
            onClick: () => setActiveZone(zone),
          }, zone.name)),
        )
      }

      /** 默认系统提示词：与 Host 的 renderChatSystem 同构。 */
      function defaultChatSystem(ir) {
        if (!ir) return ''
        const lines = []
        lines.push('你就是这个人。你不是 AI，不是在扮演，也不是在描述一个人。', '')
        lines.push('你说话的硬规矩：')
        lines.push('- 直接接住对方这句话，说你当下想说的。')
        lines.push('- 不解释自己，不总结对方，不分析，不评价，不给建议，不列点。')
        lines.push('- 对方说过的话，不要复述一遍。你已经听见了。')
        lines.push('- 不要用「对吧」「是吧」「不是吗」这类反问凑结尾。')
        lines.push('- 想不到说什么就短一点、甚至只回一个词；不许为了凑一句话而说话。')
        lines.push('- 像真人在聊天软件里那样发：一条一句，可以连着发两三条，每条用换行隔开；不要把所有话塞成一大段。')
        lines.push('- 不写动作、不写旁白、不加括号里的心理活动。')
        lines.push('- 不说「作为一个…」「我理解你的…」「总的来说…」这类句子。')
        lines.push('- 允许半句、允许跳过、允许不接满。', '')
        const f = ir.fields || {}
        const p = ir.profile || {}
        const traits = []
        if (p.summary) traits.push(`你是谁：${p.summary}`)
        if (p.traits?.length) traits.push(`性格：${p.traits.join('；')}`)
        if (p.likes?.length) traits.push(`在意：${p.likes.join('；')}`)
        if (p.dislikes?.length) traits.push(`讨厌：${p.dislikes.join('；')}`)
        if (p.reactions?.length) traits.push(`反应：${p.reactions.join('；')}`)
        if (p.boundaries?.length) traits.push(`底线：${p.boundaries.join('；')}`)
        if (f.identity) traits.push(`身份：${f.identity}`)
        if (f.tone) traits.push(`语气：${f.tone}`)
        if (f.rhythm) traits.push(`节奏：${f.rhythm}`)
        if (f.vocabulary) traits.push(`用词：${f.vocabulary}`)
        if (f.quirks?.length) traits.push(`习惯：${f.quirks.join('；')}`)
        if (f.boundaries?.length) traits.push(`不做的：${f.boundaries.join('；')}`)
        if (traits.length > 0) {
          lines.push('你平时的样子（照着说，不要复述这些描述）：')
          lines.push(...traits, '')
        }
        if (Array.isArray(ir.examples) && ir.examples.length > 0) {
          lines.push('你说过的话（照着这个感觉说，不要复述这些句子）：')
          for (const example of ir.examples) lines.push(`- ${example}`)
          lines.push('')
        }
        const block = ir.blocks?.chat?.summary ? ir.blocks.chat
          : ir.blocks?.comment?.summary ? ir.blocks.comment
            : ir.blocks?.danmaku?.summary ? ir.blocks.danmaku : null
        if (block) {
          if (block.summary) lines.push(`整体：${block.summary}`)
          if (block.rhythm) lines.push(`节奏：${block.rhythm}`)
          if (block.tone) lines.push(`语气：${block.tone}`)
          if (block.habits?.length) lines.push(`口头禅：${block.habits.join('；')}`)
          if (block.avoid?.length) lines.push(`绝不这样说：${block.avoid.join('；')}`)
        }
        lines.push('', '现在开始。对方说什么，你就照着你的样子回什么。不要解释这条规则。')
        return lines.join('\n')
      }
      function channelFields(key, title, hint) {
        const value = settings[key] || { enabled: false, baseUrl: '', apiKey: '', model: '' }
        const set = (part) => setSettings({ ...settings, [key]: { ...value, ...part } })
        return h('div', { className: 'pl-field' },
          h('div', { className: 'pl-row' },
            h('button', {
              className: 'pl-chip', 'data-on': value.enabled ? '1' : '0', type: 'button',
              onClick: () => set({ enabled: !value.enabled }),
            }, value.enabled ? '已启用' : '关着'),
            h('span', { className: 'pl-muted' }, title),
          ),
          h('input', {
            className: 'pl-input', style: { marginTop: 6 },
            placeholder: 'Base URL，如 https://api.openai.com/v1',
            value: value.baseUrl, onChange: (event) => set({ baseUrl: event.target.value }),
          }),
          h('div', { className: 'pl-row', style: { marginTop: 6 } },
            h('input', {
              className: 'pl-input', type: 'password', placeholder: 'API Key',
              value: value.apiKey, onChange: (event) => set({ apiKey: event.target.value }),
            }),
            h('input', {
              className: 'pl-input', placeholder: '模型名',
              value: value.model, onChange: (event) => set({ model: event.target.value }),
            }),
          ),
          hint ? h('div', { className: 'pl-muted', style: { marginTop: 4 } }, hint) : null,
        )
      }

      if (state === null) {
        return h('div', { className: 'pl-root' }, h('div', { className: 'pl-muted' }, '加载中…'))
      }

      /* ---------- 未同意 ---------- */
      if (!state.consentAccepted) {
        return h('div', { className: 'pl-root' },
          h('div', { className: 'pl-card' },
            h('h3', null, '开始之前：这个插件要什么、会做什么'),
            h('div', { className: 'pl-warn', style: { marginBottom: 10 } },
              '你点了同意之后，它才会读 B站 接口、写自己的数据目录。不同意就什么都不做。'),
            h('ul', { style: { margin: '0 0 12px', paddingLeft: 18, fontSize: 12.5, lineHeight: 1.9 } },
              h('li', null, '网络：只访问 bilibili.com 的公开接口（登录、私信、评论、弹幕、推荐）。'),
              h('li', null, '本地文件：只写自己的数据目录，不碰别的插件的数据。'),
              h('li', null, '登录凭据：只存本机，权限收紧，不回显、不上传。'),
              h('li', null, '模型：默认用你在 DSH 里配置的模型；也可以自己填 API Key。'),
              h('li', null, '它不会自动改写任何插件的人设——只产出人设词，由你自己粘。'),
            ),
            h('div', { className: 'pl-warn', style: { marginBottom: 12 } },
              '风险也要说清：抓私信/评论/弹幕可能违反平台条款，账号风险由你承担；' +
              '学到的内容只用于提炼「说话方式」，具体人名与事件会被剥离。'),
            h('div', { className: 'pl-row' },
              h('button', { className: 'pl-btn primary', disabled: busy === 'consent', onClick: () => acceptConsent(true) }, '我明白，同意'),
              h('button', { className: 'pl-btn', disabled: busy === 'consent', onClick: () => acceptConsent(false) }, '不同意'),
            ),
          ),
        )
      }

      const zones = state.zones || []

      return h('div', { className: 'pl-root' },
        // 状态条
        h('div', { className: 'pl-row', style: { justifyContent: 'space-between' } },
          h('div', { className: 'pl-row' },
            h('span', { className: 'pl-chip', 'data-on': state.hasOwnApi ? '1' : '0' },
              state.hasOwnApi ? '模型：自填 API' : '模型：跟随 DSH'),
            h('span', { className: 'pl-muted' }, '账号在每个学习区里单独登录'),
          ),
        ),
        notice ? h('div', { className: 'pl-ok' }, notice) : null,
        error ? h('div', { className: 'pl-err' }, error) : null,
        state.duplicates?.length
          ? h('div', { className: 'pl-warn' },
            `同一个 B站 账号被 ${state.duplicates.length} 组学习区共用：`
            + state.duplicates.map((item) =>
              `UID ${item.uid} → ${item.zones.map((zone) => zone.name).join('、')}`).join('；')
            + '。每个区的数据、历史、人设词都是分开存的，但学到的内容会相似，测试请分开看。')
          : null,

        // tabs
        h('div', { className: 'pl-tabs' },
          ...[['zones', '学习区'], ['history', '学习历史'], ['persona', '人设词'], ['chat', '测试'], ['targets', '可写插件'], ['settings', '设置']]
            .map(([key, label]) => h('button', {
              key, className: 'pl-tab', 'data-on': tab === key ? '1' : '0', onClick: () => setTab(key),
            }, label)),
        ),

        // 学习区 tab
        tab === 'zones' ? h('div', null,
          h('div', { className: 'pl-row', style: { marginBottom: 10 } },
            h('div', { className: 'pl-pill', style: { flex: 1 } },
              ...zones.map((zone) => h('div', {
                key: zone.id, className: 'pl-zone', 'data-on': activeZone?.id === zone.id ? '1' : '0',
                onClick: () => setActiveZone(zone),
              },
                h('b', null, zone.name),
                h('span', null, `${zone.runs} 次 · 人设词 v${zone.currentVersion || '-'} · 隔离 ${zone.isolationCount}`),
                h('span', {
                  className: 'pl-muted',
                  style: { display: 'block', marginTop: 2 },
                }, zone.account
                  ? `已登录：${zone.account.name || zone.account.uid}`
                  : '未登录 · 学习前要先登录'),
              )),
            ),
            h('button', { className: 'pl-btn', disabled: busy === 'new-zone' || zones.length >= (state.limits?.maxZones || 5), onClick: newZone }, '+ 新建学习区'),
          ),
          zones.length === 0 ? h('div', { className: 'pl-muted' }, '还没有学习区。点「新建」造一个。') : null,
          activeZone && zoneDraft ? h(ZoneEditor, {
            zone: zoneDraft, setZone: setZoneDraft, busy, save: saveZoneDraft, run: runNow,
            remove: () => removeZone(activeZone), defaults: activeZone.kind === 'default',
            reset: resetLearning,
            dirty: isDirty(zoneDraft, activeZone),
            account: activeZone.account,
            login: login && login.zoneId === activeZone.id ? login : null,
            onLoginStart: () => startLogin(activeZone.id),
            onManualLogin: (cookie) => manualLogin(activeZone.id, cookie),
            onLogout: () => logout(activeZone.id),
            onCopy: () => copyAccount(activeZone.id),
          }) : null,
        ) : null,

        // 历史 tab
        tab === 'history' ? h('div', { className: 'pl-card' },
          h('h3', null, `学习历史 · ${activeZone?.name || ''}`),
          zonePicker(zones),
          h('div', { className: 'pl-muted', style: { marginBottom: 10 } },
            '按天分组。删「日志」= 这次的学习内容一起删，不留痕；删「一条」= 只删那条，自动写进隔离文本。'),
          history.length === 0 ? h('div', { className: 'pl-muted' }, '还没有记录。') : null,
          ...groupByDay(history).map(([day, runs]) => h('div', { key: day, style: { marginBottom: 14 } },
            h('div', { className: 'pl-muted', style: { marginBottom: 6 } }, day),
            ...runs.map((run) => h('div', { key: run.id, className: 'pl-log' },
              h('div', { className: 'pl-log-head' },
                h('div', { className: 'pl-row', style: { gap: 8 } },
                  h('b', null, `${fmtTime(run.startedAt)}`),
                  h('span', { className: 'pl-muted' }, `${run.sampleCount} 条 · ${Math.round((run.elapsedMs || 0) / 1000)}s`),
                  run.version ? h('span', { className: 'pl-ok' }, `v${run.version}`) : null,
                  run.errors?.length ? h('span', { className: 'pl-err' }, `${run.errors.length} 个错误`) : null,
                ),
                h('div', { className: 'pl-row' },
                  h('button', { className: 'pl-btn', onClick: () => openRun(run.id) }, '看内容'),
                  h('button', { className: 'pl-btn danger', onClick: () => removeRun(run.id) }, '删日志'),
                ),
              ),
              run.errors?.length ? h('div', { className: 'pl-muted', style: { marginTop: 6 } },
                run.errors.slice(0, 3).map((item, index) => h('div', { key: index }, `· ${item.source}：${item.message}`)),
              ) : null,
              run.samples ? h('div', { style: { marginTop: 6 } },
                ...run.samples.slice(0, 40).map((sample) => h('div', { key: sample.id, className: 'pl-item' },
                  h('div', { className: 'pl-item-main', title: sample.text },
                    `[${sample.sourceLabel || sample.source}] ${sample.text}`),
                  h('button', { className: 'pl-btn danger', onClick: () => removeSample(run.id, sample.id) }, '删'),
                )),
              ) : null,
            )),
          )),
        ) : null,

        // 人设词 tab
        tab === 'persona' ? h('div', { className: 'pl-card' },
          h('h3', null, `人设词 · ${activeZone?.name || ''}`),
          zonePicker(zones),
          !persona?.current ? h('div', { className: 'pl-muted' }, '还没有产出。先去「学习区」跑一次。') : h('div', null,
            h('div', { className: 'pl-row', style: { marginBottom: 10 } },
              h('span', { className: 'pl-chip', 'data-on': '1' }, `v${persona.current.version}`),
              h('span', { className: 'pl-muted' }, `${persona.current.meta?.sampleCount || 0} 条样本`),
              h('button', { className: 'pl-btn', onClick: () => exportPersona('text') }, '复制纯文本'),
              h('button', { className: 'pl-btn', onClick: () => exportPersona('json') }, '下载 JSON'),
              h('button', { className: 'pl-btn', onClick: () => exportPersona('png') }, '下载卡 PNG'),
            ),
            h('pre', { className: 'pl-pre' }, personaText(persona.current)),
            h('div', { className: 'pl-muted', style: { marginTop: 8 } },
              `版本历史：${(persona.versions || []).map((item) => `v${item.version}`).join(' · ')}`),
          ),
        ) : null,

        // 测试 tab
        tab === 'chat' ? h('div', { className: 'pl-card' },
          h('h3', null, `测试区 · ${activeZone?.name || ''}`),
          zonePicker(zones),
          h('div', { className: 'pl-muted', style: { marginBottom: 8 } },
            '拿当前人设词在这里演一段。不进正式记忆、不改任何插件。'),
          h('div', { className: 'pl-field' },
            h('div', { className: 'pl-row', style: { justifyContent: 'space-between' } },
              h('label', null, '系统提示词（可改，改完只影响这次测试）'),
              h('button', {
                className: 'pl-btn', type: 'button',
                onClick: () => setChatSystem(defaultChatSystem(persona?.current)),
              }, '恢复默认'),
            ),
            h('textarea', {
              className: 'pl-textarea', style: { minHeight: 120 },
              value: chatSystem || defaultChatSystem(persona?.current),
              onChange: (event) => setChatSystem(event.target.value),
            }),
          ),
          h('div', { className: 'pl-chat' },
            ...chat.flatMap((message, index) => splitBubbles(message, index)),
          ),
          h('div', { className: 'pl-row', style: { marginTop: 10 } },
            h('input', {
              className: 'pl-input', style: { flex: 1 }, value: chatInput,
              placeholder: '说一句，看她怎么接…',
              onChange: (event) => setChatInput(event.target.value),
              onKeyDown: (event) => { if (event.key === 'Enter') void sendChat() },
            }),
            h('button', { className: 'pl-btn primary', disabled: busy === 'chat', onClick: sendChat }, '发送'),
          ),
          h('div', { className: 'pl-row', style: { marginTop: 8 } },
            h('button', { className: 'pl-btn', onClick: () => sendFeedback('correction', '这段不像：太完整了，应该更短') }, '记一条修正建议'),
            h('button', { className: 'pl-btn', onClick: () => sendFeedback('preference', '多学这种短句接话') }, '记一条偏好'),
          ),
        ) : null,

        // 插件 tab
        tab === 'targets' ? h('div', { className: 'pl-card' },
          h('h3', null, '哪些插件能接人设词'),
          h('div', { className: 'pl-muted', style: { marginBottom: 10 } },
            '只读扫描，不写入。标「A」的可以手动粘；标「B」的人格只能自己长，粘进去会跟它的设计打架。'),
          h('button', { className: 'pl-btn', onClick: loadTargets, disabled: busy === 'targets' }, '扫描'),
          targets ? h('div', { className: 'pl-list', style: { marginTop: 10 } },
            ...(targets.installed || []).map((item) => h('div', { key: item.moduleName + item.entryId, className: 'pl-item' },
              h('div', { className: 'pl-item-main' },
                `${item.kind === 'A' ? '✅' : item.kind === 'B' ? '⚠️' : '·'} ${item.title || item.moduleName}`),
              h('span', { className: 'pl-muted', style: { flex: 'none' } },
                item.kind === 'missing' ? '未安装' : (item.known?.where || String(item.kind))),
            )),
            ...(targets.notes || []).map((note, index) => h('div', { key: index, className: 'pl-muted' }, note)),
          ) : null,
        ) : null,

        // 设置 tab
        tab === 'settings' ? h('div', null,
          h('div', { className: 'pl-card' },
            h('h3', null, '模型（提炼人设词用）'),
            h('div', { className: 'pl-field' },
              h('label', null, 'API Key（留空则用 DSH 当前模型）'),
              h('input', { className: 'pl-input', type: 'password', value: settings.apiKey,
                onChange: (event) => setSettings({ ...settings, apiKey: event.target.value }) }),
            ),
            h('div', { className: 'pl-field' },
              h('label', null, 'API Base URL（OpenAI 兼容，如 https://api.deepseek.com/v1）'),
              h('input', { className: 'pl-input', value: settings.apiBaseUrl,
                onChange: (event) => setSettings({ ...settings, apiBaseUrl: event.target.value }) }),
            ),
            h('div', { className: 'pl-field' },
              h('label', null, '模型名（如 deepseek-chat）'),
              h('input', { className: 'pl-input', value: settings.apiModel,
                onChange: (event) => setSettings({ ...settings, apiModel: event.target.value }) }),
            ),
            h('button', { className: 'pl-btn primary', disabled: busy === 'settings', onClick: saveSettings }, '保存'),
          ),
          h('div', { className: 'pl-card', style: { marginTop: 12 } },
            h('h3', null, '多模态通道'),
            h('div', { className: 'pl-muted', style: { marginBottom: 10 } },
              '填了才启用。图片走 OpenAI 兼容的 vision 接口；语音走 /audio/transcriptions。留空则跳过对应内容，不影响文本学习。'),
            channelFields('vision', '图片 / 表情包识别', '请求会发到你自己填的端点，内容也发过去——选你信得过的服务。'),
            channelFields('speech', '语音转文字', '同上：音频会发到你填的端点。'),
            h('button', { className: 'pl-btn primary', disabled: busy === 'settings', onClick: saveSettings }, '保存通道'),
          ),
          h('div', { className: 'pl-muted', style: { marginTop: 10 } },
            `数据目录：$DSH_HOME/persona-lab · 学习区上限 ${state.limits?.maxZones || 5}`),
        ) : null,
      )
    }

    /* ---------- 学习区编辑器 ---------- */

    function ZoneEditor(props) {
      const { zone, setZone, busy, save, run, remove, account, login, onLoginStart, onManualLogin, onLogout, onCopy, reset, dirty } = props
      function patch(part) { setZone({ ...zone, ...part }) }
      function patchQuota(part) { setZone({ ...zone, quota: { ...zone.quota, ...part } }) }
      function toggleSource(key) {
        setZone({ ...zone, sources: { ...zone.sources, [key]: !zone.sources[key] } })
      }
      const ratioSum = Object.values(zone.quota.ratio || {}).reduce((a, b) => a + (Number(b) || 0), 0)

      return h('div', { className: 'pl-card', style: { marginTop: 12 } },
        h('div', { className: 'pl-row', style: { justifyContent: 'space-between', marginBottom: 10 } },
          h('h3', { style: { margin: 0 } },
            zone.name,
            h('span', {
              className: 'pl-muted',
              style: { marginLeft: 10, fontWeight: 400, fontSize: 12 },
            }, account
              ? `已登录：${account.name || account.uid}`
              : '未登录 · 先登录再学'),
          ),
          h('div', { className: 'pl-row' },
            h('button', {
              className: 'pl-btn primary',
              disabled: busy === 'run' || !account || dirty,
              onClick: run,
              title: !account ? '先登录这个区的 B站 账号' : (dirty ? '有未保存的修改，先点「保存」' : ''),
            }, busy === 'run' ? '学习中…' : '立刻学一次'),
            h('button', { className: 'pl-btn', disabled: busy === 'save-zone', onClick: save }, dirty ? '保存（有修改）' : '保存'),
            h('button', { className: 'pl-btn', onClick: reset, disabled: busy === 'reset' }, '清空记录'),
            h('button', { className: 'pl-btn danger', onClick: remove }, '删除区'),
          ),
          dirty ? h('div', { className: 'pl-warn', style: { marginTop: 8 } },
            '有未保存的修改：先点「保存」，否则「立刻学一次」按旧配置跑。') : null,
        ),

        h('div', { className: 'pl-field' },
          h('label', null, '这个区的 B站 账号（每个区独立）'),
          account
            ? h('div', { className: 'pl-row' },
              h('span', { className: 'pl-chip', 'data-on': '1' }, `已登录：${account.name || account.uid}`),
              h('button', { className: 'pl-btn', onClick: onLogout, disabled: busy === 'logout' }, '退出'),
              h('button', { className: 'pl-btn', onClick: onCopy, disabled: busy === 'copy' }, '沿用其他区的账号'),
            )
            : login
              ? h('div', { className: 'pl-row', style: { alignItems: 'flex-start' } },
                h('img', { className: 'pl-qr', src: `${API}/login/qr?text=${encodeURIComponent(login.url)}`, alt: '登录二维码' }),
                h('div', { style: { flex: 1, minWidth: 200 } },
                  h('div', null, '用手机 B站 扫一下，在手机上确认。'),
                  h('div', { className: 'pl-muted' }, '二维码约 3 分钟有效。'),
                  h('div', { className: 'pl-row', style: { marginTop: 8 } },
                    h('button', { className: 'pl-btn', onClick: onLoginStart }, '换一张'),
                  ),
                ),
              )
              : h('div', null,
                h('div', { className: 'pl-row' },
                  h('button', { className: 'pl-btn primary', disabled: busy === 'login', onClick: onLoginStart }, '扫码登录'),
                  h('button', { className: 'pl-btn', onClick: onCopy, disabled: busy === 'copy' }, '沿用其他区的账号'),
                ),
                h('div', { className: 'pl-muted', style: { marginTop: 6 } },
                  '这个区还没登录：不登录的话，「立刻学一次」会直接失败。'),
                h('div', { className: 'pl-row', style: { marginTop: 8 } },
                  h('input', {
                    className: 'pl-input', style: { flex: 1 },
                    placeholder: '或粘贴 Cookie：SESSDATA=...; bili_jct=...',
                  }),
                  h('button', { className: 'pl-btn', disabled: busy === 'manual', onClick: (event) => {
                    const box = event.currentTarget.parentElement.querySelector('input')
                    onManualLogin(box.value)
                  } }, '用这个登录'),
                ),
              ),
        ),

        h('div', { className: 'pl-field' },
          h('label', null, '名称'),
          h('input', { className: 'pl-input', value: zone.name, onChange: (event) => patch({ name: event.target.value }) }),
        ),

        h('div', { className: 'pl-field' },
          h('label', null, '学习源（可多选）'),
          h('div', { className: 'pl-pill' },
            ...SOURCE_OPTIONS.map((source) => h('button', {
              key: source.key, className: 'pl-chip', 'data-on': zone.sources[source.key] ? '1' : '0',
              onClick: () => toggleSource(source.key), type: 'button',
            }, source.label)),
          ),
          !zone.sources.danmaku ? h('div', { className: 'pl-muted' }, '弹幕默认关：开了要自己配过滤词，不然会学到一堆梗。') : null,
        ),

        h('div', { className: 'pl-field' },
          h('label', null, '表情包 / 图片 / 语音'),
          h('div', { className: 'pl-pill' },
            ...[['recognize', '识别'], ['learn', '学习'], ['use', '使用']].map(([key, label]) =>
              h('button', {
                key,
                className: 'pl-chip',
                type: 'button',
                'data-on': zone.media?.[key] !== false ? '1' : '0',
                onClick: () => patch({ media: { ...(zone.media || {}), [key]: zone.media?.[key] === false } }),
              }, label)),
          ),
          h('div', { className: 'pl-muted' },
            '识别要先在「设置 → 多模态通道」里填通道；没填就自动跳过，不影响文本学习。'),
        ),

        h('div', { className: 'pl-grid' },
          h('div', { className: 'pl-field' },
            h('label', null, '一次学习总条数'),
            h('input', { className: 'pl-input', type: 'number', value: zone.quota.total,
              onChange: (event) => patchQuota({ total: Number(event.target.value) }) }),
            h('span', { className: 'pl-muted' }, zone.quota.mode === 'cold' ? '冷启动：建议填大一点建立基线' : '增量：可以少一点'),
          ),
          h('div', { className: 'pl-field' },
            h('label', null, '单次运行上限（分钟）'),
            h('input', { className: 'pl-input', type: 'number', value: zone.maxRunMinutes,
              onChange: (event) => patch({ maxRunMinutes: Number(event.target.value) }) }),
          ),
          h('div', { className: 'pl-field' },
            h('label', null, '内容来源：视频从哪来'),
            h('div', { className: 'pl-row' },
              h('button', {
                className: 'pl-chip',
                'data-on': zone.content?.recommend !== false ? '1' : '0',
                type: 'button',
                onClick: () => patch({ content: { ...(zone.content || {}), recommend: zone.content?.recommend === false } }),
              }, zone.content?.recommend !== false ? '推荐流也参与找视频' : '只用关键词搜'),
            ),
            h('div', { className: 'pl-muted' },
              '推荐流不是学习源：它只负责找到视频，学到的仍然是那些视频的评论和弹幕。'),
          ),
        ),

        h('div', { className: 'pl-field' },
          h('label', null, `配额比例（合计 ${ratioSum}，不必等于 100）`),
          h('div', { className: 'pl-grid' },
            ...SOURCE_OPTIONS.map((source) => h('div', { key: source.key, className: 'pl-field', style: { marginBottom: 0 } },
              h('span', { className: 'pl-muted' }, source.label),
              h('input', {
                className: 'pl-input', type: 'number', value: zone.quota.ratio[source.key],
                onChange: (event) => patchQuota({ ratio: { ...zone.quota.ratio, [source.key]: Number(event.target.value) } }),
              }),
            )),
          ),
        ),

        h('div', { className: 'pl-grid' },
          h('div', { className: 'pl-field' },
            h('label', null, '播放量下限'),
            h('input', { className: 'pl-input', type: 'number', value: zone.filters.minPlay,
              onChange: (event) => patch({ filters: { ...zone.filters, minPlay: Number(event.target.value) } }) }),
          ),
          h('div', { className: 'pl-field' },
            h('label', null, '时长下限（秒）'),
            h('input', { className: 'pl-input', type: 'number', value: zone.filters.minDuration,
              onChange: (event) => patch({ filters: { ...zone.filters, minDuration: Number(event.target.value) } }) }),
          ),
          h('div', { className: 'pl-field' },
            h('label', null, '只要最近多少天'),
            h('input', { className: 'pl-input', type: 'number', value: zone.filters.recentDays,
              onChange: (event) => patch({ filters: { ...zone.filters, recentDays: Number(event.target.value) } }) }),
          ),
        ),
        zone.kind === 'custom'
          ? h('div', { className: 'pl-muted' }, '这是你自己建的区：不填过滤就等于不筛，可能学到垃圾。')
          : h('div', { className: 'pl-muted' }, '默认区：带播放量/时长下限，改不动。'),

        h('div', { className: 'pl-field' },
          h('label', null, '时间窗（每天几点到几点允许自动学）'),
          h('div', { className: 'pl-row' },
            h('button', {
              className: 'pl-chip', 'data-on': zone.schedule.enabled ? '1' : '0',
              onClick: () => patch({ schedule: { ...zone.schedule, enabled: !zone.schedule.enabled } }), type: 'button',
            }, zone.schedule.enabled ? '已开启' : '关着'),
            h('input', { className: 'pl-input', style: { width: 90 }, value: zone.schedule.start,
              onChange: (event) => patch({ schedule: { ...zone.schedule, start: event.target.value } }) }),
            h('span', null, '→'),
            h('input', { className: 'pl-input', style: { width: 90 }, value: zone.schedule.end,
              onChange: (event) => patch({ schedule: { ...zone.schedule, end: event.target.value } }) }),
          ),
        ),

        h('div', { className: 'pl-field' },
          h('label', null, '隔离文本（一行一条，命中就永远不学）'),
          h('textarea', {
            className: 'pl-textarea', value: (zone.isolation || []).join('\n'),
            onChange: (event) => patch({ isolation: event.target.value.split(/\r?\n/).map((s) => s.trim()).filter(Boolean) }),
          }),
        ),

        h('div', { className: 'pl-field' },
          h('label', null, '学习重点（搜什么就学什么，也写进提炼提示词；留空则随机看）'),
          h('input', {
            className: 'pl-input', value: (zone.focus?.traits || []).join('，'),
            placeholder: '如：短句、冷幽默、少用感叹号',
            onChange: (event) => patch({ focus: { ...zone.focus, traits: event.target.value.split(/[,，]/).map((s) => s.trim()).filter(Boolean) } }),
          }),
          !(zone.focus?.traits?.length) && !String(zone.focus?.reference || '').trim()
            ? h('div', { className: 'pl-warn', style: { marginTop: 6 } },
              '没填学习重点：会随机挑视频，学到的东西可能跟主题无关。'
              + '想让它学成你想要的样子，至少填一个词，或者在下面写「参考人设」。')
            : null,
        ),

        h('div', { className: 'pl-field' },
          h('label', null, '参考人设（可选：贴一段目标人设，提炼时以它为骨架）'),
          h('textarea', {
            className: 'pl-textarea',
            style: { minHeight: 110 },
            value: zone.focus?.reference || '',
            placeholder: '比如：蓝长发、鱼鳍耳、傲娇但心软、习惯短句、不排比、不列清单……\n骨架里写了但语料里没证据的，会留空而不是编。',
            onChange: (event) => patch({ focus: { ...zone.focus, reference: event.target.value } }),
          }),
        ),
      )
    }

    /* ---------- 渲染人设词为文本（与 Host 的 renderText 同构） ---------- */

    function personaText(ir) {
      const lines = []
      lines.push(`【人设词】样本 ${ir.meta?.sampleCount || 0} 条`)
      lines.push('')
      for (const [key, label] of [['chat', '私聊'], ['comment', '公开评论'], ['danmaku', '弹幕']]) {
        const block = ir.blocks?.[key]
        if (!block) continue
        const parts = []
        if (block.summary) parts.push(`概括：${block.summary}`)
        if (block.rhythm) parts.push(`节奏：${block.rhythm}`)
        if (block.tone) parts.push(`语气：${block.tone}`)
        if (block.habits?.length) parts.push(`口头禅：${block.habits.join('；')}`)
        if (block.avoid?.length) parts.push(`不说：${block.avoid.join('；')}`)
        if (parts.length === 0) continue
        lines.push(`—— ${label} ——`, ...parts, '')
      }
      const f = ir.fields || {}
      const rows = []
      if (f.identity) rows.push(`身份：${f.identity}`)
      if (f.tone) rows.push(`语气：${f.tone}`)
      if (f.rhythm) rows.push(`节奏：${f.rhythm}`)
      if (f.vocabulary) rows.push(`词汇：${f.vocabulary}`)
      if (f.quirks?.length) rows.push(`小习惯：${f.quirks.join('；')}`)
      if (f.boundaries?.length) rows.push(`边界：${f.boundaries.join('；')}`)
      if (rows.length > 0) lines.push('—— 字段 ——', ...rows)
      return lines.join('\n')
    }

    /** 把一条回复按换行拆成多个气泡——真人聊天就是一句一发。 */
    function splitBubbles(message, index) {
      const role = message.role === 'user' ? 'user' : 'assistant'
      const text = String(message.content || '')
      if (role === 'user') {
        return [h('div', { key: `u${index}`, className: 'pl-msg', 'data-role': 'user' }, text)]
      }
      const parts = text.split(/\n+/).map((line) => line.trim()).filter(Boolean)
      const list = parts.length > 0 ? parts : [text]
      return list.map((part, i) => h('div', {
        key: `a${index}-${i}`, className: 'pl-msg', 'data-role': 'assistant',
      }, part))
    }

    /** 用户可编辑的字段；有改动没保存时不让学习，免得按旧配置跑。 */
    const EDITABLE_KEYS = [
      'name', 'enabled', 'sources', 'content', 'quota', 'excludeKeywords',
      'filters', 'isolation', 'media', 'schedule', 'maxRunMinutes', 'focus',
    ]
    function isDirty(draft, base) {
      if (!draft || !base) return false
      return EDITABLE_KEYS.some((key) =>
        JSON.stringify(draft[key] ?? null) !== JSON.stringify(base[key] ?? null))
    }

    function groupByDay(runs) {      const map = new Map()
      for (const run of runs) {
        const day = String(run.startedAt || '').slice(0, 10) || '未知'
        if (!map.has(day)) map.set(day, [])
        map.get(day).push(run)
      }
      return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0]))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        const style = document.createElement('style')
        style.textContent = CSS
        document.head.appendChild(style)
        ctx.effect(() => () => style.remove(), 'dsh-persona-lab: 设置页样式')

        const slots = (typeof ctx.get === 'function' ? ctx.get('slots') : undefined) || ctx.slots
        if (!slots) return
        slots.inject('settings.section', () => slots.register(
          { name: 'settings.section', id: 'persona-lab', order: 24, label: '人设工坊' },
          () => h(Panel),
        ))
      },
    }
  },
})
