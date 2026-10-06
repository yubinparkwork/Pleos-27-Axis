(() => {
  const base = new URL('.', document.currentScript.src);
  const active = location.pathname.match(/\/versions\/([^/]+)\//)?.[1];
  const hybridLive = 'live:hybrid-ab';
  const splitLive = 'live:hybrid-axis-split';
  const gateLive = 'live:coex-gate';
  const currentLook = new URLSearchParams(location.search).get('look');
  // Archived builds are intentionally immutable. Their shared menu is the only
  // bridge from their version-scoped browser save to the local dev server.
  if (active && ['127.0.0.1', 'localhost'].includes(location.hostname)) {
    const params = new URLSearchParams(location.search);
    const suffix = currentLook === 'hybrid-axis-split' ? ':hybrid-axis-split' : currentLook === 'hybrid-ab' ? ':hybrid-ab'
      : currentLook === 'cube0914' ? ':cube0914-motion'
      : params.get('sequence') === 'pleos25' ? `:identity25${params.get('transition') === 'layered' ? ':layered' : ''}`
      : '';
    const browserKey = `pleos-optical-studio-v1${suffix}`;
    const sharedKey = `pleos-optical-studio-v1:archive:${active.replace(/-compatible$/, '')}${suffix}`;
    const endpoint = `/__pleos/optical-state?key=${encodeURIComponent(sharedKey)}`;
    let applying = false;
    let changedDuringLoad = false;
    let pending = null;
    let lastTimestamp = 0;
    let timer;
    let writing = false;
    let available = false;
    let lastSettingsSignature = '';
    let archiveHistory;
    const settingsSignature = state => {
      const { time, ...settings } = state;
      return JSON.stringify(settings);
    };
    const mountArchiveHistory = () => {
      // Current builds own their history. Older frozen builds can receive this
      // small editor affordance without modifying their archived renderer code.
      const app = document.querySelector('#app');
      const heading = app?.querySelector('.optical-inspector-heading');
      const api = window.__pleosOptical;
      if (!heading || !api || heading.querySelector('[data-optical-action="undo"]')) return null;
      const controls = document.createElement('span');
      controls.style.cssText = 'display:inline-flex;gap:3px;margin-left:auto';
      const undoButton = document.createElement('button');
      const redoButton = document.createElement('button');
      for (const [button, label, shortcut] of [
        [undoButton, '되돌리기', '⌘Z / Ctrl+Z'],
        [redoButton, '다시', '⌘⇧Z / Ctrl+Shift+Z'],
      ]) {
        button.type = 'button'; button.className = 'optical-text-button';
        button.textContent = label; button.setAttribute('aria-label', `설정 ${label}`);
        button.title = `${label} (${shortcut})`;
        controls.append(button);
      }
      heading.insertBefore(controls, heading.querySelector('button'));
      const past = [], future = [];
      let current = { ...api.inspect().state };
      let lastKeys = '', lastEditAt = 0, restoring = false;
      const refresh = () => { undoButton.disabled = !past.length; redoButton.disabled = !future.length; };
      const record = next => {
        if (restoring) { current = { ...next }; return; }
        const keys = Object.keys(next).filter(key => key !== 'time' && key !== 'playing' && current[key] !== next[key]);
        if (!keys.length) { current = { ...next }; return; }
        const group = keys.sort().join(':');
        const now = Date.now();
        if (group !== lastKeys || now - lastEditAt > 350) {
          past.push({ ...current });
          if (past.length > 100) past.shift();
        }
        future.length = 0;
        lastKeys = group; lastEditAt = now; current = { ...next };
        refresh();
      };
      const restore = (direction, focused) => {
        const source = direction === 'undo' ? past : future;
        const destination = direction === 'undo' ? future : past;
        const snapshot = source.pop();
        if (!snapshot) return false;
        const before = api.inspect().state;
        destination.push({ ...before });
        restoring = true;
        try { api.set({ ...snapshot, time: before.time, playing: before.playing }); }
        finally { restoring = false; }
        current = { ...api.inspect().state };
        lastKeys = ''; lastEditAt = 0;
        if (focused instanceof HTMLInputElement) {
          const key = focused.dataset.opticalNumber || focused.dataset.opticalRange;
          if (key && key in current) focused.value = String(current[key]);
        }
        refresh();
        return true;
      };
      undoButton.addEventListener('click', () => restore('undo'));
      redoButton.addEventListener('click', () => restore('redo'));
      window.addEventListener('keydown', event => {
        if (event.defaultPrevented || event.altKey || !(event.metaKey || event.ctrlKey)) return;
        const key = event.key.toLowerCase();
        const direction = key === 'z' ? event.shiftKey ? 'redo' : 'undo'
          : key === 'y' && event.ctrlKey && !event.metaKey ? 'redo' : null;
        if (!direction) return;
        const target = event.composedPath()[0];
        if (target instanceof Element && !app.contains(target) && target !== document.body) return;
        if (restore(direction, target)) event.preventDefault();
      }, { capture: true });
      refresh();
      return { record, reset: next => { past.length = 0; future.length = 0; current = { ...next }; lastKeys = ''; refresh(); } };
    };
    const storage = window.localStorage;
    const originalSet = storage.setItem.bind(storage);
    const send = async (migration = false) => {
      if (writing || !available) return;
      writing = true;
      try {
        while (pending) {
          const state = pending;
          pending = null;
          lastTimestamp = migration ? 0 : Math.max(Date.now(), lastTimestamp + 1);
          const response = await fetch(endpoint, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, keepalive: true,
            body: JSON.stringify({ version: 1, updatedAt: lastTimestamp, migration, state }),
          });
          migration = false;
          if (response.status === 409) {
            const remote = await response.json();
            lastTimestamp = Math.max(lastTimestamp, remote.updatedAt || 0);
            if (!pending && remote.state && !changedDuringLoad) {
              applying = true;
              try { window.__pleosOptical?.set(remote.state); } finally { applying = false; }
              lastSettingsSignature = settingsSignature(remote.state);
              archiveHistory?.reset(window.__pleosOptical.inspect().state);
            }
            continue;
          }
          if (!response.ok) throw new Error('Shared setting save failed');
        }
      } catch (error) {
        console.warn('이 버전의 공유 설정 저장에 실패했습니다. 브라우저 저장은 유지됩니다.', error);
      } finally {
        writing = false;
        if (pending) schedule();
      }
    };
    const schedule = () => { clearTimeout(timer); timer = setTimeout(() => { void send(); }, 150); };
    const hookStorage = () => {
      try {
        storage.setItem = (key, value) => {
          originalSet(key, value);
          if (key !== browserKey || applying) return;
          try {
            const state = JSON.parse(value);
            const signature = settingsSignature(state);
            if (signature === lastSettingsSignature) return;
            archiveHistory?.record(state);
            lastSettingsSignature = signature;
            pending = state; changedDuringLoad = true; if (available) schedule();
          }
          catch { /* A malformed save remains browser-local. */ }
        };
      } catch { /* Some browser storage wrappers cannot be patched. */ }
    };
    const start = async () => {
      for (let i = 0; i < 100 && !window.__pleosOptical?.inspect?.().ready; i++) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
      if (!window.__pleosOptical?.inspect?.().ready) return;
      try {
        const response = await fetch(endpoint, { cache: 'no-store' });
        if (response.status !== 204 && (!response.ok || !response.headers.get('content-type')?.includes('application/json'))) return;
        available = true;
        if (response.status === 200) {
          const remote = await response.json();
          if (remote?.version !== 1 || !remote.state) return;
          lastTimestamp = remote.updatedAt || 0;
          if (!changedDuringLoad) {
            applying = true;
            try { window.__pleosOptical.set(remote.state); } finally { applying = false; }
          }
        } else if (storage.getItem(browserKey) && !changedDuringLoad) {
          // Seed only from an existing save. A fresh second browser must not
          // overwrite the first browser's scene with archive defaults.
          pending = window.__pleosOptical.inspect().state;
          await send(true);
        }
        lastSettingsSignature = settingsSignature(window.__pleosOptical.inspect().state);
        archiveHistory = mountArchiveHistory();
        // The archive may save its default state while booting. Start watching
        // only after the remote state has been restored or migration completed.
        hookStorage();
        if (pending) schedule();
      } catch { /* Static deployments and offline archives remain browser-local. */ }
    };
    void start();
    window.addEventListener('pagehide', () => { if (pending) void send(); });
  }
  const host = document.createElement('aside');
  host.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:10000;max-width:38vw';
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `<style>:host{font:12px system-ui;color:#eee}select{width:100%;height:32px;background:#18191b;color:#eee;border:1px solid #777;border-radius:4px;padding:0 8px;font:inherit}select:focus-visible{outline:2px solid #fff;outline-offset:2px}select:hover{background:#26272a}small{display:none;background:#18191b;padding:8px;line-height:1.5} :host(:focus-within) small{display:block}</style><select aria-label="날짜별 사이트 버전"><option value="">현재 작업본</option><option value="${hybridLive}">A/B 통합안 · 현재 조정</option></select><small role="status"></small>`;
  document.body.append(host);
  const menuRow=document.createElement('div');menuRow.style.cssText='display:flex;gap:4px;align-items:center';
  const versionSelect=shadow.querySelector('select');versionSelect.style.cssText='flex:1;min-width:0';
  const markButton=document.createElement('button');markButton.type='button';markButton.textContent='☆';markButton.disabled=true;
  markButton.style.cssText='flex:0 0 32px;width:32px;height:32px;background:#18191b;color:#eee;font-size:20px;padding:0';
  markButton.setAttribute('aria-label','현재 버전 즐겨찾기 추가');markButton.setAttribute('aria-pressed','false');
  shadow.insertBefore(menuRow,versionSelect);menuRow.append(versionSelect,markButton);
  const favoritesKey='pleos-version-favorites-v1';
  let favoriteValues=new Set(), favoriteStorage, versionOptions=[];
  const favoritesGroup=document.createElement('optgroup');favoritesGroup.label='즐겨찾기';
  const versionsGroup=document.createElement('optgroup');versionsGroup.label='사이트 버전';
  const updateMark=()=>{
    const marked=favoriteValues.has(versionSelect.value);
    markButton.disabled=!favoriteStorage||versionSelect.disabled||versionSelect.value.startsWith('setting:');
    markButton.textContent=marked?'★':'☆';markButton.setAttribute('aria-pressed',String(marked));
    markButton.title=marked?'즐겨찾기 해제':'즐겨찾기 추가';markButton.setAttribute('aria-label','현재 버전 '+markButton.title);
  };
  const regroupVersions=()=>{
    const selected=versionSelect.value;
    favoritesGroup.replaceChildren();versionsGroup.replaceChildren();
    for(const option of versionOptions)(favoriteValues.has(option.value)?favoritesGroup:versionsGroup).append(option);
    if(versionOptions.length){versionSelect.replaceChildren();if(favoritesGroup.children.length)versionSelect.append(favoritesGroup);versionSelect.append(versionsGroup,savedGroup);versionSelect.value=selected;}
    updateMark();
  };
  const syncFavorites=()=>{
    try{const values=JSON.parse(favoriteStorage.getItem(favoritesKey)||'[]');favoriteValues=new Set(Array.isArray(values)?values.filter(v=>typeof v==='string'):[]);regroupVersions();}
    catch{favoriteStorage=undefined;updateMark();}
  };
  markButton.addEventListener('click',()=>{
    const next=new Set(favoriteValues);if(next.has(versionSelect.value))next.delete(versionSelect.value);else next.add(versionSelect.value);
    try{favoriteStorage.setItem(favoritesKey,JSON.stringify([...next]));favoriteValues=next;regroupVersions();}
    catch{markButton.title='즐겨찾기를 저장하지 못했습니다. 브라우저 저장 권한을 확인하세요.';}
  });
  const splitOption = document.createElement('option');
  splitOption.value = splitLive; splitOption.textContent = 'A/B 통합안 · 축 면 분리 시안';
  shadow.querySelector('select').append(splitOption);
  const gateOption = document.createElement('option');
  gateOption.value = gateLive; gateOption.textContent = '코엑스 D홀 · 디멘션 게이트';
  shadow.querySelector('select').append(gateOption);
  // Focus must not shift the summary between pointer-down and pointer-up.
  const stableLayout=document.createElement('style');stableLayout.textContent=':host(:focus-within) small{display:none}';shadow.append(stableLayout);
  let settings = [];
  let store;
  const storageFrame=document.createElement('iframe');
  storageFrame.hidden=true;storageFrame.title='공유 설정 저장소';
  storageFrame.src=new URL('named-settings-store.html',base).href;
  const savedGroup = document.createElement('optgroup'); savedGroup.label='저장한 설정';
  const form = document.createElement('form');
  form.innerHTML='<input aria-label="설정 이름" placeholder="설정 이름" maxlength="60" required><button type="submit">설정 저장</button><span role="status"></span>';
  form.style.cssText='display:flex;gap:4px;margin-top:4px;background:#18191b;padding:4px;flex-wrap:wrap';
  const input=form.querySelector('input'), button=form.querySelector('button'), feedback=form.querySelector('span');
  input.style.cssText='min-width:0;flex:1;width:90px;height:28px;background:#18191b;color:#eee;border:1px solid #777;border-radius:3px';
  button.style.cssText='height:30px;background:#eee;color:#111;border:0;border-radius:3px;cursor:pointer';
  feedback.style.cssText='width:100%;font-size:11px';
  const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent='이름 붙여 설정 저장';summary.style.cssText='background:#18191b;padding:5px;cursor:pointer';details.append(summary,form);shadow.append(details);
  const loadButton=document.createElement('button');loadButton.type='button';loadButton.textContent='설정 불러오기';loadButton.disabled=true;
  const actions=document.createElement('div');actions.append(loadButton);shadow.insertBefore(actions,details);
  const uiStyle=document.createElement('style');uiStyle.textContent='button{min-height:28px;font:inherit;background:#eee;color:#111;border:1px solid #777;border-radius:3px;cursor:pointer}button:hover:not(:disabled){background:#ccc}button:active:not(:disabled){background:#aaa}button:disabled{opacity:.45;cursor:default}button:focus-visible,input:focus-visible,summary:focus-visible{outline:2px solid white;outline-offset:2px}';shadow.append(uiStyle);
  const refreshSettings=()=>{const selected=select.value;savedGroup.replaceChildren();for(const s of settings){const o=document.createElement('option');o.value='setting:'+s.id;o.textContent=s.name;o.title=s.savedAt;savedGroup.append(o);}select.value=selected;loadButton.disabled=!store||!selected.startsWith('setting:');updateMark();};
  const syncSettings=()=>{try{const result=store.list();settings=result.entries;refreshSettings();if(result.warnings.length)feedback.textContent='일부 저장 데이터가 손상되어 제외했습니다. 원본은 보존되어 있습니다.';}catch{feedback.textContent='브라우저 저장소에 접근할 수 없습니다.';details.open=true;}};
  storageFrame.addEventListener('load',()=>{try{favoriteStorage=storageFrame.contentWindow.localStorage;syncFavorites();}catch{updateMark();}store=storageFrame.contentWindow.pleosNamedSettings;if(!store){feedback.textContent='설정 저장소를 열지 못했습니다. 새로고침해 주세요.';details.open=true;return;}syncSettings();button.disabled=false;});
  button.disabled=true;
  window.addEventListener('focus',()=>{if(store)syncSettings();if(favoriteStorage)syncFavorites();});
  window.addEventListener('storage',()=>{if(store)syncSettings();if(favoriteStorage)syncFavorites();});
  const applySetting=()=>{
    if(!store)return;
    syncSettings();const entry=settings.find(s=>'setting:'+s.id===select.value);
    try{if(!entry)throw Error();const api=window.__pleosOptical;if(!api?.inspect().ready){feedback.textContent='화면 준비가 끝난 뒤 다시 불러오세요.';details.open=true;return;}api.set(entry.state);feedback.textContent=`${entry.name} 설정을 불러왔습니다.`;}
    catch{feedback.textContent='설정을 적용하지 못했습니다. 원본 설정은 유지됩니다.';}
    details.open=true;
  };
  loadButton.addEventListener('click',applySetting);
  form.addEventListener('submit',event=>{
    event.preventDefault();const name=input.value.trim();if(!name)return;
    const api=window.__pleosOptical;if(!api){feedback.textContent='이 버전은 설정 저장을 지원하지 않습니다.';return;}
    const entry={id:crypto.randomUUID(),name,savedAt:new Date().toISOString(),sourceVersion:active??'current',state:api.inspect().state};
    try{settings=store.save(entry).entries;refreshSettings();select.value='setting:'+entry.id;updateMark();loadButton.disabled=false;input.value='';feedback.textContent='현재 전체 설정을 저장했습니다.';}catch{feedback.textContent='저장하지 못했습니다. 저장소 손상 또는 용량·권한을 확인하세요. 기존 데이터는 유지됩니다.';}
  });
  const select = shadow.querySelector('select'), status = shadow.querySelector('small');
  document.body.append(storageFrame);
  select.disabled = true;
  fetch(new URL('version-catalog.json',base)).then(r=>{if(!r.ok)throw Error();return r.json()}).then(versions=>{
    for(const v of versions){const option=document.createElement('option');option.value=v.id;option.textContent=v.label;option.title=v.note;select.append(option);}
    // Root has no version id. Missing routeId must not match missing active:
    // otherwise a legacy catalog entry labels the current app as an archive.
    const activeVersion=active ? versions.find(v=>v.id===active||v.routeId===active) : undefined;
    select.value=activeVersion?.id??(!active&&currentLook==='coex-gate'?gateLive:!active&&currentLook==='hybrid-axis-split'?splitLive:!active&&currentLook==='hybrid-ab'?hybridLive:'');select.disabled=false;
    versionOptions=[...select.querySelectorAll('option')];regroupVersions();
    refreshSettings();select.append(savedGroup);
    status.textContent=activeVersion?.note??(select.value===splitLive?'축 면 분리 · 별도 시안 · 현재 조정안은 유지됩니다.':select.value===hybridLive?'A/B 통합안 · 현재 조정 · 별도 설정으로 저장됩니다.':'현재 작업본 · 버전 선택 시 페이지가 전환됩니다.');
    select.addEventListener('change',()=>{
      updateMark();
      if(select.value.startsWith('setting:')){loadButton.disabled=!store;applySetting();return;}
      const target=versions.find(v=>v.id===select.value);
      const destination=target?new URL(`versions/${target.routeId??target.id}/index.html`,base):new URL(base);
      if(target?.sequence==='pleos25'||(!target&&new URLSearchParams(location.search).get('sequence')==='pleos25'))destination.searchParams.set('sequence','pleos25');
      if(target?.transition==='layered'||(!target&&new URLSearchParams(location.search).get('transition')==='layered'))destination.searchParams.set('transition','layered');
      if(select.value===hybridLive)destination.searchParams.set('look','hybrid-ab');
      else if(select.value===gateLive){destination.searchParams.set('look','coex-gate');destination.searchParams.delete('sequence');destination.searchParams.delete('transition');}
      else if(select.value===splitLive)destination.searchParams.set('look','hybrid-axis-split');
      else if(['cube0914','hybrid-ab','hybrid-axis-split','coex-gate'].includes(target?.look))destination.searchParams.set('look',target.look);
      location.assign(destination);
    });
  }).catch(()=>{status.textContent='버전 목록을 불러오지 못했습니다.';status.style.display='block';});
})();
