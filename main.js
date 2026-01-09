// 简单本地状态
const state = {
    sending: false,
    currentApp: "chat", // chat | moments | diary
    currentScreen: "home", // home | chat | settings
    moments: [], // 朋友圈列表
    diary: [], // 日记列表
    // 多个角色（好友）和多个用户人设
    chars: [], // {id, name, persona, ...}
    userProfiles: [], // {id, name, persona, avatar}
    // 每个角色的状态栏：{ [charId]: { current: { favor, thoughts, outfit, action }, history: [{ time, favor, thoughts, outfit, action }] } }
    charStates: {},
    // 世界书：用于存放世界观 / 规则等设定
    worldBooks: [], // {id, name, content}
    currentCharId: null,
    currentUserProfileId: null,
    // AI 记忆
    memoryEnabled: false,
    memoryEvery: 20,
    memorySummary: "",
    memorySinceLastSummary: 0,
    // 按好友分组的会话记录：{ [charId]: { messages: [{role, content, time}], unread } }
    sessions: {},
    // 自动朋友圈/日记：记录上一次自动生成时该会话的消息条数，避免重复触发
    lastAutoMomentMsgCount: 0,
    lastAutoDiaryMsgCount: 0,
    // 当前正在编辑的用户人设 ID（用于“我”的人设编辑）
    editingUserProfileId: null,
    // 当前正在编辑的世界书 ID（用于“我”的世界书编辑）
    editingWorldBookId: null,
    // 当前会话场景（默认 / 学习 / 恋爱 / 工作 等）
    currentSceneKey: "default",
    // 外观与壁纸设置
    homeWallpaperUrl: "",
    chatWallpaperUrl: "",
};

// 预置的多场景模式列表（可按需扩展）
const SCENE_PRESETS = [
    {
        key: "default",
        name: "默认模式",
        prompt: "",
    },
    {
        key: "study",
        name: "学习模式：一起学习/写作业",
        prompt:
            "当前场景是【学习模式】。请更专注、更条理清晰地解释知识、讲步骤、给示例，像一位耐心的学习伙伴，避免太多无关卖萌。",
    },
    {
        key: "love",
        name: "恋爱模式：甜甜恋人",
        prompt:
            "当前场景是【恋爱模式】。请在保证真诚和尊重的前提下，用更亲昵、温柔、关心对方感受的语气聊天，像一位贴心的恋人，但不要越界到现实中不合适的言行。",
    },
    {
        key: "work",
        name: "工作模式：同事/搭子",
        prompt:
            "当前场景是【工作模式】。请更偏向任务协作、效率和清晰结论，说话像靠谱的同事或合伙人，可以适度幽默但不要太撒娇。",
    },
];

function getCurrentSceneConfig() {
    return (
        SCENE_PRESETS.find((s) => s.key === state.currentSceneKey) || SCENE_PRESETS[0]
    );
}

// 当前正在进行操作的消息（用于长按菜单），不写入本地存储
let currentMessageAction = null; // { charId, index }
let messageLongPressTimer = null;

function $(id) {
    return document.getElementById(id);
}

function isAvatarUrl(value) {
    if (!value) return false;
    const v = String(value).trim();
    if (!v) return false;
    return /^https?:\/\//i.test(v) || v.startsWith("data:image");
}

function syncDiscoverAvatar() {
    const currentUser = state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
    const name = currentUser?.name || "我";
    const avatar = currentUser?.avatar || "";
    const entryAvatar = $("discoverMomentsAvatar");
    const headerAvatar = $("momentsProfileAvatar");
    const headerName = $("momentsProfileName");
    if (headerName) headerName.textContent = name;

    function fillAvatarBox(box) {
        if (!box) return;
        box.innerHTML = "";
        const raw = avatar && String(avatar).trim();
        if (raw && isAvatarUrl(raw)) {
            const img = document.createElement("img");
            img.src = raw;
            img.alt = name;
            box.appendChild(img);
        } else {
            box.textContent = (raw || name || "?").charAt(0);
        }
    }

    fillAvatarBox(entryAvatar);
    fillAvatarBox(headerAvatar);
}

function applyWallpapers() {
    // 主屏壁纸：如果配置了 URL，就覆盖默认 wallpaper.png
    const home = $("screenHome");
    if (home) {
        const raw = state.homeWallpaperUrl && String(state.homeWallpaperUrl).trim();
        if (raw && isAvatarUrl(raw)) {
            // 只替换图片本身，保留原有的居中 / cover 样式
            home.style.backgroundImage = `url("${raw}")`;
        } else {
            home.style.backgroundImage = 'url("wallpaper.png")';
        }
    }

    // 聊天背景壁纸：作用在整个聊天区域
    const chatArea = document.querySelector(".chat-area");
    if (chatArea) {
        const raw = state.chatWallpaperUrl && String(state.chatWallpaperUrl).trim();
        if (raw && isAvatarUrl(raw)) {
            chatArea.style.backgroundImage = `url("${raw}")`;
            chatArea.style.backgroundSize = "cover";
            chatArea.style.backgroundPosition = "center center";
            chatArea.style.backgroundRepeat = "no-repeat";
        } else {
            chatArea.style.backgroundImage = "none";
        }
    }
}

function loadSettings() {
    try {
        const raw = localStorage.getItem("aiChatSettings");
        if (!raw) return;
        const cfg = JSON.parse(raw);

        // 多角色与多用户人设
        if (Array.isArray(cfg.chars)) state.chars = cfg.chars;
        if (Array.isArray(cfg.userProfiles)) state.userProfiles = cfg.userProfiles;
        if (cfg.charStates && typeof cfg.charStates === "object")
            state.charStates = cfg.charStates;
        if (Array.isArray(cfg.worldBooks)) state.worldBooks = cfg.worldBooks;
        if (cfg.currentCharId) state.currentCharId = cfg.currentCharId;
        if (cfg.currentUserProfileId) state.currentUserProfileId = cfg.currentUserProfileId;
		if (typeof cfg.homeWallpaperUrl === "string")
			state.homeWallpaperUrl = cfg.homeWallpaperUrl;
		if (typeof cfg.chatWallpaperUrl === "string")
			state.chatWallpaperUrl = cfg.chatWallpaperUrl;

        // 聊天记录 / 朋友圈 / 日记
        if (cfg.sessions && typeof cfg.sessions === "object") state.sessions = cfg.sessions;
        if (Array.isArray(cfg.moments)) state.moments = cfg.moments;
        if (Array.isArray(cfg.diary)) state.diary = cfg.diary;
        if (typeof cfg.lastAutoMomentMsgCount === "number")
            state.lastAutoMomentMsgCount = cfg.lastAutoMomentMsgCount;
        if (typeof cfg.lastAutoDiaryMsgCount === "number")
            state.lastAutoDiaryMsgCount = cfg.lastAutoDiaryMsgCount;

        // AI 记忆 / 开关类配置
        if (typeof cfg.memoryEnabled === "boolean") state.memoryEnabled = cfg.memoryEnabled;
        if (typeof cfg.memoryEvery === "number") state.memoryEvery = cfg.memoryEvery;
        if (typeof cfg.memorySummary === "string") state.memorySummary = cfg.memorySummary;
        if (typeof cfg.autoMoments === "boolean") {
            const el = $("autoMoments");
            if (el) el.checked = cfg.autoMoments;
        }
        if (typeof cfg.autoDiary === "boolean") {
            const el = $("autoDiary");
            if (el) el.checked = cfg.autoDiary;
        }
        const memEnabledEl = $("memoryEnabled");
        if (memEnabledEl) memEnabledEl.checked = !!cfg.memoryEnabled;
        const memEveryEl = $("memoryEvery");
        if (memEveryEl && typeof cfg.memoryEvery === "number") {
            memEveryEl.value = String(cfg.memoryEvery);
        }

        // 接口配置
        if (cfg.baseUrl) $("baseUrl").value = cfg.baseUrl;
        if (cfg.model) {
            // 兼容旧版本存储的 model 字段，写入自定义模型输入框
            $("modelCustom").value = cfg.model;
        }
        if (cfg.modelSelected) {
            const select = $("modelSelect");
            const opt = document.createElement("option");
            opt.value = cfg.modelSelected;
            opt.textContent = cfg.modelSelected;
            select.appendChild(opt);
            select.value = cfg.modelSelected;
        }
        if (Array.isArray(cfg.modelList)) {
            const select = $("modelSelect");
            select.innerHTML = "";
            cfg.modelList.forEach((m) => {
                const opt = document.createElement("option");
                opt.value = m;
                opt.textContent = m;
                select.appendChild(opt);
            });
            if (cfg.modelSelected && cfg.modelList.includes(cfg.modelSelected)) {
                select.value = cfg.modelSelected;
            }
        }
        if (cfg.apiKey) $("apiKey").value = cfg.apiKey;

		// 外观与壁纸输入框
		const homeInput = $("homeWallpaperInput");
		if (homeInput) homeInput.value = state.homeWallpaperUrl || "";
		const chatInput = $("chatWallpaperInput");
		if (chatInput) chatInput.value = state.chatWallpaperUrl || "";

        // 渲染基于状态的数据
        renderCharList();
        renderUserProfileList();
        renderMoments();
        renderDiary();
        syncSelectors();
        syncDiscoverAvatar();
        syncMemoryCenterUI();
		applyWallpapers();
    } catch (e) {
        console.warn("加载本地设置失败", e);
    }
}

function internalSaveSettings(showAlert) {
    const select = $("modelSelect");
    const selectedModel = select.value || "";
    const cfg = {
        chars: state.chars,
        userProfiles: state.userProfiles,
        charStates: state.charStates,
        worldBooks: state.worldBooks,
        currentCharId: state.currentCharId,
        currentUserProfileId: state.currentUserProfileId,
        homeWallpaperUrl: state.homeWallpaperUrl || "",
        chatWallpaperUrl: state.chatWallpaperUrl || "",
        sessions: state.sessions,
        moments: state.moments,
        diary: state.diary,
        lastAutoMomentMsgCount: state.lastAutoMomentMsgCount,
        lastAutoDiaryMsgCount: state.lastAutoDiaryMsgCount,
        autoMoments: $("autoMoments") ? $("autoMoments").checked : false,
        autoDiary: $("autoDiary") ? $("autoDiary").checked : false,
        memoryEnabled: $("memoryEnabled") ? $("memoryEnabled").checked : false,
        memoryEvery: (function () {
            const v = $("memoryEvery") ? parseInt($("memoryEvery").value, 10) : 0;
            if (!Number.isFinite(v) || v <= 0) return state.memoryEvery || 20;
            return v;
        })(),
        memorySummary: state.memorySummary,
        baseUrl: $("baseUrl").value.trim() || "https://api.openai.com/v1",
        model: $("modelCustom").value.trim(),
        modelSelected: selectedModel,
        modelList: Array.from(select.options).map((o) => o.value),
        apiKey: $("apiKey").value.trim(),
    };
    localStorage.setItem("aiChatSettings", JSON.stringify(cfg));
    if (showAlert) {
        alert("已保存到本地（仅当前浏览器可见）");
    }
    return cfg;
}

function saveSettings() {
    internalSaveSettings(true);
}

function saveSettingsSilent() {
    internalSaveSettings(false);
}

function syncMemoryCenterUI() {
    const box = $("memorySummaryInput");
    if (box) box.value = state.memorySummary || "";
}

function exportData() {
    const cfg = internalSaveSettings(false) || {};
    const payload = {
        version: 1,
        exportedAt: new Date().toISOString(),
        data: cfg,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const ts = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    const name =
        "aa-phone-backup-" +
        ts.getFullYear() +
        pad(ts.getMonth() + 1) +
        pad(ts.getDate()) +
        "-" +
        pad(ts.getHours()) +
        pad(ts.getMinutes()) +
        pad(ts.getSeconds()) +
        ".json";
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        URL.revokeObjectURL(url);
        a.remove();
    }, 0);
}

function importDataFromText(text) {
    if (!text) return;
    let obj;
    try {
        obj = JSON.parse(text);
    } catch (e) {
        alert("导入失败：不是合法的 JSON 文件。");
        return;
    }
    const cfg = obj && typeof obj === "object" && obj.data ? obj.data : obj;
    if (!cfg || typeof cfg !== "object") {
        alert("导入失败：文件结构不符合预期。");
        return;
    }
    if (!window.confirm("确定要导入吗？这会覆盖当前浏览器中的所有小手机数据。")) {
        return;
    }
    if (!window.confirm("再次确认：导入后当前的聊天记录、朋友圈等将被替换。")) {
        return;
    }
    try {
        localStorage.setItem("aiChatSettings", JSON.stringify(cfg));
    } catch (e) {
        alert("写入本地存储失败，可能空间不足。");
        return;
    }
    // 重新加载到内存并刷新界面
    state.chars = [];
    state.userProfiles = [];
    state.sessions = {};
    state.moments = [];
    state.diary = [];
    state.memorySummary = "";
    state.memorySinceLastSummary = 0;
    loadSettings();
    alert("导入完成，当前浏览器的数据已更新。");
}

function exportData() {
    try {
        // 先把当前内存状态静默写入本地，再读取一次作为导出内容
        saveSettingsSilent();
        const raw = localStorage.getItem("aiChatSettings") || "{}";
        let data;
        try {
            data = JSON.parse(raw);
        } catch (e) {
            console.warn("解析本地配置失败", e);
            data = {};
        }
        const payload = {
            version: 1,
            exportedAt: new Date().toISOString(),
            data,
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], {
            type: "application/json",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        const now = new Date();
        const ts =
            now.getFullYear().toString() +
            String(now.getMonth() + 1).padStart(2, "0") +
            String(now.getDate()).padStart(2, "0") +
            "-" +
            String(now.getHours()).padStart(2, "0") +
            String(now.getMinutes()).padStart(2, "0");
        a.download = `aa-phone-backup-${ts}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    } catch (e) {
        console.error(e);
        alert("导出数据失败，可以查看控制台错误信息。");
    }
}

function importDataFromText(text) {
    let payload;
    try {
        payload = JSON.parse(text);
    } catch (e) {
        alert("选中的文件不是有效的 JSON 格式。");
        return;
    }

    let cfg = null;
    if (payload && typeof payload === "object" && payload.version && payload.data) {
        cfg = payload.data;
    } else if (payload && typeof payload === "object") {
        cfg = payload;
    }

    if (!cfg || typeof cfg !== "object") {
        alert("文件内容格式不符合预期，无法导入。");
        return;
    }

    if (!cfg.sessions && !cfg.moments && !cfg.diary) {
        const goOn = window.confirm(
            "这个文件里好像没有对话 / 朋友圈 / 日记数据，仍然要导入并覆盖当前数据吗？"
        );
        if (!goOn) return;
    }

    const ok = window.confirm(
        "导入会覆盖当前浏览器中的全部小手机数据（包括聊天记录、朋友圈、日记和配置），确定继续吗？"
    );
    if (!ok) return;

    try {
        localStorage.setItem("aiChatSettings", JSON.stringify(cfg));
        alert("导入成功，页面将自动刷新。");
        window.location.reload();
    } catch (e) {
        console.error(e);
        alert("导入数据时出错，可以查看控制台错误信息。");
    }
}

// 渲染角色（好友）和用户人设相关 UI
function renderCharList() {
    const list = $("charList");
    if (!list) return;
    list.innerHTML = "";
    state.chars.forEach((c) => {
        const li = document.createElement("li");
        li.className = "contact-item";
        const main = document.createElement("div");
        main.className = "contact-main";
        const name = document.createElement("div");
        name.className = "contact-name";
        name.textContent = c.name || "未命名好友";
        const signature = document.createElement("div");
        signature.className = "contact-signature";
        signature.textContent = c.signature || "";
        const persona = document.createElement("div");
        persona.className = "contact-persona";
        persona.textContent = c.persona || "(未填写人设)";
        main.appendChild(name);
        if (signature.textContent) main.appendChild(signature);
        main.appendChild(persona);

        const actions = document.createElement("div");
        actions.className = "list-actions";
        const btnUse = document.createElement("button");
        btnUse.className = "btn secondary";
        btnUse.textContent = "设为当前";
        btnUse.addEventListener("click", () => {
            state.currentCharId = c.id;
            syncSelectors();
            saveSettings();
        });
        const btnPin = document.createElement("button");
        btnPin.className = "btn secondary";
        btnPin.textContent = c.pinned ? "取消常用" : "设为常用";
        btnPin.addEventListener("click", () => {
            c.pinned = !c.pinned;
            renderCharList();
            renderConversationList();
            saveSettingsSilent();
        });

        const btnDel = document.createElement("button");
        btnDel.className = "btn secondary";
        btnDel.textContent = "删除";
        btnDel.addEventListener("click", () => {
            state.chars = state.chars.filter((x) => x.id !== c.id);
            if (state.currentCharId === c.id) state.currentCharId = null;
            renderCharList();
            syncSelectors();
            saveSettings();
        });
        actions.appendChild(btnUse);
        actions.appendChild(btnPin);
        actions.appendChild(btnDel);

        li.appendChild(main);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

function renderUserProfileList() {
    const list = $("userProfileList");
    if (!list) return;
    list.innerHTML = "";

    if (!state.userProfiles.length) {
        const empty = document.createElement("li");
        empty.className = "profile-item profile-empty";
        empty.textContent = "还没有人设，下面填写后点“添加人设”就会出现在这里";
        list.appendChild(empty);
        return;
    }

    state.userProfiles.forEach((p) => {
        const li = document.createElement("li");
        li.className = "profile-item";
        const avatarWrap = document.createElement("div");
        avatarWrap.className = "profile-avatar";
        const avatarRaw = p.avatar && String(p.avatar).trim();
        if (avatarRaw && isAvatarUrl(avatarRaw)) {
            const img = document.createElement("img");
            img.src = avatarRaw;
            img.alt = p.name || "头像";
            avatarWrap.appendChild(img);
        } else if (avatarRaw) {
            avatarWrap.textContent = avatarRaw.charAt(0);
        } else {
            avatarWrap.textContent = (p.name || "?").charAt(0);
        }
        const main = document.createElement("div");
        main.className = "profile-main";
        const name = document.createElement("div");
        name.className = "profile-name";
        name.textContent = p.name || "未命名人设";
        const persona = document.createElement("div");
        persona.className = "profile-persona";
        persona.textContent = p.persona || "(未填写人设)";
        main.appendChild(name);
        main.appendChild(persona);

        const actions = document.createElement("div");
        actions.className = "list-actions";
        const btnUse = document.createElement("button");
        btnUse.className = "btn secondary";
        btnUse.textContent = "设为当前";
        btnUse.addEventListener("click", () => {
            state.currentUserProfileId = p.id;
            syncSelectors();
            syncDiscoverAvatar();
            saveSettings();
        });
        const btnEdit = document.createElement("button");
        btnEdit.className = "btn secondary";
        btnEdit.textContent = "编辑";
        btnEdit.addEventListener("click", () => {
            state.editingUserProfileId = p.id;
            const nameInput = $("newUserName");
            const avatarInput = $("newUserAvatar");
            const personaInput = $("newUserPersona");
            if (nameInput) nameInput.value = p.name || "";
            if (avatarInput) avatarInput.value = p.avatar || "";
            if (personaInput) personaInput.value = p.persona || "";
            const btn = $("addUserProfileBtn");
            if (btn && !btn.dataset.originalText) {
                btn.dataset.originalText = btn.textContent || "";
            }
            if (btn) btn.textContent = "保存人设修改";
        });
        const btnDel = document.createElement("button");
        btnDel.className = "btn secondary";
        btnDel.textContent = "删除";
        btnDel.addEventListener("click", () => {
            state.userProfiles = state.userProfiles.filter((x) => x.id !== p.id);
            if (state.currentUserProfileId === p.id) state.currentUserProfileId = null;
            renderUserProfileList();
            syncSelectors();
            syncDiscoverAvatar();
            saveSettings();
        });
        actions.appendChild(btnUse);
        actions.appendChild(btnEdit);
        actions.appendChild(btnDel);

        li.appendChild(avatarWrap);
        li.appendChild(main);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

function renderWorldBookList() {
    const list = $("worldBookList");
    if (!list) return;
    list.innerHTML = "";

    if (!state.worldBooks.length) {
        const empty = document.createElement("li");
        empty.className = "profile-item profile-empty";
        empty.textContent = "还没有世界书，可以在下面添加一个世界观设定";
        list.appendChild(empty);
        return;
    }

    state.worldBooks.forEach((b) => {
        const li = document.createElement("li");
        li.className = "profile-item";

        const main = document.createElement("div");
        main.className = "profile-main";
        const name = document.createElement("div");
        name.className = "profile-name";
        name.textContent = b.name || "未命名世界书";
        const desc = document.createElement("div");
        desc.className = "profile-persona";
        const text = b.content || "";
        desc.textContent = text ? text.slice(0, 40) + (text.length > 40 ? "…" : "") : "(还没有填写世界规则内容)";
        main.appendChild(name);
        main.appendChild(desc);

        const actions = document.createElement("div");
        actions.className = "list-actions";

        const btnEdit = document.createElement("button");
        btnEdit.className = "btn secondary";
        btnEdit.textContent = "编辑";
        btnEdit.addEventListener("click", () => {
            state.editingWorldBookId = b.id;
            const nameInput = $("newWorldBookName");
            const contentInput = $("newWorldBookContent");
            if (nameInput) nameInput.value = b.name || "";
            if (contentInput) contentInput.value = b.content || "";
            const btn = "addWorldBookBtn" in window ? $("addWorldBookBtn") : $("addWorldBookBtn");
            if (btn && !btn.dataset.originalText) {
                btn.dataset.originalText = btn.textContent || "";
            }
            if (btn) btn.textContent = "保存世界书修改";
        });

        const btnDel = document.createElement("button");
        btnDel.className = "btn secondary";
        btnDel.textContent = "删除";
        btnDel.addEventListener("click", () => {
            state.worldBooks = state.worldBooks.filter((x) => x.id !== b.id);
            if (state.chars && state.chars.length) {
                state.chars.forEach((c) => {
                    if (c.worldBookId === b.id) delete c.worldBookId;
                });
            }
            renderWorldBookList();
            saveSettings();
        });

        actions.appendChild(btnEdit);
        actions.appendChild(btnDel);

        li.appendChild(main);
        li.appendChild(actions);
        list.appendChild(li);
    });
}

function syncSelectors() {
    const charSelect = $("chatCharSelect");
    const userSelect = $("chatUserProfileSelect");
    if (charSelect) {
        charSelect.innerHTML = "";
        state.chars.forEach((c) => {
            const opt = document.createElement("option");
            opt.value = c.id;
            opt.textContent = c.name || "未命名好友";
            charSelect.appendChild(opt);
        });
        if (state.currentCharId && state.chars.some((c) => c.id === state.currentCharId)) {
            charSelect.value = state.currentCharId;
        } else if (state.chars[0]) {
            state.currentCharId = state.chars[0].id;
            charSelect.value = state.currentCharId;
        }
    }
    if (userSelect) {
        userSelect.innerHTML = "";
        state.userProfiles.forEach((p) => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name || "未命名人设";
            userSelect.appendChild(opt);
        });
        if (
            state.currentUserProfileId &&
            state.userProfiles.some((p) => p.id === state.currentUserProfileId)
        ) {
            userSelect.value = state.currentUserProfileId;
        } else if (state.userProfiles[0]) {
            state.currentUserProfileId = state.userProfiles[0].id;
            userSelect.value = state.currentUserProfileId;
        }
    }
}

// 获取当前好友 ID（没有就用第一个）
function getCurrentCharId() {
    if (state.currentCharId) return state.currentCharId;
    if (state.chars[0]) return state.chars[0].id;
    return null;
}

// 获取某个好友的会话对象
function getSession(charId, createIfMissing = false) {
    if (!charId) return null;
    let s = state.sessions[charId];
    if (!s && createIfMissing) {
        s = { messages: [], unread: 0 };
        state.sessions[charId] = s;
    }
    return s || null;
}

// 获取当前好友的消息数组
function getCurrentMessages(createIfMissing = false) {
    const id = getCurrentCharId();
    const s = getSession(id, createIfMissing);
    if (!s) return [];
    return s.messages;
}

// 渲染会话列表
function renderConversationList() {
    const listEl = $("conversationList");
    if (!listEl) return;
    listEl.innerHTML = "";
    const chars = [...state.chars].sort((a, b) => {
        const pa = a.pinned ? 1 : 0;
        const pb = b.pinned ? 1 : 0;
        if (pa !== pb) return pb - pa;
        return 0;
    });

    chars.forEach((c) => {
        const session = getSession(c.id, false);
        const msgs = session ? session.messages : [];
        const last = msgs.length ? msgs[msgs.length - 1] : null;
        const item = document.createElement("div");
        const classes = ["conversation-item"];
        if (c.id === getCurrentCharId()) classes.push("active");
        if (c.pinned) classes.push("pinned");
        item.className = classes.join(" ");
        item.addEventListener("click", () => {
            state.currentCharId = c.id;
            // 切换好友时，默认回到“默认模式”场景
            state.currentSceneKey = "default";
            syncSelectors();
            renderMessages();
            renderConversationList();
            renderSceneSelector();
            updateChatDetailTitle();
            switchScreen("chat");
            switchWechatView("chatDetail");
        });

        const avatar = document.createElement("div");
        avatar.className = "conversation-avatar";
        const avatarRaw = c.avatar && String(c.avatar).trim();
        if (avatarRaw && isAvatarUrl(avatarRaw)) {
            const img = document.createElement("img");
            img.src = avatarRaw;
            img.alt = c.name || "头像";
            img.className = "conversation-avatar-img";
            avatar.appendChild(img);
        } else {
            const avatarText = (avatarRaw || c.name || "?").charAt(0);
            avatar.textContent = avatarText;
        }

        avatar.addEventListener("click", (ev) => {
            ev.stopPropagation();
            openCharProfile(c.id);
        });

        const main = document.createElement("div");
        main.className = "conversation-main";
        const top = document.createElement("div");
        top.className = "conversation-title-row";
        const name = document.createElement("div");
        name.className = "conversation-name";
        name.textContent = c.name || "未命名好友";
        const time = document.createElement("div");
        time.className = "conversation-time";
        if (last && last.time) {
            const d = new Date(last.time);
            time.textContent = d.toTimeString().slice(0, 5);
        }
        top.appendChild(name);
        top.appendChild(time);

        const preview = document.createElement("div");
        preview.className = "conversation-preview";
        if (last && last.content) preview.textContent = last.content.replace(/\s+/g, " ");
        else preview.textContent = c.persona ? c.persona.slice(0, 24) + "…" : "(还没有聊天)";

        main.appendChild(top);
        main.appendChild(preview);

        item.appendChild(avatar);
        item.appendChild(main);
        listEl.appendChild(item);
    });
}

function renderMessages() {
    const listEl = $("chatList");
    listEl.innerHTML = "";

    const msgs = getCurrentMessages();

    const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
    const currentUser =
        state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;

    msgs.forEach((msg, index) => {
        if (msg.role !== "user" && msg.role !== "assistant") return;
        const item = document.createElement("div");
        item.className = `chat-item ${msg.role}`;

        if (msg.starred) {
            item.classList.add("starred");
        }

        item.dataset.index = String(index);

        const bubble = document.createElement("div");
        bubble.className = "bubble";
        bubble.textContent = msg.content;

        const avatarBox = document.createElement("div");
        avatarBox.className = "chat-avatar";

        if (msg.role === "assistant") {
            const raw = currentChar?.avatar && String(currentChar.avatar).trim();
            if (raw && isAvatarUrl(raw)) {
                const img = document.createElement("img");
                img.src = raw;
                img.alt = currentChar?.name || "头像";
                avatarBox.appendChild(img);
            } else {
                avatarBox.textContent = (raw || currentChar?.name || "?").charAt(0);
            }
            avatarBox.title = "查看角色状态";
            avatarBox.addEventListener("click", (e) => {
                e.stopPropagation();
                openCharStateOverlay();
            });
        } else {
            const raw = currentUser?.avatar && String(currentUser.avatar).trim();
            if (raw && isAvatarUrl(raw)) {
                const img = document.createElement("img");
                img.src = raw;
                img.alt = currentUser?.name || "我";
                avatarBox.appendChild(img);
            } else {
                avatarBox.textContent = (raw || currentUser?.name || "我").charAt(0);
            }
        }

        if (msg.role === "assistant") {
            item.appendChild(avatarBox);
            item.appendChild(bubble);
        } else {
            item.appendChild(bubble);
            item.appendChild(avatarBox);
        }
        setupMessageGestureHandlers(item, index);
        listEl.appendChild(item);
    });

    // 滚动到底部
    listEl.scrollTop = listEl.scrollHeight;
}

function ensureCharState(charId) {
    if (!charId) return null;
    if (!state.charStates[charId]) {
        state.charStates[charId] = {
            current: {
                favor: "",
                thoughts: "",
                outfit: "",
                action: "",
            },
            history: [],
        };
    }
    return state.charStates[charId];
}

function openCharStateOverlay() {
    const id = getCurrentCharId();
    if (!id) {
        alert("请先选择一个好友");
        return;
    }
    const st = ensureCharState(id);
    const favorEl = $("charStateFavor");
    const thouEl = $("charStateThoughts");
    const outfitEl = $("charStateOutfit");
    const actEl = $("charStateAction");
    if (favorEl) favorEl.value = st.current.favor || "";
    if (thouEl) thouEl.value = st.current.thoughts || "";
    if (outfitEl) outfitEl.value = st.current.outfit || "";
    if (actEl) actEl.value = st.current.action || "";

    const histBox = $("charStateHistory");
    if (histBox) {
        histBox.innerHTML = "";
        if (Array.isArray(st.history) && st.history.length) {
            st.history
                .slice()
                .reverse()
                .forEach((h) => {
                    const div = document.createElement("div");
                    div.textContent = `${h.time}｜好感度：${h.favor || "-"}｜心声：${
                        h.thoughts || "-"
                    }｜穿着：${h.outfit || "-"}｜动作：${h.action || "-"}`;
                    histBox.appendChild(div);
                });
        } else {
            const div = document.createElement("div");
            div.textContent = "还没有任何状态记录，可以先写一条保存";
            histBox.appendChild(div);
        }
    }

    const overlay = "charStateOverlay" in window ? $("charStateOverlay") : $("charStateOverlay");
    if (overlay) overlay.classList.add("active");
}

function closeCharStateOverlay() {
    const overlay = $("charStateOverlay");
    if (overlay) overlay.classList.remove("active");
}

function saveCharStateFromOverlay() {
    const id = getCurrentCharId();
    if (!id) {
        alert("请先选择一个好友");
        return;
    }
    const st = ensureCharState(id);
    const favorEl = $("charStateFavor");
    const thouEl = $("charStateThoughts");
    const outfitEl = $("charStateOutfit");
    const actEl = $("charStateAction");
    const entry = {
        time: new Date().toLocaleString(),
        favor: favorEl ? favorEl.value.trim() : "",
        thoughts: thouEl ? thouEl.value.trim() : "",
        outfit: outfitEl ? outfitEl.value.trim() : "",
        action: actEl ? actEl.value.trim() : "",
    };
    st.current = {
        favor: entry.favor,
        thoughts: entry.thoughts,
        outfit: entry.outfit,
        action: entry.action,
    };
    st.history.push(entry);
    saveSettingsSilent();
    closeCharStateOverlay();
}

async function generateCharStateFromAI() {
    const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
    const currentUser =
        state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
    const currentWorldBook = currentChar?.worldBookId
        ? state.worldBooks.find((b) => b.id === currentChar.worldBookId) || null
        : null;

    const baseUrl =
        (currentChar && currentChar.baseUrl && currentChar.baseUrl.trim()) ||
        $("baseUrl").value.trim() ||
        "https://api.openai.com/v1";
    const globalCustomModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model =
        (currentChar && currentChar.model && currentChar.model.trim()) ||
        globalCustomModel ||
        selectedModel ||
        "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
    const sceneCfg = getCurrentSceneConfig();

    if (!apiKey) {
        alert("请先填写 API Key");
        return;
    }
    if (!currentChar) {
        alert("请先在微信里选择一个好友");
        return;
    }

    const roleName = currentChar?.name || "AI 好友";
    const rolePersona = currentChar?.persona || "";
    const stylePrompt = currentChar?.stylePrompt || "";
    const userName = currentUser?.name || "";
    const userPersona = currentUser?.persona || "";

    const favorEl = $("charStateFavor");
    const thouEl = $("charStateThoughts");
    const outfitEl = $("charStateOutfit");
    const actEl = $("charStateAction");
    const draftFavor = favorEl ? favorEl.value.trim() : "";
    const draftThoughts = thouEl ? thouEl.value.trim() : "";
    const draftOutfit = outfitEl ? outfitEl.value.trim() : "";
    const draftAction = actEl ? actEl.value.trim() : "";

    const btn = $("charStateAIBtn");
    const oldText = btn ? btn.textContent : "";
    if (btn) {
        btn.disabled = true;
        btn.textContent = "生成中…";
    }

    try {
        const messages = [];
        let sys =
            "你现在是一个‘角色状态观察者’，需要根据角色设定、当前场景、世界观设定以及最近的聊天片段，帮我写出这个角色此刻的状态。" +
            "请只输出一段 JSON，不要任何解释或多余文字。JSON 的键名必须是：favor, thoughts, outfit, action；值用简体中文短句。";
        if (rolePersona) sys += `\n\n角色人设：${rolePersona}`;
        if (stylePrompt) sys += `\n\n说话风格提示：${stylePrompt}`;
        if (sceneCfg && sceneCfg.key !== "default" && sceneCfg.prompt) {
            sys += `\n\n当前场景：「${sceneCfg.name}」，场景说明：${sceneCfg.prompt}`;
        }
        if (currentWorldBook && currentWorldBook.content) {
            sys += `\n\n以下是本次对话所属的世界观设定，请在理解角色状态时遵守这些规则：\n${currentWorldBook.content}`;
        }
        messages.push({ role: "system", content: sys });

        if (state.memorySummary && state.memorySummary.trim()) {
            messages.push({
                role: "system",
                content:
                    "以下是你和用户之前对话的长期记忆摘要，可用于揣摩双方关系与氛围：\n" +
                    state.memorySummary,
            });
        }

        if (userName || userPersona) {
            let up = "用户信息：";
            if (userName) up += `昵称为「${userName}」。`;
            if (userPersona) up += `用户人设：${userPersona}`;
            messages.push({ role: "system", content: up });
        }

        const history = getCurrentMessages(false).slice(-10);
        if (history.length) {
            const summary = history
                .map((m) => `${m.role === "user" ? "用户" : "角色"}：${m.content}`)
                .join("\n");
            messages.push({
                role: "system",
                content:
                    "以下是最近几轮聊天的片段，帮你判断当前的情绪和关系氛围：\n" +
                    summary,
            });
        }

        if (draftFavor || draftThoughts || draftOutfit || draftAction) {
            let draft = "下面是用户已经手动写的一些状态草稿，如果不合理可以适度润色或重写：";
            if (draftFavor) draft += `\n- 好感度：${draftFavor}`;
            if (draftThoughts) draft += `\n- 心声：${draftThoughts}`;
            if (draftOutfit) draft += `\n- 穿着：${draftOutfit}`;
            if (draftAction) draft += `\n- 动作：${draftAction}`;
            messages.push({ role: "user", content: draft });
        } else {
            messages.push({
                role: "user",
                content:
                    "请你根据上面的信息直接生成一段 JSON，键名为 favor, thoughts, outfit, action，值用简短的中文句子，且不要输出任何额外说明。",
            });
        }

        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                max_tokens: 512,
                temperature:
                    typeof currentChar?.temperature === "number" &&
                    !Number.isNaN(currentChar.temperature)
                        ? currentChar.temperature
                        : 0.7,
                stream: false,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("AI 角色状态返回:", data);
        let text = extractAIContent(data) || "";
        if (!text || !String(text).trim()) {
            alert("AI 没有返回状态内容，可以稍后重试或手动填写。");
            return;
        }
        let jsonText = String(text).trim();
        const match = jsonText.match(/\{[\s\S]*\}/);
        if (match) jsonText = match[0];

        let obj;
        try {
            obj = JSON.parse(jsonText);
        } catch (e) {
            console.warn("解析 AI 状态 JSON 失败", e, text);
            alert(
                "解析 AI 返回的状态失败，可以稍后重试，或直接手动填写。\n\n原始内容如下：\n" +
                    text
            );
            return;
        }

        const favor =
            obj && typeof obj.favor === "string" ? obj.favor.trim() : draftFavor;
        const thoughts =
            obj && typeof obj.thoughts === "string"
                ? obj.thoughts.trim()
                : draftThoughts;
        const outfit =
            obj && typeof obj.outfit === "string" ? obj.outfit.trim() : draftOutfit;
        const action =
            obj && typeof obj.action === "string" ? obj.action.trim() : draftAction;

        if (favorEl) favorEl.value = favor || "";
        if (thouEl) thouEl.value = thoughts || "";
        if (outfitEl) outfitEl.value = outfit || "";
        if (actEl) actEl.value = action || "";
    } catch (err) {
        console.error(err);
        alert(`生成角色状态失败：${err.message || err}`);
    } finally {
        if (btn) {
            btn.disabled = false;
            btn.textContent = oldText || "让 AI 填写状态";
        }
    }
}

function setupMessageGestureHandlers(item, index) {
    const start = (e) => {
        // 避免选中文本触发多余行为
        e.stopPropagation();
        if (messageLongPressTimer) {
            clearTimeout(messageLongPressTimer);
            messageLongPressTimer = null;
        }
        messageLongPressTimer = window.setTimeout(() => {
            openMessageActionOverlay(index);
        }, 500);
    };

    const cancel = () => {
        if (messageLongPressTimer) {
            clearTimeout(messageLongPressTimer);
            messageLongPressTimer = null;
        }
    };

    // 触摸长按
    item.addEventListener("touchstart", start);
    item.addEventListener("touchend", cancel);
    item.addEventListener("touchmove", cancel);
    item.addEventListener("touchcancel", cancel);

    // 鼠标长按
    item.addEventListener("mousedown", start);
    item.addEventListener("mouseup", cancel);
    item.addEventListener("mouseleave", cancel);

    // 右键菜单快捷触发
    item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        openMessageActionOverlay(index);
    });
}

function openMessageActionOverlay(index) {
    const charId = getCurrentCharId();
    const session = getSession(charId, false);
    if (!session || !session.messages || !session.messages[index]) return;
    currentMessageAction = { charId, index };
    const overlay = $("msgActionOverlay");
    if (overlay) overlay.classList.add("active");
}

function closeMessageActionOverlay() {
    const overlay = $("msgActionOverlay");
    if (overlay) overlay.classList.remove("active");
    currentMessageAction = null;
}

async function handleMessageAction(action) {
    if (!currentMessageAction) return;
    const { charId, index } = currentMessageAction;
    const session = getSession(charId, false);
    if (!session || !Array.isArray(session.messages)) return;
    const msgs = session.messages;
    const msg = msgs[index];
    if (!msg) return;

    if (action === "cancel") {
        closeMessageActionOverlay();
        return;
    }

    try {
        switch (action) {
            case "copy": {
                const text = msg.content || "";
                if (navigator.clipboard && navigator.clipboard.writeText) {
                    await navigator.clipboard.writeText(text);
                    alert("已复制到剪贴板");
                } else {
                    window.prompt("复制这条消息：", text);
                }
                break;
            }
            case "delete": {
                msgs.splice(index, 1);
                renderMessages();
                renderConversationList();
                saveSettingsSilent();
                break;
            }
            case "star": {
                msg.starred = !msg.starred;
                renderMessages();
                saveSettingsSilent();
                break;
            }
            case "moment": {
                const authorType = msg.role === "assistant" ? "char" : "user";
                const authorId =
                    authorType === "char" ? charId : state.currentUserProfileId || null;
                state.moments.push({
                    id: "moment_" + Date.now(),
                    authorType,
                    authorId,
                    content: msg.content,
                    time: new Date().toLocaleString(),
                    likedByUser: false,
                    likedByChars: [],
                    comments: [],
                });
                renderMoments();
                saveSettingsSilent();
                alert("已从这条消息生成一条朋友圈，可以在“发现-朋友圈”里查看。");
                break;
            }
            default:
                break;
        }
    } finally {
        closeMessageActionOverlay();
    }
}

function updateChatDetailTitle() {
    const titleEl = $("chatDetailName");
    if (!titleEl) return;
    const id = getCurrentCharId();
    const currentChar = state.chars.find((c) => c.id === id) || null;
    const baseName = currentChar?.name || "聊天";
    const scene = getCurrentSceneConfig();
    if (scene && scene.key !== "default") {
        titleEl.textContent = `${baseName} · ${scene.name.split("：")[0]}`;
    } else {
        titleEl.textContent = baseName;
    }
}

function renderMoments() {
    const listEl = $("momentsList");
    if (!listEl) return;
    listEl.innerHTML = "";

    const getAuthorInfo = (item) => {
        const type = item.authorType || "char";
        const id = item.authorId || getCurrentCharId();
        if (type === "user") {
            const u = state.userProfiles.find((p) => p.id === id) ||
                state.userProfiles.find((p) => p.id === state.currentUserProfileId) ||
                null;
            return {
                name: u?.name || "我",
                avatar: u?.avatar || "",
                type,
            };
        }
        const c = state.chars.find((ch) => ch.id === id) || null;
        return {
            name: c?.name || "好友",
            avatar: c?.avatar || "",
            type,
        };
    };

    state.moments.forEach((item, index) => {
        const author = getAuthorInfo(item);
        const wrap = document.createElement("div");
        wrap.className = "feed-item";

        // 头部：头像 + 名字 + 时间
        const header = document.createElement("div");
        header.className = "feed-header";

        const avatarBox = document.createElement("div");
        avatarBox.className = "feed-avatar";
        const rawAvatar = author.avatar && String(author.avatar).trim();
        if (rawAvatar && isAvatarUrl(rawAvatar)) {
            const img = document.createElement("img");
            img.src = rawAvatar;
            img.alt = author.name;
            avatarBox.appendChild(img);
        } else {
            avatarBox.textContent = (rawAvatar || author.name || "?").charAt(0);
        }

        const metaBox = document.createElement("div");
        metaBox.className = "feed-meta-box";
        const nameEl = document.createElement("div");
        nameEl.className = "feed-author-name";
        nameEl.textContent = author.name;
        const timeEl = document.createElement("div");
        timeEl.className = "feed-meta";
        timeEl.textContent = item.time || "";
        metaBox.appendChild(nameEl);
        metaBox.appendChild(timeEl);

        header.appendChild(avatarBox);
        header.appendChild(metaBox);
        wrap.appendChild(header);

        // 正文
        const content = document.createElement("div");
        content.className = "feed-content";
        content.textContent = item.content;
        wrap.appendChild(content);

        // 点赞 / 评论信息
        const likesLine = document.createElement("div");
        likesLine.className = "feed-likes";
        const likedNames = [];
        if (item.likedByUser) likedNames.push("我");
        if (Array.isArray(item.likedByChars)) {
            item.likedByChars.forEach((cid) => {
                const ch = state.chars.find((c) => c.id === cid);
                if (ch && ch.name) likedNames.push(ch.name);
            });
        }
        if (likedNames.length) {
            likesLine.textContent = "♥ " + likedNames.join("，");
            wrap.appendChild(likesLine);
        }

        const commentsBox = document.createElement("div");
        commentsBox.className = "feed-comments";
        if (Array.isArray(item.comments)) {
            item.comments.forEach((cmt) => {
                const info = getAuthorInfo({
                    authorType: cmt.fromType,
                    authorId: cmt.fromId,
                });
                const row = document.createElement("div");
                row.className = "feed-comment-row";
                row.textContent = `${info.name}：${cmt.content}`;
                commentsBox.appendChild(row);
            });
        }
        if (commentsBox.childNodes.length) {
            wrap.appendChild(commentsBox);
        }

        // 操作按钮：我赞 / 我评 / TA赞 / TA评
        const actions = document.createElement("div");
        actions.className = "feed-actions";

        const btnLikeUser = document.createElement("button");
        btnLikeUser.className = "feed-action-btn";
        btnLikeUser.textContent = item.likedByUser ? "取消点赞" : "我赞";
        btnLikeUser.addEventListener("click", () => toggleMomentLikeAsUser(index));

        const btnCommentUser = document.createElement("button");
        btnCommentUser.className = "feed-action-btn";
        btnCommentUser.textContent = "我评";
        btnCommentUser.addEventListener("click", () => addUserCommentToMoment(index));

        const btnLikeChar = document.createElement("button");
        btnLikeChar.className = "feed-action-btn";
        btnLikeChar.textContent = "TA赞";
        btnLikeChar.addEventListener("click", () => toggleMomentLikeAsChar(index));

        const btnCommentChar = document.createElement("button");
        btnCommentChar.className = "feed-action-btn";
        btnCommentChar.textContent = "TA评";
        btnCommentChar.addEventListener("click", () => addCharCommentToMoment(index));

        actions.appendChild(btnLikeUser);
        actions.appendChild(btnCommentUser);
        actions.appendChild(btnLikeChar);
        actions.appendChild(btnCommentChar);
        wrap.appendChild(actions);

        listEl.appendChild(wrap);
    });

    listEl.scrollTop = listEl.scrollHeight;
}

function renderDiary() {
    const listEl = $("diaryList");
    if (!listEl) return;
    listEl.innerHTML = "";

    const getAuthorInfo = (item) => {
        const type = item.authorType || "char";
        const id = item.authorId || getCurrentCharId();
        if (type === "user") {
            const u = state.userProfiles.find((p) => p.id === id) ||
                state.userProfiles.find((p) => p.id === state.currentUserProfileId) ||
                null;
            return {
                name: u?.name || "我",
                type,
            };
        }
        const c = state.chars.find((ch) => ch.id === id) || null;
        return {
            name: c?.name || "好友",
            type,
        };
    };

    state.diary.forEach((item) => {
        const wrap = document.createElement("div");
        wrap.className = "feed-item";

        const author = getAuthorInfo(item);

        const header = document.createElement("div");
        header.className = "feed-header";
        const nameEl = document.createElement("div");
        nameEl.className = "feed-author-name";
        nameEl.textContent = `${author.name} 的日记`;
        const timeEl = document.createElement("div");
        timeEl.className = "feed-meta";
        timeEl.textContent = item.time || "";
        header.appendChild(nameEl);
        header.appendChild(timeEl);
        wrap.appendChild(header);

        const content = document.createElement("div");
        content.className = "feed-content";
        content.textContent = item.content;
        wrap.appendChild(content);

        listEl.appendChild(wrap);
    });

    listEl.scrollTop = listEl.scrollHeight;
}

function addMessage(role, content) {
    const msgs = getCurrentMessages(true);
    msgs.push({ role, content, time: Date.now() });
    renderMessages();
    renderConversationList();
    saveSettingsSilent();
}

function switchApp(app) {
    state.currentApp = app;
    const panelMap = {
        chat: "panelChat",
        moments: "panelMoments",
        diary: "panelDiary",
    };
    const tabMap = {
        chat: "tabChat",
        moments: "tabMoments",
        diary: "tabDiary",
    };

    Object.keys(panelMap).forEach((key) => {
        const el = $(panelMap[key]);
        if (!el) return;
        if (key === app) {
            el.classList.add("panel-active");
        } else {
            el.classList.remove("panel-active");
        }
    });

    Object.keys(tabMap).forEach((key) => {
        const el = $(tabMap[key]);
        if (!el) return;
        if (key === app) {
            el.classList.add("active");
        } else {
            el.classList.remove("active");
        }
    });
}

function switchScreen(screen) {
    state.currentScreen = screen;
    const map = {
        home: "screenHome",
        chat: "screenChat",
        settings: "screenSettings",
    };
    Object.keys(map).forEach((key) => {
        const el = $(map[key]);
        if (!el) return;
        if (key === screen) {
            el.classList.add("active");
        } else {
            el.classList.remove("active");
        }
    });

    const titleEl = $("phoneTitle");
    const headerEl = $("phoneHeader");
    if (titleEl) {
        switch (screen) {
            case "chat":
                titleEl.textContent = "微信";
                break;
            case "settings":
                titleEl.textContent = "设置";
                break;
            default:
                titleEl.textContent = "主屏幕";
        }
    }
    // 非主屏幕时显示头部返回按钮
    if (headerEl) {
        if (screen === "home") {
            headerEl.classList.remove("with-back");
        } else {
            headerEl.classList.add("with-back");
        }
    }
}

function switchWechatView(view) {
    const viewMap = {
        home: "wechatPageHome",
        chatDetail: "wechatPageChat",
        profile: "wechatPageProfile",
        contacts: "wechatPageContacts",
        discover: "wechatPageDiscover",
        me: "wechatPageMe",
    };

    const tabMap = {
        home: "wechatTabHome",
        contacts: "wechatTabContacts",
        discover: "wechatTabDiscover",
        me: "wechatTabMe",
    };

    Object.keys(viewMap).forEach((k) => {
        const el = $(viewMap[k]);
        if (!el) return;
        if (k === view) el.classList.add("active");
        else el.classList.remove("active");
    });

    // 聊天详情页属于“微信”Tab，底部仍高亮“微信”
    let activeTabKey = "home";
    if (view === "contacts") activeTabKey = "contacts";
    else if (view === "discover") activeTabKey = "discover";
    else if (view === "me") activeTabKey = "me";

    Object.keys(tabMap).forEach((k) => {
        const el = $(tabMap[k]);
        if (!el) return;
        if (k === activeTabKey) el.classList.add("active");
        else el.classList.remove("active");
    });

    if (view === "chatDetail") {
        renderSceneSelector();
        updateChatDetailTitle();
    }
}

function renderSceneSelector() {
    const select = $("sceneSelect");
    if (!select) return;
    select.innerHTML = "";
    SCENE_PRESETS.forEach((scene) => {
        const opt = document.createElement("option");
        opt.value = scene.key;
        opt.textContent = scene.name;
        select.appendChild(opt);
    });
    if (!state.currentSceneKey) state.currentSceneKey = "default";
    select.value = state.currentSceneKey;
}

function openCharProfile(charId) {
    const id = charId || getCurrentCharId();
    if (!id) {
        alert("请先添加一个好友");
        return;
    }
    const ch = state.chars.find((c) => c.id === id) || null;
    if (!ch) {
        alert("未找到该好友");
        return;
    }

    const avatarBox = $("profileDetailAvatar");
    const nameEl = $("profileDetailName");
    const sigEl = $("profileDetailSignature");
    const personaEl = $("profileDetailPersona");
    const tagsEl = $("profileDetailTags");

    if (avatarBox) {
        avatarBox.innerHTML = "";
        const raw = ch.avatar && String(ch.avatar).trim();
        if (raw && isAvatarUrl(raw)) {
            const img = document.createElement("img");
            img.src = raw;
            img.alt = ch.name || "头像";
            avatarBox.appendChild(img);
        } else {
            avatarBox.textContent = (raw || ch.name || "?").charAt(0);
        }
    }
    if (nameEl) nameEl.textContent = ch.name || "未命名好友";
    if (sigEl) sigEl.textContent = ch.signature || "";
    if (personaEl) personaEl.textContent = ch.persona || "(还没有为 TA 写人设)";
    if (tagsEl) tagsEl.textContent = ch.tags || "";

    // 记录当前好友，方便“发消息”按钮跳回
    state.currentCharId = id;
    syncSelectors();
    updateChatDetailTitle();

    switchWechatView("profile");
}

function setSending(sending) {
    state.sending = sending;
    const sendBtn = $("sendBtn");
    const askBtn = $("askBtn");
    const retryBtn = $("retryBtn");
    if (sendBtn) sendBtn.disabled = sending;
    if (askBtn) {
        askBtn.disabled = sending;
        askBtn.textContent = sending ? "AI 回复中…" : "让 AI 回复";
    }
    if (retryBtn) retryBtn.disabled = sending;
}

function extractAIContent(data) {
    try {
        if (!data) return "";
        if (data.choices && data.choices[0]) {
            const ch = data.choices[0];
            if (ch.message && typeof ch.message.content === "string") {
                return ch.message.content;
            }
            if (typeof ch.text === "string") {
                return ch.text;
            }
        }
        if (typeof data.content === "string") return data.content;
        if (typeof data.result === "string") return data.result;
        const s = JSON.stringify(data);
        return s.length > 400 ? s.slice(0, 400) + "..." : s;
    } catch (e) {
        console.warn("解析 AI 返回内容出错", e);
        return "";
    }
}

function splitIntoSegments(text) {
    if (!text) return [];
    const raw = String(text);
    // 按空行拆分成多段，让 AI 一次回复在界面上显示为多条气泡
    const parts = raw.split(/\r?\n\s*\r?\n/);
    return parts.map((p) => p.trim()).filter((p) => p);
}

function getLastUserMessage() {
    const msgs = getCurrentMessages(false);
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "user") return msgs[i];
    }
    return null;
}

function hasEndConversationIntent(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;
    const keywords = [
        "结束",
        "收工",
        "下班",
        "睡觉",
        "晚安",
        "今天先这样",
        "今天就到这",
        "今天就到这里",
        "今天先到这",
        "先这样",
        "就到这里吧",
    ];
    return keywords.some((k) => t.includes(k));
}

function hasDiaryIntent(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;
    const diaryWords = ["写日记", "记日记", "来一篇日记", "生成日记"];
    return diaryWords.some((k) => t.includes(k));
}

function hasMomentIntent(text) {
    if (!text) return false;
    const t = String(text).trim();
    if (!t) return false;
    const momentWords = ["发朋友圈", "写朋友圈", "来一条朋友圈", "生成朋友圈"];
    return momentWords.some((k) => t.includes(k));
}

async function maybeAutoGenerate() {
    const autoMomentsEl = $("autoMoments");
    const autoDiaryEl = $("autoDiary");
    const autoMoments = autoMomentsEl ? autoMomentsEl.checked : false;
    const autoDiary = autoDiaryEl ? autoDiaryEl.checked : false;

    if (!autoMoments && !autoDiary) return;

    const msgs = getCurrentMessages(false);
    if (!msgs.length) return;

    const lastUser = getLastUserMessage();
    if (!lastUser || !lastUser.content) return;

    const msgCount = msgs.length;

    // 只有当对话有新增消息、且最近一条用户消息表现出“结束/收工”或明显提到日记/朋友圈时，才尝试自动生成
    const endIntent = hasEndConversationIntent(lastUser.content);
    const diaryIntent = hasDiaryIntent(lastUser.content);
    const momentIntent = hasMomentIntent(lastUser.content);

    if (autoMoments && (endIntent || momentIntent) && msgCount > state.lastAutoMomentMsgCount) {
        state.lastAutoMomentMsgCount = msgCount;
        generateMoment(true).catch((e) => console.warn("自动生成朋友圈失败", e));
    }

    if (autoDiary && (endIntent || diaryIntent) && msgCount > state.lastAutoDiaryMsgCount) {
        state.lastAutoDiaryMsgCount = msgCount;
        generateDiary(true).catch((e) => console.warn("自动生成日记失败", e));
    }
}

async function maybeSummarizeMemory() {
    if (!$("memoryEnabled") || !$("memoryEnabled").checked) {
        state.memoryEnabled = false;
        state.memorySinceLastSummary = 0;
        return;
    }
    state.memoryEnabled = true;
    const everyInput = $("memoryEvery");
    let every = state.memoryEvery || 20;
    if (everyInput) {
        const v = parseInt(everyInput.value, 10);
        if (Number.isFinite(v) && v > 0) every = v;
    }
    state.memoryEvery = every;
    if (state.memorySinceLastSummary < every) return;

    // 收集最近一段对话，让模型做一次简要总结
    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const customModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model = customModel || selectedModel || "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
    if (!apiKey) return;

    const historyPairs = getCurrentMessages(false).filter(
        (m) => m.role === "user" || m.role === "assistant"
    );
    if (!historyPairs.length) return;
    const tail = historyPairs.slice(-40);
    const text = tail
        .map((m) => (m.role === "user" ? "用户" : "助手") + ": " + m.content)
        .join("\n");

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            "你是一个总结助手，请把下面的聊天记录整理成一段简要记忆，提取出用户长期偏好、重要背景信息和未完成的待办，用简短的中文要点列出来。不要输出和原聊天无关的内容。",
                    },
                    { role: "user", content: text },
                ],
                max_tokens: 1024,
                temperature: 0.3,
                stream: false,
            }),
        });
        if (!res.ok) return;
        const data = await res.json();
        const summary = extractAIContent(data);
        if (summary && summary.trim()) {
            state.memorySummary = summary.trim();
            state.memorySinceLastSummary = 0;
            // 顺便静默持久化一下摘要
	    syncMemoryCenterUI();
	    saveSettingsSilent();
        }
    } catch (e) {
        console.warn("总结记忆失败", e);
    }
}

async function sendToAI() {
    const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
    const currentUser =
        state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
    const currentWorldBook = currentChar?.worldBookId
        ? state.worldBooks.find((b) => b.id === currentChar.worldBookId) || null
        : null;

    const baseUrl =
        (currentChar && currentChar.baseUrl && currentChar.baseUrl.trim()) ||
        $("baseUrl").value.trim() ||
        "https://api.openai.com/v1";
    const globalCustomModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model =
        (currentChar && currentChar.model && currentChar.model.trim()) ||
        globalCustomModel ||
        selectedModel ||
        "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();

    const roleName = currentChar?.name || "AI 助手";
    const rolePersona = currentChar?.persona || "";
    const stylePrompt = currentChar?.stylePrompt || "";
    const sceneCfg = getCurrentSceneConfig();
    const userName = currentUser?.name || "";
    const userPersona = currentUser?.persona || "";

    if (!apiKey) {
        alert("请先填写 API Key");
        return;
    }

    const temperature =
        typeof currentChar?.temperature === "number" && !Number.isNaN(currentChar.temperature)
            ? currentChar.temperature
            : 0.7;

    setSending(true);

    // 构造 messages 列表
    const messages = [];
    // 如果有历史总结记忆，先给模型一段说明
    if (state.memorySummary && state.memorySummary.trim()) {
        messages.push({
            role: "system",
            content:
                "以下是你和用户之前多轮对话的摘要记忆，请在回答时参考这些要点，让对话更加连贯，但不要逐字重复它们：\n" +
                state.memorySummary,
        });
    }
    if (rolePersona || stylePrompt || (sceneCfg && sceneCfg.prompt)) {
        let content = `你现在扮演一名名为「${roleName}」的 AI 助手，正在通过一个类似微信的在线聊天界面和用户对话。请始终以自然、友好的聊天语气回答。`;
        if (rolePersona) {
            content += `下面是你的详细人设设定：${rolePersona}`;
        }
        if (stylePrompt) {
            content += `\n\n补充的说话风格提示：${stylePrompt}`;
        }
        if (sceneCfg && sceneCfg.key !== "default" && sceneCfg.prompt) {
            content += `\n\n当前会话处于场景「${sceneCfg.name}」，请根据下面的场景说明调整你的表现：${sceneCfg.prompt}`;
        }
        if (currentWorldBook && currentWorldBook.content) {
            content += `\n\n以下是本次对话所属的世界观设定，请在回答时严格遵守这些世界规则：\n${currentWorldBook.content}`;
        }
        messages.push({ role: "system", content });
    }
    if (userName || userPersona) {
        let up = "用户信息：";
        if (userName) up += `昵称为「${userName}」。`;
        if (userPersona) up += `用户人设：${userPersona}`;
        messages.push({ role: "system", content: up });
    }
    const history = getCurrentMessages(false);
    for (const msg of history) {
        if (msg.role === "user" || msg.role === "assistant") {
            messages.push({ role: msg.role, content: msg.content });
        }
    }

    // 先渲染一个“思考中”占位
    const msgsRef = getCurrentMessages(true);
    const thinkingIndex = msgsRef.length;
    addMessage("assistant", "正在思考…");

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                // 为兼容部分第三方 OpenAI 接口，显式给出一些常见参数
                // 提高 max_tokens，减少被截断的概率（具体上限受平台和模型限制）
                max_tokens: 2048,
                temperature,
                stream: false,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("AI 原始返回:", data);

        if (Array.isArray(data.choices)) {
            if (data.choices.length === 0) {
                msgsRef[thinkingIndex] = {
                    role: "assistant",
                    content:
                        "接口返回的 choices 为空，后端没有生成任何回复。\n" +
                        "请到你使用的平台（例如 linkapi.ai）检查：\n" +
                        "1）API Key 是否有该模型的权限/余额；\n" +
                        "2）是否需要在平台控制台里先创建应用或绑定模型；\n" +
                        "3）参考平台提供的 curl/Postman 示例，看是否有额外必填参数。",
                };
                renderMessages();
                return;
            }

            const contents = data.choices.map((ch) => {
                if (ch.message && typeof ch.message.content === "string") return ch.message.content;
                if (typeof ch.text === "string") return ch.text;
                return "";
            });

            const tooShort = data.choices.some(
                (ch) => ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
            );

            const segments = contents
                .flatMap((c) => splitIntoSegments(c))
                .filter((s) => s && s.trim());

            const first = (segments[0] || "").trim() || "(AI 没有返回文本内容)";
            let firstContent = first;
            if (tooShort) {
                firstContent += "\n\n(提示：本次回复可能因为长度上限被截断，如果经常这样，可以在模型平台上提高单次输出上限，或让问题更具体一些。)";
            }
            msgsRef[thinkingIndex] = { role: "assistant", content: firstContent, time: Date.now() };
            for (let i = 1; i < segments.length; i++) {
                const c = (segments[i] || "").trim();
                if (c) {
                    addMessage("assistant", c);
                }
            }
            renderMessages();
		state.memorySinceLastSummary += 1;
		await maybeAutoGenerate();
		await maybeSummarizeMemory();
            return;
        }

        let content = extractAIContent(data);
        if (!content || !String(content).trim()) {
            content = "(AI 没有返回文本内容，请检查浏览器控制台中的原始返回，以及你所用平台的接口文档)";
        }
        const segments = splitIntoSegments(content);
        if (!segments.length) {
            msgsRef[thinkingIndex] = { role: "assistant", content, time: Date.now() };
            renderMessages();
            return;
        }
        msgsRef[thinkingIndex] = { role: "assistant", content: segments[0], time: Date.now() };
        for (let i = 1; i < segments.length; i++) {
            addMessage("assistant", segments[i]);
        }
        renderMessages();
		state.memorySinceLastSummary += 1;
		await maybeAutoGenerate();
		await maybeSummarizeMemory();
    } catch (err) {
        console.error(err);
        msgsRef[thinkingIndex] = {
            role: "assistant",
            content: `出错了：${err.message || err}`,
        };
        renderMessages();
    } finally {
        setSending(false);
    }
}

async function generateMoment(fromAuto = false) {
    const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
    const currentUser =
        state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;

    const baseUrl =
        (currentChar && currentChar.baseUrl && currentChar.baseUrl.trim()) ||
        $("baseUrl").value.trim() ||
        "https://api.openai.com/v1";
    const globalCustomModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model =
        (currentChar && currentChar.model && currentChar.model.trim()) ||
        globalCustomModel ||
        selectedModel ||
        "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
        const roleName = currentChar?.name || "AI 助手";
        const rolePersona = currentChar?.persona || "";
        const stylePrompt = currentChar?.stylePrompt || "";
        const sceneCfg = getCurrentSceneConfig();
        const userName = currentUser?.name || "";
        const userPersona = currentUser?.persona || "";
    const hint = $("momentHint").value.trim();

    if (!apiKey) {
        if (!fromAuto) alert("请先填写 API Key");
        return;
    }

    const btn = $("genMomentBtn");
    const oldText = btn.textContent;
    if (!fromAuto) {
        btn.disabled = true;
        btn.textContent = "生成中…";
    }

	    try {
	        const messages = [];
	        if (rolePersona || stylePrompt || (sceneCfg && sceneCfg.prompt)) {
            let content = `你现在扮演一名名为「${roleName}」的角色，请以第一人称在朋友圈发一条动态。`;
            if (rolePersona) {
                content += `内容和语气要符合下面的人设：${rolePersona}。`;
            }
            if (stylePrompt) {
                content += `\n\n补充的说话风格提示：${stylePrompt}`;
            }
            if (sceneCfg && sceneCfg.key !== "default" && sceneCfg.prompt) {
                content += `\n\n当前推荐使用的聊天场景是「${sceneCfg.name}」，请在写朋友圈时也尽量贴合这个场景：${sceneCfg.prompt}`;
            }
            content += "只输出朋友圈正文，不要解释。";
            messages.push({ role: "system", content });
        }
        if (userName || userPersona) {
            let up = "用户信息：";
            if (userName) up += `昵称为「${userName}」。`;
            if (userPersona) up += `用户人设：${userPersona}`;
            messages.push({ role: "system", content: up });
        }
        if (state.moments.length) {
            const history = state.moments
                .slice(-3)
                .map((m, i) => `${i + 1}. ${m.content}`)
                .join("\n");
            messages.push({
                role: "system",
                content: `以下是你之前发过的部分朋友圈，用于保持风格连贯：\n${history}`,
            });
        }
        if (hint) {
            messages.push({ role: "user", content: `请根据这个提示写一条新的朋友圈：${hint}` });
        } else {
            messages.push({
                role: "user",
                content: "请随意写一条今天的朋友圈动态，只输出正文。",
            });
        }

        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                // 提高上限，减少被截断概率（仍受平台和模型限制）
                max_tokens: 2048,
                temperature:
                    typeof currentChar?.temperature === "number" &&
                    !Number.isNaN(currentChar.temperature)
                        ? currentChar.temperature
                        : 0.8,
                stream: false,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("AI 朋友圈返回:", data);
        let content = extractAIContent(data);
        if (!content || !content.trim()) {
            content = "(AI 没有生成朋友圈内容)";
        }
        let tooShort = false;
        if (Array.isArray(data.choices)) {
            tooShort = data.choices.some(
                (ch) => ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
            );
        }
        if (tooShort) {
            content +=
                "\n\n(提示：这条朋友圈可能因为长度上限被截断，如果经常这样，可以在模型平台上提高输出上限，或把提示写得更具体一点。)";
        }
        const authorId = getCurrentCharId();
        state.moments.push({
            id: "moment_" + Date.now(),
            authorType: "char",
            authorId,
            content,
            time: new Date().toLocaleString(),
            likedByUser: false,
            likedByChars: [],
            comments: [],
        });
        renderMoments();
        $("momentHint").value = "";
        saveSettingsSilent();
        saveSettingsSilent();
    } catch (err) {
        console.error(err);
        if (!fromAuto) alert(`生成朋友圈失败：${err.message || err}`);
    } finally {
        if (!fromAuto) {
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }
}

async function generateDiary(fromAuto = false) {
    const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
    const currentUser =
        state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;

    const baseUrl =
        (currentChar && currentChar.baseUrl && currentChar.baseUrl.trim()) ||
        $("baseUrl").value.trim() ||
        "https://api.openai.com/v1";
    const globalCustomModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model =
        (currentChar && currentChar.model && currentChar.model.trim()) ||
        globalCustomModel ||
        selectedModel ||
        "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
        const roleName = currentChar?.name || "AI 助手";
        const rolePersona = currentChar?.persona || "";
        const stylePrompt = currentChar?.stylePrompt || "";
        const sceneCfg = getCurrentSceneConfig();
        const userName = currentUser?.name || "";
        const userPersona = currentUser?.persona || "";
    const hint = $("diaryHint").value.trim();

    if (!apiKey) {
        if (!fromAuto) alert("请先填写 API Key");
        return;
    }

    const btn = $("genDiaryBtn");
    const oldText = btn.textContent;
    if (!fromAuto) {
        btn.disabled = true;
        btn.textContent = "生成中…";
    }

	    try {
	        const messages = [];
	        if (rolePersona || stylePrompt || (sceneCfg && sceneCfg.prompt)) {
            let content = `你现在扮演一名名为「${roleName}」的角色，请用第一人称写一篇今天的日记。`;
            if (rolePersona) {
                content += `内容和语气要符合下面的人设：${rolePersona}。`;
            }
            if (stylePrompt) {
                content += `\n\n补充的说话风格提示：${stylePrompt}`;
            }
            if (sceneCfg && sceneCfg.key !== "default" && sceneCfg.prompt) {
                content += `\n\n当前推荐使用的聊天场景是「${sceneCfg.name}」，请在写日记时也带上一点这个场景的氛围：${sceneCfg.prompt}`;
            }
            content += "可以包含当天发生的事情和心情，只输出日记正文。";
            messages.push({ role: "system", content });
        }
        if (userName || userPersona) {
            let up = "用户信息：";
            if (userName) up += `昵称为「${userName}」。`;
            if (userPersona) up += `用户人设：${userPersona}`;
            messages.push({ role: "system", content: up });
        }
        if (state.diary.length) {
            const history = state.diary
                .slice(-3)
                .map((m, i) => `${i + 1}. ${m.content}`)
                .join("\n---\n");
            messages.push({
                role: "system",
                content: `以下是你之前写过的部分日记，用于保持风格连贯：\n${history}`,
            });
        }
        if (hint) {
            messages.push({ role: "user", content: `今天的关键词是：${hint}。请写一篇对应的日记。` });
        } else {
            messages.push({
                role: "user",
                content: "请随意写一篇今天的日记，只输出正文。",
            });
        }

        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages,
                // 提高上限，减少被截断概率
                max_tokens: 2048,
                temperature:
                    typeof currentChar?.temperature === "number" &&
                    !Number.isNaN(currentChar.temperature)
                        ? currentChar.temperature
                        : 0.7,
                stream: false,
            }),
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        console.log("AI 日记返回:", data);
        let content = extractAIContent(data);
        if (!content || !content.trim()) {
            content = "(AI 没有生成日记内容)";
        }
        let tooShort = false;
        if (Array.isArray(data.choices)) {
            tooShort = data.choices.some(
                (ch) => ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
            );
        }
        if (tooShort) {
            content +=
                "\n\n(提示：这篇日记可能因为长度上限被截断，如果经常这样，可以在模型平台上提高输出上限，或把提示写得更具体一点。)";
        }
        const authorId = getCurrentCharId();
        state.diary.push({
            id: "diary_" + Date.now(),
            authorType: "char",
            authorId,
            content,
            time: new Date().toLocaleString(),
        });
        renderDiary();
        $("diaryHint").value = "";
        saveSettingsSilent();
        saveSettingsSilent();
    } catch (err) {
        console.error(err);
        if (!fromAuto) alert(`生成日记失败：${err.message || err}`);
    } finally {
        if (!fromAuto) {
            btn.disabled = false;
            btn.textContent = oldText;
        }
    }
}

async function fetchModels() {
    const baseUrl = $("baseUrl").value.trim() || "https://api.openai.com/v1";
    const apiKey = $("apiKey").value.trim();

    if (!apiKey) {
        alert("请先填写 API Key");
        return;
    }

    const btn = $("fetchModelsBtn");
    btn.disabled = true;
    const oldText = btn.textContent;
    btn.textContent = "拉取中…";

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/models`, {
            method: "GET",
            headers: {
                Authorization: `Bearer ${apiKey}`,
            },
        });

        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }

        const data = await res.json();
        const list = Array.isArray(data.data)
            ? data.data
                  .map((m) => m.id || m.name || "")
                  .filter((s) => typeof s === "string" && s.trim())
            : [];

        if (!list.length) {
            alert("没有从接口中解析到模型列表，请检查返回结构。");
            return;
        }

        const select = $("modelSelect");
        select.innerHTML = "";
        list.forEach((id) => {
            const opt = document.createElement("option");
            opt.value = id;
            opt.textContent = id;
            select.appendChild(opt);
        });

        // 默认选第一个
        select.value = list[0];

        // 同步保存到本地
        saveSettings();
    } catch (err) {
        console.error(err);
        alert(`拉取模型失败：${err.message || err}`);
    } finally {
        btn.disabled = false;
        btn.textContent = oldText;
    }
}

function ensureMomentStructure(item) {
    if (!item) return;
    if (!("authorType" in item)) {
        item.authorType = "char";
    }
    if (!("authorId" in item)) {
        item.authorId = getCurrentCharId();
    }
    if (!Array.isArray(item.comments)) {
        item.comments = [];
    }
    if (!Array.isArray(item.likedByChars)) {
        item.likedByChars = [];
    }
    if (typeof item.likedByUser !== "boolean") {
        item.likedByUser = false;
    }
}

function toggleMomentLikeAsUser(index) {
    const m = state.moments[index];
    if (!m) return;
    ensureMomentStructure(m);
    m.likedByUser = !m.likedByUser;
    renderMoments();
    saveSettingsSilent();
}

function toggleMomentLikeAsChar(index) {
    const m = state.moments[index];
    if (!m) return;
    const cid = getCurrentCharId();
    if (!cid) {
        alert("请先在微信里添加并选择一个好友");
        return;
    }
    ensureMomentStructure(m);
    const list = m.likedByChars;
    const pos = list.indexOf(cid);
    if (pos === -1) list.push(cid);
    else list.splice(pos, 1);
    renderMoments();
    saveSettingsSilent();
}

function addUserCommentToMoment(index) {
    const m = state.moments[index];
    if (!m) return;
    ensureMomentStructure(m);
    const text = window.prompt("输入你想说的话：");
    if (!text || !text.trim()) return;
    const fromId = state.currentUserProfileId;
    m.comments.push({
        fromType: "user",
        fromId,
        content: text.trim(),
        time: Date.now(),
    });
    renderMoments();
    saveSettingsSilent();
}

async function addCharCommentToMoment(index) {
    const m = state.moments[index];
    if (!m) return;
    const cid = getCurrentCharId();
    const currentChar = state.chars.find((c) => c.id === cid) || null;
    if (!cid || !currentChar) {
        alert("请先在微信里添加并选择一个好友");
        return;
    }
    ensureMomentStructure(m);

    const baseUrl =
        (currentChar && currentChar.baseUrl && currentChar.baseUrl.trim()) ||
        $("baseUrl").value.trim() ||
        "https://api.openai.com/v1";
    const globalCustomModel = $("modelCustom").value.trim();
    const selectedModel = $("modelSelect").value;
    const model =
        (currentChar && currentChar.model && currentChar.model.trim()) ||
        globalCustomModel ||
        selectedModel ||
        "gpt-4.1-mini";
    const apiKey = $("apiKey").value.trim();
    if (!apiKey) {
        alert("请先在设置里填写 API Key");
        return;
    }

    const roleName = currentChar.name || "AI 好友";
    const rolePersona = currentChar.persona || "";
    const stylePrompt = currentChar.stylePrompt || "";

    try {
        const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model,
                messages: [
                    {
                        role: "system",
                        content:
                            `你现在扮演名为「${roleName}」的朋友，请针对下面这条朋友圈内容，写一句很简短、自然的中文评论，像真实好友在朋友圈里回复那样，最多 30 个字。` +
                            (rolePersona ? ` 角色人设：${rolePersona}` : "") +
                            (stylePrompt ? ` 说话风格提示：${stylePrompt}` : ""),
                    },
                    {
                        role: "user",
                        content: m.content,
                    },
                ],
                max_tokens: 128,
                temperature: 0.8,
                stream: false,
            }),
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
        }
        const data = await res.json();
        const text = extractAIContent(data) || "好有意思～";
        m.comments.push({
            fromType: "char",
            fromId: cid,
            content: text.trim(),
            time: Date.now(),
        });
        renderMoments();
        saveSettingsSilent();
    } catch (err) {
        console.error(err);
        alert(`生成评论失败：${err.message || err}`);
    }
}

function openChatProfileOverlay() {
    const overlay = $("chatProfileOverlay");
    if (!overlay) return;

    const currentId = getCurrentCharId();
    const currentChar = state.chars.find((c) => c.id === currentId) || null;

    const nameInput = $("chatEditName");
    const avatarInput = $("chatEditAvatar");
    const personaInput = $("chatEditPersona");
    const signatureInput = $("chatEditSignature");
    const baseUrlInput = $("chatEditBaseUrl");
    const modelInput = $("chatEditModel");
    const tempInput = $("chatEditTemperature");
    const styleInput = $("chatEditStyle");
    const worldSelect = $("chatEditWorldBook");
    if (nameInput) nameInput.value = currentChar?.name || "";
    if (avatarInput)
        avatarInput.value = (currentChar?.avatar && String(currentChar.avatar)) || "";
    if (personaInput) personaInput.value = currentChar?.persona || "";
    if (signatureInput) signatureInput.value = currentChar?.signature || "";
    if (baseUrlInput) baseUrlInput.value = currentChar?.baseUrl || "";
    if (modelInput) modelInput.value = currentChar?.model || "";
    if (tempInput)
        tempInput.value =
            typeof currentChar?.temperature === "number" &&
            !Number.isNaN(currentChar.temperature)
                ? String(currentChar.temperature)
                : "";
    if (styleInput) styleInput.value = currentChar?.stylePrompt || "";

    if (worldSelect) {
        worldSelect.innerHTML = "";
        const optNone = document.createElement("option");
        optNone.value = "";
        optNone.textContent = "（不使用世界书）";
        worldSelect.appendChild(optNone);
        state.worldBooks.forEach((b) => {
            const opt = document.createElement("option");
            opt.value = b.id;
            opt.textContent = b.name || "未命名世界书";
            worldSelect.appendChild(opt);
        });
        if (currentChar?.worldBookId) {
            worldSelect.value = currentChar.worldBookId;
        }
    }

    const userSelect = $("chatEditUserProfile");
    if (userSelect) {
        userSelect.innerHTML = "";
        state.userProfiles.forEach((p) => {
            const opt = document.createElement("option");
            opt.value = p.id;
            opt.textContent = p.name || "未命名人设";
            userSelect.appendChild(opt);
        });
        if (
            state.currentUserProfileId &&
            state.userProfiles.some((p) => p.id === state.currentUserProfileId)
        ) {
            userSelect.value = state.currentUserProfileId;
        }
    }

    overlay.classList.add("active");
}

function closeChatProfileOverlay() {
    const overlay = $("chatProfileOverlay");
    if (!overlay) return;
    overlay.classList.remove("active");
}

function saveChatProfileFromOverlay() {
    const currentId = getCurrentCharId();
    if (!currentId) {
        alert("请先添加并选择一个好友");
        return;
    }

    const nameInput = $("chatEditName");
    const avatarInput = $("chatEditAvatar");
    const personaInput = $("chatEditPersona");
    const signatureInput = $("chatEditSignature");
    const baseUrlInput = $("chatEditBaseUrl");
    const modelInput = $("chatEditModel");
    const tempInput = $("chatEditTemperature");
    const styleInput = $("chatEditStyle");
    const userSelect = $("chatEditUserProfile");
    const worldSelect = $("chatEditWorldBook");

    const name = nameInput ? nameInput.value.trim() : "";
    const avatar = avatarInput ? avatarInput.value.trim() : "";
    const persona = personaInput ? personaInput.value.trim() : "";
    const signature = signatureInput ? signatureInput.value.trim() : "";
    const baseUrl = baseUrlInput ? baseUrlInput.value.trim() : "";
    const model = modelInput ? modelInput.value.trim() : "";
    const tempStr = tempInput ? tempInput.value.trim() : "";
    const temperature = tempStr ? Number(tempStr) : NaN;
    const stylePrompt = styleInput ? styleInput.value.trim() : "";

    const idx = state.chars.findIndex((c) => c.id === currentId);
    if (idx >= 0) {
        const ch = state.chars[idx];
        ch.name = name || ch.name || "未命名好友";
        ch.avatar = avatar;
        ch.persona = persona;
        ch.signature = signature;
        ch.baseUrl = baseUrl || undefined;
        ch.model = model || undefined;
        if (!Number.isNaN(temperature)) ch.temperature = temperature;
        else delete ch.temperature;
        ch.stylePrompt = stylePrompt || undefined;
        if (worldSelect && worldSelect.value) ch.worldBookId = worldSelect.value;
        else delete ch.worldBookId;
    }

    if (userSelect && userSelect.value) {
        state.currentUserProfileId = userSelect.value;
    }

    renderCharList();
    renderConversationList();
    syncSelectors();
    updateChatDetailTitle();
    syncDiscoverAvatar();
    saveSettings();
    closeChatProfileOverlay();
}

function handleSend() {
    if (state.sending) return;
    const input = $("userInput");
    const text = input.value.trim();
    if (!text) return;

    addMessage("user", text);
    input.value = "";
}

function removeLastAssistantReply() {
    let idx = -1;
    const msgs = getCurrentMessages(false);
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].role === "assistant") {
            idx = i;
            break;
        }
    }
    if (idx === -1) return false;
    const id = getCurrentCharId();
    const session = getSession(id, true);
    session.messages = msgs.slice(0, idx);
    renderMessages();
    renderConversationList();
    saveSettingsSilent();
    return true;
}

function handleAskAI() {
    if (state.sending) return;
    // 至少要有一条用户消息再让 AI 回复
    const hasUser = getCurrentMessages(false).some((m) => m.role === "user");
    if (!hasUser) {
        alert("请先发送一条或多条消息，再让 AI 回复。");
        return;
    }
    sendToAI();
}

function handleRetry() {
    if (state.sending) return;
    if (!removeLastAssistantReply()) {
        alert("还没有 AI 回复，暂时不能重说。");
        return;
    }
    // 删除上一轮 AI 回复后，基于当前对话历史重新让 AI 回答
    sendToAI();
}

window.addEventListener("DOMContentLoaded", () => {
    loadSettings();

    function bind(id, event, handler) {
        const el = $(id);
        if (!el) {
            console.warn("未找到元素:", id);
            return;
        }
        el.addEventListener(event, handler);
    }

    bind("saveSettingsBtn", "click", saveSettings);
    bind("exportDataBtn", "click", exportData);
    bind("sendBtn", "click", handleSend);
    bind("fetchModelsBtn", "click", fetchModels);
    bind("askBtn", "click", handleAskAI);
    bind("retryBtn", "click", handleRetry);
    bind("genMomentBtn", "click", () => generateMoment(false));
    bind("genDiaryBtn", "click", () => generateDiary(false));
    bind("userMomentBtn", "click", () => {
        const text = ("" + ($("momentHint")?.value || "")).trim();
        if (!text) {
            alert("先写点想发的内容吧～");
            return;
        }
        const authorId = state.currentUserProfileId;
        state.moments.push({
            id: "moment_" + Date.now(),
            authorType: "user",
            authorId,
            content: text,
            time: new Date().toLocaleString(),
            likedByUser: false,
            likedByChars: [],
            comments: [],
        });
        if ($("momentHint")) $("momentHint").value = "";
        renderMoments();
        saveSettingsSilent();
    });
    bind("wechatTabHome", "click", () => switchWechatView("home"));
    bind("wechatTabContacts", "click", () => switchWechatView("contacts"));
    bind("wechatTabDiscover", "click", () => switchWechatView("discover"));
    bind("wechatTabMe", "click", () => switchWechatView("me"));

    const userInputEl = $("userInput");
    if (userInputEl) {
        userInputEl.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    	});
    }

    const sceneSelectEl = $("sceneSelect");
    if (sceneSelectEl) {
        sceneSelectEl.addEventListener("change", (e) => {
            const target = e.target;
            const value = target && target.value ? String(target.value) : "default";
            state.currentSceneKey = value || "default";
            updateChatDetailTitle();
        });
        renderSceneSelector();
    }

    switchApp("chat");
    switchScreen("home");
    bind("iconWechat", "click", () => {
        switchScreen("chat");
        // 每次从主屏进入微信，都回到会话列表首页
        switchWechatView("home");
    });
    bind("iconSettings", "click", () => switchScreen("settings"));
    bind("btnHome", "click", () => switchScreen("home"));
    bind("btnHeaderBack", "click", () => {
        switchWechatView("home");
        switchScreen("home");
    });
    bind("chatBackBtn", "click", () => switchWechatView("home"));
    bind("chatDetailName", "click", () => openCharProfile(getCurrentCharId()));
    bind("chatProfileBtn", "click", openChatProfileOverlay);
    bind("chatProfileCancelBtn", "click", closeChatProfileOverlay);
    bind("chatProfileSaveBtn", "click", saveChatProfileFromOverlay);
    bind("charStateCloseBtn", "click", closeCharStateOverlay);
    bind("charStateSaveBtn", "click", saveCharStateFromOverlay);
    bind("charStateAIBtn", "click", generateCharStateFromAI);
    // 发现页：在首页和朋友圈/日记之间切换
    bind("discoverMomentsEntry", "click", () => {
        const home = $("discoverHome");
        const moments = $("discoverMoments");
        if (home && moments) {
            home.classList.remove("active");
            moments.classList.add("active");
        }
    });
    bind("discoverDiaryEntry", "click", () => {
        const home = $("discoverHome");
        const diary = $("discoverDiary");
        if (home && diary) {
            home.classList.remove("active");
            diary.classList.add("active");
        }
    });
    bind("discoverListenEntry", "click", () => {
        const home = $("discoverHome");
        const listen = $("discoverListen");
        if (home && listen) {
            home.classList.remove("active");
            listen.classList.add("active");
        }
    });
    bind("momentsBackBtn", "click", () => {
        const home = $("discoverHome");
        const moments = $("discoverMoments");
        if (home && moments) {
            moments.classList.remove("active");
            home.classList.add("active");
        }
    });
    bind("diaryBackBtn", "click", () => {
        const home = $("discoverHome");
        const diary = $("discoverDiary");
        if (home && diary) {
            diary.classList.remove("active");
            home.classList.add("active");
        }
    });
    bind("listenBackBtn", "click", () => {
        const home = $("discoverHome");
        const listen = $("discoverListen");
        if (home && listen) {
            listen.classList.remove("active");
            home.classList.add("active");
        }
    });

    // 好友资料页按钮
    bind("profileBackBtn", "click", () => switchWechatView("home"));
    bind("profileChatBtn", "click", () => {
        renderMessages();
        renderConversationList();
        updateChatDetailTitle();
        switchWechatView("chatDetail");
    });
    bind("profileEditBtn", "click", openChatProfileOverlay);

    // 听一听：生成今日签 / 歌单文案
    const listenResultEl = $("listenResult");
    async function handleListen(type) {
        const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
        const currentUser =
            state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
        const baseUrl =
            (currentChar && currentChar.baseUrl && currentChar.baseUrl.trim()) ||
            $("baseUrl").value.trim() ||
            "https://api.openai.com/v1";
        const globalCustomModel = $("modelCustom").value.trim();
        const selectedModel = $("modelSelect").value;
        const model =
            (currentChar && currentChar.model && currentChar.model.trim()) ||
            globalCustomModel ||
            selectedModel ||
            "gpt-4.1-mini";
        const apiKey = $("apiKey").value.trim();
        const sceneCfg = getCurrentSceneConfig();

        if (!apiKey) {
            alert("请先填写 API Key");
            return;
        }
        if (!currentChar) {
            alert("请先在微信里选择一个好友再来听一听");
            return;
        }

        const hint = ( $("listenHint")?.value || "" ).trim();

        const btnId = type === "sign" ? "listenDailySignBtn" : "listenPlaylistBtn";
        const btn = $(btnId);
        const oldText = btn ? btn.textContent : "";
        if (btn) {
            btn.disabled = true;
            btn.textContent = "生成中…";
        }
        if (listenResultEl) {
            listenResultEl.textContent = "正在为你倾听最近的状态，生成中…";
        }

        try {
            const messages = [];
            const roleName = currentChar?.name || "AI 好友";
            const rolePersona = currentChar?.persona || "";
            const stylePrompt = currentChar?.stylePrompt || "";
            const userName = currentUser?.name || "";
            const userPersona = currentUser?.persona || "";

            let sys = `你是一名名为「${roleName}」的 AI 好友，现在要在一个叫“听一听”的小程序里，给用户一段温柔的回应。`;
            if (rolePersona) sys += `你的角色人设：${rolePersona}。`;
            if (stylePrompt) sys += `说话风格提示：${stylePrompt}。`;
            if (sceneCfg && sceneCfg.key !== "default" && sceneCfg.prompt) {
                sys += `当前推荐场景是「${sceneCfg.name}」，场景说明：${sceneCfg.prompt}。`;
            }
            if (type === "sign") {
                sys +=
                    "你要输出一条『今日签』，用一小段文案安慰/鼓励/提醒用户，可以适度诗意，但不要太长，大约 2~5 句话。";
            } else {
                sys +=
                    "你要输出一段『歌单文案』，像是为用户量身定制的一张歌单介绍，可以描述情绪、适合的场景和风格，同样控制在 2~5 句话。";
            }
            messages.push({ role: "system", content: sys });

            if (userName || userPersona) {
                let up = "用户信息：";
                if (userName) up += `昵称为「${userName}」。`;
                if (userPersona) up += `用户人设：${userPersona}`;
                messages.push({ role: "system", content: up });
            }

            const history = getCurrentMessages(false).slice(-8);
            if (history.length) {
                const summary = history
                    .map((m) => `${m.role === "user" ? "用户" : "你"}：${m.content}`)
                    .join("\n");
                messages.push({
                    role: "system",
                    content:
                        "以下是最近几轮聊天的片段，帮助你感受当前的状态和情绪：\n" + summary,
                });
            }

            if (hint) {
                messages.push({
                    role: "user",
                    content: `这是用户在听一听里补充的心情/需求：${hint}`,
                });
            } else {
                messages.push({
                    role: "user",
                    content:
                        "请直接给我一条今日签或歌单文案（根据你所在的模式），不用和我闲聊，也不要解释规则。",
                });
            }

            const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_tokens: 1024,
                    temperature: 0.9,
                    stream: false,
                }),
            });

            let data;
            if (!res.ok) {
                // 尝试解析错误信息，方便定位平台侧问题（例如安全过滤或限额）
                try {
                    const errJson = await res.json();
                    const msg = errJson?.error?.message || `HTTP ${res.status}`;
                    throw new Error(msg);
                } catch (e) {
                    throw new Error(`HTTP ${res.status}`);
                }
            } else {
                data = await res.json();
            }

            let content = extractAIContent(data) || "(AI 没有返回内容)";
            // 标记可能被长度上限截断的情况
            if (
                Array.isArray(data?.choices) &&
                data.choices.some(
                    (ch) =>
                        ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
                )
            ) {
                content +=
                    "\n\n(提示：这段文案可能因为平台长度上限被截断，如果经常这样，可以在接口平台上提高单次输出上限，或把提示写得更精简一点。)";
            }
            if (listenResultEl) listenResultEl.textContent = content;
        } catch (err) {
            console.error(err);
            if (listenResultEl)
                listenResultEl.textContent = `生成失败：${err.message || err}`;
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.textContent = oldText;
            }
        }
    }

    bind("listenDailySignBtn", "click", () => handleListen("sign"));
    bind("listenPlaylistBtn", "click", () => handleListen("playlist"));

    // 外观与壁纸：保存配置并立即应用
    bind("saveWallpaperBtn", "click", () => {
        const homeInput = $("homeWallpaperInput");
        const chatInput = $("chatWallpaperInput");
        state.homeWallpaperUrl = homeInput ? homeInput.value.trim() : "";
        state.chatWallpaperUrl = chatInput ? chatInput.value.trim() : "";
        applyWallpapers();
        saveSettings();
    });

    // 小程序：塔罗占卜 & 情绪小测试
    async function runMiniApp(type) {
        const currentChar = state.chars.find((c) => c.id === state.currentCharId) || null;
        const currentUser =
            state.userProfiles.find((p) => p.id === state.currentUserProfileId) || null;
        const baseUrl =
            (currentChar && currentChar.baseUrl && currentChar.baseUrl.trim()) ||
            $("baseUrl").value.trim() ||
            "https://api.openai.com/v1";
        const globalCustomModel = $("modelCustom").value.trim();
        const selectedModel = $("modelSelect").value;
        const model =
            (currentChar && currentChar.model && currentChar.model.trim()) ||
            globalCustomModel ||
            selectedModel ||
            "gpt-4.1-mini";
        const apiKey = $("apiKey").value.trim();
        const sceneCfg = getCurrentSceneConfig();

        if (!apiKey) {
            alert("请先填写 API Key");
            return;
        }
        if (!currentChar) {
            alert("请先在微信里选择一个好友再使用小程序");
            return;
        }

        const hint = (($("listenHint")?.value || "") + "").trim();

        const resultBox = $("listenResult");
        if (resultBox) {
            resultBox.textContent =
                type === "tarot"
                    ? "正在为你洗牌并抽一张纯娱乐的今日塔罗，占卜仅供开心玩耍…"
                    : "正在感受你最近的状态，准备一份轻量的情绪小观察，仅供参考…";
        }

        // 本地兜底：即使远端接口返回 500，也给一个完全本地的娱乐结果
        const localTarot = () => {
            const deck = [
                {
                    name: "太阳 Sun",
                    upright:
                        "今天主打阳光和希望，适合把最近的小成果夸一夸，也别忘了奖励自己一点快乐。",
                    reversed:
                        "最近有点累，但云层后面还是有太阳。先把基础的生活节奏照顾好，你的能量会慢慢回来的。",
                },
                {
                    name: "星星 Star",
                    upright:
                        "你心里藏着一个温柔的小愿望，今天可以往前迈半步，比如先写下一点点计划。",
                    reversed:
                        "也许你对未来有点迷茫，那就先点亮一颗小星星：做一件让自己安心的小事。",
                },
                {
                    name: "力量 Strength",
                    upright:
                        "表面看起来很忙很累，其实你比自己想象的更有力量。记得温柔地对待自己，再继续出发。",
                    reversed:
                        "最近的消耗有点大，力量牌提醒你：适当撒娇、向别人求助，也是另一种勇气。",
                },
                {
                    name: "恋人 Lovers",
                    upright:
                        "今天适合和重要的人好好说说心里话，哪怕只是一句“我在呢”，都会很暖。",
                    reversed:
                        "也许你在某个选择上有点犹豫，不必急着给出答案，先听听自己真正在意的是什么。",
                },
            ];
            const card = deck[Math.floor(Math.random() * deck.length)];
            const upright = Math.random() < 0.5;
            const desc = upright ? card.upright : card.reversed;
            return (
                `今日抽到：${card.name}（${upright ? "正位" : "逆位"}）` +
                "\n\n" +
                desc +
                "\n\n（本地娱乐版塔罗，仅供开心玩耍～）"
            );
        };

        const localMood = () => {
            const tags = [
                "有点累但还在发光",
                "认真生活的打工小英雄",
                "情绪有起伏的敏感小天线",
                "表面淡定、内心很有火花",
            ];
            const advices = [
                "今天可以给自己安排一件完全不功利的小快乐，比如看一集喜欢的番、听一首循环很久的歌。",
                "尝试把压力拆成几块小任务，一次只盯住最前面的那一小步，会轻松很多。",
                "如果觉得闷，就找一个信任的人聊五分钟，不一定要有结论，只是把情绪放出来。",
                "睡前可以写三件今天值得被肯定的小事，让大脑记住“我已经做得不错了”。",
            ];
            const tag = tags[Math.floor(Math.random() * tags.length)];
            const pick = () => advices[Math.floor(Math.random() * advices.length)];
            const used = new Set();
            const getUnique = () => {
                let v;
                let guard = 0;
                do {
                    v = pick();
                    guard += 1;
                } while (used.has(v) && guard < 10);
                used.add(v);
                return v;
            };
            return (
                `情绪标签：${tag}` +
                "\n\n" +
                "小观察：你其实比自己以为的更稳，只是最近的负担有点多，需要一点点喘息时间。" +
                "\n\n" +
                "小建议：\n- " +
                getUnique() +
                "\n- " +
                getUnique() +
                "\n\n（本地娱乐版情绪小测试，仅供参考～）"
            );
        };

        try {
            const messages = [];
            const roleName = currentChar?.name || "AI 好友";
            const rolePersona = currentChar?.persona || "";
            const stylePrompt = currentChar?.stylePrompt || "";
            const userName = currentUser?.name || "";
            const userPersona = currentUser?.persona || "";

            let sys = `你是一名名为「${roleName}」的 AI 好友，现在在一个『小程序』里陪用户玩一个轻松的娱乐小游戏。这些内容仅供放松和参考，不构成任何专业或医疗建议。`;
            if (rolePersona) sys += `你的角色人设：${rolePersona}。`;
            if (stylePrompt) sys += `说话风格提示：${stylePrompt}。`;
            if (sceneCfg && sceneCfg.key !== "default" && sceneCfg.prompt) {
                sys += `当前推荐场景是「${sceneCfg.name}」，场景说明：${sceneCfg.prompt}。`;
            }
            if (type === "tarot") {
                sys +=
                    "现在要进行『单张塔罗占卜（娱乐版）』：请你随机选择一张牌，可以使用常见塔罗牌或你自创的象征性牌名，给出牌名、正逆位（随机）、以及 3~5 句温柔的解读，聚焦当下和近期的小提示。不要涉及死亡、严重疾病等沉重主题，不要给出任何命运或现实保证，只是鼓励式的小故事。";
            } else {
                sys +=
                    "现在要进行『情绪小测试（娱乐版）』：请根据用户最近的聊天状态，给出一个简短的情绪标签（例如“有点疲惫但乐观”），再用 3~5 句话描述当前情绪特征，并给出 2~3 条很具体、日常的小建议。不要使用任何心理诊断相关术语，不要暗示疾病或需要治疗，只用日常聊天语气安慰和鼓励。";
            }
            messages.push({ role: "system", content: sys });

            if (userName || userPersona) {
                let up = "用户信息：";
                if (userName) up += `昵称为「${userName}」。`;
                if (userPersona) up += `用户人设：${userPersona}`;
                messages.push({ role: "system", content: up });
            }

            const history = getCurrentMessages(false).slice(-10);
            if (history.length) {
                const summary = history
                    .map((m) => `${m.role === "user" ? "用户" : "你"}：${m.content}`)
                    .join("\n");
                messages.push({
                    role: "system",
                    content:
                        "以下是最近几轮聊天的片段，只用来帮助你感受用户目前的状态，不要逐字复述：\n" +
                        summary,
                });
            }

            if (hint) {
                messages.push({
                    role: "user",
                    content: `这是用户额外说的一点心情/背景：${hint}`,
                });
            }

            const res = await fetch(`${baseUrl.replace(/\/$/, "")}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model,
                    messages,
                    max_tokens: 512,
                    temperature: 0.9,
                    stream: false,
                }),
            });

            let data;
            if (!res.ok) {
                try {
                    const errJson = await res.json();
                    const msg = errJson?.error?.message || `HTTP ${res.status}`;
                    throw new Error(msg);
                } catch (e) {
                    throw new Error(`HTTP ${res.status}`);
                }
            } else {
                data = await res.json();
            }

            let content = extractAIContent(data) || "(AI 没有返回内容)";
            if (
                Array.isArray(data?.choices) &&
                data.choices.some(
                    (ch) =>
                        ch.finish_reason === "length" || ch.finish_reason === "max_tokens"
                )
            ) {
                content +=
                    "\n\n(提示：这段结果可能因为平台的长度上限被截断，如果经常这样，可以在接口平台上调整单次输出上限，或把玩法说明写得再简短一点。)";
            }
            if (resultBox) resultBox.textContent = content;
        } catch (err) {
            console.error("runMiniApp 远端调用失败，使用本地兜底结果", err);
            if (!resultBox) return;
            if (type === "tarot") {
                resultBox.textContent = localTarot();
            } else {
                resultBox.textContent = localMood();
            }
        }
    }

    bind("miniAppTarotBtn", "click", () => runMiniApp("tarot"));
    bind("miniAppMoodTestBtn", "click", () => runMiniApp("mood"));

    // 添加好友
    bind("addCharBtn", "click", () => {
        const name = ("" + ($("newCharName")?.value || "")).trim();
        const signature = ("" + ($("newCharSignature")?.value || "")).trim();
        const persona = ("" + ($("newCharPersona")?.value || "")).trim();
        if (!name && !persona && !signature) {
            alert("请至少填写好友昵称、人设或签名中的一项");
            return;
        }
        const id = "char_" + Date.now();
        state.chars.push({ id, name: name || "未命名好友", persona, signature });
        state.currentCharId = id;
        if ($("newCharName")) $("newCharName").value = "";
        if ($("newCharSignature")) $("newCharSignature").value = "";
        if ($("newCharPersona")) $("newCharPersona").value = "";
        renderCharList();
        syncSelectors();
        renderConversationList();
        saveSettings();
    });

    // 添加用户人设
    bind("addUserProfileBtn", "click", () => {
        const name = ("" + ($("newUserName")?.value || "")).trim();
        const avatar = ("" + ($("newUserAvatar")?.value || "")).trim();
        const persona = ("" + ($("newUserPersona")?.value || "")).trim();
        if (!name && !persona) {
            alert("请至少填写昵称或人设内容");
            return;
        }
        const btn = $("addUserProfileBtn");
        if (state.editingUserProfileId) {
            // 编辑已有的人设
            const idx = state.userProfiles.findIndex(
                (p) => p.id === state.editingUserProfileId
            );
            if (idx >= 0) {
                const p = state.userProfiles[idx];
                p.name = name || p.name || "未命名人设";
                p.avatar = avatar;
                p.persona = persona;
            }
            state.currentUserProfileId = state.editingUserProfileId;
            state.editingUserProfileId = null;
        } else {
            // 新增人设
            const id = "user_" + Date.now();
			state.userProfiles.push({ id, name: name || "未命名人设", persona, avatar });
			state.currentUserProfileId = id;
        }
        if ($("newUserName")) $("newUserName").value = "";
        if ($("newUserAvatar")) $("newUserAvatar").value = "";
        if ($("newUserPersona")) $("newUserPersona").value = "";
        if (btn && btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
        renderUserProfileList();
        syncSelectors();
        syncDiscoverAvatar();
        saveSettings();
    });

    // 添加 / 编辑世界书
    bind("addWorldBookBtn", "click", () => {
        const name = ("" + ($("newWorldBookName")?.value || "")).trim();
        const content = ("" + ($("newWorldBookContent")?.value || "")).trim();
        if (!name && !content) {
            alert("请至少填写世界书名称或内容");
            return;
        }
        const btn = $("addWorldBookBtn");
        if (state.editingWorldBookId) {
            const idx = state.worldBooks.findIndex((b) => b.id === state.editingWorldBookId);
            if (idx >= 0) {
                const b = state.worldBooks[idx];
                b.name = name || b.name || "未命名世界书";
                b.content = content;
            }
            state.editingWorldBookId = null;
        } else {
            const id = "world_" + Date.now();
            state.worldBooks.push({ id, name: name || "未命名世界书", content });
        }
        if ($("newWorldBookName")) $("newWorldBookName").value = "";
        if ($("newWorldBookContent")) $("newWorldBookContent").value = "";
        if (btn && btn.dataset.originalText) {
            btn.textContent = btn.dataset.originalText;
        }
        renderWorldBookList();
        saveSettings();
    });

    // 下拉切换当前好友 / 人设
    const charSelect = $("chatCharSelect");
    if (charSelect) {
        charSelect.addEventListener("change", () => {
            state.currentCharId = charSelect.value || null;
            saveSettings();
        });
    }
    const userSelect = $("chatUserProfileSelect");
    if (userSelect) {
        userSelect.addEventListener("change", () => {
            state.currentUserProfileId = userSelect.value || null;
            syncDiscoverAvatar();
            saveSettings();
        });
    }

    // 如果本地还没有任何好友或人设，给一个默认示例
    if (!state.chars.length) {
        state.chars.push({
            id: "char_default",
            name: "测试兔兔",
            persona: "你是一个可爱的测试兔兔，语气活泼，会帮助我测试小手机的功能。",
        });
        state.currentCharId = "char_default";
    }
    if (!state.userProfiles.length) {
        state.userProfiles.push({
            id: "user_default",
            name: "窝窝",
            persona: "一个正在折腾小手机项目的程序员。",
            avatar: "",
        });
        state.currentUserProfileId = "user_default";
    }
    renderCharList();
    renderUserProfileList();
    renderWorldBookList();
    syncSelectors();
	renderConversationList();
        updateChatDetailTitle();
	// 默认进入微信 Tab 的首页
	switchWechatView("home");

    // 导入数据：文件选择和解析
    const importInput = $("importFile");
    if (importInput) {
        importInput.addEventListener("change", (e) => {
            const file = e.target.files && e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target?.result || "";
                importDataFromText(String(text));
                importInput.value = "";
            };
            reader.readAsText(file, "utf-8");
        });
        bind("importDataBtn", "click", () => importInput.click());
    }

    // 消息长按操作菜单：点击空白处关闭，按钮触发具体动作
    const msgOverlay = $("msgActionOverlay");
    if (msgOverlay) {
        msgOverlay.addEventListener("click", (e) => {
            if (e.target === msgOverlay || e.target.classList.contains("msg-action-mask")) {
                closeMessageActionOverlay();
            }
        });
        const btns = msgOverlay.querySelectorAll(".msg-action-btn");
        btns.forEach((btn) => {
            const action = btn.getAttribute("data-action");
            if (!action) return;
            btn.addEventListener("click", (ev) => {
                ev.stopPropagation();
                handleMessageAction(action);
            });
        });
    }

    // 聊天快捷短语
    const quickBar = $("quickPhraseBar");
    if (quickBar) {
        const buttons = quickBar.querySelectorAll(".quick-phrase-btn[data-text]");
        const input = $("userInput");
        buttons.forEach((btn) => {
            const text = btn.getAttribute("data-text") || "";
            btn.addEventListener("click", () => {
                if (!input) return;
                input.value = text;
                input.focus();
            });
        });
    }

    // 记忆管理中心按钮
    bind("saveMemorySummaryBtn", "click", () => {
        const box = $("memorySummaryInput");
        if (box) {
            state.memorySummary = box.value.trim();
            state.memorySinceLastSummary = 0;
            saveSettings();
        }
    });
    bind("clearMemorySummaryBtn", "click", () => {
        if (!window.confirm("确定清空 AI 记忆摘要吗？聊天记录本身不会被删除。")) return;
        state.memorySummary = "";
        state.memorySinceLastSummary = 0;
        syncMemoryCenterUI();
        saveSettings();
    });
});
