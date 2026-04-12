// ============================================================================
// 常量配置
// ============================================================================
const CLICK_DELAY = 500;
const GARY_PROBABILITY = 0.8;
const FALLBACK_THRESHOLD = 60;
const TOTAL_DIMENSIONS = 15;
const BASE_DISTANCE = 30;

// 答题进度提示彩蛋配置
const HINT_EASTER_EGGS = [
    { remaining: 26, text: "<span style=\"text-decoration:underline;cursor:pointer;color:#06c;\" onclick=\"(function(el){var flipped=document.body.classList.toggle('flip-all');el.innerText=flipped?'我说了吧，你还不听':'不要点我';})(this)\">不要点我</span>" },
    { remaining: 25, text: '凡是金将军做出的决策，我们都坚决拥护；<br> 凡是金将军的指示，我们都始终不渝地遵循!' },
    { remaining: 24, text: '正在验证您是否是真人。这可能需要几秒钟时间 <span class="mini-spinner"></span>' },
    { remaining: 22, text: '告诉學生們，去做 FDTI，發帖子，點贊最高的，獎一个华为手表' },
    { remaining: 18, text: 'MBTI 究竟是个什么样子，荣格搞了很多年，也并没有完全搞清楚。可能B站UP主的思路比较好，搞了个 SBTI，可惜后来僵化了。' },
    { remaining: 15, text: '该内容被作者删除' },
    { remaining: 13, text: '<span style="display:inline-block;transform:rotate(180deg);">还剩 13 道</span>' },
    { remaining: 12, text: '道 21 剩还' },
    { remaining: 11, text: '<span style="opacity:0;animation:fadein 1s forwards;animation-delay:10s;">你终于等到了这句话：还剩 11 道</span>' },
    { remaining: 3, text: '最后几题通常会有彩蛋' },
    { remaining: 2, text: '也可能没有' },
    { remaining: 0, text: '完成后查看结果' }
];

// ============================================================================
// 应用状态
// ============================================================================
const app = {
    shuffledQuestions: [], // 题目队列
    answers: {},           // 用户答案映射表 { questionId: value }
    previewMode: false,    // 是否为调试/预览模式
    currentIndex: 0        // 当前题目索引
};

// ============================================================================
// DOM 元素缓存
// ============================================================================
const screens = {
    intro: document.getElementById('intro'),
    test: document.getElementById('test'),
    result: document.getElementById('result')
};

const questionList = document.getElementById('questionList');
const progressBar = document.getElementById('progressBar');
const progressText = document.getElementById('progressText');
const testHint = document.getElementById('testHint');

// ============================================================================
// 工具函数
// ============================================================================
function showScreen(name) {
    Object.entries(screens).forEach(([key, el]) => {
        el.classList.toggle('active', key === name);
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

function shuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function insertItemRandomly(array, item) {
    const idx = Math.floor(Math.random() * (array.length + 1));
    array.splice(idx, 0, item);
}

function sumToLevel(score) {
    if (score <= 3) return 'L';
    if (score === 4) return 'M';
    return 'H';
}

function levelNum(level) {
    return { L: 1, M: 2, H: 3 }[level];
}

function parsePattern(pattern) {
    return pattern.replace(/-/g, '').split('');
}

// 获取题目顶部标签（附加题或者维度标识）
function getQuestionMetaLabel(q) {
    if (q.special) return '补充题';
    return app.previewMode ? window.QUIZ_DATA.dimensionMeta[q.dim].name : ' ';
}

// ============================================================================
// 核心逻辑 - 队列与计算
// ============================================================================

/**
 * 初始构建题目队列（处理特殊门控题的基础部分）
 */
function buildQuestionQueue() {
    const queue = shuffle(window.QUIZ_DATA.questions);

    // 插入门槛第一道题 (sjtuer_gate_q1 和 gary_gate_q1)
    const sjtuerInitQ = window.QUIZ_DATA.specialQuestions.find(q => q.id === 'sjtuer_gate_q1');
    const garyInitQ = window.QUIZ_DATA.specialQuestions.find(q => q.id === 'gary_gate_q1');

    if (sjtuerInitQ) insertItemRandomly(queue, sjtuerInitQ);
    if (garyInitQ && Math.random() < GARY_PROBABILITY) insertItemRandomly(queue, garyInitQ);

    app.shuffledQuestions = queue;
}

/**
 * 根据当前题目作答情况，动态向队列追加触发的后续门控题
 * 只要选了触发选项，就在当前位置之后立即连续插入后续题
 */
function resolveFollowUp(currentQ, value) {
    const nextQuestions = window.QUIZ_DATA.specialQuestions.filter(
        q => q.triggerId === currentQ.id && q.triggerValue === value
    );
    
    if (nextQuestions.length > 0) {
        app.shuffledQuestions.splice(app.currentIndex + 1, 0, ...nextQuestions);
    }
}

/**
 * 计算纯分值映射与层级
 */
function scoreDimensions() {
    const rawScores = {};
    const levels = {};

    // 初始清零
    Object.keys(window.QUIZ_DATA.dimensionMeta).forEach(dim => {
        rawScores[dim] = 0;
    });

    // 累加计算 (只计算含有 dim 字段的普通题)
    app.shuffledQuestions.forEach(q => {
        if (q.dim && app.answers[q.id]) {
            rawScores[q.dim] += Number(app.answers[q.id]);
        }
    });

    // 维度换算 L/M/H
    Object.entries(rawScores).forEach(([dim, score]) => {
        levels[dim] = sumToLevel(score);
    });

    return { rawScores, levels };
}

/**
 * 将用户画像与常规范式匹配并排序
 */
function matchPersonality(levels) {
    const userVector = window.QUIZ_DATA.dimensionOrder.map(dim => levelNum(levels[dim]));
    
    // 从 library 中筛选出规范人格用于匹配
    const normalTypesInfo = Object.values(window.QUIZ_DATA.typeLibrary)
        .filter(t => t.isNormal && t.pattern);

    return normalTypesInfo.map(type => {
        const vector = parsePattern(type.pattern).map(levelNum);
        let distance = 0;
        let exact = 0;
        for (let i = 0; i < vector.length; i++) {
            const diff = Math.abs(userVector[i] - vector[i]);
            distance += diff;
            if (diff === 0) exact += 1;
        }
        const similarity = Math.max(0, Math.round((1 - distance / BASE_DISTANCE) * 100));
        return { ...type, distance, exact, similarity };
    }).sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        if (b.exact !== a.exact) return b.exact - a.exact;
        return b.similarity - a.similarity;
    });
}

/**
 * 处理特殊判定，组装最终渲染用数据对象
 */
function determineResultDisplay(scoredData, rankedMatch) {
    const bestNormal = rankedMatch[0];
    
    // 默认结果字段
    let finalType;
    let modeKicker = '你的主类型';
    let badge = `匹配度 ${bestNormal.similarity}% · 精准命中 ${bestNormal.exact}/${TOTAL_DIMENSIONS} 维`;
    let sub = '维度命中度较高，当前结果可视为你的第一人格画像。';
    let special = false;
    let secondaryType = null;

    // ----- 特殊人格短路逻辑 -----
    const isGaryTriggered = app.answers['gary_gate_q2'] !== undefined && app.answers['gary_gate_q2'] !== 4;
    const isSjtuerTriggered = app.answers['sjtuer_gate_q2'] === 1; // 仅当选了 1 时才触发

    if (isGaryTriggered) {
        finalType = window.QUIZ_DATA.typeLibrary.GARY;
        secondaryType = bestNormal;
        modeKicker = '恭喜！你 roll 到了某 G 开头昵称的神入';
        badge = '匹配度 100% · *引起不适';
        sub = '4.0有错吗  大学里摆烂还正义了是吧';
        special = true;

    } else if (isSjtuerTriggered) {
        finalType = window.QUIZ_DATA.typeLibrary.SJTUER;
        secondaryType = bestNormal;
        modeKicker = '*已发现卧底*';
        badge = '卧底匹配度 100%';
        sub = '交通大学才是 Top 3 ！————来自某 QS 榜 Top 2 高校';
        special = true;

    } else if (bestNormal.similarity < FALLBACK_THRESHOLD) {
        // 低匹配度兜底
        finalType = window.QUIZ_DATA.typeLibrary.HHHH;
        modeKicker = '系统强制兜底';
        badge = `标准人格库最高匹配仅 ${bestNormal.similarity}%`;
        sub = '标准人格库对你的脑回路集体罢工了，于是系统把你强制分配给了 HHHH。';
        special = true;

    } else {
        // 正常人格
        finalType = bestNormal;
    }

    return {
        ...scoredData,
        bestNormal,
        finalType,
        modeKicker,
        badge,
        sub,
        special,
        secondaryType
    };
}


// ============================================================================
// UI 更新与事件绑定
// ============================================================================

function updateProgress() {
    const total = app.shuffledQuestions.length;
    let displayStep = app.currentIndex + 1;
    if (app.prankIndex !== -1 && app.currentIndex === 2) {
        displayStep -= 1; // 整蛊起效，假装进度没变
    }
    const currentStep = total ? Math.min(displayStep, total) : 0;
    const percent = total ? ((currentStep - 1) / total) * 100 : 0;
    
    progressBar.style.width = `${percent}%`;
    progressText.textContent = `${currentStep} / ${total}`;

    const remaining = total - currentStep;
    
    // 基础提示：如果题量大就显示点击选项提醒，如果所剩不多就直出剩余数量
    let hintText = remaining > 13
        ? `点击选项继续（还剩 ${remaining} 道）`
        : `还剩 ${remaining} 道`;

    // 查表检索彩蛋提示
    const easterEgg = HINT_EASTER_EGGS.find(egg => egg.remaining === remaining);
    if (easterEgg) {
        hintText = easterEgg.text;
    }

    testHint.innerHTML = hintText;
}

function renderCurrentQuestion() {
    const currentQ = app.shuffledQuestions[app.currentIndex];

    // 当答完了队伍中的最后一题
    if (!currentQ) {
        renderResult();
        return;
    }

    questionList.innerHTML = '';
    const card = document.createElement('article');
    card.className = 'question';
    
    const optionsHtml = currentQ.options.map((opt, i) => {
        const code = ['A', 'B', 'C', 'D'][i] || String(i + 1);
        return `
            <button type="button" class="option option-btn" data-value="${opt.value}">
                <div class="option-code">${code}</div>
                <div>${opt.label}</div>
            </button>
        `;
    }).join('');

    card.innerHTML = `
        <div class="question-meta">
          <div class="badge">Q ${app.currentIndex + 1}</div>
          <div>${getQuestionMetaLabel(currentQ)}</div>
        </div>
        <div class="question-title">${currentQ.text}</div>
        <div class="options">
          ${optionsHtml}
        </div>
    `;
    questionList.appendChild(card);

    // 绑定选项点击事件
    questionList.querySelectorAll('.option-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            if (btn.classList.contains('selected')) return;
            btn.classList.add('selected');

            const value = Number(btn.getAttribute('data-value'));
            app.answers[currentQ.id] = value;
            
            // 处理可能的追问
            resolveFollowUp(currentQ, value);

            setTimeout(() => {
                app.currentIndex += 1;
                renderCurrentQuestion();
            }, CLICK_DELAY);
        });
    });

    updateProgress();
}

function renderDimList(result) {
    const dimList = document.getElementById('dimList');
    dimList.innerHTML = window.QUIZ_DATA.dimensionOrder.map(dim => {
        const level = result.levels[dim];
        const explanation = window.QUIZ_DATA.dimExplanations[dim][level];
        return `
          <div class="dim-item">
            <div class="dim-item-top">
              <div class="dim-item-name">${window.QUIZ_DATA.dimensionMeta[dim].name}</div>
              <div class="dim-item-score">${level} / ${result.rawScores[dim]}分</div>
            </div>
            <p>${explanation}</p>
          </div>
        `;
    }).join('');
}

function renderResult() {
    const scoredData = scoreDimensions();
    const rankedMatch = matchPersonality(scoredData.levels);
    const result = determineResultDisplay(scoredData, rankedMatch);
    
    // 获取待渲染的主类型
    const type = result.finalType;

    document.getElementById('resultModeKicker').textContent = result.modeKicker;
    document.getElementById('resultTypeName').textContent = `${type.code}（${type.cn}）`;
    document.getElementById('matchBadge').textContent = result.badge;
    document.getElementById('resultTypeSub').textContent = result.sub;
    document.getElementById('resultDesc').textContent = type.desc;
    document.getElementById('posterCaption').textContent = type.intro;
    
    const funNoteEl = document.getElementById('funNote');
    funNoteEl.textContent = result.special
        ? '本测试仅供娱乐。隐藏人格和傻乐兜底都属于作者故意埋的损招，请勿把它当成医学、心理学、相学、命理学或灵异学依据。'
        : '本测试仅供娱乐，别拿它当诊断、面试、相亲、分手、招魂、算命或人生判决书。你可以笑，但别太当真。';

    const posterBox = document.getElementById('posterBox');
    const posterImage = document.getElementById('posterImage');
    
    if (type.image) {
        posterImage.src = type.image;
        posterImage.alt = `${type.code}（${type.cn}）`;
        posterBox.classList.remove('no-image');
    } else {
        posterImage.removeAttribute('src');
        posterImage.alt = '';
        posterBox.classList.add('no-image');
    }

    renderDimList(result);
    showScreen('result');
}

// ============================================================================
// 程序入口
// ============================================================================
function startTest(preview = false) {
    // 数据未加载防抖
    if (!window.QUIZ_DATA) {
        console.error("Quiz data is not correctly loaded!");
        return;
    }

    app.previewMode = preview;
    app.answers = {};
    app.currentIndex = 0;

    buildQuestionQueue();
    updateProgress();

    showScreen('test');
    renderCurrentQuestion();
}

// 事件挂载
document.getElementById('startBtn').addEventListener('click', () => startTest(false));
document.getElementById('backIntroBtn').addEventListener('click', () => showScreen('intro'));
document.getElementById('restartBtn').addEventListener('click', () => startTest(false));
document.getElementById('toTopBtn').addEventListener('click', () => showScreen('intro'));
