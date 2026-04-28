import { useState, useEffect, useRef, useCallback } from 'react';
import { Trophy, RotateCcw, Play } from 'lucide-react';
import Player from '../../assets/player.png';
import GameOverSound from '../../assets/faaaa.mp3'; 
import JumpSound from '../../assets/jump.mp3'; 
import CorrectSound from '../../assets/correct.mp3'; // <-- Imported correct answer sound
import { QUESTIONS } from '../constants/Questions';

// --- GAME CONSTANTS ---
const GRAVITY = 0.3;
const JUMP_STRENGTH = 10;
const GAME_SPEED = 4;
const GAME_WIDTH = 800;
const GROUND_Y = 15;
const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbzqqWnXbX_zZ1i34rhWhIo6xhZwTWnJ0i5lHorJm22ufh9cc-iZ2UNykCuKfxEuP4Wj4A/exec";

export default function QuizRunner() {
  const [playerName, setPlayerName] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  
  const playerNameRef = useRef('');

  // UI State
  const [gameState, setGameState] = useState('start'); // 'start', 'playing', 'gameover', 'victory'
  const [score, setScore] = useState(0);
  const [qIndex, setQIndex] = useState(0);
  const [optIndex, setOptIndex] = useState(0);

  // Physics Refs 
  const playerY = useRef(GROUND_Y);
  const velocityY = useRef(0);
  const isJumping = useRef(false);
  const obstacleX = useRef(GAME_WIDTH);
  
  const requestRef = useRef<number | null>(null);
  const gameInfo = useRef({ qIndex: 0, optIndex: 0, isPlaying: false, score: 0 });

  // --- ACTIONS ---
  const jump = useCallback(() => {
    if (!isJumping.current && gameInfo.current.isPlaying) {
      isJumping.current = true;
      velocityY.current = JUMP_STRENGTH;
      
      // --- PLAY JUMP SOUND ---
      const audio = new Audio(JumpSound);
      audio.volume = 0.5; 
      audio.play().catch(e => console.error("Browser blocked audio autoplay:", e));
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
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: currentName, 
          score: finalScore
        }),
      });
    } catch (error) {
      console.error("Failed to save score:", error);
    } finally {
      setIsSaving(false);
    }
  };

  const startGame = () => {
    if (!playerName.trim()) {
      alert("Please enter your name to start!");
      return;
    }
    
    setScore(0);
    setQIndex(0);
    setOptIndex(0);
    gameInfo.current = { qIndex: 0, optIndex: 0, isPlaying: true, score: 0 }; 
    
    playerY.current = GROUND_Y;
    velocityY.current = 0;
    isJumping.current = false;
    obstacleX.current = GAME_WIDTH;
    
    setGameState('playing');
  };

  const handleCorrectAnswer = () => {
    gameInfo.current.isPlaying = false;
    
    // --- PLAY CORRECT SOUND EFFECT ---
    const audio = new Audio(CorrectSound);
    audio.play().catch(e => console.error("Browser blocked audio autoplay:", e));
    
    gameInfo.current.score += 10;
    const newScore = gameInfo.current.score;
    setScore(newScore); 
    
    setTimeout(() => {
      const nextQ = gameInfo.current.qIndex + 1;
      if (nextQ >= QUESTIONS.length) {
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
    
    // --- PLAY GAME OVER SOUND ---
    const audio = new Audio(GameOverSound);
    audio.play().catch(e => console.error("Browser blocked audio autoplay:", e));
    
    saveScoreToSheet(gameInfo.current.score); 
  };

  // --- GAME ENGINE LOOP ---
  const gameLoop = useCallback(() => {
    if (!gameInfo.current.isPlaying) return;

    // 1. Apply Physics to Player
    if (isJumping.current) {
      playerY.current += velocityY.current;
      velocityY.current -= GRAVITY;

      if (playerY.current <= GROUND_Y) {
        playerY.current = GROUND_Y;
        isJumping.current = false;
        velocityY.current = 0;
      }
    }

    // 2. Move Obstacle
    obstacleX.current -= GAME_SPEED;

    // 3. Collision Detection
    const buffer = 4;

    const pLeft = 50 + buffer; 
    const pRight = 150 - buffer; 
    const pBottom = playerY.current + buffer; 

    const oLeft = obstacleX.current + buffer; 
    const oRight = obstacleX.current + 20 - buffer; 
    const oTop = 50 - buffer;

    const isColliding = pRight > oLeft && pLeft < oRight && pBottom < oTop;

    if (isColliding) {
      const currentQ = QUESTIONS[gameInfo.current.qIndex];
      const currentOpt = currentQ.options[gameInfo.current.optIndex];

      if (currentOpt.isCorrect) {
        handleCorrectAnswer();
        return; 
      } else {
        handleGameOver();
        return;
      }
    }

    // 4. Cycle to Next Option
    if (obstacleX.current < -100) { 
      obstacleX.current = GAME_WIDTH;
      const currentQ = QUESTIONS[gameInfo.current.qIndex];
      const nextOpt = (gameInfo.current.optIndex + 1) % currentQ.options.length;
      
      setOptIndex(nextOpt);
      gameInfo.current.optIndex = nextOpt;
    }

    // 5. Update DOM directly
    const playerEl = document.getElementById('player-sprite');
    const obstacleEl = document.getElementById('obstacle-sprite');
    
    if (playerEl) playerEl.style.bottom = `${playerY.current}px`;
    if (obstacleEl) obstacleEl.style.transform = `translateX(${obstacleX.current}px)`;

    requestRef.current = requestAnimationFrame(gameLoop);
  }, []);

  // --- LIFECYCLE ---
  useEffect(() => {
    if (gameState === 'playing') {
      requestRef.current = requestAnimationFrame(gameLoop);
    }
    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [gameState, gameLoop]);

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'ArrowUp') {
        e.preventDefault();
        if (gameState === 'playing') jump();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [gameState, jump]);

  const currentQuestion = QUESTIONS[qIndex];
  const currentOption = currentQuestion?.options[optIndex];

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center font-sans text-white p-4">
      
      <div className="w-full max-w-4xl flex justify-between items-center mb-6 px-4">
        <div className="flex items-center gap-2 bg-white/10 px-4 py-2 rounded-full border border-white/20 relative">
          <Trophy className="text-yellow-400" size={20} />
          <span className="font-bold tracking-wide">SCORE: {score}</span>
          {isSaving && <span className="absolute -bottom-6 left-2 text-xs text-pink-400 animate-pulse">Saving...</span>}
        </div>
        <div className="text-slate-400 text-sm">Level {qIndex + 1} / {QUESTIONS.length}</div>
      </div>

      <div 
        className="relative w-full max-w-4xl h-80 bg-slate-900 border-2 border-slate-700 rounded-2xl overflow-hidden shadow-2xl"
        onClick={jump} 
      >
        
        {gameState === 'playing' && (
          <div className="absolute top-6 left-0 right-0 z-20 flex justify-center animate-slideDown">
            <div className="bg-slate-800/90 backdrop-blur border border-purple-500/30 px-8 py-3 rounded-xl shadow-lg">
              <h2 className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-300 to-pink-300">
                {currentQuestion.question}
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
              className="absolute left-[50px] w-[100px] h-[100px] z-10"
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

        {gameState === 'start' && (
          <div className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center z-30">
            <h1 className="text-4xl font-extrabold mb-4 text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">Quiz Runner 🏃‍♂️</h1>
            <p className="text-slate-300 mb-6 max-w-md text-center">
              Jump over the wrong answers using <b>Spacebar</b> or <b>Tap</b>. <br/> Run directly into the correct answer to score!
            </p>
            
            <div className="mb-6 w-full max-w-xs">
              <input 
                type="text" 
                placeholder="Enter your name..." 
                value={playerName}
                onChange={(e) => {
                  setPlayerName(e.target.value);
                  playerNameRef.current = e.target.value; 
                }}
                className="w-full px-4 py-3 bg-slate-800/50 border border-slate-600 rounded-lg text-white placeholder-slate-400 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-colors"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') startGame();
                }}
              />
            </div>

            <button 
              onClick={startGame} 
              disabled={!playerName.trim()}
              className={`flex items-center gap-2 px-8 py-3 font-bold rounded-full transition-transform ${
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
          <div className="absolute inset-0 bg-red-950/90 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-fadeIn">
            <h2 className="text-4xl font-black text-red-500 mb-2">GAME OVER</h2>
            <p className="text-slate-300 mb-6 text-lg">You hit the wrong answer!</p>
            <button onClick={startGame} className="flex items-center gap-2 px-8 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded-full transition-transform hover:scale-105">
              <RotateCcw size={20} /> Try Again
            </button>
          </div>
        )}

        {gameState === 'victory' && (
          <div className="absolute inset-0 bg-green-950/90 backdrop-blur-sm flex flex-col items-center justify-center z-30 animate-fadeIn">
            <h2 className="text-4xl font-black text-green-400 mb-2">YOU WIN! 🎉</h2>
            <p className="text-slate-300 mb-6 text-lg">Final Score: {score}</p>
            <button onClick={startGame} className="flex items-center gap-2 px-8 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded-full transition-transform hover:scale-105">
              <RotateCcw size={20} /> Play Again
            </button>
          </div>
        )}
      </div>

      <button 
        className="mt-8 md:hidden px-16 py-4 bg-white/10 active:bg-white/20 border border-white/20 rounded-full text-xl font-bold tracking-widest shadow-lg"
        onClick={jump}
      >
        JUMP
      </button>

      <style>
        {`
          .road-stripes {
            background-image: repeating-linear-gradient(90deg, transparent 0px, transparent 40px, rgba(255,255,255,0.2) 40px, rgba(255,255,255,0.2) 80px);
          }
          .animate-scrollRoad {
            animation: scrollRoad 0.8s linear infinite;
          }
          .animate-runBounce {
            animation: runBounce 0.3s alternate infinite;
          }
          .animate-slideDown {
            animation: slideDown 0.4s cubic-bezier(0.16, 1, 0.3, 1);
          }
          @keyframes scrollRoad {
            from { transform: translateX(0); }
            to { transform: translateX(-80px); }
          }
          @keyframes runBounce {
            from { transform: translateY(0) scaleY(1); }
            to { transform: translateY(-4px) scaleY(0.95); }
          }
          @keyframes slideDown {
            from { opacity: 0; transform: translateY(-20px); }
            to { opacity: 1; transform: translateY(0); }
          }
        `}
      </style>
    </div>
  );
}