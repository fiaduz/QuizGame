import { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, RotateCcw, Play, Loader2, Send, Medal } from 'lucide-react'; 
import Player from '../../assets/player.png';
import GameOverSound from '../../assets/faaaa.mp3'; 
import JumpSound from '../../assets/jump.mp3'; 
import CorrectSound from '../../assets/correct1.mp3'; 

const GRAVITY = 0.3;
const JUMP_STRENGTH = 10;
const GAME_SPEED = 4;
const GAME_WIDTH = 800;
const GROUND_Y = 15;
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwNx4fc_dD5fqa5Nta5kkryvH8uQ6TGe1Fk76nsd_MyCMfP_GRsQYzNVq-4-TQxUQ_xYg/exec";

type QuestionType = { question: string; options: { text: string; isCorrect: boolean }[]; };
type LeaderboardEntry = { name: string; score: number; category: string; difficulty: string; uid?: string };

export default function QuizRunner() {
  const [playerName, setPlayerName] = useState('');
  const [deviceId, setDeviceId] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  // Game Settings State
  const [category, setCategory] = useState('Computer Science');
  const [difficulty, setDifficulty] = useState('Medium');
  const [numQuestions, setNumQuestions] = useState(5);
  const [isGenerating, setIsGenerating] = useState(false);
  
  const [feedbackText, setFeedbackText] = useState('');
  const [isSendingFeedback, setIsSendingFeedback] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);
  
  const [questions, setQuestions] = useState<QuestionType[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingDB, setIsLoadingDB] = useState(true);

  const playerNameRef = useRef('');

  const [gameState, setGameState] = useState('start'); 
  const [score, setScore] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [optIndex, setOptIndex] = useState(0);

  const playerY = useRef(GROUND_Y);
  const velocityY = useRef(0);
  const isJumping = useRef(false);
  const obstacleX = useRef(GAME_WIDTH);
  
  const requestRef = useRef<number | null>(null);
  const gameInfo = useRef({ qIndex: 0, optIndex: 0, isPlaying: false, score: 0 });

  const jumpAudioRef = useRef<HTMLAudioElement | null>(null);
  const correctAudioRef = useRef<HTMLAudioElement | null>(null);
  const gameOverAudioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    // Generate or fetch UID
    let storedId = localStorage.getItem('quiz_runner_uid');
    if (!storedId) {
      storedId = 'player_' + Math.random().toString(36).substring(2, 15);
      localStorage.setItem('quiz_runner_uid', storedId);
    }
    setDeviceId(storedId);

    // Audio Preload
    jumpAudioRef.current = new Audio(JumpSound);
    jumpAudioRef.current.volume = 0.5; 
    correctAudioRef.current = new Audio(CorrectSound);
    gameOverAudioRef.current = new Audio(GameOverSound);

    // Fetch Initial Leaderboard
    const fetchLeaderboard = async () => {
      try {
        const lRes = await fetch(`${GOOGLE_SCRIPT_URL}?action=getLeaderboard`);
        const lResult = await lRes.json();
        if (lResult.status === 'success') {
          setLeaderboard(lResult.data);
        }
      } catch (error) {
        console.error("Failed to fetch leaderboard", error);
      } finally {
        setIsLoadingDB(false);
      }
    };

    fetchLeaderboard();
  }, []);

  const playSound = (audioRef: React.MutableRefObject<HTMLAudioElement | null>) => {
    if (audioRef.current) {
      audioRef.current.currentTime = 0; 
      audioRef.current.play().catch(e => console.error("Audio error:", e));
    }
  };

  const jump = useCallback(() => {
    if (!isJumping.current && gameInfo.current.isPlaying) {
      isJumping.current = true;
      velocityY.current = JUMP_STRENGTH;
      playSound(jumpAudioRef);
    }
  }, []);

  const saveScoreToSheet = async (finalScore: number) => {
    const currentName = playerNameRef.current;
    if (!currentName.trim()) return; 
    
    setIsSaving(true);
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors", 
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "score",
          name: currentName, 
          score: finalScore,
          uid: deviceId,
          category: category,
          difficulty: difficulty
        }),
      });

      // Optimistically update local leaderboard
      setLeaderboard(prev => {
        let newBoard = [...prev];
        const normalizedName = currentName.toLowerCase().trim();
        const existingIndex = newBoard.findIndex(p => 
          (p.uid === deviceId) || (!p.uid && p.name.toLowerCase().trim() === normalizedName)
        );

        if (existingIndex >= 0) {
          if (finalScore > newBoard[existingIndex].score) {
            newBoard[existingIndex] = { ...newBoard[existingIndex], score: finalScore, category, difficulty };
          }
        } else {
          newBoard.push({ name: currentName, score: finalScore, category, difficulty, uid: deviceId });
        }
        return newBoard.sort((a, b) => b.score - a.score).slice(0, 10);
      });
    } catch (error) {
      console.error("Failed to save score:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const sendFeedbackToSheet = async () => {
    const currentName = playerNameRef.current;
    if (!feedbackText.trim()) return;

    setIsSendingFeedback(true);
    try {
      await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({ type: "feedback", name: currentName, feedback: feedbackText }),
      });
      setFeedbackSent(true);
      setFeedbackText('');
    } catch (error) {
      console.error("Failed to send feedback:", error);
    } finally {
      setIsSendingFeedback(false);
    }
  };

  const startGame = async () => {
    if (!playerName.trim()) {
      alert("Please enter your name to start!");
      return;
    }
    
    setIsGenerating(true);
    
    try {
      const res = await fetch(GOOGLE_SCRIPT_URL, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          type: "generate_quiz",
          category: category,
          difficulty: difficulty,
          numQuestions: numQuestions
        })
      });
      
      const result = await res.json();

      if (result.status === 'success') {
        const formattedQuestions: QuestionType[] = result.data.map((q: any) => ({
          question: q.question,
          options: [
            { text: q.opt1, isCorrect: q.correctOpt === 1 },
            { text: q.opt2, isCorrect: q.correctOpt === 2 },
            { text: q.opt3, isCorrect: q.correctOpt === 3 },
          ]
        }));
        setQuestions(formattedQuestions);
        
        setScore(0);
        setQIndex(0);
        setOptIndex(0);
        setFeedbackSent(false); 
        setFeedbackText('');
        gameInfo.current = { qIndex: 0, optIndex: 0, isPlaying: true, score: 0 }; 
        
        playerY.current = GROUND_Y;
        velocityY.current = 0;
        isJumping.current = false;
        obstacleX.current = GAME_WIDTH;
        
        setGameState('playing');
      } else {
        alert("AI failed to generate questions. Please try again.");
      }
    } catch (error) {
      console.error("Failed to generate quiz", error);
      alert("Failed to connect to the AI server.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleCorrectAnswer = () => {
    gameInfo.current.isPlaying = false;
    playSound(correctAudioRef); 
    
    gameInfo.current.score += 10;
    const newScore = gameInfo.current.score;
    setScore(newScore); 
    
    setTimeout(() => {
      const nextQ = gameInfo.current.qIndex + 1;
      if (nextQ >= questions.length) {
        setGameState('victory');
        saveScoreToSheet(newScore); 
      } else {
        setQIndex(nextQ);
        setOptIndex(0);
        gameInfo.current = { qIndex: nextQ, optIndex: 0, isPlaying: true, score: newScore };
        obstacleX.current = GAME_WIDTH; 
        requestRef.current = requestAnimationFrame(gameLoop); 
      }
    }, 1000); 
  };

  const handleGameOver = () => {
    gameInfo.current.isPlaying = false;
    setGameState('gameover');
    playSound(gameOverAudioRef); 
    saveScoreToSheet(gameInfo.current.score); 
  };

  const gameLoop = useCallback(() => {
    if (!gameInfo.current.isPlaying) return;

    if (isJumping.current) {
      playerY.current += velocityY.current;
      velocityY.current -= GRAVITY;
      if (playerY.current <= GROUND_Y) {
        playerY.current = GROUND_Y;
        isJumping.current = false;
        velocityY.current = 0;
      }
    }

    obstacleX.current -= GAME_SPEED;

    const buffer = 4;
    const pLeft = 50 + buffer; 
    const pRight = 150 - buffer; 
    const pBottom = playerY.current + buffer; 
    const oLeft = obstacleX.current + buffer; 
    const oRight = obstacleX.current + 20 - buffer; 
    const oTop = 50 - buffer;

    const isColliding = pRight > oLeft && pLeft < oRight && pBottom < oTop;

    if (isColliding) {
      const currentQ = questions[gameInfo.current.qIndex];
      const currentOpt = currentQ.options[gameInfo.current.optIndex];

      if (currentOpt.isCorrect) {
        handleCorrectAnswer();
        return; 
      } else {
        handleGameOver();
        return;
      }
    }

    if (obstacleX.current < -100) { 
      obstacleX.current = GAME_WIDTH;
      const currentQ = questions[gameInfo.current.qIndex];
      const nextOpt = (gameInfo.current.optIndex + 1) % currentQ.options.length;
      setOptIndex(nextOpt);
      gameInfo.current.optIndex = nextOpt;
    }

    const playerEl = document.getElementById('player-sprite');
    const obstacleEl = document.getElementById('obstacle-sprite');
    
    if (playerEl) playerEl.style.bottom = `${playerY.current}px`;
    if (obstacleEl) obstacleEl.style.transform = `translateX(${obstacleX.current}px)`;

    requestRef.current = requestAnimationFrame(gameLoop);
  }, [questions]);

  useEffect(() => {
    if (gameState === 'playing') { requestRef.current = requestAnimationFrame(gameLoop); }
    return () => { if (requestRef.current !== null) cancelAnimationFrame(requestRef.current); };
  }, [gameState, gameLoop]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (gameState === 'playing' && (e.code === 'Space' || e.code === 'ArrowUp')) {
        e.preventDefault();
        jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, jump]);

  if (isLoadingDB) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans text-white p-4">
        <Loader2 className="animate-spin text-pink-500 mb-4" size={48} />
        <h2 className="text-2xl font-bold animate-pulse">Loading Server Data...</h2>
      </div>
    );
  }

  const currentQuestion = questions[qIndex];
  const currentOption = currentQuestion?.options[optIndex];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-start font-sans text-white p-4 overflow-y-auto">
      
      <div className="w-full max-w-4xl flex justify-between items-center mb-6 mt-10 px-4">
        <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/20 relative">
          <Trophy className="text-yellow-400" size={20} />
          <span className="font-bold tracking-wide">SCORE: {score}</span>
          {isSaving && <span className="absolute -bottom-6 left-2 text-xs text-pink-400 animate-pulse">Saving Score...</span>}
        </div>
        <div className="text-slate-400 text-sm">Level {qIndex + 1} / {questions.length}</div>
      </div>

      <div 
        className="relative w-full max-w-4xl h-80 bg-slate-900 border-2 border-slate-700 rounded-2xl overflow-hidden shadow-2xl flex-shrink-0"
        onClick={jump} 
      >
        
        {/* NEW AI GENERATING LOADER OVERLAY */}
        {isGenerating && (
          <div className="absolute inset-0 bg-slate-950/95 backdrop-blur-md flex flex-col items-center justify-center z-50">
            <Loader2 size={56} className="animate-spin text-pink-500 mb-6" />
            <h2 className="text-2xl font-bold text-white mb-2 text-center">AI is writing the quiz...</h2>
            <p className="text-pink-300 font-medium text-center animate-pulse px-4">
              Your questions are getting ready please hold on
            </p>
          </div>
        )}
        
        {gameState === 'playing' && (
          <div className="absolute top-6 left-0 right-0 z-20 flex justify-center animate-slideDown">
            <div className="bg-slate-800/90 backdrop-blur border border-purple-500/30 px-8 py-3 rounded-xl shadow-lg">
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                {currentQuestion?.question}
              </h2>
              <p className="text-xs text-center text-slate-400 mt-1">Jump over wrong answers. Hit the correct one!</p>
            </div>
          </div>
        )}

        {gameState === 'playing' && (
          <>
            <div className="absolute bottom-0 w-full h-4 bg-slate-800 border-t border-slate-700"></div>
            <div className="absolute bottom-0 w-[200%] h-1 road-stripes animate-scrollRoad"></div>

            <div 
              id="player-sprite"
              className="absolute left-[50px] w-[100px] h-[100px] z-20"
              style={{ bottom: `${GROUND_Y}px` }}
            >
              <img src={Player} alt="Player" className={`w-full h-full object-contain ${!isJumping.current ? 'animate-runBounce' : ''}`} /> 
            </div>

            <div 
              id="obstacle-sprite"
              className="absolute bottom-0 z-10 w-[20px] h-[50px]"
              style={{ transform: `translateX(${GAME_WIDTH}px)` }}
            >
              <div className="absolute bottom-[60px] left-1/2 -translate-x-1/2 bg-white text-slate-900 font-bold px-4 py-2 rounded-lg shadow-lg border-2 border-slate-300 whitespace-nowrap z-20">
                {currentOption?.text}
                <div className="absolute -bottom-[8px] left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-l-transparent border-r-[8px] border-r-transparent border-t-[8px] border-t-white"></div>
              </div>

              <div className="w-full h-full bg-slate-700 rounded-md border-2 border-slate-500 flex items-center justify-center shadow-lg">
                <div className="w-full h-px bg-slate-500/50 absolute top-1/2 -translate-y-1/2"></div>
                <div className="h-full w-px bg-slate-500/50 absolute left-1/2 -translate-x-1/2"></div>
              </div>
            </div>
          </>
        )}

        {gameState === 'start' && !isGenerating && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-30">
            <h1 className="text-4xl font-extrabold mb-2 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Quiz Runner 🏃‍♂️</h1>
            <p className="text-slate-300 mb-6 max-w-md text-center text-sm">
              Jump over the wrong answers. Run into the correct one!
            </p>
            
            <div className="mb-4 w-full max-w-xs space-y-3">
              <input 
                type="text" 
                placeholder="Enter your name..." 
                value={playerName}
                onChange={(e) => { setPlayerName(e.target.value); playerNameRef.current = e.target.value; }}
                className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-pink-500 transition-colors"
              />
              
              <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-pink-500 appearance-none">
                <option value="Computer Science">Computer Science</option>
                <option value="Medical Science">Medical Science</option>
                <option value="World News">World News</option>
                <option value="Pop Culture">Pop Culture</option>
              </select>

              <div className="flex gap-2">
                <select value={difficulty} onChange={(e) => setDifficulty(e.target.value)} className="w-1/2 px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-pink-500 appearance-none">
                  <option value="Easy">Easy</option>
                  <option value="Medium">Medium</option>
                  <option value="Hard">Hard</option>
                </select>

                <select value={numQuestions} onChange={(e) => setNumQuestions(Number(e.target.value))} className="w-1/2 px-4 py-2.5 bg-slate-800/50 border border-slate-600 rounded-lg text-white focus:outline-none focus:border-pink-500 appearance-none">
                  <option value={5}>5 Questions</option>
                  <option value={10}>10 Questions</option>
                  <option value={15}>15 Questions</option>
                  <option value={20}>20 Questions</option>
                </select>
              </div>
            </div>

            <button 
              onClick={startGame} 
              disabled={!playerName.trim()}
              className={`flex items-center gap-2 px-8 py-3 mt-2 font-bold rounded-full transition-transform ${
                playerName.trim() 
                  ? 'bg-pink-600 hover:bg-pink-500 text-white hover:scale-105 active:scale-95' 
                  : 'bg-slate-700 text-slate-400 cursor-not-allowed'
              }`}
            >
              <Play size={20} /> Start Game
            </button>
          </div>
        )}

        {gameState === 'gameover' && (
          <div className="absolute inset-0 bg-red-950/95 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-fadeIn p-4 overflow-y-auto">
            <h2 className="text-4xl font-black text-red-500 mb-1">GAME OVER</h2>
            <p className="text-slate-300 mb-4 text-lg">You hit the wrong answer!</p>
            
            <div className="w-full max-w-sm bg-black/40 p-5 rounded-2xl border border-white/10 mb-6 shadow-xl">
              <h3 className="text-sm font-bold text-slate-200 mb-3 text-center">Spotted a bug or have an idea?</h3>
              {!feedbackSent ? (
                <div className="flex flex-col gap-3">
                  <textarea 
                    placeholder="Tell me what you think..." 
                    value={feedbackText}
                    onChange={(e) => setFeedbackText(e.target.value)}
                    className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-xl text-white text-sm placeholder-slate-400 focus:outline-none focus:border-pink-500 resize-none h-16 transition-colors"
                  />
                  <button 
                    onClick={sendFeedbackToSheet}
                    disabled={!feedbackText.trim() || isSendingFeedback}
                    className="flex items-center justify-center gap-2 w-full py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition-colors"
                  >
                    {isSendingFeedback ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    {isSendingFeedback ? "Sending..." : "Submit Feedback"}
                  </button>
                </div>
              ) : (
                <div className="text-center py-4 bg-green-500/10 rounded-xl border border-green-500/30">
                  <p className="text-green-400 font-bold">Feedback Sent! 💖</p>
                </div>
              )}
            </div>

            <button onClick={() => setGameState('start')} className="flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full transition-transform hover:scale-105">
              <RotateCcw size={20} /> New Game
            </button>
          </div>
        )}

        {gameState === 'victory' && (
          <div className="absolute inset-0 bg-green-950/90 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-fadeIn">
            <h2 className="text-4xl font-black text-green-400 mb-2">YOU WIN! 🎉</h2>
            <p className="text-slate-300 mb-6 text-lg">Final Score: {score}</p>
            <button onClick={() => setGameState('start')} className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full transition-transform hover:scale-105">
              <RotateCcw size={20} /> Play Again
            </button>
          </div>
        )}
      </div>

      <button 
        className="mt-6 mb-4 md:hidden px-16 py-4 bg-white/10 active:bg-white/20 border border-white/20 rounded-full text-xl font-bold tracking-widest shadow-lg"
        onClick={jump}
      >
        JUMP
      </button>

      {/* --- LEADERBOARD SECTION --- */}
      <div className="w-full max-w-4xl mt-8 mb-12">
        <div className="flex items-center gap-2 mb-4 px-2">
          <Medal className="text-yellow-400" size={28} />
          <h2 className="text-2xl font-bold text-white tracking-wide">Top 10 High Scores</h2>
        </div>

        <div className="bg-slate-900/80 backdrop-blur border border-slate-700 rounded-2xl overflow-hidden shadow-2xl">
          {leaderboard.length === 0 ? (
            <div className="p-8 text-center text-slate-400 italic">No scores yet. Be the first!</div>
          ) : (
            <ul className="divide-y divide-slate-800">
              {leaderboard.map((entry, idx) => (
                <li key={idx} className="flex items-center justify-between p-4 hover:bg-slate-800/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="font-black text-slate-500 w-6 text-center">{idx + 1}</div>
                    
                    <div className="w-12 h-12 bg-slate-800 rounded-full overflow-hidden border-2 border-slate-600 flex-shrink-0">
                      <img 
                        src={`https://api.dicebear.com/7.x/pixel-art/svg?seed=${entry.name}`} 
                        alt="avatar" 
                        className="w-full h-full object-cover"
                      />
                    </div>
                    
                    <div className="flex flex-col">
                      <span className="font-bold text-white text-lg leading-tight">{entry.name}</span>
                      
                      {/* CATEGORY AND DIFFICULTY BADGES */}
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-blue-500/20 text-blue-300 border border-blue-500/30 rounded-full">
                          {entry.category}
                        </span>
                        <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-orange-500/20 text-orange-300 border border-orange-500/30 rounded-full">
                          {entry.difficulty}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="font-black text-xl text-pink-400 bg-pink-500/10 px-4 py-1 rounded-full border border-pink-500/20">
                    {entry.score}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <style>
        {`
          .road-stripes { background-image: repeating-linear-gradient(90deg, transparent 0px, transparent 40px, rgba(255,255,255,0.2) 40px, rgba(255,255,255,0.2) 80px); }
          .animate-scrollRoad { animation: scrollRoad 0.8s linear infinite; }
          .animate-runBounce { animation: runBounce 0.3s alternate infinite; }
          .animate-slideDown { animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1); }
          @keyframes scrollRoad { from { transform: translateX(0); } to { transform: translateX(-80px); } }
          @keyframes runBounce { from { transform: translateY(0) scaleY(1); } to { transform: translateY(-4px) scaleY(0.95); } }
          @keyframes slideDown { from { opacity: 0; transform: translateY(-20px); } to { opacity: 1; transform: translateY(0); } }
        `}
      </style>
    </div>
  );
}