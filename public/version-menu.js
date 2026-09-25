(() => {
  const base = new URL('.', document.currentScript.src);
  const active = location.pathname.match(/\/versions\/([^/]+)\//)?.[1];
  const hybridLive = 'live:hybrid-ab';
  const currentLook = new URLSearchParams(location.search).get('look');
  const host = document.createElement('aside');
  host.style.cssText = 'position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:10000;max-width:38vw';
  const shadow = host.attachShadow({mode:'open'});
  shadow.innerHTML = `<style>:host{font:12px system-ui;color:#eee}select{width:100%;height:32px;background:#18191b;color:#eee;border:1px solid #777;border-radius:4px;padding:0 8px;font:inherit}select:focus-visible{outline:2px solid #fff;outline-offset:2px}select:hover{background:#26272a}small{display:none;background:#18191b;padding:8px;line-height:1.5} :host(:focus-within) small{display:block}</style><select aria-label="날짜별 사이트 버전"><option value="">현재 작업본</option><option value="${hybridLive}">A/B 통합안 · 현재 조정</option></select><small role="status"></small>`;
  document.body.append(host);
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
  const refreshSettings=()=>{const selected=select.value;savedGroup.replaceChildren();for(const s of settings){const o=document.createElement('option');o.value='setting:'+s.id;o.textContent=s.name;o.title=s.savedAt;savedGroup.append(o);}select.value=selected;loadButton.disabled=!store||!selected.startsWith('setting:');};
  const syncSettings=()=>{try{const result=store.list();settings=result.entries;refreshSettings();if(result.warnings.length)feedback.textContent='일부 저장 데이터가 손상되어 제외했습니다. 원본은 보존되어 있습니다.';}catch{feedback.textContent='브라우저 저장소에 접근할 수 없습니다.';details.open=true;}};
  storageFrame.addEventListener('load',()=>{store=storageFrame.contentWindow.pleosNamedSettings;if(!store){feedback.textContent='설정 저장소를 열지 못했습니다. 새로고침해 주세요.';details.open=true;return;}syncSettings();button.disabled=false;});
  button.disabled=true;
  window.addEventListener('focus',()=>{if(store)syncSettings();});
  window.addEventListener('storage',()=>{if(store)syncSettings();});
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
    try{settings=store.save(entry).entries;refreshSettings();select.value='setting:'+entry.id;loadButton.disabled=false;input.value='';feedback.textContent='현재 전체 설정을 저장했습니다.';}catch{feedback.textContent='저장하지 못했습니다. 저장소 손상 또는 용량·권한을 확인하세요. 기존 데이터는 유지됩니다.';}
  });
  const select = shadow.querySelector('select'), status = shadow.querySelector('small');
  document.body.append(storageFrame);
  select.disabled = true;
  fetch(new URL('version-catalog.json',base)).then(r=>{if(!r.ok)throw Error();return r.json()}).then(versions=>{
    for(const v of versions){const option=document.createElement('option');option.value=v.id;option.textContent=v.label;option.title=v.note;select.append(option);}
    // Root has no version id. Missing routeId must not match missing active:
    // otherwise a legacy catalog entry labels the current app as an archive.
    const activeVersion=active ? versions.find(v=>v.id===active||v.routeId===active) : undefined;
    select.value=activeVersion?.id??(!active&&currentLook==='hybrid-ab'?hybridLive:'');select.disabled=false;
    refreshSettings();select.append(savedGroup);
    status.textContent=activeVersion?.note??(select.value===hybridLive?'A/B 통합안 · 현재 조정 · 별도 설정으로 저장됩니다.':'현재 작업본 · 버전 선택 시 페이지가 전환됩니다.');
    select.addEventListener('change',()=>{
      if(select.value.startsWith('setting:')){loadButton.disabled=!store;applySetting();return;}
      const target=versions.find(v=>v.id===select.value);
      const destination=target?new URL(`versions/${target.routeId??target.id}/index.html`,base):new URL(base);
      if(target?.sequence==='pleos25'||(!target&&new URLSearchParams(location.search).get('sequence')==='pleos25'))destination.searchParams.set('sequence','pleos25');
      if(target?.transition==='layered'||(!target&&new URLSearchParams(location.search).get('transition')==='layered'))destination.searchParams.set('transition','layered');
      if(select.value===hybridLive)destination.searchParams.set('look','hybrid-ab');
      else if(target?.look==='cube0914'||target?.look==='hybrid-ab')destination.searchParams.set('look',target.look);
      location.assign(destination);
    });
  }).catch(()=>{status.textContent='버전 목록을 불러오지 못했습니다.';status.style.display='block';});
})();
