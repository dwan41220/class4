/* ── SMART WORKSHEET HUB — Frontend App ── */

const API = '';
let token = localStorage.getItem('token');
let adminToken = localStorage.getItem('adminToken');
let currentUser = JSON.parse(localStorage.getItem('currentUser') || 'null');
let currentPage = 'upload';
let authMode = 'check'; // check → activate → login
let authUserActivated = false;
let isUploading = false;

// ─── HELPERS ───
function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🙈';
        btn.classList.add('visible');
    } else {
        input.type = 'password';
        btn.textContent = '👁';
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
    if (page === 'friends') loadFriendsPage();
    if (page === 'classmates') loadClassmates();
    if (page === 'history') loadHistory();
    if (page === 'upload') loadSubjectsForUpload();
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
    if (input.files.length) {
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
        <div class="thumb">${s.thumbnailUrl ? `<img src="${s.thumbnailUrl}" alt="${s.name}">` : ''}</div>
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
      <div class="thumb">${w.thumbnailUrl ? `<img src="${w.thumbnailUrl}" alt="${w.title}">` : ''}</div>
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
        toast('다운로드 링크를 가져오는 중...', 'info');

        const response = await fetch(`${API}/api/worksheets/${id}/download`, {
            headers: { 'Authorization': `Bearer ${token}` },
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || '다운로드 링크 가져오기 실패');
        }

        if (data.url) {
            window.open(data.url, '_blank');
            toast('다운로드가 시작되었습니다.', 'success');
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
            ${w.thumbnailUrl ? `<img src="${w.thumbnailUrl}" style="width:100%;border-radius:var(--radius);margin-bottom:12px" alt="${w.title}">` : ''}
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

        $('profile-stats').innerHTML = `
      <div class="stat-card"><div class="value">${data.user.points?.toLocaleString()}</div><div class="label">보유 포인트</div></div>
      <div class="stat-card"><div class="value">${data.user.totalEarned?.toLocaleString()}</div><div class="label">누적 획득</div></div>
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
function loadFriendsPage() {
    loadFriendsBestWorksheets();
    loadTransferList();
}

async function loadFriendsBestWorksheets() {
    try {
        const worksheets = await api('/api/worksheets/friends/best');
        const container = $('friends-best-worksheets');

        container.innerHTML = worksheets.length
            ? worksheets.map(w => `
        <div class="card worksheet-card" onclick="openWorksheet('${w._id}')">
          <div class="thumbnail">
            ${w.thumbnailUrl ? `<img src="${w.thumbnailUrl}" alt="${w.title}">` : '<div class="placeholder">PDF/IMG</div>'}
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
                        : `<button class="btn btn-primary btn-sm" onclick="follow('${u._id}')">팔로우</button>`}
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
    if (page === 'admin-settings') checkGoogleDriveStatus();
}

async function checkGoogleDriveStatus() {
    try {
        const data = await api('/api/admin/gdrive/status', { admin: true });
        const statusText = $('gdrive-status-text');
        const connectBtn = $('gdrive-connect-btn');
        const disconnectBtn = $('gdrive-disconnect-btn');

        if (data.connected) {
            statusText.innerHTML = '✅ 연동됨 (대용량 업로드 정상 작동 중)';
            statusText.style.color = '#16a34a';
            connectBtn.style.display = 'none';
            disconnectBtn.style.display = 'inline-block';
        } else {
            statusText.innerHTML = '⚠️ 연동되지 않음 (대용량 업로드 제한됨)';
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

async function loadAdminUsers() {
    try {
        const users = await api('/api/admin/users', { admin: true });
        $('admin-users-tbody').innerHTML = users.map(u => `
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
    } catch (e) { toast(e.message, 'error'); }
}

function openAddUserModal() {
    const html = `
    <div class="modal-overlay" onclick="closeModal(event)">
      <div class="modal" onclick="event.stopPropagation()">
        <h2>👤 새 계정 추가</h2>
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
          <button class="btn btn-danger btn-sm" onclick="deleteAdminSubject('${s._id}','${s.name.replace(/'/g, "\\'")}', ${count})">삭제</button>
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

// ─── INIT ───
(function init() {
    if (adminToken) {
        showAdminDashboard();
    } else if (token && currentUser) {
        showDashboard();
    }
})();
