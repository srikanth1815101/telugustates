/* Classic script: the help page still explains an outdated system WebView even if the atlas cannot start. */
(function () {
  'use strict';
  var byId = function (n) { return document.getElementById(n); };
  var names = {village:'Timber acre', forest:'Canopy trail', lake:'Reservoir shallows', cliffs:'Escarpment walk'};
  window.showAtlasDevice = function (s) { byId('device').textContent = 'Field build 7.1.0 · ' + String(s); };
  if (typeof Object.hasOwn !== 'function' || typeof Array.prototype.at !== 'function' || !('noModule' in document.createElement('script'))) byId('old').hidden = false;
  // The old launcher forced Medium even on a slow device. Migrate that one render
  // preference once. Do not touch residents, readings, or subsequent user choices.
  try {if(!localStorage.getItem('atlas-stable-render-v1')){var pref=JSON.parse(localStorage.getItem('atlas-field-v5')||'{}')||{};pref.quality='auto';localStorage.setItem('atlas-field-v5',JSON.stringify(pref));localStorage.setItem('atlas-stable-render-v1','1');}}catch(e){}
  var buttons=document.querySelectorAll('[data-walker]');
  function choice(v){Array.prototype.forEach.call(buttons,function(b){b.setAttribute('aria-pressed',String(b.getAttribute('data-walker')===v));});}
  function restoreChoice(){try{var p=JSON.parse(localStorage.getItem('atlas-field-v5')||'{}')||{};choice(p.walker==='man'?'man':'woman');}catch(e){choice('woman');}}
  Array.prototype.forEach.call(buttons,function(b){b.addEventListener('click',function(){var v=b.getAttribute('data-walker');try{var p=JSON.parse(localStorage.getItem('atlas-field-v5')||'{}')||{};p.walker=v;localStorage.setItem('atlas-field-v5',JSON.stringify(p));}catch(e){}choice(v);});});restoreChoice();window.addEventListener('pageshow',restoreChoice);
  function showReadings() {
    var rows = []; try { var a = JSON.parse(localStorage.getItem('atlas-field-readings') || '[]'); if (Array.isArray(a)) rows = a.slice(-12).reverse(); } catch (e) {}
    var list = byId('logs'); list.textContent = '';
    rows.forEach(function (r) {
      if (!r || typeof r.fps !== 'number' || !isFinite(r.fps)) return;
      var li = document.createElement('li'), name = document.createElement('strong'), measure = document.createElement('span');
      name.textContent = Object.prototype.hasOwnProperty.call(names,r.site) ? names[r.site] : String(r.site || 'Walk');
      if(r.edition!=="7.1.0")name.textContent+=' (previous build)';
      measure.textContent = r.fps.toFixed(1) + ' FPS · ' + Math.round(r.seconds || 0) + ' s';
      li.appendChild(name); li.appendChild(measure); list.appendChild(li);
    });
    var has = list.children.length > 0;
    byId('empty').hidden = has; byId('share').hidden = !has; byId('share-note').hidden = !has;
  }
  showReadings(); window.addEventListener('pageshow', showReadings);
})();
