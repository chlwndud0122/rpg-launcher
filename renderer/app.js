const $ = id => document.getElementById(id);
const api = window.launcher;
const AVATAR_PLACEHOLDER = document.getElementById('avatar').getAttribute('src');

let account = null;
let busy = false;
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
  if (s.started) setStatus('게임이 실행됐어요. 즐거운 모험 되세요!', 1);
});

api.onGameClosed(({ crashed }) => {
  busy = false;
  render();
  if (crashed) {
    setStatus('게임이 비정상 종료됐어요', 0);
    toast('게임이 갑자기 꺼졌어요. 다시 시작해 보고, 계속 그러면 "게임 폴더 열기"의 launcher-log.txt를 서버 관리자에게 보내주세요.');
  } else {
    setStatus('준비됐어요', 0);
  }
});

function showUpdate(version) {
  const b = $('btn-update');
  b.textContent = `새 버전(${version}) 준비됨 · 눌러서 적용`;
  b.hidden = false;
}
api.onUpdateReady(({ version }) => showUpdate(version));
$('btn-update').addEventListener('click', async () => {
  const ok = await api.installUpdate();
  if (!ok) toast('게임을 끈 다음에 업데이트할 수 있어요. 런처를 닫으면 자동으로 적용돼요.', 'info');
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
    const { config, account: acc, updateReady } = await api.init();
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
