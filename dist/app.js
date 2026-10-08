(function () {
  'use strict';
  const data = window.CHINA_JOBS_DATA;
  const state = { metric: 'wage', employment: 'legal', ownership: 'private', selected: 'C' };
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const number = (n, digits = 1) => n === null ? '未发布' : n.toLocaleString('zh-CN', { maximumFractionDigits: digits });
  const scopeName = () => state.employment === 'legal' ? '法人单位' : '个体经营户';
  const ownershipName = () => state.ownership === 'private' ? '城镇私营单位' : '城镇非私营单位';
  const total = () => data.totals[`employment_${state.employment}_10k`];
  const count = d => d[`employment_${state.employment}_10k`];
  const wages = d => d[`wage_${state.ownership}_2025`];
  const growth = d => d[`growth_${state.ownership}`];
  const female = d => count(d) ? d[`female_${state.employment}_10k`] / count(d) * 100 : null;
  const metricValue = d => ({ wage: wages, growth, female, ai: d => d.ai_exposure })[state.metric](d);
  const metricText = d => {
    const v = metricValue(d);
    if (v === null) return '无对应数据';
    if (state.metric === 'wage') return `${(v / 10000).toFixed(2)} 万元 / 年`;
    if (state.metric === 'growth') return `${v > 0 ? '+' : ''}${v.toFixed(1)}%`;
    if (state.metric === 'female') return `${v.toFixed(1)}%`;
    return `${v} / 10 · 估计`;
  };
  function mix(a, b, t) {
    const rgb = c => [1, 3, 5].map(p => parseInt(c.slice(p, p + 2), 16));
    const x = rgb(a), y = rgb(b);
    return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function color(v) {
    if (v === null) return '#e1e6ec';
    if (state.metric === 'wage') return mix('#e8f1f7', '#153d66', Math.min(1, Math.max(0, (v - 40000) / (state.ownership === 'private' ? 110000 : 210000))));
    if (state.metric === 'growth') return v < 0 ? mix('#eef2f5', '#b55f76', Math.min(1, -v / 8)) : mix('#eef2f5', '#226f82', Math.min(1, v / 8));
    if (state.metric === 'female') return mix('#e5eff6', '#57528e', Math.min(1, v / 75));
    return v <= 5 ? mix('#67969c', '#d7dde3', v / 5) : mix('#d7dde3', '#92507b', (v - 5) / 5);
  }
  function textColor(hex) {
    const rgb = [1, 3, 5].map(p => parseInt(hex.slice(p, p + 2), 16));
    return rgb[0] * .299 + rgb[1] * .587 + rgb[2] * .114 < 155 ? '#ffffff' : '#19344c';
  }
  function visibleIndustries() { return data.industries.filter(d => count(d) !== null && count(d) > 0); }
  function renderMap() {
    const map = $('treemap'), width = map.clientWidth, height = map.clientHeight;
    if (!width || !height) return;
    const byCode = new Map(data.industries.map(d => [d.code, d]));
    const positions = window.ChinaTreemap.squarify(visibleIndustries().map(d => ({ id: d.code, value: count(d) })), width, height);
    const existing = new Map([...map.children].map(el => [el.dataset.code, el]));
    positions.forEach(p => {
      const d = byCode.get(p.id), v = metricValue(d), background = color(v);
      let tile = existing.get(d.code);
      if (!tile) {
        tile = document.createElement('button'); tile.type = 'button'; tile.dataset.code = d.code;
        tile.addEventListener('click', () => selectIndustry(d.code));
        tile.addEventListener('pointerenter', e => showTooltip(d, e));
        tile.addEventListener('pointermove', positionTooltip);
        tile.addEventListener('pointerleave', hideTooltip);
        tile.addEventListener('focus', hideTooltip);
        map.append(tile);
      }
      existing.delete(d.code);
      const small = p.w < 95 || p.h < 63, medium = !small && (p.w < 175 || p.h < 120), tiny = p.h < 43;
      tile.className = `tile${small ? ' small' : medium ? ' medium' : ''}${tiny ? ' tiny' : ''}${state.selected === d.code ? ' selected' : ''}${v === null ? ' missing' : ''}`;
      Object.assign(tile.style, { left: `${p.x}px`, top: `${p.y}px`, width: `${p.w}px`, height: `${p.h}px`, backgroundColor: background, color: textColor(background) });
      tile.setAttribute('aria-pressed', String(state.selected === d.code));
      tile.setAttribute('aria-label', `${d.name}，${scopeName()}从业人员${number(count(d))}万人，${$('metric-title').textContent}：${metricText(d)}，点击查看详情`);
      tile.innerHTML = `<span class="tile-code">${d.code}${d.code === 'A' ? '*' : ''}</span><span class="tile-name">${esc(d.short_name)}</span><span class="tile-number">${metricText(d)}</span><span class="tile-employment">${number(count(d))} 万人</span>`;
    });
    existing.forEach(tile => tile.remove());
  }
  function renderDetail() {
    const d = data.industries.find(d => d.code === state.selected);
    const value = count(d), share = value === null ? null : value / total() * 100;
    const g = growth(d), pay = wages(d);
    const wageHint = d.code === 'A' ? '农业子范围未映射工资' : pay === null ? '此单位口径未发布' : '2025 · 税前年平均';
    $('industry-detail').innerHTML = `<div class="detail-eyebrow"><span class="industry-code">${d.code}${d.code === 'A' ? '*' : ''}</span><span>行业详情 / 国民经济行业门类</span></div><h2>${esc(d.name)}</h2><p class="detail-category">${({ industrial: '工业', construction: '建筑业', services: '服务业（经济普查范围）' })[d.sector]} · ${scopeName()}</p><div class="detail-count">${number(value)}<small>${value === null ? '' : '万人'}</small></div><div class="detail-count-label">2023 年末从业人员${value === null ? ' · 原表为空，未补零' : ''}</div><div class="share-track"><div class="share-fill" style="width:${share || 0}%"></div></div><div class="share-caption"><span>占本口径就业人数</span><span>${share === null ? '—' : share.toFixed(2) + '%'}</span></div><dl class="detail-stats"><div><dt>平均工资<small>${ownershipName()}</small></dt><dd>${pay === null ? '无对应数据' : number(pay, 0) + ' 元'}<small>${wageHint}</small></dd></div><div><dt>工资增速<small>2025 较 2024 · 名义</small></dt><dd>${g === null ? '—' : (g > 0 ? '+' : '') + g.toFixed(1) + '%'}<small>非就业增速</small></dd></div><div><dt>女性从业人员<small>2023 · ${scopeName()}</small></dt><dd>${number(d[`female_${state.employment}_10k`])}${value === null ? '' : ' 万人'}<small>${female(d) === null ? '未发布' : '占比 ' + female(d).toFixed(1) + '%'}</small></dd></div></dl><div class="detail-ai"><div class="ai-score-line"><span>数字 AI 任务暴露 <span class="estimate-tag">模型估计</span></span><strong>${d.ai_exposure} <small>/ 10</small></strong></div><p>${esc(d.ai_rationale)}</p><p class="ai-caveat">行业层面的主观估计，不代表具体职业，也不是失业概率。</p></div><div class="detail-sources"><a href="${data.sources[0].url}" target="_blank" rel="noopener noreferrer">就业数据原表 ↗</a><a href="${data.sources[1].url}" target="_blank" rel="noopener noreferrer">工资数据原表 ↗</a></div>`;
  }
  function renderHeader() {
    $('total-label').textContent = `${scopeName()}从业人员 · 2023`;
    $('total-value').innerHTML = `${(total() / 10000).toFixed(2)}<small>亿人</small>`;
    $('total-sub').textContent = `${visibleIndustries().length} 个有数据的行业门类${state.employment === 'individual' ? ' · 2 类未发布' : ''}`;
    $('wage-control').hidden = !['wage', 'growth'].includes(state.metric);
    const configs = {
      wage: { title: '税前年平均工资', low: '4 万', high: state.ownership === 'private' ? '15 万元' : '25 万元', gradient: 'linear-gradient(to right,#e8f1f7,#153d66)', note: `2025 年${ownershipName()}税前年平均工资，非中位数、非到手收入。${state.employment === 'individual' ? '该工资不代表个体经营户收入。' : ''}`, year: '颜色 · 2025 年' },
      growth: { title: '工资名义增速', low: '−8%', high: '+8%', gradient: 'linear-gradient(to right,#b55f76,#eef2f5,#226f82)', note: `${ownershipName()}年平均工资，2025 年较 2024 年名义变化；不是就业增长或预测。${state.employment === 'individual' ? '不代表个体经营户收入变化。' : ''}`, year: '颜色 · 2025 / 2024' },
      female: { title: '女性从业人员占比', low: '0%', high: '75%', gradient: 'linear-gradient(to right,#e5eff6,#57528e)', note: `2023 年经济普查${scopeName()}女性人数 ÷ 本行业从业人数；面积与颜色口径一致。`, year: '颜色 · 2023 年' },
      ai: { title: '数字 AI 任务暴露 · 模型估计', low: '低 0', high: '10 高', gradient: 'linear-gradient(to right,#67969c,#d7dde3,#92507b)', note: '0–10 分的行业任务粗粒度估计。高分表示潜在重塑，不是失业概率；分数未经实证验证。', year: '估计 · 2026.10' }
    };
    const c = configs[state.metric];
    $('metric-title').textContent = c.title; $('legend-low').textContent = c.low; $('legend-high').textContent = c.high;
    $('legend-gradient').style.background = c.gradient; $('metric-note').textContent = c.note; $('map-year').textContent = c.year;
    document.querySelectorAll('[data-metric]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.metric === state.metric)));
  }
  function render() { hideTooltip(); renderHeader(); renderMap(); renderDetail(); }
  function selectIndustry(code) {
    if (!data.industries.some(d => d.code === code)) throw new Error('未知行业代码');
    state.selected = code; renderMap(); renderDetail(); hideTooltip();
  }
  function showTooltip(d, event) {
    if (event.pointerType === 'touch') return;
    $('tooltip').innerHTML = `<strong>${esc(d.name)}</strong><span>从业人员 ${number(count(d))} 万人 · ${scopeName()}</span><br>${esc($('metric-title').textContent)}：${metricText(d)}`;
    $('tooltip').hidden = false; positionTooltip(event);
  }
  function positionTooltip(e) {
    const t = $('tooltip'); if (t.hidden) return;
    const left = Math.max(8, Math.min(window.innerWidth - t.offsetWidth - 8, e.clientX + 14));
    const top = Math.max(8, Math.min(window.innerHeight - t.offsetHeight - 8, e.clientY + 15));
    t.style.left = `${left}px`; t.style.top = `${top}px`;
  }
  function hideTooltip() { $('tooltip').hidden = true; }
  document.querySelectorAll('[data-metric]').forEach(b => b.addEventListener('click', () => { state.metric = b.dataset.metric; render(); }));
  $('employment-scope').addEventListener('change', e => {
    state.employment = e.target.value;
    if (count(data.industries.find(d => d.code === state.selected)) === null) state.selected = visibleIndustries()[0].code;
    render();
  });
  $('wage-scope').addEventListener('change', e => { state.ownership = e.target.value; render(); });
  const dialog = $('sources-dialog');
  $('sources-list').innerHTML = data.sources.map(s => `<div class="source-item"><a href="${s.url}" target="_blank" rel="noopener noreferrer">${esc(s.title)} ↗</a><p>${esc(s.scope)}</p><p class="source-meta">数据年份 ${s.reference_year} · 发布 ${s.published_at} · 核对 ${s.accessed_at}</p></div>`).join('');
  $('ai-method').textContent = `${data.ai.method}。${data.ai.limitations}。`;
  $('ai-prompt').textContent = data.ai.prompt;
  ['sources-open', 'sources-footer'].forEach(id => $(id).addEventListener('click', () => { hideTooltip(); dialog.showModal(); }));
  $('sources-close').addEventListener('click', () => dialog.close());
  dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
  window.addEventListener('scroll', hideTooltip, { passive: true });
  window.addEventListener('keydown', e => { if (e.key === 'Escape') hideTooltip(); });
  new ResizeObserver(renderMap).observe($('treemap'));
  render();
  // Share the visible exploration actions with supported WebMCP browsers.
  const api = {
    get_state: () => ({ ...state, total_employment_10k: total(), selected_industry: data.industries.find(d => d.code === state.selected), sources: data.sources }),
    configure_map: input => {
      if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('需要配置对象');
      const allowed = { metric: ['wage', 'growth', 'female', 'ai'], employment: ['legal', 'individual'], ownership: ['private', 'nonprivate'] };
      for (const [key, value] of Object.entries(input)) if (!allowed[key]?.includes(value)) throw new Error(`不支持的配置：${key}`);
      Object.assign(state, input);
      $('employment-scope').value = state.employment; $('wage-scope').value = state.ownership;
      if (count(data.industries.find(d => d.code === state.selected)) === null) state.selected = visibleIndustries()[0].code;
      render(); return api.get_state();
    },
    select_industry: input => { if (!input || typeof input.code !== 'string') throw new Error('需要行业代码'); selectIndustry(input.code); return api.get_state(); }
  };
  const ctx = document.modelContext;
  if (ctx?.registerTool) {
    const lifetime = new AbortController();
    const tools = [
      { name: 'read_china_jobs_map', description: '读取当前中国行业就业地图的状态、选中行业和官方来源。', inputSchema: { type: 'object', properties: {}, additionalProperties: false }, annotations: { readOnlyHint: true }, execute: api.get_state },
      { name: 'configure_china_jobs_map', description: '切换可见地图的颜色指标、面积口径与工资口径。', inputSchema: { type: 'object', properties: { metric: { enum: ['wage', 'growth', 'female', 'ai'] }, employment: { enum: ['legal', 'individual'] }, ownership: { enum: ['private', 'nonprivate'] } }, additionalProperties: false }, annotations: { readOnlyHint: false }, execute: api.configure_map },
      { name: 'select_china_jobs_industry', description: '按A至S行业代码，在可见地图中查看该行业详情；不改变数据。', inputSchema: { type: 'object', properties: { code: { type: 'string', enum: data.industries.map(d => d.code) } }, required: ['code'], additionalProperties: false }, annotations: { readOnlyHint: false }, execute: api.select_industry }
    ];
    tools.forEach(tool => { try { Promise.resolve(ctx.registerTool(tool, { signal: lifetime.signal })).catch(e => console.warn('WebMCP注册失败', e.message)); } catch (e) { console.warn('WebMCP不可用', e.message); } });
    window.addEventListener('pagehide', () => lifetime.abort(), { once: true });
  }
})();

