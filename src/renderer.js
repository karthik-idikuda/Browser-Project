/* Simple tabbed webview + AI sidebar */

const omnibox = document.getElementById('omnibox');
const goBtn = document.getElementById('go');
const webview = document.getElementById('webview');
const tabs = document.getElementById('tabs');
const aiForm = document.getElementById('ai-form');
const aiInput = document.getElementById('ai-input');
const aiLog = document.getElementById('ai-log');
const auditBtn = document.getElementById('audit');
const importChromeBtn = document.getElementById('importChrome');
const exportBtn = document.getElementById('exportData');

let currentUrl = 'https://www.google.com';
let tabList = [{ id: Date.now(), title: 'Google', url: currentUrl }];

function renderTabs() {
  tabs.innerHTML = '';
  tabList.forEach((t, idx) => {
    const el = document.createElement('button');
    el.className = 'tab';
    el.textContent = t.title || t.url;
    el.onclick = () => {
      currentUrl = t.url;
      webview.src = currentUrl;
      updateOmnibox(currentUrl);
    };
    tabs.appendChild(el);
  });
}

function updateOmnibox(url) {
  omnibox.value = url;
}

function isProbablyUrl(input) {
  try {
    new URL(input);
    return true;
  } catch {
    return false;
  }
}

function navigate() {
  const q = omnibox.value.trim();
  if (!q) return;
  let target;
  if (isProbablyUrl(q) || q.startsWith('http')) {
    target = q.startsWith('http') ? q : `https://${q}`;
  } else {
    // Use our Google Search via RapidAPI for SERP data in sidebar and load google results in main
    target = `https://www.google.com/search?q=${encodeURIComponent(q)}`;
  }
  currentUrl = target;
  webview.src = target;
  const title = new URL(target).hostname;
  tabList.push({ id: Date.now() + Math.random(), title, url: target });
  renderTabs();
}

goBtn.addEventListener('click', navigate);
omnibox.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(); });

aiForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const text = aiInput.value.trim();
  if (!text) return;
  aiInput.value = '';
  addMsg('user', text);

  // Fetch current page context (best-effort)
  let contextSnippet = '';
  try {
    const url = webview.getURL ? webview.getURL() : webview.src;
    // Try to extract visible text content from the page (limited to 4000 chars)
    const pageText = await webview.executeJavaScript('document.body ? (document.title + "\n\n" + (document.body.innerText || "")).slice(0, 4000) : document.title', true);
    contextSnippet = `URL: ${url}\n\nPage: ${pageText || ''}`;
  } catch {}

  const messages = [
    { role: 'system', content: 'You are Nova, an AI copilot for web browsing. Be concise, cite relevant links from the user\'s current page when possible. Refuse dangerous actions. Never click or buy things without explicit confirmation.' },
    { role: 'user', content: `${text}\n\nContext: ${contextSnippet}` }
  ];
  try {
    const res = await window.nova.chat(messages);
    const choice = res.choices?.[0];
    const content = choice?.message?.content || JSON.stringify(res, null, 2);
    addMsg('assistant', content);

    // naive action plan extraction (protocol): ```plan{...}```
    const planMatch = /```plan\n([\s\S]*?)```/m.exec(content);
    if (planMatch) {
      const planJson = safeParse(planMatch[1]);
      if (planJson && Array.isArray(planJson.steps)) {
        const ok = confirm(`Review action plan for: ${planJson.goal || 'Unnamed'}\nSteps: ${planJson.steps.map(s=>s.action).join(', ')}\n\nRun in simulation mode?`);
        if (ok) {
          const execRes = await window.nova.executePlan(planJson, { simulate: true });
          addMsg('assistant', `Simulation result: ${JSON.stringify(execRes)}`);
          const runLive = confirm('Execute these steps on the current page now? You can cancel at any time.');
          if (runLive) {
            try {
              await executePlanInWebview(planJson);
              await window.nova.executePlan(planJson, { simulate: false }); // log to audit
              addMsg('assistant', 'Live execution completed.');
            } catch (e) {
              addMsg('assistant', `Live execution error: ${e.message}`);
            }
          }
        }
      }
    }
  } catch (err) {
    addMsg('assistant', `AI error: ${err.message}`);
  }
});

exportBtn.addEventListener('click', async () => {
  const res = await window.nova.exportData('bookmarks');
  const blob = new Blob([JSON.stringify(res.items || res, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'bookmarks.json';
  a.click();
  URL.revokeObjectURL(url);
});

function addMsg(role, text) {
  const div = document.createElement('div');
  div.className = 'msg';
  div.textContent = (role === 'user' ? 'You: ' : 'Nova: ') + text;
  aiLog.appendChild(div);
  aiLog.scrollTop = aiLog.scrollHeight;
}

renderTabs();
updateOmnibox(currentUrl);
auditBtn.addEventListener('click', async () => {
  const items = await window.nova.readAudit();
  alert(`Audit entries: ${items.length}`);
});

importChromeBtn.addEventListener('click', async () => {
  const profileDir = prompt('Enter Chrome profile directory path (e.g., ~/Library/Application Support/Google/Chrome/Default)');
  if (!profileDir) return;
  try {
    const bmRes = await window.nova.importChromeProfile(profileDir, 'bookmarks');
    const histRes = await window.nova.importChromeProfile(profileDir, 'history');
    alert(`Imported ${bmRes.imported} bookmarks and ${histRes.imported} history entries.`);
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  }
});

// Import bookmarks trigger from main menu
window.nova.onBookmarksFileSelected(async (filePath) => {
  try {
    const res = await window.nova.importBookmarksFilePath(filePath);
    alert(`Imported ${res.imported} bookmarks`);
  } catch (e) {
    alert(`Import failed: ${e.message}`);
  }
});

function safeParse(str){
  try{ return JSON.parse(str); }catch{ return null }
}

async function executePlanInWebview(plan){
  for (const step of plan.steps){
    const action = step.action;
    /* eslint-disable no-await-in-loop */
    if (action === 'navigate' && step.url){
      webview.loadURL(step.url);
      await waitForLoad();
    } else if (action === 'click' && step.selector){
      const ok = await webview.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(step.selector)}); if(!el) return false; el.click(); return true;})()`, true);
      if (!ok) throw new Error(`Selector not found: ${step.selector}`);
    } else if (action === 'type' && step.selector){
      const ok = await webview.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(step.selector)}); if(!el) return false; el.focus(); el.value=${JSON.stringify(step.value||'')}; el.dispatchEvent(new Event('input',{bubbles:true})); return true;})()`, true);
      if (!ok) throw new Error(`Selector not found: ${step.selector}`);
    } else if (action === 'submit' && step.selector){
      const ok = await webview.executeJavaScript(`(()=>{const el=document.querySelector(${JSON.stringify(step.selector)}); if(!el) return false; el.submit ? el.submit() : el.click(); return true;})()`, true);
      if (!ok) throw new Error(`Selector not found: ${step.selector}`);
    }
    /* eslint-enable no-await-in-loop */
  }
}

function waitForLoad(){
  return new Promise((resolve)=>{
    const done=()=>{ webview.removeEventListener('did-finish-load', done); resolve(); };
    webview.addEventListener('did-finish-load', done);
  });
}
