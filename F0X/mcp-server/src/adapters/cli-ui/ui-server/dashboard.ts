/**
 * Embedded dashboard HTML served by the local UI server.
 * All message content is rendered via textContent — no innerHTML from user data.
 * Client JS uses string concatenation throughout to avoid TypeScript template
 * literal conflicts with the enclosing backtick string.
 */

export const DASHBOARD_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>F0x Dashboard</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Courier New',monospace;background:#0d1117;color:#c9d1d9;height:100vh;display:flex;flex-direction:column;overflow:hidden}
#hdr{padding:8px 16px;background:#161b22;border-bottom:1px solid #30363d;display:flex;align-items:center;gap:16px;flex-shrink:0}
#hdr h1{font-size:13px;color:#58a6ff;letter-spacing:.05em}
#agent-badge{font-size:12px;color:#8b949e}
#main{display:flex;flex:1;overflow:hidden}
#sidebar{width:210px;background:#161b22;border-right:1px solid #30363d;display:flex;flex-direction:column;flex-shrink:0}
#sb-hdr{padding:8px 12px;font-size:11px;color:#8b949e;text-transform:uppercase;letter-spacing:.06em;border-bottom:1px solid #30363d;display:flex;justify-content:space-between;align-items:center}
#btn-nc{background:none;border:none;color:#58a6ff;font-size:20px;cursor:pointer;line-height:1;padding:0 2px}
#ch-list{flex:1;overflow-y:auto}
.ch-item{padding:8px 12px;cursor:pointer;border-bottom:1px solid #21262d}
.ch-item:hover{background:#1c2128}
.ch-item.active{background:#1c2128;border-left:3px solid #58a6ff;padding-left:9px}
.ch-peer{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ch-id{font-size:10px;color:#484f58;margin-top:2px}
#chat{flex:1;display:flex;flex-direction:column;overflow:hidden}
#no-ch{flex:1;display:flex;align-items:center;justify-content:center;color:#484f58;font-size:13px}
#ch-hdr{padding:8px 16px;background:#161b22;border-bottom:1px solid #30363d;font-size:13px;color:#8b949e;flex-shrink:0}
#msgs{flex:1;overflow-y:auto;padding:12px 16px;display:flex;flex-direction:column;gap:6px}
.msg{padding:8px 12px;border-radius:4px;max-width:78%;word-break:break-word}
.msg.mine{align-self:flex-end;background:#1a3a5c;border:1px solid #1f6feb}
.msg.theirs{align-self:flex-start;background:#1c2128;border:1px solid #30363d}
.msg-meta{font-size:10px;color:#484f58;margin-bottom:3px}
.msg-text{font-size:13px;white-space:pre-wrap;line-height:1.5}
.sig-warn{font-size:10px;color:#f85149;margin-top:3px}
#compose{padding:10px 16px;border-top:1px solid #30363d;background:#161b22;display:flex;gap:8px;flex-shrink:0}
#compose-in{flex:1;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:7px 11px;border-radius:4px;font-family:inherit;font-size:13px;resize:none;height:56px}
#compose-in:focus{outline:none;border-color:#58a6ff}
#btn-send{background:#1f6feb;color:#fff;border:none;padding:7px 14px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:13px;align-self:flex-end;white-space:nowrap}
#btn-send:hover{background:#388bfd}
#btn-send:disabled{background:#21262d;color:#484f58;cursor:default}
#ftr{padding:5px 16px;background:#161b22;border-top:1px solid #30363d;font-size:11px;color:#484f58;display:flex;gap:16px;flex-shrink:0}
.ok{color:#3fb950}
.err{color:#f85149}
/* Modal */
#mbk{display:none;position:fixed;inset:0;background:rgba(0,0,0,.65);align-items:center;justify-content:center;z-index:100}
#mbk.open{display:flex}
#mdl{background:#161b22;border:1px solid #30363d;border-radius:6px;padding:22px;width:340px}
#mdl h2{font-size:13px;color:#58a6ff;margin-bottom:14px}
#mdl input{width:100%;background:#0d1117;border:1px solid #30363d;color:#c9d1d9;padding:7px 11px;border-radius:4px;font-family:inherit;font-size:13px;margin-bottom:10px}
#mdl input:focus{outline:none;border-color:#58a6ff}
#mdl-err{color:#f85149;font-size:12px;margin-bottom:8px;display:none}
.mdl-btns{display:flex;gap:8px;justify-content:flex-end}
.btn-sec{background:#21262d;color:#c9d1d9;border:1px solid #30363d;padding:5px 13px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:13px}
.btn-pri{background:#1f6feb;color:#fff;border:none;padding:5px 13px;border-radius:4px;cursor:pointer;font-family:inherit;font-size:13px}
</style>
</head>
<body>

<div id="hdr">
  <h1>F0x</h1>
  <span id="agent-badge">loading...</span>
</div>

<div id="main">
  <div id="sidebar">
    <div id="sb-hdr">
      Channels
      <button id="btn-nc" title="Open new channel">+</button>
    </div>
    <div id="ch-list"></div>
  </div>
  <div id="chat">
    <div id="no-ch">Select a channel to start chatting</div>
  </div>
</div>

<div id="ftr">
  <span id="ftr-status">connecting...</span>
  <span id="ftr-id"></span>
  <span id="ftr-relay"></span>
</div>

<div id="mbk">
  <div id="mdl">
    <h2>Open Channel</h2>
    <input type="text" id="mdl-in" placeholder="Target agentId (UUID)">
    <div id="mdl-err"></div>
    <div class="mdl-btns">
      <button class="btn-sec" id="btn-cancel">Cancel</button>
      <button class="btn-pri" id="btn-open">Open</button>
    </div>
  </div>
</div>

<script>
(function() {
'use strict';

var currentChannelId = null;
var currentPeerLabel = null;
var pollTimer = null;
var lastMsgCount = 0;

// ── DOM helpers ───────────────────────────────────────────────────────────────
function mkEl(tag, cls) {
  var e = document.createElement(tag);
  if (cls) e.className = cls;
  return e;
}
function setText(el, t) { el.textContent = t; }

// ── API ───────────────────────────────────────────────────────────────────────
async function api(method, path, body) {
  var opts = { method: method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  var res = await fetch(path, opts);
  if (!res.ok) {
    var e = await res.json().catch(function() { return { error: 'HTTP ' + res.status }; });
    throw new Error(e.error || ('HTTP ' + res.status));
  }
  return res.json();
}

// ── Status ────────────────────────────────────────────────────────────────────
async function loadStatus() {
  try {
    var s = await api('GET', '/api/status');
    var badge = s.identity.label + ' (' + s.identity.agentId.slice(0, 8) + '...)';
    setText(document.getElementById('agent-badge'), badge);
    setText(document.getElementById('ftr-id'), 'id:' + s.identity.agentId);
    setText(document.getElementById('ftr-relay'), 'relay:' + s.relayUrl);
    var fst = document.getElementById('ftr-status');
    if (s.authenticated) {
      setText(fst, 'connected');
      fst.className = 'ok';
    } else {
      setText(fst, 'not authenticated');
      fst.className = 'err';
    }
  } catch (ex) {
    var fst2 = document.getElementById('ftr-status');
    setText(fst2, 'error: ' + ex.message);
    fst2.className = 'err';
  }
}

// ── Channels ──────────────────────────────────────────────────────────────────
async function loadChannels() {
  try {
    var channels = await api('GET', '/api/channels');
    renderChannels(channels);
  } catch (_) { /* silent */ }
}

function renderChannels(channels) {
  var list = document.getElementById('ch-list');
  list.innerHTML = '';
  channels.forEach(function(c) {
    var item = mkEl('div', 'ch-item' + (c.channelId === currentChannelId ? ' active' : ''));
    item.dataset.channelId = c.channelId;
    item.dataset.peerLabel = c.peerLabel;

    var peerEl = mkEl('div', 'ch-peer');
    setText(peerEl, c.peerLabel);

    var idEl = mkEl('div', 'ch-id');
    setText(idEl, c.channelId.slice(0, 18) + '...');

    item.appendChild(peerEl);
    item.appendChild(idEl);
    item.addEventListener('click', function() {
      selectChannel(c.channelId, c.peerLabel);
    });
    list.appendChild(item);
  });
}

// ── Chat ──────────────────────────────────────────────────────────────────────
function selectChannel(channelId, peerLabel) {
  currentChannelId = channelId;
  currentPeerLabel = peerLabel;
  lastMsgCount = 0;

  // Update active state in sidebar
  document.querySelectorAll('.ch-item').forEach(function(el) {
    el.classList.toggle('active', el.dataset.channelId === channelId);
  });

  // Rebuild chat panel
  var chat = document.getElementById('chat');
  chat.innerHTML = '';

  var hdr = mkEl('div', '');
  hdr.id = 'ch-hdr';
  setText(hdr, peerLabel);
  chat.appendChild(hdr);

  var msgs = mkEl('div', '');
  msgs.id = 'msgs';
  chat.appendChild(msgs);

  var compose = mkEl('div', '');
  compose.id = 'compose';

  var input = mkEl('textarea', '');
  input.id = 'compose-in';
  input.placeholder = 'Type a message... (Enter sends, Shift+Enter = newline)';
  compose.appendChild(input);

  var sendBtn = mkEl('button', '');
  sendBtn.id = 'btn-send';
  sendBtn.disabled = true;
  setText(sendBtn, 'Send');
  compose.appendChild(sendBtn);

  chat.appendChild(compose);

  input.addEventListener('input', function() {
    sendBtn.disabled = input.value.trim().length === 0;
  });
  input.addEventListener('keydown', function(ev) {
    if (ev.key === 'Enter' && !ev.shiftKey) {
      ev.preventDefault();
      if (!sendBtn.disabled) doSend();
    }
  });
  sendBtn.addEventListener('click', doSend);

  if (pollTimer) clearInterval(pollTimer);
  pollMessages();
  pollTimer = setInterval(pollMessages, 5000);
}

async function pollMessages() {
  if (!currentChannelId) return;
  try {
    var msgs = await api('GET', '/api/channels/' + encodeURIComponent(currentChannelId) + '/messages?limit=60');
    if (msgs.length !== lastMsgCount) {
      lastMsgCount = msgs.length;
      renderMessages(msgs);
    }
  } catch (_) { /* silent — next poll will retry */ }
}

function renderMessages(msgs) {
  var container = document.getElementById('msgs');
  if (!container) return;

  var atBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 60;
  container.innerHTML = '';

  msgs.forEach(function(m) {
    var wrap = mkEl('div', 'msg ' + (m.isMine ? 'mine' : 'theirs'));

    var meta = mkEl('div', 'msg-meta');
    var ts = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setText(meta, m.senderLabel + '  ' + ts);
    wrap.appendChild(meta);

    var body = mkEl('div', 'msg-text');
    setText(body, m.text);
    wrap.appendChild(body);

    if (!m.signatureValid) {
      var warn = mkEl('div', 'sig-warn');
      setText(warn, 'signature invalid — treat with caution');
      wrap.appendChild(warn);
    }

    container.appendChild(wrap);
  });

  if (atBottom) container.scrollTop = container.scrollHeight;
}

async function doSend() {
  var input = document.getElementById('compose-in');
  var btn = document.getElementById('btn-send');
  var t = input.value.trim();
  if (!t || !currentChannelId) return;

  btn.disabled = true;
  setText(btn, 'Sending...');

  try {
    await api('POST', '/api/channels/' + encodeURIComponent(currentChannelId) + '/messages', { text: t });
    input.value = '';
    setText(btn, 'Send');
    await pollMessages();
  } catch (ex) {
    alert('Send failed: ' + ex.message);
    setText(btn, 'Send');
    btn.disabled = false;
  }
}

// ── New channel modal ─────────────────────────────────────────────────────────
document.getElementById('btn-nc').addEventListener('click', function() {
  document.getElementById('mbk').className = 'open';
  var inp = document.getElementById('mdl-in');
  inp.value = '';
  var errEl = document.getElementById('mdl-err');
  errEl.style.display = 'none';
  inp.focus();
});

document.getElementById('btn-cancel').addEventListener('click', function() {
  document.getElementById('mbk').className = '';
});

document.getElementById('mbk').addEventListener('click', function(ev) {
  if (ev.target === document.getElementById('mbk')) {
    document.getElementById('mbk').className = '';
  }
});

document.getElementById('btn-open').addEventListener('click', doOpenChannel);
document.getElementById('mdl-in').addEventListener('keydown', function(ev) {
  if (ev.key === 'Enter') doOpenChannel();
});

async function doOpenChannel() {
  var agentId = document.getElementById('mdl-in').value.trim();
  var errEl = document.getElementById('mdl-err');
  errEl.style.display = 'none';

  if (!agentId) {
    setText(errEl, 'agentId is required');
    errEl.style.display = 'block';
    return;
  }

  var btn = document.getElementById('btn-open');
  setText(btn, 'Opening...');
  btn.disabled = true;

  try {
    var result = await api('POST', '/api/channels', { targetAgentId: agentId });
    document.getElementById('mbk').className = '';
    await loadChannels();
    selectChannel(result.channelId, result.peerLabel);
  } catch (ex) {
    setText(errEl, ex.message);
    errEl.style.display = 'block';
  } finally {
    setText(btn, 'Open');
    btn.disabled = false;
  }
}

// ── Boot ──────────────────────────────────────────────────────────────────────
loadStatus();
loadChannels();

})();
</script>
</body>
</html>`;
