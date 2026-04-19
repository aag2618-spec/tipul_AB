"use client";

import { useEffect, useState } from "react";

const REGULAR_MESSAGES = [
  "כל הכבוד! 🎉",
  "אין עליך! 💪",
  "מצוין! ⭐",
  "נהדר! ✨",
  "יופי של עבודה! 🔥",
  "אתה אלוף! 🏆",
  "אתה תותח! 💣",
  "אתה מיוחד! 💎",
  "גאים בך! 🌟",
  "מהמם! 🌈",
  "ממשיכים ככה! 🚀",
  "ככה עושים! 💯",
  "קטן עליך! ⚡",
  "סיימת את זה! 🎊",
  "עוד אחת הצלחת! ✅",
  "שאפו! 🙌",
  "מגיע לך! 🏅",
  "בראבו! 🎩",
  "איזה כוח! 💥",
  "עבודה קדושה! 🙏",
];

const MORNING_MESSAGES = [
  "בוקר פרודוקטיבי! ☀️",
  "פתחת את היום נכון! 🌅",
  "התחלה מעולה! ⭐",
];

const AFTERNOON_MESSAGES = [
  "מריץ את היום! 🏃",
  "באמצע יום פרודוקטיבי! 💼",
  "עושה את זה! 🎯",
];

const EVENING_MESSAGES = [
  "סוגר יום נפלא! 🌙",
  "סיום מעולה! ✨",
  "יום שהתחשב! 🌟",
];

const NIGHT_MESSAGES = [
  "גם בשעות האלה? אלוף! 🦉",
  "מקדישים זמן! 💫",
];

const CONFETTI_COLORS = ["#FF6B6B", "#4ECDC4", "#FFE66D", "#95E1D3", "#C7B3E5", "#FFAF87", "#A8E6CF", "#FFD3B6"];

function pickRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getTimeBasedMessage(): string {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return pickRandom(MORNING_MESSAGES);
  if (hour >= 12 && hour < 18) return pickRandom(AFTERNOON_MESSAGES);
  if (hour >= 18 && hour < 23) return pickRandom(EVENING_MESSAGES);
  return pickRandom(NIGHT_MESSAGES);
}

function getTodayKey(): string {
  return new Date().toISOString().split("T")[0];
}

function bumpDailyCounter(): number {
  if (typeof window === "undefined") return 0;
  const key = `completion_counter_${getTodayKey()}`;
  const current = parseInt(localStorage.getItem(key) || "0", 10);
  const next = current + 1;
  localStorage.setItem(key, String(next));
  return next;
}

interface CelebrationData {
  id: number;
  message: string;
  intensity: "normal" | "big" | "huge";
}

export function useCompletionCelebration() {
  const [celebration, setCelebration] = useState<CelebrationData | null>(null);

  const trigger = () => {
    const count = bumpDailyCounter();
    let message: string;
    let intensity: "normal" | "big" | "huge" = "normal";

    if (count === 10) {
      message = "10 השלמות!! 🏆🎊 אתה מפלצת!";
      intensity = "huge";
    } else if (count === 5) {
      message = "וואו! 5 השלמות היום 🔥🎉 יום פרודוקטיבי!";
      intensity = "big";
    } else {
      // 30% chance of time-based, 70% random
      message = Math.random() < 0.3 ? getTimeBasedMessage() : pickRandom(REGULAR_MESSAGES);
    }

    setCelebration({ id: Date.now(), message, intensity });
  };

  return { celebration, trigger, dismiss: () => setCelebration(null) };
}

interface ConfettiPiece {
  id: number;
  left: number;
  color: string;
  delay: number;
  duration: number;
  rotation: number;
  size: number;
}

function generateConfetti(count: number): ConfettiPiece[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
    delay: Math.random() * 0.5,
    duration: 1.5 + Math.random() * 1.5,
    rotation: Math.random() * 360,
    size: 6 + Math.random() * 8,
  }));
}

interface CompletionCelebrationProps {
  celebration: CelebrationData | null;
  onDismiss: () => void;
}

export function CompletionCelebration({ celebration, onDismiss }: CompletionCelebrationProps) {
  const [confetti, setConfetti] = useState<ConfettiPiece[]>([]);

  useEffect(() => {
    if (!celebration) return;

    const confettiCount = celebration.intensity === "huge" ? 150 : celebration.intensity === "big" ? 90 : 50;
    setConfetti(generateConfetti(confettiCount));

    const timer = setTimeout(() => {
      onDismiss();
    }, 2500);

    return () => clearTimeout(timer);
  }, [celebration, onDismiss]);

  if (!celebration) return null;

  const bgGradient =
    celebration.intensity === "huge"
      ? "from-yellow-300 via-orange-300 to-pink-300"
      : celebration.intensity === "big"
      ? "from-pink-200 via-purple-200 to-blue-200"
      : "from-emerald-100 via-teal-100 to-sky-100";

  return (
    <div className="fixed inset-0 z-[100] pointer-events-none flex items-center justify-center overflow-hidden">
      {/* Confetti */}
      <div className="absolute inset-0">
        {confetti.map((piece) => (
          <div
            key={piece.id}
            className="absolute top-0"
            style={{
              left: `${piece.left}%`,
              width: `${piece.size}px`,
              height: `${piece.size}px`,
              backgroundColor: piece.color,
              borderRadius: piece.id % 2 === 0 ? "50%" : "2px",
              animation: `confetti-fall ${piece.duration}s ease-in ${piece.delay}s forwards`,
              transform: `rotate(${piece.rotation}deg)`,
            }}
          />
        ))}
      </div>

      {/* Message Card */}
      <div
        className={`relative bg-gradient-to-br ${bgGradient} rounded-2xl shadow-2xl px-8 py-6 animate-[celebration-pop_0.4s_ease-out] border-2 border-white/50`}
        dir="rtl"
      >
        <p className="text-2xl font-bold text-slate-800 text-center whitespace-nowrap">
          {celebration.message}
        </p>
      </div>

      <style jsx>{`
        @keyframes confetti-fall {
          0% {
            transform: translateY(-100vh) rotate(0deg);
            opacity: 1;
          }
          100% {
            transform: translateY(110vh) rotate(720deg);
            opacity: 0.8;
          }
        }
        @keyframes celebration-pop {
          0% {
            transform: scale(0.5);
            opacity: 0;
          }
          60% {
            transform: scale(1.1);
            opacity: 1;
          }
          100% {
            transform: scale(1);
            opacity: 1;
          }
        }
      `}</style>
    </div>
  );
}
