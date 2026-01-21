/**
 * Sport Scoreboard - Script
 */

// In-page console logger (buffers logs until DOM is ready, then shows a textarea)
(function () {
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    const buf = [];


    function formatArgs(args) {
        return args.map(a => {
            try { return (typeof a === 'object') ? JSON.stringify(a) : String(a); } catch (e) { return String(a); }
        }).join(' ');
    }

    console.log = function (...args) {
        const text = formatArgs(args);
        buf.push({ type: 'log', text });
        try {
            const ta = document.getElementById('inpageConsole');
            if (ta) { ta.value += `[${new Date().toLocaleTimeString()}] LOG: ${text}\n`; ta.scrollTop = ta.scrollHeight; }
        } catch (e) { }
        origLog(...args);
    };
    console.warn = function (...args) {
        const text = formatArgs(args);
        buf.push({ type: 'warn', text });
        try {
            const ta = document.getElementById('inpageConsole');
            if (ta) { ta.value += `[${new Date().toLocaleTimeString()}] WARN: ${text}\n`; ta.scrollTop = ta.scrollHeight; }
        } catch (e) { }
        origWarn(...args);
    };
    console.error = function (...args) {
        const text = formatArgs(args);
        buf.push({ type: 'error', text });
        try {
            const ta = document.getElementById('inpageConsole');
            if (ta) { ta.value += `[${new Date().toLocaleTimeString()}] ERROR: ${text}\n`; ta.scrollTop = ta.scrollHeight; }
        } catch (e) { }
        origError(...args);
    };

    function createConsoleUI() {
        // if (document.getElementById('inpageConsole')) return;
        const wrapper = document.createElement('div');
        wrapper.id = 'inpageConsoleWrapper';
        // position at top-left so toggle is always visible
        wrapper.style.cssText = 'position:fixed;left:8px;top:8px;z-index:2147483647;display:flex;flex-direction:column;align-items:flex-start;gap:6px;';

        const btn = document.createElement('button');
        btn.id = 'inpageConsoleToggle';
        btn.textContent = 'Log';
        btn.title = 'Toggle logs';
        btn.style.cssText = 'margin-bottom:6px;';
        btn.onclick = () => { ta.style.display = (ta.style.display === 'none') ? 'block' : 'none'; };
        // btn.style.cssText = 'background:#222;color:#0f0;border:1px solid #444;padding:6px 8px;border-radius:6px;font-size:12px;cursor:pointer;opacity:0.95;';

        const ta = document.createElement('textarea');
        ta.id = 'inpageConsole';
        ta.readOnly = true;


        ta.style.cssText = 'width:320px;height:140px;resize:vertical;background:#111;color:#0f0;padding:8px;font-size:12px;border-radius:6px;opacity:0.95;border:1px solid #333;display:none;';

        // btn.addEventListener('click', () => {
        //     if (ta.style.display === 'none' || ta.style.display === '') {
        //         ta.style.display = 'block';
        //     } else {
        //         ta.style.display = 'none';
        //     }
        // });

        wrapper.appendChild(btn);
        wrapper.appendChild(ta);
        document.body.appendChild(wrapper);

        for (const item of buf) {
            ta.value += `[${new Date().toLocaleTimeString()}] ${item.type.toUpperCase()}: ${item.text}\n`;
        }
        ta.scrollTop = ta.scrollHeight;
        // expose a helper to log into this UI directly
        window.__inpageConsole = { el: ta, write: (s) => { ta.value += s + '\n'; ta.scrollTop = ta.scrollHeight; } };
    }

    if (document.readyState === 'complete' || document.readyState === 'interactive') {
        try { createConsoleUI(); } catch (e) { }
    } else {
        document.addEventListener('DOMContentLoaded', () => { try { createConsoleUI(); } catch (e) { } });
    }
})();

// --- 1. STATE AND GLOBAL VARIABLES ---
let gameState = {
    selectedGame: 'badminton',
    winScore: 11,
    totalSets: 3,
    matchType: 'single',
    currentSet: 1,
    player1Score: 0,
    player2Score: 0,
    player1Sets: 0,
    player2Sets: 0,
    setScores: [],
    pn1: 'Blue Team',
    pn2: 'Red Team',
    scoreHistory: [],
    gameStartTime: null,
    isRecording: false,
    useSTT: false,
    setMemo: '',
    selectedLang: 'ko-KR',
    voiceName: '',
    rate: 1,
    pitch: 1,
    currentServer: 1,
    midSetCourtChanged: false,
    currentGameId: null,
};

let savedNames = [];
let gameHistory = [];
let voicesList = [];
let currentStream, facingMode = 'user', timeUpdateInterval, mediaRecorder, recordedChunks = [];
let html5QrCode = null; // QR 코드 스캐너 인스턴스

let useVoiceRecognition = false;
let isVoiceListening = false;
let isStoppingFromBackground = false;
let isGameOverStop = false; // 경기 종료로 인한 녹화 중지인지 구분

let players = JSON.parse(localStorage.getItem('sport_players')) || [];
let editingPlayerName = null; // 수정 모드 추적용
let ServerCount = 1;    // 피클볼 서브 규칙 (처음만 1인 서브 교체)

const koreascoreVoice = ["영", "일", "이", "삼", "사", "오", "육", "칠", "팔", "구", "십", "십일", "십이", "십삼", "십사", "십오", "십육", "십칠", "십팔", "십구", "이십", "이십일", "이십이", "이십삼", "이십사", "이십오", "이십육", "이십칠", "이십팔", "이십구", "삼십"]; // 한국 점수

const gametitle = ["배드민턴(Badminton)", "탁구(TableTennis)", "족구(Jokgu)", "피클볼(PickleBall)"];

const gameRules = {
    badminton: { title: "배드민턴(Badminton) 규칙", image: "images/badminton.webp", description: `<h3>서브<br><span class="eng-text">Service</span></h3><p>    서브는 대각선 방향으로 넣어야 하며, 네트에 걸리지 않고 상대방 코트의 서비스 라인 안에 떨어져야 합니다.<br><span class="eng-text">The service must be delivered diagonally and must land within the opponent's service court without hitting the net.</span></p><h3>점수<br><span class="eng-text">Scoring</span></h3><ul><li>      모든 랠리에서 점수를 얻는 랠리포인트 시스템입니다.<br><span class="eng-text">It is a rally point system where a point is awarded for every rally won.</span>    </li>    <li>      한 게임은 21점을 먼저 얻는 쪽이 승리합니다.<br>      <span class="eng-text">A game is won by the side that first scores 21 points.</span>    </li>    <li>      20-20 동점(듀스)일 경우, 2점 차이가 날 때까지 경기를 계속합니다.<br>      <span class="eng-text">In case of a 20-20 tie (deuce), the game continues until one side has a 2-point lead.</span>    </li>  </ul>` },
    pingpong: { title: "탁구(TableTennis) 규칙", image: "images/pingpong.webp", description: `<h3>서브 <span class="eng-text">(Service)</span></h3>  <p>    서브는 자신의 코트에 한 번, 상대방 코트에 한 번 바운드되어야 합니다.    <span class="eng-text">The service must bounce once in your own court and once in the opponent's court.</span>  </p>    <h3>점수 <span class="eng-text">(Scoring)</span></h3>  <ul>    <li>      한 게임은 11점을 먼저 얻는 쪽이 승리합니다.      <span class="eng-text">A game is won by the side that first scores 11 points.</span>    </li>    <li>      10-10 동점(듀스)일 경우, 2점 차이가 날 때까지 경기를 계속합니다.      <span class="eng-text">In case of a 10-10 tie (deuce), the game continues until one side has a 2-point lead.</span>    </li>    <li>      서브권은 2점마다 바뀝니다.      <span class="eng-text">The service changes every 2 points.</span>    </li>  </ul>` },
    jokgu: { title: "족구(Jokgu) 규칙", image: "images/jokgu.webp", description: `<h3>서브 <span class="eng-text">(Service)</span></h3>  <p>    서브는 상대방 코트 어디에나 넣을 수 있습니다.    <span class="eng-text">The service can be delivered to any part of the opponent's court.</span>  </p>    <h3>점수 <span class="eng-text">(Scoring)</span></h3>  <ul>    <li>      한 게임은 15점을 먼저 얻는 쪽이 승리합니다.      <span class="eng-text">A game is won by the side that first scores 15 points.</span>    </li>    <li>      14-14 동점(듀스)일 경우, 2점 차이가 날 때까지 경기를 계속합니다.      <span class="eng-text">In case of a 14-14 tie (deuce), the game continues until one side has a 2-point lead.</span>    </li>  </ul>` },
    pickleball: { title: "피클볼(PickleBall) 규칙", image: "images/pickleball.webp", description: `<h3>서브 <span class="eng-text">(Service)</span></h3>  <p>    서브는 언더핸드로, 대각선 방향으로 넣어야 하며, 논-발리 존(키친)에 들어가면 안 됩니다.    <span class="eng-text">The service must be underhand, delivered diagonally, and must not land in the non-volley zone (the kitchen).</span>  </p>    <h3>점수 <span class="eng-text">(Scoring)</span></h3>  <ul>    <li>      서브권을 가진 팀만 득점할 수 있습니다.      <span class="eng-text">Only the serving team can score points.</span>    </li>    <li>      한 게임은 11점을 먼저 얻는 쪽이 승리합니다.      <span class="eng-text">A game is won by the side that first scores 11 points.</span>    </li>    <li>      10-10 동점일 경우, 2점 차이가 날 때까지 경기를 계속합니다.      <span class="eng-text">In case of a 10-10 tie, the game continues until one side has a 2-point lead.</span>    </li>  </ul>` }
};

const sportPresets = {
    badminton: 21,
    pingpong: 11,
    jokgu: 15,
    pickleball: 11
};
// --- 안드로이드로부터 호출될 전역 함수 정의 ---
window.stopRecording = function () {
    console.log("video stop.");
    isStoppingFromBackground = true;
    // 필요하다면, '준비 완료' UI 피드백을 줄 수 있음
};

window.onVoiceReady = function () {
    console.log("Voice recognizer is ready.");
    // 필요하다면, '준비 완료' UI 피드백을 줄 수 있음
};

window.onPartialVoiceResult = function (text) {
    // 음성인식 설정 화면에서 실시간으로 인식되는 단어 보여주기
    if (document.getElementById('voiceSettings').classList.contains('active')) {
        document.getElementById('recognizedWord').textContent = text;
    }
};

window.onVoiceResult = function (text) {
    console.log("Final voice result:", text);
    const voiceTestBtn = document.getElementById('voiceTestBtn');
    const recognizedWordSpan = document.getElementById('recognizedWord');

    // 테스트 화면 처리
    if (document.getElementById('voiceSettings').classList.contains('active')) {
        // if (text.includes("원포인트") || text.includes("투포인트") || text.includes("1.") || text.includes("2.") || text.includes("1 포인트") || text.includes("2 포인트")) {
        if (text.includes("블루팀") || text.includes("레드팀") || text.includes("블루 팀") || text.includes("레드 팀")) {
            recognizedWordSpan.textContent = text + " : OK";
            recognizedWordSpan.style.color = "green";
        } else {
            recognizedWordSpan.style.color = "red";
            recognizedWordSpan.textContent = text;
        }

        voiceTestBtn.classList.remove('listening');
        voiceTestBtn.disabled = false;
    }

    // 스코어보드 화면 처리
    if (document.getElementById('scoreboard').classList.contains('active') && useVoiceRecognition) {
        // if (text.includes("원포인트") || text.includes("원 포인트") || text.includes("일팀") || text.includes("1 포인트")) {
        if (text.includes("블루팀") || text.includes("블루 팀")) {
            handleRallyWonBy(1);
            // TTS로 피드백 (선택사항)
            //            if (gameState.useSTT) speakScore();
            // } else if (text.includes("투포인트") || text.includes("두포인트") || text.includes("두 포인트") || text.includes("투 포인트") || text.includes("2.") || text.includes("2 포인트")) {
        } else if (text.includes("레드팀") || text.includes("레드 팀")) {
            handleRallyWonBy(2);
            // TTS로 피드백 (선택사항)
            //            if (gameState.useSTT) speakScore();
        }
        // 점수 처리 후 다시 음성인식 시작
        if (isVoiceListening && window.AndroidInterface?.startVoiceRecognition) {
            window.AndroidInterface.startVoiceRecognition();
        }
    }
};

window.onVoiceError = function (error) {
    console.error("Voice recognition error:", error);
    const voiceTestBtn = document.getElementById('voiceTestBtn');
    if (voiceTestBtn) {
        voiceTestBtn.classList.remove('listening');
        voiceTestBtn.disabled = false;
        isVoiceListening = false;
        // UI 업데이트
        const voiceControlBtn = document.getElementById('voiceControlBtn');
        if (voiceControlBtn) voiceControlBtn.classList.remove('active');
    }
    else if (useVoiceRecognition) {
        voiceControlBtn.style.display = 'block';
        voiceControlBtn.classList.remove('active'); // 초기화
        isVoiceListening = false; // 초기화

        isVoiceListening = !isVoiceListening;
        if (isVoiceListening) {
            if (window.AndroidInterface?.startVoiceRecognition) {
                window.AndroidInterface.startVoiceRecognition();
                voiceControlBtn.classList.add('active');
                voiceControlBtn.title = "음성인식 중지(Stop voice recognition)";
            }
        }
    }
};

// Safe UTF-8 Base64 conversion for Korean support
function utf8_to_b64(str) {
    return btoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g, function (match, p1) {
        return String.fromCharCode('0x' + p1);
    }));
}

function b64_to_utf8(str) {
    return decodeURIComponent(atob(str).split('').map(function (c) {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
    }).join(''));
}

function onQrCodeScanned(qrData) {
    try {
        // const decoded = b64_to_utf8(qrData);
        // const newRecord = JSON.parse(decoded);
        const decompressedString = LZString.decompressFromBase64(qrData);
        const newRecord = JSON.parse(decompressedString);
        console.log("복원:", newRecord); // 원본과 동일

        console.log('QR : ' + newRecord);
        if (!newRecord || !newRecord.id) {
            alert("유효하지 않은 QR 코드입니다. This is an invalid QR code.");
            closeQrScannerModal();
            return;
        }
        if (gameHistory.some(record => record.id === newRecord.id)) {
            alert("이미 존재하는 기록입니다.This is a record that already exists.");
            closeQrScannerModal();
            return;
        }
        console.log('checkAndAdd 1: ' + newRecord.pn1);
        // 선수 자동 추가 로직 (데이터 무결성 및 다운 방지)
        const checkAndAdd = (name) => {
            if (name && !players.some(p => p.name === name)) {
                players.push({ name: name, wins: 0, losses: 0, history: [] });
            }
        };

        checkAndAdd(newRecord.pn1);
        // console.log('checkAndAdd 1: ' + newRecord.pn1);

        checkAndAdd(newRecord.pn2);
        // console.log('checkAndAdd 2: ' + newRecord.pn2);
        updateStorageAndRender();
//        console.log('updateStorageAndRender');

        gameHistory.unshift(newRecord);
        saveHistory();
//        console.log('saveHistory');
        renderHistoryList();
//        console.log('renderHistoryList');
        alert("경기 기록을 성공적으로 가져왔습니다. Match records were successfully imported.");
    } catch (e) {
        console.error(e);
        alert("데이터 처리 오류가 발생했습니다. A data processing error occurred.");
    }
    closeQrScannerModal();
}

function shareHistoryEntry(id) {
    const r = gameHistory.find(h => h.id.toString() === id.toString());
    if (!r) return;

    try {
        const container = document.getElementById('qrcode');
        container.innerHTML = "";
        const qr = qrcode(0, 'Q');

        const jsonString = JSON.stringify(r); // 문자열화 (예: ~100바이트)

        const compressed = LZString.compressToBase64(jsonString);
        console.log("압축 크기:", compressed.length); // 보통 50-70% 감소
        console.log("압축 결과:", compressed);


        qr.addData(compressed);
        // qr.addData(utf8_to_b64(JSON.stringify(r)));
        qr.make();
        container.innerHTML = qr.createImgTag(5, 0);  // Cell size, high space
        document.getElementById('qrCodeModal').classList.add('active');
    } catch (e) {
        alert("QR 생성 실패: 데이터가 너무 많습니다.");
    }
}

// --- 2. DATA PERSISTENCE ---
/** 선수 저장 (추가 및 수정) */
function savePlayer() {
    const nameInput = document.getElementById('newSavedName');
    const name = nameInput.value.trim();

    if (!name) return alert("이름을 입력하세요. Please enter your name.");

    // 수정 모드인 경우
    if (editingPlayerName) {
        const index = players.findIndex(p => p.name === editingPlayerName);
        if (index !== -1) {
            players[index].name = name;
            editingPlayerName = null;
        }
    } else {
        // 신규 추가 시 중복 체크
        if (players.some(p => p.name === name)) {
            return alert("등록된 선수 이름이 존재합니다. (Player already exists)");
        }
        players.push({
            name: name,
            wins: 0,
            losses: 0,
            history: [] // 상세 게임 기록 필요 시 활용
        });
    }

    nameInput.value = "";
    updateStorageAndRender();
}

function updateStorageAndRender() {
    localStorage.setItem('sport_players', JSON.stringify(players));
    renderPlayerList();
}

/** 선수 리스트 및 전적 렌더링 */
function renderPlayerList() {
    const listContainer = document.getElementById('savedNamesList');
    listContainer.innerHTML = "";
    if (players.length === 0) {
        listContainer.innerHTML = '<p>저장된 선수 기록이 없습니다.<br>There are no saved player records</p>';
        return;
    }
    players.forEach(player => {
        // 1. 최근 10경기 날짜순 추출 (내림차순 정렬)
        const recentMatches = [...player.history]
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, 10);

        const totalPlayed = player.wins + player.losses;
        const winRate = totalPlayed > 0 ? ((player.wins / totalPlayed) * 100).toFixed(1) : 0;

        const item = document.createElement('div');
        item.className = 'player-card';
        item.style = "background:#fff; margin-bottom:12px; padding:15px; border-radius:10px; border:1px solid #eee;";

        // 2. 최근 10경기 승/패 스트릭 HTML 생성
        const streakHtml = recentMatches.map(m => `
            <span style="
                display:inline-block; width:18px; height:18px; line-height:18px;
                text-align:center; font-size:10px; border-radius:3px; margin-right:3px;
                background: ${m.result === 'W' ? '#4dabf7' : '#ff8787'}; color: #fff;
            " title="${m.date.split('T')[0]} vs ${m.opponent}">
                ${m.result}
            </span>
        `).join('');

        item.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                <div>
                    <h4 style="margin:0; font-size:1.2rem;">${player.name}</h4>
                    <p style="margin:5px 0; font-size:0.9rem; color:#666;">
                        통산: <strong>${player.wins}승 ${player.losses}패</strong> (승률 ${winRate}%)
                    </p>
                    <div style="margin-top:10px;">
                        <span style="font-size:0.8rem; color:#999; display:block; margin-bottom:4px;">최근 10경기 현황:</span>
                        ${streakHtml || '<span style="color:#ccc; font-size:0.8rem;">경기 기록 없음</span>'}
                    </div>
                </div>
                <div style="display:flex; flex-direction:column; gap:5px;">
                <button
                  onclick="showPlayerStats('${player.name}')"
                  class="player-btn"
                >
                  통계<br>(Stats)
                </button>

                <button
                  onclick="deletePlayer('${player.name}')"
                  class="player-btn delete"
                >
                  삭제<br>(Delete)
                </button>
                </div>
            </div>
        `;
        listContainer.appendChild(item);
    });

    updateTotalSummary(); // 전체 요약 갱신
}
/**
 * 선수 관리 상단의 요약 정보를 '총 경기 수'와 '등록된 선수 수' 위주로 간결하게 표시합니다.
 */
function updateTotalSummary() {
    const summaryContainer = document.getElementById('totalStatsSummary');
    if (!summaryContainer) return;

    // 1. 총 선수 수 및 총 경기 수 계산
    const totalPlayers = players.length;

    // 모든 선수의 승리 횟수 합 = 총 진행된 경기 수 (폐쇄형 시스템 기준)
    const totalGames = players.reduce((acc, player) => acc + (player.wins || 0), 0);

    // 2. UI 업데이트
    summaryContainer.style.cssText = `
        background: #f1f3f5;
        padding: 12px;
        border-radius: 8px;
        margin-bottom: 15px;
        text-align: center;
        border: 1px solid #dee2e6;
    `;

    summaryContainer.innerHTML = `
        <div style="display: flex; justify-content: space-around; align-items: center; font-family: sans-serif;">
            <div style="flex: 1;">
                <span style="font-size: 0.75rem; color: #666; display: block; margin-bottom: 4px;">등록 선수</span>
                <strong style="font-size: 1.1rem; color: #212529;">${totalPlayers}명</strong>
            </div>
            <div style="width: 1px; background: #dee2e6; height: 25px;"></div>
            <div style="flex: 1;">
                <span style="font-size: 0.75rem; color: #666; display: block; margin-bottom: 4px;">총 경기 기록</span>
                <strong style="font-size: 1.1rem; color: #212529;">${totalGames} Game</strong>
            </div>
        </div>
    `;
}

// --- Player statistics rendering ---
let _playerScoreChart = null;
let _playerWinChart = null;

/**
 * 선수 전적 업데이트 (날짜 기반 객체 저장)
 */
function updatePlayerStats(playerName, isWin, opponentName, winnerScore, loserScore) {
    const playerIndex = players.findIndex(p => p.name === playerName);

    if (playerIndex !== -1) {
        if (isWin) players[playerIndex].wins++;
        else players[playerIndex].losses++;

        // 상세 경기 객체 생성
        const matchRecord = {
            id: Date.now() + Math.random(), // 고유 ID
            date: new Date().toISOString(), // 정렬을 위한 ISO 날짜
            result: isWin ? 'W' : 'L',
            opponent: opponentName,
            score: `${winnerScore}:${loserScore}`
        };

        // 히스토리에 추가
        players[playerIndex].history.push(matchRecord);

        // 로컬 스토리지 저장 및 UI 갱신
        updateStorageAndRender();
    }
}

function closePlayerStats() {
    const modal = document.getElementById('playerStatsModal');
    if (modal) modal.classList.remove('active');
    try { if (_playerScoreChart) { _playerScoreChart.destroy(); _playerScoreChart = null; } } catch (e) { }
    try { if (_playerWinChart) { _playerWinChart.destroy(); _playerWinChart = null; } } catch (e) { }
}


/** 수정 모드 진입 */
function editPlayer(name) {
    const input = document.getElementById('newSavedName');
    const applyBtn = document.querySelector('.player-input-group .apply-btn');

    input.value = name;
    editingPlayerName = name;
    if (applyBtn) applyBtn.textContent = '저장(Save)'; // 버튼 텍스트 변경
    input.focus();
}

/** 삭제 기능 */
function deletePlayer(name) {
    if (confirm(`${name} 선수를 삭제하시겠습니까?`)) {
        players = players.filter(p => p.name !== name);
        updateStorageAndRender();
    }
}

/** 경기 결과 기록 (승리 시 호출 예시) */
function recordMatchResult(playerName, isWin) {
    const player = players.find(p => p.name === playerName);
    if (player) {
        isWin ? player.wins++ : player.losses++;
        updateStorageAndRender();
    }
}
function saveHistory() {
    try {
        localStorage.setItem('gameHistory', JSON.stringify(gameHistory));
        return true;
    } catch (e) {
        console.error('saveHistory failed:', e);
        // Handle quota exceeded: try stripping large video data and retry
        try {
            if (e && (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e.code === 22)) {
                logTest && typeof logTest === 'function' && logTest('저장 공간 부족: 비디오 데이터 제거 후 재시도합니다.');
                // remove video data from entries
                for (let i = 0; i < gameHistory.length; i++) {
                    if (gameHistory[i] && gameHistory[i].videoUrl) gameHistory[i].videoUrl = null;
                }
                localStorage.setItem('gameHistory', JSON.stringify(gameHistory));
                alert('저장 공간이 부족하여 비디오 데이터는 로컬에 저장되지 않았습니다. 다운로드 파일을 확인하세요.');
                return true;
            }
        } catch (e2) {
            console.error('saveHistory retry after stripping videoUrl failed:', e2);
        }
        // As a last resort, try to save minimal metadata only
        try {
            const minimal = gameHistory.map(r => ({ id: r.id, date: r.date, game: r.game, pn1: r.pn1, pn2: r.pn2, winner: r.winner }));
            localStorage.setItem('gameHistory', JSON.stringify(minimal));
            gameHistory = minimal;
            alert('저장 공간 부족으로 일부 기록만 저장되었습니다. 비디오 파일은 저장되지 않았습니다.');
            return true;
        } catch (e3) {
            console.error('saveHistory final fallback failed:', e3);
            alert('기록 저장에 실패했습니다. 브라우저 저장 공간을 확인해주세요.');
            return false;
        }
    }
}
function loadHistory() { const data = localStorage.getItem('gameHistory'); if (data) gameHistory = JSON.parse(data); }

// --- IndexedDB helpers for storing large video Blobs ---
function openVideoDB() {
    return new Promise((resolve, reject) => {
        if (!window.indexedDB) return reject(new Error('IndexedDB not supported'));
        const req = indexedDB.open('SportScoreDB', 1);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains('videos')) db.createObjectStore('videos', { keyPath: 'id' });
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error || new Error('IndexedDB open failed'));
    });
}

function saveBlobToIDB(id, blob) {
    return new Promise(async (resolve) => {
        try {
            const db = await openVideoDB();
            const tx = db.transaction('videos', 'readwrite');
            const store = tx.objectStore('videos');
            const putReq = store.put({ id: String(id), blob: blob, type: blob.type, date: new Date().toISOString() });
            putReq.onsuccess = () => { };
            putReq.onerror = () => { };
            tx.oncomplete = () => { try { db.close(); } catch (e) { }; resolve(true); };
            tx.onabort = tx.onerror = () => { try { db.close(); } catch (e) { }; resolve(false); };
        } catch (e) { console.error('saveBlobToIDB error', e); resolve(false); }
    });
}

function getBlobFromIDB(id) {
    return new Promise(async (resolve) => {
        try {
            const db = await openVideoDB();
            const tx = db.transaction('videos', 'readonly');
            const store = tx.objectStore('videos');
            const getReq = store.get(String(id));
            getReq.onsuccess = () => {
                const rec = getReq.result;
                try { db.close(); } catch (e) { }
                resolve(rec ? rec.blob : null);
            };
            getReq.onerror = () => { try { db.close(); } catch (e) { }; resolve(null); };
        } catch (e) { console.error('getBlobFromIDB error', e); resolve(null); }
    });
}

function deleteBlobFromIDB(id) {
    return new Promise(async (resolve) => {
        try {
            const db = await openVideoDB();
            const tx = db.transaction('videos', 'readwrite');
            const store = tx.objectStore('videos');
            const delReq = store.delete(String(id));
            delReq.onsuccess = () => { try { db.close(); } catch (e) { }; resolve(true); };
            delReq.onerror = () => { try { db.close(); } catch (e) { }; resolve(false); };
        } catch (e) { console.error('deleteBlobFromIDB error', e); resolve(false); }
    });
}

// --- 3. UI & SCREEN MANAGEMENT ---
function showScreen(screenId) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(screenId)?.classList.add('active'); }
function displayGameInfo(gameId) {
    if (!gameRules[gameId]) return;
    gameState.selectedGame = gameId;
    localStorage.setItem('lastSelectedGame', gameId);
    const rule = gameRules[gameId];
    document.getElementById('ruleDisplayImage').src = `images/StadiumSpecifications_${gameId}.webp`;
    document.getElementById('ruleDisplayDescription').innerHTML = rule.description;
    document.getElementById('ruleDisplay').style.display = 'block';
    document.querySelectorAll('.game-btn').forEach(btn => btn.classList.toggle('selected', btn.getAttribute('onclick').includes(`'${gameId}'`)));
}

function showGameSettings() {
    const gameId = gameState.selectedGame;
    const gameTitle = gameRules[gameId]?.title.replace(' 규칙', '') || '게임';
    document.getElementById('selectedGameTitle').textContent = `${gameTitle} 설정`;
    const last = gameHistory[0];
    document.getElementById('playerReg1').value = last ? last.pn1 : "Blue Team";
    document.getElementById('playerReg2').value = last ? last.pn2 : "Red Team";

    updateMatchTypeVisibility(gameId);
    setSportMode(gameId);
    showScreen('gameSettings');
}

function setSportMode(mode) {
    const score = sportPresets[mode];
    if (score) {
        updateWinScore(score);
    }
}
function updateWinScore(newScore) {
    if (newScore < 1 || newScore > 25) return; // 유효성 검사

    const winScoreRange = document.getElementById('winScoreRange');
    const winScoreValue = document.getElementById('winScoreValue');

    // 슬라이더 바 위치 변경
    winScoreRange.value = newScore;
    // 상단 텍스트 변경
    winScoreValue.textContent = newScore;
}
function updateScoreboard() {
    document.getElementById('score1').textContent = gameState.player1Score;
    document.getElementById('score2').textContent = gameState.player2Score;
    document.getElementById('player1SetsInline').textContent = gameState.player1Sets;
    document.getElementById('player2SetsInline').textContent = gameState.player2Sets;
    document.querySelector('#player1Score .player-name').textContent = gameState.pn1;
    document.querySelector('#player2Score .player-name').textContent = gameState.pn2;
    updateServeColor();
}
function updateServeColor() { 
    const s1 = document.getElementById('score1'); 
    const s2 = document.getElementById('score2'); 
    s1.classList.remove('serve'); 
    s2.classList.remove('serve'); 
    if (gameState.currentServer === 1) s1.classList.add('serve'); 
    else s2.classList.add('serve'); 
}
function updateTeamColor(isAuto = false) { 
    const s1 = document.getElementById('pn1'); 
    const s2 = document.getElementById('pn2'); 
    s1.classList.remove('blue'); 
    s2.classList.remove('red'); 
    s1.classList.remove('red');
    s2.classList.remove('blue');
    if (isAuto) {
        s1.classList.add('blue'); 
        s2.classList.add('red'); 
    }
    else{
        s1.classList.add('red'); 
        s2.classList.add('blue'); 
    }
}
function showEndScreen(winner) {
    //console.log('showEndScreen: start.');
    const gameEndScreen = document.getElementById('gameEnd');
    // gameState.setScores.push({ p1: gameState.player1Score, p2: gameState.player2Score });
    if (winner === 1) {
        updatePlayerStats(gameState.pn1, true, gameState.pn2, gameState.player1Score, gameState.player2Score)
        updatePlayerStats(gameState.pn2, false, gameState.pn2, gameState.player1Score, gameState.player2Score)
    }
    else {
        updatePlayerStats(gameState.pn2, true, gameState.pn2, gameState.player2Score, gameState.player1Score)
        updatePlayerStats(gameState.pn1, false, gameState.pn1, gameState.player2Score, gameState.player1Score)
    }
    const winnerName = winner === 1 ? gameState.pn1 : gameState.pn2;
    document.getElementById('winnerText').textContent = winnerName;
    document.getElementById('player1DisplayName').textContent = gameState.pn1;
    document.getElementById('player2DisplayName').textContent = gameState.pn2;
    document.getElementById('finalScore').textContent = gameState.player1Sets;
    document.getElementById('finalScore2').textContent = gameState.player2Sets;

    const newRecord = {
        id: gameState.currentGameId || Date.now(),
        game: gameState.selectedGame,
        date: new Date().toISOString(),
        pn1: gameState.pn1,
        pn2: gameState.pn2,
        ps1: gameState.player1Sets,
        ps2: gameState.player2Sets,
        setScores: gameState.setScores,
        memo: gameState.setMemo,
        winner: winnerName,
        videoUrl: null
    };
    const existingRecordIndex = gameHistory.findIndex(r => r.id === newRecord.id);
    if (existingRecordIndex > -1) gameHistory[existingRecordIndex] = newRecord;
    else gameHistory.unshift(newRecord);
    saveHistory();

    if (mediaRecorder && mediaRecorder.state === "recording") {
        isGameOverStop = true;
        mediaRecorder.stop();
    }

    if (timeUpdateInterval) clearInterval(timeUpdateInterval);

    const victoryImageUrl = `images/win_${gameState.selectedGame}.webp`;
    gameEndScreen.style.backgroundImage = `url('${victoryImageUrl}')`;
    const victorySound = document.getElementById('victorySound');
    if (victorySound && !victorySound.src) {
        victorySound.src = "sounds/victory.mp3";
    }
    victorySound?.play().catch(e => console.error("Audio play failed:", e));
    // If there is recorded video data (either in recordedChunks or persisted lastRecordedBlob), show review/save modal
    try {
        let hasBlob = (recordedChunks && recordedChunks.length > 0) || gameState.hasRecordedBlob;
        if (hasBlob) {
            let videoUrl = null;
            // Prefer freshly-created blob URLs from current recordedChunks
            if (recordedChunks && recordedChunks.length > 0) {
                const blobType = recordedChunks[0]?.type || 'video/webm';
                const blob = new Blob(recordedChunks, { type: blobType });
                try {
                    videoUrl = URL.createObjectURL(blob);
                    gameState.lastRecordedBlob = blob;
                    gameState.lastRecordedUrl = videoUrl;
                    gameState.hasRecordedBlob = true;
                } catch (e) {
                    console.error('Failed to create object URL from recordedChunks:', e);
                    videoUrl = null;
                }
            } else if (gameState.lastRecordedBlob) {
                // Recreate a fresh object URL from the stored blob (avoids stale/revoked blob:null URLs)
                try {
                    videoUrl = URL.createObjectURL(gameState.lastRecordedBlob);
                    gameState.lastRecordedUrl = videoUrl;
                    gameState.hasRecordedBlob = true;
                } catch (e) {
                    console.error('Failed to recreate object URL from lastRecordedBlob:', e);
                    videoUrl = null;
                }
            } else if (gameState.lastRecordedUrl && typeof gameState.lastRecordedUrl === 'string' && gameState.lastRecordedUrl.startsWith('data:')) {
                // If we previously persisted a data: URL (base64), use it directly
                videoUrl = gameState.lastRecordedUrl;
            }
            // Note: do NOT accept stored blob: URLs from previous sessions (they may be revoked/invalid)
            // This prevents blob:null/... errors when assigning to <video>.src

            if (videoUrl) {
                // use dedicated end-of-game modal so Save/Cancel are available
                const reviewEl = document.getElementById('endGameReviewVideo') || document.getElementById('reviewVideo');
                if (reviewEl) reviewEl.src = videoUrl;
                const endModal = document.getElementById('endGameVideoModal');
                if (endModal) {
                    endModal.classList.add('active');
                } else {
                    // const reviewModal = document.getElementById('videoReviewModal');
                    // if (reviewModal) reviewModal.classList.add('active');
                }
                logTest && typeof logTest === 'function' && logTest('게임 종료: 녹화된 영상이 있으므로 저장/미리보기를 표시합니다.');
                console.log('showEndScreen: end-game preview modal available.');
            }
        }
    } catch (e) {
        console.error('showEndScreen: preview modal failed', e);
    }

    showScreen('gameEnd');
    triggerConfetti();

}

function triggerConfetti() { const canvas = document.getElementById('confettiCanvas'); const myConfetti = confetti.create(canvas, { resize: true }); myConfetti({ particleCount: 150, spread: 180, origin: { y: 0.6 } }); }
function updateMatchTypeVisibility(game) {
    document.getElementById('matchTypeGroup').style.display = ('pingpong' === game || 'badminton' === game || 'pickleball' === game) ? 'flex' : 'none';
}
function updateTimeDisplays() { const now = new Date(); document.getElementById('currentTimeDisplay').textContent = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`; if (gameState.gameStartTime) { const elapsed = Math.floor((Date.now() - gameState.gameStartTime) / 1000); const h = String(Math.floor(elapsed / 3600)).padStart(2, '0'); const m = String(Math.floor((elapsed % 3600) / 60)).padStart(2, '0'); const s = String(elapsed % 60).padStart(2, '0'); document.getElementById('elapsedTimeDisplay').textContent = `${h}:${m}:${s}`; } }
// --- 4. CORE GAME LOGIC ---
function handleRallyWonBy(player) {
    const Prev1 = gameState.player1Score;
    const Prev2 = gameState.player2Score;

    if (player === 1) gameState.player1Score++; else gameState.player2Score++;
    gameState.scoreHistory.push({ p1: gameState.player1Score, p2: gameState.player2Score, server: gameState.currentServer });
    const oldServer = gameState.currentServer;
    const totalScore = gameState.player1Score + gameState.player2Score;
    const deucePoint = gameState.winScore - 1;
    switch (gameState.selectedGame) {
        case 'pingpong':
            if (gameState.matchType !== 'single') {
                if (totalScore % 5 === 0 && totalScore > 0) {
                    gameState.currentServer = oldServer === 1 ? 2 : 1;
                }
            }
            else {
                if (totalScore % 2 === 0 && totalScore > 0) {
                    gameState.currentServer = oldServer === 1 ? 2 : 1;
                }
            }
            if (gameState.player1Score >= deucePoint && gameState.player2Score >= deucePoint) {
                gameState.currentServer = oldServer === 1 ? 2 : 1;
            }
            break;
        case 'pickleball':
            if (gameState.player1Score >= deucePoint && gameState.player2Score >= deucePoint) {
                gameState.currentServer = oldServer === 1 ? 2 : 1;
            }
            else if (gameState.matchType !== 'single') {
                if (player !== gameState.currentServer) {
                    gameState.player1Score = Prev1;
                    gameState.player2Score = Prev2;
                    if (ServerCount == 1) ServerCount = 2;
                    else if (ServerCount == 2) {
                        ServerCount = 1;
                        gameState.currentServer = oldServer === 1 ? 2 : 1;
                    }
                }
            }
            else {
                if (player !== gameState.currentServer) {
                    gameState.player1Score = Prev1;
                    gameState.player2Score = Prev2;
                    gameState.currentServer = oldServer === 1 ? 2 : 1;
                }
            }
            break;
        default:
            gameState.currentServer = player;
            break;
    }
    if (oldServer !== gameState.currentServer) {
        notifyServeChange();
    }
    updateScoreboard();
    speakCurrentScore();
    checkAutoCourtChange();
    checkSetWin();
}

function checkSetWin() {
    const { player1Score, player2Score, winScore } = gameState;
    let setWinner = null;
    if (player1Score >= winScore && player1Score >= player2Score + 2) setWinner = 1;
    else if (player2Score >= winScore && player2Score >= player1Score + 2) setWinner = 2;
    if (setWinner) {
        gameState.setScores.push({ p1: player1Score, p2: player2Score });
        if (setWinner === 1) gameState.player1Sets++; else gameState.player2Sets++;
        speakNarration(setWinner === 1 ? gameState.pn1 : gameState.pn2);
        if (!checkGameWin()) {
            gameState.currentSet++;
            resetSet();

            switchCourt(true);
            notifyCourtChange();
            gameState.midSetCourtChanged = true;
        }
    }
}

function checkGameWin() { const setsToWin = Math.ceil(gameState.totalSets / 2); if (gameState.player1Sets >= setsToWin) { showEndScreen(1); return true; } if (gameState.player2Sets >= setsToWin) { showEndScreen(2); return true; } return false; }
function resetSet() { gameState.player1Score = 0; gameState.player2Score = 0; gameState.scoreHistory = []; gameState.midSetCourtChanged = false; updateScoreboard(); speakNarration('setReset'); }
function undoLastScore() { if (gameState.scoreHistory.length > 1) { gameState.scoreHistory.pop(); const last = gameState.scoreHistory[gameState.scoreHistory.length - 1]; gameState.player1Score = last.p1; gameState.player2Score = last.p2; gameState.currentServer = last.server; } else { gameState.player1Score = 0; gameState.player2Score = 0; gameState.scoreHistory = []; } updateScoreboard(); speakNarration('undo'); }
function checkAutoCourtChange() {
    const isFinalSet = (gameState.player1Sets + gameState.player2Sets) === (gameState.totalSets - 1);
    const halfwayPoint = Math.ceil(gameState.winScore / 2);
    if (gameState.midSetCourtChanged) return;
    let needsChange = false;
    if (gameState.selectedGame === 'jokgu') {
        if (gameState.player1Score === 8 || gameState.player2Score === 8) needsChange = true;
    }
    if (isFinalSet) {
        if (gameState.player1Score === halfwayPoint || gameState.player2Score === halfwayPoint) needsChange = true;
    }
    if (needsChange) {
        switchCourt(true);
        notifyCourtChange();
        gameState.midSetCourtChanged = true;
    }
}

function notifyServeChange() { speakNarration('serveChange'); const notification = document.getElementById('gameNotification'); if (notification) { notification.textContent = "서브권 변경\nChange serve"; notification.classList.add('show'); setTimeout(() => notification.classList.remove('show'), 1500); } }
function notifyCourtChange() { speakNarration('courtChange'); const notification = document.getElementById('gameNotification'); if (notification) { notification.textContent = "코트 변경\nChange courts!"; notification.classList.add('show'); setTimeout(() => notification.classList.remove('show'), 1500); } }

// --- 5. GAME SETUP & CONTROL ---
async function startGame() {
    gameState.currentGameId = Date.now();
    gameState.winScore = parseInt(document.getElementById('winScoreRange').value, 10);
    gameState.totalSets = parseInt(document.getElementById('totalSetsRange').value, 10);
    gameState.setMemo = (document.getElementById('setMemoInput').value || "").substring(0, 40);
    gameState.setScores = [];
    applyPlayerNames();

    if (gameState.pn1.trim() === '' || gameState.pn2.trim() === '')
        return alert('선수 이름을 입력하세요. Please enter player names.');
    if (gameState.pn1 === gameState.pn2)
        return alert('선수 이름이 중복되었습니다. Please enter different player names.');

    gameState.isRecording = document.getElementById('enableRecording').checked;
    // whether to capture audio along with video (user-configurable)
    gameState.recordWithAudio = !!document.getElementById('includeAudio')?.checked;
    document.getElementById('recordStopButton').style.display = gameState.isRecording ? 'flex' : 'none';
    if (gameState.isRecording) {
        facingMode = document.getElementById('cameraFacing').value;
        await startCamera(true);
    }
    const voiceRecToggle = document.getElementById('voiceRecToggle'); // 새로 추가
    gameState.useSTT = voiceRecToggle.checked;
    useVoiceRecognition = voiceRecToggle.checked; // 새로 추가
    // 음성인식 사용 여부에 따라 스코어보드 버튼 보이기/숨기기
    const voiceControlBtn = document.getElementById('voiceControlBtn');
    if (useVoiceRecognition) {
        voiceControlBtn.style.display = 'block';
        voiceControlBtn.classList.remove('active'); // 초기화
        isVoiceListening = false; // 초기화

        isVoiceListening = !isVoiceListening;
        if (isVoiceListening) {
            if (window.AndroidInterface?.startVoiceRecognition) {
                window.AndroidInterface.startVoiceRecognition();
                voiceControlBtn.classList.add('active');
                voiceControlBtn.title = "음성인식 중지(Stop voice recognition)";
            }
        }
    } else {
        voiceControlBtn.style.display = 'none';
    }
    const matchTypeInput = document.querySelector('input[name="matchType"]:checked');
    gameState.matchType = matchTypeInput ? matchTypeInput.value : 'single';
    // pickleball doubles 서버 초기화
    if (gameState.selectedGame === 'pickleball' && gameState.matchType !== 'single') {
        ServerCount = 2;
    }
    gameState.currentSet = 1;
    gameState.player1Sets = 0;
    gameState.player2Sets = 0;
    document.getElementById('gameNameDisplay').textContent = gameRules[gameState.selectedGame].title.replace(' 규칙','');
    gameState.gameStartTime = Date.now();
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    timeUpdateInterval = setInterval(updateTimeDisplays, 1000);
    resetSet();
    updateTimeDisplays();
    showScreen('scoreboard');
    speakNarration('gameStart');
    updateTeamColor(true);
}

// 안드로이드 TTS 호출 함수 (새로 추가)
function testVoice(text) {
    if (window.AndroidInterface?.testVoice) {
        window.AndroidInterface.testVoice(text);
    } else {
        // 웹 환경 대체 (브라우저 TTS 사용)
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = 'ko-KR';
        speechSynthesis.speak(utterance);
    }
}

function switchCourt(isAuto = false) {
    [gameState.player1Score, gameState.player2Score] = [gameState.player2Score, gameState.player1Score];
    [gameState.player1Sets, gameState.player2Sets] = [gameState.player2Sets, gameState.player1Sets];
    [gameState.pn1, gameState.pn2] = [gameState.pn2, gameState.pn1];
    updateScoreboard();
    if (!isAuto) {
        gameState.currentServer = gameState.currentServer == 1 ? 2 : 1;
        updateServeColor(); notifyCourtChange(); speakNarration('courtSwap');
    }
    updateTeamColor();
}
function showGameSelection() {
    const gameEndScreen = document.getElementById('gameEnd');
    if (gameEndScreen) { gameEndScreen.style.backgroundImage = 'none'; }
    if (timeUpdateInterval) clearInterval(timeUpdateInterval);
    gameState.isRecording = false;
    document.getElementById('recordStopButton').style.display = 'none';
    // Close any active video modals and clear transient recording state so review modal won't reappear
    try { closeActiveVideoModal(); } catch (e) { /* ignore if not defined */ }
    // clear last recorded blob/url to avoid resurrecting stale object URLs
    try { gameState.lastRecordedBlob = null; gameState.lastRecordedUrl = null; gameState.hasRecordedBlob = false; } catch (e) { }
    stopCamera(); showScreen('gameSelection');
}

// --- 6. SPEECH, CAMERA, MODALS, etc. ---
const narrations = { 'ko-KR': { gameStart: "게임 시작", setReset: "세트 리셋", courtSwap: "코트 교체", player1SetWin: "1번 선수 세트", player2SetWin: "2번 선수 세트", undo: "실수 수정", serveChange: "서브 교체", courtChange: "코트 체인지" }, 'en-US': { gameStart: "Game start", setReset: "Set reset", courtSwap: "Switching sides", player1SetWin: "BlueTeam wins the set", player2SetWin: "RedTeam wins the set", undo: "Undo", serveChange: "Serve change", courtChange: "Court change" } };
function populateVoiceList() { const vSelect = document.getElementById('voiceSelect'); if (!vSelect || !window.speechSynthesis) return; voicesList = speechSynthesis.getVoices(); vSelect.innerHTML = ''; const langFilter = document.getElementById('voiceLangSelect').value; voicesList.filter(v => v.lang === langFilter).forEach(v => { const opt = document.createElement('option'); opt.textContent = v.name; opt.value = v.name; vSelect.appendChild(opt); }); vSelect.value = gameState.voiceName; }
function speakPreview() { speakScore(gameState.selectedLang === 'ko-KR' ? "스포츠 점수판" : "Sport score", true); }
function speakScore(text, isPreview = false) {
    if (window.AndroidInterface?.speak && !isPreview) {
        window.AndroidInterface.speak(text);
        return;
    }
    if ('speechSynthesis' in window) {
        speechSynthesis.cancel();
        const utt = new SpeechSynthesisUtterance(text);
        utt.lang = gameState.selectedLang;
        utt.rate = gameState.rate;
        utt.pitch = gameState.pitch;
        if (gameState.voiceName) {
            const voice = voicesList.find(v => v.name === gameState.voiceName);
            if (voice) utt.voice = voice;
        }
        speechSynthesis.speak(utt);
    }
}
function loadVoices() { if ('speechSynthesis' in window) { speechSynthesis.onvoiceschanged = populateVoiceList; populateVoiceList(); } }
function speakNarration(key) {
    const text = narrations[gameState.selectedLang]?.[key];
    if (text) speakScore(text);
}
function speakCurrentScore() {
    let p1 = gameState.player1Score, p2 = gameState.player2Score;
    if (gameState.selectedLang === 'ko-KR') {
        let voiceval = koreascoreVoice[p1] + ' 대 ' + koreascoreVoice[p2];
        if (p1 === p2) {
            voiceval = voiceval + ' 동점 ';
        }
        if (gameState.selectedGame == 'pickleball' && gameState.matchType != 'single') {
            const Serverspeak = ServerCount == 1 ? ' 일' : ' 이';
            voiceval = voiceval + Serverspeak + '번 서브';
        }
        speakScore(voiceval);
    }
    else {
        if (gameState.selectedGame == 'pingpong' || gameState.selectedGame == 'badminton') {
            if (p1 == p2) {
                if (p1 == 0) speakScore('love all');
                speakScore(`${p1} all`);
            }
            else if (p1 == 0) {
                speakScore(`love ${p2}`);
            }
            else if (p2 == 0) {
                speakScore(`${p2} love`);
            }
        }
        else
            speakScore(`${gameState.player1Score} , ${gameState.player2Score}`);
    }
}
function toggleCamera() { const camView = document.getElementById('cameraView'); if (camView.style.display === 'block') stopCamera(); else startCamera(); }

// --- QR Code Functions ---
function closeQrCodeModal() {
    document.getElementById('qrCodeModal').classList.remove('active');
}

function importHistory() {
    stopCamera(); // QR 스캐너 시작 전 기존 카메라 중지하여 권한 확보

    document.getElementById('qrScannerModal').classList.add('active');
    startQrScanner();
}

function closeQrScannerModal() {
    stopQrScanner();
    document.getElementById('qrScannerModal').classList.remove('active');
}

function startQrScanner() {
    html5QrCode = new Html5Qrcode("qr-reader");
    const config = { fps: 10, qrbox: { width: 250, height: 250 } };

    const onScanSuccess = (decodedText, decodedResult) => {
        onQrCodeScanned(decodedText);
    };

    const onScanFailure = (error) => {
        // console.warn(`Code scan error = ${error}`);
    };

    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess, onScanFailure)
        .catch(err => {
            alert("카메라를 시작할 수 없습니다. 권한을 확인해주세요.");
            console.error("Unable to start scanning.", err);
        });
}

function stopQrScanner() {
    if (html5QrCode) {
        html5QrCode.stop().then(ignore => {
            // QR Code scanning is stopped.
        }).catch(err => {
            // Stop failed, handle it.
            console.error("Failed to stop QR scanner.", err);
        });
        html5QrCode = null;
    }
}

async function startCamera(isForRecording = false) {
    // 이미 스트림이 있으면 아무것도 안 함 (효율성)
    if (currentStream) {
        if (isForRecording) startRecording(); // 스트림이 이미 있으니 바로 녹화 시작
        return;
    }
    if (!navigator.mediaDevices) {
        alert("카메라를 사용할 수 없는 환경입니다.This is an environment where the camera cannot be used.");
        return;
    }
    //        if (currentStream) stopCamera();

    try {
        console.log("Requesting camera with facing mode:", facingMode, "isForRecording:", isForRecording, "recordWithAudio:", gameState.recordWithAudio);
        // 녹화용이면 사용자가 선택한 경우에만 오디오를 요청
        const wantAudio = Boolean(isForRecording && gameState.recordWithAudio);
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: wantAudio });
        currentStream = stream;
    } catch (err) {
        console.error("Could not get audio/video stream:", err);
        try {
            console.log("Falling back to video-only stream.");
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facingMode } }, audio: false });
            currentStream = stream;
        } catch (videoErr) {
            console.error("Failed to get video stream as well:", videoErr);
            alert("카메라 스트림을 가져오는 데 실패했습니다.Failed to fetch camera stream.");
            return;
        }
    }

    // 스트림을 성공적으로 가져온 후, isForRecording 값에 따라 분기
    if (isForRecording) {
        startRecording(); // 녹화 시작 (only if stream available)
    } else {
        // 카메라 프리뷰 표시
        const camView = document.getElementById('cameraView');
        if (camView) {
            camView.srcObject = currentStream;
            camView.style.display = 'block';
            document.getElementById('cameraControls').style.display = 'flex';
        }
    }
}

function stopCamera() { if (currentStream) { currentStream.getTracks().forEach(track => track.stop()); currentStream = null; } const camView = document.getElementById('cameraView'); if (camView) { camView.srcObject = null; camView.style.display = 'none'; document.getElementById('cameraControls').style.display = 'none'; } }
function switchCamera() { facingMode = (facingMode === 'user') ? 'environment' : 'user'; startCamera(gameState.isRecording); }
function startRecording() {
    if (!currentStream) {
        console.error("Stream is not available for recording. Attempting to start camera first.");
        // 스트림이 없으면 카메라를 켜고, 켜진 후에 녹화를 시작하도록 요청
        startCamera(true);
        return;
    }

    // --- 여기를 수정하거나 추가하세요 ---
    const quality = document.getElementById('recordQuality').value;
    const bitsPerSecond = {
        low: 500000,    // 500 kbps
        medium: 1000000, // 1 Mbps
        high: 2500000   // 2.5 Mbps
    }[quality];

    // 선택 가능한 mimeType을 우선 탐색
    const supportedMime = getSupportedMimeType();
    console.log('Selected mimeType for MediaRecorder:', supportedMime);
    const options = {
        ...(supportedMime ? { mimeType: supportedMime } : {}),
        videoBitsPerSecond: bitsPerSecond
    };
    // --- 여기까지 ---
    recordedChunks = [];

    try {
        if (!window.MediaRecorder) {
            alert('현재 브라우저는 MediaRecorder를 지원하지 않습니다. iOS의 경우 iOS15+ Safari를 사용하세요.');
            console.error('MediaRecorder not supported in this browser.');
            return;
        }
        mediaRecorder = new MediaRecorder(currentStream, options); // 수정된 options 객체 사용

        mediaRecorder.ondataavailable = event => {
            if (event.data.size > 0) {
                recordedChunks.push(event.data);
            }
        };

        mediaRecorder.onstop = () => {
            // If suppression flag is set, skip showing UI (used when we stop recorder during cleanup/save)
            if (gameState._suppressOnStopUI) {
                console.log('mediaRecorder.onstop suppressed');
                gameState._suppressOnStopUI = false;
                recordedChunks = [];
                return;
            }
            //    console.log("Recording stopped. Showing review modal.");
            if (recordedChunks.length === 0) {
                console.warn("No data recorded.");
                return; // 녹화된 데이터가 없으면 미리보기 모달을 띄우지 않음
            }
            const blobType = recordedChunks[0]?.type || 'video/webm';
            const blob = new Blob(recordedChunks, { type: blobType });
            const videoUrl = URL.createObjectURL(blob);
            // persist the last recorded blob/url so it survives modal close
            gameState.lastRecordedBlob = blob;
            gameState.lastRecordedUrl = videoUrl;
            gameState.hasRecordedBlob = true;
            // review modal (existing UI)
            const reviewEl = document.getElementById('reviewVideo');
            if (reviewEl) reviewEl.src = videoUrl;
            const reviewModal = document.getElementById('videoReviewModal');
            if (reviewModal) reviewModal.classList.add('active');
            // test panel download link
            const dl = document.getElementById('downloadLinkTest');
            if (dl) {
                dl.href = videoUrl;
                const ext = blobType.includes('mp4') ? 'mp4' : 'webm';
                dl.download = `test_record_${Date.now()}.${ext}`;
                dl.style.display = 'block';
                dl.textContent = `녹화 파일 다운로드 (${dl.download})`;
                console.log("onstop set for download ");
            }
            console.log('onstop textContent: recordedChunks len.', recordedChunks.length);
            const chkPlayback = document.getElementById('chkPlayback');
            if (chkPlayback) chkPlayback.checked = true;
        };

        // start with small timeslice to encourage dataavailable events on some browsers
        try { mediaRecorder.start(1000); } catch (e) { mediaRecorder.start(); }
        console.log("Recording started with quality:", quality, `(${bitsPerSecond} bps)`);

    } catch (e) {
        console.error("Error creating MediaRecorder:", e);
        alert(`녹화를 시작할 수 없습니다: ${e.message}`);
    }
}

// --- MediaRecorder / platform helpers ---
function getSupportedMimeType() {
    if (!window.MediaRecorder || !MediaRecorder.isTypeSupported) return '';
    // Try several candidates, including MP4 with common codecs (iOS Safari prefers MP4/AVC+AAC)
    const candidates = [
        'video/mp4;codecs="avc1.42E01E, mp4a.40.2"',
        'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
        'video/mp4',
        'video/webm;codecs=vp9',
        'video/webm;codecs=vp8',
        'video/webm'
    ];
    for (const m of candidates) {
        try {
            if (MediaRecorder.isTypeSupported(m)) return m;
        } catch (e) {
            // ignore
        }
    }
    return '';
}

function detectIOSVersion() {
    const ua = navigator.userAgent || navigator.vendor || window.opera;
    const match = ua.match(/OS (\d+)_?(\d+)?/i);
    if (!/iP(hone|od|ad)/.test(ua)) return null;
    if (match && match.length > 1) return parseInt(match[1], 10);
    return null;
}

function logTest(msg) {
    const ta = document.getElementById('recordTestLog');
    if (!ta) return;
    ta.value += `[${new Date().toLocaleTimeString()}] ${msg}\n`;
    ta.scrollTop = ta.scrollHeight;
}

async function runAuto5sRecord() {
    try {
        logTest('자동 5초 녹화 시작: 카메라 요청');
        await startCamera(true);
        document.getElementById('btnStartRecTest').disabled = true;
        document.getElementById('btnStopRecTest').disabled = false;
        logTest('녹화 시작');
        startRecording();
        await new Promise(res => setTimeout(res, 5000));
        logTest('5초 경과, 녹화 중지');
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
    } catch (e) {
        logTest('자동 녹화 실패: ' + e.message);
        console.error(e);
    }
}

function pauseRecordingAndShowReview() {
    // mark that recording was active so we can resume later without re-requesting permissions
    if (mediaRecorder?.state === "recording") {
        gameState._resumeAfterReview = true;
        mediaRecorder.stop();
    } else {
        gameState._resumeAfterReview = false;
    }
}

function closeReviewAndResumeRecording() {
    const modal = document.getElementById('videoReviewModal');
    if (modal) modal.classList.remove('active');
    const reviewVideo = document.getElementById('reviewVideo');
    try {
        if (reviewVideo && reviewVideo.src) {
            // Only revoke non-data URLs and only if it's not the persisted lastRecordedUrl
            if (typeof reviewVideo.src === 'string' && reviewVideo.src.startsWith('blob:')) {
                try { URL.revokeObjectURL(reviewVideo.src); } catch (e) { }
            }
            reviewVideo.src = '';
        }
    } catch (e) { console.error('closeReviewAndResumeRecording cleanup failed', e); }

    // Resume recording only if we paused it for review (avoid re-requesting camera permissions)
    if (gameState._resumeAfterReview) {
        gameState._resumeAfterReview = false;
        // If we already have a stream, start recorder; otherwise do not force camera start
        if (currentStream) {
            startRecording();
        } else {
            console.log('Not resuming recording because no active stream is available.');
        }
    }
}

window.onVideoSaved = (gameId, videoUri) => {
    const recordIndex = gameHistory.findIndex(r => r.id.toString() === gameId);
    if (recordIndex > -1) {
        // songgs video save handled natively on Android side; no need to update gameHistory here
        // gameHistory[recordIndex].videoUrl = videoUri;
        // saveHistory();
        console.log(`onVideoSaved saved for game ${gameId}`);
    }
};
// Cleanup helper to stop media recorder safely and clear transient recording state
function cleanupAfterSave() {
    try {
        if (mediaRecorder) {
            // suppress UI during stop
            gameState._suppressOnStopUI = true;
            try { mediaRecorder.ondataavailable = null; } catch (e) { }
            try { if (mediaRecorder.state !== 'inactive') mediaRecorder.stop(); } catch (e) { }
            mediaRecorder = null;
        }
    } catch (e) { console.error('cleanupAfterSave mediaRecorder stop failed', e); }
    try { recordedChunks = []; } catch (e) { }
    try { gameState.lastRecordedBlob = null; gameState.lastRecordedUrl = null; gameState.hasRecordedBlob = false; } catch (e) { }
}
// '저장' 버튼 클릭 시 최종적으로 호출될 함수
function saveReviewedVideo() {
    // 1. 녹화된 데이터가 있는지 확인
    let blob = null;
    if (recordedChunks && recordedChunks.length > 0) {
        blob = new Blob(recordedChunks, { type: recordedChunks[0]?.type || 'video/webm' });
    } else if (gameState.lastRecordedBlob) {
        blob = gameState.lastRecordedBlob;
    } else {
        alert("저장할 녹화 데이터가 없습니다. There is no recording data to save.");
        // close whichever video modal (end-game or in-game) is active
        closeActiveVideoModal();
        return;
    }

    // 3. Blob을 Base64로 변환
    const reader = new FileReader();
    reader.readAsDataURL(blob);
    reader.onloadend = () => {
        // 4. 맨 앞의 "data:video/webm;base64," 부분을 제거하고 순수 데이터만 추출
        const base64data = reader.result.split(',')[1];

        // 5. 안드로이드 인터페이스 호출 (단 한번만!)
        if (window.AndroidInterface?.saveVideo) {
            window.AndroidInterface.saveVideo(base64data, gameState.currentGameId.toString());
            // native save handled by Android; cleanup and close modal
            cleanupAfterSave();
            closeActiveVideoModal();
            return;
        } else {
            // console.error("Android interface not found for saving video. Creating explicit download link and persisting data URL to history.");
            // Use data URL (reader.result) so it can be stored in localStorage and played back later
            const dataUrl = reader.result; // full data URI like data:video/webm;base64,....

            // 1) gameHistory에 data URL 저장 (단, 크기가 너무 크면 저장하지 않음)
            try {
                const idx = gameHistory.findIndex(r => r.id && r.id.toString() === (gameState.currentGameId || '').toString());
                if (idx > -1) {
                    // estimate bytes from base64 length
                    const base64Part = (typeof dataUrl === 'string' && dataUrl.indexOf(',') > -1) ? dataUrl.split(',')[1] : '';
                    const estimatedBytes = Math.ceil((base64Part.length * 3) / 4);
                    const quotaSafeLimit = 2_500_000; // ~2.5 MB - conservative for localStorage
                    if (estimatedBytes > quotaSafeLimit) {
                        // Try to persist large blob in IndexedDB instead of localStorage
                        try {
                            (async () => {
                                const saved = await saveBlobToIDB(gameState.currentGameId, blob);
                                if (saved) {
                                    // songgs video save handled natively on Android side; no need to update gameHistory here
                                    // gameHistory[idx].videoUrl = `indexed:${gameState.currentGameId}`;
                                    // saveHistory();
                                    logTest && typeof logTest === 'function' && logTest('비디오 데이터가 IndexedDB에 저장되었습니다: ' + gameState.currentGameId);
                                    console.log('Video saved to IndexedDB for game ID', gameState.currentGameId);
                                } else {
                                    gameHistory[idx].videoUrl = null;
                                    saveHistory();
                                    logTest && typeof logTest === 'function' && logTest('비디오 데이터가 로컬에 저장되지 않았습니다. 다운로드 파일을 확인하세요.');
                                    alert('비디오 파일이 너무 커서 로컬 저장이 불가능합니다. 다운로드 파일을 확인하세요.');
                                }
                            })();
                        } catch (eSave) {
                            console.error('IndexedDB save failed', eSave);
                            gameHistory[idx].videoUrl = null;
                            saveHistory();
                            alert('비디오 파일 저장 실패. 다운로드 파일을 확인하세요.');
                        }
                    } else {
                        // songgs video save handled natively on Android side; no need to update gameHistory here
                        // gameHistory[idx].videoUrl = dataUrl;
                        // saveHistory();
                        logTest && typeof logTest === 'function' && logTest('게임 기록에 비디오 데이터 저장됨: ' + gameState.currentGameId);
                        console.log(`Video data URL saved in gameHistory for game ID ${gameState.currentGameId}`);
                    }
                }
            } catch (e) {
                console.error('gameHistory 저장 실패:', e);
            }

            // 2) 명시적 다운로드 버튼 생성 (사용자가 클릭해야 함)
            try {
                const controls = document.querySelector('#endGameVideoModal .video-controls') || document.querySelector('#videoReviewModal .video-controls');
                if (controls) {
                    let dl = document.getElementById('explicitDownloadLink');
                    if (!dl) {
                        dl = document.createElement('a');
                        dl.id = 'explicitDownloadLink';
                        dl.className = 'modal-action';
                        dl.style.marginLeft = '8px';
                        dl.style.display = 'inline-block';
                        controls.appendChild(dl);
                    }
                    const ext = blob.type && blob.type.includes('mp4') ? 'mp4' : 'webm';
                    dl.href = dataUrl;
                    dl.download = `record_${gameState.currentGameId || Date.now()}.${ext}`;
                    dl.textContent = '다운로드(Download)';
                    dl.target = '_blank';
                    logTest && typeof logTest === 'function' && logTest('다운로드 버튼이 준비되었습니다. 곧 자동으로 다운로드가 시작됩니다.');
                    console.log('onloadend Explicit download link created');
                    // 자동으로 다운로드 트리거하고 모달 닫기 (사용자 클릭 흐름 내에서 안전)
                    try {
                        dl.click();
                        // cleanup link after use
                        setTimeout(() => {
                            if (dl && dl.parentNode) dl.parentNode.removeChild(dl);
                        }, 1000);
                        // cleanup recorder state and close modal
                        cleanupAfterSave();
                        closeActiveVideoModal();
                    } catch (e) {
                        console.error('자동 다운로드 실패:', e);
                    }
                } else {
                    // fallback: expose link in test panel if modal controls missing
                    const dlTest = document.getElementById('downloadLinkTest');
                    if (dlTest) {
                        dlTest.href = dataUrl;
                        const ext = blob.type && blob.type.includes('mp4') ? 'mp4' : 'webm';
                        dlTest.download = `record_${gameState.currentGameId || Date.now()}.${ext}`;
                        dlTest.style.display = 'block';
                        dlTest.textContent = `다운로드 파일: ${dlTest.download}`;
                        logTest && typeof logTest === 'function' && logTest('테스트 패널에 다운로드 링크가 생성되었습니다. 곧 자동 다운로드가 시도됩니다.');
                        console.log('onloadend Download link created ');
                        try {
                            dlTest.click();
                            // keep fileUrl for history playback; do not revoke
                            cleanupAfterSave();
                            closeActiveVideoModal();
                        } catch (e) {
                            console.error('테스트 패널 자동 다운로드 실패:', e);
                        }
                    }
                }
            } catch (e) {
                console.error('다운로드 링크 생성 실패:', e);
                logTest && typeof logTest === 'function' && logTest('다운로드 링크 생성 실패: ' + e.message);
            }
            // NOTE: do NOT auto-close the modal so user can click download explicitly
            return;
        }

        // 6. 저장 요청 후, 모달을 닫고 데이터를 초기화
        cleanupAfterSave();
        closeActiveVideoModal();
    };

    reader.onerror = () => {
        alert("파일을 읽는 데 실패했습니다. Failed to read file.");
        closeReviewModal();
    };
}

function closeReviewModal() {
    const modal = document.getElementById('videoReviewModal');
    if (!modal) return;

    modal.classList.remove('active');

    const reviewVideo = document.getElementById('reviewVideo');
    if (reviewVideo && reviewVideo.src) {
        // Do not revoke the object URL if it's persisted in gameState (keep it available for history playback).
        try {
            if (gameState.lastRecordedUrl && reviewVideo.src === gameState.lastRecordedUrl) {
                // keep the URL for history playback
                reviewVideo.src = '';
            } else {
                try { URL.revokeObjectURL(reviewVideo.src); } catch (e) { }
                reviewVideo.src = '';
            }
        } catch (e) { reviewVideo.src = ''; }
    }

    // 전역 변수 초기화
    recordedChunks = [];
}

function closeEndGameModal() {
    const modal = document.getElementById('endGameVideoModal');
    if (!modal) return;
    modal.classList.remove('active');
    const v = document.getElementById('endGameReviewVideo');
    if (v && v.src) {
        try { URL.revokeObjectURL(v.src); } catch (e) { }
        v.src = '';
    }
}

function closeActiveVideoModal() {
    const end = document.getElementById('endGameVideoModal');
    if (end && end.classList.contains('active')) { closeEndGameModal(); return; }
    closeReviewModal();
}

function playHistoryVideo(videoUrl) {
    // If Android app provides a playback hook, use it
    if (window.AndroidInterface?.playVideo) {
        window.AndroidInterface.playVideo(videoUrl);
        return;
    }

    // Otherwise use in-page review modal to play the video
    try {
        // Use a separate modal for history playback so it doesn't affect in-game recording state
        const reviewModal = document.getElementById('historyVideoModal');
        const reviewVideo = document.getElementById('historyReviewVideo');
        if (!reviewModal || !reviewVideo) {
            window.open(videoUrl, '_blank');
            return;
        }

        // support data:, blob: or indexed: references
        if (typeof videoUrl === 'string' && videoUrl.startsWith('indexed:')) {
            const id = videoUrl.split(':')[1];
            getBlobFromIDB(id).then(blob => {
                if (!blob) {
                    alert('저장된 영상 데이터를 찾을 수 없습니다.');
                    return;
                }
                try {
                    const url = URL.createObjectURL(blob);
                    reviewVideo.src = url;
                    reviewModal.classList.add('active');
                    const playPromise = reviewVideo.play();
                    if (playPromise && typeof playPromise.then === 'function') playPromise.catch(err => console.warn('Auto-play prevented:', err));
                } catch (e) { console.error('Failed to play blob from IDB', e); window.open(videoUrl, '_blank'); }
            }).catch(e => { console.error('getBlobFromIDB failed', e); window.open(videoUrl, '_blank'); });
        } else {
            reviewVideo.src = videoUrl;
            reviewVideo.controls = true;
            reviewVideo.autoplay = true;
            reviewVideo.loop = false;
            reviewModal.classList.add('active');
            const playPromise = reviewVideo.play();
            if (playPromise && typeof playPromise.then === 'function') {
                playPromise.catch(err => console.warn('Auto-play prevented:', err));
            }
        }
        reviewVideo.controls = true;
        reviewVideo.autoplay = true;
        reviewVideo.loop = false;
        reviewModal.classList.add('active');
        const playPromise = reviewVideo.play();
        if (playPromise && typeof playPromise.then === 'function') {
            playPromise.catch(err => console.warn('Auto-play prevented:', err));
        }
    } catch (e) {
        console.error('playHistoryVideo failed:', e);
        window.open(videoUrl, '_blank');
    }
}

function closeHistoryVideo() {
    const modal = document.getElementById('historyVideoModal');
    if (!modal) return;
    modal.classList.remove('active');
    const v = document.getElementById('historyReviewVideo');
    if (v && v.src) {
        try { URL.revokeObjectURL(v.src); } catch (e) { }
        v.src = '';
    }
}

function toggleGameMenu() { const menu = document.getElementById('gameMenu'); menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; }
function showAbout() { document.getElementById('aboutModal')?.classList.add('active'); }
function closeAboutModal() { document.getElementById('aboutModal')?.classList.remove('active'); }
function showHistory() { renderHistoryList(); document.getElementById('historyModal')?.classList.add('active'); }
function closeHistoryModal() { document.getElementById('historyModal')?.classList.remove('active'); }
function voiceLanguage() { document.getElementById('voiceLanguage')?.classList.add('active'); }
function closevoiceLanguage() { document.getElementById('voiceLanguage')?.classList.remove('active'); }
/**
 * 선수 관리 모달을 열고 최신 선수 목록 및 전적을 화면에 표시합니다.
 */
function openSavedNamesManager() {
    // 1. 최신 데이터 렌더링 (전적, 수정/삭제 버튼 포함)
    // 앞서 정의한 renderPlayerList() 함수를 호출합니다.
    if (typeof renderPlayerList === 'function') {
        renderPlayerList();
    } else {
        console.error("renderPlayerList 함수가 정의되지 않았습니다.");
    }

    // 2. 모달 활성화
    const modal = document.getElementById('savedNamesModal');
    if (modal) {
        modal.classList.add('active');
    }

    // 3. (선택 사항) 입력창 초기화
    // 모달을 열 때마다 이전의 수정 모드나 입력값을 리셋하여 혼선을 방지합니다.
    const nameInput = document.getElementById('newSavedName');
    if (nameInput) {
        nameInput.value = "";
        editingPlayerName = null; // 수정 모드 플래그 초기화
    }
}
function closeSavedNamesManager() { document.getElementById('savedNamesModal').classList.remove('active'); }
//function renderSavedNamesList() { const listEl = document.getElementById('savedNamesList'); listEl.innerHTML = ''; savedNames.forEach(name => { const item = document.createElement('div'); item.className = 'saved-name-item'; item.textContent = name; const delBtn = document.createElement('button'); delBtn.className = 'delete-btn'; delBtn.textContent = '×'; delBtn.onclick = () => deleteSavedName(name); item.appendChild(delBtn); listEl.appendChild(item); }); }
/**
 * 선수 이름을 추가하거나 수정합니다.
 * 중복 검사를 수행하며, 성공 시 리스트를 갱신하고 저장합니다.
 */
function addNewSavedName() {
    const input = document.getElementById('newSavedName');
    const name = input.value.trim();

    if (!name) {
        alert("이름을 입력해주세요. (Please enter a name)");
        return;
    }

    // 1. 수정 모드인 경우 (editingPlayerName이 설정되어 있을 때)
    if (editingPlayerName) {
        // 수정 시에도 본인 이름 제외 중복 체크
        if (name !== editingPlayerName && players.some(p => p.name === name)) {
            alert("이미 등록된 선수 이름이 존재합니다. (Player already exists)");
            return;
        }

        const index = players.findIndex(p => p.name === editingPlayerName);
        if (index !== -1) {
            players[index].name = name;
            editingPlayerName = null; // 수정 모드 해제
        }
    }
    // 2. 신규 추가 모드인 경우
    else {
        if (players.some(p => p.name === name)) {
            alert("이미 등록된 선수 이름이 존재합니다. (Player already exists)");
            return;
        }

        // 새로운 선수 객체 생성 (기본 전적 0으로 초기화)
        players.push({
            name: name,
            wins: 0,
            losses: 0,
            history: []
        });
    }

    // 3. 입력창 초기화 및 데이터 저장/UI 갱신
    input.value = '';
    updateStorageAndRender();

    // 버튼 텍스트를 다시 '추가'로 복구 (수정 모드였을 경우 대비)
    const applyBtn = document.querySelector('.player-input-group .apply-btn');
    if (applyBtn) applyBtn.textContent = '추가(Add)';
}

/**
 * 선수 선택 피커를 열고, 등록된 선수 목록(전적 포함)을 표시합니다.
 * @param {string} targetInputId - 선택한 이름이 입력될 input 요소의 ID
 */
function openPlayerNamesPicker(targetInputId) {
    const listEl = document.getElementById('pickerNamesList');
    listEl.innerHTML = '';

    // 1. 최신 선수 데이터를 localStorage 또는 전역 변수에서 가져옵니다.
    // (이미 위에서 선언한 players 배열이 있다면 그것을 사용합니다.)
    if (!players || players.length === 0) {
        listEl.innerHTML = '<p style="padding:10px; color:#888;">등록된 선수가 없습니다.</p>';
    }

    players.forEach(player => {
        const item = document.createElement('button');
        // item.className = 'picker-name-item';
        item.className = 'player-card';

        // // 버튼 내부 디자인: 이름과 간단한 전적 표시
        // const winRate = (player.wins + player.losses) > 0
        //     ? ((player.wins / (player.wins + player.losses)) * 100).toFixed(0)
        //     : 0;

        // item.innerHTML = `
        //     <span class="name">${player.name}</span>
        //     <span class="record" style="font-size: 0.8rem; color: #666; margin-left: 8px;">
        //         (${player.wins}W-${player.losses}L, ${winRate}%)
        //     </span>
        // `;
        item.style = `
            width: 300px;
            background: #fff;
            margin-bottom: 8px;
            padding: 12px;
            border-radius: 8px;
            box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        `;

        // 버튼 내부 디자인: 이름과 간단한 전적 표시
        const winRate = (player.wins + player.losses) > 0
            ? ((player.wins / (player.wins + player.losses)) * 100).toFixed(1)
            : 0;
        let playertext = '';
        if (player.wins + player.losses === 0) {
            playertext = `${player.name} 경기 없음`;
        } else {
            playertext = `${player.name} 전적: ${player.wins}승 ${player.losses}패 (승률 ${winRate}%)`;
        }
        if (playertext.length > 40) {
            playertext = playertext.substring(0, 37) + '...';
        }
        else {
            playertext = playertext.padEnd(40, ' ');
        }
        item.innerHTML = `
            <div style="white-space: pre; display: flex; justify-content: space-between; align-items: center;">
                    <p style="margin: 4px 0 0; font-size: 0.85rem; color: #666;"> ${playertext} </p>
            </div>
        `;
        // 클릭 시 해당 이름을 input에 넣고 모달 닫기
        item.onclick = () => {
            document.getElementById(targetInputId).value = player.name;

            // 전역 경기 상태(currentMatch)에도 즉시 반영하면 관리가 편합니다.
            if (targetInputId === 'playerANameInput') currentMatch.playerA = player.name;
            if (targetInputId === 'playerBNameInput') currentMatch.playerB = player.name;

            closePlayerNamesPicker();
        };

        listEl.appendChild(item);
    });

    // 대상 input ID를 데이터셋에 저장하고 모달 활성화
    const modal = document.getElementById('playerNamesPickerModal');
    modal.dataset.targetInput = targetInputId;
    modal.classList.add('active');
}
function closePlayerNamesPicker() { document.getElementById('playerNamesPickerModal').classList.remove('active'); }
/**
 * 입력된 선수 이름을 게임 상태에 적용하고,
 * 새로운 이름인 경우 선수 명단(players)에 전적 0승 0패로 자동 등록합니다.
 */
function applyPlayerNames() {
    const p1Name = document.getElementById('playerReg1').value.trim();
    const p2Name = document.getElementById('playerReg2').value.trim();

    // 1. 현재 진행될 게임 상태(gameState)에 이름 반영
    gameState.pn1 = p1Name || 'BlueTeam';
    gameState.pn2 = p2Name || 'RedTeam';

    // 2. 선수 명단(players) 업데이트 로직
    [p1Name, p2Name].forEach(name => {
        if (name) {
            // 이미 등록된 선수인지 확인 (이름 기준)
            const isAlreadyRegistered = players.some(p => p.name === name);

            if (!isAlreadyRegistered) {
                // 신규 선수인 경우 객체 생성 및 추가
                players.push({
                    name: name,
                    wins: 0,
                    losses: 0,
                    history: []
                });
            }
        }
    });

    // 3. 로컬 스토리지 저장 및 리스트 UI 갱신 (기존에 만든 공통 함수 호출)
    updateStorageAndRender();
}

function clearHistory() { if (confirm('모든 기록을 삭제하시겠습니까?\nDo you want to delete all records?')) { gameHistory = []; saveHistory(); renderHistoryList(); } }

// --- 6. LIST & INIT ---
function renderHistoryList() {
    const listEl = document.getElementById('historyList');
    listEl.innerHTML = '';
    if (!gameHistory || gameHistory.length === 0) {
        listEl.innerHTML = '<p>저장된 경기 기록이 없습니다.<br>There are no saved match records</p>';
        return;
    }

    // 1. 날짜별로 경기 기록 그룹화
    const groupedByDate = gameHistory.reduce((acc, record) => {
        const date = new Date(record.date).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
        if (!acc[date]) {
            acc[date] = [];
        }
        acc[date].push(record);
        return acc;
    }, {});

    // 2. 그룹화된 데이터를 기반으로 HTML 생성
    for (const date in groupedByDate) {
        const dateGroupEl = document.createElement('div');
        dateGroupEl.className = 'history-date-group';

        const dateHeader = document.createElement('h3');
        dateHeader.className = 'history-date-header';
        dateHeader.textContent = date;
        dateGroupEl.appendChild(dateHeader);

        groupedByDate[date].forEach(record => {
            const item = document.createElement('div');
            item.className = 'history-item';
            const gameTitle = gameRules[record.game]?.title.replace(' 규칙', '') || record.game;
            // const gameTitle = gametitle[record.game];

            let setsHtml = '';
            // let setCount = record.player1Sets + record.player2Sets;
            if (record.setScores && Array.isArray(record.setScores)) {
                setsHtml = '<div class="set-scores-container">';
                record.setScores.forEach((set, i) => {
                    setsHtml += `<span> [ ${set.p1} - ${set.p2} ] </span>`;
                    //                if (setCount > i) {
                    //                    if (i + 1 === setCount)
                    ////                        setsHtml += `<span> ${i + 1}[ ${set.p1} - ${set.p2} ] </span>`;
                    //                        setsHtml += `<span> [ ${set.p1} - ${set.p2} ] </span>`;
                    //                    else
                    ////                        setsHtml += `<span> ${i + 1}[ ${set.p1} - ${set.p2} ] ,</span>`;
                    //                        setsHtml += `<span> [ ${set.p1} - ${set.p2} ] </span>`;
                    //                }
                });
                setsHtml += '</div>';
            }

            item.innerHTML = `
                <div class="history-item-header">
                    <strong>${gameTitle}</strong>
                    <div class="history-item-controls">
                        <button class="control-btn small share-btn" data-record-id="${record.id}" title="공유">🔗</button>
                    </div>
                </div>
                <div class="history-item-body">
                    <p class="players">
                        <span class="winner">${record.winner === record.pn1 ? '👑' : ''} ${record.pn1}</span> 
                        <span class="score">${record.ps1} - ${record.ps2}</span> 
                        <span class="loser">${record.winner === record.pn2 ? '👑' : ''} ${record.pn2}</span>
                    </p>
                     ${setsHtml}
                    ${record.memo ? `<p class="history-memo">메모: ${record.memo}</p>` : ''}
                </div>
                <div class="history-item-footer">
                    <span>${new Date(record.date).toLocaleTimeString('ko-KR')}</span>
                </div>
            `;

            //            const playBtn = item.querySelector('[data-videourl]');
            //            if (playBtn) {
            //                playBtn.addEventListener('click', (e) => {
            //                    e.stopPropagation();
            //                    playHistoryVideo(playBtn.dataset.videourl);
            //                });
            //            }

            const shareBtn = item.querySelector('.share-btn');
            if (shareBtn) {
                shareBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    shareHistoryEntry(shareBtn.dataset.recordId);
                });
            }

            dateGroupEl.appendChild(item);
        });

        listEl.appendChild(dateGroupEl);
    }
}

// --- 7. INITIALIZATION ---
function initializeApp() {
    loadHistory();
    loadPlayers(); // 선수 데이터 로드 함수 (별도 구현 필요 시)
    renderPlayerList();
    gameState.selectedLang = localStorage.getItem('selectedLang') || 'ko-KR';
    gameState.voiceName = localStorage.getItem('voiceName') || '';
    gameState.rate = parseFloat(localStorage.getItem('rate')) || 1;
    gameState.pitch = parseFloat(localStorage.getItem('pitch')) || 1;
    document.getElementById('voiceLangSelect').value = gameState.selectedLang;
    document.getElementById('rateRange').value = gameState.rate;
    document.getElementById('rateValue').textContent = gameState.rate;
    document.getElementById('pitchRange').value = gameState.pitch;
    document.getElementById('pitchValue').textContent = gameState.pitch;
    const lastGame = localStorage.getItem('lastSelectedGame') || 'badminton';
    showScreen('gameSelection');
    displayGameInfo(lastGame);
}

document.addEventListener('DOMContentLoaded', function () {
    initializeApp();
    loadVoices();

    const p1ScoreEl = document.getElementById('player1Score');
    const p2ScoreEl = document.getElementById('player2Score');
    const recordStopBtn = document.getElementById('recordStopButton');
    const slowPlayBtn = document.getElementById('slowPlayBtn');
    const normalPlayBtn = document.getElementById('normalPlayBtn');
    const closeReviewBtn = document.getElementById('closeReviewBtn');

    if (p1ScoreEl) p1ScoreEl.addEventListener('click', () => handleRallyWonBy(1));
    if (p2ScoreEl) p2ScoreEl.addEventListener('click', () => handleRallyWonBy(2));
    if (recordStopBtn) recordStopBtn.addEventListener('click', pauseRecordingAndShowReview);
    if (slowPlayBtn) slowPlayBtn.addEventListener('click', () => { const rv = document.getElementById('reviewVideo'); if (rv) rv.playbackRate = 0.5; });
    if (normalPlayBtn) normalPlayBtn.addEventListener('click', () => { const rv = document.getElementById('reviewVideo'); if (rv) rv.playbackRate = 1.0; });
    if (closeReviewBtn) closeReviewBtn.addEventListener('click', closeReviewAndResumeRecording);

    const saveVideoButton = document.querySelector('#videoReviewModal .modal-action[onclick="saveVideo()"]');
    if (saveVideoButton) {
        saveVideoButton.addEventListener('click', saveVideo);
    }

    const menu = document.getElementById('scoreboardMenu');
    const menuButton = document.getElementById('scoreboardMenuButton');
    if (menu) {
        menu.addEventListener('click', (event) => { const action = event.target.dataset.action; if (action && window[action]) { window[action](); if (menu) menu.style.display = 'none'; } });
    }
    if (menuButton) {
        menuButton.addEventListener('click', (event) => { event.stopPropagation(); if (menu) menu.style.display = menu.style.display === 'block' ? 'none' : 'block'; });
    }
    window.addEventListener('click', (event) => { if (menu && menuButton && !menu.contains(event.target) && !menuButton.contains(event.target)) { menu.style.display = 'none'; } });

    // --- Recording test panel handlers ---
    const btnStartCamTest = document.getElementById('btnStartCamTest');
    const btnStartRecTest = document.getElementById('btnStartRecTest');
    const btnStopRecTest = document.getElementById('btnStopRecTest');
    const btnSwitchCamTest = document.getElementById('btnSwitchCamTest');
    const btnAutoRecord5s = document.getElementById('btnAutoRecord5s');
    const downloadLinkTest = document.getElementById('downloadLinkTest');
    const chkPreview = document.getElementById('chkPreview');
    const chkRecording = document.getElementById('chkRecording');
    const chkPlayback = document.getElementById('chkPlayback');

    if (btnStartCamTest) btnStartCamTest.addEventListener('click', async () => {
        try {
            await startCamera(false);
            const camView = document.getElementById('cameraView');
            if (camView) { camView.style.display = 'block'; camView.srcObject = currentStream; }
            document.getElementById('cameraControls').style.display = 'flex';
            btnStartRecTest.disabled = false;
            chkPreview.checked = true;
            logTest('카메라 프리뷰 표시됨');
        } catch (e) {
            logTest('카메라 시작 실패: ' + e.message);
        }
    });

    if (btnStartRecTest) btnStartRecTest.addEventListener('click', () => {
        startRecording();
        btnStartRecTest.disabled = true;
        btnStopRecTest.disabled = false;
        chkRecording.checked = true;
        logTest('수동 녹화 시작');
    });

    if (btnStopRecTest) btnStopRecTest.addEventListener('click', () => {
        if (mediaRecorder && mediaRecorder.state === 'recording') mediaRecorder.stop();
        btnStartRecTest.disabled = false;
        btnStopRecTest.disabled = true;
        chkRecording.checked = true;
        logTest('녹화 중지 요청');
    });

    if (btnSwitchCamTest) btnSwitchCamTest.addEventListener('click', () => {
        switchCamera();
        const camView = document.getElementById('cameraView');
        if (camView) camView.srcObject = currentStream;
        logTest('카메라 전환 요청');
    });

    if (btnAutoRecord5s) btnAutoRecord5s.addEventListener('click', () => runAuto5sRecord());

    if (downloadLinkTest) {
        // When recording stops, create download link
        const originalOnStop = mediaRecorder?.onstop;
        // Safe handler: attach global onstop behavior in existing mediaRecorder.onstop places
    }

    const btnClearTestLog = document.getElementById('btnClearTestLog');
    if (btnClearTestLog) btnClearTestLog.addEventListener('click', () => { document.getElementById('recordTestLog').value = ''; });

    // iOS version hint
    const iosVer = detectIOSVersion();
    if (iosVer !== null) {
        if (iosVer < 15) logTest(`iOS ${iosVer} detected — MediaRecorder 미지원 가능 (iOS15+ 권장)`);
        else logTest(`iOS ${iosVer} detected — MediaRecorder 사용 가능 (iOS15+)`);
    }
    const winScoreRange = document.getElementById('winScoreRange');
    winScoreRange.addEventListener('input', () => { document.getElementById('winScoreValue').textContent = winScoreRange.value; });
    const totalSetsRange = document.getElementById('totalSetsRange');
    totalSetsRange.addEventListener('input', () => { document.getElementById('totalSetsValue').textContent = totalSetsRange.value; });
    const voiceLangSelect = document.getElementById('voiceLangSelect');
    voiceLangSelect.addEventListener('change', () => { gameState.selectedLang = voiceLangSelect.value; localStorage.setItem('selectedLang', gameState.selectedLang); populateVoiceList(); speakPreview(); });
    const voiceSelect = document.getElementById('voiceSelect');
    voiceSelect.addEventListener('change', () => { gameState.voiceName = voiceSelect.value; localStorage.setItem('voiceName', gameState.voiceName); speakPreview(); });
    const rateRange = document.getElementById('rateRange');
    rateRange.addEventListener('input', () => { const rate = parseFloat(rateRange.value); document.getElementById('rateValue').textContent = rate.toFixed(1); gameState.rate = rate; localStorage.setItem('rate', rate); speakPreview(); });
    const pitchRange = document.getElementById('pitchRange');
    pitchRange.addEventListener('input', () => { const pitch = parseFloat(pitchRange.value); document.getElementById('pitchValue').textContent = pitch.toFixed(1); gameState.pitch = pitch; localStorage.setItem('pitch', pitch); speakPreview(); });

    const enableRecordingSwitch = document.getElementById('enableRecording');
    const recordingOptionsDiv = document.getElementById('recordingOptions');
    enableRecordingSwitch.addEventListener('change', function () {
        recordingOptionsDiv.style.display = this.checked ? 'block' : 'none';
    });
    // --- Web Speech fallback for iOS / desktop when Android native is not available ---
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
    let webRec = null;
    let webRecActive = false;

    function createWebRecognition() {
        if (!SpeechRecognition) return null;
        try {
            const r = new SpeechRecognition();
            r.continuous = true;
            r.interimResults = true;
            r.lang = gameState.selectedLang || 'ko-KR';
            r.onresult = (evt) => {
                let interim = '';
                let final = '';
                for (let i = evt.resultIndex; i < evt.results.length; ++i) {
                    const res = evt.results[i];
                    if (res.isFinal) final += res[0].transcript;
                    else interim += res[0].transcript;
                }
                if (interim) window.onPartialVoiceResult && window.onPartialVoiceResult(interim);
                if (final) window.onVoiceResult && window.onVoiceResult(final);
            };
            r.onerror = (e) => { window.onVoiceError && window.onVoiceError(e); };
            r.onend = () => {
                webRecActive = false;
                // auto-restart for continuous mode when user didn't explicitly stop
                if (webRec && webRec.continuous && isVoiceListening) {
                    try { webRec.start(); webRecActive = true; } catch (e) { }
                }
            };
            return r;
        } catch (e) {
            console.error('createWebRecognition failed', e);
            return null;
        }
    }

    function startWebRecognition() {
        if (!SpeechRecognition) return false;
        if (!webRec) webRec = createWebRecognition();
        if (!webRec) return false;
        try { webRec.start(); webRecActive = true; return true; } catch (e) { console.error(e); return false; }
    }

    function stopWebRecognition() { if (webRec) { try { webRec.stop(); webRecActive = false; } catch (e) { } } }

    // 음성인식 테스트 버튼 이벤트
    const voiceTestBtn = document.getElementById('voiceTestBtn');
    voiceTestBtn.addEventListener('click', async () => {
        // Prefer Android native when available
        if (window.AndroidInterface?.startVoiceRecognition) {
            window.AndroidInterface.startVoiceRecognition();
            voiceTestBtn.classList.add('listening');
            voiceTestBtn.disabled = true; // 중복 클릭 방지
            document.getElementById('recognizedWord').textContent = "듣는 중(listening)...";
            return;
        }

        // Web Speech fallback
        if (SpeechRecognition) {
            document.getElementById('recognizedWord').textContent = "듣는 중(listening)...";
            voiceTestBtn.classList.add('listening');
            voiceTestBtn.disabled = true;
            const started = startWebRecognition();
            if (!started) {
                alert('브라우저 음성인식을 시작할 수 없습니다.');
                voiceTestBtn.classList.remove('listening');
                voiceTestBtn.disabled = false;
            } else {
                // stop after a short test (10s)
                setTimeout(() => { stopWebRecognition(); voiceTestBtn.classList.remove('listening'); voiceTestBtn.disabled = false; }, 10000);
            }
            return;
        }

        alert("음성인식은 해당 브라우저에서 지원되지 않습니다. (Android native 또는 Web Speech API 필요)");
    });

    // 스코어보드의 음성인식 제어 버튼 이벤트
    const voiceControlBtn = document.getElementById('voiceControlBtn');
    voiceControlBtn.addEventListener('click', () => {
        isVoiceListening = !isVoiceListening;
        if (isVoiceListening) {
            // Try Android native first
            if (window.AndroidInterface?.startVoiceRecognition) {
                window.AndroidInterface.startVoiceRecognition();
                voiceControlBtn.classList.add('active');
                voiceControlBtn.title = "음성인식 중지(Stop voice recognition)";
                return;
            }

            // Web Speech fallback
            if (SpeechRecognition) {
                const ok = startWebRecognition();
                if (ok) {
                    voiceControlBtn.classList.add('active');
                    voiceControlBtn.title = "음성인식 중지(Stop voice recognition)";
                    return;
                }
            }

            alert('음성인식을 시작할 수 없습니다. (Android native 또는 Web Speech API 필요)');
            isVoiceListening = false;
        } else {
            // Stop native or web
            if (window.AndroidInterface?.stopVoiceRecognition) {
                window.AndroidInterface.stopVoiceRecognition();
                voiceControlBtn.classList.remove('active');
                voiceControlBtn.title = "음성인식 시작(Start voice recognition)";
                return;
            }
            if (SpeechRecognition) {
                stopWebRecognition();
                voiceControlBtn.classList.remove('active');
                voiceControlBtn.title = "음성인식 시작(Start voice recognition)";
                return;
            }
        }
    });

});

function showPlayerStats(playerName) {
   // 1. 해당 플레이어의 전체 경기 추출 및 날짜순 정렬
    const allPlayerMatches = gameHistory.filter(r => r.pn1?.includes(playerName) || r.pn2?.includes(playerName))
        .sort((a, b) => new Date(a.date) - new Date(b.date));

       if (allPlayerMatches.length === 0) {
           document.getElementById('playerStatsSummary').textContent = '기록이 없습니다.';
           return;
       }

       // 2. 데이터가 있는 날짜 중 고유 날짜(Unique Dates) 최신 7개 추출
       const uniqueDates = [...new Set(allPlayerMatches.map(m => new Date(m.date).toISOString().slice(0, 10)))];
       const dateKeys = uniqueDates.slice(-7); // 가장 최근 7개 날짜만 선택
       const dateLabels = dateKeys;

       // 3. 종목 및 컬러 설정
       const sportKeys = Object.keys(sportPresets);
       const sportLabels = sportKeys.map(k => (gameRules[k] && gameRules[k].title) ? gameRules[k].title.replace(' 규칙', '') : k);
       const colorMap = {
           badminton: { win: '#4CAF50', loss: '#F44336' },
           pingpong: { win: '#00BCD4', loss: '#E91E63' },
           jokgu: { win: '#2196F3', loss: '#FF9800' },
           pickleball: { win: '#9C27B0', loss: '#FFC107' }
       };

       // 4. 데이터 집계 (선택된 7개 날짜 기준)
       const winsBySportDate = {};
       const lossesBySportDate = {};
       sportKeys.forEach(k => {
           winsBySportDate[k] = dateKeys.map(() => 0);
           lossesBySportDate[k] = dateKeys.map(() => 0);
       });

       let maxVal = 0;
       allPlayerMatches.forEach(m => {
           const key = new Date(m.date).toISOString().slice(0, 10);
           const di = dateKeys.indexOf(key);
           if (di === -1) return; // 최신 7개 날짜에 포함되지 않으면 패스

           const isP1 = m.pn1?.includes(playerName);
           const pSets = isP1 ? m.ps1 : m.ps2;
           const oSets = isP1 ? m.ps2 : m.ps1;

           if (pSets > oSets) winsBySportDate[m.game][di]++;
           else lossesBySportDate[m.game][di]++;
       });

       // 5. 데이터셋 빌드 및 Y축 Max 계산
       const datasets = [];
       sportKeys.forEach((k, idx) => {
           const wData = winsBySportDate[k];
           const lData = lossesBySportDate[k];

           // 날짜별 stack 합계 중 최대값 찾기 (Y축 스케일용)
           dateKeys.forEach((_, dIdx) => {
               let dailyTotal = 0;
               sportKeys.forEach(s => { dailyTotal += (winsBySportDate[s][dIdx] + lossesBySportDate[s][dIdx]); });
               if (dailyTotal > maxVal) maxVal = dailyTotal;
           });

           datasets.push({
               label: `${sportLabels[idx]} (승)`,
               data: wData,
               backgroundColor: colorMap[k]?.win,
               stack: 'Stack 0' // 모든 종목을 하나의 바에 쌓음
           });
           datasets.push({
               label: `${sportLabels[idx]} (패)`,
               data: lData,
               backgroundColor: colorMap[k]?.loss,
               stack: 'Stack 0'
           });
       });

       // Y축 설정: 최소 10, 그 이상이면 maxVal + 1 (정수 단위)
       const finalMax = Math.max(10, Math.ceil(maxVal + 1));

       // 6. 차트 생성
       const ctx = document.getElementById('playerScoreChart').getContext('2d');
       if (_playerScoreChart) _playerScoreChart.destroy();

       _playerScoreChart = new Chart(ctx, {
           type: 'bar',
           data: { labels: dateLabels, datasets },
           options: {
               responsive: true,
               scales: {
                   x: { stacked: true },
                   y: {
                       stacked: true,
                       beginAtZero: true,
                       min: 0,
                       max: finalMax,
                       ticks: {
                           stepSize: 1,    // 1씩 증가
                           precision: 0    // 소수점 제거
                       }
                   }
               },
               plugins: {
                   legend: { display: false }
               }
           }
       });

    // render color-key table into playerStatsSummary (append to existing summary text)
    const colorTableRows = sportKeys.map(k => {
        const lab = (gameRules[k] && gameRules[k].title) ? gameRules[k].title.replace(' 규칙', '') : k;
        const win = colorMap[k]?.win || '#4CAF50';
        const loss = colorMap[k]?.loss || '#9e9e9e';
        return `<tr><td style="padding:6px 8px">${lab}</td><td style="padding:6px 8px"><span style="display:inline-block;width:18px;height:14px;background:${win};border:1px solid #ccc;margin-right:8px;vertical-align:middle"></span>${win}</td><td style="padding:6px 8px"><span style="display:inline-block;width:18px;height:14px;background:${loss};border:1px solid #ccc;margin-right:8px;vertical-align:middle"></span>${loss}</td></tr>`;
    }).join('');
    const tableHtml = `\n<table style="border-collapse:collapse;margin-top:8px;width:100%;font-size:0.95rem">` +
        `<thead><tr><th style="text-align:left;padding:6px 8px">종목</th><th style="text-align:left;padding:6px 8px">승 색상</th><th style="text-align:left;padding:6px 8px">패 색상</th></tr></thead><tbody>${colorTableRows}</tbody></table>`;
    const summaryEl = document.getElementById('playerStatsSummary');
    if (summaryEl) {
        // keep existing text and append table
        const existing = summaryEl.textContent || '';
        summaryEl.innerHTML = `${existing}${tableHtml}`;
    }

    // create radar chart showing per-sport win rate (육각형 능력치 형태)
    const ctx2 = document.getElementById('playerWinChart').getContext('2d');
    if (_playerWinChart) _playerWinChart.destroy();

    // Gather per-sport stats (games played and win rate)
    // reuse `sportKeys` declared above for the first chart
    const labelsRadar = sportKeys.map(k => (gameRules[k] && gameRules[k].title) ? gameRules[k].title.replace(' 규칙', '') : k);
    const gamesCounts = sportKeys.map(k => {
        return gameHistory.filter(r =>  r.game === k && (r.pn1?.includes(playerName) || r.pn2?.includes(playerName))).length;
    });
    const winRates = sportKeys.map(k => {
        const matchesForSport = gameHistory.filter(r => r.game === k && (r.pn1?.includes(playerName) || r.pn2?.includes(playerName)));
        const total = matchesForSport.length;
        if (!total) return 0;
        let w = 0;
        matchesForSport.forEach(m => {
            const isP1 = m.pn1?.includes(playerName);
            // const isP1 = m.pn1 === playerName;
            const pSets = isP1 ? m.ps1 : m.ps2;
            const oSets = isP1 ? m.ps2 : m.ps1;
            if (pSets > oSets) w++;
        });
        return Math.round((w / total) * 10); // percent (0-100)
    });

    _playerWinChart = new Chart(ctx2, {
        type: 'radar',
        data: {
            labels: labelsRadar,
            datasets: [{
                label: '승률 (%)',
                data: winRates,
                backgroundColor: 'rgba(54,162,235,0.15)',
                borderColor: 'rgba(54,162,235,1)',
                pointBackgroundColor: 'rgba(54,162,235,1)'
            }]
        },
        options: {
            responsive: true,
            plugins: {
                legend: { position: 'top' },
                tooltip: {
                    callbacks: {
                        label: function (context) {
                            const idx = context.dataIndex;
                            const val = context.formattedValue;
                            const games = gamesCounts[idx] || 0;
                            return `${context.dataset.label}: ${val}% (경기수: ${games})`;
                        }
                    }
                }
            },
            scales: {
                r: {
                    beginAtZero: true,
                    suggestedMax: 100,
                    ticks: { stepSize: 20 }
                }
            }
        }
    });

    // show modal
    const modal = document.getElementById('playerStatsModal');
    if (modal) modal.classList.add('active');
}

function loadPlayers() {
    const data = localStorage.getItem('sport_players');
    if (data) {
        players = JSON.parse(data);
    }
}
