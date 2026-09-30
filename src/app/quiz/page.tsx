"use client";

import { useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { useLang } from "@/lib/i18n/context";

type Category = "Privacy" | "Security" | "Exposure" | "Awareness";

type Question = {
  id: number;
  category: Category;
  points: number[];
};

const QUESTIONS: Question[] = [
  { id: 1, category: "Exposure", points: [0, 6, 12] },
  { id: 2, category: "Exposure", points: [0, 6, 12] },
  { id: 3, category: "Exposure", points: [0, 6, 12] },
  { id: 4, category: "Awareness", points: [0, 6, 12] },
  { id: 5, category: "Security", points: [0, 6, 12] },
  { id: 6, category: "Privacy", points: [0, 6, 12] },
  { id: 7, category: "Awareness", points: [0, 6, 12] },
  { id: 8, category: "Security", points: [0, 6, 12] },
  { id: 9, category: "Exposure", points: [0, 6, 12] },
  { id: 10, category: "Privacy", points: [0, 6, 12] },
];

const CATEGORIES: Category[] = ["Privacy", "Security", "Exposure", "Awareness"];

const CATEGORY_KEYS: Record<Category, string> = {
  Privacy: "privacy",
  Security: "security",
  Exposure: "exposure",
  Awareness: "awareness",
};

export default function QuizPage() {
  const { t } = useLang();
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
  const [categoryScores, setCategoryScores] = useState<Record<Category, number>>({
    Privacy: 0,
    Security: 0,
    Exposure: 0,
    Awareness: 0,
  });
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [selectedOptIndex, setSelectedOptIndex] = useState<number | null>(null);

  const currentQuestion = QUESTIONS[currentIndex];
  const progress = Math.round((currentIndex / QUESTIONS.length) * 100);
  const questions = t.quiz.questions as string[];
  const options = t.quiz.options as string[][];
  const tips = (t.quiz as Record<string, unknown>).tips as string[][] | undefined;

  function getRiskLabel(finalScore: number) {
    if (finalScore >= 80) return { label: t.quiz.lowExposure, color: "text-teal-500", emoji: "\ud83d\udee1\ufe0f" };
    if (finalScore >= 50) return { label: t.quiz.mediumExposure, color: "text-yellow-500", emoji: "\u26a0\ufe0f" };
    return { label: t.quiz.highExposure, color: "text-red-500", emoji: "\ud83d\udea8" };
  }

  async function finishQuiz(finalAnswers: Record<number, number>) {
    const totalPoints = Object.values(finalAnswers).reduce((sum, p) => sum + p, 0);
    const maxPoints = QUESTIONS.length * 12;
    const finalScore = Math.round((totalPoints / maxPoints) * 100);

    const catTotals: Record<Category, { earned: number; max: number }> = {
      Privacy: { earned: 0, max: 0 },
      Security: { earned: 0, max: 0 },
      Exposure: { earned: 0, max: 0 },
      Awareness: { earned: 0, max: 0 },
    };

    QUESTIONS.forEach((q) => {
      catTotals[q.category].max += 12;
      catTotals[q.category].earned += finalAnswers[q.id] ?? 0;
    });

    const catScores = CATEGORIES.reduce((acc, cat) => {
      const { earned, max } = catTotals[cat];
      acc[cat] = max > 0 ? Math.round((earned / max) * 100) : 0;
      return acc;
    }, {} as Record<Category, number>);

    setScore(finalScore);
    setCategoryScores(catScores);
    setSubmitted(true);
    setSaving(true);
    setSaveError(null);

    const { error } = await supabase.from("quiz_results").insert([
      { score: finalScore, answers: finalAnswers },
    ]);

    setSaving(false);
    if (error) setSaveError(error.message);
  }

  function selectAnswer(optIndex: number) {
    const points = QUESTIONS[currentIndex].points[optIndex];
    const updatedAnswers = { ...answers, [currentQuestion.id]: points };
    setAnswers(updatedAnswers);
    setSelectedOptIndex(optIndex);
  }

  function advanceToNext() {
    if (currentIndex < QUESTIONS.length - 1) {
      setSelectedOptIndex(null);
      setCurrentIndex((i) => i + 1);
    } else {
      const updatedAnswers = { ...answers };
      finishQuiz(updatedAnswers);
    }
  }

  function handleRetake() {
    setAnswers({});
    setCurrentIndex(0);
    setSubmitted(false);
    setScore(0);
    setSaveError(null);
    setSelectedOptIndex(null);
  }

  if (submitted) {
    const risk = getRiskLabel(score);
    return (
      <div className="mx-auto max-w-2xl px-6 py-24">
        <div className="text-center">
          <p className="text-sm font-medium text-teal-500">{t.quiz.title}</p>
          <div className="mt-3 text-6xl">{risk.emoji}</div>
          <h1 className="mt-3 text-4xl font-bold text-zinc-900 dark:text-zinc-50">
            {t.quiz.yourScore} {score}/100
          </h1>
          <p className={`mt-4 text-2xl font-semibold ${risk.color}`}>{risk.label}</p>
          <p className="mx-auto mt-6 max-w-md text-zinc-600 dark:text-zinc-400">
            {score >= 80 && t.quiz.feedbackHigh}
            {score >= 50 && score < 80 && t.quiz.feedbackMedium}
            {score < 50 && t.quiz.feedbackLow}
          </p>
        </div>

        <div className="mt-10 space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-950">
          <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">{t.quiz.breakdown}</p>
          {CATEGORIES.map((cat) => (
            <div key={cat}>
              <div className="mb-1 flex justify-between text-sm">
                <span className="text-zinc-600 dark:text-zinc-400">{t.quiz[CATEGORY_KEYS[cat]]}</span>
                <span className="font-medium text-zinc-900 dark:text-zinc-50">{categoryScores[cat]}%</span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-700"
                  style={{ width: `${categoryScores[cat]}%` }}
                />
              </div>
            </div>
          ))}
        </div>

        <div className="mt-6 text-center">
          {saving && <p className="text-sm text-zinc-500">{t.quiz.saving}</p>}
          {saveError && (
            <p className="text-sm text-red-500">{t.quiz.saveError} {saveError}</p>
          )}
        </div>

        <div className="mt-10 flex justify-center gap-4">
          <button
            onClick={handleRetake}
            className="rounded-full border border-zinc-300 px-6 py-2.5 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-800"
          >
            {t.quiz.retake}
          </button>
          <Link
            href="/"
            className="rounded-full bg-teal-600 px-6 py-2.5 text-sm font-semibold text-white hover:bg-teal-500"
          >
            {t.quiz.backHome}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl px-6 py-16">
      <div className="mb-8">
        <div className="mb-2 flex justify-between text-sm text-zinc-500">
          <span>
            {t.quiz.question} {currentIndex + 1} {t.quiz.of} {QUESTIONS.length}
          </span>
          <span>{progress}%</span>
        </div>
        <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100 dark:bg-zinc-800">
          <div
            className="h-full rounded-full bg-gradient-to-r from-teal-500 to-cyan-400 transition-all duration-500"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <span className="inline-flex items-center rounded-full border border-teal-200 bg-teal-50 px-3 py-1 text-xs font-medium text-teal-800 dark:border-teal-800 dark:bg-teal-950/50 dark:text-teal-300">
        {t.quiz[CATEGORY_KEYS[currentQuestion.category]]}
      </span>

      <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-zinc-50">
        {questions[currentIndex]}
      </h1>

      <div className="mt-6 space-y-3">
        {options[currentIndex]?.map((opt, optIndex) => (
          <button
            key={optIndex}
            onClick={() => selectAnswer(optIndex)}
            disabled={selectedOptIndex !== null}
            className={`w-full rounded-xl border p-4 text-left text-sm font-medium transition ${
              selectedOptIndex === optIndex
                ? "border-teal-500 bg-teal-50 dark:bg-teal-950/40"
                : selectedOptIndex !== null
                  ? "border-zinc-200 opacity-50 dark:border-zinc-800"
                  : "border-zinc-200 hover:border-teal-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-teal-700 dark:hover:bg-zinc-900"
            }`}
          >
            {opt}
          </button>
        ))}
      </div>

      {/* Tip callout — shown after selecting an answer */}
      {selectedOptIndex !== null && tips && (
        <div className="mt-5">
          {(() => {
            const pts = currentQuestion.points[selectedOptIndex];
            const isSafe = pts >= 12;
            const tipText = tips[currentIndex]?.[selectedOptIndex];
            if (!tipText) return null;
            return (
              <div
                className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 dark:border-red-800 dark:bg-red-950/20"
              >
                <p className="text-xs font-semibold text-red-700 dark:text-red-300">
                  {isSafe ? "\u2705" : "\u26a0\ufe0f"} {t.quiz.tipHeading}
                </p>
                <p className="mt-1 text-sm leading-relaxed text-red-600 dark:text-red-400">
                  {tipText}
                </p>
              </div>
            );
          })()}

          <button
            onClick={advanceToNext}
            className="mt-4 w-full rounded-full bg-teal-500 px-6 py-3 text-sm font-bold text-black transition hover:bg-teal-400"
          >
            {currentIndex < QUESTIONS.length - 1 ? t.quiz.nextQuestion : t.quiz.seeResults}
          </button>
        </div>
      )}
    </div>
  );
}
