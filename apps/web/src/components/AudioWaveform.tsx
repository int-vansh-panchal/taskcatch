import React, { useEffect, useRef } from "react";

interface AudioWaveformProps {
  volume: number;
  frequencyData?: Uint8Array;
  isRecording: boolean;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({
  volume,
  frequencyData,
  isRecording,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    ctx.clearRect(0, 0, width, height);

    const barCount = 28;
    const barWidth = Math.floor(width / barCount) - 3;

    for (let i = 0; i < barCount; i++) {
      let barHeight = 6;
      if (isRecording && frequencyData && frequencyData.length > 0) {
        const freqIndex = Math.floor((i / barCount) * frequencyData.length);
        const val = frequencyData[freqIndex] / 255.0;
        barHeight = Math.max(6, val * height * 0.9);
      } else if (isRecording) {
        barHeight = Math.max(6, volume * height * (0.4 + Math.sin(i * 0.5) * 0.4));
      }

      const x = i * (barWidth + 3);
      const y = (height - barHeight) / 2;

      // Gradient color from indigo to emerald
      const grad = ctx.createLinearGradient(0, y, 0, y + barHeight);
      grad.addColorStop(0, "#818cf8");
      grad.addColorStop(1, "#4f46e5");

      ctx.fillStyle = isRecording ? grad : "#cbd5e1";
      ctx.beginPath();
      ctx.roundRect(x, y, barWidth, barHeight, 4);
      ctx.fill();
    }
  }, [volume, frequencyData, isRecording]);

  return (
    <div className="w-full flex items-center justify-center p-2">
      <canvas
        ref={canvasRef}
        width={320}
        height={60}
        className="w-full max-w-sm h-16 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
      />
    </div>
  );
};
