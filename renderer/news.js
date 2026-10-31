// 소식 칸 그리기: 제목만 보이고, 누르면 자세한 내용이 펼쳐져요. (details가 없는 소식은 한 줄로만 보여요)
// 아직 안 읽은 소식(자세한 내용이 있는 것)에는 작은 점이 붙고, 열어 보면 점이 사라져요.
(function () {
  const DEFAULT_NEWS = [{ date: '', text: '새 소식이 아직 없어요.' }];
  const KEY = 'newsRead';

  function readSet() {
    try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch { return new Set(); }
  }
  function saveSet(set) {
    try { localStorage.setItem(KEY, JSON.stringify([...set].slice(-60))); } catch {}
  }
  const idOf = n => (n.date || '') + '|' + n.text;

  /** 소식 목록을 그리고, 아직 안 읽은 소식 개수를 돌려줘요. */
  function renderNews(ul, list) {
    ul.replaceChildren();
    const items = Array.isArray(list) && list.length ? list : DEFAULT_NEWS;
    const read = readSet();
    let unread = 0;
    items.forEach((n, i) => {
      const li = document.createElement('li');
      const details = Array.isArray(n.details) ? n.details.filter(d => typeof d === 'string' && d) : [];
      const head = document.createElement(details.length ? 'button' : 'div');
      head.className = 'news-head';
      if (n.date) head.append(Object.assign(document.createElement('span'), { textContent: n.date }));
      head.append(document.createTextNode(n.text));
      li.append(head);
      if (details.length) {
        const id = idOf(n);
        const dot = document.createElement('i');
        dot.className = 'news-dot';
        dot.hidden = read.has(id);
        if (!dot.hidden) unread++;
        head.append(dot);
        const body = document.createElement('ul');
        body.className = 'news-body';
        for (const d of details) body.append(Object.assign(document.createElement('li'), { textContent: d }));
        body.hidden = i !== 0; // 가장 위(최신) 소식은 처음부터 펼쳐 둬요
        head.dataset.id = id;
        head.addEventListener('click', () => {
          body.hidden = !body.hidden;
          if (!body.hidden) markRead(head);
        });
        li.append(body);
      }
      ul.append(li);
    });
    return unread;
  }

  function markRead(head) {
    const set = readSet();
    set.add(head.dataset.id);
    saveSet(set);
    const dot = head.querySelector('.news-dot');
    if (dot) dot.hidden = true;
  }

  /** 소식 칸을 열었을 때 이미 펼쳐져 있는 소식은 읽은 걸로 쳐요. 남은 안 읽은 개수를 돌려줘요. */
  function markOpenRead(ul) {
    for (const li of ul.children) {
      const head = li.querySelector('button.news-head');
      const body = li.querySelector('.news-body');
      if (head && body && !body.hidden) markRead(head);
    }
    return ul.querySelectorAll('.news-dot:not([hidden])').length;
  }

  window.renderNewsList = renderNews;
  window.markNewsOpenRead = markOpenRead;
})();
