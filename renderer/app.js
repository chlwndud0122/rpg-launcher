const $ = id => document.getElementById(id);
const api = window.launcher;
const AVATAR_PLACEHOLDER = document.getElementById('avatar').getAttribute('src');

let account = null;
let busy = false;
let gameRunning = false;
let toastTimer;

function toast(msg, kind = 'error') {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast' + (kind === 'info' ? ' info' : '');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 7000);
}

function setStatus(text, progress) {
  $('status-text').textContent = text;
  const fill = $('bar-fill');
  if (progress == null) {
    fill.classList.add('indeterminate');
  } else {
    fill.classList.remove('indeterminate');
    fill.style.width = Math.round(Math.max(0, Math.min(1, progress)) * 100) + '%';
  }
}

function render() {
  const play = $('btn-play');
  const label = $('play-label');
  if (account) {
    $('account-label').textContent = '로그인됨';
    $('account-name').textContent = account.name;
    $('avatar').src = `https://mc-heads.net/avatar/${account.uuid}/96`;
    $('avatar').onerror = () => ($('avatar').src = AVATAR_PLACEHOLDER);
    $('btn-logout').hidden = false;
    play.classList.remove('login');
    label.textContent = busy ? '실행 중…' : '게임 시작';
  } else {
    $('account-label').textContent = '계정';
    $('account-name').textContent = '로그인이 필요해요';
    $('avatar').src = AVATAR_PLACEHOLDER;
    $('btn-logout').hidden = true;
    play.classList.add('login');
    label.textContent = busy ? '로그인 중…' : '마이크로소프트 로그인';
  }
  play.disabled = busy;
  $('btn-logout').disabled = busy;
}

async function onPlayClick() {
  if (busy) return;
  if (!account) {
    busy = true; render();
    setStatus('로그인 창에서 마이크로소프트 계정으로 로그인해 주세요', null);
    const r = await api.login();
    busy = false;
    if (r.ok) {
      account = r.account;
      setStatus(`${account.name}님, 환영해요! 게임 시작을 눌러주세요`, 0);
      toast(`${account.name}님으로 로그인했어요.`, 'info');
    } else {
      setStatus('준비됐어요', 0);
      if (r.error) toast(r.error);
    }
    render();
    return;
  }

  busy = true; render();
  setStatus('준비 중…', null);
  const r = await api.play();
  if (!r.ok) {
    busy = false;
    setStatus('준비됐어요', 0);
    if (r.relogin) account = null;
    toast(r.error);
    render();
  }
}

api.onProgress(s => {
  setStatus(s.step, s.progress);
  if (s.started) {
    gameRunning = true;
    setStatus('게임이 실행됐어요. 즐거운 모험 되세요!', 1);
  }
});

api.onGameClosed(({ crashed }) => {
  busy = false;
  gameRunning = false;
  if (updateVersion) openUpdateDialog();
  render();
  if (crashed) {
    setStatus('게임이 비정상 종료됐어요', 0);
    toast('게임이 갑자기 꺼졌어요. 다시 시작해 보고, 계속 그러면 설정 → "게임 파일 복구"를 눌러보세요.');
  } else {
    setStatus('준비됐어요', 0);
  }
});

// ---------- update prompt ----------
let updateVersion = null;
function showUpdate(version) {
  updateVersion = version;
  const b = $('btn-update');
  b.textContent = `새 버전(${version}) 준비됨 · 눌러서 적용`;
  b.hidden = false;
  openUpdateDialog();
}
function openUpdateDialog() {
  $('update-title').textContent = `새 버전(${updateVersion})이 준비됐어요`;
  $('update-text').textContent = gameRunning
    ? '게임을 끈 다음 업데이트할 수 있어요. 런처를 닫아도 자동으로 적용돼요.'
    : '지금 업데이트하면 런처가 잠깐 꺼졌다가 다시 켜져요. 몇 초면 끝나요.';
  $('update-now').disabled = gameRunning;
  $('update-dialog').hidden = false;
  $(gameRunning ? 'update-later' : 'update-now').focus();
}
api.onUpdateReady(({ version }) => showUpdate(version));
$('btn-update').addEventListener('click', openUpdateDialog);
$('update-later').addEventListener('click', () => ($('update-dialog').hidden = true));
$('update-now').addEventListener('click', async () => {
  $('update-now').disabled = true;
  $('update-text').textContent = '업데이트를 적용하는 중이에요…';
  const ok = await api.installUpdate();
  if (!ok) {
    $('update-dialog').hidden = true;
    toast('게임을 끈 다음에 업데이트할 수 있어요. 런처를 닫으면 자동으로 적용돼요.', 'info');
  }
});

// ---------- settings ----------
let settingsInfo = null;
function renderMemory() {
  const auto = $('mem-auto').checked;
  const r = $('mem-range');
  r.disabled = auto;
  const gb = auto ? settingsInfo.autoGB : Number(r.value);
  $('mem-value').textContent = auto ? `자동 (${settingsInfo.autoGB}GB)` : `${gb}GB`;
  const hint = $('mem-hint');
  if (!auto && gb > settingsInfo.totalGB * 0.6) {
    hint.textContent = `컴퓨터 전체 램(${settingsInfo.totalGB}GB)에 비해 많아요. 다른 프로그램이 느려질 수 있어요.`;
    hint.className = 'hint warn';
  } else {
    hint.textContent = `이 컴퓨터의 램은 ${settingsInfo.totalGB}GB예요. 보통 4~6GB면 충분해요.`;
    hint.className = 'hint';
  }
}
async function openSettings() {
  settingsInfo = await api.getSettings();
  const r = $('mem-range');
  r.max = settingsInfo.maxGB;
  $('mem-max').textContent = settingsInfo.maxGB + 'GB';
  const auto = settingsInfo.memoryGB === 'auto';
  $('mem-auto').checked = auto;
  r.value = auto ? settingsInfo.autoGB : settingsInfo.memoryGB;
  $('btn-repair').disabled = gameRunning;
  renderMemory();
  $('settings-dialog').hidden = false;
  $('settings-cancel').focus();
}
$('mem-auto').addEventListener('change', renderMemory);
$('mem-range').addEventListener('input', renderMemory);
$('btn-settings').addEventListener('click', openSettings);
$('settings-cancel').addEventListener('click', () => ($('settings-dialog').hidden = true));
$('settings-save').addEventListener('click', async () => {
  const memoryGB = $('mem-auto').checked ? 'auto' : Number($('mem-range').value);
  await api.setSettings({ memoryGB });
  $('settings-dialog').hidden = true;
  toast('설정을 저장했어요. 다음 게임 실행부터 적용돼요.', 'info');
});
$('btn-repair').addEventListener('click', async () => {
  const b = $('btn-repair');
  b.disabled = true;
  b.textContent = '복구 중…';
  const r = await api.repair();
  b.textContent = '게임 파일 복구';
  b.disabled = false;
  if (r.ok) {
    $('settings-dialog').hidden = true;
    setStatus('복구 준비 완료 · 게임 시작을 누르면 파일을 다시 받아요', 0);
    toast('게임 파일을 정리했어요. 게임 시작을 누르면 다시 받아요(1~2분).', 'info');
  } else {
    toast(r.error);
  }
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  $('settings-dialog').hidden = true;
  $('update-dialog').hidden = true;
});

$('btn-play').addEventListener('click', onPlayClick);
$('btn-logout').addEventListener('click', async () => {
  await api.logout();
  account = null;
  setStatus('로그아웃했어요', 0);
  render();
});
$('btn-folder').addEventListener('click', () => api.openFolder());
$('btn-min').addEventListener('click', () => api.minimize());
$('btn-close').addEventListener('click', () => api.close());

(async () => {
  busy = true; render();
  setStatus('불러오는 중…', null);
  try {
    const { config, account: acc, updateReady, version } = await api.init();
    $('app-version').textContent = '주영런처 v' + version;
    if (updateReady) showUpdate(updateReady);
    $('server-name').textContent = config.serverName;
    $('subtitle').textContent = config.subtitle || '';
    $('version-badge').textContent = `Java Edition ${config.minecraftVersion}`;
    const chip = $('server-chip');
    if (config.serverAddress) {
      $('server-text').textContent = `게임 시작 시 ${config.serverAddress} 에 자동 접속`;
      chip.classList.add('ready');
    } else {
      $('server-text').textContent = '서버 준비 중 · 지금은 게임만 실행돼요';
    }
    account = acc;
    setStatus(account ? `${account.name}님, 준비됐어요` : '마이크로소프트 계정으로 로그인해 주세요', 0);
  } catch (e) {
    setStatus('불러오기에 실패했어요. 인터넷 연결을 확인해 주세요', 0);
  }
  busy = false;
  render();
})();
