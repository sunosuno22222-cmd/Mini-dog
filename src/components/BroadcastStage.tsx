import React, { useEffect, useMemo, useState } from "react";
import { Check, Crown, Mic, Sparkles, Trophy } from "lucide-react";
import type { LiveBroadcastState } from "@/hooks/useBroadcastSocket";

interface BroadcastStageProps {
  state: LiveBroadcastState;
  fullscreenLayout?: boolean;
}

function AvatarFrame({
  src,
  name,
  sizeClass = "w-14 h-14",
  highlight = false,
}: {
  src: string | null;
  name: string;
  sizeClass?: string;
  highlight?: boolean;
}) {
  const [imgError, setImgError] = useState(false);
  const initial = (name || "?").trim().charAt(0).toUpperCase();

  return (
    <div
      className={`${sizeClass} rounded-lg overflow-hidden shrink-0 flex items-center justify-center bg-[#18181f] border transition-all duration-300 ${
        highlight
          ? "border-red-600 shadow-[0_0_24px_rgba(220,38,38,0.35)]"
          : "border-white/15"
      }`}
    >
      {src && !imgError ? (
        <img
          src={src}
          alt={name}
          onError={() => setImgError(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <span className="font-display font-bold text-slate-200 text-lg">{initial}</span>
      )}
    </div>
  );
}

function VoiceEqualizer({ active }: { active: boolean }) {
  const bars = [0.45, 0.9, 0.65, 1, 0.72, 0.85, 0.5];
  return (
    <div className="flex items-end gap-[3px] h-5" aria-hidden="true">
      {bars.map((scale, i) => (
        <span
          key={i}
          className={`w-[3px] rounded-xs bg-red-600 transition-all ${
            active ? "tx-eq-bar" : "opacity-30 h-[4px]"
          }`}
          style={{
            height: active ? `${Math.round(scale * 18)}px` : "4px",
            animationDelay: `${i * 0.09}s`,
          }}
        />
      ))}
    </div>
  );
}

export const BroadcastStage: React.FC<BroadcastStageProps> = ({
  state,
  fullscreenLayout = false,
}) => {
  // Progressive reveal animation for Scene 6 (synced to clipId start, never switches scenes via timer)
  const [typedLength, setTypedLength] = useState(0);
  const revealClipId = state.reveal?.clipId || "";
  const revealAnswer = state.reveal?.answer || "";

  useEffect(() => {
    if (state.scene !== 6 || !revealAnswer) {
      setTypedLength(0);
      return;
    }
    setTypedLength(0);
    const totalLen = revealAnswer.length;
    // Fast smooth character reveal (~18-24ms per step depending on answer length)
    const stepMs = totalLen > 140 ? 14 : 22;
    const timer = setInterval(() => {
      setTypedLength((prev) => {
        if (prev >= totalLen) {
          clearInterval(timer);
          return totalLen;
        }
        return prev + 1;
      });
    }, stepMs);
    return () => clearInterval(timer);
  }, [state.scene, revealClipId, revealAnswer]);

  // Subtle clock / round countdown ticker synced to real round deadline
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    if (!state.question?.deadlineAt) return;
    const iv = setInterval(() => setNowTick(Date.now()), 500);
    return () => clearInterval(iv);
  }, [state.question?.deadlineAt]);

  const remainingSeconds = useMemo(() => {
    if (!state.question?.deadlineAt) return null;
    const diff = Math.max(0, Math.ceil((state.question.deadlineAt - nowTick) / 1000));
    return diff;
  }, [state.question?.deadlineAt, nowTick]);

  // Transition key ensures clean entrance animation whenever scene, reveal clip, or speech clip changes
  const transitionKey = `${state.scene}:${state.reveal?.clipId || ""}:${state.botSpeech?.clipId || ""}:${state.question?.number || ""}`;

  const sortedLeaderboard = useMemo(
    () => [...state.leaderboard].sort((a, b) => a.rank - b.rank),
    [state.leaderboard]
  );

  const stageContent = (
    <div className="relative w-full aspect-video bg-[#050507] text-slate-100 overflow-hidden select-none border border-white/10 shadow-2xl">
      <style>{`
        @keyframes txSceneIn {
          0% { opacity: 0; transform: translateY(10px) scale(0.985); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        @keyframes txSweep {
          0% { transform: translateX(-110%); opacity: 0; }
          35% { opacity: 0.45; }
          100% { transform: translateX(140%); opacity: 0; }
        }
        @keyframes txEq {
          0%, 100% { transform: scaleY(0.35); }
          50% { transform: scaleY(1); }
        }
        @keyframes txBreathe {
          0%, 100% { opacity: 0.28; transform: scale(0.98); }
          50% { opacity: 0.55; transform: scale(1.02); }
        }
        @keyframes txCheckPop {
          0% { transform: scale(0.4); opacity: 0; }
          65% { transform: scale(1.18); opacity: 1; }
          100% { transform: scale(1); opacity: 1; }
        }
        @keyframes txCursorBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
        .tx-scene-enter {
          animation: txSceneIn 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tx-sweep {
          animation: txSweep 1.3s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tx-eq-bar {
          transform-origin: bottom;
          animation: txEq 0.72s ease-in-out infinite;
        }
        .tx-breathe {
          animation: txBreathe 4.2s ease-in-out infinite;
        }
        .tx-check-pop {
          animation: txCheckPop 380ms cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        .tx-cursor {
          animation: txCursorBlink 0.9s steps(1) infinite;
        }
      `}</style>

      {/* Studio Backdrop Layers (Black / Dark Gray / Deep Crimson Accent) */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 75% 55% at 50% 10%, rgba(127, 29, 29, 0.24) 0%, transparent 65%), radial-gradient(ellipse 65% 50% at 50% 100%, rgba(153, 27, 27, 0.14) 0%, transparent 60%)",
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #ffffff 1px, transparent 1px), linear-gradient(to bottom, #ffffff 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* Top Crimson Broadcast Hairline */}
      <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-red-950 via-red-600 to-red-950 z-20" />

      {/* Sweep Effect on Scene Transition */}
      <div
        key={`sweep:${transitionKey}`}
        className="tx-sweep pointer-events-none absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-red-600/10 to-transparent z-10"
      />

      {/* Minimal Top Broadcast Header Frame (No Technical IDs) */}
      <div className="absolute top-0 inset-x-0 z-20 px-[4%] pt-[2.4%] flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-5 w-[3px] bg-red-600" />
          <span className="font-display font-bold tracking-[0.22em] text-[clamp(10px,1.15vw,14px)] text-slate-200 uppercase">
            JOGO DA CALL
          </span>
          {state.guildName && (
            <span className="hidden sm:inline text-[clamp(10px,1vw,13px)] text-slate-400 font-medium border-l border-white/15 pl-3">
              {state.guildName}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {state.question && (state.scene === 4 || state.scene === 5 || state.scene === 6) && (
            <div className="flex items-center gap-2 bg-[#121218]/90 border border-white/10 px-3 py-1 rounded-[4px]">
              <span className="font-mono tabular-nums text-[clamp(10px,1vw,13px)] text-slate-300 font-semibold">
                PERGUNTA {String(state.question.number).padStart(2, "0")}/
                {String(state.question.total).padStart(2, "0")}
              </span>
              {remainingSeconds !== null && state.scene !== 6 && (
                <span className="font-mono tabular-nums text-[clamp(10px,1vw,13px)] text-red-400 font-bold border-l border-white/15 pl-2">
                  {remainingSeconds}s
                </span>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 bg-[#111116]/90 border border-red-900/50 px-2.5 py-1 rounded-[4px]">
            <span className="h-2 w-2 rounded-[2px] bg-red-600" />
            <span className="font-mono text-[clamp(9px,0.9vw,12px)] tracking-[0.18em] text-slate-200 font-semibold uppercase">
              {state.testMode ? `PRÉVIA · ${state.sceneLabel}` : state.sceneLabel}
            </span>
          </div>
        </div>
      </div>

      {/* Main 16:9 Stage Content Area */}
      <div
        key={transitionKey}
        className="tx-scene-enter relative z-10 w-full h-full flex flex-col items-center justify-center px-[7%] py-[8%]"
      >
        {/* ================= CENA 1: AGUARDANDO ================= */}
        {state.scene === 1 && (
          <div className="flex flex-col items-center justify-center text-center max-w-3xl">
            <div className="relative flex items-center justify-center mb-6">
              <div className="tx-breathe absolute w-28 h-28 rounded-full border border-red-800/40" />
              <div className="w-16 h-16 rounded-lg bg-[#111117] border border-red-900/60 flex items-center justify-center shadow-lg">
                <Mic className="w-7 h-7 text-red-500" />
              </div>
            </div>

            <h2 className="font-display font-extrabold tracking-[0.16em] text-[clamp(20px,3vw,42px)] text-white uppercase leading-tight">
              AGUARDANDO INÍCIO DA PARTIDA
            </h2>

            <div className="mt-4 w-24 h-[2px] bg-gradient-to-r from-transparent via-red-600 to-transparent" />

            {state.participants.length > 0 && (
              <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
                {state.participants.map((p) => (
                  <div
                    key={p.userId}
                    className="flex items-center gap-2 bg-[#121218] border border-white/10 px-3 py-1.5 rounded-md"
                  >
                    <AvatarFrame src={p.avatar} name={p.username} sizeClass="w-6 h-6" />
                    <span className="text-[clamp(11px,1.05vw,14px)] font-medium text-slate-200">
                      {p.username}
                    </span>
                    <Check className="w-3.5 h-3.5 text-red-500" />
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================= CENA 2: ABERTURA ================= */}
        {state.scene === 2 && (
          <div className="flex flex-col items-center justify-center text-center w-full max-w-4xl">
            <div className="border border-red-800/70 bg-red-950/35 px-4 py-1 rounded-[4px] mb-5">
              <span className="font-mono text-[clamp(10px,1vw,13px)] tracking-[0.28em] text-red-400 uppercase font-semibold">
                TRANSMISSÃO AO VIVO
              </span>
            </div>

            <h2 className="font-display font-extrabold tracking-[0.08em] text-[clamp(24px,3.8vw,54px)] text-white uppercase leading-none">
              UMA NOVA PARTIDA COMEÇOU
            </h2>

            <div className="mt-5 w-48 h-[3px] bg-gradient-to-r from-transparent via-red-600 to-transparent" />

            {state.participants.length > 0 && (
              <div className="mt-8 w-full max-w-2xl">
                <p className="font-mono text-[clamp(10px,0.95vw,12px)] tracking-[0.22em] text-slate-400 uppercase mb-3">
                  PARTICIPANTES NA ARENA ({state.participants.length})
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  {state.participants.map((p, idx) => (
                    <div
                      key={p.userId}
                      className="flex items-center gap-2.5 bg-[#121217] border border-white/12 px-3.5 py-2 rounded-lg"
                      style={{
                        animation: `txSceneIn 450ms cubic-bezier(0.22,1,0.36,1) ${idx * 70}ms both`,
                      }}
                    >
                      <AvatarFrame src={p.avatar} name={p.username} sizeClass="w-8 h-8" highlight />
                      <span className="font-display font-semibold text-[clamp(12px,1.15vw,16px)] text-white">
                        {p.username}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================= CENA 3: FALA DO BOT ================= */}
        {state.scene === 3 && (
          <div className="w-full max-w-4xl flex flex-col items-center text-center">
            <div className="flex items-center gap-3 mb-5 bg-[#131319] border border-red-900/60 px-4 py-2 rounded-md">
              <VoiceEqualizer active={state.botSpeaking} />
              <span className="font-mono text-[clamp(10px,1vw,13px)] tracking-[0.22em] text-red-400 uppercase font-semibold">
                {state.botSpeaking ? "APRESENTADOR FALANDO" : "COMUNICADO"}
              </span>
            </div>

            <div className="w-full bg-[#101015]/95 border border-white/10 border-l-4 border-l-red-600 rounded-lg px-[5%] py-[4.5%] shadow-2xl">
              <p className="font-display font-bold tracking-[0.03em] text-[clamp(18px,2.5vw,38px)] text-white uppercase leading-snug whitespace-pre-line">
                {state.botSpeech?.text || "ATENÇÃO PARTICIPANTES"}
              </p>
            </div>
          </div>
        )}

        {/* ================= CENA 4: PERGUNTAS ================= */}
        {state.scene === 4 && (
          <div className="w-full max-w-4xl flex flex-col items-center text-center">
            <div className="flex items-center gap-3 mb-5">
              <span className="h-[2px] w-10 bg-red-600" />
              <span className="font-mono tabular-nums tracking-[0.26em] text-[clamp(12px,1.25vw,16px)] text-red-400 font-bold uppercase">
                PERGUNTA {String(state.question?.number || 1).padStart(2, "0")}
              </span>
              <span className="h-[2px] w-10 bg-red-600" />
            </div>

            <div className="w-full bg-[#111116]/95 border border-white/12 rounded-xl px-[6%] py-[5%] shadow-2xl relative">
              <div className="absolute top-0 left-8 right-8 h-[1px] bg-gradient-to-r from-transparent via-red-600/70 to-transparent" />
              <p className="font-display font-bold text-[clamp(18px,2.5vw,36px)] text-white leading-snug">
                “{state.question?.text || "Aguardando pergunta da rodada..."}”
              </p>
            </div>

            <div className="mt-5 flex items-center gap-3 text-slate-400">
              <VoiceEqualizer active={state.botSpeaking} />
              <span className="text-[clamp(11px,1.05vw,14px)] font-medium tracking-wide">
                Responda no seu canal privado no Discord
              </span>
            </div>
          </div>
        )}

        {/* ================= CENA 5: RESPOSTAS RECEBIDAS ================= */}
        {state.scene === 5 && (
          <div className="w-full max-w-4xl flex flex-col">
            {state.question && (
              <div className="mb-4 pb-3 border-b border-white/10 flex items-center justify-between gap-4">
                <p className="font-display font-semibold text-[clamp(13px,1.35vw,19px)] text-slate-200 truncate">
                  <span className="font-mono text-red-400 mr-2">
                    P{String(state.question.number).padStart(2, "0")}
                  </span>
                  {state.question.text}
                </p>
                <span className="font-mono tabular-nums text-[clamp(11px,1vw,14px)] text-slate-300 bg-[#15151c] border border-white/10 px-2.5 py-1 rounded-[4px] shrink-0">
                  {state.participants.filter((p) => p.answered).length}/
                  {state.participants.length} RESPONDERAM
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {state.participants.map((p) => {
                const isJustAnswered = p.answered && state.lastAnsweredUserId === p.userId;
                return (
                  <div
                    key={p.userId}
                    className={`flex items-center justify-between gap-3 px-4 py-3 rounded-lg border transition-all duration-300 ${
                      p.answered
                        ? "bg-[#151215] border-red-800/70 shadow-[0_0_20px_rgba(153,27,27,0.18)]"
                        : "bg-[#101015] border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <AvatarFrame
                        src={p.avatar}
                        name={p.username}
                        sizeClass="w-10 h-10"
                        highlight={p.answered}
                      />
                      <div className="min-w-0">
                        <div className="font-display font-semibold text-[clamp(13px,1.25vw,17px)] text-white truncate">
                          {p.username}
                        </div>
                        <div className="text-[clamp(10px,0.9vw,12px)] text-slate-400">
                          {p.answered ? "Resposta registrada em sigilo" : "Digitando no privado..."}
                        </div>
                      </div>
                    </div>

                    <div className="shrink-0">
                      {p.answered ? (
                        <div
                          key={`chk:${p.userId}:${isJustAnswered ? "new" : "ok"}`}
                          className="tx-check-pop w-8 h-8 rounded-md bg-red-600/20 border border-red-600/70 flex items-center justify-center text-red-400"
                        >
                          <Check className="w-4 h-4 stroke-[3]" />
                        </div>
                      ) : (
                        <span className="font-mono text-slate-500 text-base tracking-widest px-2">
                          ...
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= CENA 6: REVELAÇÃO DAS RESPOSTAS ================= */}
        {state.scene === 6 && state.reveal && (
          <div className="w-full max-w-4xl flex flex-col items-center text-center">
            <div className="flex items-center gap-3 mb-4">
              <span className="font-mono tabular-nums tracking-[0.22em] text-[clamp(11px,1.15vw,15px)] text-red-400 font-bold uppercase">
                PERGUNTA {String(state.reveal.questionNumber).padStart(2, "0")} — RESPOSTA
              </span>
              <VoiceEqualizer active={state.botSpeaking} />
            </div>

            <div className="flex flex-col items-center gap-3 mb-5">
              <AvatarFrame
                src={state.reveal.avatar}
                name={state.reveal.username}
                sizeClass="w-16 h-16 sm:w-20 sm:h-20"
                highlight
              />
              <h3 className="font-display font-extrabold tracking-[0.1em] text-[clamp(16px,1.8vw,26px)] text-white uppercase">
                {state.reveal.username}
              </h3>
            </div>

            <div className="w-full bg-[#101016] border border-red-900/50 border-t-2 border-t-red-600 rounded-xl px-[5%] py-[4%] shadow-2xl min-h-[110px] flex items-center justify-center">
              <p
                className={`font-display font-medium text-[clamp(16px,2.05vw,30px)] leading-relaxed ${
                  state.reveal.didAnswer ? "text-slate-100" : "text-slate-400 italic"
                }`}
              >
                “{state.reveal.answer.slice(0, typedLength)}
                {typedLength < state.reveal.answer.length && (
                  <span className="tx-cursor inline-block w-[2px] h-[1em] bg-red-500 align-middle ml-0.5" />
                )}
                {typedLength >= state.reveal.answer.length ? "”" : ""}
              </p>
            </div>
          </div>
        )}

        {/* ================= CENA 7: CLASSIFICAÇÃO ================= */}
        {state.scene === 7 && (
          <div className="w-full max-w-3xl flex flex-col">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/10">
              <div className="flex items-center gap-2.5">
                <Trophy className="w-5 h-5 text-red-500" />
                <h2 className="font-display font-extrabold tracking-[0.14em] text-[clamp(16px,1.9vw,26px)] text-white uppercase">
                  CLASSIFICAÇÃO GERAL
                </h2>
              </div>
              <span className="font-mono text-[clamp(10px,0.95vw,13px)] text-slate-400 uppercase">
                PONTUAÇÃO ACUMULADA
              </span>
            </div>

            <div className="space-y-2.5">
              {sortedLeaderboard.slice(0, 6).map((entry, idx) => {
                const topPoints = Math.max(1, sortedLeaderboard[0]?.totalPoints || 1);
                const pct = Math.min(100, Math.round((entry.totalPoints / topPoints) * 100));
                const isFirst = idx === 0;
                return (
                  <div
                    key={entry.userId}
                    className={`relative overflow-hidden rounded-lg border px-4 py-2.5 flex items-center justify-between gap-4 ${
                      isFirst
                        ? "bg-[#171114] border-red-700/75"
                        : "bg-[#101015] border-white/10"
                    }`}
                    style={{
                      animation: `txSceneIn 420ms cubic-bezier(0.22,1,0.36,1) ${idx * 80}ms both`,
                    }}
                  >
                    <div
                      className="absolute inset-y-0 left-0 bg-red-900/15 transition-all duration-700 pointer-events-none"
                      style={{ width: `${pct}%` }}
                    />
                    <div className="relative flex items-center gap-3 min-w-0">
                      <span
                        className={`font-mono tabular-nums font-bold text-[clamp(14px,1.4vw,20px)] w-8 ${
                          isFirst ? "text-red-400" : "text-slate-400"
                        }`}
                      >
                        {entry.rank}º
                      </span>
                      <AvatarFrame
                        src={entry.avatar}
                        name={entry.username}
                        sizeClass="w-9 h-9"
                        highlight={isFirst}
                      />
                      <span className="font-display font-bold text-[clamp(13px,1.35vw,18px)] text-white truncate">
                        {entry.username}
                      </span>
                    </div>

                    <div className="relative flex items-center gap-3 shrink-0">
                      {entry.lastRoundPoints > 0 && (
                        <span className="font-mono tabular-nums text-[clamp(10px,0.9vw,12px)] text-emerald-400">
                          +{entry.lastRoundPoints}
                        </span>
                      )}
                      <span className="font-mono tabular-nums font-extrabold text-[clamp(14px,1.45vw,20px)] text-white">
                        {entry.totalPoints} <span className="text-xs text-slate-400 font-normal">PTS</span>
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ================= CENA 8: VENCEDOR ================= */}
        {state.scene === 8 && state.winner && (
          <div className="w-full max-w-4xl flex flex-col items-center text-center">
            <div className="flex items-center gap-2 bg-red-950/50 border border-red-700/70 px-3.5 py-1 rounded-[4px] mb-4">
              {state.winner.mode === "final" ? (
                <Crown className="w-4 h-4 text-red-400" />
              ) : (
                <Sparkles className="w-4 h-4 text-red-400" />
              )}
              <span className="font-mono tracking-[0.22em] text-[clamp(10px,1vw,13px)] text-red-300 font-bold uppercase">
                {state.winner.mode === "final"
                  ? "VENCEDOR DA PARTIDA"
                  : `MELHOR RESPOSTA · PERGUNTA ${String(state.winner.roundNumber || 1).padStart(2, "0")}`}
              </span>
            </div>

            <div className="flex items-center gap-4 mb-4">
              <AvatarFrame
                src={state.winner.avatar}
                name={state.winner.username}
                sizeClass="w-16 h-16 sm:w-20 sm:h-20"
                highlight
              />
              <div className="text-left">
                <h2 className="font-display font-extrabold text-[clamp(22px,2.8vw,40px)] text-white uppercase leading-none">
                  {state.winner.username}
                </h2>
                <p className="font-mono tabular-nums text-[clamp(12px,1.2vw,16px)] text-red-400 font-bold mt-1.5">
                  {state.winner.totalPoints} PONTOS ACUMULADOS
                </p>
              </div>
            </div>

            {state.winner.winningAnswer && (
              <div className="w-full bg-[#111117] border border-white/12 rounded-lg px-[4%] py-[2.5%] mb-3">
                <p className="font-display text-[clamp(13px,1.45vw,21px)] text-slate-100 leading-snug">
                  “{state.winner.winningAnswer}”
                </p>
              </div>
            )}

            {state.winner.explanation && (
              <div className="w-full bg-[#150e10] border border-red-900/50 rounded-lg px-[4%] py-[2%] flex items-center justify-center gap-3">
                <VoiceEqualizer active={state.botSpeaking} />
                <p className="text-[clamp(12px,1.15vw,16px)] text-slate-200 font-medium">
                  {state.winner.explanation}
                </p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom Broadcast Status Line */}
      <div className="absolute bottom-0 inset-x-0 z-20 px-[4%] pb-[2%] flex items-center justify-between text-[clamp(9px,0.85vw,11px)] font-mono text-slate-500">
        <span>
          {state.voiceChannelName ? `CALL: ${state.voiceChannelName}` : "TRANSMISSÃO VISUAL SINCRONIZADA"}
        </span>
        <span className="tabular-nums">{state.resolution}</span>
      </div>
      <div className="absolute bottom-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-red-900/80 to-transparent z-20" />
    </div>
  );

  if (fullscreenLayout) {
    return (
      <div className="w-screen h-screen bg-[#040406] flex items-center justify-center p-0 overflow-hidden">
        <div className="w-full max-w-[177.78vh] max-h-screen flex items-center justify-center">
          {stageContent}
        </div>
      </div>
    );
  }

  return stageContent;
};
