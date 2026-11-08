// Studio dashboard client. No framework: the API is small and the state is one object.
const state = {
  data: null,
  characterId: null,
  auditions: [],
  selected: null,
  engine: 'espeak',
};

const $ = (id) => document.getElementById(id);
const el = (tag, props = {}, children = []) => {
  const node = document.createElement(tag);
  Object.assign(node, props);
  for (const c of [].concat(children)) if (c) node.append(c);
  return node;
};

function toast(message, kind = 'ok') {
  const t = $('toast');
  t.textContent = message;
  t.className = `toast ${kind}`;
  t.hidden = false;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { t.hidden = true; }, kind === 'err' ? 8000 : 4000);
}

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...options,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { error: text }; }
  if (!res.ok) {
    const detail = body.details ? ` — ${[].concat(body.details).join('; ')}` : '';
    throw new Error(`${body.error ?? res.statusText}${detail}`);
  }
  return body;
}

function humanDuration(sec) {
  return sec == null ? '—' : `${Number(sec).toFixed(2)}s`;
}

function profileBadge(profile) {
  const status = profile?.status ?? 'missing';
  return el('span', { className: `badge ${status}`, textContent: status });
}

async function refresh() {
  try {
    state.data = await api('/api/state');
    $('conn').textContent = 'online';
    $('conn').className = 'pill ok';
    $('revision').textContent = `registry r${state.data.revision}`;
    renderCharacters();
    renderEngines();
    if (state.characterId) await selectCharacter(state.characterId, { keepSelection: true });
  } catch (err) {
    $('conn').textContent = 'offline';
    $('conn').className = 'pill bad';
    toast(err.message, 'err');
  }
}

function renderCharacters() {
  const list = $('character-list');
  list.innerHTML = '';
  for (const c of state.data.characters) {
    const swatch = el('span', { className: 'dot' });
    swatch.style.background = c.palette?.primary ?? '#666';
    const body = el('div', {}, [
      el('div', { className: 'name', textContent: c.displayName ?? c.id }),
      el('div', { className: 'sub', textContent: `${c.voiceAlias ?? 'no alias'} · ${c.profile?.status ?? 'no profile'}` }),
    ]);
    const btn = el('button', {
      className: `char${c.id === state.characterId ? ' active' : ''}`,
      onclick: () => selectCharacter(c.id),
    }, [swatch, body]);
    list.append(btn);
  }
}

function renderEngines() {
  const list = $('engine-list');
  list.innerHTML = '';
  for (const e of state.data.engines) {
    const ok = e.probe?.available;
    const name = el('span', {}, [
      el('span', { textContent: e.displayName ?? e.id }),
      e.productionEligible ? el('span', { className: 'badge approved', textContent: 'prod', style: 'margin-left:6px' }) : null,
    ]);
    list.append(el('div', { className: 'engine' }, [
      name,
      el('span', { className: `st ${ok ? 'up' : 'down'}`, textContent: ok ? 'ready' : (e.probe?.status ?? 'n/a') }),
    ]));
  }
  const select = $('engine-select');
  const current = select.value || state.engine;
  select.innerHTML = '';
  for (const e of state.data.engines) {
    const opt = el('option', { value: e.id, textContent: `${e.displayName ?? e.id}${e.probe?.available ? '' : ' (unavailable)'}` });
    select.append(opt);
  }
  if (state.data.engines.some((e) => e.id === current)) select.value = current;
  state.engine = select.value;
}

async function selectCharacter(id, { keepSelection = false } = {}) {
  state.characterId = id;
  if (!keepSelection) state.selected = null;
  renderCharacters();

  const { character, auditions } = await api(`/api/character/${id}`);
  $('empty').hidden = true;
  $('detail').hidden = false;

  const avatar = $('avatar');
  avatar.style.background = character.palette?.primary ?? '#444';
  avatar.style.borderColor = character.palette?.secondary ?? '#243b2f';

  $('char-name').textContent = character.displayName ?? character.id;
  $('char-sub').textContent = [character.species, character.role].filter(Boolean).join(' · ') || character.id;

  const badges = $('char-badges');
  badges.innerHTML = '';
  badges.append(profileBadge(character.profile));
  if (character.voiceAlias) badges.append(el('span', { className: 'badge', textContent: character.voiceAlias }));

  renderProfile(character.profile);
  renderHistory(character.profile);
  $('text-input').value = state.data.auditionText;

  state.auditions = auditions;
  renderCandidates(character);
  $('approve').disabled = !state.selected;
}

function renderProfile(profile) {
  const box = $('profile');
  box.innerHTML = '';
  if (!profile) {
    box.append(el('p', { className: 'muted', textContent: 'No voice profile for this character.' }));
    return;
  }
  const fields = [
    ['alias', profile.voiceAlias],
    ['version', `v${profile.version}`],
    ['status', profile.status],
    ['engine', profile.engine],
    ['model', profile.model],
    ['speaker', profile.speakerId],
    ['language', profile.language],
    ['approved by', profile.approvedBy ?? '—'],
    ['approved at', profile.approvedAt ? new Date(profile.approvedAt).toLocaleString() : '—'],
    ['sample', profile.sampleAudio ? profile.sampleAudio.split('/').pop() : '—'],
    ['rms / peak', profile.quality ? `${profile.quality.rms} / ${profile.quality.peak}` : '—'],
  ];
  for (const [k, v] of fields) {
    box.append(el('div', { className: 'field' }, [
      el('div', { className: 'k', textContent: k }),
      el('div', { className: 'v', textContent: v ?? '—' }),
    ]));
  }
  if (profile.sampleAudio) {
    const audio = el('audio', { controls: true, preload: 'none' });
    audio.src = `/audio/${profile.sampleAudio.replace(/^audio\/generated\//, '')}`;
    box.append(audio);
  }
}

function renderHistory(profile) {
  const box = $('history');
  box.innerHTML = '';
  if (!profile?.history?.length) {
    box.append(el('p', { className: 'muted', textContent: 'No history yet.' }));
    return;
  }
  for (const h of [...profile.history].reverse()) {
    box.append(el('div', { className: 'hist' }, [
      el('span', { className: 'ev', textContent: h.event }),
      el('span', { className: 'at', textContent: h.at ? new Date(h.at).toLocaleString() : '' }),
      el('span', { className: 'muted', textContent: `${h.actor ?? ''}${h.note ? ` — ${h.note}` : ''}` }),
    ]));
  }
}

function renderCandidates(character) {
  const box = $('candidates');
  box.innerHTML = '';
  if (!state.auditions.length) {
    box.append(el('p', { className: 'muted small', textContent: 'No candidates yet — generate some above.' }));
    return;
  }
  for (const c of state.auditions) {
    const audio = el('audio', { controls: true, preload: 'none', src: c.url });
    audio.addEventListener('play', () => {
      for (const other of box.querySelectorAll('audio')) if (other !== audio) other.pause();
    });
    const node = el('div', {
      className: `cand${state.selected?.file === c.file ? ' selected' : ''}`,
      onclick: (ev) => {
        if (ev.target.tagName === 'AUDIO' || ev.target.tagName === 'BUTTON') return;
        state.selected = c;
        $('approve').disabled = false;
        renderCandidates(character);
      },
    }, [
      el('span', { className: 'id', textContent: c.candidateId }),
      el('div', { className: 'note', textContent: c.note ?? '' }),
      audio,
      el('span', {
        className: 'stat',
        textContent: `${humanDuration(c.durationSec)}${c.rms != null ? ` · rms ${c.rms}` : ''}`,
      }),
    ]);
    box.append(node);
  }
}

$('generate').addEventListener('click', async () => {
  const btn = $('generate');
  btn.disabled = true;
  btn.textContent = 'Generating…';
  try {
    const body = await api('/api/audition', {
      method: 'POST',
      body: {
        characterId: state.characterId,
        engine: $('engine-select').value,
        speakerId: $('speaker-input').value,
        text: $('text-input').value,
      },
    });
    const failed = body.candidates.filter((c) => c.error);
    toast(
      `${body.candidates.length - failed.length} candidate(s) rendered via ${body.engine}` +
        (body.productionEligible ? '' : ' — not production-eligible, listen only'),
      failed.length ? 'err' : 'ok',
    );
    const { auditions } = await api(`/api/character/${state.characterId}`);
    state.auditions = auditions;
    renderCandidates({});
  } catch (err) {
    toast(err.message, 'err');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Generate 3 variants';
  }
});

$('engine-select').addEventListener('change', (e) => { state.engine = e.target.value; });

$('approve').addEventListener('click', async () => {
  if (!state.selected) return;
  const approvedBy = $('approver').value.trim();
  if (!approvedBy) return toast('Enter who is approving — approvals must name a person', 'err');
  try {
    const result = await api('/api/approve', {
      method: 'POST',
      body: {
        characterId: state.characterId,
        engine: $('engine-select').value,
        speakerId: $('speaker-input').value,
        samplePath: `audio/generated/auditions/${state.characterId}/${state.selected.file}`,
        approvedBy,
        note: $('approve-note').value.trim() || undefined,
      },
    });
    toast(`${result.voiceAlias} approved at v${result.version} (registry r${result.revision})`);
    await refresh();
  } catch (err) {
    toast(err.message, 'err');
  }
});

$('reject').addEventListener('click', async () => {
  const rejectedBy = $('approver').value.trim();
  if (!rejectedBy) return toast('Enter who is rejecting', 'err');
  try {
    const result = await api('/api/reject', {
      method: 'POST',
      body: { characterId: state.characterId, rejectedBy, reason: $('approve-note').value.trim() || undefined },
    });
    toast(`profile rejected (registry r${result.revision})`);
    await refresh();
  } catch (err) {
    toast(err.message, 'err');
  }
});

refresh();
