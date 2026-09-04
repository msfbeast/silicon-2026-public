'use strict';
window.SiliconResearch = (() => {
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safe = v => {try {const u=new URL(v);return u.protocol==='https:'?u.href:'#';}catch{return '#';}};
  const state = {query:'',chip:'All',type:'All',page:1,selected:new Set(),scale:12};
  const external=(url,label)=>`<a href="${esc(safe(url))}" target="_blank" rel="noopener noreferrer">${esc(label)} ↗</a>`;
  const normalizeTitle=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/([a-z])([0-9])/g,'$1 $2').replace(/([0-9])([a-z])/g,'$1 $2').replace(/[^a-z0-9]+/g,' ').trim();
  function titleMentions(title,chips){
    const text=` ${normalizeTitle(title)} `;
    return chips.filter(chip=>{
      const full=chip.name.replace(/\([^)]*\)/g,'').trim();
      const aliases=[full];
      if(full.toLowerCase().startsWith(chip.vendor.toLowerCase()+' '))aliases.push(full.slice(chip.vendor.length+1));
      if(/\d/.test(chip.id))aliases.push(chip.id);
      for(const match of chip.name.matchAll(/\(([a-z0-9-]+)\)/gi))if(/\d/.test(match[1]))aliases.push(match[1]);
      return aliases.some(alias=>{const normalized=normalizeTitle(alias);return normalized.length>=3&&text.includes(` ${normalized} `);});
    }).map(chip=>({id:chip.id,name:chip.name}));
  }
  function reportStatus(chip,source){
    if(/previous|baseline/i.test(source.kind))return null;
    if(/conflict/i.test(source.kind))return 'Conflict';
    if(/leak/i.test(source.kind))return 'Rumor';
    if(/engineering/i.test(source.kind))return 'Engineering';
    if(['Engineering','Rumor','Expected'].includes(chip.status)){
      if(/physical|die/i.test(source.kind)&&chip.status!=='Engineering')return null;
      return chip.status;
    }
    return null;
  }
  function reportDate(value){const parsed=new Date(value);return !value||Number.isNaN(parsed.getTime())?'Date not recorded':parsed.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'});}
  function filterLeaks(records,filter){return records.filter(r=>(filter.chip==='All'||r.chip===filter.chip||r.mentions?.some(c=>c.id===filter.chip))&&(filter.type==='All'||r.status===filter.type)&&`${r.title} ${r.chip_name} ${r.summary} ${r.source} ${(r.mentions||[]).map(c=>c.name).join(' ')}`.toLowerCase().includes(filter.query.toLowerCase()));}
  function pageRecords(rows,requested,size=25){
    if(!Number.isInteger(size)||size<1)throw new Error('Invalid page size');
    const pages=Math.max(1,Math.ceil(rows.length/size));
    const page=Math.min(pages,Math.max(1,Number.isFinite(requested)?Math.floor(requested):1));
    const start=(page-1)*size;
    return {items:rows.slice(start,start+size),page,pages,start:rows.length?start+1:0,end:Math.min(start+size,rows.length),total:rows.length};
  }
  function collectionHealth(health,currentTime=Date.now()){
    const timestamp=Date.parse(health?.last_attempt);
    if(!Number.isFinite(timestamp))return {level:'unknown',text:'Collection history unavailable. Freshness has not been verified.'};
    const elapsed=currentTime-timestamp;
    const successes=health.successful_sources,failures=health.failed_sources;
    const counts=Number.isInteger(successes)&&successes>=0&&Number.isInteger(failures)&&failures>=0;
    const when=new Date(timestamp).toLocaleString('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'UTC'})+' UTC';
    const detail=counts?`${successes} sources succeeded; ${failures} failed.`:'Source counts unavailable.';
    if(elapsed < -300000)return {level:'warning',text:`Collection timestamp is ahead of this device's clock. ${detail}`};
    if(elapsed>86400000)return {level:'warning',text:`Collection is over 24 hours old. Last attempt: ${when}. ${detail}`};
    return {level:!counts?'unknown':failures||successes===0?'warning':'ok',text:`Last collection attempt: ${when}. ${detail} Discovery does not verify chip specifications.`};
  }
  function leakRecords(data) {
    const records=[];
    for(const chip of data.chips) {
      for(const [index,source] of chip.sources.entries()) {
        const status=reportStatus(chip,source);if(!status)continue;
        records.push({id:`${chip.id}-${index}`,chip:chip.id,chip_name:chip.name,title:source.label,url:source.url,source:source.kind,date:chip.date,date_kind:'Record date',status,product_status:chip.status,summary:chip.caveat,origin:'Research archive'});
      }
    }
    for(const item of window.SILICON_DISCOVERY||[]){
      const published=Number.isFinite(Date.parse(item.published))?item.published:'';
      records.push({...item,status:'Unreviewed discovery',chip:'discovery',chip_name:'Source discovery',mentions:titleMentions(item.title,data.chips),date:published||item.discovered_at,date_kind:published?'Reported publication':'Discovered',summary:'Not yet reviewed. This link has not changed canonical chip specifications.',origin:'Discovery feed'});
    }
    return records.sort((a,b)=>(Date.parse(b.date)||0)-(Date.parse(a.date)||0));
  }
  function renderLeaks(root,data) {
    const records=leakRecords(data),health=collectionHealth(window.SILICON_COLLECTION_HEALTH);
    root.innerHTML=`<div class="collection-health ${health.level}" role="status">${esc(health.text)}</div><p class="notice">Reports, not retail specifications. Archive dates are record dates, not necessarily publication dates. Newly discovered links are unreviewed and never automatically become confirmed facts. Title matches help find reports but do not establish chip identity or corroboration. Coverage is limited to configured sources, not every leak on the internet.</p><div class="search"><span aria-hidden="true">⌕</span><input id="leakSearch" placeholder="Search a chip, source, or claim…" aria-label="Search leak reports" value="${esc(state.query)}"></div><div class="filters"><select id="leakChip" aria-label="Filter leaks by chip"><option value="All">All chips</option>${data.chips.filter(c=>records.some(r=>r.chip===c.id||r.mentions?.some(m=>m.id===c.id))).map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}<option value="discovery">New discoveries</option></select><select id="leakType" aria-label="Filter leak evidence"><option value="All">All evidence types</option><option>Engineering</option><option>Rumor</option><option>Expected</option><option>Conflict</option><option>Unreviewed discovery</option></select><span class="count" id="leakCount" aria-live="polite"></span></div><nav class="feed-pagination" aria-label="Report pages"><button class="button" id="leakPrev">← Previous</button><span id="leakPage" aria-live="polite"></span><button class="button" id="leakNext">Next →</button></nav><div id="leakList"></div>`;
    const list=root.querySelector('#leakList');
    function results(){const rows=filterLeaks(records,state),page=pageRecords(rows,state.page);state.page=page.page;root.querySelector('#leakPage').textContent=`${page.start}–${page.end} of ${page.total} · Page ${page.page} / ${page.pages}`;root.querySelector('#leakPrev').disabled=page.page===1;root.querySelector('#leakNext').disabled=page.page===page.pages;root.querySelector('#leakCount').textContent=`${rows.length} reports`;list.innerHTML=rows.length?page.items.map(r=>`<article class="leak-row"><div class="leak-date">${esc(r.date_kind)}<br>${esc(reportDate(r.date))}</div><div><div class="rail-label">${esc(r.chip_name)} · ${esc(r.status)}</div><h2>${external(r.url,r.title)}</h2><p>${esc(r.summary)}</p>${r.mentions?.length?`<p class="small muted">Title mentions: ${r.mentions.map(c=>`<a href="#chip/${encodeURIComponent(c.id)}">${esc(c.name)} ↗</a>`).join(' · ')}</p>`:''}<div class="muted small">${esc(r.origin)} · ${esc(r.source)} ${r.product_status?`· Product status: ${esc(r.product_status)}`:''} ${r.chip!=='discovery'?`· <a href="#chip/${encodeURIComponent(r.chip)}">Chip dossier ↗</a>`:''}</div></div></article>`).join(''):'<div class="empty"><h2>No matching reports.</h2><p>Change the filters or search terms.</p></div>';}
    root.querySelector('#leakPrev').onclick=()=>{state.page--;results();};root.querySelector('#leakNext').onclick=()=>{state.page++;results();};
    const search=root.querySelector('#leakSearch');search.oninput=e=>{state.query=e.target.value;state.page=1;results();};
    for(const [id,key] of [['leakChip','chip'],['leakType','type']]){const input=root.querySelector('#'+id);input.value=state[key];input.onchange=e=>{state[key]=e.target.value;state.page=1;results();};}results();
  }
  function measurements(data){return data.dies.map((d,index)=>{const values=d.dims.match(/[\d.]+/g)?.map(Number)||[];return {...d,id:String(index),width:values[0],height:values[1]};}).filter(d=>d.width>0&&d.height>0);}
  function comparisonLayout(records,scale){
    if(!Number.isFinite(scale)||scale<=0)throw new Error('Invalid comparison scale');
    let x=30;
    const items=records.map(d=>{
      if(!Number.isFinite(d.width)||!Number.isFinite(d.height)||d.width<=0||d.height<=0)throw new Error('Invalid die dimensions');
      const width=d.width*scale,height=d.height*scale;
      const item={...d,x,y:65,pixelWidth:width,pixelHeight:height};
      x+=Math.max(280,width,String(d.name).length*9)+30;
      return item;
    });
    return {items,width:Math.max(650,x),height:Math.max(260,65+Math.max(0,...items.map(d=>d.pixelHeight))+150)};
  }
  function comparisonSVG(records,scale){
    const layout=comparisonLayout(records,scale);
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}"><rect width="100%" height="100%" fill="#111310"/><text x="30" y="35" fill="#d9b183" font-family="sans-serif" font-size="18">Silicon 2026 · measured footprints · ${scale} px/mm</text>${layout.items.map(d=>`<rect x="${d.x}" y="${d.y}" width="${d.pixelWidth}" height="${d.pixelHeight}" fill="#292e23" stroke="#d9b183"/><text x="${d.x}" y="${d.y+d.pixelHeight+25}" fill="#eff0e6" font-size="14" font-family="monospace">${esc(d.name)}</text><text x="${d.x}" y="${d.y+d.pixelHeight+48}" fill="#a0a792" font-size="12" font-family="sans-serif">${esc(d.dims)} · ${Number(d.area).toFixed(2)} mm² reported</text><a href="${esc(safe(d.url))}"><text x="${d.x}" y="${d.y+d.pixelHeight+75}" fill="#d9b183" font-size="12" font-family="sans-serif">Original measurement source ↗</text></a>`).join('')}<text x="30" y="${layout.height-25}" fill="#a0a792" font-family="sans-serif" font-size="12">Footprints, not photographs. Imported dimensions. Die area is not a performance ranking.</text></svg>`;
  }
  function renderComposer(root,data){
    const records=[...measurements(data),...(window.SILICON_DIE_IMAGES||[])];if(!state.selected.size)records.slice(-3).forEach(d=>state.selected.add(d.id));
    root.innerHTML=`<p class="notice">Compare at one physical scale. Licensed historical photographs are shown where available; other chips use measured footprints. Dimensions are imported from the cited research and have not been independently remeasured. A compute tile is not an entire package.</p><div class="composer-controls"><div><h2>Select silicon</h2><div class="die-choices">${records.map(d=>`<label><input type="checkbox" data-die="${d.id}" ${state.selected.has(d.id)?'checked':''}> ${esc(d.name)}</label>`).join('')}</div></div><div><label for="dieScale">Scale <output id="scaleValue">${state.scale}</output> px/mm</label><input id="dieScale" type="range" min="5" max="30" step="1" value="${state.scale}"><button class="button primary" id="exportDies">Export comparison SVG ↓</button></div></div><div class="composer-canvas" id="dieCanvas"></div><p class="small muted">Equal px/mm on both axes. Footprint area is derived from the listed width and height; source-reported area can differ slightly due to rounding.</p><div class="sources-list">${records.map(d=>`<div class="measurement-reference">${external(d.url,d.name)}<span>${esc(d.dims)} · ${Number(d.area).toFixed(2)} mm² reported</span></div>`).join('')}</div><div id="dieGallery"></div>`;
    const canvas=root.querySelector('#dieCanvas');
    function draw(){const chosen=records.filter(d=>state.selected.has(d.id));canvas.innerHTML=chosen.length?chosen.map(d=>`<figure class="scaled-die"><div style="width:${d.width*state.scale}px;height:${d.height*state.scale}px" class="die-footprint">${d.image?`<img src="${esc(safe(d.image))}" alt="${esc(d.name)} die photograph" loading="lazy" referrerpolicy="no-referrer">`:`<span>${esc(d.name)}</span>`}</div><figcaption>${esc(d.name)}<small>${esc(d.dims)}<br>${Number(d.area).toFixed(2)} mm²</small></figcaption></figure>`).join(''):'<div class="empty">Select a chip to start your comparison.</div>';root.querySelector('#exportDies').disabled=!chosen.length;}
    root.querySelectorAll('[data-die]').forEach(el=>el.onchange=()=>{el.checked?state.selected.add(el.dataset.die):state.selected.delete(el.dataset.die);draw();});
    root.querySelector('#dieScale').oninput=e=>{state.scale=Number(e.target.value);root.querySelector('#scaleValue').textContent=state.scale;draw();};
    root.querySelector('#exportDies').onclick=()=>{const chosen=records.filter(d=>state.selected.has(d.id));const svg=comparisonSVG(chosen,state.scale);const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));const a=document.createElement('a');a.href=url;a.download='silicon-die-comparison.svg';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};draw();gallery(root.querySelector('#dieGallery'));
  }

  function gallery(root){
    const photos=[...(window.SILICON_DIE_IMAGES||[]),...(window.SILICON_DIE_REFERENCE_PHOTOS||[])];
    root.innerHTML='<h2 class="dialog-heading">Open die photography</h2><p class="muted">CC0 historical physical-silicon references. Only photographs with source-reported width and height appear in the shared-scale composer.</p><div class="die-photo-grid">'+photos.map(d=>`<figure><a href="${esc(safe(d.url))}" target="_blank" rel="noopener noreferrer"><img src="${esc(safe(d.image))}" alt="${esc(d.name)} die photograph" loading="lazy" referrerpolicy="no-referrer"></a><figcaption>${esc(d.name)}</figcaption><p>${esc(d.note)}</p>${d.dims&&Number.isFinite(d.area)?`<div class="number">${esc(d.dims)} · ${Number(d.area).toFixed(2)} mm²</div>`:'<div class="number">Unscaled visual reference</div>'}<p class="credit">Photograph: ${esc(d.author)} · Wikimedia Commons<br>${external(d.license_url,d.license)} · ${external(d.url,'Source & full resolution')}</p></figure>`).join('')+'</div>';
  }
  document.addEventListener('error',e=>{if(e.target.tagName==='IMG'&&e.target.closest('#dieGallery, #dieCanvas')){e.target.hidden=true;const p=document.createElement('p');p.className='photo-failure';p.textContent='Image host unavailable. Use the original source link to view this photograph.';e.target.parentElement.append(p);}},true);
  return {renderLeaks,renderComposer,leakRecords,measurements,comparisonLayout,comparisonSVG,titleMentions,filterLeaks,reportDate,pageRecords,collectionHealth};
})();
