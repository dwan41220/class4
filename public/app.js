/* ── SMART WORKSHEET HUB — Frontend App ── */

const API = '';
let token = localStorage.getItem('token');
let adminToken = localStorage.getItem('adminToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let currentPage = 'upload';
let authMode = 'check'; // check → activate → login
let authUserActivated = false;
let isUploading = false;

// 열품타 globals
let timerSocket = null;
let timerInterval = null;
let timerStudying = false;
let timerSessionStart = null;

// ─── HELPERS ───
function togglePw(inputId, btn) {
  const input = document.getElementById(inputId);
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = 'hide';
    btn.classList.add('visible');
  } else {
    input.type = 'password';
    btn.textContent = 'show';
    btn.classList.remove('visible');
  }
}

function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const t = opts.admin ? adminToken : token;
  if (t) headers['Authorization'] = `Bearer ${t}`;
  if (!(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  return fetch(API + path, {
    ...opts,
    headers,
    body: opts.body instanceof FormData ? opts.body : (opts.body ? JSON.stringify(opts.body) : undefined),
  }).then(async r => {
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || '오류가 발생했습니다.');
    return data;
  });
}

function toast(msg, type = 'info') {
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => { el.style.animation = 'fadeOut .3s ease forwards'; setTimeout(() => el.remove(), 300); }, 3000);
}

function $(id) { return document.getElementById(id); }
function show(id) { $(id)?.classList.remove('hidden'); }
function hide(id) { $(id)?.classList.add('hidden'); }
function formatDate(d) { return new Date(d).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }); }

// ─── AUTH ───
function switchAuthTab(tab) {
  document.querySelectorAll('.auth-tab').forEach((el, i) => {
    el.classList.toggle('active', (tab === 'user' && i === 0) || (tab === 'admin' && i === 1));
  });
  if (tab === 'user') { show('user-auth-form'); hide('admin-auth-form'); }
  else { hide('user-auth-form'); show('admin-auth-form'); checkAdminStatus(); }
}

async function checkAdminStatus() {
  try {
    const data = await api('/api/auth/admin-status');
    $('admin-status-msg').textContent = data.isSetup
      ? '관리자 계정이 설정되어 있습니다. 로그인하세요.'
      : '관리자 계정이 아직 없습니다. 지금 설정하세요!';
  } catch (e) { $('admin-status-msg').textContent = '서버 연결 실패'; }
}

async function handleUserAuth() {
  const username = $('auth-username').value.trim();
  if (!username) return toast('계정 이름을 입력하세요.', 'error');

  if (authMode === 'check') {
    try {
      const data = await api(`/api/auth/check/${encodeURIComponent(username)}`);
      if (!data.exists) return toast('존재하지 않는 계정입니다. 관리자에게 문의하세요.', 'error');
      authUserActivated = data.isActivated;
      show('password-section');
      if (!data.isActivated) {
        $('password-label').textContent = '새 비밀번호 설정';
        show('password-confirm-group');
        $('auth-next-btn').textContent = '비밀번호 설정';
        authMode = 'activate';
      } else {
        $('password-label').textContent = '비밀번호';
        hide('password-confirm-group');
        $('auth-next-btn').textContent = '로그인';
        authMode = 'login';
      }
      $('auth-username').readOnly = true;
      $('auth-password').focus();
    } catch (e) { toast(e.message, 'error'); }
  } else if (authMode === 'activate') {
    const pw = $('auth-password').value;
    const pw2 = $('auth-password-confirm').value;
    if (!pw) return toast('비밀번호를 입력하세요.', 'error');
    if (pw.length < 4) return toast('비밀번호는 4자 이상이어야 합니다.', 'error');
    if (pw !== pw2) return toast('비밀번호가 일치하지 않습니다.', 'error');
    try {
      const data = await api('/api/auth/activate', { method: 'POST', body: { username, password: pw } });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      toast('비밀번호 설정 완료! 환영합니다!', 'success');
      showDashboard();
    } catch (e) { toast(e.message, 'error'); }
  } else {
    const pw = $('auth-password').value;
    if (!pw) return toast('비밀번호를 입력하세요.', 'error');
    try {
      const data = await api('/api/auth/login', { method: 'POST', body: { username, password: pw } });
      token = data.token;
      currentUser = data.user;
      localStorage.setItem('token', token);
      localStorage.setItem('currentUser', JSON.stringify(currentUser));
      toast('로그인 성공!', 'success');
      showDashboard();
    } catch (e) { toast(e.message, 'error'); }
  }
}

async function handleAdminAuth() {
  const username = $('admin-username').value.trim();
  const password = $('admin-password').value;
  if (!username || !password) return toast('아이디와 비밀번호를 입력하세요.', 'error');
  try {
    const statusData = await api('/api/auth/admin-status');
    const endpoint = statusData.isSetup ? '/api/auth/admin-login' : '/api/auth/admin-setup';
    const data = await api(endpoint, { method: 'POST', body: { username, password } });
    adminToken = data.token;
    localStorage.setItem('adminToken', adminToken);
    toast(statusData.isSetup ? '관리자 로그인 성공!' : '관리자 설정 완료!', 'success');
    showAdminDashboard();
  } catch (e) { toast(e.message, 'error'); }
}

function logout() {
  token = null; adminToken = null; currentUser = null;
  localStorage.removeItem('token');
  localStorage.removeItem('adminToken');
  localStorage.removeItem('currentUser');
  authMode = 'check';
  $('auth-username').readOnly = false;
  $('auth-username').value = '';
  $('auth-password').value = '';
  hide('password-section');
  hide('admin-dashboard');
  hide('dashboard');
  show('auth-page');
}

// ─── DASHBOARD ───
function showDashboard() {
  hide('auth-page');
  hide('admin-dashboard');
  show('dashboard');
  updateSidebar();
  navigateTo('upload');
  loadSubjectsForUpload();
  initTimerSocket();
  checkStaleSession();
}

function updateSidebar() {
  if (!currentUser) return;
  const initial = currentUser.username.charAt(0).toUpperCase();
  $('sidebar-avatar').textContent = initial;
  $('sidebar-name').textContent = currentUser.username;
  $('sidebar-points').textContent = `${currentUser.points?.toLocaleString() || 0} pt`;
  $('mobile-points').textContent = `${currentUser.points?.toLocaleString() || 0} pt`;
}

async function refreshUser() {
  try {
    const data = await api('/api/users/me');
    currentUser = { id: data.user._id, username: data.user.username, points: data.user.points };
    localStorage.setItem('currentUser', JSON.stringify(currentUser));
    updateSidebar();
  } catch (e) { }
}

function navigateTo(page) {
  if (isUploading) return toast('파일 업로드가 진행 중입니다. 잠시만 기다려주세요.', 'error');
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
  show(`page-${page}`);
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.querySelectorAll('.mobile-nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  if (page === 'browse') loadSubjects();
  if (page === 'profile') loadProfile();
  if (page === 'upload') loadSubjectsForUpload();
  if (page === 'quiz') loadQuizPage();
  if (page === 'timer') loadTimerPage();
  if (page === 'ranking') loadRankingPage();
  if (page === 'transfer') loadTransferPage();
}

// ─── UPLOAD ───
async function loadSubjectsForUpload() {
  try {
    const subjects = await api('/api/subjects');
    const sel = $('upload-subject');
    sel.innerHTML = '<option value="">과목을 선택하세요</option>' +
      subjects.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
  } catch (e) { }
}

function onThumbSelect(input) {
  const label = $('thumb-label');
  if (input.files.length) {
    label.classList.add('has-file');
    label.querySelector('span').textContent = `${input.files[0].name} (선택됨)`;
  }
}
function onFileSelect(input) {
  const label = $('file-label');
  if (input.files?.[0]) {
    label.classList.add('has-file');
    label.querySelector('span').textContent = `${input.files[0].name} (선택됨)`;
  }
}

function onQuizThumbSelect(input) {
  const label = $('quiz-thumb-label');
  if (input.files?.[0]) {
    label.classList.add('has-file');
    label.querySelector('span').textContent = `${input.files[0].name} (선택됨)`;
  }
}

async function handleUpload() {
  const subjectId = $('upload-subject').value;
  const title = $('upload-title').value.trim();
  const file = $('upload-file').files[0];
  const thumb = $('upload-thumbnail').files[0];

  if (!subjectId) return toast('과목을 선택하세요.', 'error');
  if (!title) return toast('학습지 이름을 입력하세요.', 'error');
  if (!file) return toast('파일을 선택하세요.', 'error');

  const fd = new FormData();
  fd.append('subjectId', subjectId);
  fd.append('title', title);
  fd.append('file', file);
  if (thumb) fd.append('thumbnail', thumb);

  $('upload-btn').disabled = true;
  $('upload-btn').textContent = '대용량 파일 업로드 중... (창을 이동하지 마세요)';
  isUploading = true;
  try {
    await api('/api/worksheets', { method: 'POST', body: fd });
    toast('업로드 성공!', 'success');
    $('upload-title').value = '';
    $('upload-file').value = '';
    $('upload-thumbnail').value = '';
    $('file-label').classList.remove('has-file');
    $('file-label').querySelector('span').textContent = '파일 선택 (PDF, 이미지, DOCX)';
    $('thumb-label').classList.remove('has-file');
    $('thumb-label').querySelector('span').textContent = '이미지 선택';
  } catch (e) { toast(e.message, 'error'); }
  isUploading = false;
  $('upload-btn').disabled = false;
  $('upload-btn').textContent = '업로드하기';
}

function openNewSubjectModal() {
  const html = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>새 과목 추가</h2>
        <div class="form-group">
          <label>과목 이름</label>
          <input type="text" id="new-subject-name" class="form-input" placeholder="예: 수학">
        </div>
        <div class="form-group">
          <label>과목 표지 이미지 (선택)</label>
          <label class="file-input-label" id="subject-thumb-label">
            <span>이미지 선택</span>
            <input type="file" id="new-subject-thumb" accept="image/*" style="display:none"
              onchange="this.parentElement.classList.add('has-file');this.parentElement.querySelector('span').textContent=this.files[0].name+' (선택됨)'">
          </label>
        </div>
        <div class="flex gap-sm" style="margin-top:20px">
          <button class="btn btn-secondary" onclick="closeModal()">취소</button>
          <button class="btn btn-primary" onclick="addSubject()" style="flex:1">추가</button>
        </div>
      </div>
    </div>`;
  $('modal-container').innerHTML = html;
  show('modal-container');
}

async function addSubject() {
  const name = $('new-subject-name').value.trim();
  if (!name) return toast('과목 이름을 입력하세요.', 'error');
  const fd = new FormData();
  fd.append('name', name);
  const thumb = $('new-subject-thumb')?.files[0];
  if (thumb) fd.append('thumbnail', thumb);
  try {
    await api('/api/subjects', { method: 'POST', body: fd });
    toast(`과목 "${name}" 추가 완료!`, 'success');
    closeModal();
    loadSubjectsForUpload();
  } catch (e) { toast(e.message, 'error'); }
}

function closeModal(e) {
  if (e && e.target !== e.currentTarget) return;
  hide('modal-container');
  $('modal-container').innerHTML = '';
}

// ─── BROWSE ───
async function loadSubjects() {
  try {
    const subjects = await api('/api/subjects');
    const grid = $('subject-list');
    show('subject-list');
    hide('worksheet-list-section');
    grid.innerHTML = subjects.length ? subjects.map(s => `
      <div class="card subject-card" onclick="openSubject('${s._id}','${s.name}')">
        <div class="thumb">${s.thumbnailUrl ? `<img src="${s.thumbnailUrl}" alt="${s.name}">` : `<img src="/assets/no-cover.png" alt="${s.name}">`}</div>
        <div class="info">
          <h3>${s.name}</h3>
          <span>by ${s.createdBy?.username || '-'}</span>
        </div>
      </div>`).join('') : '<p style="color:var(--text2);grid-column:1/-1;text-align:center;padding:40px">아직 과목이 없습니다. 업로드 탭에서 추가하세요!</p>';
  } catch (e) { toast(e.message, 'error'); }
}

let currentSubjectId = null;
let currentWorksheets = [];

async function openSubject(id, name) {
  currentSubjectId = id;
  $('current-subject-name').textContent = name;
  hide('subject-list');
  show('worksheet-list-section');
  await loadWorksheets('latest');
}

async function loadWorksheets(sort) {
  try {
    const data = await api(`/api/worksheets?subject=${currentSubjectId}&sort=${sort === 'views' ? 'views' : 'latest'}`);
    currentWorksheets = data;
    renderWorksheets();
  } catch (e) { toast(e.message, 'error'); }
}

function renderWorksheets() {
  const grid = $('worksheet-list');
  grid.innerHTML = currentWorksheets.length ? currentWorksheets.map(w => `
    <div class="card worksheet-card" onclick="openWorksheet('${w._id}')">
      <div class="thumb">${w.thumbnailUrl ? `<img src="${w.thumbnailUrl}" alt="${w.title}">` : `<img src="/assets/no-cover.png" alt="${w.title}">`}</div>
      <div class="body">
        <h4>${w.title}</h4>
        <div class="meta">
          <span>by ${w.uploader?.username || '-'}</span>
          <span>${w.views} views</span>
        </div>
        <div class="meta" style="margin-top:4px">
          <span>${formatDate(w.createdAt)}</span>
        </div>
      </div>
    </div>`).join('') : '<p style="color:var(--text2);grid-column:1/-1;text-align:center;padding:40px">아직 학습지가 없습니다.</p>';
}

function sortWorksheets(sort) {
  document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadWorksheets(sort);
}

function backToSubjects() {
  show('subject-list');
  hide('worksheet-list-section');
}

async function downloadWorksheet(id, title) {
  try {
    toast('다운로드 준비 중...', 'info');

    const response = await fetch(`${API}/api/worksheets/${id}/download`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.error || '다운로드 링크 가져오기 실패');
    }

    if (data.url) {
      // Blob 다운로드: 모바일에서도 직접 저장 가능
      try {
        const fileRes = await fetch(data.url);
        const blob = await fileRes.blob();
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = blobUrl;
        // 파일 확장자 추출
        const ext = data.url.split('?')[0].split('.').pop() || 'file';
        a.download = `${title}.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(blobUrl);
        toast('다운로드 완료!', 'success');
      } catch (blobErr) {
        // Blob 실패 시 (CORS 등) fallback
        window.open(data.url, '_blank');
        toast('다운로드가 시작되었습니다.', 'success');
      }
    } else {
      throw new Error('다운로드 URL을 찾을 수 없습니다.');
    }

  } catch (e) { toast(e.message || '다운로드 실패', 'error'); }
}

async function openWorksheet(id) {
  try {
    const data = await api(`/api/worksheets/${id}`);
    const w = data.worksheet;
    if (data.viewCounted) {
      toast('조회수 +1! 업로더에게 100pt 지급됨', 'info');
      await refreshUser();
    }
    const html = `
      <div class="modal-overlay" onclick="closeModal(event)">
        <div class="modal" onclick="event.stopPropagation()">
          <h2>${w.title}</h2>
          <div style="margin-bottom:16px">
            ${w.thumbnailUrl ? `<img src="${w.thumbnailUrl}" style="width:100%;border-radius:var(--radius);margin-bottom:12px" alt="${w.title}">` : `<img src="/assets/no-cover.png" style="width:100%;border-radius:var(--radius);margin-bottom:12px" alt="${w.title}">`}
            <p style="color:var(--text2);font-size:.9rem">과목: ${w.subject?.name || '-'}</p>
            <p style="color:var(--text2);font-size:.9rem">업로더: ${w.uploader?.username || '-'}</p>
            <p style="color:var(--text2);font-size:.9rem">조회수: ${w.views} | ${formatDate(w.createdAt)}</p>
          </div>
          <div class="flex gap-sm">
            <button class="btn btn-secondary" onclick="closeModal()">닫기</button>
            <button class="btn btn-primary" style="flex:1;justify-content:center" onclick="downloadWorksheet('${w._id}', '${w.title.replace(/'/g, "\\'")}')">다운로드</button>
          </div>
        </div>
      </div>`;
    $('modal-container').innerHTML = html;
    show('modal-container');
    // Refresh worksheet list
    if (currentSubjectId) loadWorksheets('latest');
  } catch (e) { toast(e.message, 'error'); }
}

// ─── PROFILE ───
async function loadProfile() {
  try {
    const data = await api('/api/users/me');
    currentUser = { id: data.user._id, username: data.user.username, points: data.user.points };
    updateSidebar();

    const formatTime = (sec) => {
      const h = Math.floor(sec / 3600);
      const m = Math.floor((sec % 3600) / 60);
      const s = sec % 60;
      if (h > 0) return `${h}시간 ${m}분`;
      if (m > 0) return `${m}분 ${s}초`;
      return `${s}초`;
    };

    $('profile-stats').innerHTML = `
      <div class="stat-card"><div class="value">${data.user.points?.toLocaleString()}</div><div class="label">보유 포인트</div></div>
      <div class="stat-card"><div class="value">${data.user.learningTime ? formatTime(data.user.learningTime) : '0초'}</div><div class="label">학습 시간</div></div>
      <div class="stat-card"><div class="value">${data.user.totalDownloads || 0}</div><div class="label">다운로드 수</div></div>
      <div class="stat-card"><div class="value">${data.followerCount}</div><div class="label">팔로워</div></div>
      <div class="stat-card"><div class="value">${data.followingCount}</div><div class="label">팔로잉</div></div>`;

    $('top-worksheets').innerHTML = data.topWorksheets.length
      ? data.topWorksheets.map((w, i) => `
        <div class="user-item">
          <div class="avatar" style="background:${['#2563eb', '#3b82f6', '#60a5fa'][i]};font-size:1rem">${['1st', '2nd', '3rd'][i]}</div>
          <div class="name">${w.title} <span style="color:var(--text2);font-size:.8rem">(${w.subject?.name})</span></div>
          <div class="pts">${w.views} views</div>
        </div>`).join('')
      : '<p style="color:var(--text2);font-size:.9rem">아직 업로드한 학습지가 없습니다.</p>';
  } catch (e) { toast(e.message, 'error'); }
}

// ─── FRIENDS PAGE ───
async function loadFriendsPage() {
  try {
    const mutuals = await api('/api/follows/mutual');
    const sections = document.querySelectorAll('#page-friends .profile-section');
    const pageHeader = document.querySelector('#page-friends .page-header');

    // Remove any existing empty notice
    const existingNotice = $('friends-empty-notice');
    if (existingNotice) existingNotice.remove();

    if (mutuals.length === 0) {
      sections.forEach(s => s.classList.add('hidden'));
      const emptyNotice = document.createElement('div');
      emptyNotice.id = 'friends-empty-notice';
      emptyNotice.style.cssText = 'text-align:center;padding:60px 20px;color:var(--text2)';
      emptyNotice.innerHTML = `
        <div style="font-size:3rem;margin-bottom:16px">👥</div>
        <h3 style="margin-bottom:8px;color:var(--text)">아직 친구가 없어요.</h3>
        <p style="font-size:.9rem">학우들 목록에서 서로 팔로우하면 친구가 되어<br>포인트를 주고받을 수 있습니다!</p>
        <button class="btn btn-primary" style="margin-top:24px" onclick="navigateTo('classmates')">친구 찾으러 가기</button>
      `;
      pageHeader.after(emptyNotice);
    } else {
      sections.forEach(s => s.classList.remove('hidden'));
      loadFriendsBestWorksheets();
      loadTransferList();
    }
  } catch (e) { toast(e.message, 'error'); }
}

async function loadFriendsBestWorksheets() {
  try {
    const worksheets = await api('/api/worksheets/friends/best');
    const container = $('friends-best-worksheets');

    container.innerHTML = worksheets.length
      ? worksheets.map(w => `
        <div class="card worksheet-card" onclick="openWorksheet('${w._id}')">
          <div class="thumbnail">
            <img src="${w.thumbnailUrl || '/assets/no-cover.png'}" alt="${w.title}">
          </div>
          <div class="body">
            <h4>${w.title}</h4>
            <div class="meta">
              <span>by ${w.uploader?.username || '-'}</span>
              <span>${w.views} views</span>
            </div>
            <div class="meta" style="margin-top:4px">
              <span>${formatDate(w.createdAt)}</span>
            </div>
          </div>
        </div>`).join('')
      : '<p style="color:var(--text2);text-align:center;padding:40px;grid-column:1/-1;">아직 친구가 올린 인기 학습지가 없습니다.</p>';
  } catch (e) { toast(e.message, 'error'); }
}



async function follow(userId) {
  try {
    await api(`/api/follows/${userId}`, { method: 'POST' });
    toast('팔로우 완료!', 'success');
    if (currentPage === 'classmates') loadClassmates();
    if (currentPage === 'friends') loadFriendsPage();
  } catch (e) { toast(e.message, 'error'); }
}

async function unfollow(userId) {
  try {
    await api(`/api/follows/${userId}`, { method: 'DELETE' });
    toast('언팔로우 완료!', 'info');
    if (currentPage === 'classmates') loadClassmates();
    if (currentPage === 'friends') loadFriendsPage();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── CLASSMATES PAGE ───
let currentClassmatesTab = 'all';

function loadClassmates() {
  document.querySelectorAll('#page-classmates .classmate-tab').forEach((t, i) => {
    const tabType = ['all', 'following', 'followers'][i];
    if (tabType === currentClassmatesTab) t.classList.add('active');
    else t.classList.remove('active');
  });
  loadClassmatesList(currentClassmatesTab);
}

function showClassmatesTab(tab) {
  currentClassmatesTab = tab;
  document.querySelectorAll('#page-classmates .classmate-tab').forEach(t => t.classList.remove('active'));
  event.target.classList.add('active');
  loadClassmatesList(tab);
}

async function loadClassmatesList(tab) {
  try {
    let endpoint = '/api/users/classmates';
    let emptyMsg = '아직 다른 학우가 없습니다.';

    if (tab === 'following') {
      endpoint = '/api/follows/following';
      emptyMsg = '팔로잉하는 학우가 없습니다.';
    } else if (tab === 'followers') {
      endpoint = '/api/follows/followers';
      emptyMsg = '팔로워가 없습니다.';
    }

    const users = await api(endpoint);

    $('classmates-list').innerHTML = users.length
      ? users.map(u => {
        const isF = tab === 'following' ? true : u.isFollowing;
        return `
          <div class="user-item">
            <div class="avatar">${u.username.charAt(0).toUpperCase()}</div>
            <div class="name">${u.username}</div>
            <div class="pts">${u.points?.toLocaleString()} pt</div>
            ${isF
            ? `<button class="btn btn-danger btn-sm" onclick="unfollow('${u._id}')">언팔로우</button>`
            : `<button class="btn btn-primary btn-sm" onclick="follow('${u._id}')">${u.isFollower ? '맞팔로우' : '팔로우'}</button>`}
          </div>`;
      }).join('')
      : `<p style="color:var(--text2);font-size:.9rem;text-align:center;padding:20px">${emptyMsg}</p>`;
  } catch (e) { toast(e.message, 'error'); }
}

async function loadTransferList() {
  try {
    const data = await api('/api/follows/mutual');
    $('transfer-to').innerHTML = '<option value="">친구를 선택하세요</option>' +
      data.map(u => `<option value="${u._id}">${u.username}</option>`).join('');
  } catch (e) { }
}

async function handleTransfer() {
  const toUserId = $('transfer-to').value;
  const amount = parseInt($('transfer-amount').value);
  if (!toUserId) return toast('받는 친구를 선택하세요.', 'error');
  if (!amount || amount <= 0) return toast('포인트를 입력하세요.', 'error');
  try {
    const data = await api('/api/points/transfer', { method: 'POST', body: { toUserId, amount } });
    toast(data.message, 'success');
    $('transfer-amount').value = '';
    await refreshUser();
    loadProfile();
  } catch (e) { toast(e.message, 'error'); }
}

// ─── HISTORY ───
async function loadHistory() {
  try {
    const data = await api('/api/points/history');
    $('history-list').innerHTML = data.length
      ? data.map(t => {
        const isReceived = t.toUser?._id === currentUser.id && t.amount > 0 && t.type !== 'FEE';
        const isSent = t.fromUser?._id === currentUser.id && t.toUser?._id !== currentUser.id && t.type === 'TRANSFER';
        const displayAmount = isSent ? -t.amount : t.amount;
        const icon = isReceived ? '+' : '-';
        const cls = isReceived ? 'earned' : 'spent';
        return `
          <div class="transfer-card ${cls}">
            <div class="icon-circle">${icon}</div>
            <div class="detail">
              <div class="desc">${t.description || t.type}</div>
              <div class="date">${formatDate(t.createdAt)}</div>
            </div>
            <div class="amount">${displayAmount > 0 ? '+' : ''}${displayAmount.toLocaleString()} pt</div>
          </div>`;
      }).join('')
      : '<p style="color:var(--text2);text-align:center;padding:40px">아직 포인트 기록이 없습니다.</p>';
  } catch (e) { toast(e.message, 'error'); }
}

// ─── ADMIN DASHBOARD ───
function showAdminDashboard() {
  hide('auth-page');
  hide('dashboard');
  show('admin-dashboard');
  adminNavigateTo('admin-users');
}

function adminNavigateTo(page) {
  document.querySelectorAll('#admin-dashboard .page').forEach(p => p.classList.add('hidden'));
  show(`page-${page}`);
  document.querySelectorAll('#admin-dashboard .nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  if (page === 'admin-users') loadAdminUsers();
  if (page === 'admin-worksheets') loadAdminWorksheets();
  if (page === 'admin-subjects') loadAdminSubjects();
  if (page === 'admin-settings') { checkGoogleDriveStatus(); loadStorageInfo(); }
  if (page === 'admin-quizzes') loadAdminQuizzes();
}

async function checkGoogleDriveStatus() {
  try {
    const data = await api('/api/admin/gdrive/status', { admin: true });
    const statusText = $('gdrive-status-text');
    const connectBtn = $('gdrive-connect-btn');
    const disconnectBtn = $('gdrive-disconnect-btn');

    if (data.connected) {
      statusText.innerHTML = '연동됨 (대용량 업로드 정상 작동 중)';
      statusText.style.color = '#16a34a';
      connectBtn.style.display = 'none';
      disconnectBtn.style.display = 'inline-block';
    } else {
      statusText.innerHTML = '연동되지 않음 (대용량 업로드 제한됨)';
      statusText.style.color = '#dc2626';
      connectBtn.style.display = 'inline-block';
      disconnectBtn.style.display = 'none';
    }
  } catch (e) {
    toast('구글 연동 상태 불러오기 실패: ' + e.message, 'error');
  }
}

async function connectGoogleDrive() {
  try {
    const data = await api('/api/admin/gdrive/auth', { admin: true });
    if (data.url) {
      window.location.href = data.url; // Redirect to Google Login
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function disconnectGoogleDrive() {
  if (!confirm('정말 구글 드라이브 연동을 해제하시겠습니까? 대용량 다운로드 및 업로드가 중단됩니다.')) return;
  try {
    await api('/api/admin/gdrive/disconnect', { method: 'DELETE', admin: true });
    toast('구글 드라이브 연동이 해제되었습니다.', 'success');
    checkGoogleDriveStatus();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function loadStorageInfo() {
  try {
    const data = await api('/api/admin/storage', { admin: true });
    let html = '';

    if (data.cloudinary) {
      const c = data.cloudinary;
      const usedMB = (c.usedStorage / (1024 * 1024)).toFixed(1);
      const totalMB = (c.totalStorage / (1024 * 1024)).toFixed(0);
      const pct = c.totalStorage > 0 ? ((c.usedStorage / c.totalStorage) * 100).toFixed(1) : 0;
      const creditPct = c.totalCredits > 0 ? ((c.usedCredits / c.totalCredits) * 100).toFixed(1) : 0;

      html += `<div style="margin-bottom:14px">`;
      html += `<div style="font-weight:600;margin-bottom:8px">Cloudinary 저장소</div>`;
      html += `<div style="margin-bottom:6px">저장 공간: ${usedMB} MB / ${totalMB} MB (${pct}%)</div>`;
      html += `<div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;margin-bottom:10px">`;
      html += `<div style="background:${pct > 80 ? '#ef4444' : '#0095f6'};height:100%;width:${Math.min(pct, 100)}%;border-radius:4px;transition:.3s"></div></div>`;
      html += `<div style="margin-bottom:6px">크레딧: ${creditPct}% 사용</div>`;
      html += `<div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden;margin-bottom:10px">`;
      html += `<div style="background:${creditPct > 80 ? '#ef4444' : '#22c55e'};height:100%;width:${Math.min(creditPct, 100)}%;border-radius:4px;transition:.3s"></div></div>`;
      html += `<div style="font-size:.78rem;color:#999">리소스 수: ${c.resources}개</div>`;
      html += `</div>`;
    } else {
      html += `<div style="margin-bottom:14px;color:#999">Cloudinary 정보를 불러올 수 없습니다.</div>`;
    }

    if (data.mongodb) {
      const m = data.mongodb;
      html += `<div style="font-weight:600;margin-bottom:8px">DB 통계</div>`;
      html += `<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px">`;
      html += `<div style="background:var(--bg3);padding:10px;border-radius:8px;text-align:center"><div style="font-weight:700;font-size:1.1rem">${m.userCount}</div><div style="font-size:.7rem;color:#999">계정</div></div>`;
      html += `<div style="background:var(--bg3);padding:10px;border-radius:8px;text-align:center"><div style="font-weight:700;font-size:1.1rem">${m.worksheetCount}</div><div style="font-size:.7rem;color:#999">학습지</div></div>`;
      html += `<div style="background:var(--bg3);padding:10px;border-radius:8px;text-align:center"><div style="font-weight:700;font-size:1.1rem">${m.subjectCount}</div><div style="font-size:.7rem;color:#999">과목</div></div>`;
      html += `</div>`;
    }

    html += `<div style="margin-top:12px;font-size:.75rem;color:#bbb">Google Drive: ${data.gdrive ? '연동됨' : '연동 안 됨'}</div>`;

    $('storage-info').innerHTML = html;
  } catch (e) {
    $('storage-info').innerHTML = '<span style="color:var(--danger)">저장 정보 로딩 실패</span>';
  }
}

async function loadAdminQuizzes() {
  try {
    const quizzes = await api('/api/admin/quizzes', { admin: true });
    $('admin-quiz-count').textContent = `(${quizzes.length}개)`;
    $('admin-quizzes-tbody').innerHTML = quizzes.map(q => `
      <tr>
        <td><strong>${q.title}</strong></td>
        <td>${q.creator?.username || '(삭제됨)'}</td>
        <td>${q.questions?.length || 0}문제</td>
        <td>${q.playCount || 0}회</td>
        <td>
          <button class="btn btn-danger btn-sm" onclick="deleteAdminQuiz('${q._id}','${q.title}')">삭제</button>
        </td>
      </tr>`).join('');
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAdminQuiz(id, title) {
  if (!confirm(`퀴즈 "${title}"를 삭제하시겠습니까? 관련 플레이 기록도 함께 삭제됩니다.`)) return;
  try {
    const data = await api(`/api/admin/quizzes/${id}`, { method: 'DELETE', admin: true });
    toast(data.message, 'success');
    loadAdminQuizzes();
  } catch (e) { toast(e.message, 'error'); }
}

let adminUsersList = [];
let adminUsersSort = 'date';

async function loadAdminUsers() {
  try {
    adminUsersList = await api('/api/admin/users', { admin: true });
    $('admin-user-count').textContent = `(${adminUsersList.length}명)`;
    renderAdminUsers();
  } catch (e) { toast(e.message, 'error'); }
}

function sortAdminUsers(sort, btn) {
  adminUsersSort = sort;
  document.querySelectorAll('#page-admin-users .sort-tab').forEach(t => t.classList.remove('active'));
  if (btn) btn.classList.add('active');
  renderAdminUsers();
}

function renderAdminUsers() {
  const sorted = [...adminUsersList];
  if (adminUsersSort === 'name') {
    sorted.sort((a, b) => a.username.localeCompare(b.username, 'ko'));
  }
  // 'date' = default server order (createdAt desc)

  $('admin-users-tbody').innerHTML = sorted.map(u => `
      <tr>
        <td><strong>${u.username}</strong></td>
        <td><span class="badge ${u.isActivated ? 'badge-active' : 'badge-pending'}">${u.isActivated ? '활성' : '대기'}</span></td>
        <td>${u.points?.toLocaleString()} pt</td>
        <td>
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm" onclick="openPointAdjustModal('${u._id}','${u.username}',${u.points})">포인트</button>
            <button class="btn btn-danger btn-sm" onclick="deleteUser('${u._id}','${u.username}')">삭제</button>
          </div>
        </td>
      </tr>`).join('');
}

function openAddUserModal() {
  const html = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>새 계정 추가</h2>
        <div class="form-group">
          <label>계정 이름</label>
          <input type="text" id="new-user-name" class="form-input" placeholder="계정 이름 입력">
        </div>
        <div class="flex gap-sm" style="margin-top:20px">
          <button class="btn btn-secondary" onclick="closeModal()">취소</button>
          <button class="btn btn-primary" onclick="addUser()" style="flex:1">추가</button>
        </div>
      </div>
    </div>`;
  $('modal-container').innerHTML = html;
  show('modal-container');
}

async function addUser() {
  const username = $('new-user-name').value.trim();
  if (!username) return toast('계정 이름을 입력하세요.', 'error');
  try {
    await api('/api/admin/users', { method: 'POST', body: { username }, admin: true });
    toast(`계정 "${username}" 생성 완료!`, 'success');
    closeModal();
    loadAdminUsers();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteUser(id, name) {
  if (!confirm(`정말 "${name}" 계정을 삭제하시겠습니까?`)) return;
  try {
    await api(`/api/admin/users/${id}`, { method: 'DELETE', admin: true });
    toast(`"${name}" 삭제 완료!`, 'success');
    loadAdminUsers();
  } catch (e) { toast(e.message, 'error'); }
}

function openPointAdjustModal(id, name, pts) {
  const html = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>포인트 조정 — ${name}</h2>
        <p style="color:var(--text2);margin-bottom:16px">현재 포인트: ${pts.toLocaleString()} pt</p>
        <div class="form-group">
          <label>조정할 포인트 (양수: 추가 / 음수: 차감)</label>
          <input type="number" id="adjust-points" class="form-input" placeholder="예: 500 또는 -200">
        </div>
        <div class="flex gap-sm" style="margin-top:20px">
          <button class="btn btn-secondary" onclick="closeModal()">취소</button>
          <button class="btn btn-primary" onclick="adjustPoints('${id}')" style="flex:1">적용</button>
        </div>
      </div>
    </div>`;
  $('modal-container').innerHTML = html;
  show('modal-container');
}

async function adjustPoints(id) {
  const amount = parseInt($('adjust-points').value);
  if (!amount) return toast('포인트를 입력하세요.', 'error');
  try {
    const data = await api(`/api/admin/users/${id}/points`, { method: 'PATCH', body: { amount }, admin: true });
    toast(data.message, 'success');
    closeModal();
    loadAdminUsers();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdminWorksheets() {
  try {
    const data = await api('/api/worksheets');
    $('admin-worksheets-tbody').innerHTML = data.length ? data.map(w => `
      <tr>
        <td><strong>${w.title}</strong></td>
        <td>${w.subject?.name || '-'}</td>
        <td>${w.uploader?.username || '-'}</td>
        <td>${w.views}</td>
        <td>
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm" onclick="changeThumbnail('worksheets','${w._id}')">표지</button>
            <button class="btn btn-secondary btn-sm" onclick="openViewAdjustModal('${w._id}','${w.title.replace(/'/g, "\\'")}',${w.views})">수정</button>
            <button class="btn btn-danger btn-sm" onclick="deleteAdminWorksheet('${w._id}','${w.title.replace(/'/g, "\\'")}')">삭제</button>
          </div>
        </td>
      </tr>`).join('') : '<tr><td colspan="5" style="text-align:center;color:var(--text2);padding:20px">학습지가 없습니다.</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

function openViewAdjustModal(id, title, views) {
  const html = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>조회수 수정 — ${title}</h2>
        <div class="form-group">
          <label>새 조회수</label>
          <input type="number" id="adjust-views" class="form-input" value="${views}" min="0">
        </div>
        <div class="flex gap-sm" style="margin-top:20px">
          <button class="btn btn-secondary" onclick="closeModal()">취소</button>
          <button class="btn btn-primary" onclick="adjustViews('${id}')" style="flex:1">적용</button>
        </div>
      </div>
    </div>`;
  $('modal-container').innerHTML = html;
  show('modal-container');
}

async function adjustViews(id) {
  const views = parseInt($('adjust-views').value);
  if (isNaN(views) || views < 0) return toast('유효한 조회수를 입력하세요.', 'error');
  try {
    const data = await api(`/api/admin/worksheets/${id}/views`, { method: 'PATCH', body: { views }, admin: true });
    toast(data.message, 'success');
    closeModal();
    loadAdminWorksheets();
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAdminWorksheet(id, title) {
  if (!confirm(`정말 학습지 "${title}"을(를) 영구 삭제하시겠습니까?\n이 작업은 되돌릴 수 없으며 원본 파일도 삭제됩니다.`)) return;
  try {
    await api(`/api/admin/worksheets/${id}`, { method: 'DELETE', admin: true });
    toast(`"${title}" 삭제 완료!`, 'success');
    loadAdminWorksheets();
  } catch (e) { toast(e.message, 'error'); }
}

async function loadAdminSubjects() {
  try {
    const [subjects, worksheets] = await Promise.all([
      api('/api/subjects'),
      api('/api/worksheets')
    ]);

    $('admin-subjects-tbody').innerHTML = subjects.length ? subjects.map(s => {
      const count = worksheets.filter(w => w.subject?._id === s._id).length;
      return `
      <tr>
        <td><strong>${s.name}</strong></td>
        <td>${s.createdBy?.username || '-'}</td>
        <td>${count} 개</td>
        <td>
          <div class="flex gap-sm">
            <button class="btn btn-secondary btn-sm" onclick="changeThumbnail('subjects','${s._id}')">표지</button>
            <button class="btn btn-danger btn-sm" onclick="deleteAdminSubject('${s._id}','${s.name.replace(/'/g, "\\'")}', ${count})">삭제</button>
          </div>
        </td>
      </tr>`;
    }).join('') : '<tr><td colspan="4" style="text-align:center;color:var(--text2);padding:20px">과목이 없습니다.</td></tr>';
  } catch (e) { toast(e.message, 'error'); }
}

async function deleteAdminSubject(id, name, count) {
  if (!confirm(`정말 과목 "${name}"을(를) 영구 삭제하시겠습니까?\n이 과목에 포함된 학습지 ${count}개와 모든 파일이 함께 삭제됩니다!\n이 작업은 절대 되돌릴 수 없습니다.`)) return;
  try {
    await api(`/api/admin/subjects/${id}`, { method: 'DELETE', admin: true });
    toast(`과목 "${name}" 삭제 완료!`, 'success');
    loadAdminSubjects();
  } catch (e) { toast(e.message, 'error'); }
}

function changeThumbnail(type, id) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/*';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      toast('이미지는 10MB 이하만 가능합니다.', 'error');
      return;
    }
    toast('표지 업로드 중...', 'info');
    try {
      const formData = new FormData();
      formData.append('thumbnail', file);
      const res = await fetch(`${API}/api/admin/${type}/${id}/thumbnail`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${adminToken}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '업로드 실패');
      toast(data.message, 'success');
      if (type === 'subjects') loadAdminSubjects();
      if (type === 'worksheets') loadAdminWorksheets();
    } catch (e) { toast(e.message, 'error'); }
  };
  input.click();
}

// ─── QUIZ ───
let quizData = null;
let quizQuestionIndex = 0;
let quizScore = 0;
let quizMode = '';
let quizStartTime = 0;
let speedTimer = null;
let speedTimeLeft = 30;
let quizQuestionCount = 0;
let editingQuizId = null;

function loadQuizPage() {
  showQuizMainTab('play');
}

function showQuizMainTab(tab) {
  document.querySelectorAll('.quiz-main-tab').forEach(t => t.classList.remove('active'));
  // find matching tab button and activate it
  const tabBtns = document.querySelectorAll('.quiz-main-tab');
  if (tab === 'play') tabBtns[0].classList.add('active');
  if (tab === 'create') tabBtns[1].classList.add('active');
  if (tab === 'leaderboard') tabBtns[2].classList.add('active');

  hide('quiz-play-section');
  hide('quiz-create-section');
  hide('quiz-leaderboard-section');
  if (tab === 'play') { show('quiz-play-section'); loadQuizList(); }
  if (tab === 'create') {
    show('quiz-create-section');
    loadQuizSubjects();
    if (!editingQuizId) {
      $('quiz-create-title-text').textContent = '퀴즈 만들기';
      initQuizForm();
    }
  }
  if (tab === 'leaderboard') { show('quiz-leaderboard-section'); loadLeaderboard(); }
}

async function loadQuizList() {
  try {
    const quizzes = await api('/api/quizzes');
    $('quiz-list').innerHTML = quizzes.length
      ? quizzes.map(q => {
        const isCreator = q.creator?._id === currentUser.id;
        return `
        <div class="card" style="cursor:pointer;overflow:hidden" onclick="openQuizSelect('${q._id}', ${q.questions.length})">
          <div class="thumb" style="height:120px;background:var(--bg2)"><img src="${q.thumbnailUrl || '/assets/no-cover.png'}" style="width:100%;height:100%;object-fit:cover" alt="${q.title}"></div>
          <div style="padding:16px">
            <div class="flex justify-between items-start">
              <h4 style="margin-bottom:8px">${q.title}</h4>
              ${isCreator ? `<button class="btn btn-secondary btn-sm" style="padding:4px 8px;font-size:.7rem" onclick="event.stopPropagation();editQuiz('${q._id}')">수정</button>` : ''}
            </div>
            <div style="color:var(--text2);font-size:.85rem">
              <span>${q.questions.length}문제</span> ·
              <span>by ${q.creator?.username || '-'}</span> ·
              <span>${q.playCount}회 플레이</span>
            </div>
            ${q.subject ? `<span style="display:inline-block;margin-top:8px;padding:2px 8px;background:var(--accent);color:white;border-radius:12px;font-size:.75rem">${q.subject.name}</span>` : ''}
          </div>
        </div>`;
      }).join('')
      : '<p style="color:var(--text2);text-align:center;padding:40px;grid-column:1/-1">아직 퀴즈가 없습니다. 퀴즈를 만들어보세요!</p>';
  } catch (e) { toast(e.message, 'error'); }
}

async function loadQuizSubjects() {
  try {
    const subjects = await api('/api/subjects');
    $('quiz-subject').innerHTML = '<option value="">과목 없음</option>' +
      subjects.map(s => `<option value="${s._id}">${s.name}</option>`).join('');
  } catch (e) { }
}

function initQuizForm() {
  $('quiz-title').value = '';
  $('quiz-questions-container').innerHTML = '<h3 style="margin-bottom:12px">문제 목록</h3>';
  addQuizQuestion();
  addQuizQuestion();
}

function addQuizQuestion() {
  const container = $('quiz-questions-container');
  const idx = container.querySelectorAll('.quiz-q-block').length;
  const div = document.createElement('div');
  div.className = 'quiz-q-block card';
  div.style.cssText = 'margin-bottom:12px;padding:16px';
  div.innerHTML = `
      <div class="flex items-center justify-between" style="margin-bottom:8px">
        <strong>문제 ${idx + 1}</strong>
        <button class="btn btn-danger btn-sm" onclick="this.closest('.quiz-q-block').remove()" style="font-size:.75rem">삭제</button>
      </div>
      <div class="form-group">
        <input type="text" class="form-input qq-question" placeholder="질문을 입력하세요">
      </div>
      <div class="qq-choices-container">
        <!-- Choices will be added here -->
      </div>
      <button class="btn btn-secondary btn-sm" style="margin-bottom:12px;font-size:.75rem" onclick="addChoiceToQuestion(this)">+ 선택지 추가</button>
      <div class="form-group">
        <label>정답 번호 (1부터 시작)</label>
        <input type="number" class="form-input qq-answer" min="1" value="1">
      </div>`;
  container.appendChild(div);
  const choicesContainer = div.querySelector('.qq-choices-container');
  addChoiceToQuestion(choicesContainer, true);
  addChoiceToQuestion(choicesContainer, true);
}

function addChoiceToQuestion(btnOrContainer, isInitial = false) {
  const container = isInitial ? btnOrContainer : btnOrContainer.closest('.quiz-q-block').querySelector('.qq-choices-container');
  const count = container.querySelectorAll('.qq-choice-wrapper').length;
  const div = document.createElement('div');
  div.className = 'form-group qq-choice-wrapper flex gap-sm items-center';
  div.style.marginBottom = '8px';
  div.innerHTML = `
    <span style="font-size:.85rem;color:var(--text2);min-width:20px">${count + 1}.</span>
    <input type="text" class="form-input qq-choice" placeholder="보기 ${count + 1}" style="flex:1">
    <button class="btn btn-danger btn-sm" onclick="removeChoice(this)" style="padding:4px 8px">×</button>
  `;
  container.appendChild(div);
}

function removeChoice(btn) {
  const container = btn.closest('.qq-choices-container');
  if (container.querySelectorAll('.qq-choice-wrapper').length <= 2) {
    return toast('최소 2개의 보기가 필요합니다.', 'error');
  }
  btn.closest('.qq-choice-wrapper').remove();
  // Renumber
  container.querySelectorAll('.qq-choice-wrapper').forEach((w, i) => {
    w.querySelector('span').textContent = `${i + 1}.`;
    w.querySelector('input').placeholder = `보기 ${i + 1}`;
  });
}

async function submitQuiz() {
  const title = $('quiz-title').value.trim();
  const subject = $('quiz-subject').value;
  if (!title) return toast('퀴즈 제목을 입력하세요.', 'error');

  const blocks = document.querySelectorAll('.quiz-q-block');
  if (blocks.length < 2) return toast('최소 2개 이상의 문제가 필요합니다.', 'error');

  const questions = [];
  for (const block of blocks) {
    const question = block.querySelector('.qq-question').value.trim();
    const choices = [...block.querySelectorAll('.qq-choice')].map(c => c.value.trim()).filter(Boolean);
    const answerIndex = parseInt(block.querySelector('.qq-answer').value) - 1;
    if (!question) return toast('빈 질문이 있습니다.', 'error');
    if (choices.length < 2) return toast(`"${question}" 문제에 보기가 2개 이상 필요합니다.`, 'error');
    if (isNaN(answerIndex) || answerIndex < 0 || answerIndex >= choices.length) return toast(`"${question}" 문제의 정답 번호가 유효하지 않습니다. (최대:${choices.length})`, 'error');
    questions.push({ question, choices, answerIndex });
  }

  try {
    const formData = new FormData();
    formData.append('title', title);
    if (subject) formData.append('subject', subject);
    formData.append('questions', JSON.stringify(questions));

    const thumb = $('quiz-thumbnail').files[0];
    if (thumb) formData.append('thumbnail', thumb);

    const method = editingQuizId ? 'PUT' : 'POST';
    const endpoint = editingQuizId ? `/api/quizzes/${editingQuizId}` : '/api/quizzes';

    // Using fetch directly because api() helper doesn't support FormData well for automated Content-Type
    const headers = { 'Authorization': `Bearer ${token}` };
    const res = await fetch(API + endpoint, { method, headers, body: formData });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || '오류 발생');

    toast(editingQuizId ? '퀴즈 수정 완료!' : '퀴즈 업로드 완료!', 'success');
    editingQuizId = null;
    showQuizMainTab('play');
  } catch (e) { toast(e.message, 'error'); }
}

async function editQuiz(id) {
  try {
    const quiz = await api(`/api/quizzes/${id}`);
    editingQuizId = id;

    // Switch to create tab UI
    showQuizMainTab('create');
    $('quiz-create-title-text').textContent = '퀴즈 수정하기';

    // Populate form
    $('quiz-title').value = quiz.title;
    $('quiz-subject').value = quiz.subject?._id || '';
    $('quiz-thumbnail').value = '';
    $('quiz-thumb-label').querySelector('span').textContent = quiz.thumbnailUrl ? '표지 변경 (이미 등록됨)' : '표지 이미지 선택 (미선택 시 기본 표지)';

    const container = $('quiz-questions-container');
    container.innerHTML = '<h3 style="margin-bottom:12px">문제 목록</h3>';

    quiz.questions.forEach((q, qIdx) => {
      const div = document.createElement('div');
      div.className = 'quiz-q-block card';
      div.style.cssText = 'margin-bottom:12px;padding:16px';
      div.innerHTML = `
          <div class="flex items-center justify-between" style="margin-bottom:8px">
            <strong>문제 ${qIdx + 1}</strong>
            <button class="btn btn-danger btn-sm" onclick="this.closest('.quiz-q-block').remove()" style="font-size:.75rem">삭제</button>
          </div>
          <div class="form-group">
            <input type="text" class="form-input qq-question" placeholder="질문을 입력하세요" value="${q.question}">
          </div>
          <div class="qq-choices-container"></div>
          <button class="btn btn-secondary btn-sm" style="margin-bottom:12px;font-size:.75rem" onclick="addChoiceToQuestion(this)">+ 선택지 추가</button>
          <div class="form-group">
            <label>정답 번호 (1부터 시작)</label>
            <input type="number" class="form-input qq-answer" min="1" value="${q.answerIndex + 1}">
          </div>`;
      container.appendChild(div);
      const choicesContainer = div.querySelector('.qq-choices-container');
      q.choices.forEach((choice, cIdx) => {
        const cDiv = document.createElement('div');
        cDiv.className = 'form-group qq-choice-wrapper flex gap-sm items-center';
        cDiv.style.marginBottom = '8px';
        cDiv.innerHTML = `
          <span style="font-size:.85rem;color:var(--text2);min-width:20px">${cIdx + 1}.</span>
          <input type="text" class="form-input qq-choice" placeholder="보기 ${cIdx + 1}" style="flex:1" value="${choice}">
          <button class="btn btn-danger btn-sm" onclick="removeChoice(this)" style="padding:4px 8px">×</button>
        `;
        choicesContainer.appendChild(cDiv);
      });
    });
  } catch (e) { toast(e.message, 'error'); }
}

// ─── 퀴즈 선택 모달 ───
function openQuizSelect(id, totalCount) {
  const html = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>게임 모드 선택</h2>
        <div class="form-group" style="margin-bottom:20px">
          <label>문항 수 (최대 ${totalCount})</label>
          <input type="number" id="quiz-play-count" class="form-input" value="${totalCount}" min="1" max="${totalCount}">
        </div>
        <p style="color:var(--text2);margin-bottom:12px;font-size:.9rem">원하는 모드를 선택하세요</p>
        <div style="display:flex;flex-direction:column;gap:12px">
          <button class="btn btn-primary" style="justify-content:center" onclick="closeModal();startQuizGame('${id}','quiz')">일반 퀴즈</button>
          <button class="btn btn-primary" style="justify-content:center;background:#10b981" onclick="closeModal();startQuizGame('${id}','match')">매칭 게임</button>
          <button class="btn btn-primary" style="justify-content:center;background:#f59e0b" onclick="closeModal();startQuizGame('${id}','speed')">스피드 퀴즈</button>
        </div>
        <button class="btn btn-secondary" style="margin-top:12px;width:100%;justify-content:center" onclick="closeModal()">취소</button>
      </div>
    </div>`;
  $('modal-container').innerHTML = html;
  show('modal-container');
}

async function startQuizGame(id, mode) {
  try {
    const playCountInput = $('quiz-play-count');
    const requestedCount = playCountInput ? parseInt(playCountInput.value) : 0;

    quizData = await api(`/api/quizzes/${id}`);

    // 1. Shuffle questions
    let shuffled = [...quizData.questions].sort(() => Math.random() - 0.5);
    const finalCount = (requestedCount > 0 && requestedCount <= shuffled.length) ? requestedCount : shuffled.length;
    shuffled = shuffled.slice(0, finalCount);

    // 2. Shuffle choices for each question
    shuffled.forEach(q => {
      const originalChoices = [...q.choices];
      const correctChoice = originalChoices[q.answerIndex];

      // Shuffle choices
      q.choices.sort(() => Math.random() - 0.5);

      // Update answerIndex
      q.answerIndex = q.choices.indexOf(correctChoice);
    });

    quizData.questions = shuffled;

    quizMode = mode;
    quizScore = 0;
    quizQuestionIndex = 0;
    quizStartTime = Date.now();
    $('quiz-game-title').textContent = quizData.title;
    show('quiz-game-container');

    if (mode === 'quiz') renderStandardQuiz();
    else if (mode === 'match') renderMatchGame();
    else if (mode === 'speed') renderSpeedQuiz();
  } catch (e) { toast(e.message, 'error'); }
}

function exitQuizGame() {
  hide('quiz-game-container');
  if (speedTimer) clearInterval(speedTimer);
  speedTimer = null;
  quizData = null;
}

// ─── 모드 1: 일반 퀴즈 ───
function renderStandardQuiz() {
  const q = quizData.questions[quizQuestionIndex];
  if (!q) return showQuizResult();
  const total = quizData.questions.length;
  $('quiz-game-area').innerHTML = `
      <div class="card" style="padding:24px">
        <div style="color:var(--text2);margin-bottom:8px;font-size:.85rem">문제 ${quizQuestionIndex + 1} / ${total}</div>
        <h3 style="margin-bottom:20px;font-size:1.1rem">${q.question}</h3>
        <div style="display:flex;flex-direction:column;gap:10px">
          ${q.choices.map((c, i) => `
            <button class="btn btn-secondary" style="justify-content:flex-start;padding:12px 16px;font-size:1rem" 
              onclick="checkStandardAnswer(${i}, ${q.answerIndex})">
              <span style="font-weight:700;margin-right:10px;color:var(--accent)">${i + 1}</span> ${c}
            </button>`).join('')}
        </div>
        <div style="margin-top:16px;text-align:right;color:var(--accent);font-weight:700">현재 점수: ${quizScore}점</div>
      </div>`;
}

function checkStandardAnswer(selected, correct) {
  const buttons = $('quiz-game-area').querySelectorAll('button');
  buttons.forEach((btn, i) => {
    btn.disabled = true;
    if (i === correct) btn.style.background = '#bbf7d0';
    else if (i === selected && selected !== correct) btn.style.background = '#fecaca';
  });
  if (selected === correct) quizScore += 100;

  setTimeout(() => {
    quizQuestionIndex++;
    renderStandardQuiz();
  }, 1000);
}

// ─── 모드 2: 매칭 게임 ───
let matchSelected = null;
let matchSelectedSide = null; // 'q' or 'a'
let matchPairs = [];
let matchMatched = 0;
let matchStartTime = 0;

function renderMatchGame() {
  const questions = quizData.questions.slice(0, 6); // max 6 for matching
  matchPairs = questions.map((q, i) => ({ id: i, question: q.question, answer: q.choices[q.answerIndex] }));
  matchMatched = 0;
  matchSelected = null;
  matchSelectedSide = null;
  matchStartTime = Date.now();

  const shuffledAnswers = [...matchPairs].sort(() => Math.random() - 0.5);

  $('quiz-game-area').innerHTML = `
      <p style="color:var(--text2);margin-bottom:16px">문제(Q)와 정답(A) 중 아무 쪽이나 먼저 누르고 짝을 맞추세요!</p>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
        <div id="match-left" style="display:flex;flex-direction:column;gap:8px">
          ${matchPairs.map(p => `
            <button class="btn btn-secondary match-q" data-id="${p.id}" 
              style="text-align:left;padding:10px 14px;font-size:.9rem;min-height:48px;white-space:normal"
              onclick="handleMatchClick(${p.id}, 'q')">Q. ${p.question}</button>`).join('')}
        </div>
        <div id="match-right" style="display:flex;flex-direction:column;gap:8px">
          ${shuffledAnswers.map(p => `
            <button class="btn btn-secondary match-a" data-id="${p.id}" 
              style="text-align:left;padding:10px 14px;font-size:.9rem;min-height:48px;white-space:normal"
              onclick="handleMatchClick(${p.id}, 'a')">A. ${p.answer}</button>`).join('')}
        </div>
      </div>
      <div id="match-timer" style="margin-top:16px;text-align:center;color:var(--accent);font-weight:700">⏱️ 매칭 중...</div>`;
}

function handleMatchClick(id, side) {
  const qBtns = document.querySelectorAll('.match-q');
  const aBtns = document.querySelectorAll('.match-a');

  // If nothing selected yet, or selecting same side again -> change selection
  if (matchSelected === null || matchSelectedSide === side) {
    qBtns.forEach(b => b.style.outline = 'none');
    aBtns.forEach(b => b.style.outline = 'none');

    const btn = document.querySelector(`.match-${side}[data-id="${id}"]`);
    if (btn && !btn.disabled) {
      btn.style.outline = '3px solid var(--accent)';
      matchSelected = id;
      matchSelectedSide = side;
    }
    return;
  }

  // If selecting differnt side -> check match
  const qId = side === 'q' ? id : matchSelected;
  const aId = side === 'a' ? id : matchSelected;

  const qBtn = document.querySelector(`.match-q[data-id="${qId}"]`);
  const aBtn = document.querySelector(`.match-a[data-id="${aId}"]`);

  if (qId === aId) {
    // Correct!
    qBtn.style.background = '#bbf7d0'; qBtn.disabled = true; qBtn.style.outline = 'none';
    aBtn.style.background = '#bbf7d0'; aBtn.disabled = true; aBtn.style.outline = 'none';
    matchMatched++;
    matchSelected = null;
    matchSelectedSide = null;

    if (matchMatched === matchPairs.length) {
      const elapsed = ((Date.now() - matchStartTime) / 1000).toFixed(1);
      quizScore = Math.max(100, Math.round(1000 - (elapsed * 10)));
      $('match-timer').innerHTML = `완료! ${elapsed}초 — ${quizScore}점`;
      setTimeout(() => showQuizResult(), 1500);
    }
  } else {
    // Wrong
    const currentBtn = document.querySelector(`.match-${side}[data-id="${id}"]`);
    currentBtn.style.background = '#fecaca';
    setTimeout(() => { currentBtn.style.background = ''; }, 500);

    // Clear previous selection
    matchSelected = null;
    matchSelectedSide = null;
    qBtns.forEach(b => b.style.outline = 'none');
    aBtns.forEach(b => b.style.outline = 'none');
  }
}

// ─── 모드 3: 스피드 퀴즈 ───
function renderSpeedQuiz() {
  quizQuestionIndex = 0;
  quizScore = 0;
  speedTimeLeft = 30;
  quizQuestionCount = quizData.questions.length;

  renderSpeedQuestion();
  if (speedTimer) clearInterval(speedTimer);
  speedTimer = setInterval(() => {
    speedTimeLeft--;
    const timerEl = document.getElementById('speed-timer');
    if (timerEl) timerEl.textContent = `${speedTimeLeft}초`;
    if (speedTimeLeft <= 0) {
      clearInterval(speedTimer);
      speedTimer = null;
      showQuizResult();
    }
  }, 1000);
}

function renderSpeedQuestion() {
  if (quizQuestionIndex >= quizQuestionCount) {
    if (speedTimer) clearInterval(speedTimer);
    speedTimer = null;
    return showQuizResult();
  }
  const q = quizData.questions[quizQuestionIndex];
  $('quiz-game-area').innerHTML = `
      <div class="card" style="padding:24px">
        <div class="flex items-center justify-between" style="margin-bottom:12px">
          <span style="color:var(--text2);font-size:.85rem">${quizQuestionIndex + 1} / ${quizQuestionCount}</span>
          <span id="speed-timer" style="font-weight:700;color:#f59e0b;font-size:1.2rem">${speedTimeLeft}초</span>
        </div>
        <h3 style="margin-bottom:16px;font-size:1.1rem">${q.question}</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
          ${q.choices.map((c, i) => `
            <button class="btn btn-secondary" style="justify-content:center;padding:14px;font-size:.95rem;white-space:normal" 
              onclick="checkSpeedAnswer(${i}, ${q.answerIndex})">${c}</button>`).join('')}
        </div>
        <div style="margin-top:16px;text-align:center;font-weight:700;color:var(--accent);font-size:1.1rem">${quizScore}점</div>
      </div>`;
}

function checkSpeedAnswer(selected, correct) {
  if (selected === correct) {
    quizScore += 100;
    toast('O 정답! +100', 'success');
  } else {
    quizScore = Math.max(0, quizScore - 50);
    toast('X 오답! -50', 'error');
  }
  quizQuestionIndex++;
  renderSpeedQuestion();
}

// ─── 결과 화면 & 점수 제출 ───
async function showQuizResult() {
  const duration = Math.floor((Date.now() - quizStartTime) / 1000);
  try {
    await api(`/api/quizzes/${quizData._id}/score`, { method: 'POST', body: { score: quizScore, mode: quizMode, duration } });
  } catch (e) { }

  const modeNames = { quiz: '일반 퀴즈', match: '매칭 게임', speed: '스피드 퀴즈' };
  $('quiz-game-area').innerHTML = `
      <div class="card" style="padding:32px;text-align:center">
        <h2 style="margin-bottom:8px">게임 종료!</h2>
        <p style="color:var(--text2);margin-bottom:20px">${modeNames[quizMode]}</p>
        <div style="font-size:3rem;font-weight:800;color:var(--accent);margin-bottom:8px">${quizScore}점</div>
        ${(quizData.creator?._id || quizData.creator) !== currentUser.id ? `<p style="color:var(--text2);margin-bottom:24px">업로더에게 100pt가 지급되었습니다!</p>` : '<div style="margin-bottom:24px"></div>'}
        <div class="flex gap-sm" style="justify-content:center">
          <button class="btn btn-primary" onclick="startQuizGame('${quizData._id}', '${quizMode}')">다시 하기</button>
          <button class="btn btn-secondary" onclick="exitQuizGame()">나가기</button>
        </div>
      </div>`;
}

// ─── 주간 리더보드 ───
async function loadLeaderboard() {
  try {
    const data = await api('/api/quizzes/leaderboard/weekly');
    $('leaderboard-list').innerHTML = data.length
      ? data.map((u, i) => `
          <div class="user-item">
            <div class="avatar" style="${i === 0 ? 'background:linear-gradient(135deg,#f59e0b,#ef4444);color:white' : ''}">${i === 0 ? '1' : i + 1}</div>
            <div class="name">${u.username}</div>
            <div class="pts">${u.totalScore.toLocaleString()}점 (${u.gamesPlayed}판)</div>
          </div>`).join('')
      : '<p style="color:var(--text2);text-align:center;padding:20px">이번 주 기록이 없습니다.</p>';
  } catch (e) { toast(e.message, 'error'); }
}

// ─── INIT ───
(function init() {
  if (adminToken) {
    showAdminDashboard();
  } else if (token && currentUser) {
    showDashboard();
  }
})();

// ─── 열품타 (Study Timer) ───

function initTimerSocket() {
  if (timerSocket) return;
  timerSocket = io();
  timerSocket.on('study-status-updated', () => {
    // Refresh desk view when any user starts/stops
    if (currentPage === 'timer') {
      loadDeskView();
    }
  });
}

async function checkStaleSession() {
  try {
    const res = await api('/api/timer/status');
    if (res.studying && res.session) {
      const elapsed = (Date.now() - new Date(res.session.startedAt).getTime()) / 1000;
      const hours = Math.floor(elapsed / 3600);
      const mins = Math.floor((elapsed % 3600) / 60);
      if (confirm(`이전 공부 세션이 아직 열려있습니다. (${hours}시간 ${mins}분 경과)\n종료할까요?`)) {
        await api('/api/timer/stop', { method: 'POST' });
        toast('이전 공부 세션이 종료되었습니다.', 'success');
      } else {
        // Resume: show timer
        timerStudying = true;
        timerSessionStart = new Date(res.session.startedAt);
        updateTimerUI();
        startTimerCountup();
      }
    }
  } catch (e) { }
}

let timerTodayBase = 0; // seconds already studied today before current session

async function loadTimerPage() {
  loadDeskView();
  // Check if currently studying + get today's cumulative time
  try {
    const res = await api('/api/timer/status');
    timerTodayBase = res.todaySeconds || 0;

    if (res.studying && res.session) {
      timerStudying = true;
      timerSessionStart = new Date(res.session.startedAt);
      // todayBase already includes current session elapsed from server
      // Subtract current session so we don't double-count in tick
      const sessionElapsed = Math.floor((Date.now() - timerSessionStart.getTime()) / 1000);
      timerTodayBase = Math.max(0, timerTodayBase - sessionElapsed);
      updateTimerUI();
      startTimerCountup();
    } else {
      timerStudying = false;
      updateTimerUI();
    }
  } catch (e) { }
}

async function startStudyTimer() {
  try {
    const res = await api('/api/timer/start', { method: 'POST' });
    timerStudying = true;
    timerSessionStart = new Date(res.startedAt);
    updateTimerUI();
    startTimerCountup();
    toast('공부 시작! 파이팅!', 'success');
    if (timerSocket) timerSocket.emit('study-start', { username: currentUser.username });
    loadDeskView();
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function stopStudyTimer() {
  try {
    await api('/api/timer/stop', { method: 'POST' });
    // Update todayBase with whatever was accumulated
    if (timerSessionStart) {
      timerTodayBase += Math.floor((Date.now() - timerSessionStart.getTime()) / 1000);
    }
    timerStudying = false;
    timerSessionStart = null;
    clearInterval(timerInterval);
    timerInterval = null;
    updateTimerUI();
    toast('공부 중단! 수고하셨습니다.', 'success');
    if (timerSocket) timerSocket.emit('study-stop', { username: currentUser.username });
    loadDeskView();
  } catch (e) {
    toast(e.message, 'error');
  }
}

function updateTimerUI() {
  const startBtn = $('timer-start-btn');
  const stopBtn = $('timer-stop-btn');
  const statusCard = $('timer-my-status');
  if (timerStudying) {
    startBtn.style.display = 'none';
    stopBtn.style.display = '';
    statusCard.style.display = '';
  } else {
    // Show start or continue button
    if (timerTodayBase > 0) {
      startBtn.textContent = '공부 이어하기';
    } else {
      startBtn.textContent = '공부 시작하기';
    }
    startBtn.style.display = '';
    stopBtn.style.display = 'none';
    // Still show today total if studied today
    if (timerTodayBase > 0) {
      statusCard.style.display = '';
      const h = String(Math.floor(timerTodayBase / 3600)).padStart(2, '0');
      const m = String(Math.floor((timerTodayBase % 3600) / 60)).padStart(2, '0');
      const s = String(timerTodayBase % 60).padStart(2, '0');
      $('timer-display').textContent = `${h}:${m}:${s}`;
    } else {
      statusCard.style.display = 'none';
      $('timer-display').textContent = '00:00:00';
    }
  }
}

function startTimerCountup() {
  if (timerInterval) clearInterval(timerInterval);
  function tick() {
    if (!timerSessionStart) return;
    const sessionElapsed = Math.floor((Date.now() - timerSessionStart.getTime()) / 1000);
    const total = timerTodayBase + sessionElapsed;
    const h = String(Math.floor(total / 3600)).padStart(2, '0');
    const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
    const s = String(total % 60).padStart(2, '0');
    $('timer-display').textContent = `${h}:${m}:${s}`;

    // Update today total text
    const totalH = Math.floor(total / 3600);
    const totalM = Math.floor((total % 3600) / 60);
    const el = $('timer-today-total');
    if (el) el.textContent = `오늘 총 공부 시간: ${totalH}시간 ${totalM}분`;
  }
  tick();
  timerInterval = setInterval(tick, 1000);
}

async function loadDeskView() {
  try {
    const users = await api('/api/timer/room');
    const grid = $('desk-grid');
    if (!users.length) {
      grid.innerHTML = '<p style="color:var(--text2);font-size:.9rem">등록된 계정이 없습니다.</p>';
      return;
    }
    grid.innerHTML = users.map(u => {
      const isMe = u._id === currentUser.id;
      const todayH = Math.floor(u.todaySeconds / 3600);
      const todayM = Math.floor((u.todaySeconds % 3600) / 60);
      const timeStr = u.todaySeconds > 0 ? `${todayH}시간 ${todayM}분` : '';
      const hasStudiedToday = u.todaySeconds > 0;

      // Update my today total
      if (isMe) {
        const el = $('timer-today-total');
        if (el) el.textContent = `오늘 총 공부 시간: ${todayH}시간 ${todayM}분`;
      }

      // Desk charring: darken wood color based on today study hours (subtle)
      const charLevel = Math.min(u.todaySeconds / 3600 / 8, 1); // max at 8hrs
      const rBase = [224, 212, 196]; // e0b87a, d4a66a, c4935a base colors
      const darken = (r) => Math.round(r * (1 - charLevel * 0.35));
      const topColor = `rgb(${darken(rBase[0])},${darken(184)},${darken(122)})`;
      const midColor = `rgb(${darken(rBase[1])},${darken(166)},${darken(106)})`;
      const botColor = `rgb(${darken(rBase[2])},${darken(147)},${darken(90)})`;

      // 3 states: studying (fire+person), studied today (person only), idle (desk only)
      const showPerson = u.studying || hasStudiedToday;
      const showFire = u.studying && u.fireLevel > 0;

      return `
        <div class="desk-card ${isMe ? 'desk-card-me' : ''}">
          <div class="desk-scene">
            ${showFire ? `
              <div class="fire-effect fire-level-${u.fireLevel}">
                <div class="fire-flame"></div>
                <div class="fire-flame f2"></div>
                <div class="fire-flame f3"></div>
              </div>
            ` : ''}
            ${showPerson ? `
              <div class="person-icon">
                <img src="/person.png" alt="person" draggable="false">
              </div>
            ` : ''}
            <div class="desk-img">
              <img src="/desk.png" alt="desk" draggable="false">
            </div>
          </div>
          <div class="desk-name ${isMe ? 'desk-name-me' : ''}">${u.username}</div>
          ${u.studying
          ? `<div class="desk-time">${timeStr}</div>`
          : hasStudiedToday
            ? `<div class="desk-time desk-done">${timeStr}</div>`
            : '<div class="desk-time desk-offline">오프라인</div>'
        }
        </div>
      `;
    }).join('');
  } catch (e) {
    $('desk-grid').innerHTML = '<p style="color:var(--text2);font-size:.9rem">로딩 실패</p>';
  }
}


async function loadWeeklyRanking(targetEl) {
  const elId = targetEl || 'timer-ranking';
  try {
    const ranking = await api('/api/timer/ranking');
    const el = $(elId);
    if (!el) return;
    if (!ranking.length) {
      el.innerHTML = '<p style="color:var(--text2);font-size:.9rem">이번 주 공부 기록이 없습니다.</p>';
      return;
    }
    el.innerHTML = renderRankingList(ranking, 'study');
  } catch (e) {
    const el = $(elId);
    if (el) el.innerHTML = '<p style="color:var(--text2);font-size:.9rem">로딩 실패</p>';
  }
}

function renderRankingList(items, type) {
  return items.map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
    let valueStr = '';
    if (type === 'study') {
      const h = Math.floor(r.totalDuration / 3600);
      const m = Math.floor((r.totalDuration % 3600) / 60);
      valueStr = `${h}시간 ${m}분`;
    } else if (type === 'quiz') {
      valueStr = `${r.totalScore}점`;
    } else if (type === 'worksheet') {
      valueStr = `${r.totalViews}회`;
    }
    return `
      <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border)">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="font-size:1.2rem;min-width:32px">${medal}</span>
          <span style="font-weight:600">${r.username}</span>
        </div>
        <span style="color:var(--primary);font-weight:600;font-family:'Outfit',sans-serif">${valueStr}</span>
      </div>
    `;
  }).join('');
}

// ─── RANKING PAGE ───
async function loadRankingPage() {
  // Study ranking
  loadWeeklyRanking('ranking-study');

  // Quiz ranking
  try {
    const quizData = await api('/api/quizzes/ranking');
    const el = $('ranking-quiz');
    if (!quizData.length) {
      el.innerHTML = '<p style="color:var(--text2);font-size:.9rem">이번 주 퀴즈 기록이 없습니다.</p>';
    } else {
      el.innerHTML = renderRankingList(quizData, 'quiz');
    }
  } catch (e) {
    $('ranking-quiz').innerHTML = '<p style="color:var(--text2);font-size:.9rem">로딩 실패</p>';
  }

  // Worksheet views ranking
  try {
    const wsData = await api('/api/worksheets/ranking');
    const el = $('ranking-worksheet');
    if (!wsData.length) {
      el.innerHTML = '<p style="color:var(--text2);font-size:.9rem">학습지 기록이 없습니다.</p>';
    } else {
      el.innerHTML = renderRankingList(wsData, 'worksheet');
    }
  } catch (e) {
    $('ranking-worksheet').innerHTML = '<p style="color:var(--text2);font-size:.9rem">로딩 실패</p>';
  }
}

// ─── TRANSFER PAGE ───
async function loadTransferPage() {
  if (currentUser) {
    $('transfer-my-points').textContent = currentUser.points?.toLocaleString() || '0';
  }

  // Load user list for dropdown
  const select = $('transfer-to');
  try {
    const users = await api('/api/users');
    let html = '<option value="">받을 사람 선택...</option>';
    users.forEach(u => {
      // Exclude self and maybe admin (though admin can receive points, let's just exclude self)
      if (currentUser && u.username === currentUser.username) return;
      html += `<option value="${u.username}">${u.username}</option>`;
    });
    select.innerHTML = html;
  } catch (err) {
    select.innerHTML = '<option value="">불러오기 실패</option>';
  }
}

async function sendTransfer() {
  const to = $('transfer-to').value.trim();
  const amount = parseInt($('transfer-amount').value);
  if (!to) return toast('받는 사람을 입력하세요.', 'error');
  if (!amount || amount < 1) return toast('금액을 입력하세요.', 'error');
  if (to === currentUser.username) return toast('자신에게 송금할 수 없습니다.', 'error');

  try {
    await api('/api/points/transfer', {
      method: 'POST',
      body: { toUsername: to, amount }
    });
    toast(`${to}님에게 ${amount}pt 송금 완료!`, 'success');
    $('transfer-to').value = '';
    $('transfer-amount').value = '';
    await refreshUser();
    loadTransferPage();
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ─── TIMER SUB-TABS ───
function showTimerSubTab(tab, btn) {
  document.querySelectorAll('[id^="timer-sub-"]').forEach(el => el.style.display = 'none');
  $(`timer-sub-${tab}`).style.display = '';
  btn.parentElement.querySelectorAll('.sort-tab').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');

  if (tab === 'studylog') loadWeeklyStudyLog();
}

async function loadWeeklyStudyLog() {
  try {
    const ranking = await api('/api/timer/ranking');
    const el = $('timer-weekly-log');
    if (!ranking.length) {
      el.innerHTML = '<p style="color:var(--text2);font-size:.9rem">이번 주 공부 기록이 없습니다.</p>';
      return;
    }
    el.innerHTML = ranking.map((r, i) => {
      const h = Math.floor(r.totalDuration / 3600);
      const m = Math.floor((r.totalDuration % 3600) / 60);
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i + 1}.`;
      const isMe = r.username === currentUser.username;
      return `
        <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--border);${isMe ? 'background:#f0f7ff;padding-left:8px;padding-right:8px;border-radius:8px' : ''}">
          <div style="display:flex;align-items:center;gap:12px">
            <span style="font-size:1.2rem;min-width:32px">${medal}</span>
            <span style="font-weight:600;${isMe ? 'color:var(--primary)' : ''}">${r.username}${isMe ? ' (나)' : ''}</span>
          </div>
          <span style="color:var(--primary);font-weight:600;font-family:'Outfit',sans-serif">${h}시간 ${m}분</span>
        </div>
      `;
    }).join('');
  } catch (e) {
    $('timer-weekly-log').innerHTML = '<p style="color:var(--text2);font-size:.9rem">로딩 실패</p>';
  }
}

